/**
 * Supabase-backed auth service.
 * Replaces userDirectory.ts — same ApiResult<T> shape so app/auth.tsx needs
 * only minimal changes (import path + a few call sites).
 */
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { Platform } from 'react-native';
import { supabase, WARRANTY_DOCUMENTS_BUCKET } from '../lib/supabase';
import type { ProfileRow } from '../lib/supabase';
import type { User } from '../store/auth';

WebBrowser.maybeCompleteAuthSession();

export type { User };

type ApiResult<T> = { data: T | null; error: string | null };
type AuthMethod = 'email' | 'google' | 'apple' | null;

export type RegisterInput = {
  name:             string;
  email:            string;
  phone:            string;
  recoveryEmail:    string;
  recoveryPhone:    string;
  dateOfBirth:      string;
  password:         string;
  securityQuestion: string;
  securityAnswer:   string;
  signupMethod?:    'email' | 'google' | 'apple';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function profileToUser(supabaseUser: { id: string; email?: string }, profile: ProfileRow): User {
  return {
    id:               supabaseUser.id,
    name:             profile.name,
    email:            supabaseUser.email || profile.email || '',
    phone:            profile.phone,
    dateOfBirth:      profile.date_of_birth || '',
    photoUri:         profile.photo_url,
    signupMethod:     profile.signup_method,
    securityQuestion: profile.security_question,
    accountType:      profile.account_type,
    createdAt:        profile.created_at,
  };
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data ?? null;
}

async function ensureProfileForAuthUser(supabaseUser: { id: string; email?: string; user_metadata?: Record<string, any> }): Promise<ProfileRow | null> {
  const existing = await fetchProfile(supabaseUser.id);
  if (existing) return existing;

  const metadata = supabaseUser.user_metadata || {};
  const email = supabaseUser.email || metadata.email || '';
  const name = metadata.name || metadata.full_name || email.split('@')[0] || 'Warret User';

  const profilePayload = {
    id: supabaseUser.id,
    email,
    name,
    phone: metadata.phone || '',
    recovery_email: metadata.recovery_email || '',
    recovery_phone: metadata.recovery_phone || '',
    date_of_birth: normalizeDateInput(metadata.date_of_birth || ''),
    security_question: metadata.security_question || '',
    security_answer_hash: metadata.security_answer_hash || '',
    account_type: 'free',
    signup_method: 'email',
    onboarding_done: false,
  };

  const { error } = await supabase.from('profiles').upsert(profilePayload);
  if (error) {
    const { email: _email, ...legacyProfilePayload } = profilePayload;
    const legacyResult = await supabase.from('profiles').upsert(legacyProfilePayload);
    if (legacyResult.error) return null;
  }
  return fetchProfile(supabaseUser.id);
}

async function hashSecurityAnswer(answer: string): Promise<string> {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) return '';

  if (globalThis.crypto?.subtle) {
    const encoded = new TextEncoder().encode(normalized);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  return `legacy:${normalized}`;
}

function normalizeDateInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    const day = dd.padStart(2, '0');
    const month = mm.padStart(2, '0');
    const normalized = `${yyyy}-${month}-${day}`;
    const date = new Date(`${normalized}T00:00:00`);
    if (
      Number.isFinite(date.getTime()) &&
      date.getFullYear() === Number(yyyy) &&
      date.getMonth() + 1 === Number(month) &&
      date.getDate() === Number(day)
    ) {
      return normalized;
    }
  }

  return null;
}

function emailRedirectTo(): string | undefined {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/auth`;
  }
  return undefined;
}

export async function lookupAuthMethod(email: string): Promise<AuthMethod> {
  const { data, error } = await supabase.rpc('get_auth_method_by_email', {
    lookup_email: email.trim().toLowerCase(),
  });
  if (error) return null;
  return data === 'email' || data === 'google' || data === 'apple' ? data : null;
}

// ─── Auth actions ─────────────────────────────────────────────────────────────

/**
 * Sign in with email + password.
 * Returns the app User on success, or a human-readable error string.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<ApiResult<{ user: User; onboardingDone: boolean }>> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
      return { data: null, error: '__not_verified__' };
    }
    if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('wrong')) {
      return { data: null, error: 'Wrong password. Check caps lock and try again.' };
    }
    return { data: null, error: 'No account found with that email address.' };
  }

  const profile = await ensureProfileForAuthUser(data.user);
  if (!profile) return { data: null, error: 'Profile not found. Please contact support.' };

  return {
    data: {
      user:           profileToUser(data.user, profile),
      onboardingDone: profile.onboarding_done,
    },
    error: null,
  };
}

/**
 * Create a new account. Supabase sends a verification email automatically.
 * Returns the new user's email + userId so the verification screen can display them.
 */
export async function register(
  input: RegisterInput,
): Promise<ApiResult<{ email: string; userId: string }>> {
  const securityAnswerHash = await hashSecurityAnswer(input.securityAnswer);
  const email = input.email.trim().toLowerCase();
  const dateOfBirth = normalizeDateInput(input.dateOfBirth);
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: emailRedirectTo(),
      data: {
        email,
        name:                 input.name.trim(),
        phone:                input.phone?.trim() || '',
        recovery_email:       input.recoveryEmail?.trim() || '',
        recovery_phone:       input.recoveryPhone?.trim() || '',
        date_of_birth:        dateOfBirth,
        security_question:    input.securityQuestion || '',
        security_answer_hash: securityAnswerHash,
        signup_method:        input.signupMethod || 'email',
      },
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('unique')) {
      return { data: null, error: '__account_exists__' };
    }
    return { data: null, error: error.message };
  }

  if (!data.user) return { data: null, error: 'Registration failed. Please try again.' };
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { data: null, error: '__account_exists__' };
  }

  return {
    data: {
      email:  input.email.trim().toLowerCase(),
      userId: data.user.id,
    },
    error: null,
  };
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Permanently delete the current user's account and all their data.
 * Calls the server-side delete_own_account() RPC (SECURITY DEFINER), which
 * removes the auth user + cascades all owned rows + purges storage files.
 * On success the session is signed out locally.
 */
export async function deleteAccount(): Promise<ApiResult<void>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: 'You are not signed in.' };
    const uid = session.user.id;

    // Purge storage files via the Storage API FIRST. Storage objects can't be
    // deleted from SQL (Supabase blocks direct DELETE on storage.objects), and
    // we must do it while the session is still valid — before the auth user is
    // removed. Applies to both the RPC and fallback paths.
    await purgeOwnStorage(uid);

    // Preferred path: full server-side deletion (also removes the auth.users
    // credential so the email can be reused).
    const { error } = await supabase.rpc('delete_own_account');

    if (error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message))) {
      return {
        data: null,
        error: 'Full account deletion needs the delete_own_account Supabase migration. Until then, your auth login will remain active.',
      };
    }

    if (error) return { data: null, error: error.message };

    // Full deletion succeeded — clear the local session (non-fatal if it fails).
    await supabase.auth.signOut().catch(() => {});
    return { data: null, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message || 'Could not delete account. Check your connection and try again.' };
  }
}

/**
 * Best-effort purge of a user's warranty files via the Storage API.
 * (storage.objects can't be deleted from SQL, so this must run client-side.)
 * Layout is uid/<productId>/<file>, so we list folders then their files.
 */
async function purgeOwnStorage(uid: string): Promise<void> {
  try {
    const { data: folders } = await supabase.storage.from(WARRANTY_DOCUMENTS_BUCKET).list(uid);
    for (const folder of folders ?? []) {
      const { data: files } = await supabase.storage
        .from(WARRANTY_DOCUMENTS_BUCKET)
        .list(`${uid}/${folder.name}`);
      const paths = (files ?? []).map((f) => `${uid}/${folder.name}/${f.name}`);
      if (paths.length) await supabase.storage.from(WARRANTY_DOCUMENTS_BUCKET).remove(paths);
    }
  } catch {
    // Best-effort; orphaned files stay scoped to this uid's RLS folder.
  }
}

/**
 * Delete all of a user's DB rows using only RLS-permitted client deletes.
 * Used as a fallback when the admin delete_own_account() RPC isn't deployed.
 * (Storage is purged separately by purgeOwnStorage before this runs.)
 * Returns null on success or an error string if a critical delete failed.
 */
async function wipeOwnAccountData(uid: string): Promise<string | null> {
  // Delete owned DB rows (RLS "Users manage own ..." FOR ALL policies).
  await supabase.from('group_members').delete().eq('user_id', uid);
  const products   = await supabase.from('products').delete().eq('user_id', uid);
  const categories = await supabase.from('product_categories').delete().eq('user_id', uid);
  const profile    = await supabase.from('profiles').delete().eq('id', uid);

  const failed = [products.error, categories.error, profile.error].find(Boolean);
  if (failed) return failed.message;
  return null;
}

/**
 * Set a new password for the currently authenticated recovery session.
 * Only valid after the user clicked a password-reset email link.
 */
export async function updatePassword(newPassword: string): Promise<ApiResult<void>> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

/**
 * Send a password reset email only for manual email/password accounts.
 * OAuth-only users should return to their OAuth provider instead of creating
 * a password from the public forgot-password screen.
 */
export async function resetPassword(email: string): Promise<ApiResult<string>> {
  const normalizedEmail = email.trim().toLowerCase();
  const method = await lookupAuthMethod(normalizedEmail);
  if (method === 'google') return { data: null, error: '__use_google__' };
  if (method === 'apple') return { data: null, error: '__use_apple__' };

  // Web: return to app root (tokens land in the URL hash). Native: deep-link
  // back into the app via the warret:// scheme so the reset can complete in-app.
  const redirectTo = Platform.OS === 'web'
    ? (typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/` : undefined)
    : makeRedirectUri({ path: 'reset-password' });
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo,
  });
  if (error) return { data: null, error: error.message };
  return { data: 'Password reset email sent.', error: null };
}

/**
 * Resend the Supabase verification email.
 */
export async function resendVerification(email: string): Promise<ApiResult<string>> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: emailRedirectTo() },
  });
  if (error) return { data: null, error: error.message };
  return { data: 'Verification email resent.', error: null };
}

/**
 * Update editable profile fields for the current user.
 */
export async function updateProfile(
  userId: string,
  updates: Partial<Pick<ProfileRow, 'name' | 'phone' | 'photo_url' | 'onboarding_done' | 'recovery_email' | 'recovery_phone'>>,
): Promise<ApiResult<User>> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) return { data: null, error: error.message };

  const { data: { user: supaUser } } = await supabase.auth.getUser();
  const profile = await fetchProfile(userId);
  if (!supaUser || !profile) return { data: null, error: 'Could not reload profile.' };

  return { data: profileToUser(supaUser, profile), error: null };
}

/**
 * Fetch the current session's User + onboardingDone from Supabase.
 * Called once on AuthProvider mount and whenever the session changes.
 */
export async function getSessionUser(): Promise<{
  user: User;
  onboardingDone: boolean;
} | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const profile = await ensureProfileForAuthUser(session.user);
  if (!profile) return null;

  return {
    user:           profileToUser(session.user, profile),
    onboardingDone: profile.onboarding_done,
  };
}

export { fetchProfile, profileToUser };

/**
 * Turn the deep-link return URL into a Supabase session.
 * Returns null on success, '__PASSWORD_RECOVERY__' for reset-link callbacks,
 * or an error string on failure.
 */
export async function createSessionFromUrl(url: string): Promise<string | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) return errorCode;

  // Implicit flow — tokens arrive directly in the URL hash.
  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token:  params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) return error.message;
    // Explicit recovery signal so the caller can route to the reset form
    // without relying on onAuthStateChange event timing.
    if (params.type === 'recovery') return '__PASSWORD_RECOVERY__';
    return null;
  }

  // PKCE fallback (kept in case flowType is switched back).
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    return error ? error.message : null;
  }

  return 'Sign-in did not return a valid session.';
}

/**
 * Sign in with Google via Supabase OAuth (implicit flow).
 * Web: full-page redirect — tokens land in the URL hash and are exchanged
 * by the hydration step in AuthProvider. Native: WebBrowser + hash exchange.
 */
export async function signInWithGoogle(): Promise<ApiResult<void>> {
  // ── Web ───────────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/`
      : undefined;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { data: null, error: error?.message ?? 'Could not start Google sign-in.' };
    if (typeof window !== 'undefined') window.location.assign(data.url);
    return { data: null, error: null };
  }

  // ── Native (iOS / Android) ────────────────────────────────────────────────
  const redirectTo = makeRedirectUri({ path: 'auth/callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    return { data: null, error: error?.message ?? 'Could not start Google sign-in.' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { data: null, error: 'Sign-in cancelled.' };
  }

  if (result.type === 'success') {
    const sessionError = await createSessionFromUrl(result.url);
    if (sessionError) return { data: null, error: sessionError };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: 'Signed in but no session was created. Please try again.' };
    return { data: null, error: null };
  }

  return { data: null, error: 'Google sign-in failed. Please try again.' };
}
