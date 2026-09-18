-- WARRET — Migration 007: document extraction metadata
--
-- Safe to re-run after migrations 001-006.
-- Adds private metadata tables used by src/services/documentExtraction.ts.
-- Model/API keys must stay in Supabase Edge Function secrets, not Expo.

CREATE TABLE IF NOT EXISTS public.documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id          TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  mime_type         TEXT NOT NULL DEFAULT '',
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'done', 'failed')),
  extraction_error  TEXT NOT NULL DEFAULT '',
  extracted_fields  JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, file_path)
);

CREATE INDEX IF NOT EXISTS documents_user_asset_idx
  ON public.documents(user_id, asset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.asset_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id    TEXT NOT NULL,
  field_key   TEXT NOT NULL,
  field_value TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'edge', 'local-fallback')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id, field_key)
);

CREATE INDEX IF NOT EXISTS asset_fields_user_asset_idx
  ON public.asset_fields(user_id, asset_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own documents metadata" ON public.documents;
DROP POLICY IF EXISTS "Users insert own documents metadata" ON public.documents;
DROP POLICY IF EXISTS "Users update own documents metadata" ON public.documents;
DROP POLICY IF EXISTS "Users delete own documents metadata" ON public.documents;

CREATE POLICY "Users read own documents metadata"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own documents metadata"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own documents metadata"
  ON public.documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own documents metadata"
  ON public.documents FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own asset fields" ON public.asset_fields;
DROP POLICY IF EXISTS "Users insert own asset fields" ON public.asset_fields;
DROP POLICY IF EXISTS "Users update own asset fields" ON public.asset_fields;
DROP POLICY IF EXISTS "Users delete own asset fields" ON public.asset_fields;

CREATE POLICY "Users read own asset fields"
  ON public.asset_fields FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own asset fields"
  ON public.asset_fields FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own asset fields"
  ON public.asset_fields FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own asset fields"
  ON public.asset_fields FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS asset_fields_updated_at ON public.asset_fields;
CREATE TRIGGER asset_fields_updated_at
  BEFORE UPDATE ON public.asset_fields
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
