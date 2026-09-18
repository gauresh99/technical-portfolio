-- WARRET — Migration 006: hash group passcodes
--
-- Safe to re-run after migration 005.
-- Adds a host-only RPC for setting/removing passcodes and updates join RPCs
-- to compare bcrypt hashes. Legacy plaintext passcodes continue to work until
-- a host changes/removes the passcode, at which point plaintext is deleted.

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

CREATE OR REPLACE FUNCTION public.join_group_with_token(
  p_group_id TEXT,
  p_token    TEXT,
  p_name     TEXT,
  p_role     TEXT,
  p_passcode TEXT DEFAULT ''
)
RETURNS TEXT AS $$
DECLARE
  uid             UUID := auth.uid();
  grp             public.groups%ROWTYPE;
  v_role          TEXT;
  v_passcode      TEXT;
  v_passcode_hash TEXT;
  v_count         INT;
  v_member_id     TEXT;
  v_name          TEXT;
  colors          TEXT[] := ARRAY[
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
