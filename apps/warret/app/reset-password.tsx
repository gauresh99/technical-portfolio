import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../src/store/theme';
import { useAuth } from '../src/store/auth';
import { updatePassword } from '../src/services/supabase-auth';
import { F } from '../src/theme/fonts';

const purple = '#5B4DF0';

const PW_CHECKS = [
  { label: 'At least 8 characters',   test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter',     test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter',     test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number',              test: (p: string) => /\d/.test(p) },
  { label: 'One special character',   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];
const isStrong = (p: string) => PW_CHECKS.every((c) => c.test(p));

function PasswordField({ value, onChange, placeholder, colors }: {
  value: string; onChange: (v: string) => void; placeholder: string; colors: any;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextInput
        style={[s.input, { color: colors.text, flex: 1 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable onPress={() => setShow((v) => !v)} style={{ padding: 4 }}>
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export default function ResetPasswordScreen() {
  const { colors, isDark } = useAppTheme();
  const { clearPasswordRecovery, logout } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!password)           { setError('Enter a new password.'); return; }
    if (!isStrong(password)) { setError('Password must meet all 5 requirements below.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error: err } = await updatePassword(password);
    setLoading(false);
    if (err) { setError(err); return; }
    setDone(true);
  };

  const handleContinue = async () => {
    // Sign out FIRST so the user can't briefly land in the authenticated app
    // (RootNavigator would otherwise render AppStack while user is still set).
    // logout() triggers SIGNED_OUT which also clears the recovery flag, but we
    // clear it explicitly afterward as a belt-and-suspenders fallback.
    await logout();
    clearPasswordRecovery();
  };

  return (
    <View style={[s.root, { backgroundColor: colors.page }]}>
      <View style={[s.header, { backgroundColor: purple }]}>
        <Text style={s.headerTitle}>Warret</Text>
        <Text style={s.headerSub}>Set a new password</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={[s.card, { backgroundColor: colors.card }]}>

            {done ? (
              <>
                <View style={[s.successBanner, { backgroundColor: isDark ? '#0D2117' : '#F0FDF4', borderColor: '#6EE7B7' }]}>
                  <Ionicons name="checkmark-circle-outline" size={22} color="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.successTitle, { color: '#10B981' }]}>Password updated!</Text>
                    <Text style={[s.successSub, { color: isDark ? '#6EE7B7' : '#065F46' }]}>
                      Log in with your new password to continue.
                    </Text>
                  </View>
                </View>
                <Pressable onPress={handleContinue} style={s.primaryBtn}>
                  <Text style={s.primaryBtnText}>Continue to log in</Text>
                  <Ionicons name="arrow-forward" size={18} color="white" />
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[s.title, { color: colors.text }]}>Choose a new password</Text>
                <Text style={[s.sub, { color: colors.muted }]}>
                  Make it strong — you won't need to change it again unless you want to.
                </Text>

                {error ? (
                  <View style={[s.errorBanner, { backgroundColor: isDark ? '#2A1217' : '#FFF5F5', borderColor: '#FFCDD0' }]}>
                    <Ionicons name="alert-circle-outline" size={16} color="#FF5A62" />
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Text style={[s.fieldLabel, { color: colors.muted }]}>NEW PASSWORD</Text>
                <View style={[s.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <PasswordField value={password} onChange={setPassword} placeholder="New password" colors={colors} />
                </View>
                <View style={s.checks}>
                  {PW_CHECKS.map((c) => {
                    const ok = c.test(password);
                    return (
                      <View key={c.label} style={s.checkRow}>
                        <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={ok ? '#10B981' : colors.muted} />
                        <Text style={[s.checkText, { color: ok ? '#10B981' : colors.muted }]}>{c.label}</Text>
                      </View>
                    );
                  })}
                </View>

                <Text style={[s.fieldLabel, { color: colors.muted, marginTop: 14 }]}>CONFIRM PASSWORD</Text>
                <View style={[s.inputWrap, { backgroundColor: colors.input, borderColor: confirm && confirm !== password ? '#FF5A62' : colors.border }]}>
                  <PasswordField value={confirm} onChange={setConfirm} placeholder="Repeat new password" colors={colors} />
                </View>
                {confirm && confirm !== password
                  ? <Text style={[s.errorText, { marginBottom: 0 }]}>Passwords do not match.</Text>
                  : null}

                <Pressable onPress={handleSubmit} disabled={loading} style={[s.primaryBtn, loading && s.btnDisabled]}>
                  {loading
                    ? <ActivityIndicator color="white" />
                    : <Text style={s.primaryBtnText}>Set new password</Text>}
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { paddingTop: 60, paddingBottom: 40, paddingHorizontal: 28, alignItems: 'center', gap: 6 },
  headerTitle:   { fontSize: 28, fontWeight: '900', color: 'white', fontFamily: F.n800 },
  headerSub:     { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.75)', fontFamily: F.n600 },
  body:          { padding: 20, paddingTop: 0 },
  card:          { borderRadius: 24, padding: 24, marginTop: -24 },
  title:         { fontSize: 22, fontWeight: '800', fontFamily: F.n800, marginBottom: 6 },
  sub:           { fontSize: 14, fontWeight: '500', fontFamily: F.n500, lineHeight: 20, marginBottom: 16 },
  fieldLabel:    { fontSize: 11, fontWeight: '700', fontFamily: F.n700, letterSpacing: 0.8, marginBottom: 6 },
  inputWrap:     { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  input:         { fontSize: 15, fontWeight: '600', fontFamily: F.n600, paddingVertical: 12 },
  checks:        { gap: 6, marginBottom: 4 },
  checkRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkText:     { fontSize: 12, fontWeight: '600', fontFamily: F.n600 },
  errorBanner:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  errorText:     { flex: 1, fontSize: 13, fontWeight: '700', color: '#FF5A62', fontFamily: F.i700, marginBottom: 8 },
  successBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
  successTitle:  { fontSize: 16, fontWeight: '800', fontFamily: F.n800, marginBottom: 2 },
  successSub:    { fontSize: 13, fontWeight: '600', fontFamily: F.n600, lineHeight: 18 },
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, backgroundColor: purple, marginTop: 20 },
  primaryBtnText:{ fontSize: 16, fontWeight: '800', color: 'white', fontFamily: F.n800 },
  btnDisabled:   { opacity: 0.5 },
});
