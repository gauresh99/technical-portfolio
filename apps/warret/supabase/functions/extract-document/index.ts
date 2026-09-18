/**
 * extract-document — Supabase Edge Function (Deno).
 *
 * Extracts structured fields from an already-uploaded warranty/invoice
 * document and persists them. The client (src/services/documentExtraction.ts)
 * uploads the file to the private 'warranty-documents' bucket FIRST, inserts a
 * documents row with extraction_status='pending', then calls this function —
 * so the request carries only metadata, never the file itself.
 *
 * Request  (POST, JSON): { user_id, asset_id, file_path, file_name, mime_type }
 * Response (JSON):       { ok: true, fields: ExtractedFields }
 *                      | { ok: false, error: string }
 *
 * Security gauntlet (in order, all non-negotiable):
 *   1. CORS preflight handled; every response carries CORS headers.
 *   2. Valid Supabase JWT required (verified via anon client) → else 401.
 *   3. JWT user id must equal body.user_id → else 403.
 *   4. file_path must recompose exactly as {user_id}/{asset_id}/{file_name},
 *      with no traversal ('..', '\', absolute paths) → else 403.
 *   5. The asset (products row) must exist AND belong to the caller → 404.
 *   6. File fetched server-side with the SERVICE ROLE key (never exposed to
 *      clients); size capped at 15 MB.
 *
 * Pipeline (exact decision tree):
 *   PDF with a native text layer (>= 200 meaningful chars via unpdf)
 *     → regex pass (documentRegex.ts) → Claude Haiku fills ONLY missing fields
 *   Scanned PDF or image
 *     → Claude Haiku multimodal (document/image block)
 *   Then, if coverage_summary AND support_contact are both still null AND
 *   brand + (model_number OR product_name) are known AND BRAVE_SEARCH_API_KEY
 *   is set → one Brave web search → Haiku extracts those two fields from the
 *   results. Missing Brave key or search failure → skipped silently.
 *
 * Model output is UNTRUSTED: parsed defensively, rebuilt field-by-field,
 * never spread. Null means "not in the document" — the prompt forbids guessing.
 *
 * PDF text extraction: npm:unpdf — pdf-parse is Node-only (relies on Node
 * streams/Buffer), while unpdf ships a serverless build of pdf.js that runs
 * in edge runtimes without workers or DOM. That is why unpdf.
 *
 * Secrets (see SECRETS.md): ANTHROPIC_API_KEY (required),
 * BRAVE_SEARCH_API_KEY (optional), EXTRACTION_MODEL (optional override).
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
 * automatically by the platform.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { extractWithRegex } from './documentRegex.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'warranty-documents';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;
const NATIVE_TEXT_THRESHOLD = 200;
const MODEL = Deno.env.get('EXTRACTION_MODEL') || 'claude-haiku-4-5-20251001';

const FIELD_KEYS = [
  'product_name', 'brand', 'category', 'model_number', 'serial_number',
  'purchase_date', 'expiry_date', 'retailer', 'purchase_price', 'currency',
  'coverage_summary', 'support_contact', 'proof_of_ownership',
] as const;
type FieldKey = typeof FIELD_KEYS[number];
type Fields = Record<FieldKey, string | number | null>;

const EXTRACTION_SYSTEM_PROMPT = `You extract structured fields from warranty cards, invoices and receipts.
Respond with ONLY a JSON object — no prose, no markdown fences.
Keys: product_name, brand, category, model_number, serial_number, purchase_date, expiry_date, retailer, purchase_price, currency, coverage_summary, support_contact, proof_of_ownership.
Rules:
- purchase_date and expiry_date must be YYYY-MM-DD.
- purchase_price is a plain number (no symbols); currency is a 3-letter code like INR or USD.
- coverage_summary: one or two sentences on what the warranty covers, taken from the document.
- support_contact: phone, email or URL for warranty claims, taken from the document.
- proof_of_ownership: invoice/order/receipt number if present.
- Use null for ANY field not explicitly present. NEVER guess, infer or invent values.`;

// ─── Small helpers ────────────────────────────────────────────────────────────

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function emptyFields(): Fields {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, null])) as Fields;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Real-calendar-date check for YYYY-MM-DD strings. */
function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Rebuilds untrusted (model/regex/search) output field-by-field. Strings
 * trimmed + capped, price must be finite, currency must be a 3-letter code,
 * dates must be real YYYY-MM-DD. Anything else → null. Never spread.
 */
function sanitizeFields(raw: Record<string, unknown>): Fields {
  const out = emptyFields();
  for (const key of FIELD_KEYS) {
    const value = raw[key];
    if (value === null || value === undefined) continue;
    if (key === 'purchase_price') {
      const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      out[key] = Number.isFinite(num) && num >= 0 ? num : null;
    } else if (typeof value === 'string' || typeof value === 'number') {
      const cap = key === 'coverage_summary' ? 1000 : 500;
      let str = String(value).trim().slice(0, cap);
      if (key === 'currency') {
        str = str.toUpperCase();
        if (!/^[A-Z]{3}$/.test(str)) str = '';
      }
      if ((key === 'purchase_date' || key === 'expiry_date') && str && !isValidISODate(str)) str = '';
      out[key] = str || null;
    }
  }
  return out;
}

/** Fills only the null slots of `base` from `extra` (deterministic wins). */
function mergeMissing(base: Fields, extra: Fields): Fields {
  const out = { ...base };
  for (const key of FIELD_KEYS) {
    if (out[key] === null && extra[key] !== null) out[key] = extra[key];
  }
  return out;
}

/** Strips markdown fences / surrounding prose and parses the JSON object. */
function parseModelJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Claude API ───────────────────────────────────────────────────────────────

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

async function callClaude(apiKey: string, system: string, content: ContentBlock[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${detail.slice(0, 200)}`);
  }
  const body = await res.json();
  const blocks: Array<{ type: string; text?: string }> = Array.isArray(body?.content) ? body.content : [];
  return blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
}

// ─── Brave Search enrichment (optional, silent on failure) ──────────────────

async function braveEnrichment(
  apiKey: string,
  braveKey: string,
  brand: string,
  productHint: string,
): Promise<Fields | null> {
  const query = `${brand} ${productHint} warranty coverage support contact`;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
  const res = await fetch(url, {
    headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const body = await res.json();
  const results: Array<{ title?: string; description?: string; url?: string }> =
    body?.web?.results ?? [];
  if (!results.length) return null;

  const digest = results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title ?? ''}\n${r.description ?? ''}\n${r.url ?? ''}`)
    .join('\n\n')
    .slice(0, 6000);

  const system = `You extract warranty support details from web search results.
Respond with ONLY a JSON object with exactly two keys: coverage_summary and support_contact.
coverage_summary: one or two sentences on what the manufacturer warranty covers for this product line.
support_contact: the official support phone, email or URL.
Use null for anything the results do not clearly state. NEVER guess.`;
  const answer = await callClaude(apiKey, system, [
    { type: 'text', text: `Product: ${brand} ${productHint}\n\nSearch results:\n${digest}` },
  ]);
  const parsed = parseModelJson(answer);
  if (!parsed) return null;
  return sanitizeFields({
    coverage_summary: parsed.coverage_summary,
    support_contact: parsed.support_contact,
  });
}

// ─── Status bookkeeping ───────────────────────────────────────────────────────

async function setStatus(
  admin: SupabaseClient,
  userId: string,
  filePath: string,
  status: 'processing' | 'done' | 'failed',
  extras: { error?: string; fields?: Fields } = {},
): Promise<void> {
  const patch: Record<string, unknown> = {
    extraction_status: status,
    extraction_error: extras.error ?? '',
  };
  if (extras.fields) patch.extracted_fields = extras.fields;
  const { error } = await admin
    .from('documents')
    .update(patch)
    .eq('user_id', userId)
    .eq('file_path', filePath);
  if (error) console.warn('extract-document: status update failed:', error.message);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const braveKey = Deno.env.get('BRAVE_SEARCH_API_KEY') ?? '';

  // Late declarations so the catch-all can mark the documents row failed.
  let admin: SupabaseClient | null = null;
  let jwtUserId = '';
  let filePath = '';

  try {
    // ── 1. Body shape ───────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, error: 'Body must be JSON.' });
    }
    const user_id = typeof body.user_id === 'string' ? body.user_id : '';
    const asset_id = typeof body.asset_id === 'string' ? body.asset_id : '';
    const file_name = typeof body.file_name === 'string' ? body.file_name : '';
    const mime_type = typeof body.mime_type === 'string' ? body.mime_type : '';
    filePath = typeof body.file_path === 'string' ? body.file_path : '';
    if (!user_id || !asset_id || !file_name || !filePath || filePath.length > 600 || file_name.length > 200) {
      return json(400, { ok: false, error: 'Missing or invalid fields.' });
    }

    // ── 2. JWT auth ─────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json(401, { ok: false, error: 'Missing authorization.' });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json(401, { ok: false, error: 'Invalid or expired session.' });
    }
    jwtUserId = userData.user.id;

    // ── 3. JWT ↔ body identity match ────────────────────────────────────────
    if (jwtUserId !== user_id) {
      return json(403, { ok: false, error: 'User mismatch.' });
    }

    // ── 4. Path traversal guard ─────────────────────────────────────────────
    // The path must recompose EXACTLY from the authenticated identity — no
    // '..', no backslashes, no absolute paths, no extra segments.
    const badSegment = (s: string) => !s || s === '.' || s === '..' || s.includes('\\') || s.includes('\0');
    const segments = filePath.split('/');
    if (
      segments.length !== 3 ||
      segments.some(badSegment) ||
      segments[0] !== jwtUserId ||
      segments[1] !== asset_id ||
      segments[2] !== file_name ||
      !/^[A-Za-z0-9_-]+$/.test(asset_id)
    ) {
      return json(403, { ok: false, error: 'Invalid file path.' });
    }

    // ── 5. Asset ownership ──────────────────────────────────────────────────
    admin = createClient(supabaseUrl, serviceKey);
    const { data: product } = await admin
      .from('products')
      .select('id')
      .eq('id', asset_id)
      .eq('user_id', jwtUserId)
      .maybeSingle();
    if (!product) {
      return json(404, { ok: false, error: 'Asset not found.' });
    }

    // ── 6. Fetch the file (service role — server-side only) ─────────────────
    await setStatus(admin, jwtUserId, filePath, 'processing');
    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(filePath);
    if (dlErr || !blob) {
      await setStatus(admin, jwtUserId, filePath, 'failed', { error: 'File not found in storage.' });
      return json(404, { ok: false, error: 'Document not found in storage.' });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES) {
      await setStatus(admin, jwtUserId, filePath, 'failed', { error: 'File exceeds 15 MB.' });
      return json(413, { ok: false, error: 'Document is too large (over 15 MB).' });
    }

    if (!anthropicKey) {
      await setStatus(admin, jwtUserId, filePath, 'failed', { error: 'ANTHROPIC_API_KEY not configured.' });
      return json(500, { ok: false, error: 'Extraction service is not configured.' });
    }

    // ── Pipeline ────────────────────────────────────────────────────────────
    const isPdf = mime_type === 'application/pdf' || file_name.toLowerCase().endsWith('.pdf');
    const isImage = /^image\/(jpeg|jpg|png|gif|webp)$/.test(mime_type);
    if (!isPdf && !isImage) {
      await setStatus(admin, jwtUserId, filePath, 'failed', { error: `Unsupported type: ${mime_type}` });
      return json(415, { ok: false, error: 'Only PDF and image documents are supported.' });
    }

    let fields = emptyFields();

    // Native-text PDF? Try the text layer first.
    let nativeText = '';
    if (isPdf) {
      try {
        const pdf = await getDocumentProxy(bytes);
        const { text } = await extractText(pdf, { mergePages: true });
        nativeText = String(text ?? '').replace(/\s+/g, ' ').trim();
      } catch (err) {
        console.warn('extract-document: pdf text extraction failed, using vision:', err);
      }
    }

    if (nativeText.length >= NATIVE_TEXT_THRESHOLD) {
      // TEXT PATH: regex first (deterministic), Haiku only for the gaps.
      fields = mergeMissing(fields, sanitizeFields(extractWithRegex(nativeText) as Record<string, unknown>));
      const missing = FIELD_KEYS.filter((k) => fields[k] === null);
      if (missing.length > 0) {
        const answer = await callClaude(anthropicKey, EXTRACTION_SYSTEM_PROMPT, [
          {
            type: 'text',
            text:
              `Extract ONLY these fields (the rest are already known): ${missing.join(', ')}.\n\n` +
              `Document text:\n${nativeText.slice(0, MAX_TEXT_CHARS)}`,
          },
        ]);
        const parsed = parseModelJson(answer);
        if (parsed) fields = mergeMissing(fields, sanitizeFields(parsed));
      }
    } else {
      // VISION PATH: scanned PDF or image straight to Haiku as multimodal.
      const data = encodeBase64(bytes);
      const block: ContentBlock = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: mime_type, data } };
      const answer = await callClaude(anthropicKey, EXTRACTION_SYSTEM_PROMPT, [
        block,
        { type: 'text', text: 'Extract the warranty/invoice fields from this document.' },
      ]);
      const parsed = parseModelJson(answer);
      if (parsed) fields = sanitizeFields(parsed);
    }

    // ── Brave enrichment (optional; silent skip) ────────────────────────────
    if (
      fields.coverage_summary === null &&
      fields.support_contact === null &&
      fields.brand !== null &&
      (fields.model_number !== null || fields.product_name !== null) &&
      braveKey
    ) {
      try {
        const hint = String(fields.model_number ?? fields.product_name);
        const enriched = await braveEnrichment(anthropicKey, braveKey, String(fields.brand), hint);
        if (enriched) fields = mergeMissing(fields, enriched);
      } catch (err) {
        console.warn('extract-document: enrichment skipped:', err);
      }
    }

    // ── Persist ─────────────────────────────────────────────────────────────
    // Never overwrite values the user typed themselves (source='manual').
    const { data: manualRows } = await admin
      .from('asset_fields')
      .select('field_key')
      .eq('asset_id', asset_id)
      .eq('user_id', jwtUserId)
      .eq('source', 'manual');
    const manualKeys = new Set((manualRows ?? []).map((r: { field_key: string }) => r.field_key));

    const upserts = FIELD_KEYS
      .filter((k) => fields[k] !== null && !manualKeys.has(k))
      .map((k) => ({
        user_id: jwtUserId,
        asset_id,
        field_key: k,
        field_value: String(fields[k]),
        source: 'edge',
      }));
    if (upserts.length > 0) {
      const { error: upsertErr } = await admin
        .from('asset_fields')
        .upsert(upserts, { onConflict: 'asset_id,field_key' });
      if (upsertErr) console.warn('extract-document: asset_fields upsert failed:', upsertErr.message);
    }

    await setStatus(admin, jwtUserId, filePath, 'done', { fields });
    return json(200, { ok: true, fields });
  } catch (err) {
    console.error('extract-document: unhandled failure:', err);
    if (admin && jwtUserId && filePath) {
      await setStatus(admin, jwtUserId, filePath, 'failed', {
        error: err instanceof Error ? err.message.slice(0, 300) : 'Unknown error',
      });
    }
    return json(500, { ok: false, error: 'Extraction failed. Please try again or fill the fields manually.' });
  }
});
