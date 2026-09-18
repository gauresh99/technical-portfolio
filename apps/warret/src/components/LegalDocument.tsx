import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../store/theme';
import { F } from '../theme/fonts';
import { safeBack } from '../utils/navigation';

type Section = {
  title: string;
  body: string[];
};

export function LegalDocument({
  title,
  subtitle,
  updated,
  summary,
  sections,
  footer,
}: {
  title: string;
  subtitle: string;
  updated: string;
  summary: string[];
  sections: Section[];
  footer?: ReactNode;
}) {
  const { colors, isDark } = useAppTheme();

  return (
    <View style={[s.page, { backgroundColor: colors.page }]}>
      <View style={[s.hero, { backgroundColor: colors.primary }]}>
        <Pressable onPress={() => safeBack('/(tabs)/settings')} style={s.back}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <Text style={s.eyebrow}>Warret Legal</Text>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
        <Text style={s.updated}>Last updated: {updated}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.summary, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Text style={[s.summaryTitle, { color: colors.text }]}>Plain-English summary</Text>
          {summary.map((item) => (
            <View key={item} style={s.summaryRow}>
              <Ionicons name="checkmark-circle" size={17} color={colors.primary} />
              <Text style={[s.summaryText, { color: colors.muted }]}>{item}</Text>
            </View>
          ))}
        </View>

        {sections.map((section, index) => (
          <View key={section.title} style={[s.section, { borderColor: colors.border }]}>
            <Text style={[s.sectionNumber, { color: colors.primary }]}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={[s.sectionTitle, { color: colors.text }]}>{section.title}</Text>
            {section.body.map((paragraph) => (
              <Text key={paragraph} style={[s.body, { color: colors.muted }]}>{paragraph}</Text>
            ))}
          </View>
        ))}

        <View style={[s.notice, { backgroundColor: isDark ? '#171323' : '#F8F7FF', borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={[s.noticeText, { color: colors.text }]}>
            This page is a product draft for Warret. It should be reviewed by qualified counsel before public launch.
          </Text>
        </View>

        {footer}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  hero: { paddingTop: 54, paddingHorizontal: 22, paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  eyebrow: { color: 'rgba(255,255,255,.72)', fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: F.n900 },
  title: { color: 'white', fontSize: 34, lineHeight: 39, fontWeight: '900', fontFamily: F.n900, marginTop: 4 },
  subtitle: { color: 'rgba(255,255,255,.82)', fontSize: 15, lineHeight: 21, fontWeight: '500', fontFamily: F.i500, marginTop: 8 },
  updated: { color: 'rgba(255,255,255,.68)', fontSize: 12, lineHeight: 16, fontWeight: '500', fontFamily: F.i500, marginTop: 14 },
  content: { padding: 18, paddingBottom: 42, gap: 14 },
  summary: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 10 },
  summaryTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', fontFamily: F.n900 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  summaryText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '500', fontFamily: F.i500 },
  section: { borderTopWidth: 1, paddingTop: 18 },
  sectionNumber: { fontSize: 11, lineHeight: 14, fontWeight: '900', fontFamily: F.n900, letterSpacing: 0.7 },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', fontFamily: F.n900, marginTop: 4, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, fontWeight: '600', fontFamily: F.i600, marginBottom: 9 },
  notice: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '800', fontFamily: F.i700 },
});
