import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { purple } from '../src/components/ui';
import { useAppTheme } from '../src/store/theme';
import { safeBack } from '../src/utils/navigation';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const benefits = [
  'Unlimited products, documents and warranty history',
  'Smart expiry insights with advanced reminder rules',
  'Cloud backup with restore points across devices',
  'Scheduled exports with product-expiry calendar highlights',
  'Priority support for claims, coverage and setup questions',
];

const comparisons = [
  ['Products', 'Up to 10', 'Unlimited'],
  ['Documents', 'Basic uploads', 'Full cloud vault'],
  ['Reminders', 'Standard alerts', 'Advanced schedules'],
  ['Exports', 'Manual PDF/CSV', 'Scheduled PDF/CSV/JSON'],
  ['Backup', 'Local only', 'Cloud sync + restore'],
  ['Support', 'Community help', 'Priority support'],
];

export default function Pro() {
  const { width, height } = useWindowDimensions();
  const { colors } = useAppTheme();
  const [requested, setRequested] = useState(false);
  const scale = clamp(Math.min(width / 390, height / 844), 0.72, 1.08);
  const padding = clamp(width * 0.06 * scale, 18, 28);

  return (
    <View style={[s.page, { backgroundColor: colors.page }]}>
      <View style={[s.hero, { backgroundColor: colors.primary, paddingTop: clamp(height * 0.058, 36, 54), paddingHorizontal: padding, paddingBottom: clamp(height * 0.038, 26, 36) }]}>
        <Pressable onPress={() => safeBack('/(tabs)/settings')} style={s.close}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <View style={s.heroIcon}>
          <Ionicons name="sparkles-outline" size={28} color="white" />
        </View>
        <Text style={[s.title, { fontSize: clamp(width * 0.092 * scale, 30, 38), lineHeight: clamp(width * 0.108 * scale, 36, 46) }]}>Warret Pro</Text>
        <Text style={s.sub}>Most people discover their warranty expired the day they needed it. Pro makes sure that never happens to you.</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: padding, paddingBottom: 120 }}>
        <View style={[s.priceCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Text style={[s.plan, { color: colors.primary }]}>Pro</Text>
          <View style={s.priceRow}>
            <Text style={[s.price, { color: colors.text }]}>$4.99</Text>
            <Text style={[s.period, { color: colors.muted }]}>/ month</Text>
          </View>
          <Text style={[s.note, { color: colors.muted }]}>Preview pricing. Checkout is not connected yet, so you will not be charged.</Text>
          <Pressable
            onPress={() => setRequested(true)}
            style={[s.primary, { backgroundColor: requested ? colors.soft : colors.primary, borderColor: requested ? colors.border : colors.primary }]}
          >
            <Text style={[s.primaryText, requested && { color: colors.primary }]}>
              {requested ? 'Early access requested' : 'Request Pro access'}
            </Text>
          </Pressable>
          {requested ? <Text style={[s.note, { color: colors.muted }]}>We will enable checkout here after billing is connected.</Text> : null}
        </View>

        <Text style={[s.sectionTitle, { color: colors.text }]}>Benefits</Text>
        <View style={[s.card, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          {benefits.map((benefit) => (
            <View key={benefit} style={s.benefitRow}>
              <Ionicons name="checkmark-circle" size={21} color="#45B977" />
              <Text style={[s.benefitText, { color: colors.text }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.sectionTitle, { color: colors.text }]}>Free vs Pro</Text>
        <View style={[s.table, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <View style={[s.tableRow, s.tableHead, { backgroundColor: colors.soft, borderColor: colors.border }]}>
            <Text style={[s.cell, s.headText, { color: colors.text }]}>Feature</Text>
            <Text style={[s.cell, s.headText, { color: colors.text }]}>Free</Text>
            <Text style={[s.cell, s.headText, { color: colors.text }]}>Pro</Text>
          </View>
          {comparisons.map(([feature, free, pro]) => (
            <View key={feature} style={[s.tableRow, { borderColor: colors.border }]}>
              <Text style={[s.cell, s.featureText, { color: colors.text }]}>{feature}</Text>
              <Text style={[s.cell, { color: colors.muted }]}>{free}</Text>
              <Text style={[s.cell, s.proText, { color: colors.primary }]}>{pro}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'white' },
  hero: { backgroundColor: purple, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)' },
  heroIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.34)', marginTop: 18 },
  title: { color: 'white', fontWeight: '900', marginTop: 14 },
  sub: { color: '#D7D1FF', fontSize: 15, lineHeight: 21, fontWeight: '700', marginTop: 5 },
  priceCard: { marginTop: 20, padding: 18, borderRadius: 22, backgroundColor: '#F5F5F8', borderWidth: 1, borderColor: '#EEEAFE' },
  plan: { color: purple, fontSize: 15, lineHeight: 19, fontWeight: '900', textTransform: 'uppercase' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 },
  price: { color: '#25222F', fontSize: 38, lineHeight: 44, fontWeight: '900' },
  period: { color: '#81798F', fontSize: 15, lineHeight: 23, fontWeight: '800', marginLeft: 4, marginBottom: 4 },
  note: { color: '#81798F', fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 8 },
  primary: { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: purple, marginTop: 16, borderWidth: 1 },
  primaryText: { color: 'white', fontSize: 16, lineHeight: 20, fontWeight: '900' },
  sectionTitle: { color: '#25222F', fontSize: 22, lineHeight: 28, fontWeight: '900', marginTop: 26, marginBottom: 12 },
  card: { padding: 16, borderRadius: 20, backgroundColor: '#F5F5F8', borderWidth: 1, borderColor: '#EEEAFE' },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  benefitText: { flex: 1, color: '#292633', fontSize: 15, lineHeight: 21, fontWeight: '800' },
  table: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#E7E2F6', backgroundColor: 'white' },
  tableRow: { flexDirection: 'row', minHeight: 54, borderBottomWidth: 1, borderColor: '#ECE8FA' },
  tableHead: { backgroundColor: '#F0ECFF' },
  cell: { flex: 1, color: '#5F586D', fontSize: 12, lineHeight: 17, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 12 },
  headText: { color: '#25222F', fontWeight: '900' },
  featureText: { color: '#292633', fontWeight: '900' },
  proText: { color: purple, fontWeight: '900' },
});
