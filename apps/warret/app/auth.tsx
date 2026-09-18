import { useMemo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../src/store/auth';
import { F } from '../src/theme/fonts';
import { SECURITY_QUESTIONS } from '../src/db/schema';
import { useAppTheme } from '../src/store/theme';
import { lookupAuthMethod, register, resendVerification, resetPassword, signIn, signInWithGoogle } from '../src/services/supabase-auth';

// ─── constants ────────────────────────────────────────────────────────────────
const purple = '#5B4DF0';
const clamp  = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const isPhone = (s: string) => /^\+\d{10,15}$/.test(s.trim());

// ─── Password strength ────────────────────────────────────────────────────────
const PW_CHECKS = [
  { key: 'len',    label: '8+ characters',    re: /^.{8,}$/ },
  { key: 'upper',  label: 'Uppercase letter',  re: /[A-Z]/ },
  { key: 'lower',  label: 'Lowercase letter',  re: /[a-z]/ },
  { key: 'number', label: 'Number (0–9)',      re: /\d/ },
  { key: 'symbol', label: 'Symbol (!@#...)',   re: /[^A-Za-z0-9]/ },
] as const;

function passwordStrength(pw: string) {
  return PW_CHECKS.map((c) => ({ ...c, ok: c.re.test(pw) }));
}
function isPasswordStrong(pw: string) {
  return PW_CHECKS.every((c) => c.re.test(pw));
}

function PasswordStrengthBar({ password, colors }: { password: string; colors: any }) {
  const checks = useMemo(() => passwordStrength(password), [password]);
  const passed = checks.filter((c) => c.ok).length;
  const barColor = passed <= 1 ? '#FF5A62' : passed <= 3 ? '#F59E0B' : '#22C55E';

  if (!password) return null;
  return (
    <View style={pw.wrap}>
      {/* Strength bar */}
      <View style={[pw.trackRow, { backgroundColor: colors.border }]}>
        <View style={[pw.fill, { width: `${(passed / 5) * 100}%` as any, backgroundColor: barColor }]} />
      </View>
      {/* Criteria grid */}
      <View style={pw.grid}>
        {checks.map((c) => (
          <View key={c.key} style={pw.chip}>
            <Ionicons
              name={c.ok ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={c.ok ? '#22C55E' : colors.muted}
            />
            <Text style={[pw.chipText, { color: c.ok ? '#22C55E' : colors.muted }]}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const pw = StyleSheet.create({
  wrap:     { marginTop: 6, marginBottom: 4 },
  trackRow: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 },
  fill:     { height: '100%', borderRadius: 2 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipText: { fontSize: 11, fontWeight: '500', fontFamily: F.i500 },
});

// ─── Generic field ────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, secure, keyboard, error, hint, optional,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; secure?: boolean; keyboard?: any;
  error?: string; hint?: string; optional?: boolean;
}) {
  const [show, setShow] = useState(false);
  const { colors } = useAppTheme();
  return (
    <View style={f.wrap}>
      <View style={f.labelRow}>
        <Text style={[f.label, { color: colors.muted }]}>{label}</Text>
        {optional && <Text style={[f.optional, { color: colors.muted }]}>optional</Text>}
      </View>
      <View style={[f.row, { backgroundColor: colors.input, borderColor: error ? '#FF5A62' : colors.border }]}>
        <TextInput
          style={[f.input, { color: colors.text }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secure && !show}
          keyboardType={keyboard}
          autoCapitalize={
            secure || keyboard === 'email-address' || keyboard === 'phone-pad' || keyboard === 'numbers-and-punctuation'
              ? 'none' : 'sentences'
          }
          autoCorrect={false}
        />
        {secure ? (
          <Pressable onPress={() => setShow((s) => !s)} style={f.eyeBtn}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={f.error}>{error}</Text> : null}
      {hint && !error ? <Text style={[f.hint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const f = StyleSheet.create({
  wrap:     { marginBottom: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label:    { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: F.i700 },
  optional: { fontSize: 11, fontWeight: '600', fontFamily: F.i600 },
  row:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 50 },
  input:    { flex: 1, fontSize: 16, fontWeight: '600', outlineStyle: 'solid', outlineWidth: 0, fontFamily: F.i600 },
  eyeBtn:   { padding: 6 },
  error:    { fontSize: 12, fontWeight: '700', color: '#FF5A62', marginTop: 4, fontFamily: F.i700 },
  hint:     { fontSize: 11, fontWeight: '600', marginTop: 3, fontFamily: F.i600 },
});

// ─── Security question picker ─────────────────────────────────────────────────
function QuestionPicker({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string; onSelect: (q: string) => void; onClose: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={qp.backdrop} onPress={onClose} />
      <View style={[qp.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <View style={[qp.handle, { backgroundColor: colors.border }]} />
        <Text style={[qp.title, { color: colors.text }]}>Security question</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {SECURITY_QUESTIONS.map((q) => (
            <Pressable
              key={q}
              onPress={() => { onSelect(q); onClose(); }}
              style={[qp.option, selected === q && { backgroundColor: colors.soft }, { borderColor: colors.border }]}
            >
              <Text style={[qp.optText, { color: colors.text }, selected === q && { color: purple }]}>{q}</Text>
              {selected === q ? <Ionicons name="checkmark" size={16} color={purple} /> : null}
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onClose} style={[qp.cancel, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Text style={[qp.cancelText, { color: colors.muted }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const qp = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, padding: 22, paddingBottom: 40, maxHeight: '75%' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  title:      { fontSize: 20, fontWeight: '900', marginBottom: 16, fontFamily: F.n900 },
  option:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  optText:    { fontSize: 14, fontWeight: '700', flex: 1, paddingRight: 8, fontFamily: F.n700 },
  cancel:     { borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelText: { fontSize: 15, fontWeight: '800', fontFamily: F.n800 },
});

// ─── Social button ────────────────────────────────────────────────────────────
function SocialButton({ icon, label, onPress, isDark }: { icon: React.ReactNode; label: string; onPress: () => void; isDark: boolean }) {
  return (
    <Pressable onPress={onPress} android_ripple={null}
      style={({ pressed }) => [sb.btn, { backgroundColor: isDark ? '#1C1A25' : 'white', borderColor: isDark ? '#3A3650' : '#E5E2F4' }, pressed && { opacity: 0.7 }]}>
      {icon}
      <Text style={[sb.text, { color: isDark ? '#E8E4FF' : '#25222F' }]}>{label}</Text>
    </Pressable>
  );
}
const sb = StyleSheet.create({
  btn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 50, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12 },
  text: { fontSize: 15, fontWeight: '800', fontFamily: F.n800 },
});

function GoogleIcon() {
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E0E0' }}>
      <Text style={{ fontSize: 13, fontWeight: '900', color: '#4285F4' }}>G</Text>
    </View>
  );
}

// ─── Screen type ──────────────────────────────────────────────────────────────
type Screen = 'signin' | 'signup_1' | 'signup_2' | 'verify' | 'forgot';

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function AuthScreen() {
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useAppTheme();
  const { login, user } = useAuth();
  const cs = clamp(Math.min(width / 390, height / 844), 0.78, 1.08);
  const scrollRef = useRef<ScrollView>(null);

  const [screen,  setScreen]  = useState<Screen>('signin');
  const [loading, setLoading] = useState(false);
  const [qPickerOpen, setQPickerOpen] = useState(false);

  // Reset loading on mount so fast-refresh never carries over a stuck spinner
  useEffect(() => { setLoading(false); }, []);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user]);

  // ── Sign-in state ──────────────────────────────────────────────────────────
  const [siId,         setSiId]         = useState('');
  const [siPassword,   setSiPassword]   = useState('');
  const [siErrors,     setSiErrors]     = useState<Record<string, string>>({});
  const [siGlobal,     setSiGlobal]     = useState('');
  const [siFailCount,  setSiFailCount]  = useState(0);
  const [siLockedUntil, setSiLockedUntil] = useState(0);

  // ── Forgot password state ──────────────────────────────────────────────────
  const [fpEmail,    setFpEmail]    = useState('');
  const [fpError,    setFpError]    = useState('');
  const [fpSent,     setFpSent]     = useState(false);
  const [fpLoading,  setFpLoading]  = useState(false);
  const [fpCooldown, setFpCooldown] = useState(0);

  useEffect(() => {
    if (fpCooldown <= 0) return;
    const t = setInterval(() => setFpCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [fpCooldown]);

  useEffect(() => {
    if (siLockedUntil <= 0) return;
    const timer = setInterval(() => {
      if (Date.now() >= siLockedUntil) setSiLockedUntil(0);
    }, 1000);
    return () => clearInterval(timer);
  }, [siLockedUntil]);

  // ── Sign-up step 1 ─────────────────────────────────────────────────────────
  const [suName,     setSuName]     = useState('');
  const [suEmail,    setSuEmail]    = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm,  setSuConfirm]  = useState('');
  const [su1Errors,  setSu1Errors]  = useState<Record<string, string>>({});

  // ── Sign-up step 2 ─────────────────────────────────────────────────────────
  const [suRecoveryEmail, setSuRecoveryEmail] = useState('');
  const [suRecoveryPhone, setSuRecoveryPhone] = useState('');
  const [suDob,           setSuDob]           = useState('');
  const [suQuestion,      setSuQuestion]      = useState('');
  const [suAnswer,        setSuAnswer]        = useState('');
  const [su2Errors,       setSu2Errors]       = useState<Record<string, string>>({});
  const [signupExistingEmail, setSignupExistingEmail] = useState('');

  // ── Verification state ─────────────────────────────────────────────────────
  const [verifySentTo,   setVerifySentTo]   = useState('');
  const [verifyLoading,  setVerifyLoading]  = useState(false);
  const [verifyError,    setVerifyError]    = useState('');
  const [verifyStatus,   setVerifyStatus]   = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });

  const goToSignIn = (prefillEmail?: string) => {
    if (prefillEmail) setSiId(prefillEmail);
    setScreen('signin');
    setSiGlobal('');
    setSiErrors({});
    scrollTop();
  };

  // ── Sign in ────────────────────────────────────────────────────────────────
  const siLockSecondsLeft = siLockedUntil > 0 ? Math.ceil((siLockedUntil - Date.now()) / 1000) : 0;

  const handleSignIn = async () => {
    if (siLockSecondsLeft > 0) return;

    const errs: Record<string, string> = {};
    if (!siId.trim())    errs.id       = 'Email address is required';
    if (!siPassword)     errs.password = 'Password is required';
    setSiErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setSiGlobal('');

    try {
      const { data, error } = await signIn(siId, siPassword);
      if (error === '__not_verified__') {
        setSiFailCount(0);
        setVerifySentTo(siId.trim());
        setVerifyError('Confirm your email first, then return here to log in.');
        setVerifyStatus('');
        setScreen('verify');
        scrollTop();
        return;
      }
      if (error || !data) {
        const newCount = siFailCount + 1;
        setSiFailCount(newCount);
        // Lockout: 30s after 5 fails, doubles each subsequent failure
        if (newCount >= 5) {
          const lockMs = Math.min(30_000 * Math.pow(2, newCount - 5), 15 * 60_000);
          setSiLockedUntil(Date.now() + lockMs);
          setSiGlobal(`Too many failed attempts. Please wait ${Math.ceil(lockMs / 1000)} seconds before trying again.`);
        } else {
          setSiGlobal(error || 'No account found with that email address.');
        }
        scrollTop();
        return;
      }
      setSiFailCount(0);
      setSiLockedUntil(0);
      // Respect the real onboarding state — never force-complete it, or
      // first-time users skip the walkthrough entirely.
      await login(data.user, data.onboardingDone);
      router.replace('/');
    } catch (e) {
      setSiGlobal('Something went wrong. Please try again.');
      scrollTop();
    } finally {
      setLoading(false);
    }
  };

  // ── Google sign in / sign up ─────────────────────────────────────────────────
  const handleSocial = async (_provider: 'google') => {
    setLoading(true);
    setSiGlobal('');
    try {
      const { error } = await signInWithGoogle();
      if (error && error !== 'Sign-in cancelled.') setSiGlobal(error);
      // On success the AuthProvider's onAuthStateChange listener swaps the screen.
    } catch (e: any) {
      setSiGlobal(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password ────────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    setFpError('');
    if (!fpEmail.trim()) { setFpError('Enter your email address.'); return; }
    if (!isEmail(fpEmail)) { setFpError('Enter a valid email address.'); return; }
    if (fpCooldown > 0) return;
    setFpLoading(true);
    try {
      const { error } = await resetPassword(fpEmail);
      if (error) {
        if (error === '__use_google__') {
          // OAuth-only account — no email sent, so no cooldown (let them retry).
          setFpError('This email uses Google sign-in. Please continue with Google instead.');
        } else if (error === '__use_apple__') {
          setFpError('This email uses Apple sign-in. Please continue with Apple instead.');
        } else {
          // A real send attempt that hit a (likely rate-limit) error — apply cooldown.
          setFpCooldown(60);
          setFpError(error.toLowerCase().includes('rate') ? 'Too many attempts. Please wait 60 seconds before trying again.' : error);
        }
      } else {
        setFpCooldown(60);
        setFpSent(true);
      }
    } catch {
      setFpError('Something went wrong. Please try again.');
    } finally {
      setFpLoading(false);
    }
  };

  // ── Sign-up step 1 validation ──────────────────────────────────────────────
  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!suName.trim())          errs.name     = 'Full name is required';
    if (!suEmail.trim())         errs.email    = 'Email is required';
    else if (!isEmail(suEmail))  errs.email    = 'Enter a valid email address';
    if (!suPassword)             errs.password = 'Password is required';
    else if (!isPasswordStrong(suPassword)) errs.password = 'Password must meet all 5 requirements';
    if (!suConfirm)              errs.confirm  = 'Please confirm your password';
    else if (suConfirm !== suPassword) errs.confirm = 'Passwords do not match';
    setSu1Errors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleStep1Next = async () => {
    if (!validateStep1()) return;
    setSignupExistingEmail('');
    setSu2Errors({});
    setLoading(true);
    try {
      const existingMethod = await lookupAuthMethod(suEmail);
      if (existingMethod) {
        const existingEmail = suEmail.trim().toLowerCase();
        setSignupExistingEmail(existingEmail);
        setSu1Errors({ email: 'Account already in use.' });
        scrollTop();
        return;
      }
    } finally {
      setLoading(false);
    }
    setScreen('signup_2');
    scrollTop();
  };

  // ── Sign-up step 2 validation ──────────────────────────────────────────────
  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    const hasRecoveryEmail = suRecoveryEmail.trim().length > 0;
    const hasRecoveryPhone = suRecoveryPhone.trim().length > 0;

    if (!hasRecoveryEmail && !hasRecoveryPhone) {
      errs.recovery = 'Provide at least one recovery option — email or phone number.';
    }
    if (hasRecoveryEmail && !isEmail(suRecoveryEmail)) {
      errs.recoveryEmail = 'Enter a valid recovery email address';
    }
    if (hasRecoveryPhone && !isPhone(suRecoveryPhone)) {
      errs.recoveryPhone = 'Enter a valid phone number';
    }
    if (!suQuestion) errs.question = 'Choose a security question';
    if (!suAnswer.trim()) errs.answer = 'Answer is required';
    setSu2Errors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSignUp = async () => {
    if (!validateStep2()) return;
    setLoading(true);

    try {
      const { data: newUser, error } = await register({
        name: suName,
        email: suEmail,
        phone: '',
        recoveryEmail: suRecoveryEmail,
        recoveryPhone: suRecoveryPhone,
        dateOfBirth: suDob,
        password: suPassword,
        securityQuestion: suQuestion,
        securityAnswer: suAnswer,
        signupMethod: 'email',
      });

      if (error || !newUser) {
        if (error === '__account_exists__' || (error || '').toLowerCase().includes('already exists')) {
          const existingEmail = suEmail.trim().toLowerCase();
          setSignupExistingEmail(existingEmail);
          setSu2Errors({ global: 'Account already in use.' });
          scrollTop();
          return;
        }
        setSu2Errors({ global: error || 'Registration failed.' });
        return;
      }

      setVerifySentTo(newUser.email);
      setVerifyStatus('Verification link sent. Check your inbox and spam folder.');
      setVerifyError('');
      setResendCooldown(60);
      setSiId(newUser.email);
      setScreen('verify');
      scrollTop();
    } catch (e) {
      setSu2Errors({ global: 'Registration failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // ── Verification ───────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!verifySentTo || resendCooldown > 0) return;
    setVerifyLoading(true);
    setVerifyError('');
    setVerifyStatus('');
    const { error } = await resendVerification(verifySentTo);
    if (error) setVerifyError(error);
    else {
      setVerifyStatus('Verification link resent. Check your inbox and spam folder.');
      setResendCooldown(60);
    }
    setVerifyLoading(false);
  };

  // ── Layout ─────────────────────────────────────────────────────────────────
  const headerH = clamp(height * 0.28, 180, 260);
  const padH    = clamp(width * 0.06, 20, 28);
  const isSignUp = screen === 'signup_1' || screen === 'signup_2';

  return (
    <View style={[s.root, { backgroundColor: colors.page }]}>
      {/* ── Purple header ────────────────────────────────────────────────── */}
      <View style={[s.header, { height: headerH, backgroundColor: purple }]}>
        <View style={s.logoWrap}>
          <View style={s.logoIconWrap}>
            <Ionicons name="shield-checkmark" size={clamp(36 * cs, 28, 42)} color="white" />
          </View>
          <Text style={[s.logoTitle, { fontSize: clamp(34 * cs, 26, 42) }]}>Warret</Text>
          <Text style={[s.logoSub,   { fontSize: clamp(13 * cs, 11, 16) }]}>Your Warranty Wallet</Text>
        </View>
        <View style={[s.deco1, { backgroundColor: 'rgba(255,255,255,0.07)' }]} />
        <View style={[s.deco2, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
      </View>

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.card, { backgroundColor: colors.card, marginTop: -24 }]}>

          {/* Tab switcher — only on signin / signup */}
          {screen !== 'verify' && screen !== 'forgot' && (
            <View style={[s.tabRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              {(['signin', 'signup_1'] as const).map((m) => {
                const active = m === 'signin' ? screen === 'signin' : isSignUp;
                return (
                  <Pressable key={m} onPress={() => { setScreen(m); setSiGlobal(''); scrollTop(); }}
                    android_ripple={null}
                    style={({ pressed }) => [s.tab, active && { backgroundColor: purple }, pressed && !active && { opacity: 0.6 }]}>
                    <Text style={[s.tabText, { color: active ? 'white' : colors.muted }]}>
                      {m === 'signin' ? 'Log In' : 'Sign Up'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <ScrollView ref={scrollRef} style={{ flex: 1 }}
            contentContainerStyle={[s.formScroll, { paddingHorizontal: padH }]}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* ════════════════════════ SIGN IN ════════════════════════ */}
            {screen === 'signin' && (
              <>
                <View style={s.socialRow}>
                  <SocialButton icon={<GoogleIcon />} label="Continue with Google" onPress={() => handleSocial('google')} isDark={isDark} />
                </View>
                <View style={s.dividerRow}>
                  <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[s.dividerText, { color: colors.muted }]}>or</Text>
                  <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                {siGlobal ? (
                  <View style={[s.bannerError, { backgroundColor: isDark ? '#2A1217' : '#FFF5F5', borderColor: '#FFCDD0' }]}>
                    <Ionicons name="alert-circle-outline" size={16} color="#FF5A62" />
                    <Text style={s.bannerErrorText}>{siGlobal}</Text>
                  </View>
                ) : null}

                <Field label="Email address" value={siId} onChange={setSiId}
                  keyboard="email-address" placeholder="you@example.com"
                  error={siErrors.id} />
                <Field label="Password" value={siPassword} onChange={setSiPassword}
                  secure placeholder="Your password" error={siErrors.password} />

                {siLockSecondsLeft > 0 && (
                  <View style={[s.bannerError, { backgroundColor: isDark ? '#2A1217' : '#FFF5F5', borderColor: '#FFCDD0' }]}>
                    <Ionicons name="time-outline" size={16} color="#FF5A62" />
                    <Text style={s.bannerErrorText}>Too many attempts. Try again in {siLockSecondsLeft}s.</Text>
                  </View>
                )}

                <Pressable style={s.forgotWrap} onPress={() => { setFpEmail(siId); setFpError(''); setFpSent(false); setFpCooldown(0); setScreen('forgot'); scrollTop(); }}>
                  <Text style={[s.forgot, { color: purple }]}>Forgot password?</Text>
                </Pressable>

                <Pressable onPress={handleSignIn} disabled={loading || siLockSecondsLeft > 0}
                  android_ripple={null}
                  style={({ pressed }) => [s.primaryBtn, (loading || pressed) && s.btnDisabled]}>
                  {loading
                    ? <ActivityIndicator color="white" />
                    : <Text style={s.primaryBtnText}>Log In</Text>}
                </Pressable>
              </>
            )}

            {/* ════════════════════════ SIGN UP — STEP 1 ════════════════════ */}
            {screen === 'signup_1' && (
              <>
                <View style={s.socialRow}>
                  <SocialButton icon={<GoogleIcon />} label="Continue with Google" onPress={() => handleSocial('google')} isDark={isDark} />
                </View>
                <View style={s.dividerRow}>
                  <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[s.dividerText, { color: colors.muted }]}>or</Text>
                  <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <StepIndicator current={1} total={2} label="Your account" colors={colors} />

                <Field label="Full name" value={suName} onChange={setSuName}
                  placeholder="Your full name" error={su1Errors.name} />
                <Field label="Email" value={suEmail} onChange={(value) => { setSuEmail(value); setSignupExistingEmail(''); }}
                  keyboard="email-address" placeholder="you@example.com" error={su1Errors.email} />
                {signupExistingEmail ? (
                  <View style={[s.compactNotice, { backgroundColor: isDark ? '#1A1830' : '#F8F7FF', borderColor: colors.border }]}>
                    <Text style={[s.compactNoticeText, { color: colors.muted }]}>Already have an account?</Text>
                    <Pressable onPress={() => goToSignIn(signupExistingEmail)} style={s.inlineLinkBtn}>
                      <Text style={[s.inlineLinkText, { color: purple }]}>Log in</Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Password with strength tracker */}
                <View style={f.wrap}>
                  <Text style={[f.label, { color: colors.muted }]}>PASSWORD</Text>
                  <PasswordFieldWithStrength
                    value={suPassword}
                    onChange={setSuPassword}
                    error={su1Errors.password}
                    colors={colors}
                    isDark={isDark}
                  />
                </View>

                <Field label="Confirm password" value={suConfirm} onChange={setSuConfirm}
                  secure placeholder="Repeat your password" error={su1Errors.confirm} />

                <Pressable onPress={handleStep1Next} disabled={loading} style={[s.primaryBtn, loading && s.btnDisabled]}>
                  {loading
                    ? <ActivityIndicator color="white" />
                    : <>
                        <Text style={s.primaryBtnText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={18} color="white" />
                      </>}
                </Pressable>
              </>
            )}

            {/* ════════════════════════ SIGN UP — STEP 2 ════════════════════ */}
            {screen === 'signup_2' && (
              <>
                <StepIndicator current={2} total={2} label="Keep your account safe" colors={colors} />

                <View style={[s.recoveryBanner, { backgroundColor: isDark ? '#1A1830' : '#F4F2FF', borderColor: colors.border }]}>
                  <Ionicons name="shield-outline" size={16} color={purple} />
                  <Text style={[s.recoveryText, { color: colors.muted }]}>
                    Add a backup contact so we can always get you back in if needed.
                  </Text>
                </View>

                {su2Errors.recovery ? (
                  <Text style={[f.error, { marginBottom: 10 }]}>{su2Errors.recovery}</Text>
                ) : null}

                <Field label="Recovery email" value={suRecoveryEmail} onChange={setSuRecoveryEmail}
                  keyboard="email-address" placeholder="backup@email.com" optional
                  error={su2Errors.recoveryEmail}
                  hint="A different email from your login — used only for account recovery." />
                <Field label="Recovery phone" value={suRecoveryPhone} onChange={setSuRecoveryPhone}
                  keyboard="phone-pad" placeholder="+919811696969" optional
                  error={su2Errors.recoveryPhone}
                  hint="Include country code, no spaces — e.g. +919811696969" />
                <Field label="Date of birth" value={suDob} onChange={setSuDob}
                  keyboard="numbers-and-punctuation" placeholder="DD/MM/YYYY" optional />

                {/* Security question */}
                <View style={f.wrap}>
                  <Text style={[f.label, { color: colors.muted }]}>SECURITY QUESTION</Text>
                  <Pressable onPress={() => setQPickerOpen(true)}
                    style={[f.row, { borderColor: su2Errors.question ? '#FF5A62' : colors.border, backgroundColor: colors.input }]}>
                    <Text style={[{ flex: 1, fontSize: 15, fontWeight: '600' }, { color: suQuestion ? colors.text : colors.muted }]} numberOfLines={1}>
                      {suQuestion || 'Choose a question…'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.muted} />
                  </Pressable>
                  {su2Errors.question ? <Text style={f.error}>{su2Errors.question}</Text> : null}
                </View>
                <Field label="Security answer" value={suAnswer} onChange={setSuAnswer}
                  placeholder="Your answer" error={su2Errors.answer} />

                {su2Errors.global ? (
                  <View style={[s.bannerError, { backgroundColor: isDark ? '#2A1217' : '#FFF5F5', borderColor: '#FFCDD0' }]}>
                    <Ionicons name="alert-circle-outline" size={16} color="#FF5A62" />
                    <Text style={s.bannerErrorText}>{su2Errors.global}</Text>
                    {signupExistingEmail ? (
                      <Pressable onPress={() => goToSignIn(signupExistingEmail)} style={s.inlineLinkBtn}>
                        <Text style={[s.inlineLinkText, { color: purple }]}>Log in</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <View style={s.step2BtnRow}>
                  <Pressable onPress={() => { setScreen('signup_1'); scrollTop(); }}
                    style={[s.backBtn, { borderColor: colors.border, backgroundColor: colors.input }]}>
                    <Ionicons name="arrow-back" size={18} color={colors.text} />
                  </Pressable>
                  <Pressable onPress={handleSignUp} disabled={loading}
                    style={[s.primaryBtn, { flex: 1 }, loading && s.btnDisabled]}>
                    {loading
                      ? <ActivityIndicator color="white" />
                      : <>
                          <Text style={s.primaryBtnText}>Create account</Text>
                          <Ionicons name="checkmark" size={18} color="white" />
                        </>}
                  </Pressable>
                </View>
              </>
            )}

            {/* ════════════════════════ FORGOT PASSWORD ═════════════════════ */}
            {screen === 'forgot' && (
              <>
                <Pressable onPress={() => { setScreen('signin'); setFpSent(false); setFpError(''); setFpCooldown(0); scrollTop(); }}
                  style={[s.backChip, { borderColor: colors.border, backgroundColor: colors.input }]}>
                  <Ionicons name="arrow-back" size={15} color={colors.muted} />
                  <Text style={[s.backChipText, { color: colors.muted }]}>Back to log in</Text>
                </Pressable>

                <Text style={[s.sectionTitle, { color: colors.text }]}>Reset your password</Text>
                <Text style={[s.sectionSub, { color: colors.muted }]}>
                  Enter the email on your account. We'll send a secure one-time link — check spam if it doesn't arrive within a minute.
                </Text>

                {fpError ? (
                  <View style={[s.bannerError, { backgroundColor: isDark ? '#2A1217' : '#FFF5F5', borderColor: '#FFCDD0' }]}>
                    <Ionicons name="alert-circle-outline" size={16} color="#FF5A62" />
                    <Text style={s.bannerErrorText}>{fpError}</Text>
                  </View>
                ) : null}

                {fpSent ? (
                  <View style={[s.bannerSuccess, { backgroundColor: isDark ? '#0D2117' : '#F0FDF4', borderColor: '#6EE7B7' }]}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                    <Text style={[s.bannerErrorText, { color: '#10B981' }]}>
                      Link sent to {fpEmail}. Check your inbox and spam.
                    </Text>
                  </View>
                ) : null}

                <Field label="Email address" value={fpEmail} onChange={(v) => { setFpEmail(v); setFpSent(false); setFpError(''); }}
                  keyboard="email-address" placeholder="you@example.com" />

                <Pressable
                  onPress={handleForgotPassword}
                  disabled={fpLoading || fpCooldown > 0}
                  style={[s.primaryBtn, (fpLoading || fpCooldown > 0) && s.btnDisabled]}>
                  {fpLoading
                    ? <ActivityIndicator color="white" />
                    : <Text style={s.primaryBtnText}>
                        {fpSent && fpCooldown > 0
                          ? `Resend in ${fpCooldown}s`
                          : fpSent ? 'Resend link' : 'Send reset link'}
                      </Text>}
                </Pressable>
              </>
            )}

            {/* ════════════════════════ VERIFY ══════════════════════════════ */}
            {screen === 'verify' && (
              <VerificationScreen
                sentTo={verifySentTo}
                loading={verifyLoading}
                error={verifyError}
                status={verifyStatus}
                cooldown={resendCooldown}
                onResend={handleResend}
                onGoToSignIn={() => goToSignIn(suEmail)}
                colors={colors}
                isDark={isDark}
              />
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {loading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={purple} />
        </View>
      )}

      <QuestionPicker visible={qPickerOpen} selected={suQuestion}
        onSelect={setSuQuestion} onClose={() => setQPickerOpen(false)} />
    </View>
  );
}

// ─── Password field with inline strength bar ──────────────────────────────────
function PasswordFieldWithStrength({ value, onChange, error, colors, isDark }: {
  value: string; onChange: (v: string) => void; error?: string; colors: any; isDark: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <View style={[f.row, { backgroundColor: colors.input, borderColor: error ? '#FF5A62' : colors.border }]}>
        <TextInput
          style={[f.input, { color: colors.text }]}
          value={value}
          onChangeText={onChange}
          placeholder="Minimum 8 characters"
          placeholderTextColor={colors.muted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={() => setShow((s) => !s)} style={f.eyeBtn}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
        </Pressable>
      </View>
      {error ? <Text style={f.error}>{error}</Text> : null}
      <PasswordStrengthBar password={value} colors={colors} />
    </>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current, total, label, colors }: { current: number; total: number; label: string; colors: any }) {
  return (
    <View style={s.stepRow}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.stepDot, { backgroundColor: i + 1 <= current ? purple : colors.border },
          i + 1 === current && s.stepDotActive]} />
      ))}
      <Text style={[s.stepText, { color: colors.muted }]}>Step {current} of {total} — {label}</Text>
    </View>
  );
}

// ─── Verification screen ──────────────────────────────────────────────────────
function VerificationScreen({ sentTo, loading, error, status, cooldown, onResend, onGoToSignIn, colors, isDark }: {
  sentTo: string; loading: boolean; error: string; status: string; cooldown: number;
  onResend: () => void; onGoToSignIn: () => void;
  colors: any; isDark: boolean;
}) {
  const canResend = !loading && cooldown <= 0;
  return (
    <View style={vs.wrap}>
      <View style={[vs.iconWrap, { backgroundColor: isDark ? '#1A1830' : '#F4F2FF' }]}>
        <Ionicons name="mail-outline" size={46} color={purple} />
      </View>
      <Text style={[vs.title, { color: colors.text }]}>Check your inbox</Text>
      <Text style={[vs.sub, { color: colors.muted }]}>
        We've sent a verification link to{'\n'}
        <Text style={{ fontWeight: '900', color: colors.text }}>{sentTo}</Text>
      </Text>
      <Text style={[vs.note, { color: colors.muted }]}>
        Tap the link in your email to confirm it's you. Usually arrives within a minute — check spam if not.
      </Text>

      {error ? (
        <Text style={[vs.error, { marginTop: 8 }]}>{error}</Text>
      ) : null}

      {status ? (
        <Text style={[vs.status, { color: purple }]}>{status}</Text>
      ) : null}

      <Pressable onPress={onResend} disabled={!canResend} style={[vs.resendBtn, !canResend && { opacity: 0.5 }]}>
        <Text style={[vs.resendText, { color: purple }]}>
          {loading ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification link'}
        </Text>
      </Pressable>
      <Pressable onPress={onGoToSignIn}>
        <Text style={[vs.backText, { color: colors.muted }]}>← Back to log in</Text>
      </Pressable>
    </View>
  );
}

const vs = StyleSheet.create({
  wrap:          { paddingTop: 8, alignItems: 'center', gap: 14 },
  iconWrap:      { width: 84, height: 84, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title:         { fontSize: 22, fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  sub:           { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22, fontFamily: F.i600 },
  note:          { fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19, fontFamily: F.i600 },
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, width: '100%', marginTop: 6 },
  primaryBtnText:{ fontSize: 16, fontWeight: '900', color: 'white', fontFamily: F.n900 },
  devBox:        { width: '100%', borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  devHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  devLabel:      { fontSize: 11, fontWeight: '900', letterSpacing: 0.3, fontFamily: F.n900 },
  devToken:      { fontSize: 11, fontWeight: '600', fontFamily: 'monospace' },
  devBtn:        { borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  devBtnText:    { color: 'white', fontSize: 13, fontWeight: '900', fontFamily: F.n900 },
  error:         { fontSize: 13, fontWeight: '700', color: '#FF5A62', textAlign: 'center', fontFamily: F.i700 },
  status:        { fontSize: 13, fontWeight: '800', textAlign: 'center', fontFamily: F.n800 },
  resendBtn:     { paddingVertical: 6 },
  resendText:    { fontSize: 14, fontWeight: '800', fontFamily: F.n800 },
  backText:      { fontSize: 13, fontWeight: '700', fontFamily: F.n700 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoWrap:    { alignItems: 'center', gap: 6, zIndex: 1 },
  logoIconWrap:{ width: 62, height: 62, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  logoTitle:   { fontWeight: '900', color: 'white', letterSpacing: -0.5, fontFamily: F.n900 },
  logoSub:     { fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.2, fontFamily: F.n700 },
  deco1:       { position: 'absolute', width: 160, height: 160, borderRadius: 80, top: -60, right: -40 },
  deco2:       { position: 'absolute', width: 220, height: 220, borderRadius: 110, bottom: -80, left: -60 },

  card:        { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  tabRow:      { flexDirection: 'row', margin: 20, marginBottom: 4, padding: 4, borderRadius: 16, borderWidth: 1 },
  tab:         { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  tabText:     { fontSize: 15, fontWeight: '900', fontFamily: F.n700 },

  formScroll:  { paddingTop: 18, paddingBottom: 20 },

  socialRow:   { flexDirection: 'row', gap: 12, marginBottom: 18 },
  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '500', fontFamily: F.i500 },

  primaryBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, backgroundColor: purple, marginTop: 6 },
  primaryBtnText:  { fontSize: 16, fontWeight: '900', color: 'white', fontFamily: F.n900 },
  btnDisabled:     { opacity: 0.6 },
  forgotWrap:      { alignItems: 'flex-end', marginBottom: 4, marginTop: -4 },
  forgot:          { fontSize: 13, fontWeight: '800', fontFamily: F.n800 },

  stepRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  stepDot:         { width: 8, height: 8, borderRadius: 4 },
  stepDotActive:   { width: 20 },
  stepText:        { fontSize: 12, fontWeight: '700', marginLeft: 4, fontFamily: F.i700 },

  recoveryBanner:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  recoveryText:    { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17, fontFamily: F.i600 },

  step2BtnRow:     { flexDirection: 'row', gap: 12, marginTop: 6 },
  backBtn:         { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  bannerError:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  bannerSuccess:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  bannerErrorText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#FF5A62', lineHeight: 18, fontFamily: F.i700 },
  compactNotice:   { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, marginTop: -6, marginBottom: 12 },
  compactNoticeText:{ fontSize: 12, fontWeight: '500', fontFamily: F.i500 },
  inlineLinkBtn:   { paddingHorizontal: 2, paddingVertical: 1 },
  inlineLinkText:  { fontSize: 12, fontWeight: '900', textDecorationLine: 'underline', fontFamily: F.n900 },

  sectionTitle:    { fontSize: 22, fontWeight: '800', fontFamily: F.n800, marginBottom: 8 },
  sectionSub:      { fontSize: 14, fontWeight: '500', fontFamily: F.n500, lineHeight: 20, marginBottom: 20 },
  backChip:        { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  backChipText:    { fontSize: 13, fontWeight: '700', fontFamily: F.n700 },

  loadingOverlay:  { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
});
