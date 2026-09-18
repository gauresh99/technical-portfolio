import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useAppTheme } from '../src/store/theme';
import { F } from '../src/theme/fonts';
import { sanitizeFileName } from '../src/utils/security';
import { safeBack } from '../src/utils/navigation';

const firstParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const safeHttpsUrl = (value: string | string[] | undefined): string | null => {
  const raw = firstParam(value);
  if (!raw || raw.length > 5000) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
};

export default function DocumentScreen() {
  const params = useLocalSearchParams<{ u?: string; name?: string; product?: string }>();
  const { colors, isDark } = useAppTheme();
  const [status, setStatus] = useState('');

  const url = useMemo(() => safeHttpsUrl(params.u), [params.u]);
  const fileName = sanitizeFileName(firstParam(params.name) || 'Warret document');
  const productName = (firstParam(params.product) || '').trim().slice(0, 120);

  const closeScreen = () => safeBack('/products');

  const openDocument = async () => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      setStatus('Could not open this document link.');
    }
  };

  const shareDocument = async () => {
    if (!url) return;
    try {
      if (Platform.OS === 'web') {
        if ((globalThis.navigator as any)?.share) {
          await (globalThis.navigator as any).share({ title: fileName, url });
          return;
        }
        await globalThis.navigator?.clipboard?.writeText(url);
        setStatus('Share link copied.');
      } else if (await Sharing.isAvailableAsync().catch(() => false)) {
        await Sharing.shareAsync(url, { dialogTitle: fileName });
      } else {
        await Share.share({ message: url, url });
      }
    } catch {
      setStatus('Could not share this document link.');
    }
  };

  const downloadDocument = async () => {
    if (!url) return;
    if (Platform.OS !== 'web') {
      await shareDocument();
      return;
    }
    try {
      const blob = await fetch(url).then((response) => response.blob());
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setStatus('Download started.');
    } catch {
      setStatus('Could not download this document. The link may have expired.');
    }
  };

  if (!url) {
    return (
      <View style={[s.page, s.center, { backgroundColor: colors.page }]}>
        <Pressable onPress={closeScreen} style={[s.closeTop, { backgroundColor: colors.cardAlt }]}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={[s.stateIcon, { backgroundColor: isDark ? '#2A1A1A' : '#FFE8E8' }]}>
          <Ionicons name="document-lock-outline" size={44} color={isDark ? '#B85555' : '#E0363E'} />
        </View>
        <Text style={[s.stateTitle, { color: colors.text }]}>This document link is invalid or expired</Text>
        <Text style={[s.stateText, { color: colors.muted }]}>Ask the sender to create a fresh Warret document link.</Text>
        <Pressable onPress={closeScreen} style={[s.primaryBtn, { backgroundColor: colors.primary, alignSelf: 'stretch', marginTop: 24 }]}>
          <Text style={s.primaryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={[s.page, { backgroundColor: colors.page }]} contentContainerStyle={s.content}>
      <Pressable onPress={closeScreen} style={[s.closeTop, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>

      <View style={[s.headerIcon, { backgroundColor: colors.soft }]}>
        <Ionicons name="document-attach-outline" size={32} color={colors.primary} />
      </View>
      <Text style={[s.title, { color: colors.text }]}>Shared document</Text>
      <Text style={[s.subtitle, { color: colors.muted }]}>
        This secure Warret link opens a time-limited copy of the file.
      </Text>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[s.fileIcon, { backgroundColor: colors.primary + '18' }]}>
          <Ionicons name="document-text-outline" size={38} color={colors.primary} />
        </View>
        <Text style={[s.fileName, { color: colors.text }]} numberOfLines={2}>{fileName}</Text>
        {productName ? <Text style={[s.productName, { color: colors.muted }]} numberOfLines={1}>{productName}</Text> : null}
        <Text style={[s.note, { color: colors.muted }]}>Links expire quickly. If it stops opening, ask for a new share link.</Text>
      </View>

      <Pressable onPress={openDocument} style={[s.primaryBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="open-outline" size={19} color="white" />
        <Text style={s.primaryBtnText}>Open document</Text>
      </Pressable>
      <Pressable onPress={downloadDocument} style={[s.secondaryBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <Ionicons name="download-outline" size={19} color={colors.primary} />
        <Text style={[s.secondaryBtnText, { color: colors.primary }]}>Download</Text>
      </Pressable>
      <Pressable onPress={shareDocument} style={[s.secondaryBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <Ionicons name="share-outline" size={19} color={colors.primary} />
        <Text style={[s.secondaryBtnText, { color: colors.primary }]}>Share</Text>
      </Pressable>
      {status ? <Text style={[s.status, { color: colors.muted }]}>{status}</Text> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 26, paddingTop: 76, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  closeTop: { position: 'absolute', right: 20, top: 52, zIndex: 2, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '900', textAlign: 'center', marginTop: 18, fontFamily: F.n900 },
  subtitle: { fontSize: 15, lineHeight: 21, fontWeight: '700', textAlign: 'center', marginTop: 7, fontFamily: F.i700 },
  card: { alignItems: 'center', borderRadius: 20, borderWidth: 1, padding: 20, marginTop: 22 },
  fileIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 20, lineHeight: 26, fontWeight: '900', textAlign: 'center', marginTop: 14, fontFamily: F.n900 },
  productName: { fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center', marginTop: 4, fontFamily: F.n800 },
  note: { fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center', marginTop: 14, fontFamily: F.i700 },
  primaryBtn: { minHeight: 50, borderRadius: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: 'white', fontSize: 16, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  secondaryBtn: { minHeight: 48, borderRadius: 16, marginTop: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryBtnText: { fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  status: { textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 12, fontFamily: F.n800 },
  stateIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  stateTitle: { fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  stateText: { fontSize: 15, lineHeight: 21, fontWeight: '700', textAlign: 'center', marginTop: 8, fontFamily: F.i700 },
});
