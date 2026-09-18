import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDisplayDate } from '../src/components/DatePickerModal';
import { useAppTheme } from '../src/store/theme';
import { F } from '../src/theme/fonts';
import { safeBack } from '../src/utils/navigation';
import { daysUntil, parseSharedProduct } from './import';

// Read-only warranty verification for buyers. Consumes the same strict,
// whitelisted payload as /import — the sender's claimed status is ignored and
// validity is recomputed from warrantyEnd. Nothing here writes to the wallet.

export default function VerifyScreen() {
  const { product } = useLocalSearchParams<{ product?: string }>();
  const { colors, isDark } = useAppTheme();
  const shared = useMemo(() => parseSharedProduct(product), [product]);

  const closeScreen = () => safeBack('/products');

  if (!shared) {
    return (
      <View style={[s.page, s.center, { backgroundColor: colors.page }]}>
        <Pressable onPress={closeScreen} style={[s.closeTop, { backgroundColor: colors.cardAlt }]}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={[s.stateIcon, { backgroundColor: isDark ? '#2A1A1A' : '#FFE8E8' }]}>
          <Ionicons name="alert-circle-outline" size={46} color={isDark ? '#B85555' : '#E0363E'} />
        </View>
        <Text style={[s.stateTitle, { color: colors.text }]}>This verify link is invalid or damaged</Text>
        <Text style={[s.stateText, { color: colors.muted }]}>Ask the seller for a fresh Warret verify link and try again.</Text>
        <Pressable onPress={closeScreen} style={[s.primaryBtn, { backgroundColor: colors.primary, alignSelf: 'stretch', marginTop: 24 }]}>
          <Text style={s.primaryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const days = daysUntil(shared.warrantyEnd);
  const verdict = days === null
    ? {
        icon: 'shield-outline' as const,
        title: 'No expiry on record',
        detail: 'This link does not include a warranty end date.',
        color: colors.muted,
        bg: colors.cardAlt,
      }
    : days < 0
      ? {
          icon: 'shield-outline' as const,
          title: 'Expired',
          detail: `Warranty ended ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago`,
          color: isDark ? '#B85555' : '#E0363E',
          bg: isDark ? '#3A1A1A' : '#FFE0E0',
        }
      : days <= 60
        ? {
            icon: 'shield-half-outline' as const,
            title: 'Expiring soon',
            detail: days === 0 ? 'Warranty ends today' : `${days} day${days !== 1 ? 's' : ''} of coverage remaining`,
            color: isDark ? '#B8822A' : '#C8751B',
            bg: isDark ? '#3A2E1A' : '#FFF1DD',
          }
        : {
            icon: 'shield-checkmark' as const,
            title: 'Warranty valid',
            detail: `${days} days of coverage remaining`,
            color: isDark ? '#3D9B68' : '#17713A',
            bg: isDark ? '#1A3A29' : '#DDFBE8',
          };

  return (
    <ScrollView style={[s.page, { backgroundColor: colors.page }]} contentContainerStyle={s.content}>
      <Pressable onPress={closeScreen} style={[s.closeTop, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>

      <Text style={[s.screenLabel, { color: colors.muted }]}>Warranty check</Text>

      {/* Big status indicator */}
      <View style={[s.verdictCard, { backgroundColor: verdict.bg, borderColor: colors.border }]}>
        <Ionicons name={verdict.icon} size={54} color={verdict.color} />
        <Text style={[s.verdictTitle, { color: verdict.color }]}>{verdict.title}</Text>
        <Text style={[s.verdictDetail, { color: colors.muted }]}>{verdict.detail}</Text>
      </View>

      {/* Product details */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.productName, { color: colors.text }]}>{shared.name}</Text>
        {(shared.brand || shared.type) ? (
          <Text style={[s.productMeta, { color: colors.muted }]}>
            {[shared.brand, shared.type].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

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

      {/* Per-document expiries */}
      {shared.docEntries.length > 0 ? (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Document expiries</Text>
          {shared.docEntries.map((entry) => {
            const entryDays = daysUntil(entry.expiry || undefined);
            const entryColor = entryDays === null
              ? colors.muted
              : entryDays < 0
                ? (isDark ? '#B85555' : '#E0363E')
                : entryDays <= 60
                  ? (isDark ? '#B8822A' : '#C8751B')
                  : (isDark ? '#3D9B68' : '#17713A');
            return (
              <View key={`${entry.fileName}-${entry.label}`} style={[s.docRow, { borderTopColor: colors.border }]}>
                <View style={[s.docDot, { backgroundColor: entryColor }]} />
                <Text numberOfLines={1} style={[s.docLabel, { color: colors.text }]}>{entry.label}</Text>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={[s.docExpiry, { color: entryColor }]}>{entry.expiry ? formatDisplayDate(entry.expiry) : 'No date'}</Text>
                  {entryDays !== null ? (
                    <Text style={[s.docDays, { color: entryColor }]}>
                      {entryDays < 0 ? `${Math.abs(entryDays)}d overdue` : entryDays === 0 ? 'Today!' : `${entryDays}d left`}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={[s.caption, { color: colors.muted }]}>
        This summary was generated from a Warret share link. Verify physical documents before purchase.
      </Text>

      <Pressable onPress={closeScreen} style={[s.primaryBtn, { backgroundColor: colors.primary }]}>
        <Text style={s.primaryBtnText}>Close</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 26, paddingTop: 76, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  closeTop: { position: 'absolute', right: 20, top: 52, zIndex: 2, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  screenLabel: { fontSize: 13, lineHeight: 17, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: F.n900 },

  verdictCard: { alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingVertical: 30, paddingHorizontal: 20, marginTop: 14 },
  verdictTitle: { fontSize: 27, lineHeight: 33, fontWeight: '900', marginTop: 12, textAlign: 'center', fontFamily: F.n900 },
  verdictDetail: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 6, textAlign: 'center', fontFamily: F.n800 },

  card: { borderRadius: 18, borderWidth: 1, padding: 18, marginTop: 16 },
  cardTitle: { fontSize: 13, lineHeight: 17, fontWeight: '900', textTransform: 'uppercase', fontFamily: F.n900 },
  productName: { fontSize: 22, lineHeight: 28, fontWeight: '900', fontFamily: F.n900 },
  productMeta: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 4, fontFamily: F.n800 },
  rowDivider: { borderTopWidth: 1, marginTop: 16, marginBottom: 14 },
  rowLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', fontFamily: F.n800 },
  rowValue: { fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 3, fontFamily: F.n900 },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, marginTop: 4 },
  docDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  docLabel: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '800', fontFamily: F.n800 },
  docExpiry: { fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900 },
  docDays: { fontSize: 11, lineHeight: 15, fontWeight: '800', fontFamily: F.n800 },

  caption: { fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center', marginTop: 18, fontFamily: F.i700 },

  primaryBtn: { minHeight: 50, borderRadius: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: 'white', fontSize: 16, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },

  stateIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  stateTitle: { fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  stateText: { fontSize: 15, lineHeight: 21, fontWeight: '700', textAlign: 'center', marginTop: 8, fontFamily: F.i700 },
});
