import { useEffect, useState } from 'react';
import { Alert, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGroups } from '../../src/store/groups';
import { useAppTheme } from '../../src/store/theme';
import { purple } from '../../src/components/ui';
import type { Group } from '../../src/data/groups';
import { DEMO_GROUP } from '../../src/data/demo';
import { F } from '../../src/theme/fonts';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);


function MemberDots({ members, size = 26 }: { members: { color: string; name: string }[]; size?: number }) {
  const shown = members.slice(0, 4);
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((m, i) => (
        <View key={i} style={[s.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: m.color, marginLeft: i > 0 ? -(size * 0.28) : 0 }]}>
          <Text style={[s.dotText, { fontSize: size * 0.4 }]}>{m.name[0].toUpperCase()}</Text>
        </View>
      ))}
      {members.length > 4 && (
        <View style={[s.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#C4BFDA', marginLeft: -(size * 0.28) }]}>
          <Text style={[s.dotText, { fontSize: size * 0.36 }]}>+{members.length - 4}</Text>
        </View>
      )}
    </View>
  );
}

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const { colors }  = useAppTheme();
  const { isHost }  = useGroups();
  const host        = isHost(group);

  return (
    <Pressable onPress={onPress} style={[s.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.groupCardTop}>
        <View style={{ flex: 1 }}>
          <View style={s.groupNameRow}>
            <Text style={[s.groupName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
            {host && (
              <View style={[s.hostBadge, { backgroundColor: purple + '22' }]}>
                <Text style={[s.hostBadgeText, { color: purple }]}>host</Text>
              </View>
            )}
          </View>
          {group.description ? (
            <Text style={[s.groupDesc, { color: colors.muted }]} numberOfLines={1}>{group.description}</Text>
          ) : null}
        </View>
        <MemberDots members={group.members} />
      </View>
      <View style={[s.groupCardBottom, { borderTopColor: colors.border }]}>
        <View style={s.groupStat}>
          <Ionicons name="people-outline" size={13} color={colors.muted} />
          <Text style={[s.groupStatText, { color: colors.muted }]}>{group.members.length} member{group.members.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={s.groupStat}>
          <Ionicons name="cube-outline" size={13} color={colors.muted} />
          <Text style={[s.groupStatText, { color: colors.muted }]}>{group.products.length} product{group.products.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={s.groupStat}>
          <Ionicons name="calendar-outline" size={13} color={colors.muted} />
          <Text style={[s.groupStatText, { color: colors.muted }]}>Since {group.createdAt}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function groupSearchText(group: Group) {
  const lowered = `${group.name} ${group.description}`.toLowerCase();
  const inferredType = [
    lowered.includes('family') || lowered.includes('home') ? 'family home household personal' : '',
    lowered.includes('company') || lowered.includes('office') || lowered.includes('team') || lowered.includes('assets') ? 'company office team business work' : '',
    group.members.map((m) => `${m.name} ${m.role}`).join(' '),
  ].join(' ');
  return `${lowered} ${inferredType}`.toLowerCase();
}

export default function Groups() {
  const { width, height } = useWindowDimensions();
  const { colors }        = useAppTheme();
  const { groups, myId, createGroup } = useGroups();
  const { create } = useLocalSearchParams<{ create?: string }>();
  const [modal,  setModal]  = useState<'create' | 'join' | null>(null);
  const [search, setSearch] = useState('');

  // Create group form
  const [gName, setGName]   = useState('');
  const [gDesc, setGDesc]   = useState('');
  const [myName, setMyName] = useState('');

  // Join form
  const [joinUrl, setJoinUrl] = useState('');

  const scale    = clamp(Math.min(width / 390, height / 844), 0.72, 1.08);
  const titleSizing = {
    fontSize: clamp(width * 0.118 * scale, 28, 46),
    lineHeight: clamp(width * 0.133 * scale, 32, 52),
  };
  const subSizing = {
    fontSize: clamp(width * 0.047 * scale, 12, 18),
    lineHeight: clamp(width * 0.059 * scale, 16, 23),
  };

  // Android: hardware back key closes the open modal sheet
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modal) { setModal(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [modal]);
  useEffect(() => {
    if (create !== '1') return;
    setModal('create');
    router.replace('/groups');
  }, [create]);
  const padH     = clamp(width * 0.055 * scale, 16, 24);

  const q = search.trim().toLowerCase();
  const filteredGroups = q
    ? groups.filter((g) => groupSearchText(g).includes(q))
    : groups;
  const showDemoGroup = groups.length === 0 && !q;

  const doCreate = () => {
    if (!gName.trim()) return;
    const g = createGroup(gName, gDesc, myName || 'You');
    setModal(null); setGName(''); setGDesc(''); setMyName('');
    router.push(`/group/${g.id}`);
  };

  const doJoin = () => {
    if (!joinUrl.trim()) return;
    try {
      const url = new URL(joinUrl.trim().replace(/^warret:\//, 'http://x'));
      const g = url.searchParams.get('g') || '';
      const t = url.searchParams.get('t') || '';
      const r = (url.searchParams.get('r') || 'viewer') as any;
      router.push(`/join?g=${g}&t=${t}&r=${r}`);
      setModal(null); setJoinUrl('');
    } catch {
      Alert.alert('Invalid link', 'Paste the full invite link you received.');
    }
  };

  return (
    <View style={[s.page, { backgroundColor: colors.page }]}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: padH, backgroundColor: colors.primary }]}>
        <View style={s.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, titleSizing]}>Groups</Text>
            <Text style={[s.sub, subSizing]}>One vault shared access</Text>
          </View>
          <Pressable onPress={() => setModal('join')} style={s.joinBtn}>
            <Ionicons name="link-outline" size={16} color="white" />
            <Text style={s.joinBtnText}>Join</Text>
          </Pressable>
        </View>

        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color="#D7D1FF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search group type, name or members..."
            placeholderTextColor="#C8C0FF"
            selectionColor="white"
            returnKeyType="search"
            style={s.searchInput}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#D7D1FF" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: padH, paddingTop: 22, paddingBottom: 110, gap: 14 }}>
        {showDemoGroup ? (
          <>
            <View style={[s.demoNotice, { backgroundColor: colors.soft, borderColor: colors.border }]}>
              <View style={[s.demoIcon, { backgroundColor: colors.card }]}>
                <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.demoTitle, { color: colors.text }]}>Example group preview</Text>
                <Text style={[s.demoText, { color: colors.muted }]}>
                  This is a guide, not a real group. Create or join your first group and it disappears automatically.
                </Text>
              </View>
            </View>
            <View>
              <View style={[s.demoPill, { backgroundColor: colors.soft }]}>
                <Text style={[s.demoPillText, { color: colors.primary }]}>DEMO ONLY</Text>
              </View>
              <GroupCard group={DEMO_GROUP} onPress={() => router.push(`/group/${DEMO_GROUP.id}`)} />
            </View>
          </>
        ) : filteredGroups.length === 0 ? (
          <View style={[s.empty, { borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={30} color={colors.muted} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>No results</Text>
            <Text style={[s.emptySub, { color: colors.muted }]}>No groups or members match "{search}"</Text>
          </View>
        ) : (
          filteredGroups.map((g) => (
            <GroupCard key={g.id} group={g} onPress={() => router.push(`/group/${g.id}`)} />
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable onPress={() => setModal('create')} style={[s.fab, { backgroundColor: colors.primary }]}>
        <Ionicons name="add" size={28} color="white" />
      </Pressable>

      {/* Create modal */}
      {modal === 'create' && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setModal(null)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Create group</Text>

            <Text style={[s.label, { color: colors.muted }]}>Group name</Text>
            <TextInput
              value={gName} onChangeText={setGName} autoFocus
              placeholder="e.g. Family Home, Office Tech"
              placeholderTextColor={colors.muted}
              style={[s.input, { backgroundColor: colors.input, borderColor: gName.trim() ? colors.primary : colors.border, color: colors.text }]}
            />

            <Text style={[s.label, { color: colors.muted }]}>Description (optional)</Text>
            <TextInput
              value={gDesc} onChangeText={setGDesc}
              placeholder="What's this group for?"
              placeholderTextColor={colors.muted}
              style={[s.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
            />

            <Text style={[s.label, { color: colors.muted }]}>Your name in this group</Text>
            <TextInput
              value={myName} onChangeText={setMyName}
              placeholder="e.g. Gauresh"
              placeholderTextColor={colors.muted}
              style={[s.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
            />

            <Pressable
              onPress={doCreate}
              style={[s.sheetBtn, { backgroundColor: gName.trim() ? colors.primary : colors.border }]}
            >
              <Text style={s.sheetBtnText}>Create group</Text>
            </Pressable>
            <Pressable onPress={() => setModal(null)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Join modal */}
      {modal === 'join' && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setModal(null)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Join a group</Text>
            <Text style={[s.sheetDesc, { color: colors.muted }]}>Paste the invite link you received from the group host.</Text>

            <Text style={[s.label, { color: colors.muted }]}>Invite link</Text>
            <TextInput
              value={joinUrl} onChangeText={setJoinUrl} autoFocus
              placeholder="warret://join?g=...  or  http://..."
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={[s.input, { backgroundColor: colors.input, borderColor: joinUrl.trim() ? colors.primary : colors.border, color: colors.text }]}
            />

            <Pressable
              onPress={doJoin}
              style={[s.sheetBtn, { backgroundColor: joinUrl.trim() ? colors.primary : colors.border }]}
            >
              <Text style={s.sheetBtnText}>Continue</Text>
            </Pressable>
            <Pressable onPress={() => setModal(null)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page:   { flex: 1 },
  header: { paddingTop: 54, paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchBar:   { minHeight: 58, marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, backgroundColor: 'rgba(255,255,255,.16)', borderColor: 'rgba(255,255,255,.28)' },
  searchInput: { flex: 1, minHeight: 48, color: 'white', fontSize: 16, lineHeight: 20, fontFamily: F.n800, fontWeight: '800' },
  title:  { fontFamily: 'Futura', fontWeight: '800', color: 'white' },
  sub:    { fontWeight: '500', marginTop: 2, color: '#D7D1FF' },
  joinBtn:     { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 15, borderWidth: 1, backgroundColor: 'rgba(255,255,255,.16)', borderColor: 'rgba(255,255,255,.28)' },
  joinBtnText: { color: 'white', fontSize: 14, fontFamily: F.n900, fontWeight: '900' },

  groupCard:   { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  groupCardTop:    { padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  groupCardBottom: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  groupName:   { fontSize: 19, lineHeight: 24, fontFamily: F.n700, fontWeight: '700', flexShrink: 1 },
  groupDesc:   { fontSize: 13, fontFamily: F.i500, fontWeight: '500', marginTop: 3, lineHeight: 18 },
  hostBadge:   { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  hostBadgeText: { fontSize: 10, fontFamily: F.n900, fontWeight: '900' },
  groupStat:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupStatText: { fontSize: 12, fontFamily: F.i500, fontWeight: '500' },
  demoNotice: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  demoIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  demoTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  demoText: { fontSize: 12, lineHeight: 17, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  demoPill: { position: 'absolute', right: 12, top: 10, zIndex: 2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  demoPillText: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: .4, fontFamily: F.n900 },

  dot:     { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
  dotText: { color: 'white', fontFamily: F.n900, fontWeight: '900' },

  empty:      { alignItems: 'center', gap: 10, paddingVertical: 48, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 18, fontFamily: F.n900, fontWeight: '900' },
  emptySub:   { fontSize: 14, fontFamily: F.i500, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },

  fab: { position: 'absolute', bottom: 96, right: 22, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },

  overlay:   { position: 'absolute', inset: 0, justifyContent: 'flex-end' },
  overlayBg: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 24, paddingBottom: 40, gap: 4 },
  sheetTitle: { fontSize: 22, fontFamily: F.n900, fontWeight: '900', marginBottom: 4 },
  sheetDesc:  { fontSize: 14, fontFamily: F.i500, fontWeight: '500', lineHeight: 20, marginBottom: 8 },
  label:      { fontSize: 12, fontFamily: F.n900, fontWeight: '900', marginTop: 10, marginBottom: 4, letterSpacing: 0.3 },
  input:      { minHeight: 46, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 15, fontFamily: F.i500, fontWeight: '500' },
  sheetBtn:        { minHeight: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  sheetBtnText:    { color: 'white', fontSize: 15, fontFamily: F.n900, fontWeight: '900' },
  sheetCancel:     { alignItems: 'center', paddingVertical: 12 },
  sheetCancelText: { fontSize: 14, fontFamily: F.n800, fontWeight: '800' },
});
