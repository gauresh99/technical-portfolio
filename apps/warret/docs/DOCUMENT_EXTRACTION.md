# Document extraction pipeline

How a document becomes auto-filled fields, and what to deploy.

## Flow

```
add.tsx (upload)                          app / device
  → src/services/documentExtraction.ts
      1. upload file → Storage bucket 'warranty-documents'
         at {user_id}/{asset_id}/{filename}
      2. insert documents row (extraction_status 'pending')
      3. invoke Edge Function 'extract-document' (JWT attached)
         └── falls back to on-device parsing (pdfjs/tesseract)
             when signed out, offline, or the function is
             undeployed — the form ALWAYS renders
─────────────────────────────────────────  server (Edge Function)
extract-document (Deno):
  auth gauntlet: JWT → user match → path recompose check
                 → asset ownership → service-role file fetch (≤15 MB)
  pipeline:
    native-text PDF (unpdf, ≥200 chars)
      → regex pass (documentRegex.ts)
      → Claude Haiku fills ONLY the missing fields
    scanned PDF / image
      → Claude Haiku multimodal (document/image block)
    coverage_summary + support_contact both still null
    AND brand + (model or name) known AND Brave key set
      → Brave Search → Haiku extracts those two fields
      → missing key / failure: skipped silently
  persist: asset_fields upsert (source 'edge', never overwrites
           source 'manual'), documents.extraction_status → done/failed,
           extracted_fields JSONB snapshot
  respond: { ok: true, fields } | { ok: false, error }
```

Fields: `product_name, brand, category, model_number, serial_number,
purchase_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD), retailer,
purchase_price (number), currency (3-letter), coverage_summary,
support_contact, proof_of_ownership` — `null` = not found; the prompt
forbids guessing, and every model response is re-validated field-by-field
server-side AND client-side (two trust boundaries).

## Decisions (and why)

| Spec said | We did | Why |
|---|---|---|
| tables `assets`/`documents`/`asset_fields` exist | `assets` = the existing `products` table; migration 007 created `documents` + `asset_fields` | one primitive per CLAUDE.md; the tables did not exist |
| bucket `documents` | reuse `warranty-documents` | RLS already deployed; identical `{user}/{asset}/{file}` path convention |
| Edge Function accepts multipart file | JSON metadata only | the client uploads to Storage first (spec's own flow) — sending the file twice is waste |
| `npm install pdf-parse` in the app | not installed | pdf-parse is Node-only (breaks Metro); the client never parses PDFs in this pipeline |
| pdf-parse in the function | `npm:unpdf` | serverless pdf.js build; runs in Deno edge without workers/DOM |
| regex util at `lib/documentRegex.ts` | `supabase/functions/extract-document/documentRegex.ts` | the regex pass runs server-side; edge bundles cannot import `../../src` |
| date ambiguity DD/MM vs MM/DD | DD/MM default, numbers >12 disambiguate | primary market is India |
| "expires Jan 2027" (no day) | day = 1 | conservative: reminders fire earlier, never later |
| `asset_fields.source` regex/ai/search | `'edge'` for all function writes | migration 007's CHECK allows only manual/edge/local-fallback |

## Deploy runbook (user steps)

1. **Migration** — Supabase SQL Editor → run
   `supabase/migrations/007_document_extraction_metadata.sql` (idempotent;
   creates `documents` + `asset_fields` with RLS).
2. **Function** — from the repo root:
   ```sh
   supabase functions deploy extract-document
   ```
3. **Secrets** — see `SECRETS.md` (gitignored):
   ```sh
   supabase secrets set ANTHROPIC_API_KEY=<anthropic-api-key>
   supabase secrets set BRAVE_SEARCH_API_KEY=...   # optional
   ```
4. **Smoke test** (replace the JWT with a real session token from the app —
   e.g. log `(await supabase.auth.getSession()).data.session?.access_token`):
   ```sh
   curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/extract-document" \
     -H "Authorization: Bearer <USER_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"user_id":"<uid>","asset_id":"<product-id>","file_path":"<uid>/<product-id>/invoice.pdf","file_name":"invoice.pdf","mime_type":"application/pdf"}'
   ```
   Expect `{"ok":true,"fields":{...}}` and the `documents` row flipping to
   `done`. Wrong user id → 403; bad path → 403; missing file → 404.

Until steps 1–3 are done the app still works: extraction silently falls back
to the on-device parser (name/brand/dates only) and users fill the rest
manually.
