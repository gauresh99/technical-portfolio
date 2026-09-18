/**
 * Supabase client — single instance shared across the entire app.
 * Auth callback URLs are handled explicitly in src/store/auth.tsx so recovery
 * links can route to the reset-password screen before the app hydrates.
 * Native stores sessions in AsyncStorage; web uses the Supabase web default.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const WARRANTY_DOCUMENTS_BUCKET = 'warranty-documents';

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.',
  );
}

const isWeb = Platform.OS === 'web';

const supabaseFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (typeof Response === 'undefined') throw error;

    const message = error instanceof Error ? error.message : 'Network request failed';
    return new Response(
      JSON.stringify({
        message: 'Supabase network request failed.',
        error: message,
        code: 'network_unavailable',
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};

export const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseAnonKey || 'missing-anon-key',
  {
    global: {
      fetch: supabaseFetch,
    },
    auth: {
      storage:            isWeb ? undefined : AsyncStorage,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: false,
      flowType:           'implicit',
    },
  },
);

// ─── Row types (mirror the DB schema exactly) ─────────────────────────────────

export type ProfileRow = {
  id:                   string;
  email:                string;
  name:                 string;
  phone:                string;
  recovery_email:       string;
  recovery_phone:       string;
  date_of_birth:        string | null;
  photo_url:            string;
  signup_method:        'email' | 'google' | 'apple';
  security_question:    string;
  security_answer_hash: string;
  account_type:         'free' | 'pro';
  onboarding_done:      boolean;
  created_at:           string;
  updated_at:           string;
};

export type ProductRow = {
  id:             string;
  user_id:        string;
  name:           string;
  brand:          string;
  type:           string;
  warranty_start: string | null;
  warranty_end:   string | null;
  date_added:     string | null;
  serial_number:  string | null;
  seller:         string | null;
  keywords:       string[];
  reminders:      string[];
  docs:           string[];
  doc_entries:    any[];
  support:        { site: string; phone: string; method: string };
  extended:       { plan: string; provider: string; expires: string } | null;
  coverage:       { included: string[]; excluded: string[] };
  steps:          string[];
  personal:       boolean;
  group_id:       string | null;
  created_at:     string;
  updated_at:     string;
};

export type ProductCategoryRow = {
  id:          string;
  user_id:     string;
  name:        string;
  product_ids: string[];
  created_at:  string;
};

export type GroupRow = {
  id:               string;
  name:             string;
  description:      string;
  invite_token:     string;
  merge_all_to_main: boolean;
  settings:         any;
  created_at:       string;
};

export type GroupMemberRow = {
  id:        string;
  group_id:  string;
  user_id:   string | null;
  name:      string;
  role:      'host' | 'adder' | 'viewer';
  color:     string;
  joined_at: string;
};

export type GroupProductRow = {
  id:                string;
  group_id:          string;
  product_id:        string;
  added_by_id:       string | null;
  privacy:           'public' | 'private' | 'custom';
  custom_viewer_ids: string[];
  merged_to_main:    boolean;
};

export type GroupActivityRow = {
  id:          string;
  group_id:    string;
  type:        string;
  actor_id:    string | null;
  actor_name:  string | null;
  target_id:   string | null;
  target_name: string | null;
  meta:        string | null;
  timestamp:   string;
};
