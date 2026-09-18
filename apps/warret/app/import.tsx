import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDisplayDate } from '../src/components/DatePickerModal';
import type { DocEntry } from '../src/data/products';
import { computeStatus, useProducts } from '../src/store/products';
import { useAuth } from '../src/store/auth';
import { useAppTheme } from '../src/store/theme';
import { F } from '../src/theme/fonts';
import { sanitizeFileName } from '../src/utils/security';
import { safeBack } from '../src/utils/navigation';

// ─── Shared-link payload validation ───────────────────────────────────────────
// Strict whitelist validator for untrusted /import and /verify payloads.
// Every field is type-checked, trimmed and length-capped; the result object is
// built explicitly field-by-field (never spread) so hostile keys — including
// __proto__ / constructor tricks — cannot ride along. The sender's claimed
// `status` is deliberately ignored: screens recompute it from warrantyEnd.

export type SharedDocEntry = { label: string; fileName: string; expiry: string };

export type SharedProduct = {
  name: string;
  brand?: string;
  type?: string;
  category?: string;
  seller?: string;
  serialNumber?: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  docs: string[];
  docEntries: SharedDocEntry[];
  coverage?: { included: string[]; excluded: string[] };
  steps: string[];
};

const MAX_PAYLOAD_CHARS = 100000;
const MAX_NAME_CHARS = 120;
const MAX_TEXT_CHARS = 200;

const cleanString = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, max).trim();
  return trimmed || undefined;
};

const cleanDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return Number.isFinite(new Date(`${trimmed}T00:00:00`).getTime()) ? trimmed : undefined;
};

const cleanStringList = (value: unknown, maxItems: number, maxChars: number): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= maxItems) break;
    const clean = cleanString(item, maxChars);
    if (clean) out.push(clean);
  }
  return out;
};

const cleanDocEntries = (value: unknown): SharedDocEntry[] => {
  if (!Array.isArray(value)) return [];
  const out: SharedDocEntry[] = [];
  for (const item of value) {
    if (out.length >= 20) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const rawFileName = cleanString(entry.fileName, MAX_TEXT_CHARS);
    const label = cleanString(entry.label, MAX_NAME_CHARS);
    if (!rawFileName && !label) continue;
    const fileName = sanitizeFileName(rawFileName || label || 'document');
    out.push({ label: label || fileName, fileName, expiry: cleanDate(entry.expiry) || '' });
  }
  return out;
};

export function parseSharedProduct(raw: string | string[] | undefined): SharedProduct | null {
  const source = Array.isArray(raw) ? raw[0] : raw;
  if (typeof source !== 'string' || !source || source.length > MAX_PAYLOAD_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const name = cleanString(record.name, MAX_NAME_CHARS);
  if (!name) return null;

  const coverageRecord = record.coverage && typeof record.coverage === 'object' && !Array.isArray(record.coverage)
    ? record.coverage as Record<string, unknown>
    : null;
  const included = coverageRecord ? cleanStringList(coverageRecord.included, 30, MAX_TEXT_CHARS) : [];
  const excluded = coverageRecord ? cleanStringList(coverageRecord.excluded, 30, MAX_TEXT_CHARS) : [];

  return {
    name,
    brand: cleanString(record.brand, MAX_NAME_CHARS),
    type: cleanString(record.type, MAX_TEXT_CHARS),
    category: cleanString(record.category, MAX_TEXT_CHARS),
    seller: cleanString(record.seller, MAX_TEXT_CHARS),
    serialNumber: cleanString(record.serialNumber, MAX_TEXT_CHARS),
    warrantyStart: cleanDate(record.warrantyStart),
    warrantyEnd: cleanDate(record.warrantyEnd),
    docs: cleanStringList(record.docs, 20, MAX_TEXT_CHARS).map((doc) => sanitizeFileName(doc)),
    docEntries: cleanDocEntries(record.docEntries),
    coverage: included.length || excluded.length ? { included, excluded } : undefined,
    steps: cleanStringList(record.steps, 20, MAX_TEXT_CHARS),
  };
}

export const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ImportScreen() {
  const { product } = useLocalSearchParams<{ product?: string }>();
  const { colors, isDark } = useAppTheme();
  const { user } = useAuth();
  const { products, addProduct } = useProducts();
  const shared = useMemo(() => parseSharedProduct(product), [product]);
  const [addedId, setAddedId] = useState<string | null>(null);

  const closeScreen = () => safeBack('/products');

  const duplicate = useMemo(() => {
    if (!shared) return undefined;
    const nameKey = shared.name.trim().toLowerCase();
    const serialKey = shared.serialNumber?.trim().toLowerCase();
    return products.find((item) => {
      if (item.name.trim().toLowerCase() !== nameKey) return false;
      if (!serialKey) return true;
      return item.serialNumber?.trim().toLowerCase() === serialKey;
    });
  }, [products, shared]);

  const handleAdd = () => {
    if (!shared || addedId) return;
    const entries: DocEntry[] = shared.docEntries.map((entry) => ({ label: entry.label, fileName: entry.fileName, expiry: entry.expiry }));
    for (const doc of shared.docs) {
      if (!entries.some((entry) => entry.fileName === doc)) {
        entries.push({ label: doc.replace(/\.[^.]+$/, '') || doc, fileName: doc, expiry: '' });
      }
    }
    const created = addProduct({
      name: shared.name,
      brand: shared.brand,
      type: shared.type,
      category: shared.category,
      warrantyStart: shared.warrantyStart,
      warrantyEnd: shared.warrantyEnd,
      serialNumber: shared.serialNumber,
      seller: shared.seller,
      docEntries: entries.length ? entries : undefined,
      coverage: shared.coverage,
      steps: shared.steps.length ? shared.steps : undefined,
    });
    setAddedId(created.id);
    setTimeout(() => router.replace(`/product/${created.id}`), 1100);
  };

  if (!shared) {
    return (
      <View style={[s.page, s.center, { backgroundColor: colors.page }]}>
        <Pressable onPress={closeScreen} style={[s.closeTop, { backgroundColor: colors.cardAlt }]}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={[s.stateIcon, { backgroundColor: isDark ? '#2A1A1A' : '#FFE8E8' }]}>
          <Ionicons name="alert-circle-outline" size={46} color={isDark ? '#B85555' : '#E0363E'} />
        </View>
        <Text style={[s.stateTitle, { color: colors.text }]}>This import link is invalid or damaged</Text>
        <Text style={[s.stateText, { color: colors.muted }]}>Ask the sender for a fresh Warret share link and try again.</Text>
        <Pressable onPress={closeScreen} style={[s.primaryBtn, { backgroundColor: colors.primary, alignSelf: 'stretch', marginTop: 24 }]}>
          <Text style={s.primaryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (addedId) {
    return (
      <View style={[s.page, s.center, { backgroundColor: colors.page }]}>
        <View style={[s.stateIcon, { backgroundColor: colors.primary + '22' }]}>
          <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
        </View>
        <Text style={[s.stateTitle, { color: colors.text }]}>Added to your wallet</Text>
        <Text style={[s.stateText, { color: colors.muted }]}>{shared.name}</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[s.page, { backgroundColor: colors.page, justifyContent: 'center' }]}>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.stateIcon, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="lock-open-outline" size={32} color={colors.primary} />
          </View>
          <Text style={[s.title, { color: colors.text }]}>Sign in to import</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>This product link is valid. Sign in or create an account, then open the link again to add it to your vault.</Text>
          <Pressable onPress={() => router.replace('/auth')} style={[s.primaryBtn, { backgroundColor: colors.primary }]}>
            <Text style={s.primaryBtnText}>Continue to sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const status = computeStatus(shared.warrantyEnd || '');
  const statusColor = status === 'Expired'
    ? (isDark ? '#B85555' : '#E0363E')
    : status === 'Expiring soon'
      ? (isDark ? '#B8822A' : '#C8751B')
      : (isDark ? '#3D9B68' : '#17713A');
  const statusBg = status === 'Expired'
    ? (isDark ? '#3A1A1A' : '#FFE0E0')
    : status === 'Expiring soon'
      ? (isDark ? '#3A2E1A' : '#FFF1DD')
      : (isDark ? '#1A3A29' : '#DDFBE8');

  return (
    <ScrollView style={[s.page, { backgroundColor: colors.page }]} contentContainerStyle={s.content}>
      <Pressable onPress={closeScreen} style={[s.closeTop, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>

      <View style={[s.headerIcon, { backgroundColor: colors.soft }]}>
        <Ionicons name="download-outline" size={30} color={colors.primary} />
      </View>
      <Text style={[s.title, { color: colors.text }]}>Add shared product</Text>
      <Text style={[s.subtitle, { color: colors.muted }]}>Someone shared this warranty with you. Review it before adding it to your wallet.</Text>

      {/* Preview card */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.productName, { color: colors.text }]}>{shared.name}</Text>
        {(shared.brand || shared.type) ? (
          <Text style={[s.productMeta, { color: colors.muted }]}>
            {[shared.brand, shared.type].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        <View style={[s.statusPill, { backgroundColor: statusBg }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>{status}</Text>
        </View>

        <View style={[s.rowDivider, { borderTopColor: colors.border }]} />
        <Text style={[s.rowLabel, { color: colors.muted }]}>Warranty window</Text>
        <Text style={[s.rowValue, { color: colors.text }]}>
          {shared.warrantyStart ? formatDisplayDate(shared.warrantyStart) : 'Not provided'} → {shared.warrantyEnd ? formatDisplayDate(shared.warrantyEnd) : 'Not provided'}
        </Text>
        {shared.serialNumber ? (
          <>
            <Text style={[s.rowLabel, { color: colors.muted, marginTop: 12 }]}>Serial / model</Text>
            <Text style={[s.rowValue, { color: colors.text }]}>{shared.serialNumber}</Text>
          </>
        ) : null}
        {shared.seller ? (
          <>
            <Text style={[s.rowLabel, { color: colors.muted, marginTop: 12 }]}>Purchased from</Text>
            <Text style={[s.rowValue, { color: colors.text }]}>{shared.seller}</Text>
          </>
        ) : null}
      </View>

      {/* Documents */}
      {(shared.docEntries.length > 0 || shared.docs.length > 0) ? (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Documents</Text>
          {shared.docEntries.map((entry) => (
            <View key={`${entry.fileName}-${entry.label}`} style={[s.docRow, { borderTopColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={17} color={colors.primary} />
              <Text numberOfLines={1} style={[s.docLabel, { color: colors.text }]}>{entry.label}</Text>
              <Text style={[s.docExpiry, { color: colors.muted }]}>{entry.expiry ? formatDisplayDate(entry.expiry) : 'No date'}</Text>
            </View>
          ))}
          {shared.docs.filter((doc) => !shared.docEntries.some((entry) => entry.fileName === doc)).map((doc) => (
            <View key={doc} style={[s.docRow, { borderTopColor: colors.border }]}>
              <Ionicons name="document-outline" size={17} color={colors.primary} />
              <Text numberOfLines={1} style={[s.docLabel, { color: colors.text }]}>{doc}</Text>
              <Text style={[s.docExpiry, { color: colors.muted }]}>No date</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Coverage summary */}
      {shared.coverage ? (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Coverage</Text>
          {shared.coverage.included.length ? (
            <View style={s.chipWrap}>
              {shared.coverage.included.map((item) => (
                <Text key={item} style={[s.chip, { backgroundColor: isDark ? '#1A3A29' : '#DDFBE8', color: isDark ? '#3D9B68' : '#17713A' }]}>{item}</Text>
              ))}
            </View>
          ) : null}
          {shared.coverage.excluded.length ? (
            <View style={s.chipWrap}>
              {shared.coverage.excluded.map((item) => (
                <Text key={item} style={[s.chip, { backgroundColor: isDark ? '#3A1A1A' : '#FFE0E0', color: isDark ? '#B85555' : '#A31212' }]}>{item}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Metadata-only note */}
      <View style={[s.noteBanner, { backgroundColor: colors.soft, borderColor: colors.border }]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={[s.noteText, { color: colors.muted }]}>
          Documents and files don't travel with this link — only their names and expiry dates. Ask the sender for the files themselves.
        </Text>
      </View>

      {/* Duplicate warning */}
      {duplicate ? (
        <View style={[s.warnBanner, { backgroundColor: isDark ? '#3A2E1A' : '#FFF1DD', borderColor: isDark ? '#4A3A20' : '#F5D9AE' }]}>
          <Ionicons name="warning-outline" size={18} color={isDark ? '#B8822A' : '#C8751B'} />
          <Text style={[s.warnText, { color: isDark ? '#B8822A' : '#C8751B' }]}>
            You already have "{duplicate.name}" in your wallet. Adding this creates a second copy.
          </Text>
        </View>
      ) : null}

      <Pressable onPress={handleAdd} style={[s.primaryBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="add-circle-outline" size={19} color="white" />
        <Text style={s.primaryBtnText}>{duplicate ? 'Add anyway' : 'Add to my wallet'}</Text>
      </Pressable>
      <Pressable onPress={closeScreen} style={s.cancelBtn}>
        <Text style={[s.cancelBtnText, { color: colors.muted }]}>Not now</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 26, paddingTop: 76, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  closeTop: { position: 'absolute', right: 20, top: 52, zIndex: 2, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  headerIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '900', marginTop: 16, fontFamily: F.n900 },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 6, fontFamily: F.i700 },

  card: { borderRadius: 18, borderWidth: 1, padding: 18, marginTop: 16 },
  cardTitle: { fontSize: 13, lineHeight: 17, fontWeight: '900', textTransform: 'uppercase', fontFamily: F.n900 },
  productName: { fontSize: 22, lineHeight: 28, fontWeight: '900', fontFamily: F.n900 },
  productMeta: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 4, fontFamily: F.n800 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 6, marginTop: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900 },
  rowDivider: { borderTopWidth: 1, marginTop: 16, marginBottom: 14 },
  rowLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', fontFamily: F.n800 },
  rowValue: { fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 3, fontFamily: F.n900 },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, borderTopWidth: 1, marginTop: 4 },
  docLabel: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '800', fontFamily: F.n800 },
  docExpiry: { fontSize: 12, lineHeight: 16, fontWeight: '800', fontFamily: F.n800 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 13, fontSize: 12, lineHeight: 16, fontWeight: '800', overflow: 'hidden', fontFamily: F.n800 },

  noteBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 15, borderWidth: 1, padding: 13, marginTop: 16 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500', fontFamily: F.i500 },
  warnBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 15, borderWidth: 1, padding: 13, marginTop: 12 },
  warnText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '800', fontFamily: F.n800 },

  primaryBtn: { minHeight: 50, borderRadius: 16, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: 'white', fontSize: 16, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelBtnText: { fontSize: 14, lineHeight: 18, fontWeight: '800', fontFamily: F.n800 },

  stateIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  stateTitle: { fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  stateText: { fontSize: 15, lineHeight: 21, fontWeight: '700', textAlign: 'center', marginTop: 8, fontFamily: F.i700 },
});
