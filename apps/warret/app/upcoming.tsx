import { useMemo } from 'react';
import { ScrollView, Text, View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProducts } from '../src/store/products';
import { useGroups } from '../src/store/groups';
import { useAppTheme } from '../src/store/theme';
import { formatDisplayDate } from '../src/components/DatePickerModal';
import type { Product } from '../src/data/products';
import { F } from '../src/theme/fonts';
import { safeBack } from '../src/utils/navigation';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const TEAL = '#0D9488';
const TEAL_DARK = '#14B8A6';

function urgencyColor(days: number, isDark: boolean) {
  if (days <= 7)  return isDark ? '#F87171' : '#DC2626';
  if (days <= 30) return isDark ? '#FBBF24' : '#D97706';
  if (days <= 60) return isDark ? '#FCD34D' : '#CA8A04';
  return isDark ? TEAL_DARK : '#0F766E';
}
function urgencyBg(days: number, isDark: boolean) {
  if (days <= 7)  return isDark ? '#3A1A1A' : '#FEE2E2';
  if (days <= 30) return isDark ? '#3A2800' : '#FEF3C7';
  if (days <= 60) return isDark ? '#2E2800' : '#FEF9C3';
  return isDark ? '#0F2926' : '#CCFBF1';
}

export type UpcomingEntry = {
  productId: string;
  productName: string;
  label: string;
  expiry: string;
  daysLeft: number;
};

export function getUpcomingExpiries(products: Product[], limit = 10): UpcomingEntry[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const entries: UpcomingEntry[] = [];

  for (const p of products) {
    if (p.docEntries && p.docEntries.length > 0) {
      for (const d of p.docEntries) {
        if (!d.expiry) continue;
        const days = Math.ceil((new Date(`${d.expiry}T00:00:00`).getTime() - today.getTime()) / 86400000);
        if (days >= 0) entries.push({ productId: p.id, productName: p.name, label: d.label, expiry: d.expiry, daysLeft: days });
      }
    } else {
      if (!p.warrantyEnd) continue;
      const days = Math.ceil((new Date(`${p.warrantyEnd}T00:00:00`).getTime() - today.getTime()) / 86400000);
      if (days >= 0) entries.push({ productId: p.id, productName: p.name, label: 'Warranty', expiry: p.warrantyEnd, daysLeft: days });
    }
  }

  return entries.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, limit);
}

function daysLabel(days: number) {
  if (days === 0) return 'Today!';
  if (days === 1) return 'Tomorrow';
  return `${days} days left`;
}

export default function Upcoming() {
  const { width, height } = useWindowDimensions();
  const { products }      = useProducts();
  const { groups, canView } = useGroups();
  const { colors, isDark } = useAppTheme();

  const cs      = clamp(Math.min(width / 390, height / 844), 0.7, 1.08);
  const padH    = clamp(width * 0.056 * cs, 14, 22);

  // All group products show in upcoming (regardless of merge setting)
  const mergedGroupProductIds = useMemo(
    () => new Set(groups.flatMap((g) => g.mergeAllToMain ? g.products.map((gp) => gp.productId) : [])),
    [groups],
  );
  const nonMergedGroupProductIds = useMemo(
    () => new Set(groups.flatMap((g) => !g.mergeAllToMain ? g.products.filter((gp) => canView(g, gp.productId)).map((gp) => gp.productId) : [])),
    [groups, canView],
  );
  const allProducts = useMemo(() => [
    ...products.filter((p) => !p.groupId || mergedGroupProductIds.has(p.id)),
    ...products.filter((p) => p.groupId && nonMergedGroupProductIds.has(p.id)),
  ], [products, mergedGroupProductIds, nonMergedGroupProductIds]);
  const entries = useMemo(() => getUpcomingExpiries(allProducts, 20), [allProducts]);

  return (
    <View style={[s.page, { backgroundColor: colors.page }]}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: padH, paddingTop: clamp(height * 0.065, 46, 62), borderBottomColor: colors.border }]}>
        <Pressable onPress={() => safeBack('/')} style={[s.backBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={clamp(20 * cs, 17, 22)} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[s.headerTitle, { fontSize: clamp(width * 0.068 * cs, 22, 28), color: colors.text }]}>Upcoming expiries</Text>
          <Text style={[s.headerSub, { fontSize: clamp(width * 0.038 * cs, 12, 15), color: colors.muted }]}>
            {entries.length === 0 ? 'Nothing expiring soon' : `Next ${entries.length} expiries`}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: padH, paddingTop: clamp(height * 0.024, 14, 22), paddingBottom: 60, gap: clamp(10 * cs, 8, 14) }}>
        {entries.length === 0 ? (
          <View style={[s.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle-outline" size={38} color={isDark ? TEAL_DARK : TEAL} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>All clear!</Text>
            <Text style={[s.emptySub, { color: colors.muted }]}>All your active warranties are safely tracked — nothing expiring soon.</Text>
          </View>
        ) : entries.map((entry, i) => {
          const rowColor = urgencyColor(entry.daysLeft, isDark);
          const rowBg    = urgencyBg(entry.daysLeft, isDark);
          return (
            <Pressable
              key={`${entry.productId}-${entry.label}-${i}`}
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: entry.productId, section: 'documents' } })}
              style={[s.row, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: clamp(width * 0.042 * cs, 14, 20) }]}
            >
              {/* Rank number */}
              <View style={[s.rank, { width: clamp(32 * cs, 26, 36), height: clamp(32 * cs, 26, 36), borderRadius: clamp(16 * cs, 13, 18), backgroundColor: i === 0 ? (isDark ? TEAL_DARK : TEAL) : colors.cardAlt }]}>
                <Text style={[s.rankText, { fontSize: clamp(12 * cs, 10, 14), color: i === 0 ? 'white' : colors.muted }]}>{i + 1}</Text>
              </View>

              {/* Info */}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[s.rowName, { fontSize: clamp(width * 0.044 * cs, 14, 18), color: colors.text }]}>
                  {entry.productName}
                </Text>
                <Text style={[s.rowLabel, { fontSize: clamp(width * 0.034 * cs, 11, 14), color: colors.muted }]}>
                  {entry.label}
                </Text>
                <Text style={[s.rowDate, { fontSize: clamp(width * 0.036 * cs, 11, 14), color: rowColor }]}>
                  Expiring on {formatDisplayDate(entry.expiry)}
                </Text>
              </View>

              {/* Days pill */}
              <View style={[s.daysPill, { backgroundColor: rowBg }]}>
                <Text style={[s.daysText, { color: rowColor, fontSize: clamp(width * 0.032 * cs, 10, 13) }]}>
                  {daysLabel(entry.daysLeft)}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={clamp(16 * cs, 13, 18)} color={colors.muted} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerTitle: { fontFamily: F.n900, fontWeight: '900', lineHeight: 32 },
  headerSub:   { fontFamily: F.i500, fontWeight: '500', marginTop: 2 },

  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1 },
  rank:        { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankText:    { fontFamily: F.n900, fontWeight: '900' },
  rowName:     { fontFamily: F.n900, fontWeight: '900' },
  rowLabel:    { fontFamily: F.i500, fontWeight: '500' },
  rowDate:     { fontFamily: F.n800, fontWeight: '800' },
  daysPill:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, flexShrink: 0 },
  daysText:    { fontFamily: F.n900, fontWeight: '900' },

  empty:       { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40, borderRadius: 20, borderWidth: 1, marginTop: 20 },
  emptyTitle:  { fontSize: 20, fontFamily: F.n900, fontWeight: '900' },
  emptySub:    { fontSize: 14, fontFamily: F.i500, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
});
