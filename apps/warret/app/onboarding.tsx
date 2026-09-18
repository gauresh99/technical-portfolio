import { useRef, useState } from 'react';
import {
  Animated, Pressable, ScrollView, StyleSheet,
  Text, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/store/auth';
import { F } from '../src/theme/fonts';
import { useAppTheme } from '../src/store/theme';

const purple = '#5B4DF0';
const clamp  = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type Step = {
  icon:    keyof typeof Ionicons.glyphMap;
  color:   string;
  bg:      string;
  bgDark:  string;
  title:   string;
  sub:     string;
  tip:     string;
};

const STEPS: Step[] = [
  {
    icon:   'shield-checkmark',
    color:  purple,
    bg:     '#EEF0FF',
    bgDark: '#1E1A3A',
    title:  'Never lose a warranty again',
    sub:    'The average household has dozens of products under warranty right now. Most people find out theirs expired the day they needed it.',
    tip:    'Start with the product you\'d be most annoyed to replace out-of-pocket.',
  },
  {
    icon:   'cloud-upload-outline',
    color:  '#0D9488',
    bg:     '#ECFDF5',
    bgDark: '#0D2920',
    title:  'Add a product in seconds',
    sub:    'Take a photo of any warranty document. Warret reads it and fills in every date automatically — no typing required.',
    tip:    'Or enter details manually for older warranties without documents.',
  },
  {
    icon:   'calendar-outline',
    color:  '#D97706',
    bg:     '#FFFBEB',
    bgDark: '#2A1E00',
    title:  'Get warned before it\'s too late',
    sub:    'Warret alerts you weeks before a warranty expires — so you have time to act, not just regret.',
    tip:    'Most people set a 1-month reminder. For expensive items, try 3 months.',
  },
  {
    icon:   'people-outline',
    color:  '#7C3AED',
    bg:     '#F5F3FF',
    bgDark: '#1A1230',
    title:  'Cover your whole household',
    sub:    'Share your warranty vault with family or housemates. One person adds it, everyone benefits.',
    tip:    'The person who creates a group is the admin — they decide who can add or remove items.',
  },
];

function StepCard({ step, isDark }: { step: Step; isDark: boolean }) {
  const { width, height } = useWindowDimensions();
  const cs   = clamp(Math.min(width / 390, height / 844), 0.78, 1.08);
  const icBg = isDark ? step.bgDark : step.bg;

  return (
    <View style={[sc.card, { width }]}>
      {/* Icon illustration */}
      <View style={[sc.iconWrap, { backgroundColor: icBg, width: clamp(130 * cs, 100, 150), height: clamp(130 * cs, 100, 150), borderRadius: clamp(38 * cs, 28, 44) }]}>
        <Ionicons name={step.icon} size={clamp(62 * cs, 46, 72)} color={step.color} />
      </View>
      <Text style={[sc.title, { fontSize: clamp(26 * cs, 20, 30), lineHeight: clamp(32 * cs, 25, 38) }]}>{step.title}</Text>
      <Text style={[sc.sub, { fontSize: clamp(15 * cs, 13, 17), lineHeight: clamp(23 * cs, 19, 27) }]}>{step.sub}</Text>
      <View style={[sc.tipRow, { backgroundColor: isDark ? '#1C1A25' : '#F7F6FF', borderColor: isDark ? '#3A3650' : '#E5E2F4' }]}>
        <Ionicons name="bulb-outline" size={15} color={purple} />
        <Text style={[sc.tipText, { color: isDark ? '#A9A3C5' : '#6B64A0' }]}>{step.tip}</Text>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  card:    { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 18 },
  iconWrap:{ alignItems: 'center', justifyContent: 'center', marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  title:   { fontWeight: '900', textAlign: 'center', color: '#25222F', fontFamily: F.n800 },
  sub:     { fontWeight: '600', textAlign: 'center', color: '#6B6480', maxWidth: 310, fontFamily: F.i600 },
  tipRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, maxWidth: 310 },
  tipText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18, fontFamily: F.n700 },
});

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useAppTheme();
  const { markOnboardingDone } = useAuth();
  const [current, setCurrent]  = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim  = useRef(new Animated.Value(1)).current;

  const cs     = clamp(Math.min(width / 390, height / 844), 0.78, 1.08);
  const isLast = current === STEPS.length - 1;

  const goTo = (index: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.4, duration: 80, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1,   duration: 160, useNativeDriver: true }),
    ]).start();
    setCurrent(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const next = () => {
    if (isLast) { markOnboardingDone(); return; }
    goTo(current + 1);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.page }]}>
      {/* Skip */}
      <Pressable onPress={markOnboardingDone} style={s.skipBtn}>
        <Text style={[s.skipText, { color: colors.muted }]}>Skip</Text>
      </Pressable>

      {/* Step cards (horizontal pager) */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {STEPS.map((step, i) => (
            <StepCard key={i} step={step} isDark={isDark} />
          ))}
        </ScrollView>
      </Animated.View>

      {/* Bottom area */}
      <View style={[s.bottom, { paddingHorizontal: clamp(width * 0.07, 22, 36), paddingBottom: clamp(height * 0.06, 32, 60) }]}>
        {/* Dot indicators */}
        <View style={s.dots}>
          {STEPS.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)}>
              <View style={[
                s.dot,
                { backgroundColor: i === current ? purple : colors.border },
                i === current && s.dotActive,
              ]} />
            </Pressable>
          ))}
        </View>

        {/* Next / Get started button */}
        <Pressable onPress={next} style={[s.nextBtn, { backgroundColor: purple }]}>
          <Text style={[s.nextText, { fontSize: clamp(16 * cs, 14, 18) }]}>
            {isLast ? 'Get started' : 'Next'}
          </Text>
          <Ionicons
            name={isLast ? 'checkmark-circle-outline' : 'arrow-forward'}
            size={clamp(20 * cs, 17, 22)}
            color="white"
          />
        </Pressable>

        {/* Step counter */}
        <Text style={[s.counter, { color: colors.muted }]}>
          {current + 1} / {STEPS.length}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1 },
  skipBtn: { position: 'absolute', top: 56, right: 24, zIndex: 10, paddingHorizontal: 14, paddingVertical: 8 },
  skipText:{ fontSize: 15, fontWeight: '800', fontFamily: F.n800 },
  bottom:  { gap: 16 },
  dots:    { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  dotActive:{ width: 22 },
  nextBtn: { height: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: purple, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  nextText:{ fontWeight: '900', color: 'white', fontFamily: F.n900 },
  counter: { fontSize: 13, fontWeight: '700', textAlign: 'center', fontFamily: F.i700 },
});
