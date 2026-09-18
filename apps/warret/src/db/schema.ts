/**
 * Warret — database schema definitions
 *
 * This file is the single source of truth for table shapes.
 * When connecting to Supabase: mirror these types as SQL tables in the
 * Supabase SQL editor.  Row Level Security policies should restrict every
 * table so that users can only read/write their own rows (auth.uid() = user_id).
 *
 * SQL migration to paste into Supabase:
 * ─────────────────────────────────────────────────────────────────────────────
 * create table warret_users (
 *   id                uuid primary key default gen_random_uuid(),
 *   email             text unique not null,
 *   name              text not null,
 *   phone             text,
 *   date_of_birth     date,
 *   photo_url         text,
 *   signup_method     text not null default 'email',   -- 'email' | 'google' | 'apple'
 *   security_question text,
 *   security_answer   text,                            -- store bcrypt hash, never plaintext
 *   account_type      text not null default 'free',    -- 'free' | 'pro'
 *   created_at        timestamptz default now(),
 *   updated_at        timestamptz default now()
 * );
 *
 * create table warret_products (
 *   id               uuid primary key,
 *   user_id          uuid references warret_users(id) on delete cascade,
 *   name             text not null,
 *   brand            text,
 *   status           text,
 *   warranty_start   date,
 *   warranty_end     date,
 *   expires          text,
 *   date_added       text,
 *   type             text,
 *   category         text,
 *   serial_number    text,
 *   seller           text,
 *   personal         boolean default true,
 *   group_id         uuid,
 *   keywords         text[],
 *   docs             text[],
 *   support          jsonb,
 *   coverage         jsonb,
 *   steps            text[],
 *   reminders        text[],
 *   doc_entries      jsonb,
 *   created_at       timestamptz default now(),
 *   updated_at       timestamptz default now()
 * );
 *
 * create table warret_groups (
 *   id               uuid primary key,
 *   user_id          uuid references warret_users(id) on delete cascade,
 *   name             text not null,
 *   description      text,
 *   invite_token     text,
 *   merge_all        boolean default false,
 *   settings         jsonb,
 *   created_at       timestamptz default now(),
 *   updated_at       timestamptz default now()
 * );
 *
 * create table warret_group_members (
 *   id        uuid primary key default gen_random_uuid(),
 *   group_id  uuid references warret_groups(id) on delete cascade,
 *   user_id   uuid references warret_users(id) on delete cascade,
 *   role      text not null,  -- 'host' | 'adder' | 'viewer'
 *   name      text not null,
 *   color     text,
 *   joined_at date
 * );
 *
 * create table warret_group_products (
 *   id                uuid primary key default gen_random_uuid(),
 *   group_id          uuid references warret_groups(id) on delete cascade,
 *   product_id        uuid references warret_products(id) on delete cascade,
 *   added_by          uuid references warret_users(id),
 *   privacy           text default 'public',
 *   custom_viewer_ids uuid[],
 *   merged_to_main    boolean default true
 * );
 *
 * create table warret_documents (
 *   id          uuid primary key default gen_random_uuid(),
 *   user_id     uuid references warret_users(id) on delete cascade,
 *   product_id  uuid references warret_products(id) on delete cascade,
 *   file_name   text not null,
 *   s3_key      text,         -- AWS S3 object key
 *   mime_type   text,
 *   size_bytes  bigint,
 *   label       text,
 *   expiry      date,
 *   created_at  timestamptz default now()
 * );
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DBUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  date_of_birth: string | null;
  photo_url: string | null;
  signup_method: 'email' | 'google' | 'apple';
  security_question: string | null;
  security_answer: string | null;
  account_type: 'free' | 'pro';
  created_at: string;
  updated_at: string;
};

export type DBProduct = {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  status: string;
  warranty_start: string | null;
  warranty_end: string | null;
  expires: string;
  date_added: string;
  type: string;
  category: string | null;
  serial_number: string | null;
  seller: string | null;
  personal: boolean;
  group_id: string | null;
  keywords: string[];
  docs: string[];
  support: Record<string, string>;
  coverage: { included: string[]; excluded: string[] };
  steps: string[];
  reminders: string[];
  doc_entries: Array<{ label: string; fileName: string; expiry: string; uri?: string; mimeType?: string }> | null;
  created_at: string;
  updated_at: string;
};

export type DBDocument = {
  id: string;
  user_id: string;
  product_id: string;
  file_name: string;
  s3_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  label: string | null;
  expiry: string | null;
  created_at: string;
};

export const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your primary school?",
  "What was your childhood nickname?",
  "What is the name of the street you grew up on?",
  "What was the make of your first car?",
] as const;

export type SecurityQuestion = typeof SECURITY_QUESTIONS[number];
