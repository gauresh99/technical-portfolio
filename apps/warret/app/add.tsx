import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useProducts } from '../src/store/products';
import { useGroups } from '../src/store/groups';
import { useAppTheme } from '../src/store/theme';
import { DatePickerModal, formatDisplayDate } from '../src/components/DatePickerModal';
import { extractDocument } from '../src/services/documentExtraction';
import { FileStorageService } from '../src/services/fileStorage';
import { DocEntry } from '../src/data/products';
import { formatProductName } from '../src/utils/productNames';
import { createEntityId, validateDocumentUpload } from '../src/utils/security';
import { F } from '../src/theme/fonts';

type DraftDoc = DocEntry & { id: string; parsing?: boolean; autoFilled?: boolean };
type CsvRow = {
  id: string;
  productId: string;
  name: string;
  brand: string;
  category: string;
  purchaseDate: string;
  expiryDate: string;
  docs: DraftDoc[];
  expanded: boolean;
};

const DEVICE_CATS = [
  {
    id: 'personal',
    label: 'Personal Electronics',
    icon: 'phone-portrait-outline',
    tip: 'Phones, laptops, tablets, earbuds, power banks, chargers — track each device separately.',
    suggestions: [
      { label: 'Manufacturer warranty', note: 'Usually 1-2 years' },
      { label: 'Extended warranty', note: 'AppleCare, Samsung Care+, etc.' },
      { label: 'Insurance / damage cover', note: 'Often separate from warranty' },
    ],
  },
  {
    id: 'home',
    label: 'Home Appliances',
    icon: 'home-outline',
    tip: 'Fridge, washing machine, AC, dishwasher — may have compressor / motor warranties.',
    suggestions: [
      { label: 'Product warranty', note: 'Main manufacturer warranty' },
      { label: 'Compressor / motor warranty', note: 'Separate long-term coverage' },
      { label: 'Installation receipt', note: 'Useful for service claims' },
    ],
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    icon: 'restaurant-outline',
    tip: 'Microwave, mixer, coffee maker, induction — short warranties, keep invoice handy.',
    suggestions: [
      { label: 'Invoice', note: 'Proof of purchase' },
      { label: 'Manufacturer warranty', note: 'Usually 1-2 years' },
      { label: 'Extended warranty', note: 'Retailer care plan' },
    ],
  },
  {
    id: 'tv',
    label: 'TV & Display',
    icon: 'tv-outline',
    tip: 'TVs, monitors, projectors — often have panel warranties and optional AMC plans.',
    suggestions: [
      { label: 'Invoice', note: 'Proof of purchase' },
      { label: 'Panel warranty', note: 'Screen coverage' },
      { label: 'Extended warranty / AMC', note: 'Annual maintenance contract' },
    ],
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'headset-outline',
    tip: 'Speakers, headphones, soundbars — short warranty periods, service center support.',
    suggestions: [
      { label: 'Invoice', note: 'Proof of purchase' },
      { label: 'Manufacturer warranty', note: 'Brand warranty' },
    ],
  },
  {
    id: 'camera',
    label: 'Camera',
    icon: 'camera-outline',
    tip: 'Cameras, lenses, drones — body and lens warranties may differ.',
    suggestions: [
      { label: 'Camera body warranty', note: 'Manufacturer coverage' },
      { label: 'Lens warranty', note: 'Per lens if applicable' },
      { label: 'Invoice', note: 'Proof of purchase' },
    ],
  },
  {
    id: 'wearable',
    label: 'Wearables',
    icon: 'watch-outline',
    tip: 'Smartwatches, fitness bands, AR glasses — typically 1 yr warranty.',
    suggestions: [
      { label: 'Manufacturer warranty', note: 'Usually 1 year' },
      { label: 'Invoice', note: 'Proof of purchase' },
    ],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: 'game-controller-outline',
    tip: 'Consoles, controllers, peripherals — track each separately.',
    suggestions: [
      { label: 'Console warranty', note: 'Manufacturer coverage' },
      { label: 'Invoice', note: 'Proof of purchase' },
      { label: 'Extended warranty', note: 'Retailer care plan' },
    ],
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    icon: 'car-outline',
    tip: 'Cars, bikes, scooters — warranty, insurance, PUC, RC all need separate tracking.',
    suggestions: [
      { label: 'Manufacturer warranty', note: 'Vehicle warranty' },
      { label: 'Insurance policy', note: 'Renewal date' },
      { label: 'PUC / emission certificate', note: 'Expiry date' },
      { label: 'RC / registration', note: 'Registration validity' },
      { label: 'Extended warranty', note: 'Dealer or third party' },
    ],
  },
  {
    id: 'furniture',
    label: 'Furniture',
    icon: 'bed-outline',
    tip: 'Sofas, beds, tables — structural and fabric warranties may differ.',
    suggestions: [
      { label: 'Structural warranty', note: 'Frame and joints' },
      { label: 'Fabric / upholstery warranty', note: 'If applicable' },
      { label: 'Invoice', note: 'Proof of purchase' },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    icon: 'briefcase-outline',
    tip: 'FSSAI, trade licenses, GST, shop act, fire NOC — track renewal dates for all regulatory docs.',
    suggestions: [
      { label: 'FSSAI License', note: 'Annual renewal' },
      { label: 'Trade License', note: 'Municipal renewal' },
      { label: 'Business Insurance', note: 'Annual policy' },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    icon: 'cube-outline',
    tip: 'Anything else — add whichever documents matter for this product.',
    suggestions: [
      { label: 'Invoice', note: 'Proof of purchase' },
      { label: 'Warranty document', note: 'Coverage details' },
    ],
  },
] as const;

const DOC_TYPE_GROUPS = [
  {
    heading: 'Warranty & Purchase',
    types: ['Invoice', 'Manufacturer Warranty', 'Extended Warranty', 'Insurance Policy', 'Service Contract', 'AMC / Service Plan', 'Damage Protection'],
  },
  {
    heading: 'Vehicle',
    types: ['Vehicle Insurance', 'Registration / RC', 'PUC Certificate'],
  },
  {
    heading: 'Business & Regulatory',
    types: ['FSSAI License', 'Trade License', 'GST Registration', 'Shop Act License', 'Fire NOC', 'Business Insurance', 'Import / Export License'],
  },
  {
    heading: 'Other',
    types: ['Other'],
  },
];

const ALL_DOC_TYPES = DOC_TYPE_GROUPS.flatMap((g) => g.types);

const RENEWAL_DOC_TYPES = new Set([
  'Vehicle Insurance', 'Registration / RC', 'PUC Certificate',
  'FSSAI License', 'Trade License', 'GST Registration', 'Shop Act License',
  'Fire NOC', 'Business Insurance', 'Import / Export License',
]);

const isRenewalDoc = (docType?: string) => !!docType && RENEWAL_DOC_TYPES.has(docType);

const CSV_TEMPLATE = [
  'Product Name,Brand,Device Type,Purchase Date (YYYY-MM-DD),Expiry Date (YYYY-MM-DD)',
  'MacBook Pro 14",Apple,Laptop,2024-12-18,2026-12-18',
  'Sony WH-1000XM5,Sony,Headphones,2025-07-22,2026-07-22',
  'LG 1.5T Split AC,LG,AC,N/A,2028-05-10',
  'Maruti Swift Dzire,Maruti Suzuki,Car,2022-06-10,2026-07-10',
].join('\n');

function parseCSVLine(line: string) {
  const cells: string[] = [];
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCSV(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).map((line) => parseCSVLine(line)).filter((row) => row.some(Boolean));
  const clean = lines[0]?.join(',').toLowerCase().includes('product') ? lines.slice(1) : lines;
  return clean.map((row) => ({
    id: createEntityId('csv'),
    productId: createEntityId('product'),
    name: formatProductName(row[0] || ''),
    brand: row[1] || '',
    category: row[2] || '',
    purchaseDate: toISO(row[3] || '') || todayISO(),
    expiryDate: toISO(row[4] || '') || oneYearISO(),
    docs: [],
    expanded: false,
  }));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function oneYearISO() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function toISO(value: string) {
  const raw = value.trim();
  if (!raw || raw.toLowerCase() === 'n/a') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const [, day, month, yearRaw] = slash;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function daysUntil(iso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(exp.getTime())) return null;
  return Math.ceil((exp.getTime() - today.getTime()) / 86400000);
}

const categoryLabelLines = (label: string) => {
  if (label === 'TV & Display') return ['TV &', 'Display'];
  const parts = label.split(' ');
  return parts.length > 1 ? parts : [label];
};

export default function Add() {
  const { width } = useWindowDimensions();
  const { addProduct, updateProduct } = useProducts();
  const { addProductToGroup } = useGroups();
  const { colors } = useAppTheme();
  const { groupId, groupName, from } = useLocalSearchParams<{ groupId?: string; groupName?: string; from?: string }>();
  const draftProductIdRef = useRef(createEntityId('product'));

  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [catId, setCatId] = useState<(typeof DEVICE_CATS)[number]['id']>('personal');
  const [customType, setCustomType] = useState('');
  const [docs, setDocs] = useState<DraftDoc[]>([]);
  const [pickerDocId, setPickerDocId] = useState<string | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [purchasePicker, setPurchasePicker] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvError, setCsvError] = useState('');
  const [csvSaving, setCsvSaving] = useState(false);
  const [csvPicker, setCsvPicker] = useState<{ rowId: string; docId: string } | null>(null);
  const [savePersonal, setSavePersonal] = useState(true);
  const [docSheet, setDocSheet] = useState<{ open: boolean; label: string } | null>(null);
  const [csvDocSheet, setCsvDocSheet] = useState<{ rowId: string } | null>(null);
  const [docSheetLabel, setDocSheetLabel] = useState('');
  const [docSheetType, setDocSheetType] = useState('Manufacturer Warranty');
  const [docTypeOpen, setDocTypeOpen] = useState(false);
  const [docSheetDatePicker, setDocSheetDatePicker] = useState(false);
  const [docSheetDateDocId, setDocSheetDateDocId] = useState<string | null>(null);

  const cat = DEVICE_CATS.find((c) => c.id === catId) ?? DEVICE_CATS[0];
  const inGroupFlow = typeof groupId === 'string' && groupId.length > 0;
  const title = inGroupFlow ? `Add product to ${groupName || 'group'}` : 'Add product';

  const cancelAdd = () => {
    if (inGroupFlow && groupId) {
      router.replace({ pathname: '/group/[id]', params: { id: groupId } });
    } else if (from) {
      router.replace(from as any);
    } else {
      router.replace('/products');
    }
  };
  const sortedDocs = useMemo(() => [...docs].sort((a, b) => a.label.localeCompare(b.label)), [docs]);
  const canSave = productName.trim().length > 1 && sortedDocs.some((doc) => doc.label.trim() && doc.expiry);
  const pickerDoc = pickerDocId ? docs.find((doc) => doc.id === pickerDocId) : null;

  const newDocId = () => createEntityId('doc');

  const openDocSheet = (label = '') => {
    setDocSheetLabel(label);
    setDocSheetType('Manufacturer Warranty');
    setDocTypeOpen(false);
    setDocSheet({ open: true, label });
  };

  const addDateOnlyDoc = () => {
    const label = docSheetLabel.trim() || docSheetType;
    const id = newDocId();
    setDocs((prev) => [...prev, { id, label, fileName: '', expiry: oneYearISO(), docType: docSheetType }]);
    setDocSheet(null);
    setDocSheetDateDocId(id);
    setDocSheetDatePicker(true);
  };

  const parseAndAdd = async (uri: string, fileName: string, mimeType?: string, overrideLabel?: string, size?: number) => {
    const validation = validateDocumentUpload({ fileName, mimeType, size });
    if (!validation.ok) {
      if (Platform.OS === 'web') setCsvError(validation.reason);
      else Alert.alert('Document not added', validation.reason);
      return;
    }
    const id = newDocId();
    const expiry = oneYearISO();
    const safeFileName = validation.fileName;
    const initLabel = overrideLabel || safeFileName.replace(/\.[^.]+$/, '');
    const docType = docSheet ? docSheetType : undefined;
    setDocs((prev) => [...prev, { id, label: initLabel, fileName: safeFileName, expiry, uri, mimeType: validation.mimeType, parsing: true, docType }]);
    setDocSheet(null);
    try {
      const result = await extractDocument({
        uri,
        fileName: safeFileName,
        mimeType: validation.mimeType,
        assetId: draftProductIdRef.current,
      });
      const fields = result.fields;
      setDocs((prev) => prev.map((doc) => (
        doc.id === id
          ? {
              ...doc,
              uri: result.storedUri || doc.uri,
              label: overrideLabel || fields.product_name || doc.label,
              expiry: fields.expiry_date || doc.expiry,
              parsing: false,
              autoFilled: !!fields.expiry_date,
            }
          : doc
      )));
      if (fields.product_name && !productName.trim()) setProductName(fields.product_name);
      if (fields.brand && !brand.trim()) setBrand(fields.brand);
      if (fields.purchase_date) setPurchaseDate(fields.purchase_date);
    } catch {
      setDocs((prev) => prev.map((doc) => (doc.id === id ? { ...doc, parsing: false } : doc)));
    }
  };

  const sheetLabel = () => (docSheetLabel.trim() || docSheetType) || undefined;

  const handleCamera = async (fromSheet = false) => {
    const result = await (ImagePicker as any).launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await parseAndAdd(asset.uri, asset.fileName || `Scan_${docs.length + 1}.jpg`, asset.mimeType || 'image/jpeg', fromSheet ? sheetLabel() : undefined, asset.fileSize || asset.size);
  };

  const handleGallery = async (fromSheet = false) => {
    const result = await (ImagePicker as any).launchImageLibraryAsync({ allowsMultipleSelection: true, quality: 0.85 });
    if (result.canceled) return;
    for (const asset of result.assets || []) {
      await parseAndAdd(asset.uri, asset.fileName || `Image_${docs.length + 1}.jpg`, asset.mimeType || 'image/jpeg', fromSheet ? sheetLabel() : undefined, asset.fileSize || asset.size);
    }
  };

  const handleFiles = async (fromSheet = false) => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    for (const asset of result.assets || []) {
      await parseAndAdd(asset.uri, asset.name || `Document_${docs.length + 1}.pdf`, asset.mimeType, fromSheet ? sheetLabel() : undefined, asset.size);
    }
  };

  const updateDoc = (id: string, patch: Partial<DraftDoc>) =>
    setDocs((prev) => prev.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)));

  const removeDoc = (id: string) =>
    setDocs((prev) => prev.filter((doc) => doc.id !== id));

  const downloadTemplate = async () => {
    if (Platform.OS === 'web') {
      const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'warret_template.csv';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const path = `${FileSystem.cacheDirectory || ''}warret_template.csv`;
    await FileSystem.writeAsStringAsync(path, CSV_TEMPLATE, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { dialogTitle: 'Save Warret CSV template' });
  };

  const handleCSVImport = async () => {
    setCsvError('');
    const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', 'text/comma-separated-values'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      const asset: any = result.assets[0];
      let text = '';
      if (Platform.OS === 'web' && asset.file?.text) {
        text = await asset.file.text();
      } else {
        text = await FileSystem.readAsStringAsync(asset.uri);
      }
      const rows = parseCSV(text);
      if (!rows.length) {
        setCsvError('No product rows found in the CSV.');
        return;
      }
      setCsvRows(rows);
    } catch {
      setCsvError('Could not read this CSV. Try the template format.');
    }
  };

  const updateCsvRow = (rowId: string, patch: Partial<CsvRow>) =>
    setCsvRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));

  const removeCsvRow = (rowId: string) =>
    setCsvRows((prev) => prev.filter((row) => row.id !== rowId));

  const openCsvDocSheet = (rowId: string) => {
    setDocSheetLabel('');
    setDocSheetType('Manufacturer Warranty');
    setDocTypeOpen(false);
    setCsvDocSheet({ rowId });
  };

  const parseAndAddToCsvRow = async (rowId: string, uri: string, fileName: string, mimeType?: string, size?: number) => {
    const validation = validateDocumentUpload({ fileName, mimeType, size });
    if (!validation.ok) {
      setCsvError(validation.reason);
      return;
    }
    const id = newDocId();
    const overrideLabel = (docSheetLabel.trim() || docSheetType) || undefined;
    const safeFileName = validation.fileName;
    const initLabel = overrideLabel || safeFileName.replace(/\.[^.]+$/, '');
    const rowExpiry = csvRows.find((r) => r.id === rowId)?.expiryDate || oneYearISO();
    setCsvRows((prev) => prev.map((row) => (
      row.id === rowId
        ? { ...row, expanded: true, docs: [...row.docs, { id, label: initLabel, fileName: safeFileName, expiry: rowExpiry, uri, mimeType: validation.mimeType, parsing: true, docType: docSheetType }] }
        : row
    )));
    setCsvDocSheet(null);
    try {
      const rowProductId = csvRows.find((row) => row.id === rowId)?.productId || rowId;
      const result = await extractDocument({
        uri,
        fileName: safeFileName,
        mimeType: validation.mimeType,
        assetId: rowProductId,
      });
      const fields = result.fields;
      setCsvRows((prev) => prev.map((row) => (
        row.id === rowId
          ? {
              ...row,
              name: !row.name.trim() && fields.product_name ? fields.product_name : row.name,
              brand: !row.brand.trim() && fields.brand ? fields.brand : row.brand,
              purchaseDate: fields.purchase_date || row.purchaseDate,
              expiryDate: fields.expiry_date || row.expiryDate,
              docs: row.docs.map((doc) => doc.id === id ? {
                ...doc,
                uri: result.storedUri || doc.uri,
                label: overrideLabel || fields.product_name || doc.label,
                expiry: fields.expiry_date || doc.expiry,
                parsing: false,
                autoFilled: !!fields.expiry_date,
              } : doc),
            }
          : row
      )));
    } catch {
      setCsvRows((prev) => prev.map((row) => (
        row.id === rowId ? { ...row, docs: row.docs.map((doc) => doc.id === id ? { ...doc, parsing: false } : doc) } : row
      )));
    }
  };

  const addDateOnlyToCsvRow = (rowId: string) => {
    const label = (docSheetLabel.trim() || docSheetType) || 'Warranty document';
    const rowExpiry = csvRows.find((r) => r.id === rowId)?.expiryDate || oneYearISO();
    setCsvRows((prev) => prev.map((row) => (
      row.id === rowId
        ? { ...row, expanded: true, docs: [...row.docs, { id: newDocId(), label, fileName: '', expiry: rowExpiry, docType: docSheetType }] }
        : row
    )));
    setCsvDocSheet(null);
  };

  const updateCsvDoc = (rowId: string, docId: string, patch: Partial<DraftDoc>) =>
    setCsvRows((prev) => prev.map((row) => (
      row.id === rowId
        ? { ...row, docs: row.docs.map((doc) => (doc.id === docId ? { ...doc, ...patch } : doc)) }
        : row
    )));

  const removeCsvDoc = (rowId: string, docId: string) =>
    setCsvRows((prev) => prev.map((row) => (
      row.id === rowId ? { ...row, docs: row.docs.filter((doc) => doc.id !== docId) } : row
    )));

  const saveAllCsvRows = async () => {
    setCsvSaving(true);
    for (const row of csvRows) {
      if (!row.name.trim()) continue;
      const docEntries = row.docs
        .filter((doc) => doc.label.trim() && doc.expiry)
        .map(({ id, parsing, autoFilled, ...doc }) => doc);
      const created = addProduct({
        id: row.productId,
        name: row.name,
        brand: row.brand,
        type: row.category || 'Warranty document',
        category: row.category,
        warrantyStart: row.purchaseDate,
        dateAdded: row.purchaseDate,
        warrantyEnd: row.expiryDate,
        docEntries,
        keywords: [row.name, row.brand, row.category, 'warranty'].filter(Boolean),
      });
      const storedDocs: DocEntry[] = [];
      for (const doc of docEntries) {
        const uri = doc.uri
          ? doc.uri.startsWith('supabase://')
            ? doc.uri
            : await FileStorageService.storeDocument(doc.uri, created.id, doc.fileName, doc.mimeType).catch(() => doc.uri)
          : undefined;
        storedDocs.push({ ...doc, uri });
      }
      if (storedDocs.length) updateProduct(created.id, { docEntries: storedDocs });
    }
    setCsvSaving(false);
    router.replace('/products');
  };

  const save = async () => {
    const docEntries = docs
      .filter((doc) => doc.label.trim() && doc.expiry)
      .map(({ id, parsing, autoFilled, ...doc }) => doc);
    const created = addProduct({
      id: draftProductIdRef.current,
      name: productName.trim(),
      brand: brand.trim(),
      type: customType.trim() || cat.label,
      category: cat.label,
      warrantyStart: purchaseDate,
      dateAdded: purchaseDate,
      warrantyEnd: docEntries.map((doc) => doc.expiry).sort()[0] || oneYearISO(),
      docEntries,
      personal: inGroupFlow ? savePersonal : true,
      keywords: [productName, brand, cat.label, customType, 'warranty'].filter(Boolean),
    });

    const storedDocs: DocEntry[] = [];
    for (const doc of docEntries) {
      const uri = doc.uri
        ? doc.uri.startsWith('supabase://')
          ? doc.uri
          : await FileStorageService.storeDocument(doc.uri, created.id, doc.fileName, doc.mimeType).catch(() => doc.uri)
        : undefined;
      storedDocs.push({ ...doc, uri });
    }
    if (storedDocs.length) updateProduct(created.id, { docEntries: storedDocs });

    if (inGroupFlow && groupId) {
      updateProduct(created.id, { groupId, personal: savePersonal, mergedToMain: savePersonal });
      addProductToGroup(groupId, created.id, 'public', created.name);
      router.replace({ pathname: '/group/[id]', params: { id: groupId } });
      return;
    }

    router.replace('/products');
  };

  const catSize = Math.floor((width - 60) / 4);
  if (csvRows.length > 0) {
    return (
      <View style={[s.page, { backgroundColor: colors.page }]}>
        <Header title="Review CSV import" colors={colors} onCancel={cancelAdd} />
        <ScrollView contentContainerStyle={s.content}>
          <Text style={[s.headerSub, s.reviewIntro, { color: colors.muted }]}>Review and edit any extracted information before saving. Attach any documents related to the product.</Text>
          {csvRows.map((row) => (
            <CsvReviewCard
              key={row.id}
              row={row}
              width={width}
              colors={colors}
              onDelete={() => removeCsvRow(row.id)}
              onToggle={() => updateCsvRow(row.id, { expanded: !row.expanded })}
              onAddDoc={() => openCsvDocSheet(row.id)}
              onUpdateRow={(patch) => updateCsvRow(row.id, patch)}
              onUpdateDoc={(docId, patch) => updateCsvDoc(row.id, docId, patch)}
              onRemoveDoc={(docId) => removeCsvDoc(row.id, docId)}
              onPickDoc={(docId) => setCsvPicker({ rowId: row.id, docId })}
            />
          ))}
          {!!csvError && <Text style={s.error}>{csvError}</Text>}
          <Pressable disabled={csvSaving} onPress={saveAllCsvRows} style={[s.primaryBtn, { backgroundColor: colors.primary }]}>
            {csvSaving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
            <Text style={s.primaryBtnText}>Save all products</Text>
          </Pressable>
          <Pressable onPress={() => setCsvRows([])} style={[s.backBtn, { borderColor: colors.border }]}>
            <Text style={[s.backBtnText, { color: colors.primary }]}>Cancel import</Text>
          </Pressable>
        </ScrollView>
        <DatePickerModal
          title="Document expiry"
          selectedDate={csvPicker ? (csvRows.find((row) => row.id === csvPicker.rowId)?.docs.find((doc) => doc.id === csvPicker.docId)?.expiry || todayISO()) : todayISO()}
          visible={!!csvPicker}
          onClose={() => setCsvPicker(null)}
          onSelect={(date) => {
            if (csvPicker) updateCsvDoc(csvPicker.rowId, csvPicker.docId, { expiry: date });
          }}
        />

        {csvDocSheet && (
          <View style={s.overlay}>
            <Pressable style={s.overlayBg} onPress={() => setCsvDocSheet(null)} />
            <View style={[s.docSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.docSheetTitle, { color: colors.text }]}>Add document</Text>

              <Text style={[s.docSheetLabel, { color: colors.muted }]}>Document name</Text>
              <TextInput
                value={docSheetLabel}
                onChangeText={setDocSheetLabel}
                placeholder="e.g. Manufacturer warranty"
                placeholderTextColor={colors.muted}
                autoFocus
                style={[s.docSheetInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
              />

              <Text style={[s.docSheetLabel, { color: colors.muted }]}>Document type</Text>
              <Pressable onPress={() => setDocTypeOpen((v) => !v)} style={[s.docSheetDropdown, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <Text style={[s.docSheetDropdownText, { color: colors.text }]}>{docSheetType}</Text>
                <Ionicons name={docTypeOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </Pressable>
              {docTypeOpen && (
                <View style={[s.docTypeList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {DOC_TYPE_GROUPS.map((group) => (
                    <View key={group.heading}>
                      <View style={[s.docTypeGroupHeader, { backgroundColor: colors.input }]}>
                        <Text style={[s.docTypeGroupText, { color: colors.muted }]}>{group.heading}</Text>
                      </View>
                      {group.types.map((t) => (
                        <Pressable key={t} onPress={() => { setDocSheetType(t); setDocTypeOpen(false); }} style={[s.docTypeItem, { borderBottomColor: colors.border }]}>
                          <Text style={[s.docTypeItemText, { color: t === docSheetType ? colors.primary : colors.text }]}>{t}</Text>
                          {t === docSheetType && <Ionicons name="checkmark" size={15} color={colors.primary} />}
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              )}

              <Text style={[s.docSheetLabel, { color: colors.muted, marginTop: docTypeOpen ? 4 : 14 }]}>Attach file</Text>
              <View style={s.docSheetBtns}>
                <Pressable onPress={async () => {
                  const result = await (ImagePicker as any).launchCameraAsync({ quality: 0.85 });
                  if (!result.canceled && result.assets?.[0]) {
                    const a = result.assets[0];
                    await parseAndAddToCsvRow(csvDocSheet.rowId, a.uri, a.fileName || 'Scan.jpg', a.mimeType || 'image/jpeg', a.fileSize || a.size);
                  }
                }} style={[s.docSheetFileBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <Ionicons name="camera-outline" size={20} color={colors.primary} />
                  <Text style={[s.docSheetFileBtnText, { color: colors.text }]}>Camera</Text>
                </Pressable>
                <Pressable onPress={async () => {
                  const result = await (ImagePicker as any).launchImageLibraryAsync({ allowsMultipleSelection: false, quality: 0.85 });
                  if (!result.canceled && result.assets?.[0]) {
                    const a = result.assets[0];
                    await parseAndAddToCsvRow(csvDocSheet.rowId, a.uri, a.fileName || 'Image.jpg', a.mimeType || 'image/jpeg', a.fileSize || a.size);
                  }
                }} style={[s.docSheetFileBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <Ionicons name="image-outline" size={20} color={colors.primary} />
                  <Text style={[s.docSheetFileBtnText, { color: colors.text }]}>Photos</Text>
                </Pressable>
                <Pressable onPress={async () => {
                  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
                  if (!result.canceled && result.assets?.[0]) {
                    const a = result.assets[0];
                    await parseAndAddToCsvRow(csvDocSheet.rowId, a.uri, a.name || 'Document.pdf', a.mimeType, a.size);
                  }
                }} style={[s.docSheetFileBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
                  <Text style={[s.docSheetFileBtnText, { color: colors.text }]}>Files</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => addDateOnlyToCsvRow(csvDocSheet.rowId)} style={[s.dateOnlyBtn, { borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={15} color={colors.muted} />
                <Text style={[s.dateOnlyText, { color: colors.muted }]}>Date only (no file)</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[s.page, { backgroundColor: colors.page }]}>
      <Header title={title} colors={colors} onCancel={cancelAdd} />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 132 }]}>
        {inGroupFlow && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.cardTitle, { color: colors.text }]}>Save in personal products</Text>
                <Text style={[s.cardSub, { color: colors.muted }]}>Also keep this in your Products page.</Text>
              </View>
              <Switch value={savePersonal} onValueChange={setSavePersonal} trackColor={{ false: colors.border, true: colors.primary }} />
            </View>
          </View>
        )}

        <>
            <View style={[s.smartUploadCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.smartUploadHead}>
                <View style={[s.smartUploadIcon, { backgroundColor: colors.soft }]}>
                  <Ionicons name="document-text-outline" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.smartUploadTitle, { color: colors.text }]}>Upload product document</Text>
                  <Text style={[s.smartUploadSub, { color: colors.muted }]}>
                    Invoice, warranty card, receipt, policy or product photo.
                  </Text>
                </View>
              </View>
              <View style={s.uploadBtns}>
                <ToolButton icon="camera-outline" label="Camera" onPress={handleCamera} colors={colors} />
                <ToolButton icon="image-outline" label="Photos" onPress={handleGallery} colors={colors} />
                <ToolButton icon="folder-open-outline" label="Files" onPress={handleFiles} colors={colors} />
              </View>
              <View style={[s.smartAssistRow, { backgroundColor: colors.input }]}>
                <View style={[s.smartAssistIcon, { backgroundColor: colors.primary }]}>
                  <Ionicons name="sparkles-outline" size={15} color="white" />
                </View>
                <Text style={[s.smartAssistText, { color: colors.muted }]}>
                  We will try to fill as many fields as we can just from your upload to better assist when you really need it.
                </Text>
              </View>
              {docs.length > 0 ? (
                <Text style={[s.smartUploadCount, { color: colors.primary }]}>
                  {docs.length} document{docs.length === 1 ? '' : 's'} added for review.
                </Text>
              ) : null}
            </View>

            <Text style={[s.stepQ, { color: colors.text }]}>What are we adding?</Text>
            <View style={[s.bigInput, { backgroundColor: colors.input, borderColor: colors.border }]}>
              {!productName && (
                <Text pointerEvents="none" style={[s.inputPlaceholder, s.bigPlaceholder, { color: colors.muted }]}>
                  Product name <Text style={s.requiredStar}>*</Text>
                </Text>
              )}
              <TextInput
                value={productName}
                onChangeText={setProductName}
                style={[s.clearInput, s.bigClearInput, { color: colors.text }]}
              />
            </View>
            <View style={[s.brandBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
              {!brand && (
                <Text pointerEvents="none" style={[s.inputPlaceholder, s.brandPlaceholder, { color: colors.muted }]}>
                  Brand <Text style={s.requiredStar}>*</Text>
                </Text>
              )}
              <TextInput
                value={brand}
                onChangeText={setBrand}
                style={[s.clearInput, s.brandClearInput, { color: colors.text }]}
              />
            </View>
            <Text style={[s.stepQ2, { color: colors.text }]}>Device Type</Text>
            <View style={s.catGrid}>
              {DEVICE_CATS.map((item) => {
                const active = item.id === catId;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setCatId(item.id)}
                    style={[s.catCell, { width: catSize, height: catSize, backgroundColor: active ? colors.primary : '#F0EFF4', borderColor: active ? colors.primary : '#E2DFE9' }]}
                  >
                    <Ionicons name={item.icon as any} size={26} color={active ? '#fff' : '#7E7888'} />
                    <View style={s.catTextStack}>
                      {categoryLabelLines(item.label).map((line) => (
                        <Text key={line} style={[s.catCellLabel, { color: active ? '#fff' : '#746E7E' }]}>{line}</Text>
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {cat.id === 'other' && (
              <TextInput
                value={customType}
                onChangeText={setCustomType}
                placeholder="Custom product type"
                placeholderTextColor={colors.muted}
                style={[s.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
              />
            )}
            <View style={s.stepOneActions}>
              <View style={s.importRow}>
                <Pressable onPress={handleCSVImport} style={[s.importBtn, { flex: 0.65, backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                  <Text style={[s.importBtnText, { color: colors.primary }]}>Import CSV</Text>
                </Pressable>
                <Pressable onPress={downloadTemplate} style={[s.importBtn, { flex: 0.35, backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="download-outline" size={18} color={colors.primary} />
                  <Text style={[s.importBtnText, { color: colors.primary }]}>Template</Text>
                </Pressable>
              </View>
            </View>

            <View style={[s.purchaseRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View>
                <Text style={[s.purchaseLabel, { color: colors.muted }]}>Date added / purchase date</Text>
                <Text style={[s.cardTitle, { color: colors.text }]}>{formatDisplayDate(purchaseDate)}</Text>
              </View>
              <Pressable onPress={() => setPurchasePicker(true)} style={[s.docExpiryBtn, { borderColor: colors.border, backgroundColor: colors.input }]}>
                <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                <Text style={[s.docExpiryText, { color: colors.primary }]}>Change</Text>
              </Pressable>
            </View>

            <View style={s.suggestSection}>
              <Text style={[s.suggestTitle, { color: colors.text }]}>Suggested for {cat.label.toUpperCase()}</Text>
              <View style={s.suggestChips}>
                {cat.suggestions.map((item) => {
                  const already = docs.some((doc) => doc.label.toLowerCase() === item.label.toLowerCase());
                  return (
                    <Pressable
                      key={item.label}
                      onPress={() => openDocSheet(item.label)}
                      style={[s.suggestChip, { backgroundColor: colors.card, borderColor: colors.border, opacity: already ? 0.55 : 1 }]}
                    >
                      <Text style={[s.suggestChipLabel, { color: colors.text }]}>{item.label}</Text>
                      <Text style={[s.suggestChipNote, { color: colors.muted }]}>{item.note}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => openDocSheet('')} style={[s.addManualBtn, { borderColor: colors.border }]}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={[s.addManualText, { color: colors.primary }]}>Add document</Text>
              </Pressable>
            </View>

            {sortedDocs.length === 0 ? (
              <View style={[s.emptyDocs, { borderColor: colors.border }]}>
                <Text style={[s.emptyDocsTitle, { color: colors.text }]}>No documents yet</Text>
                <Text style={[s.emptyDocsSub, { color: colors.muted }]}>Add at least one document or warranty date to save this product.</Text>
              </View>
            ) : (
              <View style={s.docList}>
                {sortedDocs.map((doc) => {
                  const days = daysUntil(doc.expiry);
                  const statusColor = days === null ? colors.muted : days < 0 ? '#D85A62' : days <= 60 ? '#D98A28' : colors.primary;
                  return (
                    <View key={doc.id} style={[s.docCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={s.docFileRow}>
                        <View style={[s.docFileIcon, { backgroundColor: colors.input }]}>
                          {doc.parsing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="document-text-outline" size={19} color={colors.primary} />}
                        </View>
                        <Text style={[s.docFileName, { color: colors.text }]} numberOfLines={1}>{doc.fileName}</Text>
                        <Pressable onPress={() => removeDoc(doc.id)} style={s.iconBtn}>
                          <Ionicons name="close" size={18} color={colors.muted} />
                        </Pressable>
                      </View>
                      <TextInput
                        value={doc.label}
                        onChangeText={(value) => updateDoc(doc.id, { label: value })}
                        placeholder="Name this document (e.g. Compressor warranty)"
                        placeholderTextColor={colors.muted}
                        style={[s.docLabelInput, { backgroundColor: colors.input, borderColor: doc.label.trim() ? colors.border : '#FF9AA2', color: colors.text }]}
                      />
                      <View style={s.docExpiryRow}>
                        <Pressable
                          onPress={() => setPickerDocId(doc.id)}
                          style={[s.docExpiryBtn, { borderColor: doc.expiry ? colors.primary : colors.border, backgroundColor: colors.input }]}
                        >
                          <Ionicons name="calendar-outline" size={14} color={statusColor} />
                          <Text style={[s.docExpiryText, { color: doc.expiry ? statusColor : colors.muted }]}>
                            {doc.expiry ? formatDisplayDate(doc.expiry) : 'Set expiry date'}
                          </Text>
                          {doc.autoFilled && (
                            <View style={s.autoTag}>
                              <Text style={s.autoTagText}>auto</Text>
                            </View>
                          )}
                        </Pressable>
                        {days !== null && (
                          <Text style={[s.daysLabel, { color: statusColor }]}>
                            {days < 0
                              ? (isRenewalDoc(doc.docType) ? 'Renewal overdue' : 'Expired')
                              : (isRenewalDoc(doc.docType) ? `Renew in ${days}d` : `${days}d left`)}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
        </>
      </ScrollView>

      <View style={[s.bottomBar, { backgroundColor: colors.page, borderTopColor: colors.border }]}>
        <Pressable disabled={!canSave} onPress={save} style={[s.primaryBtn, { backgroundColor: canSave ? colors.primary : colors.border, flex: 1 }]}>
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={s.primaryBtnText}>Save product</Text>
        </Pressable>
      </View>

      <DatePickerModal
        title="Document expiry"
        selectedDate={pickerDoc?.expiry || todayISO()}
        visible={!!pickerDoc}
        onClose={() => setPickerDocId(null)}
        onSelect={(date) => {
          if (pickerDocId) updateDoc(pickerDocId, { expiry: date });
        }}
      />
      <DatePickerModal
        title="Purchase date"
        selectedDate={purchaseDate}
        visible={purchasePicker}
        onClose={() => setPurchasePicker(false)}
        onSelect={setPurchaseDate}
      />

      {/* Doc add sheet — opens when tapping a suggestion chip or Add document */}
      {docSheet?.open && (
        <View style={s.overlay}>
          <Pressable style={s.overlayBg} onPress={() => setDocSheet(null)} />
          <View style={[s.docSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.docSheetTitle, { color: colors.text }]}>Add document</Text>

            <Text style={[s.docSheetLabel, { color: colors.muted }]}>Document name</Text>
            <TextInput
              value={docSheetLabel}
              onChangeText={setDocSheetLabel}
              placeholder="e.g. Manufacturer warranty"
              placeholderTextColor={colors.muted}
              autoFocus
              style={[s.docSheetInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]}
            />

            <Text style={[s.docSheetLabel, { color: colors.muted }]}>Document type</Text>
            <Pressable onPress={() => setDocTypeOpen((v) => !v)} style={[s.docSheetDropdown, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Text style={[s.docSheetDropdownText, { color: colors.text }]}>{docSheetType}</Text>
              <Ionicons name={docTypeOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </Pressable>
            {docTypeOpen && (
              <View style={[s.docTypeList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {DOC_TYPE_GROUPS.map((group) => (
                  <View key={group.heading}>
                    <View style={[s.docTypeGroupHeader, { backgroundColor: colors.input }]}>
                      <Text style={[s.docTypeGroupText, { color: colors.muted }]}>{group.heading}</Text>
                    </View>
                    {group.types.map((t) => (
                      <Pressable key={t} onPress={() => { setDocSheetType(t); setDocTypeOpen(false); }} style={[s.docTypeItem, { borderBottomColor: colors.border }]}>
                        <Text style={[s.docTypeItemText, { color: t === docSheetType ? colors.primary : colors.text }]}>{t}</Text>
                        {t === docSheetType && <Ionicons name="checkmark" size={15} color={colors.primary} />}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            )}

            <Text style={[s.docSheetLabel, { color: colors.muted, marginTop: docTypeOpen ? 4 : 14 }]}>Attach file</Text>
            <View style={s.docSheetBtns}>
              <Pressable onPress={() => handleCamera(true)} style={[s.docSheetFileBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <Ionicons name="camera-outline" size={20} color={colors.primary} />
                <Text style={[s.docSheetFileBtnText, { color: colors.text }]}>Camera</Text>
              </Pressable>
              <Pressable onPress={() => handleGallery(true)} style={[s.docSheetFileBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <Ionicons name="image-outline" size={20} color={colors.primary} />
                <Text style={[s.docSheetFileBtnText, { color: colors.text }]}>Photos</Text>
              </Pressable>
              <Pressable onPress={() => handleFiles(true)} style={[s.docSheetFileBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
                <Text style={[s.docSheetFileBtnText, { color: colors.text }]}>Files</Text>
              </Pressable>
            </View>
            <Pressable onPress={addDateOnlyDoc} style={[s.dateOnlyBtn, { borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={15} color={colors.muted} />
              <Text style={[s.dateOnlyText, { color: colors.muted }]}>Date only (no file)</Text>
            </Pressable>
          </View>
        </View>
      )}

      <DatePickerModal
        title="Set expiry date"
        selectedDate={oneYearISO()}
        visible={docSheetDatePicker}
        onClose={() => { setDocSheetDatePicker(false); setDocSheetDateDocId(null); }}
        onSelect={(date) => {
          const targetId = docSheetDateDocId;
          setDocs((prev) => {
            if (!targetId) return prev;
            return prev.map((d) => d.id === targetId ? { ...d, expiry: date } : d);
          });
          setPickerDocId(targetId);
          setDocSheetDateDocId(null);
        }}
      />
    </View>
  );
}

function CsvReviewCard({
  row,
  width,
  colors,
  onDelete,
  onToggle,
  onAddDoc,
  onUpdateRow,
  onUpdateDoc,
  onRemoveDoc,
  onPickDoc,
}: {
  row: CsvRow;
  width: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onDelete: () => void;
  onToggle: () => void;
  onAddDoc: () => void;
  onUpdateRow: (patch: Partial<CsvRow>) => void;
  onUpdateDoc: (docId: string, patch: Partial<DraftDoc>) => void;
  onRemoveDoc: (docId: string) => void;
  onPickDoc: (docId: string) => void;
}) {
  const revealDistance = width * 0.15;
  const revealedOffset = -Math.min(112, width * 0.29);
  const pullLimit = -Math.min(148, width * 0.38);
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (row.expanded) return;
    setOffset(0);
    setRevealed(false);
  }, [row.expanded]);

  const settleSwipe = (dx: number) => {
    if (Math.abs(dx) >= revealDistance || revealed) {
      setOffset(revealedOffset);
      setRevealed(true);
      return;
    }
    setOffset(0);
    setRevealed(false);
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy)
    ),
    onPanResponderMove: (_, gesture) => {
      const next = Math.max(pullLimit, Math.min(0, gesture.dx));
      setOffset(next);
      setRevealed(Math.abs(next) >= revealDistance);
    },
    onPanResponderRelease: (_, gesture) => settleSwipe(gesture.dx),
    onPanResponderTerminate: (_, gesture) => settleSwipe(gesture.dx),
  })).current;

  const deleteRow = () => {
    setOffset(0);
    setRevealed(false);
    onDelete();
  };

  const dismissSwipe = () => {
    if (!revealed) return false;
    setOffset(0);
    setRevealed(false);
    return true;
  };

  const exposedWidth = Math.max(0, Math.abs(offset));

  return (
    <View style={s.swipeShell}>
      <Pressable
        onPress={deleteRow}
        style={[s.swipeDeleteBg, !revealed && s.pointerOff, { opacity: revealed ? 1 : 0, width: exposedWidth }]}
      >
        <Ionicons name="trash-outline" size={18} color="#B85065" />
        <Text style={s.swipeDeleteText}>Delete</Text>
      </Pressable>
      <View
        {...panResponder.panHandlers}
        onStartShouldSetResponderCapture={dismissSwipe}
        style={[s.card, s.swipeCard, { backgroundColor: colors.card, borderColor: colors.border, marginRight: exposedWidth }]}
      >
        <View style={s.cardHead}>
          <Pressable onPress={onToggle} style={s.rowToggle}>
            <Ionicons name={row.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, s.csvProductName, { color: colors.text }]} numberOfLines={1}>
                {formatProductName(row.name || 'Unnamed product')}
              </Text>
              <Text style={[s.csvBrandText, { color: colors.muted }]} numberOfLines={1}>
                {row.brand || 'Brand not set'}
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={onAddDoc} style={[s.csvAddDocBtn, { backgroundColor: colors.primary }]}>
            <Text style={s.csvAddDocText}>Add Docs{row.docs.length > 0 ? ` (${row.docs.length})` : ''}</Text>
          </Pressable>
        </View>

        <View style={s.csvDateRow}>
          <Text style={[s.csvDateValue, { color: colors.muted }]}>
            {row.purchaseDate ? formatDisplayDate(row.purchaseDate) : '-'}
          </Text>
          <Ionicons name="arrow-forward" size={12} color={colors.muted} />
          <Text style={[s.csvDateValue, { color: colors.primary }]}>
            {row.expiryDate ? formatDisplayDate(row.expiryDate) : '-'}
          </Text>
        </View>

        {row.expanded && (
          <View style={{ gap: 10, marginTop: 12 }}>
            <Field label="Name" value={row.name} onChangeText={(value) => onUpdateRow({ name: value })} colors={colors} />
            <Field label="Brand" value={row.brand} onChangeText={(value) => onUpdateRow({ brand: value })} colors={colors} />
            <Field label="Type" value={row.category} onChangeText={(value) => onUpdateRow({ category: value })} colors={colors} />
            <View style={s.dateGrid}>
              <Field label="Purchase date" value={row.purchaseDate} onChangeText={(value) => onUpdateRow({ purchaseDate: toISO(value) || value })} colors={colors} compact />
              <Field label="Expiry date" value={row.expiryDate} onChangeText={(value) => onUpdateRow({ expiryDate: toISO(value) || value })} colors={colors} compact />
            </View>
            {row.docs.map((doc) => (
              <View key={doc.id} style={[s.docCard, { borderColor: colors.border, backgroundColor: colors.input }]}>
                <TextInput
                  value={doc.label}
                  onChangeText={(value) => onUpdateDoc(doc.id, { label: value })}
                  style={[s.docLabelInput, { color: colors.text, borderColor: colors.border }]}
                />
                <View style={s.docExpiryRow}>
                  <Pressable onPress={() => onPickDoc(doc.id)} style={[s.docExpiryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                    <Text style={[s.docExpiryText, { color: colors.text }]}>{formatDisplayDate(doc.expiry)}</Text>
                  </Pressable>
                  <Pressable onPress={() => onRemoveDoc(doc.id)} style={s.iconBtn}>
                    <Ionicons name="close" size={18} color={colors.muted} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Header({ title, colors, onCancel }: { title: string; colors: ReturnType<typeof useAppTheme>['colors']; onCancel: () => void }) {
  return (
    <View style={[s.header, { backgroundColor: colors.primary }]}>
      <Pressable onPress={onCancel} style={s.closeBtn}>
        <Ionicons name="close" size={23} color="#fff" />
      </Pressable>
      <Text style={s.headerTitle}>{title}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  colors,
  compact,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  compact?: boolean;
}) {
  return (
    <View style={{ flex: compact ? 1 : undefined, gap: 5 }}>
      <Text style={[s.purchaseLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={[s.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
    </View>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <Pressable onPress={onPress} style={[s.uploadBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={[s.uploadBtnText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  header: { paddingTop: 56, paddingHorizontal: 22, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  closeBtn: { width: 43, height: 43, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.42)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  headerTitle: { color: '#fff', fontSize: 34, lineHeight: 38, fontWeight: '900', fontFamily: F.n900 },
  headerSub: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500 },
  reviewIntro: { fontWeight: '600', fontFamily: F.i600 },
  content: { padding: 18, gap: 14 },
  smartUploadCard: { borderWidth: 1, borderRadius: 22, padding: 15, gap: 13 },
  smartUploadHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  smartUploadIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  smartUploadTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', fontFamily: F.n900 },
  smartUploadSub: { fontSize: 12.5, lineHeight: 17, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  smartAssistRow: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  smartAssistIcon: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  smartAssistText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '500', fontFamily: F.i500 },
  smartUploadCount: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },
  stepQ: { fontSize: 26, lineHeight: 31, fontWeight: '900', fontFamily: F.n900, marginTop: 4 },
  stepQ2: { fontSize: 18, lineHeight: 23, fontWeight: '900', fontFamily: F.n900, marginTop: 8 },
  bigInput: { minHeight: 62, borderRadius: 19, borderWidth: 1, justifyContent: 'center', position: 'relative' },
  brandBox: { minHeight: 44, borderRadius: 15, borderWidth: 1, justifyContent: 'center', position: 'relative' },
  clearInput: { padding: 0, outlineStyle: 'solid', outlineWidth: 0 },
  bigClearInput: { minHeight: 62, paddingHorizontal: 16, fontSize: 22, lineHeight: 27, fontWeight: '900', fontFamily: F.n900 },
  brandClearInput: { minHeight: 44, paddingHorizontal: 14, fontSize: 16, lineHeight: 21, fontWeight: '500', fontFamily: F.i500 },
  inputPlaceholder: { position: 'absolute', left: 0, right: 0 },
  bigPlaceholder: { paddingHorizontal: 16, fontSize: 22, lineHeight: 27, fontWeight: '900', fontFamily: F.n900 },
  brandPlaceholder: { paddingHorizontal: 14, fontSize: 16, lineHeight: 21, fontWeight: '500', fontFamily: F.i500 },
  requiredStar: { color: '#FF5A62' },
  input: { minHeight: 48, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, fontSize: 15, lineHeight: 20, fontWeight: '800', fontFamily: F.n800 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCell: { borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 3 },
  catTextStack: { alignItems: 'center', justifyContent: 'center' },
  catCellLabel: { fontSize: 11.5, lineHeight: 13.5, fontWeight: '600', fontFamily: F.i600, textAlign: 'center' },
  tipBox: { borderRadius: 18, padding: 14 },
  tipText: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500 },
  stepOneActions: { gap: 12, marginTop: 4 },
  importRow: { flexDirection: 'row', gap: 10 },
  importBtn: { minHeight: 54, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  importBtnText: { fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
  nextFullBtn: { minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  card: { borderWidth: 1, borderRadius: 20, padding: 15 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, lineHeight: 21, fontWeight: '900', fontFamily: F.n900 },
  cardSub: { fontSize: 12, lineHeight: 17, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  purchaseRow: { borderWidth: 1, borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  purchaseLabel: { fontSize: 11, lineHeight: 15, fontWeight: '900', fontFamily: F.n900, textTransform: 'uppercase', letterSpacing: 0.3 },
  uploadCard: { borderWidth: 1, borderRadius: 22, padding: 16 },
  uploadCardTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', fontFamily: F.n900 },
  uploadCardSub: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  uploadBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  uploadBtn: { flex: 1, minHeight: 58, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  uploadBtnText: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },
  suggestSection: { gap: 10 },
  suggestTitle: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900, letterSpacing: 0.4 },
  suggestChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  suggestChip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, maxWidth: '100%' },
  suggestChipLabel: { fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900 },
  suggestChipNote: { fontSize: 11, lineHeight: 15, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  addManualBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  addManualText: { fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900 },
  emptyDocs: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 22, padding: 22, alignItems: 'center' },
  emptyDocsTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', fontFamily: F.n900 },
  emptyDocsSub: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500, textAlign: 'center', marginTop: 4 },
  docList: { gap: 12 },
  docCard: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 11 },
  docFileRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  docFileIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  docFileName: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  docLabelInput: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, lineHeight: 19, fontWeight: '800', fontFamily: F.n800 },
  docExpiryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  docExpiryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  docExpiryText: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },
  autoTag: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: '#E7FFF3' },
  autoTagText: { color: '#22865B', fontSize: 9, lineHeight: 12, fontWeight: '900', fontFamily: F.n900 },
  daysLabel: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24, flexDirection: 'row', gap: 9 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16 },
  primaryBtnText: { color: '#fff', fontSize: 15, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14 },
  backBtnText: { fontSize: 14, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  error: { color: '#FF5A62', fontSize: 13, lineHeight: 18, fontWeight: '800', fontFamily: F.n800 },
  dateGrid: { flexDirection: 'row', gap: 10 },
  swipeShell: { position: 'relative', overflow: 'hidden', borderRadius: 20 },
  swipeCard: { zIndex: 1 },
  swipeDeleteBg: { position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 0, minWidth: 0, backgroundColor: '#FFE6EC', alignItems: 'center', justifyContent: 'center', gap: 3 },
  pointerOff: { pointerEvents: 'none' },
  swipeDeleteText: { color: '#B85065', fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },
  csvProductName: { fontSize: 18, lineHeight: 23, fontWeight: '900', fontFamily: F.n900, letterSpacing: 0 },
  csvBrandText: { fontSize: 14, lineHeight: 18, fontWeight: '500', fontFamily: F.i500, marginTop: 1 },
  csvDateRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7, paddingLeft: 26 },
  csvDateValue: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontFamily: F.i500 },
  csvAddDocBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10, marginLeft: 0, marginRight: 8, marginTop: 8, minWidth: 100, shadowColor: '#000', shadowOpacity: .08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  csvAddDocText: { color: '#fff', fontSize: 13, lineHeight: 17, fontWeight: '600', fontFamily: F.i600 },
  overlay:   { position: 'absolute', inset: 0, justifyContent: 'flex-end', zIndex: 50 },
  overlayBg: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  docSheet:  { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 24, paddingBottom: 44, gap: 2 },
  docSheetTitle: { fontSize: 22, fontWeight: '900', fontFamily: F.n900, marginBottom: 10 },
  docSheetLabel: { fontSize: 11, fontWeight: '900', fontFamily: F.n900, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  docSheetInput: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 15, fontWeight: '500', fontFamily: F.i500, marginBottom: 14 },
  docSheetDropdown: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  docSheetDropdownText: { fontSize: 15, fontWeight: '500', fontFamily: F.i500 },
  docTypeList: { borderWidth: 1, borderRadius: 14, marginTop: 4, overflow: 'hidden' },
  docTypeGroupHeader: { paddingHorizontal: 14, paddingVertical: 7 },
  docTypeGroupText: { fontSize: 10, fontWeight: '900', fontFamily: F.n900, textTransform: 'uppercase', letterSpacing: 0.5 },
  docTypeItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1 },
  docTypeItemText: { fontSize: 14, fontWeight: '800', fontFamily: F.n800 },
  docSheetBtns: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  docSheetFileBtn: { flex: 1, minHeight: 70, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6 },
  docSheetFileBtnText: { fontSize: 12, fontWeight: '900', fontFamily: F.n900 },
  dateOnlyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingVertical: 13, marginTop: 2 },
  dateOnlyText: { fontSize: 13, fontWeight: '800', fontFamily: F.n800 },
});
