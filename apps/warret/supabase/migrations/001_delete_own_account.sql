-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: account self-deletion
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query →
-- paste → Run). Safe to re-run — it uses CREATE OR REPLACE.
--
-- After running, verify with:
--   select proname from pg_proc where proname = 'delete_own_account';
-- (should return one row)
-- ─────────────────────────────────────────────────────────────────────────────

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
