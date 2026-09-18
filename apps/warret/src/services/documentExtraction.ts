// Document extraction pipeline — upload → cloud extraction → local fallback.
//
// Flow: store the file in the private `warranty-documents` bucket, record a
// `documents` row (extraction_status 'pending'), then ask the `extract-document`
// Edge Function to read the file server-side and return structured fields. The
// Edge Function owns flipping extraction_status to done/failed. If any cloud
// step is unavailable (signed out, Supabase unconfigured, edge down, timeout),
// we fall back to the on-device parser (pdfjs/tesseract) so the form always
// gets *something* — extractDocument never throws.
//
// TRUST BOUNDARIES:
// - The Edge Function response crosses the network: it is validated
//   field-by-field (never spread), strings trimmed + capped, numbers checked
//   with Number.isFinite. A malformed response degrades to the local fallback.
// - The storage path is recomposed here as `${userId}/${assetId}/${sanitized}`
//   with the same sanitizeFileName the uploader uses; the Edge Function
//   recomposes it server-side and rejects mismatches.

import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { sanitizeFileName } from '../utils/security';
import { FileStorageService } from './fileStorage';
import { parseWarrantyDocument } from './warrantyParser';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type ExtractedFields = {
  product_name: string | null;
  brand: string | null;
  category: string | null;
  model_number: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  expiry_date: string | null;
  retailer: string | null;
  purchase_price: number | null;
  currency: string | null;
  coverage_summary: string | null;
  support_contact: string | null;
  proof_of_ownership: string | null;
};

export const EMPTY_FIELDS: ExtractedFields = {
  product_name: null,
  brand: null,
  category: null,
  model_number: null,
  serial_number: null,
  purchase_date: null,
  expiry_date: null,
  retailer: null,
  purchase_price: null,
  currency: null,
  coverage_summary: null,
  support_contact: null,
  proof_of_ownership: null,
};

export type ExtractionResult = {
  fields: ExtractedFields;
  source: 'edge' | 'local-fallback' | 'none';
  documentId: string | null;
  storedUri?: string;
  error?: string;
};

const FIELD_KEYS = Object.keys(EMPTY_FIELDS) as (keyof ExtractedFields)[];

const EDGE_FUNCTION = 'extract-document';
const EDGE_TIMEOUT_MS = 45_000;
const MAX_FIELD_LENGTH = 1000;

// ─────────────────────────────────────────────────────────────
// DEFENSIVE VALIDATION (edge response crosses a trust boundary)
// ─────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Untrusted → trimmed, length-capped string, or null. */
function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
  return trimmed || null;
}

/** Untrusted → finite number, or null. Only number/numeric-string accepted. */
function cleanPrice(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Rebuild the edge response field-by-field into ExtractedFields.
 * Whitelisted keys only, each type-checked — never spread.
 * Returns null when the payload isn't the shape we expect.
 */
function sanitizeEdgeResponse(data: unknown): ExtractedFields | null {
  if (!isPlainObject(data) || data.ok !== true || !isPlainObject(data.fields)) {
    return null;
  }
  const raw = data.fields;
  const fields: ExtractedFields = { ...EMPTY_FIELDS };
  for (const key of FIELD_KEYS) {
    if (key === 'purchase_price') {
      fields.purchase_price = cleanPrice(raw[key]);
    } else {
      fields[key] = cleanString(raw[key]);
    }
  }
  return fields;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

async function signedInUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/** Race a promise against a hard timeout; the timer is always cleared. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Extraction timed out.')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * On-device fallback: pdfjs/tesseract via warrantyParser. Maps the parser's
 * four fields into ExtractedFields; everything else stays null. Never throws —
 * a parse failure returns EMPTY_FIELDS with source 'none' so the form still
 * renders for manual entry.
 */
async function runLocalFallback(
  uri: string,
  mimeType: string,
  documentId: string | null,
  onProgress?: (msg: string) => void,
  edgeError?: string,
  storedUri?: string,
): Promise<ExtractionResult> {
  onProgress?.('Reading on this device…');
  try {
    const parsed = await parseWarrantyDocument(uri, mimeType);
    const fields: ExtractedFields = {
      ...EMPTY_FIELDS,
      product_name: cleanString(parsed.name),
      brand: cleanString(parsed.brand),
      purchase_date: cleanString(parsed.warrantyStart),
      expiry_date: cleanString(parsed.warrantyEnd),
    };
    return edgeError
      ? { fields, source: 'local-fallback', documentId, storedUri, error: edgeError }
      : { fields, source: 'local-fallback', documentId, storedUri };
  } catch (err) {
    console.warn('documentExtraction: local parse failed:', err);
    return {
      fields: { ...EMPTY_FIELDS },
      source: 'none',
      documentId,
      storedUri,
      error: 'We could not read this document automatically. You can fill in the details manually.',
    };
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Upload a document, ask the Edge Function to extract its fields, and fall
 * back to on-device parsing when the cloud path is unavailable.
 * NEVER throws — the review form must always render.
 */
export async function extractDocument(input: {
  uri: string;
  fileName: string;
  mimeType: string;
  assetId: string;
  onProgress?: (msg: string) => void;
}): Promise<ExtractionResult> {
  const { uri, fileName, mimeType, assetId, onProgress } = input;
  onProgress?.('Uploading document…');

  // ── Signed out / unconfigured → local-only mode ──────────
  const userId = await signedInUserId();
  if (!userId) {
    return runLocalFallback(uri, mimeType, null, onProgress);
  }

  // ── Upload to the private bucket ─────────────────────────
  // Canonical path recomposed with the same sanitizer storeDocument uses,
  // so it matches what the Edge Function recomposes server-side.
  const sanitized = sanitizeFileName(fileName);
  try {
    var storedUri = await FileStorageService.storeDocument(uri, assetId, fileName, mimeType);
  } catch (err) {
    // No cloud copy → the Edge Function has nothing to read. Parse locally.
    console.warn('documentExtraction: upload failed, falling back to local parse:', err);
    return runLocalFallback(
      uri,
      mimeType,
      null,
      onProgress,
      'Upload failed — extracted on this device instead.',
    );
  }
  const filePath = `${userId}/${assetId}/${sanitized}`;

  // ── Record the documents row (status 'pending') ──────────
  // The Edge Function flips it to done/failed. If the migration hasn't been
  // run yet the insert fails — carry on with documentId null and let the
  // edge call decide the outcome.
  let documentId: string | null = null;
  try {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        asset_id: assetId,
        file_path: filePath,
        file_name: sanitized,
        mime_type: mimeType,
        extraction_status: 'pending',
      })
      .select('id')
      .single();
    if (error || !data?.id) {
      console.warn('documentExtraction: could not insert documents row (migration 005 applied?):', error?.message);
    } else {
      documentId = String(data.id);
    }
  } catch (err) {
    console.warn('documentExtraction: documents insert threw:', err);
  }

  // ── Cloud extraction via the Edge Function ───────────────
  onProgress?.('Reading your document…');
  let edgeError = 'Cloud extraction failed — extracted on this device instead.';
  try {
    // invoke() attaches the session JWT automatically.
    const { data, error } = await withTimeout(
      supabase.functions.invoke(EDGE_FUNCTION, {
        body: {
          user_id: userId,
          asset_id: assetId,
          file_path: filePath,
          file_name: sanitized,
          mime_type: mimeType,
        },
      }),
      EDGE_TIMEOUT_MS,
    );
    if (!error) {
      const fields = sanitizeEdgeResponse(data);
      if (fields) return { fields, source: 'edge', documentId, storedUri };
      if (isPlainObject(data) && typeof data.error === 'string' && data.error) {
        console.warn('documentExtraction: edge returned error:', data.error.slice(0, 200));
      }
    } else {
      console.warn('documentExtraction: edge invoke error:', error.message);
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Extraction timed out.') {
      edgeError = 'Cloud extraction timed out — extracted on this device instead.';
    }
    console.warn('documentExtraction: edge invoke threw:', err);
  }

  // ── Edge unavailable / malformed → local fallback ────────
  return runLocalFallback(uri, mimeType, documentId, onProgress, edgeError, storedUri);
}

/**
 * Persist manually-entered field values to `asset_fields` (one row per field,
 * source 'manual'). Signed out / unconfigured is a legitimate local-only mode
 * → silent no-op. A missing table (migration not run) is logged, never thrown
 * — the save flow must not crash.
 */
export async function saveManualFields(
  assetId: string,
  fields: Partial<ExtractedFields>,
): Promise<void> {
  const userId = await signedInUserId();
  if (!userId) return;

  const rows = FIELD_KEYS
    .filter((key) => fields[key] !== null && fields[key] !== undefined)
    .map((key) => ({
      user_id: userId,
      asset_id: assetId,
      field_key: key,
      field_value: String(fields[key]),
      source: 'manual',
    }));
  if (!rows.length) return;

  try {
    const { error } = await supabase
      .from('asset_fields')
      .upsert(rows, { onConflict: 'asset_id,field_key' });
    if (error) {
      console.warn('documentExtraction: could not save manual fields (migration 005 applied?):', error.message);
    }
  } catch (err) {
    console.warn('documentExtraction: asset_fields upsert threw:', err);
  }
}
