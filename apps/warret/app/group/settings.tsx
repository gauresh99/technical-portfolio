import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGroups } from '../../src/store/groups';
import { useProducts } from '../../src/store/products';
import { useAppTheme } from '../../src/store/theme';
import { purple } from '../../src/components/ui';
import { DEFAULT_SETTINGS } from '../../src/data/groups';
import type { GroupRole } from '../../src/data/groups';
import { safeBack } from '../../src/utils/navigation';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const ROLE_COLORS: Record<GroupRole, string> = { host: purple, adder: '#0D9488', viewer: '#8A8498' };
const ROLE_ICONS:  Record<GroupRole, string> = { host: 'shield-checkmark-outline', adder: 'add-circle-outline', viewer: 'eye-outline' };
const ROLE_DESCS:  Record<GroupRole, string> = {
  host:   'Full access — add, remove, edit, manage members',
  adder:  'Can add products but cannot remove anything',
  viewer: 'Read-only — view products and download files',
};

type PendingDelete = { type: 'delete' | 'leave'; name: string };

export default function GroupSettings() {
  const { id }            = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const { colors }        = useAppTheme();
  const {
    groups, myId,
    isHost, myRole,
    updateGroupInfo, updateGroupSettings,
    setGroupPasscode,
    setGroupMergeAll, setProductMerged,
    regenerateInviteToken,
    requestHigherAccess,
    deleteGroup, leaveGroup,
  } = useGroups();
  const { products, updateProduct } = useProducts();

  const group = groups.find((g) => g.id === id);

  const [editGroupOpen,  setEditGroupOpen]  = useState(false);
  const [editGroupName,  setEditGroupName]  = useState('');
  const [editGroupDesc,  setEditGroupDesc]  = useState('');
  const [passcodeEditMode, setPasscodeEditMode] = useState(false);
  const [passcodeDraft,    setPasscodeDraft]    = useState('');
  const [passcodeVisible,  setPasscodeVisible]  = useState(false);
  const [accessRolePicker, setAccessRolePicker] = useState(false);
  const [localProductsOpen, setLocalProductsOpen] = useState(false);
  const [pendingDelete,    setPendingDelete]    = useState<PendingDelete | null>(null);

  const scale = clamp(Math.min(width / 390, height / 844), 0.72, 1.08);
  const padH  = clamp(width * 0.055 * scale, 16, 24);

  if (!group) return (
    <View style={[s.page, { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Group not found</Text>
      <Pressable onPress={() => router.replace('/groups')} style={{ marginTop: 16 }}>
        <Text style={{ color: purple, fontWeight: '900' }}>Go back</Text>
      </Pressable>
    </View>
  );

  const amHost   = isHost(group);
  const role     = myRole(group);
  const settings = group.settings ?? DEFAULT_SETTINGS;
  const groupProductDetails = group.products
    .map((gp) => ({ link: gp, product: products.find((p) => p.id === gp.productId) }))
    .filter((item): item is { link: typeof group.products[number]; product: NonNullable<typeof item.product> } => !!item.product);
  const localProductCount = groupProductDetails.filter(({ product, link }) => product.personal !== false && (group.mergeAllToMain || link.mergedToMain)).length;
  const allProductsLocal = groupProductDetails.length > 0 && localProductCount === groupProductDetails.length;

  const roleOrder: GroupRole[] = ['viewer', 'adder', 'host'];
  const requestableRoles = role ? roleOrder.slice(roleOrder.indexOf(role) + 1) : [];

  const openEditGroup = () => {
    setEditGroupName(group.name);
    setEditGroupDesc(group.description);
    setEditGroupOpen(true);
  };
  const saveGroupInfo = () => {
    if (editGroupName.trim()) updateGroupInfo(group.id, editGroupName, editGroupDesc);
    setEditGroupOpen(false);
  };
  const setGroupProductLocal = (productId: string, local: boolean) => {
    updateProduct(productId, { personal: local });
    setProductMerged(group.id, productId, local);
    const nextLocalCount = groupProductDetails.reduce((total, item) => {
      const isLocal = item.product.id === productId
        ? local
        : item.product.personal !== false && (group.mergeAllToMain || item.link.mergedToMain);
      return total + (isLocal ? 1 : 0);
    }, 0);
    setGroupMergeAll(group.id, groupProductDetails.length > 0 && nextLocalCount === groupProductDetails.length);
  };
  const setAllGroupProductsLocal = (local: boolean) => {
    setGroupMergeAll(group.id, local);
    groupProductDetails.forEach(({ product }) => updateProduct(product.id, { personal: local }));
    group.products.forEach((gp) => setProductMerged(group.id, gp.productId, local));
  };

  const confirmRotateInvite = () => {
    Alert.alert(
      'Rotate invite link?',
      'Current invite links will stop working. People will need the new link to join.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rotate', style: 'destructive', onPress: () => regenerateInviteToken(group.id) },
      ],
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'delete') {
      deleteGroup(group.id);
      router.replace('/groups');
    } else {
      leaveGroup(group.id);
      router.replace('/groups');
    }
    setPendingDelete(null);
  };

  return (
    <View style={[s.page, { backgroundColor: colors.page }]}>
      {/* Header */}
      <View style={[s.headerBlock, { backgroundColor: colors.primary, paddingHorizontal: padH }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.replace(`/group/${group.id}`)} style={s.backBtn}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle} numberOfLines={1}>{group.name}</Text>
            <Text style={s.headerSub}>Group settings</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: padH, paddingBottom: 110, gap: 12 }}>

        {/* ── General ── */}
        <Text style={[s.sectionLabel, { color: colors.muted }]}>GENERAL</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={() => setLocalProductsOpen(true)} style={[s.row, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Save group products locally</Text>
              <Text style={[s.rowSub, { color: colors.muted }]}>
                {groupProductDetails.length === 0
                  ? 'No products in this group yet'
                  : `${localProductCount}/${groupProductDetails.length} products shown in your Products page`}
              </Text>
            </View>
            <Pressable
              onPress={() => setLocalProductsOpen(true)}
              style={[s.chip, { backgroundColor: colors.soft, borderColor: colors.border }]}
            >
              <Text style={[s.chipText, { color: colors.primary }]}>Choose</Text>
            </Pressable>
            <Switch
              value={allProductsLocal}
              onValueChange={setAllGroupProductsLocal}
              trackColor={{ true: purple, false: colors.border }}
              thumbColor="white"
            />
          </Pressable>
        </View>

        {/* ── Notifications ── */}
        <Text style={[s.sectionLabel, { color: colors.muted }]}>NOTIFICATIONS</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.row, { borderBottomColor: colors.border, borderBottomWidth: settings.notificationsEnabled ? 1 : 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Enable notifications</Text>
              <Text style={[s.rowSub, { color: colors.muted }]}>Saves group activity preferences. Push/email delivery needs the production notification worker.</Text>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(v) => updateGroupSettings(group.id, { notificationsEnabled: v })}
              trackColor={{ true: purple, false: colors.border }}
              thumbColor="white"
            />
          </View>

          {settings.notificationsEnabled && (
            <>
              <View style={[s.row, { borderBottomColor: colors.border, borderBottomWidth: settings.dndEnabled ? 1 : 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { color: colors.text }]}>Do not disturb</Text>
                  <Text style={[s.rowSub, { color: colors.muted }]}>Pause notifications during quiet hours</Text>
                </View>
                <Switch
                  value={settings.dndEnabled}
                  onValueChange={(v) => updateGroupSettings(group.id, { dndEnabled: v })}
                  trackColor={{ true: purple, false: colors.border }}
                  thumbColor="white"
                />
              </View>

              {settings.dndEnabled && (
                <View style={s.dndRow}>
                  <Ionicons name="moon-outline" size={15} color={purple} />
                  <Text style={[s.dndLabel, { color: colors.muted }]}>Quiet from</Text>
                  <TextInput
                    value={settings.dndStart}
                    onChangeText={(v) => updateGroupSettings(group.id, { dndStart: v })}
                    placeholder="22:00"
                    placeholderTextColor={colors.muted}
                    style={[s.timeInput, { color: colors.text, backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                  />
                  <Text style={[s.dndLabel, { color: colors.muted }]}>to</Text>
                  <TextInput
                    value={settings.dndEnd}
                    onChangeText={(v) => updateGroupSettings(group.id, { dndEnd: v })}
                    placeholder="08:00"
                    placeholderTextColor={colors.muted}
                    style={[s.timeInput, { color: colors.text, backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Host management ── */}
        {amHost && (
          <>
            <Text style={[s.sectionLabel, { color: colors.muted }]}>GROUP MANAGEMENT</Text>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable onPress={openEditGroup} style={[s.row, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { color: colors.text }]}>Group name & description</Text>
                  <Text style={[s.rowSub, { color: colors.muted }]} numberOfLines={1}>{group.name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>

              <View style={[s.row, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { color: colors.text }]}>Lock group</Text>
                  <Text style={[s.rowSub, { color: colors.muted }]}>Prevent new members from joining</Text>
                </View>
                <Switch
                  value={settings.locked}
                  onValueChange={(v) => updateGroupSettings(group.id, { locked: v })}
                  trackColor={{ true: '#FF5A62', false: colors.border }}
                  thumbColor="white"
                />
              </View>

              <View style={[s.row, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { color: colors.text }]}>Group passcode</Text>
                  <Text style={[s.rowSub, { color: colors.muted }]}>
                    {settings.passcode ? 'Required to join — tap to change' : 'No passcode — tap to add one'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => { setPasscodeDraft(''); setPasscodeEditMode(true); }}
                  style={[s.chip, { backgroundColor: settings.passcode ? purple + '18' : colors.cardAlt, borderColor: settings.passcode ? purple + '44' : colors.border }]}
                >
                  <Ionicons name={settings.passcode ? 'lock-closed' : 'lock-open-outline'} size={13} color={settings.passcode ? purple : colors.muted} />
                  <Text style={[s.chipText, { color: settings.passcode ? purple : colors.muted }]}>
                    {settings.passcode ? 'Set' : 'None'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={confirmRotateInvite}
              style={[s.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[s.actionIcon, { backgroundColor: '#7C3AED18' }]}>
                <Ionicons name="refresh-outline" size={17} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, { color: colors.text }]}>Rotate invite link</Text>
                <Text style={[s.rowSub, { color: colors.muted }]}>Invalidate all current links and generate new ones</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.muted} />
            </Pressable>
          </>
        )}

        {/* ── Non-host: request higher access ── */}
        {!amHost && requestableRoles.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: colors.muted }]}>ACCESS</Text>
            <Pressable
              onPress={() => setAccessRolePicker(true)}
              style={[s.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[s.actionIcon, { backgroundColor: purple + '18' }]}>
                <Ionicons name="arrow-up-circle-outline" size={17} color={purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, { color: colors.text }]}>Request higher access</Text>
                <Text style={[s.rowSub, { color: colors.muted }]}>Ask the host to upgrade your role</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.muted} />
            </Pressable>
          </>
        )}

        {/* Delete / Leave */}
        {amHost ? (
          <Pressable
            onPress={() => setPendingDelete({ type: 'delete', name: group.name })}
            style={[s.dangerBtn, { backgroundColor: '#FFE9EC', borderColor: '#FF5A6244' }]}
          >
            <Ionicons name="trash-outline" size={17} color="#E0363E" />
            <View style={{ flex: 1 }}>
              <Text style={[s.dangerLabel, { color: '#E0363E' }]}>Delete group</Text>
              <Text style={[s.dangerSub, { color: '#E0363E99' }]}>Permanently deletes the group, members, activity and shared links</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setPendingDelete({ type: 'leave', name: group.name })}
            style={[s.dangerBtn, { backgroundColor: '#FFE9EC', borderColor: '#FF5A6244' }]}
          >
            <Ionicons name="exit-outline" size={17} color="#E0363E" />
            <View style={{ flex: 1 }}>
              <Text style={[s.dangerLabel, { color: '#E0363E' }]}>Leave group</Text>
              <Text style={[s.dangerSub, { color: '#E0363E99' }]}>You'll need a new invite link to rejoin</Text>
            </View>
          </Pressable>
        )}
      </ScrollView>

      {/* ── Edit group info sheet ── */}
      {editGroupOpen && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setEditGroupOpen(false)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Edit group info</Text>
            <Text style={[s.sheetLabel, { color: colors.muted }]}>Name</Text>
            <TextInput
              value={editGroupName} onChangeText={setEditGroupName}
              placeholder="Group name" placeholderTextColor={colors.muted}
              style={[s.input, { backgroundColor: colors.cardAlt, borderColor: colors.border, color: colors.text }]}
            />
            <Text style={[s.sheetLabel, { color: colors.muted }]}>Description</Text>
            <TextInput
              value={editGroupDesc} onChangeText={setEditGroupDesc}
              placeholder="Optional description" placeholderTextColor={colors.muted}
              multiline numberOfLines={2}
              style={[s.input, { backgroundColor: colors.cardAlt, borderColor: colors.border, color: colors.text, minHeight: 72 }]}
            />
            <Pressable onPress={saveGroupInfo} style={[s.sheetBtn, { backgroundColor: purple }]}>
              <Text style={s.sheetBtnText}>Save</Text>
            </Pressable>
            <Pressable onPress={() => setEditGroupOpen(false)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Passcode sheet ── */}
      {passcodeEditMode && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setPasscodeEditMode(false)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Group passcode</Text>
            <Text style={[s.sheetDesc, { color: colors.muted }]}>Leave empty to remove the passcode requirement.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={passcodeDraft} onChangeText={setPasscodeDraft}
                placeholder="Set a passcode…" placeholderTextColor={colors.muted}
                secureTextEntry={!passcodeVisible}
                style={[s.input, { flex: 1, backgroundColor: colors.cardAlt, borderColor: colors.border, color: colors.text }]}
              />
              <Pressable
                onPress={() => setPasscodeVisible((p) => !p)}
                style={[s.eyeBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
              >
                <Ionicons name={passcodeVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => { setGroupPasscode(group.id, passcodeDraft); setPasscodeEditMode(false); }}
              style={[s.sheetBtn, { backgroundColor: purple }]}
            >
              <Text style={s.sheetBtnText}>{passcodeDraft.trim() ? 'Set passcode' : 'Remove passcode'}</Text>
            </Pressable>
            <Pressable onPress={() => setPasscodeEditMode(false)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Request higher access picker ── */}
      {accessRolePicker && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setAccessRolePicker(false)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Request higher access</Text>
            <Text style={[s.sheetDesc, { color: colors.muted }]}>
              The host will see your request in the Activity tab and can update your role.
            </Text>
            {requestableRoles.map((r) => (
              <Pressable
                key={r}
                onPress={() => {
                  requestHigherAccess(group.id, r);
                  setAccessRolePicker(false);
                  safeBack(`/group/${group.id}`);
                }}
                style={[s.roleOption, { backgroundColor: ROLE_COLORS[r] + '10', borderColor: ROLE_COLORS[r] + '44' }]}
              >
                <Ionicons name={ROLE_ICONS[r] as any} size={18} color={ROLE_COLORS[r]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.roleOptionName, { color: colors.text }]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                  <Text style={[s.roleOptionDesc, { color: colors.muted }]}>{ROLE_DESCS[r]}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={ROLE_COLORS[r]} />
              </Pressable>
            ))}
            <Pressable onPress={() => setAccessRolePicker(false)} style={s.sheetCancel}>
              <Text style={[s.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Local product selector ── */}
      {localProductsOpen && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setLocalProductsOpen(false)} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Save products locally</Text>
            <Text style={[s.sheetDesc, { color: colors.muted }]}>
              Choose which products from {group.name} should appear in your personal Products page.
            </Text>

            <View style={[s.localSummary, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, { color: colors.text }]}>Save all products</Text>
                <Text style={[s.rowSub, { color: colors.muted }]}>{localProductCount}/{groupProductDetails.length} selected</Text>
              </View>
              <Switch
                value={allProductsLocal}
                onValueChange={setAllGroupProductsLocal}
                trackColor={{ true: purple, false: colors.border }}
                thumbColor="white"
              />
            </View>

            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
              {groupProductDetails.length === 0 ? (
                <Text style={[s.emptyText, { color: colors.muted }]}>This group does not have any products yet.</Text>
              ) : groupProductDetails.map(({ product, link }) => {
                const selected = product.personal !== false && (group.mergeAllToMain || link.mergedToMain);
                return (
                  <Pressable
                    key={product.id}
                    onPress={() => setGroupProductLocal(product.id, !selected)}
                    style={[s.productChoice, { backgroundColor: selected ? colors.soft : colors.cardAlt, borderColor: selected ? colors.primary : colors.border }]}
                  >
                    <View style={[s.productChoiceIcon, { backgroundColor: selected ? colors.primary : colors.card }]}>
                      <Ionicons name={selected ? 'checkmark' : 'cube-outline'} size={16} color={selected ? 'white' : colors.muted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.productChoiceName, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
                      <Text style={[s.productChoiceMeta, { color: colors.muted }]} numberOfLines={1}>
                        {[product.brand, product.status, `Expires ${product.expires}`].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Switch
                      value={selected}
                      onValueChange={(value) => setGroupProductLocal(product.id, value)}
                      trackColor={{ true: purple, false: colors.border }}
                      thumbColor="white"
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable onPress={() => setLocalProductsOpen(false)} style={[s.sheetBtn, { backgroundColor: purple }]}>
              <Text style={s.sheetBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Delete / Leave confirm ── */}
      {pendingDelete && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,.88)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 30 }]}>
          <View style={[s.confirmPrompt, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.confirmIcon}>
              <Ionicons name={pendingDelete.type === 'delete' ? 'trash-outline' : 'exit-outline'} size={23} color="#FF5A62" />
            </View>
            <Text style={[s.confirmTitle, { color: colors.text }]}>
              {pendingDelete.type === 'delete' ? 'Delete group?' : 'Leave group?'}
            </Text>
            <Text style={[s.confirmBody, { color: colors.muted }]}>
              {pendingDelete.type === 'delete'
                ? `"${pendingDelete.name}" and all its activity will be permanently deleted.`
                : `You'll be removed from "${pendingDelete.name}". You'll need a new invite to rejoin.`}
            </Text>
            <Pressable onPress={confirmDelete} style={s.confirmPrimary}>
              <Text style={s.confirmPrimaryText}>
                {pendingDelete.type === 'delete' ? 'Delete group' : 'Leave group'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setPendingDelete(null)} style={[s.confirmSecondary, { backgroundColor: colors.soft }]}>
              <Text style={[s.confirmSecondaryText, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },

  headerBlock: { paddingTop: 54, paddingBottom: 0, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 18 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: 'white' },
  headerSub:   { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  sectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 8, marginBottom: 2, paddingHorizontal: 4 },
  card:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1 },
  rowLabel: { fontSize: 14, fontWeight: '900' },
  rowSub:   { fontSize: 11, fontWeight: '700', marginTop: 2, lineHeight: 15 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '900' },
  dndRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  dndLabel: { fontSize: 12, fontWeight: '700' },
  timeInput:{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, fontSize: 14, fontWeight: '900', minWidth: 64, textAlign: 'center' },
  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  actionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dangerBtn:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginTop: 8 },
  dangerLabel:{ fontSize: 14, fontWeight: '900' },
  dangerSub:  { fontSize: 11, fontWeight: '700', marginTop: 2, lineHeight: 15 },

  overlay:   { position: 'absolute', inset: 0, justifyContent: 'flex-end', zIndex: 20 },
  overlayBg: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  sheetDesc:  { fontSize: 13, fontWeight: '700', marginBottom: 10, lineHeight: 18 },
  sheetLabel: { fontSize: 12, fontWeight: '900', marginTop: 12, marginBottom: 4, letterSpacing: 0.3 },
  input:     { minHeight: 46, borderRadius: 13, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 15, fontWeight: '700' },
  eyeBtn:    { width: 46, height: 46, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sheetBtn:       { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  sheetBtnText:   { color: 'white', fontSize: 15, fontWeight: '900' },
  sheetCancel:     { alignItems: 'center', paddingVertical: 12 },
  sheetCancelText: { fontSize: 14, fontWeight: '800' },
  roleOption:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, marginTop: 8 },
  roleOptionName: { fontSize: 14, fontWeight: '900' },
  roleOptionDesc: { fontSize: 12, fontWeight: '700', marginTop: 2, lineHeight: 16 },
  localSummary: { minHeight: 66, borderRadius: 16, borderWidth: 1, padding: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center', paddingVertical: 24 },
  productChoice: { minHeight: 70, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  productChoiceIcon: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  productChoiceName: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  productChoiceMeta: { fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2 },

  confirmPrompt:      { width: '100%', maxWidth: 320, borderRadius: 22, borderWidth: 1, padding: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: .13, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  confirmIcon:        { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE9EC', marginBottom: 12 },
  confirmTitle:       { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  confirmBody:        { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 7, marginBottom: 16, lineHeight: 20 },
  confirmPrimary:     { width: '100%', minHeight: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5A62' },
  confirmPrimaryText: { color: 'white', fontSize: 15, fontWeight: '900' },
  confirmSecondary:   { width: '100%', minHeight: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  confirmSecondaryText: { fontSize: 14, fontWeight: '900' },
});
