-- WARRET — Migration 005: group security hardening
--
-- Run once in Supabase SQL Editor after migrations 003/004.
-- Safe to re-run.
--
-- Fixes:
--   1. Direct inserts into group_members can no longer bypass invite tokens,
--      passcodes, locked groups, or host promotion. The only direct insert left
--      is the first host member row for a newly created group.
--   2. Members can only share products they own into a group.
--   3. group_products SELECT is privacy-aware, so private/custom product IDs do
--      not leak to members who cannot view the product.

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

DROP POLICY IF EXISTS "User inserts own member row" ON public.group_members;
DROP POLICY IF EXISTS "Creator inserts initial host member row" ON public.group_members;

CREATE POLICY "Creator inserts initial host member row"
  ON public.group_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'host'
    AND public.group_has_no_members(group_id)
  );

DROP POLICY IF EXISTS "Members read group_products" ON public.group_products;
DROP POLICY IF EXISTS "Hosts and adders add products" ON public.group_products;

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
