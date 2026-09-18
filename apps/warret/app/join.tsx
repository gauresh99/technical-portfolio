import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGroups, JoinInfo } from '../src/store/groups';
import { useAuth } from '../src/store/auth';
import { useAppTheme } from '../src/store/theme';
import { purple } from '../src/components/ui';
import { isSupabaseConfigured } from '../src/lib/supabase';
import type { GroupRole } from '../src/data/groups';

const ROLE_ICONS: Record<GroupRole, string>  = { host: 'shield-checkmark-outline', adder: 'add-circle-outline', viewer: 'eye-outline' };
const ROLE_COLORS: Record<GroupRole, string> = { host: purple, adder: '#0D9488', viewer: '#8A8498' };
const ROLE_DESC: Record<GroupRole, string>   = {
  host:   'Read-only access — host access must be granted inside the group',
  adder:  'Can add new products to the group but cannot remove anything',
  viewer: 'Read-only access — view products and download files',
};

export default function Join() {
  const { g, t, r }  = useLocalSearchParams<{ g?: string; t?: string; r?: string }>();
  const { colors }   = useAppTheme();
  const { user }     = useAuth();
  const { groups, myId, loaded, joinGroup, fetchJoinInfo } = useGroups();

  const groupId = g ?? '';
  const token   = t ?? '';
  const role    = (r === 'adder' ? 'adder' : 'viewer') as GroupRole;

  const [name,        setName]        = useState('');
  const [passcode,    setPasscode]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [error,       setError]       = useState('');
  const [done,        setDone]        = useState(false);
  const [joining,     setJoining]     = useState(false);
  const [remote,      setRemote]      = useState<JoinInfo | null>(null);
  const [fetching,    setFetching]    = useState(false);
  const [notFound,    setNotFound]    = useState(false);

  // Already a member on this device → use local state as before.
  const localGroup = groups.find((gr) => gr.id === groupId);
  const checkingLink = !!groupId && !!token && !localGroup && !remote && (!loaded || fetching);
  const linkInvalid = !groupId || !token || (!checkingLink && notFound && !localGroup && !remote);

  useEffect(() => {
    if (localGroup || remote) setNotFound(false);
  }, [localGroup, remote]);

  // Cross-device join: the group isn't in local state, so ask the server for
  // invite info via the get_group_join_info RPC (works for non-members).
  useEffect(() => {
    if (localGroup || remote || !groupId || !token) return;
    if (!loaded) return;
    if (!myId || !isSupabaseConfigured) return;
    let cancelled = false;
    setNotFound(false);
    setFetching(true);
    fetchJoinInfo(groupId, token).then((info) => {
      if (cancelled) return;
      setFetching(false);
      if (info) setRemote(info);
      else setNotFound(true);
    });
    return () => { cancelled = true; };
  }, [localGroup, remote, groupId, token, myId, loaded, fetchJoinInfo]);

  const groupName        = localGroup?.name ?? remote?.name ?? '';
  const groupDesc        = localGroup?.description ?? remote?.description ?? '';
  const requiresPasscode = localGroup ? !!localGroup.settings?.passcode : !!remote?.requiresPasscode;
  const isLocked         = localGroup ? !!localGroup.settings?.locked : !!remote?.locked;

  const handleJoin = async () => {
    if (!name.trim()) { setError('Enter your name to continue.'); return; }
    if (joining) return;
    setError('');
    setJoining(true);
    const result = await joinGroup(groupId, token, name, role, passcode);
    setJoining(false);
    if (result === 'ok' || result === 'already-member') {
      setDone(true);
      setTimeout(() => router.replace(`/group/${groupId}`), 1200);
    } else if (result === 'locked') {
      setError('This group is locked — the host has disabled new joins. Contact the host.');
    } else if (result === 'wrong-passcode') {
      setError('Incorrect passcode. Ask the host for the current code.');
    } else {
      setError('Invalid invite link. Ask the host to send you a fresh one.');
    }
  };

  if (done) return (
    <View style={[s.page, { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }]}>
      <View style={[s.successIcon, { backgroundColor: purple + '22' }]}>
        <Ionicons name="checkmark-circle" size={56} color={purple} />
      </View>
      <Text style={[s.successTitle, { color: colors.text }]}>You're in!</Text>
      <Text style={[s.successSub, { color: colors.muted }]}>Joined {groupName || 'the group'}</Text>
    </View>
  );

  // Invite link failed server-side validation (bad id/token, or missing params).
  if (checkingLink) return (
    <View style={[s.page, { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={purple} />
      <Text style={[s.successSub, { color: colors.muted, marginTop: 16 }]}>Checking invite…</Text>
    </View>
  );

  if (linkInvalid) return (
    <View style={[s.page, { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }]}>
      <View style={[s.successIcon, { backgroundColor: '#FF5A6222' }]}>
        <Ionicons name="unlink-outline" size={48} color="#FF5A62" />
      </View>
      <Text style={[s.successTitle, { color: colors.text }]}>Invalid or expired invite link</Text>
      <Text style={[s.successSub, { color: colors.muted, paddingHorizontal: 40 }]}>
        Ask the host to send you a fresh invite from the group's share menu.
      </Text>
      <Pressable onPress={() => router.replace('/groups')} style={s.cancelBtn}>
        <Text style={[s.cancelBtnText, { color: purple }]}>Back to groups</Text>
      </Pressable>
    </View>
  );

  if (!user) return (
    <View style={[s.page, { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }]}>
      <View style={[s.successIcon, { backgroundColor: purple + '22' }]}>
        <Ionicons name="lock-open-outline" size={48} color={purple} />
      </View>
      <Text style={[s.successTitle, { color: colors.text }]}>Sign in to join</Text>
      <Text style={[s.successSub, { color: colors.muted, paddingHorizontal: 40 }]}>
        This invite is ready. Sign in or create an account, then open this link again to join the group.
      </Text>
      <Pressable onPress={() => router.replace('/auth')} style={[s.joinBtn, { backgroundColor: purple, opacity: 1 }]}>
        <Text style={s.joinBtnText}>Continue to sign in</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[s.page, { backgroundColor: colors.page }]}>
      <View style={s.inner}>
        <View style={[s.groupIcon, { backgroundColor: purple + '18' }]}>
          <Ionicons name="people" size={40} color={purple} />
        </View>

        {groupName ? (
          <>
            <Text style={[s.groupName, { color: colors.text }]}>{groupName}</Text>
            {groupDesc ? <Text style={[s.groupDesc, { color: colors.muted }]}>{groupDesc}</Text> : null}
            <Text style={[s.inviteLabel, { color: colors.muted }]}>You've been invited to join as</Text>
          </>
        ) : (
          <Text style={[s.groupName, { color: colors.text }]}>Join group</Text>
        )}

        {/* Role badge */}
        <View style={[s.roleBadge, { backgroundColor: ROLE_COLORS[role] + '18', borderColor: ROLE_COLORS[role] + '44' }]}>
          <Ionicons name={ROLE_ICONS[role] as any} size={18} color={ROLE_COLORS[role]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.roleName, { color: ROLE_COLORS[role] }]}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
            <Text style={[s.roleDesc, { color: colors.muted }]}>{ROLE_DESC[role]}</Text>
          </View>
        </View>

        {/* Locked warning */}
        {isLocked && (
          <View style={[s.lockedBanner, { backgroundColor: '#FFE9EC', borderColor: '#FF5A6244' }]}>
            <Ionicons name="lock-closed" size={15} color="#FF5A62" />
            <Text style={[s.lockedText, { color: '#FF5A62' }]}>This group is currently locked. New members cannot join.</Text>
          </View>
        )}

        {/* Name input */}
        <Text style={[s.label, { color: colors.muted }]}>Your name in this group</Text>
        <TextInput
          value={name} onChangeText={(v) => { setName(v); setError(''); }}
          placeholder="e.g. Rahul, Priya…"
          placeholderTextColor={colors.muted}
          autoFocus
          style={[s.input, { backgroundColor: colors.input, borderColor: name.trim() ? colors.primary : colors.border, color: colors.text }]}
        />

        {/* Passcode input — only shown when group has one */}
        {requiresPasscode && (
          <>
            <Text style={[s.label, { color: colors.muted }]}>Group passcode</Text>
            <View style={s.passRow}>
              <TextInput
                value={passcode} onChangeText={(v) => { setPasscode(v); setError(''); }}
                placeholder="Enter passcode"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPass}
                style={[s.input, s.passInput, { backgroundColor: colors.input, borderColor: passcode ? colors.primary : colors.border, color: colors.text }]}
              />
              <Pressable onPress={() => setShowPass((p) => !p)} style={[s.passEye, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
              </Pressable>
            </View>
          </>
        )}

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <Pressable
          onPress={handleJoin}
          disabled={joining}
          style={[s.joinBtn, { backgroundColor: name.trim() ? purple : colors.border, opacity: joining ? 0.7 : 1 }]}
        >
          {joining ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="enter-outline" size={18} color="white" />
          )}
          <Text style={s.joinBtnText}>{joining ? 'Joining…' : 'Join group'}</Text>
        </Pressable>

        <Pressable onPress={() => router.replace('/groups')} style={s.cancelBtn}>
          <Text style={[s.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page:   { flex: 1, justifyContent: 'center' },
  inner:  { padding: 32, gap: 10 },

  groupIcon:    { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8 },
  groupName:    { fontSize: 26, fontWeight: '900', textAlign: 'center' },
  groupDesc:    { fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  inviteLabel:  { fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4 },

  roleBadge: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginTop: 4 },
  roleName:  { fontSize: 15, fontWeight: '900' },
  roleDesc:  { fontSize: 13, fontWeight: '700', marginTop: 2, lineHeight: 17 },

  lockedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  lockedText:   { fontSize: 13, fontWeight: '700', lineHeight: 17, flex: 1 },

  label:    { fontSize: 12, fontWeight: '900', letterSpacing: 0.3, marginTop: 4 },
  input:    { minHeight: 48, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, fontSize: 16, fontWeight: '700' },
  passRow:  { flexDirection: 'row', gap: 8 },
  passInput:{ flex: 1 },
  passEye:  { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 13, fontWeight: '700', color: '#E0363E', lineHeight: 18 },

  joinBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 16, marginTop: 8 },
  joinBtnText: { color: 'white', fontSize: 16, fontWeight: '900' },
  cancelBtn:     { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { fontSize: 14, fontWeight: '800' },

  successIcon:  { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { fontSize: 28, fontWeight: '900', textAlign: 'center' },
  successSub:   { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 4 },
});
