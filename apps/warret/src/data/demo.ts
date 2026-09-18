import type { Group } from './groups';
import type { Product } from './products';

export const DEMO_PRODUCT: Product = {
  id: 'demo-product-preview',
  name: 'Demo Honda City',
  brand: 'Honda',
  status: 'Active',
  expires: 'Aug 15, 2026',
  warrantyStart: '2023-08-15',
  warrantyEnd: '2026-08-15',
  dateAdded: 'Jun 30, 2026',
  type: 'Multiple vehicle documents',
  category: 'Car',
  serialNumber: 'DL01AB1234',
  seller: 'Honda Downtown',
  keywords: ['demo', 'example', 'car', 'vehicle', 'auto', 'insurance', 'puc', 'rc', 'warranty'],
  docs: ['Vehicle_Invoice.pdf', 'Warranty_Card.pdf', 'Insurance_Policy.pdf', 'PUC_Certificate.pdf', 'RC_Document.pdf'],
  docEntries: [
    { label: 'Manufacturer warranty', fileName: 'Warranty_Card.pdf', expiry: '2026-08-15' },
    { label: 'Car insurance', fileName: 'Insurance_Policy.pdf', expiry: '2026-10-20' },
    { label: 'PUC certificate', fileName: 'PUC_Certificate.pdf', expiry: '2026-08-15' },
    { label: 'RC / registration', fileName: 'RC_Document.pdf', expiry: '2031-06-30' },
    { label: 'Purchase invoice', fileName: 'Vehicle_Invoice.pdf', expiry: '2026-08-15' },
  ],
  support: { site: 'hondacarindia.com/service', phone: '1800-113-121', method: 'Visit authorised service centre with invoice and vehicle documents' },
  coverage: {
    included: ['Manufacturer defects', 'Engine and transmission issues', 'Electrical system faults'],
    excluded: ['Accidental damage', 'Tyres, brake pads and wear items', 'Unauthorised modifications'],
  },
  steps: ['Open the nearest authorised service centre listing', 'Carry RC, insurance, invoice and warranty card', 'Request a job card and keep the service record'],
  reminders: ['2026-08-01', '2026-10-01'],
};

export const DEMO_GROUP: Group = {
  id: 'demo-group-preview',
  name: 'Family Vehicles',
  description: 'A sample shared vault for car documents, renewals and service warranties',
  createdAt: '2026-06-30',
  inviteToken: 'demo-only',
  myMemberId: 'demo_you',
  mergeAllToMain: false,
  settings: {
    notificationsEnabled: true,
    dndEnabled: false,
    dndStart: '22:00',
    dndEnd: '08:00',
    locked: false,
    passcode: '',
  },
  members: [
    { id: 'demo_you', name: 'You', role: 'host', joinedAt: '2026-06-30', color: '#6F63F3' },
    { id: 'demo_adder', name: 'Family', role: 'adder', joinedAt: '2026-06-30', color: '#0D9488' },
    { id: 'demo_viewer', name: 'Viewer', role: 'viewer', joinedAt: '2026-06-30', color: '#D97706' },
  ],
  products: [
    { id: 'demo_gp_1', productId: DEMO_PRODUCT.id, addedById: 'demo_you', privacy: 'public', customViewerIds: [], mergedToMain: true },
  ],
  activities: [
    { id: 'demo_act_1', type: 'member_joined', actorId: 'demo_you', actorName: 'You', targetId: 'demo_you', targetName: 'You', meta: 'host', timestamp: '2026-06-30T09:00:00Z' },
    { id: 'demo_act_2', type: 'product_added', actorId: 'demo_adder', actorName: 'Family', targetId: DEMO_PRODUCT.id, targetName: DEMO_PRODUCT.name, timestamp: '2026-06-30T09:05:00Z' },
  ],
};
