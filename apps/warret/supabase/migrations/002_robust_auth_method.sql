-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: robust auth-method detection + backfill
-- Run ONCE in the Supabase SQL Editor (paste → Run). Safe to re-run.
--
-- Fixes: Google accounts being treated as email accounts (so "Forgot password"
-- wrongly sent a reset email instead of nudging to Google). Detection now reads
-- auth.identities — the real record of which providers a user has — instead of
-- the cached profiles.signup_method column, and backfills that column.
--
-- Verify after running:
--   select get_auth_method_by_email('gauresh2@illinois.edu');   -- expect 'google' if Google-only
--   select id, email, signup_method from public.profiles where email = 'gauresh2@illinois.edu';
-- ─────────────────────────────────────────────────────────────────────────────

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

  RETURN (SELECT signup_method FROM public.profiles WHERE id = uid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_auth_method_by_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_auth_method_by_email(TEXT) TO authenticated;

-- Backfill the cached column so the settings badge is accurate too.
UPDATE public.profiles p
SET signup_method = 'google'
FROM auth.identities i
WHERE i.user_id = p.id
  AND i.provider = 'google'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities e WHERE e.user_id = p.id AND e.provider = 'email'
  )
  AND p.signup_method IS DISTINCT FROM 'google';
