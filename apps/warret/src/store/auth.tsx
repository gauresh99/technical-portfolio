import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { createSessionFromUrl, getSessionUser, updateProfile } from '../services/supabase-auth';

export type User = {
  id:               string;
  name:             string;
  email:            string;
  phone:            string;
  dateOfBirth:      string;
  photoUri:         string;
  signupMethod:     'email' | 'google' | 'apple';
  securityQuestion: string;
  accountType:      'free' | 'pro';
  createdAt:        string;
};

type AuthContextValue = {
  user:                User | null;
  loaded:              boolean;
  onboardingDone:      boolean;
  hasLoggedInBefore:   boolean;
  isPasswordRecovery:  boolean;
  login:               (user: User, nextOnboardingDone?: boolean) => Promise<void>;
  logout:              () => Promise<void>;
  markOnboardingDone:  () => Promise<void>;
  updateUser:          (updates: Partial<User>) => Promise<void>;
  clearPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const SESSION_LOOKUP_TIMEOUT_MS = 3500;

function getSessionUserWithTimeout() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    getSessionUser(),
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), SESSION_LOOKUP_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,                setUser]                = useState<User | null>(null);
  const [loaded,              setLoaded]              = useState(false);
  const [onboardingDone,      setOnboardingDone]      = useState(false);
  const [hasLoggedInBefore,   setHasLoggedInBefore]   = useState(false);
  const [isPasswordRecovery,  setIsPasswordRecovery]  = useState(false);

  useEffect(() => {
    let mounted = true;

    // Process a deep-link / callback URL (password reset or OAuth) into a session.
    // Returns true if it was a recovery link (so the caller can stop early).
    const processCallbackUrl = async (url: string): Promise<boolean> => {
      try {
        const sessionError = await createSessionFromUrl(url);
        if (sessionError === '__PASSWORD_RECOVERY__') {
          setIsPasswordRecovery(true);
          return true;
        }
        if (sessionError) console.warn('Auth callback error:', sessionError);
      } catch (error) {
        console.warn('Auth callback failed:', error);
      }
      return false;
    };

    // Hydrate from the current session immediately
    const hydrate = async () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hasOAuthParams = window.location.search.includes('code=') || window.location.hash.includes('access_token=');
        const hasOAuthError = window.location.search.includes('error=') || window.location.hash.includes('error=');
        if (hasOAuthParams) {
          const isRecovery = await processCallbackUrl(window.location.href);
          window.history.replaceState({}, document.title, '/');
          if (isRecovery) { setLoaded(true); return; }
        } else if (hasOAuthError) {
          // OAuth was cancelled or denied — clear the params so a reload is clean.
          window.history.replaceState({}, document.title, '/');
        }
      } else if (Platform.OS !== 'web') {
        // Native cold start: a reset/OAuth link may have launched the app.
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && (initialUrl.includes('access_token=') || initialUrl.includes('code=') || initialUrl.includes('type=recovery'))) {
          const isRecovery = await processCallbackUrl(initialUrl);
          if (isRecovery) { setLoaded(true); return; }
        }
      }

      try {
        const result = await getSessionUserWithTimeout();
        if (!mounted) return;
        if (result) {
          setUser(result.user);
          setOnboardingDone(result.onboardingDone);
          setHasLoggedInBefore(true);
        }
      } catch (error) {
        console.warn('Auth hydration failed:', error);
      } finally {
        if (mounted) setLoaded(true);
      }
    };
    hydrate();

    // Native runtime: handle reset/OAuth links that arrive while the app is open.
    let linkingSub: { remove: () => void } | undefined;
    if (Platform.OS !== 'web') {
      linkingSub = Linking.addEventListener('url', ({ url }) => {
        if (url.includes('access_token=') || url.includes('code=') || url.includes('type=recovery')) {
          processCallbackUrl(url);
        }
      });
    }

    // Stay in sync with Supabase auth events (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked a password reset link — route them to the reset form, not the app
        setIsPasswordRecovery(true);
        return;
      }
      if (!session) {
        setUser(null);
        setOnboardingDone(false);
        setIsPasswordRecovery(false);
        return;
      }
      try {
        const result = await getSessionUserWithTimeout();
        if (result) {
          setUser(result.user);
          setOnboardingDone(result.onboardingDone);
          setHasLoggedInBefore(true);
        }
      } catch (error) {
        console.warn('Auth session refresh failed:', error);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      linkingSub?.remove();
    };
  }, []);

  // Kept for backward-compat — Supabase onAuthStateChange already fires after
  // signInWithPassword, so callers don't need to call login() manually.
  const login = useCallback(async (newUser: User, nextOnboardingDone = false) => {
    setUser(newUser);
    setOnboardingDone(nextOnboardingDone);
    setHasLoggedInBefore(true);
    if (nextOnboardingDone) {
      await supabase.from('profiles').update({ onboarding_done: true }).eq('id', newUser.id);
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    // State is cleared by the onAuthStateChange listener above
  }, []);

  const markOnboardingDone = useCallback(async () => {
    setOnboardingDone(true);
    if (user) {
      await supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id);
    }
  }, [user]);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!user) return;
    const profileUpdates: Record<string, any> = {};
    if (updates.name     !== undefined) profileUpdates.name      = updates.name;
    if (updates.phone    !== undefined) profileUpdates.phone     = updates.phone;
    if (updates.photoUri !== undefined) profileUpdates.photo_url = updates.photoUri;

    const { data: updated } = await updateProfile(user.id, profileUpdates);
    if (updated) setUser(updated);
    else         setUser((prev) => prev ? { ...prev, ...updates } : prev);
  }, [user]);

  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  const value = useMemo<AuthContextValue>(() => ({
    user, loaded, onboardingDone, hasLoggedInBefore, isPasswordRecovery,
    login, logout, markOnboardingDone, updateUser, clearPasswordRecovery,
  }), [user, loaded, onboardingDone, hasLoggedInBefore, isPasswordRecovery, login, logout, markOnboardingDone, updateUser, clearPasswordRecovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Kept for any callers that construct a User object manually
export function buildUser(
  name: string, email: string, phone: string,
  dateOfBirth: string, securityQuestion: string,
  signupMethod: User['signupMethod'] = 'email',
): User {
  return {
    id: `u_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`,
    name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(),
    dateOfBirth, photoUri: '', signupMethod, securityQuestion,
    accountType: 'free', createdAt: new Date().toISOString(),
  };
}
