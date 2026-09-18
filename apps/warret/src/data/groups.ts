export type GroupRole = 'host' | 'adder' | 'viewer';
export type ProductPrivacy = 'public' | 'private' | 'custom';
export type ActivityEventType = 'product_added' | 'product_removed' | 'member_joined' | 'member_left' | 'access_request';

export type GroupSettings = {
  notificationsEnabled: boolean;
  dndEnabled: boolean;
  dndStart: string; // "HH:MM"
  dndEnd: string;   // "HH:MM"
  locked: boolean;  // no new joins when true
  passcode: string; // empty = no passcode
};

export type GroupMember = {
  id: string;
  name: string;
  role: GroupRole;
  joinedAt: string;
  color: string;
};

export type GroupProduct = {
  id: string;
  productId: string;
  addedById: string;
  privacy: ProductPrivacy;
  customViewerIds: string[];
  mergedToMain: boolean; // kept for data compat; UI uses group.mergeAllToMain
};

export type GroupActivity = {
  id: string;
  type: ActivityEventType;
  actorId: string;
  actorName: string;
  targetId: string;
  targetName: string;
  meta?: string; // e.g. role for member_joined
  timestamp: string; // ISO datetime
};

export type Group = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  inviteToken: string;
  myMemberId: string;
  members: GroupMember[];
  products: GroupProduct[];
  activities: GroupActivity[];
  mergeAllToMain: boolean;
  settings: GroupSettings;
};

export const DEFAULT_SETTINGS: GroupSettings = {
  notificationsEnabled: false,
  dndEnabled: false,
  dndStart: '22:00',
  dndEnd: '08:00',
  locked: false,
  passcode: '',
};

export const MEMBER_COLORS = [
  '#6F63F3','#0D9488','#D97706','#DC2626','#7C3AED',
  '#059669','#DB2777','#2563EB','#EA580C','#65A30D',
];

export function buildTemplateGroup(myId: string): Group {
  return {
    settings: { ...DEFAULT_SETTINGS },
    id: 'template-family',
    name: 'Family Home',
    description: 'Shared warranties and documents for everyone at home',
    createdAt: '2026-06-01',
    inviteToken: 'tmpl_abc123xyz',
    myMemberId: myId,
    mergeAllToMain: false,
    members: [
      { id: myId,        name: 'You',          role: 'host',   joinedAt: '2026-06-01', color: '#6F63F3' },
      { id: 'mem_priya', name: 'Priya Sharma', role: 'adder',  joinedAt: '2026-06-02', color: '#0D9488' },
      { id: 'mem_rahul', name: 'Rahul Kumar',  role: 'viewer', joinedAt: '2026-06-03', color: '#D97706' },
    ],
    products: [
      { id: 'gp1', productId: 'macbook',    addedById: myId,        privacy: 'private', customViewerIds: [], mergedToMain: true  },
      { id: 'gp2', productId: 'samsung-tv', addedById: 'mem_priya', privacy: 'public',  customViewerIds: [], mergedToMain: true  },
      { id: 'gp3', productId: 'lg-ac',      addedById: 'mem_priya', privacy: 'public',  customViewerIds: [], mergedToMain: false },
      { id: 'gp4', productId: 'dyson',      addedById: 'mem_rahul', privacy: 'custom',  customViewerIds: [myId, 'mem_priya'], mergedToMain: false },
    ],
    activities: [
      { id: 'act_f1', type: 'member_joined',  actorId: myId,        actorName: 'You',          targetId: myId,        targetName: 'You',          meta: 'host',   timestamp: '2026-06-01T10:00:00Z' },
      { id: 'act_f2', type: 'member_joined',  actorId: 'mem_priya', actorName: 'Priya Sharma', targetId: 'mem_priya', targetName: 'Priya Sharma', meta: 'adder',  timestamp: '2026-06-02T14:22:00Z' },
      { id: 'act_f3', type: 'product_added',  actorId: myId,        actorName: 'You',          targetId: 'macbook',   targetName: 'MacBook Pro 14"',         meta: '',       timestamp: '2026-06-02T14:45:00Z' },
      { id: 'act_f4', type: 'product_added',  actorId: 'mem_priya', actorName: 'Priya Sharma', targetId: 'samsung-tv',targetName: 'Samsung 65" QLED TV',    meta: '',       timestamp: '2026-06-02T15:10:00Z' },
      { id: 'act_f5', type: 'product_added',  actorId: 'mem_priya', actorName: 'Priya Sharma', targetId: 'lg-ac',     targetName: 'LG 1.5T Split AC',       meta: '',       timestamp: '2026-06-03T09:00:00Z' },
      { id: 'act_f6', type: 'member_joined',  actorId: 'mem_rahul', actorName: 'Rahul Kumar',  targetId: 'mem_rahul', targetName: 'Rahul Kumar',  meta: 'viewer', timestamp: '2026-06-03T11:30:00Z' },
      { id: 'act_f7', type: 'product_added',  actorId: 'mem_rahul', actorName: 'Rahul Kumar',  targetId: 'dyson',     targetName: 'Dyson V12 Detect Slim',  meta: '',       timestamp: '2026-06-03T11:45:00Z' },
    ],
  };
}

export function buildKubeAirGroup(myId: string): Group {
  return {
    settings: { ...DEFAULT_SETTINGS, notificationsEnabled: true },
    id: 'kubeair-company',
    name: 'KubeAir',
    description: 'Company-wide IT assets, appliances, and equipment warranties',
    createdAt: '2026-01-15',
    inviteToken: 'kubeair_tok_x9z2m',
    myMemberId: myId,
    mergeAllToMain: false,
    members: [
      { id: myId,         name: 'You (Admin)',     role: 'host',   joinedAt: '2026-01-15', color: '#6F63F3' },
      { id: 'ka_arjun',  name: 'Arjun Mehta',     role: 'host',   joinedAt: '2026-01-15', color: '#7C3AED' },
      { id: 'ka_neha',   name: 'Neha Patel',      role: 'adder',  joinedAt: '2026-01-20', color: '#0D9488' },
      { id: 'ka_ravi',   name: 'Ravi Kumar',      role: 'adder',  joinedAt: '2026-01-22', color: '#059669' },
      { id: 'ka_priya',  name: 'Priya Singh',     role: 'viewer', joinedAt: '2026-02-01', color: '#DB2777' },
      { id: 'ka_amit',   name: 'Amit Sharma',     role: 'viewer', joinedAt: '2026-02-01', color: '#D97706' },
      { id: 'ka_shreya', name: 'Shreya Joshi',    role: 'viewer', joinedAt: '2026-02-05', color: '#EA580C' },
      { id: 'ka_kiran',  name: 'Kiran Rao',       role: 'viewer', joinedAt: '2026-02-10', color: '#2563EB' },
      { id: 'ka_vikram', name: 'Vikram Nair',     role: 'adder',  joinedAt: '2026-03-01', color: '#DC2626' },
      { id: 'ka_deepa',  name: 'Deepa Menon',     role: 'viewer', joinedAt: '2026-05-15', color: '#65A30D' },
    ],
    products: [
      { id: 'kgp1', productId: 'dell-server',    addedById: myId,       privacy: 'public',  customViewerIds: [], mergedToMain: false },
      { id: 'kgp2', productId: 'hp-printer',     addedById: 'ka_neha',  privacy: 'public',  customViewerIds: [], mergedToMain: false },
      { id: 'kgp3', productId: 'cisco-switch',   addedById: myId,       privacy: 'private', customViewerIds: [], mergedToMain: false },
      { id: 'kgp4', productId: 'office-ac',      addedById: 'ka_ravi',  privacy: 'public',  customViewerIds: [], mergedToMain: false },
      { id: 'kgp5', productId: 'epson-projector',addedById: 'ka_vikram',privacy: 'custom',  customViewerIds: ['ka_arjun','ka_neha','ka_priya'], mergedToMain: false },
    ],
    activities: [
      { id: 'kact1',  type: 'member_joined',  actorId: myId,        actorName: 'You (Admin)',  targetId: myId,         targetName: 'You (Admin)',  meta: 'host',   timestamp: '2026-01-15T09:00:00Z' },
      { id: 'kact2',  type: 'member_joined',  actorId: 'ka_arjun',  actorName: 'Arjun Mehta', targetId: 'ka_arjun',   targetName: 'Arjun Mehta', meta: 'host',   timestamp: '2026-01-15T09:05:00Z' },
      { id: 'kact3',  type: 'product_added',  actorId: myId,        actorName: 'You (Admin)',  targetId: 'dell-server',targetName: 'Dell PowerEdge R740',     meta: '', timestamp: '2026-01-15T10:00:00Z' },
      { id: 'kact4',  type: 'product_added',  actorId: myId,        actorName: 'You (Admin)',  targetId: 'cisco-switch',targetName: 'Cisco Catalyst 2960-X',  meta: '', timestamp: '2026-01-15T10:15:00Z' },
      { id: 'kact5',  type: 'member_joined',  actorId: 'ka_neha',   actorName: 'Neha Patel',  targetId: 'ka_neha',    targetName: 'Neha Patel',  meta: 'adder',  timestamp: '2026-01-20T14:00:00Z' },
      { id: 'kact6',  type: 'member_joined',  actorId: 'ka_ravi',   actorName: 'Ravi Kumar',  targetId: 'ka_ravi',    targetName: 'Ravi Kumar',  meta: 'adder',  timestamp: '2026-01-22T11:00:00Z' },
      { id: 'kact7',  type: 'product_added',  actorId: 'ka_neha',   actorName: 'Neha Patel',  targetId: 'hp-printer', targetName: 'HP LaserJet Pro M404dn',  meta: '', timestamp: '2026-01-25T09:30:00Z' },
      { id: 'kact8',  type: 'member_joined',  actorId: 'ka_priya',  actorName: 'Priya Singh', targetId: 'ka_priya',   targetName: 'Priya Singh', meta: 'viewer', timestamp: '2026-02-01T09:00:00Z' },
      { id: 'kact9',  type: 'member_joined',  actorId: 'ka_amit',   actorName: 'Amit Sharma', targetId: 'ka_amit',    targetName: 'Amit Sharma', meta: 'viewer', timestamp: '2026-02-01T09:15:00Z' },
      { id: 'kact10', type: 'member_joined',  actorId: 'ka_shreya', actorName: 'Shreya Joshi',targetId: 'ka_shreya',  targetName: 'Shreya Joshi',meta: 'viewer', timestamp: '2026-02-05T10:00:00Z' },
      { id: 'kact11', type: 'product_added',  actorId: 'ka_ravi',   actorName: 'Ravi Kumar',  targetId: 'office-ac',  targetName: 'Daikin 2T Office Cassette AC', meta: '', timestamp: '2026-02-10T13:00:00Z' },
      { id: 'kact12', type: 'member_joined',  actorId: 'ka_kiran',  actorName: 'Kiran Rao',   targetId: 'ka_kiran',   targetName: 'Kiran Rao',   meta: 'viewer', timestamp: '2026-02-10T15:00:00Z' },
      { id: 'kact13', type: 'member_joined',  actorId: 'ka_vikram', actorName: 'Vikram Nair', targetId: 'ka_vikram',  targetName: 'Vikram Nair', meta: 'adder',  timestamp: '2026-03-01T09:00:00Z' },
      { id: 'kact14', type: 'product_added',  actorId: 'ka_vikram', actorName: 'Vikram Nair', targetId: 'epson-projector', targetName: 'Epson EB-X49 Projector', meta: '', timestamp: '2026-03-05T11:00:00Z' },
      { id: 'kact15', type: 'member_joined',  actorId: 'ka_deepa',  actorName: 'Deepa Menon', targetId: 'ka_deepa',   targetName: 'Deepa Menon', meta: 'viewer', timestamp: '2026-05-15T10:30:00Z' },
    ],
  };
}
