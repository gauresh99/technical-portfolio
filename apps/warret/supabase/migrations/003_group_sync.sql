-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: cross-device group join + realtime sync
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query →
-- paste → Run). Safe to re-run — CREATE OR REPLACE + idempotent DO blocks.
--
-- What this adds:
--   1. get_group_join_info(...)    — invite-link preview for NON-members.
--      RLS blocks non-members from reading the groups row, which is why join
--      previously failed on any device other than the host's. SECURITY DEFINER
--      bypasses RLS but only after the invite token matches, and never returns
--      the passcode — only whether one is required.
--   2. join_group_with_token(...)  — server-side join. Validates the token,
--      the locked flag and the passcode ON THE SERVER, so the passcode never
--      leaves the database. Never allows self-service 'host' joins.
--   3. Adds the group tables to the supabase_realtime publication so members
--      receive postgres_changes events (RLS still applies to what each user
--      can see).
--
-- After running, verify with:
--   select proname from pg_proc
--   where proname in ('get_group_join_info', 'join_group_with_token');
-- (should return two rows)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Invite-link preview ──────────────────────────────────────────────────
-- Returns group name/description + join requirements for a valid invite link.
-- Wrong group id or wrong token → zero rows (caller sees null; no existence
-- oracle beyond what the invite link itself already proves).
-- Leaks: name, description, locked flag, whether a passcode exists, member
-- count — only to an authenticated caller who already holds a valid link.
-- Never leaks: the passcode value or anything else in settings.
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
    COALESCE(g.settings->>'passcode', '') <> '',
    (SELECT COUNT(*)::INT FROM public.group_members gm WHERE gm.group_id = g.id)
  FROM public.groups g
  WHERE g.id = p_group_id
    AND g.invite_token = p_token
    AND auth.uid() IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_group_join_info(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_group_join_info(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_group_join_info(TEXT, TEXT) TO authenticated;

-- ─── 2. Server-side join ─────────────────────────────────────────────────────
-- Status returned as TEXT: 'ok' | 'already-member' | 'invalid-link' | 'locked'
-- | 'wrong-passcode' (mirrors the client JoinResult union in src/store/groups.tsx).
-- Security properties:
--   • SECURITY DEFINER + fixed search_path = public.
--   • auth.uid() required — anon cannot execute (revoked below) and the
--     function raises if somehow called without a JWT.
--   • Token must equal the group's invite_token (primary-key lookup first).
--   • p_role restricted to 'adder' | 'viewer'; anything else — including
--     'host' — is coerced to 'viewer'. Hosts are only created via createGroup
--     or promoted by an existing host.
--   • Passcode compared server-side; the stored value is never returned.
--   • Member colors mirror MEMBER_COLORS in src/data/groups.ts.
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
  v_count     INT;
  v_member_id TEXT;
  v_name      TEXT;
  -- Keep in sync with MEMBER_COLORS in src/data/groups.ts
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

  -- Self-service host join is never allowed; unknown roles downgrade to viewer.
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

  v_passcode := COALESCE(grp.settings->>'passcode', '');
  IF v_passcode <> '' AND v_passcode IS DISTINCT FROM COALESCE(p_passcode, '') THEN
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
    -- Concurrent join from another device raced us — treat as already joined.
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

-- ─── 3. Realtime publication ─────────────────────────────────────────────────
-- The client subscribes to postgres_changes on these tables (src/store/groups.tsx).
-- Tables must be in the supabase_realtime publication for events to flow.
-- RLS still applies: users only receive events for rows they can SELECT.
-- Each ALTER is wrapped so re-running the migration is a no-op.
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
