import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import {
  DEFAULT_SETTINGS, Group, GroupActivity,
  GroupProduct, GroupRole, GroupSettings, ProductPrivacy,
  MEMBER_COLORS,
} from '../data/groups';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { GroupRow, GroupMemberRow, GroupProductRow, GroupActivityRow } from '../lib/supabase';
import { useAuth } from './auth';
import { createEntityId } from '../utils/security';
import { StorageService } from '../services/storage';

export type JoinResult = 'ok' | 'already-member' | 'invalid-link' | 'locked' | 'wrong-passcode';

export type JoinInfo = {
  name:             string;
  description:      string;
  locked:           boolean;
  requiresPasscode: boolean;
  memberCount:      number;
};

type GroupsContextValue = {
  groups:   Group[];
  myId:     string;
  loaded:   boolean;
  createGroup:          (name: string, description: string, myName: string) => Group;
  deleteGroup:          (groupId: string) => void;
  leaveGroup:           (groupId: string) => void;
  joinGroup:            (groupId: string, token: string, myName: string, role: GroupRole, passcode?: string) => Promise<JoinResult>;
  fetchJoinInfo:        (groupId: string, token: string) => Promise<JoinInfo | null>;
  addProductToGroup:    (groupId: string, productId: string, privacy: ProductPrivacy, productName?: string) => void;
  removeProductFromGroup: (groupId: string, productId: string, productName?: string) => void;
  setProductPrivacy:    (groupId: string, productId: string, privacy: ProductPrivacy, customViewerIds?: string[]) => void;
  setProductMerged:     (groupId: string, productId: string, merged: boolean) => void;
  setGroupMergeAll:     (groupId: string, merge: boolean) => void;
  updateGroupInfo:      (groupId: string, name: string, description: string) => void;
  updateGroupSettings:  (groupId: string, patch: Partial<GroupSettings>) => void;
  setGroupPasscode:     (groupId: string, passcode: string) => void;
  updateMemberRole:     (groupId: string, memberId: string, role: GroupRole) => void;
  removeMember:         (groupId: string, memberId: string, memberName?: string) => void;
  requestHigherAccess:  (groupId: string, requestedRole: GroupRole) => void;
  regenerateInviteToken: (groupId: string) => string;
  generateInviteLink:   (groupId: string, role: GroupRole) => string;
  canView:   (group: Group, productId: string) => boolean;
  canAdd:    (group: Group) => boolean;
  canRemove: (group: Group) => boolean;
  isHost:    (group: Group) => boolean;
  myRole:    (group: Group) => GroupRole | null;
};

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

function genId(prefix: string)  { return createEntityId(prefix); }

function buildJoinUrl(groupId: string, token: string, role: GroupRole): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/join?g=${encodeURIComponent(groupId)}&t=${encodeURIComponent(token)}&r=${role}`;
  }
  // Native: expo-linking builds the correct scheme/host for dev builds and prod.
  return ExpoLinking.createURL('/join', { queryParams: { g: groupId, t: token, r: role } });
}

/** Log (never swallow) errors from fire-and-forget Supabase writes. */
function warnOnError(op: string) {
  return ({ error }: { error: { message?: string } | null }) => {
    if (error) console.warn(`[groups] ${op} failed:`, error.message ?? error);
  };
}

function makeActivity(
  type: GroupActivity['type'],
  actorId: string, actorName: string,
  targetId: string, targetName: string,
  meta = '',
): GroupActivity {
  return { id: genId('act'), type, actorId, actorName, targetId, targetName, meta, timestamp: new Date().toISOString() };
}

// ─── DB row → app type conversions ───────────────────────────────────────────

function assembleGroup(
  row:       GroupRow,
  members:   GroupMemberRow[],
  products:  GroupProductRow[],
  activities: GroupActivityRow[],
  myId:      string,
): Group {
  const myMemberRow = members.find((m) => m.user_id === myId);
  const settings = { ...DEFAULT_SETTINGS, ...(row.settings as any) };
  if ((row.settings as any)?.passcode_hash && !settings.passcode) settings.passcode = '__set__';
  return {
    id:             row.id,
    name:           row.name,
    description:    row.description,
    createdAt:      row.created_at,
    inviteToken:    row.invite_token,
    myMemberId:     myMemberRow?.id ?? '',
    mergeAllToMain: row.merge_all_to_main,
    settings,
    members: members.map((m) => ({
      id:       m.id,
      name:     m.name,
      role:     m.role,
      joinedAt: m.joined_at,
      color:    m.color,
    })),
    products: products.map((p) => ({
      id:              p.id,
      productId:       p.product_id,
      addedById:       p.added_by_id ?? '',
      privacy:         p.privacy,
      customViewerIds: p.custom_viewer_ids,
      mergedToMain:    p.merged_to_main,
    })),
    activities: activities.map((a) => ({
      id:         a.id,
      type:       a.type as GroupActivity['type'],
      actorId:    a.actor_id ?? '',
      actorName:  a.actor_name ?? '',
      targetId:   a.target_id ?? '',
      targetName: a.target_name ?? '',
      meta:       a.meta ?? '',
      timestamp:  a.timestamp,
    })),
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const { user }     = useAuth();
  const myId         = user?.id ?? '';

  const [groups,  setGroups]  = useState<Group[]>([]);
  const [loaded,  setLoaded]  = useState(false);
  const prevUserIdRef = useRef<string>('');

  // ─── Load from Supabase ──────────────────────────────────────────────────
  const loadGroups = useCallback(async (userId: string) => {
    if (!userId) { setGroups([]); setLoaded(true); return; }

    const cachedGroups = await StorageService.loadGroups(userId);
    if (cachedGroups?.length) setGroups(cachedGroups);

    // 1. Find which groups this user belongs to
    const { data: memberRows, error: memberErr } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    if (memberErr) { console.warn('[groups] load memberships failed:', memberErr.message); setLoaded(true); return; }

    const groupIds = (memberRows || []).map((r: any) => r.group_id as string);
    if (!groupIds.length) {
      setGroups([]);
      await StorageService.clearGroups(userId).catch(() => {});
      setLoaded(true);
      return;
    }

    // 2. Fetch all related data in parallel
    const [groupRes, allMemberRes, allProductRes, allActivityRes] = await Promise.all([
      supabase.from('groups').select('*').in('id', groupIds),
      supabase.from('group_members').select('*').in('group_id', groupIds),
      supabase.from('group_products').select('*').in('group_id', groupIds),
      supabase.from('group_activities').select('*').in('group_id', groupIds).order('timestamp', { ascending: false }),
    ]);
    for (const res of [groupRes, allMemberRes, allProductRes, allActivityRes]) {
      if (res.error) console.warn('[groups] load group data failed:', res.error.message);
    }

    const groupRows      = (groupRes.data      || []) as GroupRow[];
    const allMembers     = (allMemberRes.data   || []) as GroupMemberRow[];
    const allGProducts   = (allProductRes.data  || []) as GroupProductRow[];
    const allActivities  = (allActivityRes.data || []) as GroupActivityRow[];

    const assembled = groupRows.map((row) =>
      assembleGroup(
        row,
        allMembers.filter((m) => m.group_id === row.id),
        allGProducts.filter((p) => p.group_id === row.id),
        allActivities.filter((a) => a.group_id === row.id),
        userId,
      ),
    );

    setGroups(assembled);
    StorageService.saveGroups(assembled, userId).catch(() => {});
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded || !myId) return;
    StorageService.saveGroups(groups, myId).catch(() => {});
  }, [groups, loaded, myId]);

  useEffect(() => {
    if (prevUserIdRef.current === myId) return;
    prevUserIdRef.current = myId;
    setLoaded(false);
    loadGroups(myId);
  }, [myId, loadGroups]);

  // ─── Realtime — cross-device sync ─────────────────────────────────────────
  // After the initial load succeeds for a signed-in user, listen for changes
  // made by other members/devices and reload. A debounced full reload is
  // simple and always consistent (no partial-patch drift). RLS applies to
  // realtime too, and the tables must be in the `supabase_realtime`
  // publication — migration 003_group_sync.sql adds them.
  useEffect(() => {
    if (!myId || !loaded || !isSupabaseConfigured) return;

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { reloadTimer = null; loadGroups(myId); }, 400);
    };

    const channel = supabase.channel('groups-sync');
    for (const table of ['groups', 'group_members', 'group_products', 'group_activities']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload);
    }
    channel.subscribe();

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [myId, loaded, loadGroups]);

  // ─── Context value ────────────────────────────────────────────────────────

  const value = useMemo<GroupsContextValue>(() => {
    const myRole   = (g: Group): GroupRole | null => g.members.find((m) => m.id === g.myMemberId)?.role ?? null;
    const isHost   = (g: Group) => myRole(g) === 'host';
    const canAdd   = (g: Group) => myRole(g) === 'host' || myRole(g) === 'adder';
    const canRemove = (g: Group) => myRole(g) === 'host';
    const canView  = (g: Group, productId: string): boolean => {
      const gp = g.products.find((p) => p.productId === productId);
      if (!gp) return false;
      if (gp.privacy === 'public') return true;
      if (gp.privacy === 'private') return myRole(g) === 'host';
      return gp.customViewerIds.includes(g.myMemberId) || myRole(g) === 'host';
    };
    const myName = (g: Group) => g.members.find((m) => m.id === g.myMemberId)?.name ?? 'You';

    const patchGroup = (groupId: string, updater: (g: Group) => Group) => {
      setGroups((prev) => prev.map((g) => g.id !== groupId ? g : updater(g)));
    };

    const addActivity = async (groupId: string, act: GroupActivity) => {
      const { error } = await supabase.from('group_activities').insert({
        id: act.id, group_id: groupId, type: act.type,
        actor_id: act.actorId || null, actor_name: act.actorName || null,
        target_id: act.targetId || null, target_name: act.targetName || null,
        meta: act.meta || '',
      });
      if (error) console.warn('[groups] add activity failed:', error.message);
    };

    return {
      groups, myId, loaded, myRole, isHost, canAdd, canRemove, canView,

      createGroup: (name, description, memberName) => {
        const memberId = genId('m');
        const group: Group = {
          id:             genId('g'),
          name:           name.trim(),
          description:    description.trim(),
          createdAt:      new Date().toISOString().slice(0, 10),
          inviteToken:    genId('tok'),
          myMemberId:     memberId,
          mergeAllToMain: false,
          settings:       { ...DEFAULT_SETTINGS },
          members:        [{ id: memberId, name: memberName.trim() || 'You', role: 'host', joinedAt: new Date().toISOString().slice(0, 10), color: MEMBER_COLORS[0] }],
          products:       [],
          activities:     [],
        };
        setGroups((g) => [group, ...g]);
        StorageService.saveGroups([group, ...groups], myId).catch(() => {});

        // Persist: group row + host member row + welcome activity
        const act = makeActivity('member_joined', memberId, memberName.trim() || 'You', memberId, memberName.trim() || 'You', 'host');
        supabase.from('groups').insert({
          id: group.id, name: group.name, description: group.description,
          invite_token: group.inviteToken, merge_all_to_main: false,
          settings: DEFAULT_SETTINGS, created_at: group.createdAt,
        }).then(({ error }) => {
          if (error) { console.warn('[groups] create group failed:', error.message); return; }
          supabase.from('group_members').insert({
            id: memberId, group_id: group.id, user_id: myId,
            name: memberName.trim() || 'You', role: 'host',
            color: MEMBER_COLORS[0], joined_at: group.createdAt,
          }).then(warnOnError('add host member'));
          addActivity(group.id, act);
        });
        return group;
      },

      deleteGroup: (groupId) => {
        setGroups((g) => g.filter((gr) => gr.id !== groupId));
        supabase.from('groups').delete().eq('id', groupId).then(warnOnError('delete group'));
      },

      leaveGroup: (groupId) => {
        patchGroup(groupId, (g) => {
          const name = myName(g);
          const act  = makeActivity('member_left', g.myMemberId, name, g.myMemberId, name);
          addActivity(groupId, act);
          supabase.from('group_members').delete().eq('id', g.myMemberId).then(warnOnError('leave group'));
          return { ...g, members: g.members.filter((m) => m.id !== g.myMemberId), activities: [...g.activities, act] };
        });
      },

      // Join runs entirely server-side (RPC in migration 003_group_sync.sql):
      // a non-member cannot read the group row under RLS, and the passcode is
      // checked in the database so it never reaches the client.
      joinGroup: async (groupId, token, memberName, role, passcode = '') => {
        if (!isSupabaseConfigured || !myId) return 'invalid-link';
        // Defense in depth — the RPC also refuses self-service host joins.
        const safeRole: GroupRole = role === 'adder' ? 'adder' : 'viewer';
        const { data, error } = await supabase.rpc('join_group_with_token', {
          p_group_id: groupId,
          p_token:    token,
          p_name:     memberName.trim() || 'New member',
          p_role:     safeRole,
          p_passcode: passcode,
        });
        if (error) {
          console.warn('[groups] join failed:', error.message);
          return 'invalid-link';
        }
        const known: JoinResult[] = ['ok', 'already-member', 'invalid-link', 'locked', 'wrong-passcode'];
        const result = known.includes(data as JoinResult) ? (data as JoinResult) : 'invalid-link';
        if (result === 'ok' || result === 'already-member') await loadGroups(myId);
        return result;
      },

      fetchJoinInfo: async (groupId, token) => {
        const cached = await StorageService.loadGroups(myId);
        const local = cached?.find((group) => group.id === groupId && group.inviteToken === token);
        if (local) {
          return {
            name: local.name,
            description: local.description,
            locked: !!local.settings?.locked,
            requiresPasscode: !!local.settings?.passcode,
            memberCount: local.members.length,
          };
        }
        if (!isSupabaseConfigured || !myId || !groupId || !token) return null;
        const { data, error } = await supabase.rpc('get_group_join_info', {
          p_group_id: groupId,
          p_token:    token,
        });
        if (error) { console.warn('[groups] fetch join info failed:', error.message); return null; }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return null;
        return {
          name:             String(row.name ?? ''),
          description:      String(row.description ?? ''),
          locked:           !!row.locked,
          requiresPasscode: !!row.requires_passcode,
          memberCount:      Number(row.member_count ?? 0),
        };
      },

      addProductToGroup: (groupId, productId, privacy, productName = productId) => {
        patchGroup(groupId, (g) => {
          if (g.products.some((p) => p.productId === productId)) return g;
          const gp: GroupProduct = { id: genId('gp'), productId, addedById: g.myMemberId, privacy, customViewerIds: [], mergedToMain: true };
          const act = makeActivity('product_added', g.myMemberId, myName(g), productId, productName);
          supabase.from('group_products').insert({
            id: gp.id, group_id: groupId, product_id: productId,
            added_by_id: g.myMemberId, privacy, custom_viewer_ids: [], merged_to_main: true,
          }).then(warnOnError('add product to group'));
          addActivity(groupId, act);
          return { ...g, products: [...g.products, gp], activities: [...g.activities, act] };
        });
      },

      removeProductFromGroup: (groupId, productId, productName = productId) => {
        patchGroup(groupId, (g) => {
          const gp  = g.products.find((p) => p.productId === productId);
          const act = makeActivity('product_removed', g.myMemberId, myName(g), productId, productName);
          if (gp) supabase.from('group_products').delete().eq('id', gp.id).then(warnOnError('remove product from group'));
          addActivity(groupId, act);
          return { ...g, products: g.products.filter((p) => p.productId !== productId), activities: [...g.activities, act] };
        });
      },

      setProductPrivacy: (groupId, productId, privacy, customViewerIds = []) => {
        patchGroup(groupId, (g) => {
          const gp = g.products.find((p) => p.productId === productId);
          if (gp) supabase.from('group_products').update({ privacy, custom_viewer_ids: customViewerIds }).eq('id', gp.id).then(warnOnError('set product privacy'));
          return { ...g, products: g.products.map((p) => p.productId !== productId ? p : { ...p, privacy, customViewerIds }) };
        });
      },

      setProductMerged: (groupId, productId, merged) => {
        patchGroup(groupId, (g) => {
          const gp = g.products.find((p) => p.productId === productId);
          if (gp) supabase.from('group_products').update({ merged_to_main: merged }).eq('id', gp.id).then(warnOnError('set product merged'));
          return { ...g, products: g.products.map((p) => p.productId !== productId ? p : { ...p, mergedToMain: merged }) };
        });
      },

      setGroupMergeAll: (groupId, merge) => {
        patchGroup(groupId, (g) => {
          supabase.from('groups').update({ merge_all_to_main: merge }).eq('id', groupId).then(warnOnError('set merge-all'));
          return { ...g, mergeAllToMain: merge };
        });
      },

      updateGroupInfo: (groupId, name, description) => {
        patchGroup(groupId, (g) => {
          supabase.from('groups').update({ name: name.trim(), description: description.trim() }).eq('id', groupId).then(warnOnError('update group info'));
          return { ...g, name: name.trim(), description: description.trim() };
        });
      },

      updateGroupSettings: (groupId, patch) => {
        patchGroup(groupId, (g) => {
          const { passcode: _ignoredPasscode, ...safePatch } = patch;
          const next = { ...(g.settings ?? DEFAULT_SETTINGS), ...safePatch };
          supabase.from('groups').update({ settings: next }).eq('id', groupId).then(warnOnError('update group settings'));
          return { ...g, settings: next };
        });
      },

      setGroupPasscode: (groupId, passcode) => {
        const clean = passcode.trim();
        patchGroup(groupId, (g) => {
          const { passcode: _oldPasscode, ...rest } = g.settings ?? DEFAULT_SETTINGS;
          const next = { ...rest, passcode: clean ? '__set__' : '' } as GroupSettings;
          supabase.rpc('set_group_passcode', {
            p_group_id: groupId,
            p_passcode: clean,
          }).then(warnOnError('set group passcode'));
          return { ...g, settings: next };
        });
      },

      updateMemberRole: (groupId, memberId, role) => {
        patchGroup(groupId, (g) => {
          supabase.from('group_members').update({ role }).eq('id', memberId).then(warnOnError('update member role'));
          return { ...g, members: g.members.map((m) => m.id !== memberId ? m : { ...m, role }) };
        });
      },

      removeMember: (groupId, memberId, memberName = memberId) => {
        patchGroup(groupId, (g) => {
          const act = makeActivity('member_left', memberId, memberName, memberId, memberName);
          supabase.from('group_members').delete().eq('id', memberId).then(warnOnError('remove member'));
          addActivity(groupId, act);
          return { ...g, members: g.members.filter((m) => m.id !== memberId), activities: [...g.activities, act] };
        });
      },

      requestHigherAccess: (groupId, requestedRole) => {
        patchGroup(groupId, (g) => {
          const name = myName(g);
          const act  = makeActivity('access_request', g.myMemberId, name, g.myMemberId, name, requestedRole);
          addActivity(groupId, act);
          return { ...g, activities: [...g.activities, act] };
        });
      },

      regenerateInviteToken: (groupId) => {
        const newToken = genId('tok');
        patchGroup(groupId, (g) => {
          supabase.from('groups').update({ invite_token: newToken }).eq('id', groupId).then(warnOnError('regenerate invite token'));
          return { ...g, inviteToken: newToken };
        });
        return newToken;
      },

      generateInviteLink: (groupId, role) => {
        const group = groups.find((g) => g.id === groupId);
        if (!group) return '';
        StorageService.saveGroups(groups, myId).catch(() => {});
        return buildJoinUrl(groupId, group.inviteToken, role);
      },
    };
  }, [groups, myId, loaded, loadGroups]);

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used within GroupsProvider');
  return ctx;
}
