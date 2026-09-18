-- ============================================================
-- WARRET — Supabase Schema
-- Run this entire file in the Supabase SQL Editor once.
-- Project → SQL Editor → New query → paste → Run
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── updated_at trigger function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── PROFILES ─────────────────────────────────────────────────────────────────
-- Extends auth.users with app-specific data.
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                TEXT NOT NULL DEFAULT '',
  name                 TEXT NOT NULL DEFAULT '',
  phone                TEXT NOT NULL DEFAULT '',
  recovery_email       TEXT NOT NULL DEFAULT '',
  recovery_phone       TEXT NOT NULL DEFAULT '',
  date_of_birth        DATE,
  photo_url            TEXT NOT NULL DEFAULT '',
  signup_method        TEXT NOT NULL DEFAULT 'email' CHECK (signup_method IN ('email','google','apple')),
  security_question    TEXT NOT NULL DEFAULT '',
  security_answer_hash TEXT NOT NULL DEFAULT '',
  account_type         TEXT NOT NULL DEFAULT 'free' CHECK (account_type IN ('free','pro')),
  onboarding_done      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

UPDATE public.profiles p
SET email = COALESCE(u.email, '')
FROM auth.users u
WHERE p.id = u.id AND p.email = '';

INSERT INTO public.profiles (
  id,
  email,
  name,
  phone,
  recovery_email,
  recovery_phone,
  date_of_birth,
  security_question,
  security_answer_hash,
  signup_method
)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'phone', ''),
  COALESCE(u.raw_user_meta_data->>'recovery_email', ''),
  COALESCE(u.raw_user_meta_data->>'recovery_phone', ''),
  CASE
    WHEN COALESCE(u.raw_user_meta_data->>'date_of_birth', '') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (u.raw_user_meta_data->>'date_of_birth')::DATE
    ELSE NULL
  END,
  COALESCE(u.raw_user_meta_data->>'security_question', ''),
  COALESCE(u.raw_user_meta_data->>'security_answer_hash', ''),
  COALESCE(u.raw_user_meta_data->>'signup_method', 'email')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    phone,
    recovery_email,
    recovery_phone,
    date_of_birth,
    security_question,
    security_answer_hash,
    signup_method
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', ''),
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'recovery_email', ''),
    COALESCE(NEW.raw_user_meta_data->>'recovery_phone', ''),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'date_of_birth', '') ~ '^\d{4}-\d{2}-\d{2}$'
        THEN (NEW.raw_user_meta_data->>'date_of_birth')::DATE
      ELSE NULL
    END,
    COALESCE(NEW.raw_user_meta_data->>'security_question', ''),
    COALESCE(NEW.raw_user_meta_data->>'security_answer_hash', ''),
    COALESCE(
      NEW.raw_user_meta_data->>'signup_method',
      CASE WHEN NEW.raw_app_meta_data->>'provider' IN ('google','apple') THEN NEW.raw_app_meta_data->>'provider' ELSE 'email' END
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    recovery_email = EXCLUDED.recovery_email,
    recovery_phone = EXCLUDED.recovery_phone,
    date_of_birth = EXCLUDED.date_of_birth,
    security_question = EXCLUDED.security_question,
    security_answer_hash = EXCLUDED.security_answer_hash,
    signup_method = EXCLUDED.signup_method;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RPC: look up a user's email by phone number.
-- Sign-in is email-only; this function is kept for future Edge Function use only.
-- Anon role is explicitly revoked — only service_role can call it.
CREATE OR REPLACE FUNCTION get_email_by_phone(phone_number TEXT)
RETURNS TEXT AS $$
  SELECT u.email
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE p.phone = phone_number
    AND p.phone != ''
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_email_by_phone(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION get_email_by_phone(TEXT) FROM authenticated;

CREATE INDEX IF NOT EXISTS profiles_phone_idx ON public.profiles(phone) WHERE phone != '';

-- Public auth helper used only to decide whether "Forgot password" should
-- send a reset link or nudge the user back to their OAuth provider.
-- Source of truth is auth.identities (what providers actually exist), NOT the
-- cached profiles.signup_method column — that can go stale when Google is
-- linked to an email account, or when the profile row was created before the
-- provider was known. Rule: if an email/password identity exists the user CAN
-- reset a password ('email'); else if a Google identity exists, block reset
-- and send them to Google ('google'); else fall back to the profile column.
CREATE OR REPLACE FUNCTION get_auth_method_by_email(lookup_email TEXT)
RETURNS TEXT AS $$
DECLARE
  uid          UUID;
  has_password BOOLEAN;
  has_google   BOOLEAN;
BEGIN
  SELECT id INTO uid
  FROM auth.users
  WHERE lower(email) = lower(trim(lookup_email))
  ORDER BY created_at DESC
  LIMIT 1;

  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    bool_or(provider = 'email'),
    bool_or(provider = 'google')
  INTO has_password, has_google
  FROM auth.identities
  WHERE user_id = uid;

  IF has_password THEN RETURN 'email';  END IF;
  IF has_google   THEN RETURN 'google'; END IF;

  -- No identity rows recorded (legacy accounts) — use the cached column.
  RETURN (SELECT signup_method FROM public.profiles WHERE id = uid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_auth_method_by_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_auth_method_by_email(TEXT) TO authenticated;

-- Backfill: correct any profile whose cached signup_method disagrees with the
-- real identities (e.g. a Google-only account stuck showing 'email'). Makes the
-- settings "Signed in with Google" badge accurate too.
UPDATE public.profiles p
SET signup_method = 'google'
FROM auth.identities i
WHERE i.user_id = p.id
  AND i.provider = 'google'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities e WHERE e.user_id = p.id AND e.provider = 'email'
  )
  AND p.signup_method IS DISTINCT FROM 'google';

-- ─── PRODUCTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id             TEXT PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  brand          TEXT NOT NULL DEFAULT 'Unknown brand',
  type           TEXT NOT NULL DEFAULT 'Warranty document',
  warranty_start DATE,
  warranty_end   DATE,
  date_added     DATE,
  serial_number  TEXT,
  seller         TEXT,
  keywords       TEXT[]  NOT NULL DEFAULT '{}',
  reminders      TEXT[]  NOT NULL DEFAULT '{}',
  docs           TEXT[]  NOT NULL DEFAULT '{}',
  doc_entries    JSONB   NOT NULL DEFAULT '[]',
  support        JSONB   NOT NULL DEFAULT '{"site":"","phone":"","method":""}',
  extended       JSONB,
  coverage       JSONB   NOT NULL DEFAULT '{"included":[],"excluded":[]}',
  steps          TEXT[]  NOT NULL DEFAULT '{}',
  personal       BOOLEAN NOT NULL DEFAULT TRUE,
  group_id       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── PRODUCT CATEGORIES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_categories (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── GROUPS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groups (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  invite_token      TEXT NOT NULL,
  merge_all_to_main BOOLEAN NOT NULL DEFAULT FALSE,
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ─── GROUP MEMBERS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_members (
  id        TEXT PRIMARY KEY,
  group_id  TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('host','adder','viewer')),
  color     TEXT NOT NULL DEFAULT '#6F63F3',
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(group_id, user_id)
);

-- ─── GROUP PRODUCTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_products (
  id                TEXT PRIMARY KEY,
  group_id          TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  product_id        TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  added_by_id       TEXT,
  privacy           TEXT NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','private','custom')),
  custom_viewer_ids TEXT[] NOT NULL DEFAULT '{}',
  merged_to_main    BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(group_id, product_id)
);

-- ─── GROUP ACTIVITIES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_activities (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT,
  target_id   TEXT,
  target_name TEXT,
  meta        TEXT NOT NULL DEFAULT '',
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── DOCUMENT EXTRACTION METADATA ───────────────────────────────────────────
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

-- ─── STORAGE BUCKET ───────────────────────────────────────────────────────────
-- Private bucket for invoices, warranty cards, photos and PDFs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'warranty-documents',
  'warranty-documents',
  FALSE,
  15728640,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']::TEXT[];

-- ─── ROW-LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_fields      ENABLE ROW LEVEL SECURITY;

-- RLS helper functions. These avoid recursive group_members policies.
CREATE OR REPLACE FUNCTION public.is_group_member(target_group_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_group_host(target_group_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = auth.uid() AND role = 'host'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_add_to_group(target_group_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = auth.uid() AND role IN ('host','adder')
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.group_has_no_members(target_group_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.owns_product(target_product_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = target_product_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_read_group_product(target_product_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_products gp
    JOIN public.group_members gm ON gm.group_id = gp.group_id
    WHERE gp.product_id = target_product_id
      AND gm.user_id = auth.uid()
      AND (
        gp.privacy = 'public'
        OR gm.role = 'host'
        OR (gp.privacy = 'custom' AND gm.id = ANY(gp.custom_viewer_ids))
      )
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Users manage own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users manage own products" ON public.products;
DROP POLICY IF EXISTS "Members read shared products" ON public.products;
DROP POLICY IF EXISTS "Users manage own categories" ON public.product_categories;
DROP POLICY IF EXISTS "Members read their groups" ON public.groups;
DROP POLICY IF EXISTS "Anyone can create a group" ON public.groups;
DROP POLICY IF EXISTS "Hosts update group" ON public.groups;
DROP POLICY IF EXISTS "Hosts delete group" ON public.groups;
DROP POLICY IF EXISTS "Members read group_members" ON public.group_members;
DROP POLICY IF EXISTS "User inserts own member row" ON public.group_members;
DROP POLICY IF EXISTS "Creator inserts initial host member row" ON public.group_members;
DROP POLICY IF EXISTS "Hosts update member roles" ON public.group_members;
DROP POLICY IF EXISTS "Members leave or hosts remove" ON public.group_members;
DROP POLICY IF EXISTS "Members read group_products" ON public.group_products;
DROP POLICY IF EXISTS "Hosts and adders add products" ON public.group_products;
DROP POLICY IF EXISTS "Hosts update group_products" ON public.group_products;
DROP POLICY IF EXISTS "Hosts delete group_products" ON public.group_products;
DROP POLICY IF EXISTS "Members read activities" ON public.group_activities;
DROP POLICY IF EXISTS "Members add activities" ON public.group_activities;

-- Prevent users from changing account_type or created_at via the client
CREATE OR REPLACE FUNCTION prevent_profile_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_type != OLD.account_type THEN
    RAISE EXCEPTION 'account_type can only be changed by an admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS no_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER no_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_privilege_escalation();

-- profiles
CREATE POLICY "Users manage own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- products
CREATE POLICY "Users manage own products"
  ON public.products FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members read shared products"
  ON public.products FOR SELECT
  USING (public.can_read_group_product(id));

-- product_categories
CREATE POLICY "Users manage own categories"
  ON public.product_categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- groups — members can read; hosts can write
CREATE POLICY "Members read their groups"
  ON public.groups FOR SELECT
  USING (public.is_group_member(id));

CREATE POLICY "Anyone can create a group"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Hosts update group"
  ON public.groups FOR UPDATE
  USING (public.is_group_host(id));

CREATE POLICY "Hosts delete group"
  ON public.groups FOR DELETE
  USING (public.is_group_host(id));

-- group_members
CREATE POLICY "Members read group_members"
  ON public.group_members FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Creator inserts initial host member row"
  ON public.group_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'host'
    AND public.group_has_no_members(group_id)
  );

CREATE POLICY "Hosts update member roles"
  ON public.group_members FOR UPDATE
  USING (public.is_group_host(group_id))
  WITH CHECK (public.is_group_host(group_id));

CREATE POLICY "Members leave or hosts remove"
  ON public.group_members FOR DELETE
  USING (
    user_id = auth.uid() OR
    public.is_group_host(group_id)
  );

-- group_products
CREATE POLICY "Members read group_products"
  ON public.group_products FOR SELECT
  USING (
    public.is_group_host(group_id)
    OR public.can_read_group_product(product_id)
  );

CREATE POLICY "Hosts and adders add products"
  ON public.group_products FOR INSERT
  WITH CHECK (
    public.can_add_to_group(group_id)
    AND public.owns_product(product_id)
  );

CREATE POLICY "Hosts update group_products"
  ON public.group_products FOR UPDATE
  USING (public.is_group_host(group_id));

CREATE POLICY "Hosts delete group_products"
  ON public.group_products FOR DELETE
  USING (public.is_group_host(group_id));

-- group_activities
CREATE POLICY "Members read activities"
  ON public.group_activities FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Members add activities"
  ON public.group_activities FOR INSERT
  WITH CHECK (public.is_group_member(group_id));

-- documents
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

-- asset_fields
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

-- ─── Storage RLS ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own warranty documents" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own warranty documents" ON storage.objects;
DROP POLICY IF EXISTS "Users update own warranty documents" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own warranty documents" ON storage.objects;

CREATE POLICY "Users read own warranty documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'warranty-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR public.can_read_group_product((storage.foldername(name))[2])
    )
  );

CREATE POLICY "Users upload own warranty documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'warranty-documents' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

CREATE POLICY "Users update own warranty documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'warranty-documents' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
  WITH CHECK (bucket_id = 'warranty-documents' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

CREATE POLICY "Users delete own warranty documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'warranty-documents' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- ─── Account deletion ─────────────────────────────────────────────────────────
-- Lets a signed-in user permanently delete their OWN account.
-- SECURITY DEFINER so it can remove the auth.users row, which cascades to
-- profiles, products, product_categories (ON DELETE CASCADE) and nulls out
-- group_members (ON DELETE SET NULL). This frees the email for reuse.
-- Storage files are purged separately by the client via the Storage API,
-- because Supabase blocks direct DELETE on storage.objects from SQL.
-- Only ever operates on auth.uid() — a user can never delete anyone else.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only authenticated users may call it; anon cannot.
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- ─── Cross-device group invite preview / join ───────────────────────────────
DROP FUNCTION IF EXISTS public.get_group_join_info(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.get_group_join_info(p_group_id TEXT, p_token TEXT)
RETURNS TABLE (
  name              TEXT,
  description       TEXT,
  locked            BOOLEAN,
  requires_passcode BOOLEAN,
  member_count      INT
) AS $$
  SELECT
    g.name,
    g.description,
    COALESCE((g.settings->>'locked')::BOOLEAN, FALSE),
    COALESCE(g.settings->>'passcode_hash', '') <> '' OR COALESCE(g.settings->>'passcode', '') <> '',
    (SELECT COUNT(*)::INT FROM public.group_members gm WHERE gm.group_id = g.id)
  FROM public.groups g
  WHERE g.id = p_group_id
    AND g.invite_token = p_token
    AND auth.uid() IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_group_join_info(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_group_join_info(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_group_join_info(TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.join_group_with_token(TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.join_group_with_token(
  p_group_id TEXT,
  p_token    TEXT,
  p_name     TEXT,
  p_role     TEXT,
  p_passcode TEXT DEFAULT ''
)
RETURNS TEXT AS $$
DECLARE
  uid         UUID := auth.uid();
  grp         public.groups%ROWTYPE;
  v_role      TEXT;
  v_passcode  TEXT;
  v_passcode_hash TEXT;
  v_count     INT;
  v_member_id TEXT;
  v_name      TEXT;
  colors      TEXT[] := ARRAY[
    '#6F63F3','#0D9488','#D97706','#DC2626','#7C3AED',
    '#059669','#DB2777','#2563EB','#EA580C','#65A30D'
  ];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO grp FROM public.groups WHERE id = p_group_id;
  IF NOT FOUND OR grp.invite_token IS DISTINCT FROM p_token THEN
    RETURN 'invalid-link';
  END IF;

  v_role := CASE WHEN p_role IN ('adder','viewer') THEN p_role ELSE 'viewer' END;

  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = uid
  ) THEN
    RETURN 'already-member';
  END IF;

  IF COALESCE((grp.settings->>'locked')::BOOLEAN, FALSE) THEN
    RETURN 'locked';
  END IF;

  v_passcode_hash := COALESCE(grp.settings->>'passcode_hash', '');
  v_passcode := COALESCE(grp.settings->>'passcode', '');
  IF v_passcode_hash <> '' AND crypt(COALESCE(p_passcode, ''), v_passcode_hash) IS DISTINCT FROM v_passcode_hash THEN
    RETURN 'wrong-passcode';
  END IF;
  IF v_passcode_hash = '' AND v_passcode <> '' AND v_passcode IS DISTINCT FROM COALESCE(p_passcode, '') THEN
    RETURN 'wrong-passcode';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.group_members WHERE group_id = p_group_id;
  v_member_id := 'm_' || gen_random_uuid();
  v_name      := COALESCE(NULLIF(left(trim(p_name), 80), ''), 'New member');

  BEGIN
    INSERT INTO public.group_members (id, group_id, user_id, name, role, color, joined_at)
    VALUES (
      v_member_id, p_group_id, uid, v_name, v_role,
      colors[(v_count % array_length(colors, 1)) + 1], CURRENT_DATE
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN 'already-member';
  END;

  INSERT INTO public.group_activities (id, group_id, type, actor_id, actor_name, target_id, target_name, meta)
  VALUES ('act_' || gen_random_uuid(), p_group_id, 'member_joined', v_member_id, v_name, v_member_id, v_name, v_role);

  RETURN 'ok';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.join_group_with_token(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_group_with_token(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_group_with_token(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.set_group_passcode(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.set_group_passcode(
  p_group_id TEXT,
  p_passcode TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
DECLARE
  clean TEXT := COALESCE(NULLIF(trim(p_passcode), ''), '');
BEGIN
  IF NOT public.is_group_host(p_group_id) THEN
    RAISE EXCEPTION 'Only group hosts can change the passcode';
  END IF;

  IF clean = '' THEN
    UPDATE public.groups
    SET settings = settings - 'passcode' - 'passcode_hash'
    WHERE id = p_group_id;
  ELSE
    UPDATE public.groups
    SET settings = (settings - 'passcode') || jsonb_build_object('passcode_hash', crypt(clean, gen_salt('bf')))
    WHERE id = p_group_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.set_group_passcode(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_group_passcode(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_group_passcode(TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_products;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_activities;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Cloud backups ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.backups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload    JSONB NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  platform   TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS backups_user_created_idx
  ON public.backups(user_id, created_at DESC);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own backups" ON public.backups;
DROP POLICY IF EXISTS "Users insert own backups" ON public.backups;
DROP POLICY IF EXISTS "Users delete own backups" ON public.backups;

CREATE POLICY "Users read own backups"
  ON public.backups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own backups"
  ON public.backups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own backups"
  ON public.backups FOR DELETE
  USING (auth.uid() = user_id);
