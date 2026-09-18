import { useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Platform, ScrollView, Share, Text, TextInput, View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { purple } from '../../src/components/ui';
import { ExpiryReminder, formatReminderDate, nextReminderDate } from '../../src/components/ExpiryReminder';
import { DatePickerModal, formatDisplayDate } from '../../src/components/DatePickerModal';
import { DEMO_PRODUCT } from '../../src/data/demo';
import { useProducts } from '../../src/store/products';
import { useEditGuard } from '../../src/store/editGuard';
import { useAppTheme } from '../../src/store/theme';
import { FileStorageService } from '../../src/services/fileStorage';
import { F } from '../../src/theme/fonts';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function Detail() {
  const { width, height } = useWindowDimensions();
  const { id, section, edit } = useLocalSearchParams<{ id?: string; section?: string; edit?: string }>();
  const navigation = useNavigation();
  const { products, updateProduct, removeDocument, setReminders } = useProducts();
  const { setHasDirtyEdit, requestLeave, setBeforeSave } = useEditGuard();
  const { colors, isDark } = useAppTheme();
  const expiryStatusColor = (days: number | null) => {
    if (days === null) return colors.muted;
    if (days < 0)    return isDark ? '#B85555' : '#E0363E';
    if (days <= 60)  return isDark ? '#B8822A' : '#C8751B';
    return isDark ? '#3D9B68' : '#17713A';
  };
  const storedProduct = products.find((product) => product.id === id);
  const isDemoProduct = id === DEMO_PRODUCT.id && products.length === 0 && !storedProduct;
  const p = storedProduct || (isDemoProduct ? DEMO_PRODUCT : undefined);
  const [editing, setEditing] = useState(edit === '1' && !isDemoProduct);
  const [docPicking, setDocPicking] = useState(false);
  const [expiryPickerOpen, setExpiryPickerOpen] = useState(false);
  const [docEntriesOpen, setDocEntriesOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [docLinkStatus, setDocLinkStatus] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionY = useRef<Record<string, number>>({});
  const markDirty = () => {
    if (isDemoProduct) return;
    setHasDirtyEdit(true);
  };
  const scale = clamp(Math.min(width / 390, height / 844), 0.72, 1.08);
  const pagePadding = clamp(width * 0.06 * scale, 18, 28);
  const tileGap = clamp(width * 0.035 * scale, 10, 16);
  const tileWidth = (width - pagePadding * 2 - tileGap) / 2;
  const tileSizing = {
    width: tileWidth,
    minHeight: clamp(tileWidth * 1.12, 142, 196),
    borderRadius: clamp(width * 0.042 * scale, 14, 18),
    padding: clamp(width * 0.035 * scale, 11, 16),
    marginBottom: tileGap,
  };
  const previewSizing = {
    height: clamp(tileWidth * 0.72, 86, 126),
    borderRadius: clamp(width * 0.032 * scale, 10, 14),
  };
  const actionGap = clamp(width * 0.026 * scale, 8, 12);
  const actionWidth = (width - pagePadding * 2 - actionGap * 3) / 4;
  const actionSizing = {
    width: actionWidth,
    minHeight: clamp(actionWidth * 0.72, 72, 96),
    borderRadius: clamp(width * 0.04 * scale, 13, 17),
    padding: clamp(width * 0.028 * scale, 9, 13),
  };
  const actions = [
    { label: 'Coverage', section: 'coverage', icon: 'shield-outline' },
    { label: 'Support', section: 'support', icon: 'headset-outline' },
    { label: 'Extended', section: 'extended', icon: 'shield-checkmark-outline' },
    { label: 'Share', section: 'share', icon: 'share-outline' },
  ];
  const scrollToSection = (target: string) => {
    const y = sectionY.current[target];
    if (typeof y === 'number') scrollRef.current?.scrollTo({ y: Math.max(y - 16, 0), animated: true });
  };
  const registerSection = (target: string, y: number) => {
    sectionY.current[target] = y;
    if (section === target) setTimeout(() => scrollToSection(target), 40);
  };
  useEffect(() => {
    if (isDemoProduct || edit !== '1' || !p?.id) return;
    setEditing(true);
    router.replace(`/product/${p.id}`);
  }, [edit, p?.id, isDemoProduct]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      setEditing(false);
      setHasDirtyEdit(false);
    });
    return unsubscribe;
  }, [navigation, setHasDirtyEdit]);
  useEffect(() => {
    setBeforeSave(() => {
      setEditing(false);
      setHasDirtyEdit(false);
    });
    return () => setBeforeSave(null);
  }, [setBeforeSave, setHasDirtyEdit]);
  useEffect(() => {
    if (typeof section === 'string') {
      const timer = setTimeout(() => scrollToSection(section), 80);
      return () => clearTimeout(timer);
    }
  }, [section, p?.id]);

  // Android: hardware back key closes open modals/overlays before navigating back
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (shareOpen)         { setShareOpen(false);         return true; }
      if (docEntriesOpen)    { setDocEntriesOpen(false);    return true; }
      if (expiryPickerOpen)  { setExpiryPickerOpen(false);  return true; }
      return false;
    });
    return () => sub.remove();
  }, [shareOpen, docEntriesOpen, expiryPickerOpen]);

  const updateList = (field: 'included' | 'excluded' | 'steps', index: number, value: string) => {
    if (!p || isDemoProduct) return;
    markDirty();
    if (field === 'steps') {
      const steps = [...p.steps];
      steps[index] = value;
      updateProduct(p.id, { steps });
      return;
    }
    const nextCoverage = { ...p.coverage, [field]: [...p.coverage[field]] };
    nextCoverage[field][index] = value;
    updateProduct(p.id, { coverage: nextCoverage });
  };
  const removeListItem = (field: 'included' | 'excluded' | 'steps', index: number) => {
    if (!p || isDemoProduct) return;
    markDirty();
    if (field === 'steps') {
      updateProduct(p.id, { steps: p.steps.filter((_, itemIndex) => itemIndex !== index) });
      return;
    }
    updateProduct(p.id, { coverage: { ...p.coverage, [field]: p.coverage[field].filter((_, itemIndex) => itemIndex !== index) } });
  };
  const addListItem = (field: 'included' | 'excluded' | 'steps') => {
    if (!p || isDemoProduct) return;
    markDirty();
    if (field === 'steps') {
      updateProduct(p.id, { steps: [...p.steps, 'New claim step'] });
      return;
    }
    updateProduct(p.id, { coverage: { ...p.coverage, [field]: [...p.coverage[field], field === 'included' ? 'New covered item' : 'New exclusion'] } });
  };
  const statusForExpiry = (iso: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(`${iso}T00:00:00`);
    if (!Number.isFinite(expiry.getTime())) return 'Active' as const;
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (daysLeft < 0) return 'Expired' as const;
    if (daysLeft <= 60) return 'Expiring soon' as const;
    return 'Active' as const;
  };
  const updateExpiry = (date: string) => {
    if (!p || isDemoProduct) return;
    markDirty();
    updateProduct(p.id, {
      warrantyEnd: date,
      expires: formatDisplayDate(date),
      status: statusForExpiry(date),
      reminders: (p.reminders || []).filter((reminder) => reminder <= date),
    });
  };
  const updateDraftProduct = (updates: Parameters<typeof updateProduct>[1]) => {
    if (!p || isDemoProduct) return;
    markDirty();
    updateProduct(p.id, updates);
  };
  const sharePayload = () => {
    if (!p) return null;
    return {
      name: p.name,
      brand: p.brand,
      type: p.type,
      category: p.category,
      status: p.status,
      warrantyStart: p.warrantyStart,
      warrantyEnd: p.warrantyEnd,
      expires: p.expires,
      dateAdded: p.dateAdded,
      seller: p.seller,
      serialNumber: p.serialNumber,
      docs: p.docs,
      // Metadata only — never leak stored URIs (they encode the owner's storage path)
      docEntries: p.docEntries?.map((entry) => ({ label: entry.label, fileName: entry.fileName, expiry: entry.expiry })),
      coverage: p.coverage,
      steps: p.steps,
      extended: p.extended,
    };
  };
  const encodedPayload = p ? JSON.stringify(sharePayload()) : '';
  const webOrigin = Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://warret.app';
  // App links work in dev (exp://…/--/import) and production (warret://import);
  // the web variant opens in any browser where the Warret web app is hosted.
  const buildLinks = (path: '/import' | '/verify') => ({
    app: Linking.createURL(path, { queryParams: { product: encodedPayload } }),
    web: `${webOrigin}${path}?product=${encodeURIComponent(encodedPayload)}`,
  });
  const buildDocumentLinks = (signedUrl: string, meta: { fileName: string }) => ({
    app: Linking.createURL('/document', {
      queryParams: {
        u: signedUrl,
        name: meta.fileName,
        product: p?.name || '',
      },
    }),
    web: `${webOrigin}/document?u=${encodeURIComponent(signedUrl)}&name=${encodeURIComponent(meta.fileName)}&product=${encodeURIComponent(p?.name || '')}`,
  });
  const shareLinks = p ? buildLinks('/import') : null;
  const verifyLinks = p ? buildLinks('/verify') : null;
  const deliverLink = async (label: string, links: { app: string; web: string } | null) => {
    if (!links) return;
    if (Platform.OS === 'web') {
      try {
        await globalThis.navigator?.clipboard?.writeText(links.web);
        setShareStatus(`${label} copied — opens in any browser.`);
      } catch {
        setShareStatus('Could not copy the link. Try again.');
      }
      return;
    }
    try {
      await Share.share({ message: links.app });
      setShareStatus(`${label} ready to send.`);
    } catch {
      setShareStatus('Could not open the share sheet.');
    }
  };
  const copyShareLink = () => deliverLink('Import link', shareLinks);
  const copyVerifyLink = () => deliverLink('Verify link', verifyLinks);
  const safeFileName = (value: string) =>
    (value || `Document_${Date.now()}`).replace(/[\\/:*?"<>|]+/g, '-');
  const pdfSafe = (value: unknown) => String(value ?? '').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, '\\$&');
  const escapeHtml = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const buildPdfHtml = () => {
    if (!p) return '';
    const fieldRow = (label: string, value?: string) =>
      value ? `<tr><td class="field-label">${escapeHtml(label)}</td><td class="field-value">${escapeHtml(value)}</td></tr>` : '';
    const docRows = p.docs.map((doc) => {
      const entry = p.docEntries?.find((item) => item.fileName === doc || item.label === doc);
      const expiry = entry?.expiry ? formatDisplayDate(entry.expiry) : '—';
      return `<tr><td class="field-value">${escapeHtml(entry?.label || doc)}</td><td class="field-label">${escapeHtml(entry?.fileName || doc)}</td><td class="field-value">${escapeHtml(expiry)}</td></tr>`;
    }).join('');
    const chips = (items: string[], cls: string) =>
      items.map((item) => `<span class="chip ${cls}">${escapeHtml(item)}</span>`).join('');
    const steps = p.steps.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const generatedOn = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #23212B; margin: 0; padding: 34px; }
  .brand { background: #5B4DF0; color: white; border-radius: 16px; padding: 20px 24px; }
  .brand .app { font-size: 13px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; opacity: .85; }
  .brand h1 { margin: 6px 0 2px; font-size: 28px; font-weight: 900; }
  .brand .meta { font-size: 14px; font-weight: 700; color: #D7D1FF; }
  h2 { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: .8px; color: #77727F; margin: 26px 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 8px 10px; border-bottom: 1px solid #EEEAFE; font-size: 13px; text-align: left; }
  th { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .6px; color: #8B86A0; }
  .field-label { color: #77727F; font-weight: 800; width: 38%; }
  .field-value { color: #23212B; font-weight: 700; }
  .chips { line-height: 2.3; }
  .chip { display: inline-block; border-radius: 12px; padding: 4px 12px; margin-right: 6px; font-size: 12px; font-weight: 800; }
  .chip.good { background: #DDFBE8; color: #17713A; }
  .chip.bad { background: #FFE0E0; color: #A31212; }
  ol { margin: 0; padding-left: 20px; }
  ol li { font-size: 13px; font-weight: 600; margin-bottom: 7px; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #EEEAFE; font-size: 11px; font-weight: 700; color: #8B86A0; }
</style>
</head>
<body>
  <div class="brand">
    <div class="app">Warret — warranty summary</div>
    <h1>${escapeHtml(p.name)}</h1>
    <div class="meta">${escapeHtml(p.brand)} · ${escapeHtml(p.type)}</div>
  </div>
  <h2>Warranty</h2>
  <table>
    ${fieldRow('Status', p.status)}
    ${fieldRow('Warranty window', `${p.warrantyStart} to ${p.warrantyEnd}`)}
    ${fieldRow('Expires', p.expires)}
    ${fieldRow('Date added', p.dateAdded)}
    ${fieldRow('Purchased from', p.seller)}
    ${fieldRow('Serial / model', p.serialNumber)}
    ${fieldRow('Extended warranty', p.extended ? `${p.extended.plan} · ${p.extended.provider} · expires ${p.extended.expires}` : 'No extended warranty active')}
  </table>
  ${p.docs.length ? `<h2>Documents</h2>
  <table>
    <tr><th>Document</th><th>File</th><th>Expiry</th></tr>
    ${docRows}
  </table>` : ''}
  <h2>Coverage included</h2>
  <div class="chips">${chips(p.coverage.included, 'good') || '<span class="field-label">Not specified</span>'}</div>
  <h2>Not covered</h2>
  <div class="chips">${chips(p.coverage.excluded, 'bad') || '<span class="field-label">Not specified</span>'}</div>
  ${p.steps.length ? `<h2>How to claim</h2>
  <ol>${steps}</ol>` : ''}
  <div class="footer">Generated by Warret on ${escapeHtml(generatedOn)}. Warranty terms are governed by the original documents.</div>
</body>
</html>`;
  };
  const downloadProductPdf = async () => {
    if (!p) return;
    if (Platform.OS !== 'web') {
      try {
        setShareStatus('Preparing PDF…');
        const { uri } = await Print.printToFileAsync({ html: buildPdfHtml() });
        const canShare = await Sharing.isAvailableAsync().catch(() => false);
        if (!canShare) {
          setShareStatus('PDF generated, but sharing is unavailable on this device.');
          return;
        }
        setShareStatus('PDF ready — choose where to save it.');
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${p.name} — Warret summary`, UTI: 'com.adobe.pdf' }).catch(() => {});
      } catch {
        setShareStatus('Could not generate the PDF. Try again.');
      }
      return;
    }
    const lines = [
      'Warret product summary',
      `${p.name}`,
      `${p.brand} - ${p.type}`,
      `Status: ${p.status}`,
      `Warranty: ${p.warrantyStart} to ${p.warrantyEnd}`,
      `Expires: ${p.expires}`,
      `Date added: ${p.dateAdded}`,
      p.seller ? `Seller: ${p.seller}` : '',
      p.serialNumber ? `Serial / model: ${p.serialNumber}` : '',
      '',
      'Documents',
      ...p.docs.map((doc) => `- ${doc}`),
      '',
      'Coverage included',
      ...p.coverage.included.map((item) => `- ${item}`),
      '',
      'Not covered',
      ...p.coverage.excluded.map((item) => `- ${item}`),
      '',
      'How to avail',
      ...p.steps.map((item, index) => `${index + 1}. ${item}`),
      '',
      'Extended warranty',
      p.extended ? `Plan: ${p.extended.plan}; Provider: ${p.extended.provider}; Expires: ${p.extended.expires}` : 'No extended warranty active',
    ].filter((line) => line !== '');
    const content = lines.slice(0, 38).map((line, index) => `BT /F1 11 Tf 42 ${760 - index * 18} Td (${pdfSafe(line)}) Tj ET`).join('\n');
    const stream = `${content}\n`;
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${stream.length} >> stream
${stream}endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000247 00000 n 
0000000317 00000 n 
trailer << /Root 1 0 R /Size 6 >>
startxref
${398 + stream.length}
%%EOF`;
    try {
      const blob = new Blob([pdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${p.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'product'}-warret.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setShareStatus('PDF downloaded.');
    } catch {
      setShareStatus('Could not generate the PDF. Try again.');
    }
  };
  const documentMeta = (docName: string) => {
    const entry = p?.docEntries?.find((item) => item.fileName === docName || item.label === docName);
    return {
      title: entry?.label || docName,
      fileName: entry?.fileName || docName,
      expiry: entry?.expiry,
      uri: entry?.uri,
      mimeType: entry?.mimeType,
    };
  };
  // Real, time-limited document link — a Supabase signed URL (10 minute expiry).
  // Only works when the document lives in cloud storage (signed-in accounts).
  const copyDocumentLink = async (docName = selectedDoc || '') => {
    if (!p || !docName) return;
    const meta = documentMeta(docName);
    setDocLinkStatus('Generating secure link…');
    const uri = await FileStorageService.resolveDocumentUri(meta.uri, p.id, meta.fileName).catch(() => null);
    if (uri && /^https:\/\//.test(uri)) {
      const links = buildDocumentLinks(uri, meta);
      if (Platform.OS === 'web') {
        try {
          await globalThis.navigator?.clipboard?.writeText(links.web);
          setDocLinkStatus('Warret document link copied. It expires in 10 minutes.');
          return;
        } catch {}
      } else {
        try {
          await Share.share({ message: links.app, url: links.app });
          setDocLinkStatus('Warret document link ready. It expires in 10 minutes.');
          return;
        } catch {}
      }
    }
    setDocLinkStatus('Cloud document links need a Warret account. Use Share document to send the file directly.');
  };
  const addUploadedDocuments = async () => {
    if (!p || isDemoProduct || docPicking) return;
    setDocPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const nextDocs = [...p.docs];
      const nextEntries = [...(p.docEntries || [])];
      for (const asset of result.assets) {
        const fileName = safeFileName(asset.name || `Document_${Date.now()}`);
        let storedUri: string;
        try {
          storedUri = await FileStorageService.storeDocument(asset.uri, p.id, fileName, asset.mimeType);
        } catch (error) {
          setDocLinkStatus(error instanceof Error ? error.message : 'Could not save one document.');
          continue;
        }
        if (!nextDocs.includes(fileName)) nextDocs.push(fileName);
        const existingIndex = nextEntries.findIndex((entry) => entry.fileName === fileName);
        const entry = {
          label: fileName.replace(/\.[^.]+$/, '') || fileName,
          fileName,
          expiry: '',
          uri: storedUri || asset.uri,
          mimeType: asset.mimeType,
        };
        if (existingIndex >= 0) nextEntries[existingIndex] = { ...nextEntries[existingIndex], ...entry };
        else nextEntries.push(entry);
      }
      if (nextDocs.length === p.docs.length && nextEntries.length === (p.docEntries || []).length) return;
      markDirty();
      updateProduct(p.id, { docs: nextDocs, docEntries: nextEntries });
    } finally {
      setDocPicking(false);
    }
  };
  const openDocument = (docName: string) => {
    setDocLinkStatus('');
    setSelectedDoc(docName);
  };

  // Resolve actual file URI — check stored entry first, fall back to disk lookup
  const resolveDocUri = async (docName: string): Promise<string | null> => {
    const meta = documentMeta(docName);
    if (!p) return null;
    return FileStorageService.resolveDocumentUri(meta.uri, p.id, meta.fileName).catch(() => null);
  };

  const shareDocument = async (docName = selectedDoc || '') => {
    if (!docName) return;
    const meta = documentMeta(docName);
    const uri = await resolveDocUri(docName);
    if (uri && Platform.OS !== 'web') {
      const canShare = await Sharing.isAvailableAsync().catch(() => false);
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: meta.mimeType, dialogTitle: meta.fileName }).catch(() => {});
        return;
      }
    }
    if (Platform.OS === 'web') {
      const payload: any = { title: meta.title, text: p ? `${p.name} document` : meta.title };
      if (uri) {
        try {
          const blob = await fetch(uri).then((r) => r.blob());
          const file = new File([blob], meta.fileName, { type: meta.mimeType || blob.type });
          if ((navigator as any).canShare?.({ files: [file] })) payload.files = [file];
          else payload.url = uri;
        } catch { payload.url = uri; }
      }
      try { await (globalThis.navigator as any)?.share?.(payload); } catch {}
      if (!(globalThis.navigator as any)?.share) {
        const link = payload.url || uri;
        if (link) {
          await globalThis.navigator?.clipboard?.writeText(link).catch(() => {});
          setDocLinkStatus('Share link copied.');
        } else {
          setDocLinkStatus('This browser cannot share the file directly.');
        }
      }
    }
  };

  const downloadDocument = async (docName = selectedDoc || '') => {
    if (!p || !docName) return;
    const meta = documentMeta(docName);
    const uri = await resolveDocUri(docName);
    if (uri && Platform.OS !== 'web') {
      // On iOS/Android, saving to device goes through the native share/save sheet
      const canShare = await Sharing.isAvailableAsync().catch(() => false);
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: meta.mimeType, dialogTitle: `Save ${meta.fileName}` }).catch(() => {});
        return;
      }
    }
    if (uri && Platform.OS === 'web') {
      try {
        const blob = await fetch(uri).then((r) => r.blob());
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = meta.fileName; a.click();
        URL.revokeObjectURL(url);
      } catch {}
    }
  };
  if (!p) {
    return (
      <View style={[s.page, s.missing, { backgroundColor: colors.page }]}>
        <Pressable onPress={() => router.push('/products')} style={[s.missingClose, { backgroundColor: colors.cardAlt }]}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.missingTitle, { color: colors.text }]}>Product not found</Text>
        <Text style={[s.missingText, { color: colors.muted }]}>This product is not available in your warranty wallet.</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={[s.page, { backgroundColor: colors.page }]} contentContainerStyle={[s.content, { paddingBottom: clamp(height * 0.13, 92, 128) }]}>
      <View style={[s.hero, { backgroundColor: colors.primary, paddingTop: clamp(height * 0.068, 48, 62), paddingHorizontal: pagePadding, paddingBottom: clamp(height * 0.04 * scale, 28, 38), borderBottomLeftRadius: clamp(width * 0.08, 24, 34), borderBottomRightRadius: clamp(width * 0.08, 24, 34) }]}>
        <Pressable onPress={() => requestLeave(() => router.push('/products'))} style={[s.close, { width: clamp(44 * scale, 38, 46), height: clamp(44 * scale, 38, 46), borderRadius: clamp(22 * scale, 19, 23), right: pagePadding, top: clamp(height * 0.04, 26, 42) }]}>
          <Ionicons name="close" size={clamp(25 * scale, 21, 27)} color="white" />
        </Pressable>
        {!isDemoProduct ? (
          <Pressable
            onPress={() => {
              if (editing && p) {
                setHasDirtyEdit(false);
                setEditing(false);
                router.replace(`/product/${p.id}`);
                return;
              }
              setEditing(true);
            }}
            style={[s.heroEdit, {
              right: pagePadding + clamp(2 * scale, 0, 3),
              top: clamp(height * 0.04, 26, 42) + clamp(50 * scale, 44, 54),
              width: clamp(36 * scale, 32, 38),
              height: clamp(36 * scale, 32, 38),
              borderRadius: clamp(18 * scale, 16, 19),
            }]}
          >
            <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={clamp(18 * scale, 15, 18)} color="white" />
          </Pressable>
        ) : null}

        <View style={s.header}>
          {editing ? (
            <>
              <TextInput value={p.name} onChangeText={(name) => updateDraftProduct({ name })} style={[s.heroInput, { fontSize: clamp(width * 0.07 * scale, 23, 30), lineHeight: clamp(width * 0.086 * scale, 29, 36) }]} />
              <View style={s.heroInputRow}>
                <TextInput value={p.brand} onChangeText={(brand) => updateDraftProduct({ brand })} style={[s.heroSubInput, { flex: 1 }]} />
                <TextInput value={p.type} onChangeText={(type) => updateDraftProduct({ type })} style={[s.heroSubInput, { flex: 1 }]} />
              </View>
            </>
          ) : (
            <>
              <Text style={[s.title, { fontSize: clamp(width * 0.082 * scale, 26, 34), lineHeight: clamp(width * 0.096 * scale, 32, 40) }]}>{p.name}</Text>
              <Text style={[s.sub, { fontSize: clamp(width * 0.046 * scale, 15, 18), lineHeight: clamp(width * 0.058 * scale, 19, 23) }]}>{p.brand} · {p.type}</Text>
            </>
          )}
          {editing ? (
            <Pressable onPress={() => setExpiryPickerOpen(true)} style={[s.expiryPill, s.expiryPillEditing, { marginTop: clamp(height * 0.02 * scale, 14, 18), borderRadius: clamp(width * 0.045 * scale, 14, 18), paddingHorizontal: clamp(width * 0.038 * scale, 12, 16), paddingVertical: clamp(width * 0.025 * scale, 8, 10) }]}>
              <Ionicons name="calendar-outline" size={clamp(18 * scale, 15, 19)} color="white" />
              <Text style={[s.expiryText, { fontSize: clamp(width * 0.038 * scale, 13, 15), lineHeight: clamp(width * 0.048 * scale, 16, 19) }]}>Expires {p.expires}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => p.docEntries && p.docEntries.length > 0 ? setDocEntriesOpen(true) : undefined}
              style={[s.expiryPill, { marginTop: clamp(height * 0.02 * scale, 14, 18), borderRadius: clamp(width * 0.045 * scale, 14, 18), paddingHorizontal: clamp(width * 0.038 * scale, 12, 16), paddingVertical: clamp(width * 0.025 * scale, 8, 10) }]}
            >
              <Ionicons name="calendar-outline" size={clamp(18 * scale, 15, 19)} color="white" />
              <Text style={[s.expiryText, { fontSize: clamp(width * 0.038 * scale, 13, 15), lineHeight: clamp(width * 0.048 * scale, 16, 19) }]}>Expires {p.expires}</Text>
              {p.docEntries && p.docEntries.length > 0 && (
                <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.7)" />
              )}
            </Pressable>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: pagePadding }}>
        {isDemoProduct ? (
          <View style={[s.demoBanner, { backgroundColor: colors.soft, borderColor: colors.border }]}>
            <Ionicons name="sparkles-outline" size={19} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.demoBannerTitle, { color: colors.text }]}>Demo product</Text>
              <Text style={[s.demoBannerText, { color: colors.muted }]}>
                Explore how documents, reminders, coverage and sharing work. This disappears once you add your first real product.
              </Text>
            </View>
            <Pressable onPress={() => router.push('/add')} style={[s.demoCta, { backgroundColor: colors.primary }]}>
              <Text style={s.demoCtaText}>Add yours</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[s.actionRow, { gap: actionGap, marginTop: clamp(height * 0.03 * scale, 20, 28) }]}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={() => {
                if (action.section === 'share') {
                  setShareOpen(true);
                  setShareStatus('');
                  return;
                }
                scrollToSection(action.section);
              }}
              style={[s.actionTile, actionSizing, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Ionicons name={action.icon as any} size={clamp(25 * scale, 20, 27)} color={colors.primary} />
              <Text style={[s.actionText, { color: colors.primary, fontSize: clamp(width * 0.034 * scale, 11, 14), lineHeight: clamp(width * 0.043 * scale, 14, 17) }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[s.dateBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: clamp(width * 0.045 * scale, 14, 18), padding: clamp(width * 0.045 * scale, 14, 18), marginTop: clamp(height * 0.025 * scale, 18, 24) }]}>
          <Text style={[s.dateLabel, { color: colors.muted, fontSize: clamp(width * 0.036 * scale, 12, 14), lineHeight: clamp(width * 0.046 * scale, 15, 18) }]}>Date added</Text>
          <Text style={[s.dateValue, { color: colors.text, fontSize: clamp(width * 0.055 * scale, 18, 22), lineHeight: clamp(width * 0.067 * scale, 22, 27) }]}>{p.dateAdded}</Text>
          {p.seller ? (
            <>
              <Text style={[s.dateLabel, { color: colors.muted, fontSize: clamp(width * 0.036 * scale, 12, 14), lineHeight: clamp(width * 0.046 * scale, 15, 18), marginTop: 12 }]}>Purchased from</Text>
              {editing ? (
                <TextInput value={p.seller} onChangeText={(seller) => updateDraftProduct({ seller })} style={[s.inlineInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
              ) : (
                <Text style={[s.dateValue, { color: colors.text, fontSize: clamp(width * 0.055 * scale, 18, 22), lineHeight: clamp(width * 0.067 * scale, 22, 27) }]}>{p.seller}</Text>
              )}
            </>
          ) : null}
          {p.serialNumber ? (
            <>
              <Text style={[s.dateLabel, { color: colors.muted, fontSize: clamp(width * 0.036 * scale, 12, 14), lineHeight: clamp(width * 0.046 * scale, 15, 18), marginTop: 12 }]}>Serial / Model</Text>
              {editing ? (
                <TextInput value={p.serialNumber} onChangeText={(serialNumber) => updateDraftProduct({ serialNumber })} style={[s.inlineInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
              ) : (
                <Text style={[s.dateValue, { color: colors.text, fontSize: clamp(width * 0.055 * scale, 18, 22), lineHeight: clamp(width * 0.067 * scale, 22, 27) }]}>{p.serialNumber}</Text>
              )}
            </>
          ) : null}
        </View>

        {/* Document expiry breakdown — shown when product has docEntries */}
        {p.docEntries && p.docEntries.length > 0 && (() => {
          const sorted = [...p.docEntries].sort((a, b) => {
            if (!a.expiry && !b.expiry) return 0;
            if (!a.expiry) return 1;
            if (!b.expiry) return -1;
            return a.expiry.localeCompare(b.expiry);
          });
          return (
            <View style={[s.docEntriesCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: clamp(height * 0.025 * scale, 18, 24) }]}>
              <View style={s.docEntriesHeader}>
                <Text style={[s.docEntriesTitle, { color: colors.text }]}>Expiry tracker</Text>
                <Text style={[s.docEntriesCount, { color: colors.muted }]}>{sorted.length} document{sorted.length !== 1 ? 's' : ''}</Text>
              </View>
              {sorted.map((entry) => {
                const today = new Date(); today.setHours(0,0,0,0);
                const expDate = entry.expiry ? new Date(`${entry.expiry}T00:00:00`) : null;
                const days = expDate ? Math.ceil((expDate.getTime() - today.getTime()) / 86400000) : null;
                const color = expiryStatusColor(days);
                return (
                  <View key={entry.label} style={[s.docEntryRow, { borderTopColor: colors.border }]}>
                    <View style={[s.docEntryDot, { backgroundColor: color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.docEntryLabel, { color: colors.text }]}>{entry.label}</Text>
                      {entry.fileName !== entry.label && (
                        <Text style={[s.docEntryFile, { color: colors.muted }]}>{entry.fileName}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={[s.docEntryExpiry, { color }]}>
                        {entry.expiry ? formatDisplayDate(entry.expiry) : 'No date'}
                      </Text>
                      {days !== null && (
                        <Text style={[s.docEntryDays, { color }]}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today!' : `${days}d left`}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}

        <View onLayout={(event) => registerSection('documents', event.nativeEvent.layout.y)}>
          <Text style={[s.sectionTitle, { color: colors.text, fontSize: clamp(width * 0.068 * scale, 22, 28), lineHeight: clamp(width * 0.082 * scale, 27, 34), marginTop: clamp(height * 0.04 * scale, 26, 38), marginBottom: clamp(height * 0.02 * scale, 14, 20) }]}>Documents</Text>
        </View>

        <View style={[s.grid, { gap: tileGap }]}>
          {p.docs.map((doc, index) => (
            <Pressable
              key={doc}
              onPress={() => {
                if (!editing) openDocument(doc);
              }}
              style={[s.docTile, tileSizing, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {editing ? (
                <Pressable onPress={() => {
                  markDirty();
                  removeDocument(p.id, doc);
                }} style={[s.removeDoc, { backgroundColor: isDark ? '#2A1A1A' : '#FFE8E8', borderColor: isDark ? '#3A1A1A' : '#FFD0D0' }]}>
                  <Ionicons name="close" size={15} color={isDark ? '#B85555' : '#A31212'} />
                </Pressable>
              ) : null}
              <View style={[s.preview, previewSizing, { backgroundColor: isDark ? colors.cardAlt : 'white', borderColor: isDark ? colors.border : '#E8E4F7' }]}>
                <View style={[s.previewHeader, { backgroundColor: isDark ? '#1A1825' : '#F2EFFD' }]}>
                  <View style={s.dot} />
                  <View style={[s.dot, s.dotSoft]} />
                  <View style={[s.dot, s.dotSoft]} />
                </View>
                <View style={s.previewBody}>
                  <Ionicons name={index % 2 === 0 ? 'document-text-outline' : 'shield-checkmark-outline'} size={clamp(42 * scale, 32, 46)} color={purple} />
                  <View style={s.previewLines}>
                    <View style={[s.lineLong, { backgroundColor: index % 2 === 0 ? '#D9D3FF' : '#CDEFD9' }]} />
                    <View style={[s.lineShort, { backgroundColor: index % 2 === 0 ? '#E8E4FF' : '#E0F7E8' }]} />
                  </View>
                </View>
              </View>
              <Text numberOfLines={2} style={[s.docName, { color: colors.text, fontSize: clamp(width * 0.038 * scale, 13, 15), lineHeight: clamp(width * 0.049 * scale, 16, 19), marginTop: clamp(height * 0.012 * scale, 8, 11) }]}>{doc}</Text>
              {!editing ? (
                <View style={s.docQuickActions}>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      downloadDocument(doc);
                    }}
                    style={[s.docQuickButton, { backgroundColor: colors.input, borderColor: colors.border }]}
                  >
                    <Ionicons name="download-outline" size={15} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      shareDocument(doc);
                    }}
                    style={[s.docQuickButton, { backgroundColor: colors.input, borderColor: colors.border }]}
                  >
                    <Ionicons name="share-outline" size={15} color={colors.primary} />
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          ))}

          {!isDemoProduct ? (
            <Pressable
              onPress={addUploadedDocuments}
              style={[s.addTile, tileSizing, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[s.addPreview, previewSizing, { backgroundColor: isDark ? colors.cardAlt : '#F1EEFF', borderColor: isDark ? colors.border : '#E3DCFF' }]}>
                <Ionicons name={docPicking ? 'hourglass-outline' : 'add'} size={clamp(42 * scale, 32, 46)} color={purple} />
              </View>
              <Text style={[s.addName, { color: colors.primary, fontSize: clamp(width * 0.039 * scale, 13, 15), lineHeight: clamp(width * 0.049 * scale, 16, 19), marginTop: clamp(height * 0.012 * scale, 8, 11) }]}>
                {docPicking ? 'Opening...' : 'Upload doc'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View onLayout={(event) => registerSection('coverage', event.nativeEvent.layout.y)} style={{ marginTop: clamp(height * 0.035 * scale, 24, 34) }}>
          {isDemoProduct ? (
            <View style={s.detailReminderRow}>
              <Ionicons name="notifications-outline" size={17} color={colors.muted} />
              <Text style={[s.detailReminderText, { color: colors.muted }]}>
                {nextReminderDate(p.reminders) ? `Next reminder ${formatReminderDate(nextReminderDate(p.reminders))}` : 'No reminder set'}
              </Text>
            </View>
          ) : (
            <ExpiryReminder compact startInCalendar productName={p.name} expiryDate={p.warrantyEnd} reminders={p.reminders} onSave={(dates) => setReminders(p.id, dates)}>
              <View style={s.detailReminderRow}>
                <Ionicons name="notifications-outline" size={17} color={colors.muted} />
                <Text style={[s.detailReminderText, { color: colors.muted }]}>
                  {nextReminderDate(p.reminders) ? `Next reminder ${formatReminderDate(nextReminderDate(p.reminders))}` : 'No reminder set'}
                </Text>
              </View>
            </ExpiryReminder>
          )}
          <Text style={[s.sectionTitle, { color: colors.text, fontSize: clamp(width * 0.064 * scale, 21, 26), lineHeight: clamp(width * 0.078 * scale, 26, 32), marginBottom: clamp(height * 0.016 * scale, 12, 16) }]}>Coverage</Text>
          <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.infoLabel, { color: colors.muted }]}>Included</Text>
            <View style={s.chipWrap}>
              {p.coverage.included.map((item, index) => editing ? (
                <View key={`${item}-${index}`} style={[s.editChip, { backgroundColor: isDark ? '#1A3A29' : '#DDFBE8' }]}>
                  <TextInput value={item} onChangeText={(value) => updateList('included', index, value)} style={[s.chipInput, { color: colors.text }]} />
                  <Pressable onPress={() => removeListItem('included', index)}><Ionicons name="close" size={15} color={isDark ? '#3D9B68' : '#17713A'} /></Pressable>
                </View>
              ) : <Text key={item} style={[s.goodChip, { fontSize: clamp(width * 0.037 * scale, 12, 15), backgroundColor: isDark ? '#1A3A29' : '#DDFBE8', color: isDark ? '#3D9B68' : '#17713A' }]}>{item}</Text>)}
              {editing ? <Pressable onPress={() => addListItem('included')} style={[s.addSmall, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}><Ionicons name="add" size={16} color={purple} /></Pressable> : null}
            </View>
            <Text style={[s.infoLabel, { color: colors.muted, marginTop: 14 }]}>Not covered</Text>
            <View style={s.chipWrap}>
              {p.coverage.excluded.map((item, index) => editing ? (
                <View key={`${item}-${index}`} style={[s.editChip, s.editChipBad, { backgroundColor: isDark ? '#3A1A1A' : '#FFE0E0' }]}>
                  <TextInput value={item} onChangeText={(value) => updateList('excluded', index, value)} style={[s.chipInput, { color: colors.text }]} />
                  <Pressable onPress={() => removeListItem('excluded', index)}><Ionicons name="close" size={15} color={isDark ? '#B85555' : '#A31212'} /></Pressable>
                </View>
              ) : <Text key={item} style={[s.badChip, { fontSize: clamp(width * 0.037 * scale, 12, 15), backgroundColor: isDark ? '#3A1A1A' : '#FFE0E0', color: isDark ? '#B85555' : '#A31212' }]}>{item}</Text>)}
              {editing ? <Pressable onPress={() => addListItem('excluded')} style={[s.addSmall, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}><Ionicons name="add" size={16} color={purple} /></Pressable> : null}
            </View>
            <Text style={[s.infoLabel, { color: colors.muted, marginTop: 18 }]}>How to avail</Text>
            <View style={s.stepsWrap}>
              {p.steps.map((item, index) => (
                <View key={`${item}-${index}`} style={s.stepRow}>
                  <Text style={[s.stepNum, { backgroundColor: isDark ? '#2A1F4A' : '#F0ECFF' }]}>{index + 1}</Text>
                  {editing ? (
                    <>
                      <TextInput value={item} onChangeText={(value) => updateList('steps', index, value)} style={[s.inlineInput, { flex: 1, marginTop: 0, backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
                      <Pressable onPress={() => removeListItem('steps', index)} style={[s.inlineRemove, { backgroundColor: isDark ? '#2A1A1A' : '#FFE8E8' }]}><Ionicons name="close" size={16} color={isDark ? '#B85555' : '#A31212'} /></Pressable>
                    </>
                  ) : <Text style={[s.stepText, { color: colors.text }]}>{item}</Text>}
                </View>
              ))}
              {editing ? <Pressable onPress={() => addListItem('steps')} style={[s.addLine, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}><Ionicons name="add" size={17} color={purple} /><Text style={s.addLineText}>Add step</Text></Pressable> : null}
            </View>
          </View>
        </View>

        <View onLayout={(event) => registerSection('support', event.nativeEvent.layout.y)} style={{ marginTop: clamp(height * 0.035 * scale, 24, 34) }}>
          <Text style={[s.sectionTitle, { color: colors.text, fontSize: clamp(width * 0.064 * scale, 21, 26), lineHeight: clamp(width * 0.078 * scale, 26, 32), marginBottom: clamp(height * 0.016 * scale, 12, 16) }]}>Support</Text>
          <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {editing ? (
              <>
                <TextInput value={p.support.site} onChangeText={(site) => updateDraftProduct({ support: { ...p.support, site } })} style={[s.inlineInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
                <TextInput value={p.support.phone} onChangeText={(phone) => updateDraftProduct({ support: { ...p.support, phone } })} style={[s.inlineInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
                <TextInput value={p.support.method} onChangeText={(method) => updateDraftProduct({ support: { ...p.support, method } })} style={[s.inlineInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
              </>
            ) : (
              <>
                <Text style={[s.infoValue, { color: colors.text }]}>{p.support.site}</Text>
                <Text style={[s.infoValue, { color: colors.text }]}>{p.support.phone}</Text>
                <Text style={[s.infoValue, { color: colors.text }]}>{p.support.method}</Text>
              </>
            )}
          </View>
        </View>

        <View onLayout={(event) => registerSection('extended', event.nativeEvent.layout.y)} style={{ marginTop: clamp(height * 0.035 * scale, 24, 34) }}>
          <Text style={[s.sectionTitle, { color: colors.text, fontSize: clamp(width * 0.064 * scale, 21, 26), lineHeight: clamp(width * 0.078 * scale, 26, 32), marginBottom: clamp(height * 0.016 * scale, 12, 16) }]}>Extended</Text>
          <View style={[s.infoCard, s.extendedTeaser, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.extendedTeaserIcon, { backgroundColor: colors.soft }]}>
              <Ionicons name="sparkles-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[s.extendedTeaserTitle, { color: colors.text }]}>Almost unlocked</Text>
            <Text style={[s.extendedTeaserText, { color: colors.muted }]}>
              Wait. We are this close to helping you compare and manage extended warranty providers right here, so the next time coverage gets confusing, Warret already knows where to point you.
            </Text>
            <View style={[s.extendedTeaserPill, { backgroundColor: colors.soft }]}>
              <Text style={[s.extendedTeaserPillText, { color: colors.primary }]}>Provider matching is warming up</Text>
            </View>
          </View>
        </View>
      </View>
      <DatePickerModal
        title="Change expiry date"
        selectedDate={p.warrantyEnd}
        visible={expiryPickerOpen}
        onClose={() => setExpiryPickerOpen(false)}
        onSelect={updateExpiry}
      />

      <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
        <View style={s.shareBackdrop}>
          <View style={[s.shareMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.shareHeader}>
              <View style={[s.shareIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="share-outline" size={22} color="white" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.shareTitle, { color: colors.text }]}>Share product</Text>
                <Text style={[s.shareSub, { color: colors.muted }]}>{p.name}</Text>
              </View>
              <Pressable onPress={() => setShareOpen(false)} style={s.shareClose}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            <Text style={[s.shareBody, { color: colors.muted }]}>
              Share a link so the next person can add this product to their Warret wallet, or generate a PDF summary without support details.
            </Text>
            <Pressable onPress={copyShareLink} style={[s.shareAction, { backgroundColor: colors.primary }]}>
              <Ionicons name="link-outline" size={19} color="white" />
              <Text style={s.shareActionText}>Get link</Text>
            </Pressable>
            <Pressable onPress={copyVerifyLink} style={[s.shareOption, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name="shield-checkmark-outline" size={19} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.shareSecondaryText, { color: colors.primary }]}>Verify link</Text>
                <Text style={[s.shareOptionSub, { color: colors.muted }]}>Buyers can check this warranty's validity</Text>
              </View>
            </Pressable>
            <Pressable onPress={downloadProductPdf} style={[s.shareSecondary, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={19} color={colors.primary} />
              <Text style={[s.shareSecondaryText, { color: colors.primary }]}>Generate PDF</Text>
            </Pressable>
            {shareStatus ? <Text style={[s.shareStatus, { color: colors.muted }]}>{shareStatus}</Text> : null}
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedDoc} transparent animationType="fade" onRequestClose={() => setSelectedDoc(null)}>
        <View style={s.shareBackdrop}>
          <View style={[s.documentViewer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedDoc ? (
              <>
                <View style={s.shareHeader}>
                  <View style={[s.shareIcon, { backgroundColor: colors.primary }]}>
                    <Ionicons name="document-text-outline" size={22} color="white" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.shareTitle, { color: colors.text }]}>{documentMeta(selectedDoc).title}</Text>
                    <Text style={[s.shareSub, { color: colors.muted }]}>{documentMeta(selectedDoc).fileName}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedDoc(null)} style={s.shareClose}>
                    <Ionicons name="close" size={20} color={colors.text} />
                  </Pressable>
                </View>
                <View style={[s.documentPreview, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <View style={[s.documentPage, { backgroundColor: isDark ? colors.cardAlt : 'white' }]}>
                    <View style={[s.documentPageLine, { width: '72%', backgroundColor: colors.primary }]} />
                    <View style={s.documentPageLine} />
                    <View style={[s.documentPageLine, { width: '54%' }]} />
                    <Ionicons name="document-attach-outline" size={44} color={colors.primary} style={{ marginTop: 16 }} />
                  </View>
                </View>
                <Text style={[s.shareBody, { color: colors.muted }]}>
                  Preview this saved document record, or download/share it from Warret.
                </Text>
                <Pressable onPress={() => downloadDocument(selectedDoc)} style={[s.shareAction, { backgroundColor: colors.primary }]}>
                  <Ionicons name="download-outline" size={19} color="white" />
                  <Text style={s.shareActionText}>Download</Text>
                </Pressable>
                <Pressable onPress={() => shareDocument(selectedDoc)} style={[s.shareSecondary, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <Ionicons name="share-outline" size={19} color={colors.primary} />
                  <Text style={[s.shareSecondaryText, { color: colors.primary }]}>Share document</Text>
                </Pressable>
                <Pressable onPress={() => copyDocumentLink(selectedDoc)} style={[s.shareOption, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <Ionicons name="link-outline" size={19} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.shareSecondaryText, { color: colors.primary }]}>Copy secure link</Text>
                    <Text style={[s.shareOptionSub, { color: colors.muted }]}>Link expires in 10 minutes</Text>
                  </View>
                </Pressable>
                {docLinkStatus ? <Text style={[s.shareStatus, { color: colors.muted }]}>{docLinkStatus}</Text> : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Expiry breakdown modal */}
      <Modal visible={docEntriesOpen} transparent animationType="slide" onRequestClose={() => setDocEntriesOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setDocEntriesOpen(false)} />
        <View style={[s.modalSheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[s.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[s.modalTitle, { color: colors.text }]}>What's expiring</Text>
          <Text style={[s.modalSub, { color: colors.muted }]}>{p.name}</Text>
          <ScrollView>
            {(p.docEntries || [])
              .slice()
              .sort((a, b) => {
                if (!a.expiry && !b.expiry) return 0;
                if (!a.expiry) return 1;
                if (!b.expiry) return -1;
                return a.expiry.localeCompare(b.expiry);
              })
              .map((entry) => {
                const today = new Date(); today.setHours(0,0,0,0);
                const expDate = entry.expiry ? new Date(`${entry.expiry}T00:00:00`) : null;
                const days = expDate ? Math.ceil((expDate.getTime() - today.getTime()) / 86400000) : null;
                const color = expiryStatusColor(days);
                return (
                  <View key={entry.label} style={[s.modalRow, { borderBottomColor: colors.border }]}>
                    <View style={[s.modalDot, { backgroundColor: color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.modalRowLabel, { color: colors.text }]}>{entry.label}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.modalRowDate, { color }]}>{entry.expiry ? formatDisplayDate(entry.expiry) : 'No date set'}</Text>
                      {days !== null && (
                        <Text style={[s.modalRowDays, { color }]}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today!' : `${days}d left`}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
          </ScrollView>
          <Pressable onPress={() => setDocEntriesOpen(false)} style={[s.modalClose, { backgroundColor: colors.primary }]}>
            <Text style={s.modalCloseText}>Done</Text>
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { backgroundColor: 'white' },
  content: { minHeight: '100%' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  missingClose: { position: 'absolute', right: 22, top: 48, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F1FA' },
  missingTitle: { fontSize: 26, lineHeight: 32, fontWeight: '900', color: '#23212B', fontFamily: F.n900 },
  missingText: { marginTop: 8, fontSize: 16, lineHeight: 23, color: '#77727F', textAlign: 'center', fontWeight: '500', fontFamily: F.i500 },
  hero: { backgroundColor: purple },
  close: { position: 'absolute', zIndex: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.35)' },
  heroEdit: { position: 'absolute', zIndex: 2, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.35)' },
  header: { paddingRight: 58 },
  title: { fontWeight: '900', color: 'white', fontFamily: F.n900 },
  sub: { color: '#D7D1FF', fontWeight: '800', marginTop: 5, fontFamily: F.n800 },
  heroInput: { color: 'white', fontWeight: '900', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.35)', paddingVertical: 5, fontFamily: F.n900 },
  heroInputRow: { flexDirection: 'row', gap: 10, marginTop: 10, paddingRight: 14 },
  heroSubInput: { color: 'white', fontWeight: '800', backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)', borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, fontFamily: F.n800 },
  expiryPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)' },
  expiryPillEditing: { backgroundColor: 'rgba(255,255,255,.23)', borderColor: 'rgba(255,255,255,.46)' },
  expiryText: { color: 'white', fontWeight: '900', fontFamily: F.n900 },
  actionRow: { flexDirection: 'row' },
  actionTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7FF', borderWidth: 1, borderColor: '#EEEAFE' },
  actionText: { color: purple, fontWeight: '900', textAlign: 'center', marginTop: 7, fontFamily: F.n900 },
  dateBox: { backgroundColor: '#F8F7FF', borderWidth: 1, borderColor: '#EEEAFE' },
  dateLabel: { color: '#8B86A0', fontWeight: '800', textTransform: 'uppercase', fontFamily: F.n800 },
  dateValue: { color: '#23212B', fontWeight: '900', marginTop: 4, fontFamily: F.n900 },
  demoBanner: { borderWidth: 1, borderRadius: 18, padding: 13, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 11 },
  demoBannerTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  demoBannerText: { fontSize: 12, lineHeight: 17, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  demoCta: { minHeight: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11 },
  demoCtaText: { color: 'white', fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },
  sectionTitle: { color: '#23212B', fontWeight: '900', fontFamily: F.n900 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  docTile: { backgroundColor: '#F8F7FF', borderWidth: 1, borderColor: '#EEEAFE' },
  removeDoc: { position: 'absolute', right: 8, top: 8, zIndex: 3, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE8E8', borderWidth: 1, borderColor: '#FFD0D0' },
  preview: { backgroundColor: 'white', borderWidth: 1, borderColor: '#E8E4F7', overflow: 'hidden' },
  previewHeader: { height: 18, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, backgroundColor: '#F2EFFD' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#B7AEFF' },
  dotSoft: { opacity: .55 },
  previewBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  previewLines: { alignItems: 'center', gap: 5, marginTop: 8 },
  lineLong: { width: 58, height: 5, borderRadius: 3 },
  lineShort: { width: 38, height: 5, borderRadius: 3 },
  docName: { color: '#292633', fontWeight: '800', textAlign: 'center', fontFamily: F.n800 },
  docQuickActions: { flexDirection: 'row', alignSelf: 'center', gap: 8, marginTop: 10 },
  docQuickButton: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addTile: { backgroundColor: '#FBFAFF', borderWidth: 1.4, borderStyle: 'dashed', borderColor: '#D9D3FF' },
  addPreview: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1EEFF', borderWidth: 1, borderColor: '#E3DCFF' },
  addName: { color: purple, fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  infoCard: { backgroundColor: '#F8F7FF', borderWidth: 1, borderColor: '#EEEAFE', borderRadius: 18, padding: 18 },
  detailReminderRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  detailReminderText: { color: '#8B86A0', fontSize: 15, lineHeight: 19, fontWeight: '800', fontFamily: F.n800 },
  infoLabel: { color: '#77727F', fontSize: 13, lineHeight: 17, fontWeight: '900', textTransform: 'uppercase', fontFamily: F.n900 },
  infoValue: { color: '#292633', fontSize: 17, lineHeight: 24, fontWeight: '800', marginBottom: 8, fontFamily: F.n800 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  goodChip: { backgroundColor: '#DDFBE8', color: '#17713A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 15, fontWeight: '800', overflow: 'hidden', fontFamily: F.n800 },
  badChip: { backgroundColor: '#FFE0E0', color: '#A31212', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 15, fontWeight: '800', overflow: 'hidden', fontFamily: F.n800 },
  editChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DDFBE8', paddingLeft: 10, paddingRight: 8, borderRadius: 15 },
  editChipBad: { backgroundColor: '#FFE0E0' },
  chipInput: { minWidth: 116, color: '#292633', fontSize: 14, lineHeight: 18, fontWeight: '800', paddingVertical: 0, fontFamily: F.n800 },
  addSmall: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: '#E4DEF8' },
  inlineInput: { minHeight: 43, borderRadius: 13, borderWidth: 1, borderColor: '#E4DEF8', backgroundColor: 'white', paddingHorizontal: 12, color: '#292633', fontSize: 15, lineHeight: 20, fontWeight: '800', marginTop: 9, fontFamily: F.n800 },
  inlineRemove: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE8E8', marginTop: 4 },
  addLine: { minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: '#E4DEF8', backgroundColor: 'white', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  addLineText: { color: purple, fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
  extendedCurrent: { flexDirection: 'row', gap: 12, backgroundColor: 'white', borderWidth: 1, borderColor: '#E8E4F7', borderRadius: 16, padding: 14, marginTop: 10 },
  extendedOptions: { gap: 10, marginTop: 10 },
  extendedOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderWidth: 1, borderColor: '#E8E4F7', borderRadius: 16, padding: 14 },
  extendedTitle: { color: '#292633', fontSize: 16, lineHeight: 21, fontWeight: '900', fontFamily: F.n900 },
  extendedMeta: { color: '#7E778E', fontSize: 13, lineHeight: 17, fontWeight: '700', marginTop: 3, fontFamily: F.i700 },
  stepsWrap: { marginTop: 12, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F0ECFF', color: purple, textAlign: 'center', paddingTop: 4, fontSize: 13, lineHeight: 17, fontWeight: '900', overflow: 'hidden', fontFamily: F.n900 },
  stepText: { flex: 1, color: '#292633', fontSize: 15, lineHeight: 21, fontWeight: '500', fontFamily: F.i500 },

  // Share product
  shareBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.44)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  shareMenu: { width: '100%', maxWidth: 340, borderRadius: 24, borderWidth: 1, padding: 18, shadowColor: '#000', shadowOpacity: .14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  shareHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  shareTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', fontFamily: F.n900 },
  shareSub: { fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 2, fontFamily: F.i700 },
  shareClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  shareBody: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 14, fontFamily: F.i700 },
  shareAction: { minHeight: 46, borderRadius: 15, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareActionText: { color: 'white', fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  shareSecondary: { minHeight: 44, borderRadius: 15, marginTop: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareSecondaryText: { fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  shareOption: { minHeight: 52, borderRadius: 15, marginTop: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  shareOptionSub: { fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2, fontFamily: F.i700 },
  shareStatus: { textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 10, fontFamily: F.n800 },
  documentViewer: { width: '100%', maxWidth: 360, borderRadius: 24, borderWidth: 1, padding: 18, shadowColor: '#000', shadowOpacity: .14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  documentPreview: { minHeight: 176, borderRadius: 18, borderWidth: 1, marginTop: 18, alignItems: 'center', justifyContent: 'center', padding: 16 },
  documentPage: { width: 116, height: 142, borderRadius: 12, backgroundColor: 'white', padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  documentPageLine: { width: '100%', height: 7, borderRadius: 5, backgroundColor: '#DED9F6', marginTop: 8 },

  // Doc entries expiry tracker
  docEntriesCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  docEntriesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  docEntriesTitle: { fontSize: 15, fontWeight: '900', fontFamily: F.n900 },
  docEntriesCount: { fontSize: 12, fontWeight: '800', fontFamily: F.n800 },
  docEntryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  docEntryDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  docEntryLabel: { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  docEntryFile: { fontSize: 11, fontWeight: '700', marginTop: 2, fontFamily: F.i700 },
  docEntryExpiry: { fontSize: 13, fontWeight: '900', fontFamily: F.n900 },
  docEntryDays: { fontSize: 11, fontWeight: '800', marginTop: 2, fontFamily: F.n800 },
  extendedTeaser: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 18 },
  extendedTeaserIcon: { width: 56, height: 56, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  extendedTeaserTitle: { fontSize: 22, lineHeight: 27, fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  extendedTeaserText: { fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 7, fontFamily: F.i700 },
  extendedTeaserPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 14 },
  extendedTeaserPillText: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 22, paddingBottom: 32, maxHeight: '80%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D0CBE8', alignSelf: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 4, fontFamily: F.n900 },
  modalSub: { fontSize: 13, fontWeight: '700', marginBottom: 18, fontFamily: F.i700 },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1 },
  modalDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  modalRowLabel: { fontSize: 15, fontWeight: '900', fontFamily: F.n900 },
  modalRowDate: { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  modalRowDays: { fontSize: 11, fontWeight: '800', marginTop: 2, fontFamily: F.n800 },
  modalClose: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  modalCloseText: { color: 'white', fontSize: 16, fontWeight: '900', fontFamily: F.n900 },
});
