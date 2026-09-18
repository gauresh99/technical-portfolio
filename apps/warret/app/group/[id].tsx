import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGroups } from '../../src/store/groups';
import { useProducts } from '../../src/store/products';
import { useAppTheme } from '../../src/store/theme';
import { purple } from '../../src/components/ui';
import { DEMO_GROUP, DEMO_PRODUCT } from '../../src/data/demo';
import type { GroupActivity, GroupMember, GroupRole, ProductPrivacy } from '../../src/data/groups';
import { F } from '../../src/theme/fonts';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRIVACY_ICONS:  Record<ProductPrivacy, string> = { public: 'earth-outline', private: 'lock-closed-outline', custom: 'people-outline' };
const PRIVACY_COLORS = {
  light: { public: '#17713A', private: '#A31212', custom: '#7C3AED' } as Record<ProductPrivacy, string>,
  dark:  { public: '#3D9B68', private: '#B85555', custom: '#9D71F5' } as Record<ProductPrivacy, string>,
};
const ROLE_COLORS = {
  light: { host: purple, adder: '#0D9488', viewer: '#8A8498' } as Record<GroupRole, string>,
  dark:  { host: '#9D71F5', adder: '#14B8A6', viewer: '#A09AB0' } as Record<GroupRole, string>,
};
const ROLE_ICONS:  Record<GroupRole, string> = { host: 'shield-checkmark-outline', adder: 'add-circle-outline', viewer: 'eye-outline' };
const ROLE_DESCS:  Record<GroupRole, string> = {
  host:   'Full access — add, remove, edit, manage members',
  adder:  'Can add products but cannot remove anything',
  viewer: 'Read-only — view products and download files',
};
const ACTIVITY_COLORS = {
  light: { product_added: '#059669', product_removed: '#DC2626', member_joined: '#2563EB', member_left: '#D97706', access_request: '#7C3AED' } as Record<GroupActivity['type'], string>,
  dark:  { product_added: '#3D9B68', product_removed: '#B85555', member_joined: '#5B9CF5', member_left: '#FBBF24', access_request: '#9D71F5' } as Record<GroupActivity['type'], string>,
};
function relativeTime(isoStr: string): string {
  const diff  = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'Just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function activityParts(act: GroupActivity): Array<{ text: string; accent?: boolean }> {
  switch (act.type) {
    case 'product_added':   return [{ text: `${act.actorName} ` }, { text: 'added', accent: true }, { text: ` ${act.targetName}` }];
    case 'product_removed': return [{ text: `${act.actorName} ` }, { text: 'removed', accent: true }, { text: ` ${act.targetName}` }];
    case 'member_joined':   return [{ text: `${act.actorName} ` }, { text: 'joined', accent: true }, { text: ` as ${act.meta ?? act.targetName}` }];
    case 'member_left':     return [{ text: `${act.actorName} ` }, { text: 'left', accent: true }, { text: ' the group' }];
    case 'access_request':  return [{ text: `${act.actorName} ` }, { text: 'requested', accent: true }, { text: ` ${act.meta ?? 'higher'} access` }];
  }
}

type PendingAction =
  | { type: 'delete-group';  id: string; name: string }
  | { type: 'remove-product'; id: string; name: string }
  | { type: 'remove-member'; id: string; name: string }
  | { type: 'leave-group';   id: string; name: string }
  | { type: 'rotate-link';   id: string; name: string };

export default function GroupDetail() {
  const { id }            = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useAppTheme();
  const privacyColors = isDark ? PRIVACY_COLORS.dark : PRIVACY_COLORS.light;
  const roleColors    = isDark ? ROLE_COLORS.dark    : ROLE_COLORS.light;
  const activityColors = isDark ? ACTIVITY_COLORS.dark : ACTIVITY_COLORS.light;
  const {
    groups, isHost, canAdd, canRemove, canView,
    generateInviteLink, regenerateInviteToken,
    removeProductFromGroup, setProductPrivacy,
    updateGroupInfo, updateGroupSettings, setGroupPasscode,
    updateMemberRole, removeMember, deleteGroup, addProductToGroup,
    requestHigherAccess, leaveGroup, myRole,
  } = useGroups();
  const { products } = useProducts();

  type Tab = 'products' | 'members' | 'activity';
  const [tab,              setTab]             = useState<Tab>('products');
  const [addOpen,          setAddOpen]         = useState(false);
  const [addMode,          setAddMode]         = useState<'choice' | 'existing'>('choice');
  const [privacyPicker,    setPrivacyPicker]   = useState<string | null>(null);
  const [customViewerPick, setCustomViewerPick]= useState<string[]>([]);
  const [rolePicker,       setRolePicker]      = useState<GroupMember | null>(null);
  const [pendingAction,    setPendingAction]   = useState<PendingAction | null>(null);
  const [memberPermTarget, setMemberPermTarget]= useState<GroupMember | null>(null);
  const [memberPermPick,   setMemberPermPick]  = useState<Record<string, string[]>>({});
  const [copiedRole,       setCopiedRole]      = useState<GroupRole | null>(null);
  const [editGroupOpen,    setEditGroupOpen]   = useState(false);
  const [editGroupName,    setEditGroupName]   = useState('');
  const [editGroupDesc,    setEditGroupDesc]   = useState('');
  const [passcodeEditMode, setPasscodeEditMode]= useState(false);
  const [passcodeDraft,    setPasscodeDraft]   = useState('');
  const [passcodeVisible,  setPasscodeVisible] = useState(false);
  const [accessRolePicker, setAccessRolePicker]= useState(false);

  // Shake-to-delete for product cards
  const [cardEditMode,   setCardEditMode]   = useState(false);
  const wiggle           = useRef(new Animated.Value(0)).current;
  const keepShakeAction  = useRef(false);

  // Android: hardware back key closes the topmost open sheet before navigating back
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pendingAction)       { setPendingAction(null);       return true; }
      if (memberPermTarget)    { setMemberPermTarget(null);    return true; }
      if (rolePicker)          { setRolePicker(null);          return true; }
      if (privacyPicker)       { setPrivacyPicker(null);       return true; }
      if (editGroupOpen)       { setEditGroupOpen(false);      return true; }
      if (passcodeEditMode)    { setPasscodeEditMode(false);   return true; }
      if (accessRolePicker)    { setAccessRolePicker(false);   return true; }
      if (addOpen)             { setAddOpen(false);            return true; }
      if (cardEditMode)        { setCardEditMode(false);       return true; }
      return false;
    });
    return () => sub.remove();
  }, [pendingAction, memberPermTarget, rolePicker, privacyPicker, editGroupOpen, passcodeEditMode, accessRolePicker, addOpen, cardEditMode]);

  useEffect(() => {
    if (!cardEditMode) { wiggle.stopAnimation(); wiggle.setValue(0); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(wiggle, { toValue: 1, duration: 78, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0, duration: 78, easing: Easing.linear, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [cardEditMode, wiggle]);

  const wiggleStyle = cardEditMode ? {
    transform: [
      { rotate: wiggle.interpolate({ inputRange: [0, 1], outputRange: ['-0.75deg', '0.75deg'] }) },
      { scale: 0.985 },
    ],
  } : undefined;

  const storedGroup = groups.find((g) => g.id === id);
  const isDemoGroup = id === DEMO_GROUP.id && groups.length === 0 && !storedGroup;
  const group = storedGroup || (isDemoGroup ? DEMO_GROUP : undefined);

  // Memos must be declared before any early return (Rules of Hooks)
  const visibleGroupProducts = useMemo(
    () => group?.products.filter((gp) => canView(group!, gp.productId)) ?? [],
    [group, canView],
  );
  const addableProducts = useMemo(
    () => products.filter((p) => !group?.products.find((gp) => gp.productId === p.id)),
    [products, group],
  );
  const sortedActivities = useMemo(
    () => [...(group?.activities ?? [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [group?.activities],
  );

  if (!group) return (
    <View style={[s.page, { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Group not found</Text>
      <Pressable onPress={() => router.replace('/groups')} style={{ marginTop: 16 }}>
        <Text style={{ color: purple, fontWeight: '900' }}>Go back</Text>
      </Pressable>
    </View>
  );

  const scale   = clamp(Math.min(width / 390, height / 844), 0.72, 1.08);
  const padH    = clamp(width * 0.055 * scale, 16, 24);
  const amHost  = !isDemoGroup && isHost(group);
  const amAdder = !isDemoGroup && canAdd(group);
  const role = myRole(group);
  const roleOrder: GroupRole[] = ['viewer', 'adder', 'host'];
  const requestableRoles = role ? roleOrder.slice(roleOrder.indexOf(role) + 1) : [];

  const productForId         = (pid: string) => products.find((p) => p.id === pid) || (isDemoGroup && pid === DEMO_PRODUCT.id ? DEMO_PRODUCT : undefined);
  const customProductsForMember = group.products.filter((gp) => gp.privacy === 'custom');


  const handleInvite = async (role: GroupRole, action: 'copy' | 'share') => {
    const link = generateInviteLink(group.id, role);
    if (action === 'copy') {
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(link);
        } else {
          await Share.share({ message: link, url: link });
        }
      } catch {}
      setCopiedRole(role);
      setTimeout(() => setCopiedRole(null), 2200);
    } else {
      try { await Share.share({ message: `Join "${group.name}" on Warret:\n${link}`, url: link }); } catch {}
    }
  };

  // ── Confirm-delete helpers ──────────────────────────────────────────────────
  const confirmAction = () => {
    if (!pendingAction || isDemoGroup) return;
    if (pendingAction.type === 'delete-group') {
      deleteGroup(group.id);
      setPendingAction(null);
      router.replace('/groups');
    } else if (pendingAction.type === 'remove-product') {
      removeProductFromGroup(group.id, pendingAction.id, pendingAction.name);
      setPendingAction(null);
      setCardEditMode(false);
    } else if (pendingAction.type === 'remove-member') {
      removeMember(group.id, pendingAction.id, pendingAction.name);
      setPendingAction(null);
    } else if (pendingAction.type === 'leave-group') {
      leaveGroup(group.id);
      setPendingAction(null);
      router.replace('/groups');
    } else if (pendingAction.type === 'rotate-link') {
      regenerateInviteToken(group.id);
      setPendingAction(null);
    }
  };

  // Privacy picker helpers
  const openPrivacyPicker = (productId: string) => {
    if (isDemoGroup) return;
    const gp = group.products.find((p) => p.productId === productId);
    setCustomViewerPick(gp?.customViewerIds ?? []);
    setPrivacyPicker(productId);
  };
  const savePrivacy = (privacy: ProductPrivacy) => {
    if (isDemoGroup) return;
    if (privacyPicker) setProductPrivacy(group.id, privacyPicker, privacy, privacy === 'custom' ? customViewerPick : []);
    setPrivacyPicker(null);
  };
  const privacyProduct = privacyPicker ? group.products.find((p) => p.productId === privacyPicker) : null;

  // Member permission modal (from activity feed)
  const openMemberPermissions = (member: GroupMember) => {
    if (isDemoGroup) return;
    const initialPick: Record<string, string[]> = {};
    group.products.filter((gp) => gp.privacy === 'custom').forEach((gp) => {
      initialPick[gp.productId] = [...gp.customViewerIds];
    });
    setMemberPermPick(initialPick);
    setMemberPermTarget(member);
  };
  const saveMemberPermissions = () => {
    if (isDemoGroup) return;
    if (!memberPermTarget) return;
    group.products.filter((gp) => gp.privacy === 'custom').forEach((gp) => {
      const ids = memberPermPick[gp.productId] ?? gp.customViewerIds;
      setProductPrivacy(group.id, gp.productId, 'custom', ids);
    });
    setMemberPermTarget(null);
  };

  // Open edit group info
  const openEditGroup = () => {
    if (isDemoGroup) return;
    setEditGroupName(group.name);
    setEditGroupDesc(group.description);
    setEditGroupOpen(true);
  };
  const saveGroupInfo = () => {
    if (isDemoGroup) return;
    if (editGroupName.trim()) updateGroupInfo(group.id, editGroupName, editGroupDesc);
    setEditGroupOpen(false);
  };
  const openAddSheet = () => {
    if (isDemoGroup) return;
    setAddMode('choice');
    setAddOpen(true);
  };

  // Pending-action label helpers for the delete modal
  const deleteTitle = pendingAction?.type === 'delete-group'  ? 'Delete group?'
                    : pendingAction?.type === 'remove-product' ? 'Remove product?'
                    : pendingAction?.type === 'remove-member'  ? 'Remove member?'
                    : pendingAction?.type === 'leave-group'    ? 'Leave group?'
                    : 'Rotate invite link?';
  const deleteBody  = pendingAction?.type === 'delete-group'  ? `"${pendingAction?.name}" and all its activity will be permanently deleted.`
                    : pendingAction?.type === 'remove-product' ? `"${pendingAction?.name}" will be removed from the group. It stays in your products list.`
                    : pendingAction?.type === 'remove-member'  ? `${pendingAction?.name} will be removed from the group.`
                    : pendingAction?.type === 'leave-group'    ? `You'll be removed from "${pendingAction?.name}". You'll need a new invite link to rejoin.`
                    : 'All existing invite links will stop working. You can share the new link from Members.';
  const deleteLabel = pendingAction?.type === 'delete-group'  ? 'Delete group'
                    : pendingAction?.type === 'remove-product' ? 'Remove product'
                    : pendingAction?.type === 'remove-member'  ? 'Remove member'
                    : pendingAction?.type === 'leave-group'    ? 'Leave group'
                    : 'Rotate link';
  const deleteColor = (pendingAction?.type === 'rotate-link') ? (isDark ? '#9D71F5' : '#7C3AED') : '#FF5A62';
  const deleteIconName = (pendingAction?.type === 'rotate-link') ? 'refresh-outline' : 'trash-outline';
  const deleteIconBg   = (pendingAction?.type === 'rotate-link') ? (isDark ? '#2E1F4A' : '#F3EEFF') : (isDark ? '#3A1A1F' : '#FFE9EC');

  return (
    <View
      style={[s.page, { backgroundColor: colors.page }]}
      onTouchEndCapture={() => {
        if (!cardEditMode) return;
        setTimeout(() => {
          if (keepShakeAction.current) { keepShakeAction.current = false; return; }
          setCardEditMode(false);
        }, 80);
      }}
    >
      {/* Full-screen shake exit layer — outside ScrollView so it truly covers everything */}
      {cardEditMode && (
        <Pressable
          style={s.shakeExitLayer}
          onPress={() => setCardEditMode(false)}
        />
      )}

      {/* Header + Tabs — primary color block matching the rest of the app */}
      <View style={[s.headerBlock, { backgroundColor: colors.primary, paddingHorizontal: padH }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.replace('/groups')} style={s.backBtn}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>{group.name}</Text>
            {group.description ? <Text style={s.sub} numberOfLines={1}>{group.description}</Text> : null}
          </View>
          {isDemoGroup ? (
            <Pressable onPress={() => router.replace({ pathname: '/groups', params: { create: '1' } })} style={s.demoHeaderCta}>
              <Text style={s.demoHeaderCtaText}>Create</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push(`/group/settings?id=${group.id}`)}
              style={s.backBtn}
            >
              <Ionicons name="settings-outline" size={17} color="white" />
            </Pressable>
          )}
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {([
            ['products', `Products (${visibleGroupProducts.length})`],
            ['members',  `Members (${group.members.length})`],
            ['activity', `Activity (${sortedActivities.length})`],
          ] as [Tab, string][]).map(([t, label]) => (
            <Pressable key={t} onPress={() => { setCardEditMode(false); setTab(t); }} style={[s.tab, tab === t && s.tabActive]}>
              <Text style={[s.tabText, { opacity: tab === t ? 1 : 0.6 }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: padH, paddingBottom: 110, gap: 12 }}
        onScrollBeginDrag={() => cardEditMode && setCardEditMode(false)}
      >
        {isDemoGroup ? (
          <View style={[s.demoNotice, { backgroundColor: colors.soft, borderColor: colors.border }]}>
            <Ionicons name="sparkles-outline" size={19} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.demoNoticeTitle, { color: colors.text }]}>Demo group</Text>
              <Text style={[s.demoNoticeText, { color: colors.muted }]}>
                Explore shared products, members and activity. This disappears once you create or join a real group.
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── PRODUCTS TAB ── */}
        {tab === 'products' && (
          <>
            {visibleGroupProducts.length === 0 && (
              <View style={[s.empty, { borderColor: colors.border }]}>
                <Ionicons name="cube-outline" size={30} color={colors.muted} />
                <Text style={[s.emptyTitle, { color: colors.text }]}>No products yet</Text>
                <Text style={[s.emptySub, { color: colors.muted }]}>
                  {amAdder ? 'Add products to share them with the group.' : "The host hasn't added any products visible to you."}
                </Text>
              </View>
            )}

            {visibleGroupProducts.map((gp) => {
              const product  = productForId(gp.productId);
              if (!product) return null;
              const addedBy  = group.members.find((m) => m.id === gp.addedById);
              return (
                <AnimatedPressable
                  key={gp.id}
                  style={[s.productCard, { backgroundColor: colors.card, borderColor: colors.border }, cardEditMode && s.productCardEditing, wiggleStyle]}
                  onPress={() => { if (cardEditMode) { setCardEditMode(false); return; } router.push(`/product/${product.id}`); }}
                  onLongPress={() => canRemove(group) && setCardEditMode(true)}
                  delayLongPress={500}
                >
                  {/* Delete button — inside card so it shakes in sync; card has NO overflow:hidden */}
                  {cardEditMode && canRemove(group) && (
                    <Pressable
                      onPressIn={() => { keepShakeAction.current = true; }}
                      onPress={(e) => { e.stopPropagation(); setPendingAction({ type: 'remove-product', id: gp.productId, name: product.name }); }}
                      style={s.deleteControl}
                    >
                      <Ionicons name="close" size={15} color="white" />
                    </Pressable>
                  )}

                  <View style={s.productCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.productName, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
                      <Text style={[s.productMeta, { color: colors.muted }]}>{product.brand}  ·  Expires {product.expires}</Text>
                      {addedBy && <Text style={[s.addedBy, { color: colors.muted }]}>Added by {addedBy.name}</Text>}
                    </View>
                    {/* Privacy badge — host taps to change */}
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); if (amHost && !cardEditMode) openPrivacyPicker(gp.productId); }}
                      style={[s.privacyBadge, { backgroundColor: privacyColors[gp.privacy] + '22' }]}
                    >
                      <Ionicons name={PRIVACY_ICONS[gp.privacy] as any} size={12} color={privacyColors[gp.privacy]} />
                      <Text style={[s.privacyText, { color: privacyColors[gp.privacy] }]}>{gp.privacy}</Text>
                    </Pressable>
                  </View>
                  {canRemove(group) && !cardEditMode && (
                    <View style={[s.holdHint, { borderTopColor: colors.border }]}>
                      <Ionicons name="hand-left-outline" size={11} color={colors.muted} />
                      <Text style={[s.holdHintText, { color: colors.muted }]}>Hold to remove</Text>
                    </View>
                  )}
                </AnimatedPressable>
              );
            })}

          </>
        )}

        {/* ── MEMBERS TAB ── */}
        {tab === 'members' && (
          <>
            {/* Invite section — ABOVE member list */}
            {amHost && (
              <View style={[s.inviteCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Text style={[s.inviteTitle, { color: colors.text }]}>Invite members</Text>
                <Text style={[s.inviteSub, { color: colors.muted }]}>
                  Share these links to invite people to your group. Host access can be granted later from member settings.
                </Text>
                {(['adder','viewer'] as GroupRole[]).map((role) => {
                  const isCopied = copiedRole === role;
                  return (
                    <View key={role} style={[s.inviteRow, { borderColor: colors.border }]}>
                      <View style={[s.inviteRoleChip, { backgroundColor: roleColors[role] + '18' }]}>
                        <Ionicons name={ROLE_ICONS[role] as any} size={13} color={roleColors[role]} />
                        <Text style={[s.inviteRoleText, { color: roleColors[role] }]}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleInvite(role, 'copy')}
                        style={[s.inviteActionBtn, { backgroundColor: isCopied ? (isDark ? '#1A3A29' : '#05996922') : colors.card, borderColor: isCopied ? (isDark ? '#3D9B68' : '#059669') : colors.border }]}
                      >
                        <Ionicons name={isCopied ? 'checkmark' : 'copy-outline'} size={14} color={isCopied ? (isDark ? '#3D9B68' : '#059669') : colors.text} />
                        <Text style={[s.inviteActionText, { color: isCopied ? (isDark ? '#3D9B68' : '#059669') : colors.text }]}>
                          {isCopied ? 'Copied!' : 'Copy'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleInvite(role, 'share')}
                        style={[s.inviteActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        <Ionicons name="share-outline" size={14} color={colors.text} />
                        <Text style={[s.inviteActionText, { color: colors.text }]}>Share</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Member list */}
            {group.members.map((member) => (
              <View key={member.id} style={[s.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.memberAvatar, { backgroundColor: member.color }]}>
                  <Text style={s.memberAvatarText}>{member.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.memberName, { color: colors.text }]}>
                    {member.name}{member.id === group.myMemberId ? ' (you)' : ''}
                  </Text>
                  <Text style={[s.memberJoined, { color: colors.muted }]}>Joined {member.joinedAt}</Text>
                </View>
                <Pressable
                  onPress={() => amHost && member.id !== group.myMemberId ? setRolePicker(member) : undefined}
                  style={[s.roleBadge, { backgroundColor: roleColors[member.role] + '20' }]}
                >
                  <Ionicons name={ROLE_ICONS[member.role] as any} size={12} color={roleColors[member.role]} />
                  <Text style={[s.roleBadgeText, { color: roleColors[member.role] }]}>{member.role}</Text>
                  {amHost && member.id !== group.myMemberId && (
                    <Ionicons name="chevron-down" size={10} color={roleColors[member.role]} />
                  )}
                </Pressable>
                {amHost && member.id !== group.myMemberId && (
                  <Pressable
                    onPress={() => setPendingAction({ type: 'remove-member', id: member.id, name: member.name })}
                    style={{ padding: 4, marginLeft: 6 }}
                  >
                    <Ionicons name="close-circle-outline" size={18} color={isDark ? '#B85555' : '#E0363E'} />
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── ACTIVITY TAB ── */}
        {tab === 'activity' && (
          <>
            {sortedActivities.length === 0 ? (
              <View style={[s.empty, { borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={30} color={colors.muted} />
                <Text style={[s.emptyTitle, { color: colors.text }]}>No activity yet</Text>
                <Text style={[s.emptySub, { color: colors.muted }]}>Events like adding products or members will appear here.</Text>
              </View>
            ) : sortedActivities.map((act) => {
              const color = activityColors[act.type];
              const label = activityParts(act).map((part) => part.text).join('');

              const isMemberJoined  = act.type === 'member_joined';
              const isAccessRequest = act.type === 'access_request';

              // Member joined → host can open file permission manager
              const memberForJoin = isMemberJoined ? group.members.find((m) => m.id === act.targetId) : undefined;
              const tappableJoin  = amHost && isMemberJoined && customProductsForMember.length > 0 && memberForJoin;

              // Access request → host can open role picker for that member
              const memberForRequest = isAccessRequest ? group.members.find((m) => m.id === act.actorId) : undefined;
              const tappableRequest  = amHost && isAccessRequest && memberForRequest;

              const tappable = tappableJoin || tappableRequest;
              return (
                <Pressable
                  key={act.id}
                  onPress={() => {
                    if (tappableJoin && memberForJoin) openMemberPermissions(memberForJoin);
                    else if (tappableRequest && memberForRequest) setRolePicker(memberForRequest);
                  }}
                  style={[s.activityRow, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.activityLabel, { color: colors.text }]}>{label}</Text>
                    <View style={s.activityMetaRow}>
                      <Text style={[s.activityTime, { color: colors.muted }]}>{relativeTime(act.timestamp)}</Text>
                      {tappableJoin    && <Text style={s.activityHint}>Manage file access</Text>}
                      {tappableRequest && <Text style={s.activityHint}>Change role</Text>}
                    </View>
                  </View>
                  <View style={[s.activityDot, { backgroundColor: color }]} />
                </Pressable>
              );
            })}
          </>
        )}

      </ScrollView>

      {/* ── ADD PRODUCT MODAL ── */}
      {addOpen && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => { setAddOpen(false); setAddMode('choice'); }} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '70%' }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Add product to group</Text>
            {addMode === 'choice' ? (
              <View style={{ gap: 10, marginTop: 10 }}>
                <Pressable
                  onPress={() => setAddMode('existing')}
                  style={[s.addChoice, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                >
                  <Ionicons name="folder-open-outline" size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.privacyOptionName, { color: colors.text }]}>Add existing product</Text>
                    <Text style={[s.privacyOptionDesc, { color: colors.muted }]}>Choose from your personal products directory.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.muted} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setAddOpen(false);
                    setAddMode('choice');
                    router.push({ pathname: '/add', params: { groupId: group.id, groupName: group.name } });
                  }}
                  style={[s.addChoice, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                >
                  <Ionicons name="sparkles-outline" size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.privacyOptionName, { color: colors.text }]}>Add a new product</Text>
                    <Text style={[s.privacyOptionDesc, { color: colors.muted }]}>Scan, upload, or enter warranty details for this group.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.muted} />
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable onPress={() => setAddMode('choice')} style={s.sheetBackLine}>
                  <Ionicons name="chevron-back" size={16} color={colors.primary} />
                  <Text style={[s.sheetBackText, { color: colors.primary }]}>Options</Text>
                </Pressable>
                <ScrollView style={{ flex: 1 }}>
                  {addableProducts.filter((p) => p.personal !== false).length === 0 ? (
                    <Text style={[s.emptySub, { color: colors.muted, textAlign: 'left', paddingHorizontal: 0 }]}>All your personal products are already in this group.</Text>
                  ) : addableProducts.filter((p) => p.personal !== false).map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => { addProductToGroup(group.id, p.id, 'public', p.name); setAddOpen(false); setAddMode('choice'); }}
                      style={[s.addRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.productName, { color: colors.text }]}>{p.name}</Text>
                        <Text style={[s.productMeta, { color: colors.muted }]}>{p.brand}</Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <Pressable onPress={() => { setAddOpen(false); setAddMode('choice'); }} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── PRIVACY PICKER MODAL ── */}
      {privacyPicker && privacyProduct && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setPrivacyPicker(null)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Set visibility</Text>
            <Text style={[s.sheetDesc, { color: colors.muted }]}>{productForId(privacyPicker)?.name}</Text>
            {(['public','private','custom'] as ProductPrivacy[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => p !== 'custom' ? savePrivacy(p) : setProductPrivacy(group.id, privacyPicker!, 'custom', customViewerPick)}
                style={[s.privacyOption, { backgroundColor: colors.cardAlt, borderColor: privacyProduct.privacy === p ? privacyColors[p] : colors.border }]}
              >
                <Ionicons name={PRIVACY_ICONS[p] as any} size={18} color={privacyColors[p]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.privacyOptionName, { color: colors.text }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                  <Text style={[s.privacyOptionDesc, { color: colors.muted }]}>
                    {p === 'public'  ? 'Everyone in the group can see this' :
                     p === 'private' ? 'Only hosts can see this' :
                                      'You choose who can see this'}
                  </Text>
                </View>
                {privacyProduct.privacy === p && <Ionicons name="checkmark-circle" size={20} color={privacyColors[p]} />}
              </Pressable>
            ))}
            {privacyProduct.privacy === 'custom' && (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={[s.label, { color: colors.muted }]}>Who can view:</Text>
                {group.members.filter((m) => m.role !== 'host').map((m) => {
                  const checked = customViewerPick.includes(m.id);
                  return (
                    <Pressable key={m.id} onPress={() => setCustomViewerPick(checked ? customViewerPick.filter((x) => x !== m.id) : [...customViewerPick, m.id])} style={[s.customViewerRow, { borderColor: colors.border }]}>
                      <View style={[s.memberAvatar, { backgroundColor: m.color, width: 28, height: 28, borderRadius: 14 }]}>
                        <Text style={[s.memberAvatarText, { fontSize: 12 }]}>{m.name[0]}</Text>
                      </View>
                      <Text style={[s.memberName, { color: colors.text, flex: 1 }]}>{m.name}</Text>
                      <View style={[s.checkbox, checked && { backgroundColor: purple, borderColor: purple }]}>
                        {checked && <Ionicons name="checkmark" size={12} color="white" />}
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => savePrivacy('custom')} style={[s.sheetBtn, { backgroundColor: purple }]}>
                  <Text style={s.sheetBtnText}>Save custom viewers</Text>
                </Pressable>
              </View>
            )}
            <Pressable onPress={() => setPrivacyPicker(null)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── ROLE PICKER MODAL (host changes a member's role, or from access_request) ── */}
      {rolePicker && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setRolePicker(null)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.rolePickerHeader}>
              <View style={[s.memberAvatar, { backgroundColor: rolePicker.color, width: 40, height: 40, borderRadius: 20 }]}>
                <Text style={[s.memberAvatarText, { fontSize: 16 }]}>{rolePicker.name[0]}</Text>
              </View>
              <View>
                <Text style={[s.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Change role</Text>
                <Text style={[s.sheetDesc, { color: colors.muted, marginBottom: 0 }]}>{rolePicker.name}</Text>
              </View>
            </View>
            {(['host','adder','viewer'] as GroupRole[]).map((role) => {
              const active = rolePicker.role === role;
              return (
                <Pressable
                  key={role}
                  onPress={() => { updateMemberRole(group.id, rolePicker.id, role); setRolePicker(null); }}
                  style={[s.privacyOption, { backgroundColor: active ? roleColors[role] + '15' : colors.cardAlt, borderColor: active ? roleColors[role] : colors.border }]}
                >
                  <Ionicons name={ROLE_ICONS[role] as any} size={18} color={roleColors[role]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.privacyOptionName, { color: colors.text }]}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
                    <Text style={[s.privacyOptionDesc, { color: colors.muted }]}>{ROLE_DESCS[role]}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={20} color={roleColors[role]} />}
                </Pressable>
              );
            })}
            <Pressable onPress={() => setRolePicker(null)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── REQUEST HIGHER ACCESS ROLE PICKER ── */}
      {accessRolePicker && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setAccessRolePicker(false)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Request higher access</Text>
            <Text style={[s.sheetDesc, { color: colors.muted }]}>
              The host will see your request in the Activity tab and can update your role.
            </Text>
            {requestableRoles.map((role) => (
              <Pressable
                key={role}
                onPress={() => {
                  requestHigherAccess(group.id, role);
                  setAccessRolePicker(false);
                  setTab('activity');
                }}
                style={[s.privacyOption, { backgroundColor: roleColors[role] + '10', borderColor: roleColors[role] + '44' }]}
              >
                <Ionicons name={ROLE_ICONS[role] as any} size={18} color={roleColors[role]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.privacyOptionName, { color: colors.text }]}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
                  <Text style={[s.privacyOptionDesc, { color: colors.muted }]}>{ROLE_DESCS[role]}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={roleColors[role]} />
              </Pressable>
            ))}
            <Pressable onPress={() => setAccessRolePicker(false)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── MEMBER PERMISSIONS MODAL (from activity feed) ── */}
      {memberPermTarget && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setMemberPermTarget(null)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '80%' }]}>
            <View style={s.rolePickerHeader}>
              <View style={[s.memberAvatar, { backgroundColor: memberPermTarget.color, width: 40, height: 40, borderRadius: 20 }]}>
                <Text style={[s.memberAvatarText, { fontSize: 16 }]}>{memberPermTarget.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.sheetTitle, { color: colors.text, marginBottom: 0 }]}>File access</Text>
                <Text style={[s.sheetDesc, { color: colors.muted, marginBottom: 0 }]}>{memberPermTarget.name}</Text>
              </View>
            </View>
            <Text style={[s.memberPermSubtitle, { color: colors.muted }]}>
              Toggle which custom-visibility products {memberPermTarget.name} can see:
            </Text>
            <ScrollView style={{ flex: 1, marginTop: 8 }}>
              {customProductsForMember.length === 0 ? (
                <Text style={[s.emptySub, { color: colors.muted, textAlign: 'left' }]}>No custom-visibility products in this group.</Text>
              ) : customProductsForMember.map((gp) => {
                const prod    = productForId(gp.productId);
                const currIds = memberPermPick[gp.productId] ?? gp.customViewerIds;
                const checked = currIds.includes(memberPermTarget.id);
                return (
                  <Pressable
                    key={gp.productId}
                    onPress={() => setMemberPermPick((prev) => ({
                      ...prev,
                      [gp.productId]: checked ? currIds.filter((x) => x !== memberPermTarget.id) : [...currIds, memberPermTarget.id],
                    }))}
                    style={[s.customViewerRow, { borderColor: colors.border, paddingVertical: 10 }]}
                  >
                    <Ionicons name="cube-outline" size={16} color={colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.memberName, { color: colors.text }]}>{prod?.name ?? gp.productId}</Text>
                      <Text style={[s.memberJoined, { color: colors.muted }]}>{prod?.brand}</Text>
                    </View>
                    <View style={[s.checkbox, checked && { backgroundColor: purple, borderColor: purple }]}>
                      {checked && <Ionicons name="checkmark" size={12} color="white" />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={saveMemberPermissions} style={[s.sheetBtn, { backgroundColor: purple, marginTop: 16 }]}>
              <Text style={s.sheetBtnText}>Save access</Text>
            </Pressable>
            <Pressable onPress={() => setMemberPermTarget(null)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── EDIT GROUP INFO MODAL ── */}
      {editGroupOpen && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setEditGroupOpen(false)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Edit group info</Text>
            <Text style={[s.label, { color: colors.muted, marginBottom: 4 }]}>Name</Text>
            <TextInput
              value={editGroupName}
              onChangeText={setEditGroupName}
              placeholder="Group name"
              placeholderTextColor={colors.muted}
              style={[s.editInput, { backgroundColor: colors.cardAlt, borderColor: colors.border, color: colors.text }]}
            />
            <Text style={[s.label, { color: colors.muted, marginTop: 10, marginBottom: 4 }]}>Description</Text>
            <TextInput
              value={editGroupDesc}
              onChangeText={setEditGroupDesc}
              placeholder="Optional description"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              style={[s.editInput, { backgroundColor: colors.cardAlt, borderColor: colors.border, color: colors.text, minHeight: 72 }]}
            />
            <Pressable onPress={saveGroupInfo} style={[s.sheetBtn, { backgroundColor: purple, marginTop: 16 }]}>
              <Text style={s.sheetBtnText}>Save</Text>
            </Pressable>
            <Pressable onPress={() => setEditGroupOpen(false)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── PASSCODE EDIT MODAL ── */}
      {passcodeEditMode && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setPasscodeEditMode(false)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Group passcode</Text>
            <Text style={[s.sheetDesc, { color: colors.muted }]}>Leave empty to remove the passcode requirement.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput
                value={passcodeDraft}
                onChangeText={setPasscodeDraft}
                placeholder="Set a passcode…"
                placeholderTextColor={colors.muted}
                secureTextEntry={!passcodeVisible}
                style={[s.editInput, { flex: 1, backgroundColor: colors.cardAlt, borderColor: colors.border, color: colors.text }]}
              />
              <Pressable
                onPress={() => setPasscodeVisible((p) => !p)}
                style={[s.passEye, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
              >
                <Ionicons name={passcodeVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => { setGroupPasscode(group.id, passcodeDraft); setPasscodeEditMode(false); }}
              style={[s.sheetBtn, { backgroundColor: purple, marginTop: 16 }]}
            >
              <Text style={s.sheetBtnText}>{passcodeDraft.trim() ? 'Set passcode' : 'Remove passcode'}</Text>
            </Pressable>
            <Pressable onPress={() => setPasscodeEditMode(false)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── ADD PRODUCT FAB ── */}
      {tab === 'products' && amAdder && !cardEditMode && !addOpen && (
        <Pressable
          onPress={openAddSheet}
          style={[s.fab, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="add" size={28} color="white" />
        </Pressable>
      )}

      {/* ── DELETE / REMOVE / LEAVE / ROTATE CONFIRM MODAL ── */}
      <Modal visible={pendingAction !== null} transparent animationType="fade" onRequestClose={() => setPendingAction(null)}>
        <View style={s.deleteBackdrop}>
          <View style={[s.deletePrompt, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.deleteIconWrap, { backgroundColor: deleteIconBg }]}>
              <Ionicons name={deleteIconName as any} size={23} color={deleteColor} />
            </View>
            <Text style={[s.deleteTitle, { color: colors.text }]}>{deleteTitle}</Text>
            <Text style={[s.deleteBody, { color: colors.muted }]}>{deleteBody}</Text>
            <Pressable onPress={confirmAction} style={[s.deletePrimary, { backgroundColor: deleteColor }]}>
              <Text style={s.deletePrimaryText}>{deleteLabel}</Text>
            </Pressable>
            <Pressable onPress={() => setPendingAction(null)} style={[s.deleteSecondary, { backgroundColor: colors.soft }]}>
              <Text style={[s.deleteSecondaryText, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  page:        { flex: 1 },
  headerBlock: { paddingTop: 58, paddingBottom: 0, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 24 },
  backBtn:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.28)' },
  backBtnActive: { backgroundColor: 'rgba(255,255,255,0.32)' },
  demoHeaderCta: { minHeight: 38, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.28)' },
  demoHeaderCtaText: { color: 'white', fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900 },
  title:  { fontSize: 36, lineHeight: 43, fontWeight: '900', color: 'white', fontFamily: F.n900 },
  sub:    { fontSize: 16, lineHeight: 21, fontWeight: '800', marginTop: 3, color: '#D7D1FF', fontFamily: F.n800 },

  tabs:      { flexDirection: 'row', paddingBottom: 0 },
  tab:       { paddingVertical: 14, paddingHorizontal: 4, marginRight: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: 'white' },
  tabText:   { fontSize: 12, fontWeight: '900', color: 'white', fontFamily: F.n900 },

  shakeExitLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 6 },

  fab: { position: 'absolute', bottom: 32, right: 24, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', zIndex: 20, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },

  empty:     { alignItems: 'center', gap: 8, paddingVertical: 40, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 16, fontWeight: '900', fontFamily: F.n900 },
  emptySub:   { fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 18, paddingHorizontal: 24, fontFamily: F.i700 },
  demoNotice: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  demoNoticeTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  demoNoticeText: { fontSize: 12, lineHeight: 17, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },

  productCard:        { borderRadius: 18, borderWidth: 1 },
  productCardEditing: { zIndex: 8 },
  productCardTop: { padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  productName: { fontSize: 15, fontWeight: '900', lineHeight: 20, fontFamily: F.n900 },
  productMeta: { fontSize: 12, fontWeight: '700', marginTop: 2, fontFamily: F.i700 },
  addedBy:     { fontSize: 11, fontWeight: '700', marginTop: 3, fontStyle: 'italic', fontFamily: F.i700 },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  privacyText:  { fontSize: 11, fontWeight: '900', fontFamily: F.n900 },
  holdHint:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderTopWidth: 1 },
  holdHintText: { fontSize: 11, fontWeight: '500', fontFamily: F.i500 },
  deleteControl: { position: 'absolute', left: -7, top: -7, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5A62', zIndex: 10, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  memberCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  memberAvatar:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: 'white', fontWeight: '900', fontSize: 15, fontFamily: F.n900 },
  memberName:       { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  memberJoined:     { fontSize: 11, fontWeight: '700', marginTop: 2, fontFamily: F.i700 },
  roleBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  roleBadgeText: { fontSize: 11, fontWeight: '900', fontFamily: F.n900 },

  inviteCard:  { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  inviteTitle: { fontSize: 15, fontWeight: '900', fontFamily: F.n900 },
  inviteSub:   { fontSize: 12, fontWeight: '700', lineHeight: 17, fontFamily: F.i700 },
  inviteRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, borderTopWidth: 1 },
  inviteRoleChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, flex: 1 },
  inviteRoleText:   { fontSize: 12, fontWeight: '900', fontFamily: F.n900 },
  inviteActionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  inviteActionText: { fontSize: 12, fontWeight: '900', fontFamily: F.n900 },

  activityRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 20, borderWidth: 1, borderTopLeftRadius: 6 },
  activityDot: { width: 6, height: 6, borderRadius: 3, opacity: .72, flexShrink: 0 },
  activityLabel: { fontSize: 14, fontWeight: '800', lineHeight: 20, fontFamily: F.n800 },
  activityMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  activityTime:  { fontSize: 11, lineHeight: 15, fontFamily: F.i500, fontWeight: '500' },
  activityHint:  { fontSize: 11, lineHeight: 15, fontFamily: F.i500, fontWeight: '500', color: '#7D758B', textDecorationLine: 'underline' },

  // Settings tab
  settingsSectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 8, marginBottom: 2, paddingHorizontal: 4, fontFamily: F.n900 },
  settingsCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1 },
  settingsRowLabel: { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  settingsRowSub:   { fontSize: 11, fontWeight: '700', marginTop: 2, lineHeight: 15, fontFamily: F.i700 },
  settingsChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  settingsChipText: { fontSize: 12, fontWeight: '900', fontFamily: F.n900 },
  settingsDndRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  settingsDndLabel: { fontSize: 12, fontWeight: '500', fontFamily: F.i500 },
  dndTimeInput: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, fontSize: 14, fontWeight: '900', minWidth: 64, textAlign: 'center', fontFamily: F.n900 },
  settingsActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  settingsActionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dangerBtn: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  dangerBtnLabel: { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  dangerBtnSub:   { fontSize: 11, fontWeight: '700', marginTop: 2, lineHeight: 15, fontFamily: F.i700 },

  rolePickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },

  privacyOption:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, marginTop: 8 },
  privacyOptionName: { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  privacyOptionDesc: { fontSize: 12, fontWeight: '700', marginTop: 2, lineHeight: 16, fontFamily: F.i700 },
  customViewerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#C4BFDA', alignItems: 'center', justifyContent: 'center' },
  memberPermSubtitle: { fontSize: 13, fontWeight: '700', lineHeight: 18, fontFamily: F.i700 },

  overlay:   { position: 'absolute', inset: 0, justifyContent: 'flex-end' },
  overlayBg: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 20, fontWeight: '900', marginBottom: 4, fontFamily: F.n900 },
  sheetDesc:  { fontSize: 13, fontWeight: '700', marginBottom: 8, fontFamily: F.i700 },
  sheetBtn:   { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  sheetBtnText: { color: 'white', fontSize: 15, fontWeight: '900', fontFamily: F.n900 },
  sheetCancel:     { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  sheetCancelText: { fontSize: 14, fontWeight: '800', fontFamily: F.n800 },
  label:   { fontSize: 12, fontWeight: '900', letterSpacing: 0.3, fontFamily: F.n900 },
  addChoice: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  sheetBackLine: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, marginBottom: 2 },
  sheetBackText: { fontSize: 13, fontWeight: '900', fontFamily: F.n900 },
  addRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  editInput: { minHeight: 46, borderRadius: 13, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 15, fontWeight: '500', fontFamily: F.i500 },
  passEye:  { width: 46, height: 46, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Delete confirm modal — same style as products.tsx
  deleteBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  deletePrompt:      { width: '100%', maxWidth: 320, borderRadius: 22, borderWidth: 1, padding: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: .13, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  deleteIconWrap:    { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  deleteTitle:       { fontSize: 20, lineHeight: 25, fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  deleteBody:        { fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 7, marginBottom: 16, fontFamily: F.i700 },
  deletePrimary:     { width: '100%', minHeight: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  deletePrimaryText: { color: 'white', fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  deleteSecondary:   { width: '100%', minHeight: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  deleteSecondaryText: { fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
});
