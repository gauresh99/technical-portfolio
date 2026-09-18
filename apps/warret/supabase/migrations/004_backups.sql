-- ============================================================
-- WARRET — Migration 004: cloud backups
-- Stores versioned JSON snapshots of a user's local wallet data
-- (products, categories, settings). The app keeps the newest 10
-- per user by deleting older rows client-side after each insert.
-- Run in the Supabase SQL Editor after 001-003.
-- ============================================================

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

-- ─── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own backups"   ON public.backups;
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

-- Intentionally NO update policy: backups are immutable snapshots.
-- Users can only create new ones or delete old ones.
