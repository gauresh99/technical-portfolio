import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase, WARRANTY_DOCUMENTS_BUCKET } from '../lib/supabase';
import { isAllowedDocumentType, sanitizeFileName, validateDocumentUpload } from '../utils/security';

// expo-file-system is not supported on web — all methods are safe no-ops there.
const isNative = Platform.OS !== 'web';

async function getFS() {
  return import('expo-file-system/legacy');
}

const ROOT = 'warret/documents/';
const SUPABASE_URI_PREFIX = `supabase://${WARRANTY_DOCUMENTS_BUCKET}/`;

async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Path-segment guard. userId is a Supabase auth UUID and productId comes from
 * slugify + createEntityId — both stay within [A-Za-z0-9_-]. Anything else
 * (slashes, dots, empty) would let a crafted value escape the
 * `{userId}/{productId}/` folder that Storage RLS keys on, so refuse it.
 */
function safeSegment(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid storage path segment.');
  }
  return value;
}

function storagePath(userId: string, productId: string, fileName: string): string {
  return `${safeSegment(userId)}/${safeSegment(productId)}/${sanitizeFileName(fileName)}`;
}

function supabaseUri(path: string): string {
  return `${SUPABASE_URI_PREFIX}${path}`;
}

function pathFromSupabaseUri(uri: string): string | null {
  return uri.startsWith(SUPABASE_URI_PREFIX) ? uri.slice(SUPABASE_URI_PREFIX.length) : null;
}

function storagePathMatches(path: string, userId: string, productId: string, fileName: string): boolean {
  return path === storagePath(userId, productId, fileName);
}

async function signedUrlForStoredUri(storedUri: string, productId: string, fileName: string): Promise<string | null> {
  const path = pathFromSupabaseUri(storedUri);
  if (!path) return null;

  const userId = await currentUserId();
  if (!userId || !storagePathMatches(path, userId, productId, fileName)) return null;

  const { data, error } = await supabase.storage
    .from(WARRANTY_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60 * 10);
  if (!error && data?.signedUrl) return data.signedUrl;
  return null;
}

async function fileBlob(sourceUri: string): Promise<Blob> {
  const response = await fetch(sourceUri);
  if (!response.ok) throw new Error('Could not read selected document.');
  return response.blob();
}

async function ensureProductDir(productId: string): Promise<string> {
  const FileSystem = await getFS();
  const dir = `${FileSystem.documentDirectory}${ROOT}${safeSegment(productId)}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

export const FileStorageService = {
  async storeDocument(sourceUri: string, productId: string, fileName: string, mimeType?: string): Promise<string> {
    const safeName = sanitizeFileName(fileName);
    if (mimeType && !isAllowedDocumentType(mimeType)) {
      throw new Error('Upload a PDF or image document.');
    }

    const userId = await currentUserId();
    if (userId) {
      const path = storagePath(userId, productId, safeName);
      const blob = await fileBlob(sourceUri);
      const validation = validateDocumentUpload({ name: safeName, mimeType: mimeType || blob.type, size: blob.size });
      if (!validation.ok) throw new Error(validation.reason);
      const { error } = await supabase.storage
        .from(WARRANTY_DOCUMENTS_BUCKET)
        .upload(path, blob, {
          upsert: true,
          contentType: mimeType || blob.type || 'application/octet-stream',
        });
      if (error) {
        throw new Error('Could not upload the document to secure storage. Check your connection and try again.', { cause: error });
      }
      return supabaseUri(path);
    }

    if (!isNative) return sourceUri;
    const FileSystem = await getFS();
    const dir = await ensureProductDir(productId);
    const dest = `${dir}${safeName}`;
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  },

  async getDocumentUri(productId: string, fileName: string): Promise<string | null> {
    const userId = await currentUserId();
    if (userId) {
      const { data, error } = await supabase.storage
        .from(WARRANTY_DOCUMENTS_BUCKET)
        .createSignedUrl(storagePath(userId, productId, fileName), 60 * 10);
      if (!error && data?.signedUrl) return data.signedUrl;
    }

    if (!isNative) return null;
    const FileSystem = await getFS();
    const path = `${FileSystem.documentDirectory}${ROOT}${productId}/${sanitizeFileName(fileName)}`;
    const info = await FileSystem.getInfoAsync(path);
    return info.exists ? path : null;
  },

  async resolveDocumentUri(storedUri: string | undefined, productId: string, fileName: string): Promise<string | null> {
    if (storedUri) {
      if (pathFromSupabaseUri(storedUri)) return signedUrlForStoredUri(storedUri, productId, fileName);
      return storedUri;
    }
    return this.getDocumentUri(productId, fileName);
  },

  async deleteDocument(productId: string, fileName: string): Promise<void> {
    const userId = await currentUserId();
    if (userId) {
      await supabase.storage
        .from(WARRANTY_DOCUMENTS_BUCKET)
        .remove([storagePath(userId, productId, fileName)]);
    }

    if (!isNative) return;
    const FileSystem = await getFS();
    const path = `${FileSystem.documentDirectory}${ROOT}${productId}/${sanitizeFileName(fileName)}`;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  },

  async deleteAllForProduct(productId: string): Promise<void> {
    const userId = await currentUserId();
    if (userId) {
      const folder = `${safeSegment(userId)}/${safeSegment(productId)}`;
      const { data } = await supabase.storage.from(WARRANTY_DOCUMENTS_BUCKET).list(folder);
      const paths = (data || []).map((item) => `${folder}/${item.name}`);
      if (paths.length) await supabase.storage.from(WARRANTY_DOCUMENTS_BUCKET).remove(paths);
    }

    if (!isNative) return;
    const FileSystem = await getFS();
    const dir = `${FileSystem.documentDirectory}${ROOT}${productId}/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
  },

  async listDocuments(productId: string): Promise<string[]> {
    const userId = await currentUserId();
    if (userId) {
      const { data, error } = await supabase.storage
        .from(WARRANTY_DOCUMENTS_BUCKET)
        .list(`${safeSegment(userId)}/${safeSegment(productId)}`);
      if (!error) return (data || []).map((item) => item.name);
    }

    if (!isNative) return [];
    const FileSystem = await getFS();
    const dir = `${FileSystem.documentDirectory}${ROOT}${productId}/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];
    return FileSystem.readDirectoryAsync(dir);
  },

  async clearTemporaryFiles(): Promise<{ deleted: number }> {
    if (!isNative) return { deleted: 0 };
    const FileSystem = await getFS();
    const dir = FileSystem.cacheDirectory;
    if (!dir) return { deleted: 0 };
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return { deleted: 0 };
    const files = await FileSystem.readDirectoryAsync(dir);
    let deleted = 0;
    for (const file of files) {
      if (!file.startsWith('warret-')) continue;
      await FileSystem.deleteAsync(`${dir}${file}`, { idempotent: true }).then(() => { deleted += 1; }).catch(() => {});
    }
    return { deleted };
  },
};
