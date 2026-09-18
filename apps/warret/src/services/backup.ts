/**
 * BackupService — real backup and restore of the user's wallet data.
 *
 * Cloud: JSON snapshots stored in the `public.backups` table (RLS-protected,
 * newest 10 kept per user — see supabase/migrations/004_backups.sql).
 * File:  the same envelope written to a .json file and handed to the OS share
 * sheet (native) or downloaded (web). Saving to iCloud Drive / Google Drive /
 * Dropbox happens through the system share sheet — that is the honest
 * "provider" integration, no vendor SDKs involved.
 *
 * SECURITY: everything read back from a backup (cloud payload or picked file)
 * is untrusted input. It is validated structurally and rebuilt field-by-field
 * before anything touches AsyncStorage — never spread raw parsed JSON into
 * app state, never let prototype-polluting keys through.
 */
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { StorageService } from './storage';
import type { Product, ProductCategory, DocEntry } from '../data/products';

// expo-file-system is not supported on web — loaded lazily on native only
// (same pattern as src/services/fileStorage.ts).
async function getFS() {
  return import('expo-file-system/legacy');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackupEnvelope = {
  schema: 'warret.backup';
  version: 1;
  createdAt: string;
  platform: string;
  data: {
    products: Product[];
    productCategories: ProductCategory[];
    // The current user's scoped settings object (warret.settings.v2.<userId>).
    settings: Record<string, unknown> | null;
    // Groups are deliberately EXCLUDED: they are collaborative data whose
    // source of truth is Supabase (groups/group_members/group_products with
    // RLS). Restoring a stale local copy could desync membership, roles and
    // shared products for other people. Group data survives via the server.
  };
};

export type CloudBackupMeta = {
  id: string;
  createdAt: string;
  platform: string;
  sizeBytes: number;
};

export type RestoreSummary = {
  products: number;
  productCategories: number;
  settingsRestored: boolean;
};

type SnapshotSource = {
  products?: Product[];
  productCategories?: ProductCategory[];
};

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // reject anything above 10 MB
const MAX_PRODUCTS = 2000;
const MAX_CATEGORIES = 500;
const CLOUD_KEEP_COUNT = 10;

// ─── Validation helpers (untrusted input) ─────────────────────────────────────

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.slice(0, 4000) : fallback);
const safeId = (v: unknown): string => {
  const value = str(v, '').slice(0, 160);
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : '';
};

const strArray = (v: unknown, cap = 100): string[] =>
  Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string').slice(0, cap) : [];

const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/** Recursively strips prototype-polluting keys from parsed JSON. */
function stripDangerousKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(stripDangerousKeys);
    return value;
  }
  if (isPlainObject(value)) {
    for (const key of DANGEROUS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(value, key)) delete (value as Record<string, unknown>)[key];
    }
    Object.values(value).forEach(stripDangerousKeys);
  }
  return value;
}

function sanitizeDocEntry(raw: unknown): DocEntry | null {
  if (!isPlainObject(raw)) return null;
  const fileName = str(raw.fileName);
  if (!fileName) return null;
  return {
    label: str(raw.label),
    fileName,
    expiry: str(raw.expiry),
    // Backup files are untrusted JSON. Do not restore stored/signed URLs from
    // them; the app can recompute Supabase storage paths from user/product/file
    // on demand, and local file URIs are not portable across devices anyway.
    uri: undefined,
    mimeType: raw.mimeType === undefined ? undefined : str(raw.mimeType),
    docType: raw.docType === undefined ? undefined : str(raw.docType),
  };
}

const PRODUCT_STATUSES: Product['status'][] = ['Active', 'Expiring soon', 'Expired'];

/** Rebuilds a product field-by-field. Returns null when id/name are missing. */
function sanitizeProduct(raw: unknown): Product | null {
  if (!isPlainObject(raw)) return null;
  const id = safeId(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;

  const support = isPlainObject(raw.support) ? raw.support : {};
  const coverage = isPlainObject(raw.coverage) ? raw.coverage : {};
  const extended = isPlainObject(raw.extended) ? raw.extended : null;
  const status = PRODUCT_STATUSES.includes(raw.status as Product['status'])
    ? (raw.status as Product['status'])
    : 'Active';

  return {
    id,
    name,
    brand: str(raw.brand, 'Unknown brand'),
    status,
    expires: str(raw.expires),
    warrantyStart: str(raw.warrantyStart),
    warrantyEnd: str(raw.warrantyEnd),
    dateAdded: str(raw.dateAdded),
    type: str(raw.type, 'Warranty document'),
    category: raw.category === undefined ? undefined : str(raw.category),
    personal: typeof raw.personal === 'boolean' ? raw.personal : undefined,
    keywords: strArray(raw.keywords),
    reminders: strArray(raw.reminders, 30),
    serialNumber: raw.serialNumber === undefined ? undefined : str(raw.serialNumber),
    seller: raw.seller === undefined ? undefined : str(raw.seller),
    docs: strArray(raw.docs, 50),
    docEntries: Array.isArray(raw.docEntries)
      ? raw.docEntries.map(sanitizeDocEntry).filter((d): d is DocEntry => d !== null).slice(0, 50)
      : undefined,
    support: {
      site: str(support.site, 'Add support site'),
      phone: str(support.phone, 'Add support phone'),
      method: str(support.method, 'Add claim method'),
    },
    extended: extended
      ? { plan: str(extended.plan), provider: str(extended.provider), expires: str(extended.expires) }
      : undefined,
    coverage: {
      included: strArray(coverage.included),
      excluded: strArray(coverage.excluded),
    },
    steps: strArray(raw.steps),
    groupId: raw.groupId === undefined ? undefined : str(raw.groupId),
  };
}

function sanitizeCategory(raw: unknown): ProductCategory | null {
  if (!isPlainObject(raw)) return null;
  const id = safeId(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    productIds: strArray(raw.productIds, MAX_PRODUCTS),
    createdAt: str(raw.createdAt, new Date().toISOString()),
  };
}

/**
 * Validates an untrusted envelope (cloud payload or picked file) and returns
 * a sanitized copy. Throws a user-presentable Error when it is not a valid
 * Warret backup.
 */
export function validateEnvelope(raw: unknown, byteLength?: number): BackupEnvelope {
  if (byteLength !== undefined && byteLength > MAX_PAYLOAD_BYTES) {
    throw new Error('Backup is too large (over 10 MB).');
  }
  if (!isPlainObject(raw)) throw new Error('This file is not a Warret backup.');
  if (raw.schema !== 'warret.backup') throw new Error('This file is not a Warret backup.');
  if (raw.version !== 1) throw new Error('This backup was made with a newer version of Warret.');
  if (!isPlainObject(raw.data)) throw new Error('Backup data is missing or corrupted.');
  if (!Array.isArray(raw.data.products)) throw new Error('Backup data is missing or corrupted.');
  if (raw.data.products.length > MAX_PRODUCTS) throw new Error('Backup contains too many products.');

  const products = raw.data.products
    .map(sanitizeProduct)
    .filter((p): p is Product => p !== null);

  const productCategories = (Array.isArray(raw.data.productCategories) ? raw.data.productCategories : [])
    .slice(0, MAX_CATEGORIES)
    .map(sanitizeCategory)
    .filter((c): c is ProductCategory => c !== null);

  const settings = isPlainObject(raw.data.settings)
    ? stripDangerousKeys({ ...(raw.data.settings as Record<string, unknown>) })
    : null;

  return {
    schema: 'warret.backup',
    version: 1,
    createdAt: str(raw.createdAt, new Date().toISOString()),
    platform: str(raw.platform),
    data: { products, productCategories, settings },
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  if (!isSupabaseConfigured) throw new Error('Cloud backup needs Supabase to be configured.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Sign in to use cloud backup.');
  return data.user.id;
}

async function applyEnvelope(envelope: BackupEnvelope, settingsScopeId?: string): Promise<RestoreSummary> {
  await StorageService.saveProducts(envelope.data.products, settingsScopeId);
  await StorageService.saveProductCategories(envelope.data.productCategories, settingsScopeId);
  const settingsRestored = Boolean(envelope.data.settings && settingsScopeId);
  if (envelope.data.settings && settingsScopeId) {
    await StorageService.saveSettings(envelope.data.settings, settingsScopeId);
  }
  return {
    products: envelope.data.products.length,
    productCategories: envelope.data.productCategories.length,
    settingsRestored,
  };
}

function backupFileName(): string {
  const d = new Date();
  const iso = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
  return `warret-backup-${iso}.json`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const BackupService = {
  /**
   * Builds a backup envelope. Callers with live in-memory state (the settings
   * screen) should pass it in `current` — it reflects reality even when the
   * AsyncStorage product cache is stale. Falls back to AsyncStorage otherwise.
   */
  async createSnapshot(current?: SnapshotSource, settingsScopeId?: string): Promise<BackupEnvelope> {
    const [storedProducts, storedCategories, settings] = await Promise.all([
      current?.products ? Promise.resolve(null) : StorageService.loadProducts(settingsScopeId),
      current?.productCategories ? Promise.resolve(null) : StorageService.loadProductCategories(settingsScopeId),
      StorageService.loadSettings<Record<string, unknown>>(settingsScopeId),
    ]);
    return {
      schema: 'warret.backup',
      version: 1,
      createdAt: new Date().toISOString(),
      platform: Platform.OS,
      data: {
        products: current?.products ?? storedProducts ?? [],
        productCategories: current?.productCategories ?? storedCategories ?? [],
        settings: settings ?? null,
      },
    };
  },

  /** Uploads a snapshot to public.backups and prunes to the newest 10 rows. */
  async backupToCloud(current?: SnapshotSource, settingsScopeId?: string): Promise<CloudBackupMeta> {
    const userId = await requireUserId();
    const envelope = await this.createSnapshot(current, settingsScopeId);
    const sizeBytes = JSON.stringify(envelope).length;
    if (sizeBytes > MAX_PAYLOAD_BYTES) throw new Error('Backup is too large to upload (over 10 MB).');

    const { data, error } = await supabase
      .from('backups')
      .insert({ user_id: userId, payload: envelope, size_bytes: sizeBytes, platform: Platform.OS })
      .select('id, created_at')
      .single();
    if (error || !data) throw new Error(error?.message || 'Could not upload the backup.');

    // Prune: keep the newest CLOUD_KEEP_COUNT rows for this user. Client-side
    // delete is fine here because RLS restricts it to the user's own rows.
    const { data: rows } = await supabase
      .from('backups')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    const stale = (rows || []).slice(CLOUD_KEEP_COUNT).map((row) => row.id);
    if (stale.length > 0) {
      await supabase.from('backups').delete().in('id', stale);
    }

    return { id: data.id, createdAt: data.created_at, platform: Platform.OS, sizeBytes };
  },

  async listCloudBackups(): Promise<CloudBackupMeta[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('backups')
      .select('id, created_at, platform, size_bytes')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(CLOUD_KEEP_COUNT);
    if (error) throw new Error(error.message || 'Could not load cloud backups.');
    return (data || []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      platform: row.platform || '',
      sizeBytes: row.size_bytes || 0,
    }));
  },

  /** Downloads, validates and applies a cloud backup. */
  async restoreFromCloud(id: string, settingsScopeId?: string): Promise<RestoreSummary> {
    await requireUserId();
    const { data, error } = await supabase
      .from('backups')
      .select('payload, size_bytes')
      .eq('id', id)
      .single();
    if (error || !data) throw new Error('Could not download that backup.');
    const envelope = validateEnvelope(data.payload, data.size_bytes || undefined);
    return applyEnvelope(envelope, settingsScopeId);
  },

  /**
   * Writes the snapshot to a JSON file. Native: cache file + OS share sheet
   * (users pick iCloud Drive / Google Drive / Dropbox there). Web: download.
   */
  async exportToFile(current?: SnapshotSource, settingsScopeId?: string): Promise<{ fileName: string }> {
    const envelope = await this.createSnapshot(current, settingsScopeId);
    const json = JSON.stringify(envelope, null, 2);
    const fileName = backupFileName();

    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return { fileName };
    }

    const FileSystem = await getFS();
    const path = `${FileSystem.cacheDirectory || ''}${fileName}`;
    await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device.');
    }
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Save Warret backup', UTI: 'public.json' });
    return { fileName };
  },

  /**
   * Picks a .json backup file, validates it and applies it.
   * Returns null when the user cancels the picker.
   */
  async importFromFile(settingsScopeId?: string): Promise<RestoreSummary | null> {
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > MAX_PAYLOAD_BYTES) throw new Error('Backup is too large (over 10 MB).');

    let text: string;
    if (Platform.OS === 'web') {
      const response = await fetch(asset.uri);
      text = await response.text();
    } else {
      const FileSystem = await getFS();
      text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    }
    if (text.length > MAX_PAYLOAD_BYTES) throw new Error('Backup is too large (over 10 MB).');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('This file is not a Warret backup.');
    }
    const envelope = validateEnvelope(parsed, text.length);
    return applyEnvelope(envelope, settingsScopeId);
  },
};
