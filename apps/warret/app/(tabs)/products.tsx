import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Modal, Platform, ScrollView, Text, TextInput, View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header, purple } from '../../src/components/ui';
import { ExpiryReminder, formatReminderDate, nextReminderDate } from '../../src/components/ExpiryReminder';
import { matchesProductSearch, Product } from '../../src/data/products';
import { DEMO_PRODUCT } from '../../src/data/demo';
import { useProducts } from '../../src/store/products';
import { useGroups } from '../../src/store/groups';
import { useAppTheme } from '../../src/store/theme';
import { formatDisplayDate } from '../../src/components/DatePickerModal';
import { F } from '../../src/theme/fonts';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const statusLabels = {
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired',
} as const;

const STATUS_COLORS = {
  light: { text: { Active: '#17713A', 'Expiring soon': '#9A4D00', Expired: '#A31212' }, brush: { Active: '#B6F0CB', 'Expiring soon': '#FFE3A8', Expired: '#FFC7C7' }, ring: { Active: '#45B977', 'Expiring soon': '#D89A31', Expired: '#DD6464' } },
  dark:  { text: { Active: '#3D9B68', 'Expiring soon': '#B8822A', Expired: '#B85555' }, brush: { Active: '#1A3A29', 'Expiring soon': '#3A2A10', Expired: '#3A1A1A' }, ring: { Active: '#3D9B68', 'Expiring soon': '#B8822A', Expired: '#B85555' } },
};
const getStatusColors = (isDark: boolean) => isDark ? STATUS_COLORS.dark : STATUS_COLORS.light;
const brushStructure = { areaMultiplier: 2.7, angle: '-2deg' } as const;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Section icons for minimized view ─────────────────────────────────────────
const SECTION_ICONS = [
  { section: 'documents', icon: 'document-text-outline'    as const },
  { section: 'coverage',  icon: 'shield-outline'           as const },
  { section: 'support',   icon: 'headset-outline'          as const },
  { section: 'extended',  icon: 'shield-checkmark-outline' as const },
];

// ─── Warranty elapsed % ────────────────────────────────────────────────────────
const warrantyElapsedPercent = (start: string, end: string) => {
  const now  = new Date();
  const s    = new Date(`${start}T00:00:00`).getTime();
  const e    = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return clamp(Math.round(((now.getTime() - s) / (e - s)) * 100), 0, 100);
};

// ─── WarrantyRing ──────────────────────────────────────────────────────────────
function WarrantyRing({ percent, color, brush, size }: { percent: number; color: string; brush: string; size: number }) {
  const inner = size * 0.68;
  const norm  = percent >= 99 ? 100 : clamp(percent, 0, 100);
  return (
    <View style={[s.warrantyRing, {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: norm === 100 ? color : undefined,
      backgroundImage: norm === 100 ? undefined
        : `conic-gradient(from 0deg, ${color} 0% ${norm}%, rgba(255,255,255,.48) ${norm}% 100%)`,
    } as any]}>
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: brush }} />
    </View>
  );
}

// ─── Status brush ──────────────────────────────────────────────────────────────
function ProductStatusBrush({ text, scale, percent, isDark, cardColor }: { text: Product['status']; scale: number; percent: number; isDark: boolean; cardColor: string }) {
  const sc    = getStatusColors(isDark);
  const bandH = clamp(38 * scale, 27, 38);
  const h     = bandH * brushStructure.areaMultiplier;
  const w     = text === 'Expiring soon' ? clamp(132 * scale, 94, 132) : clamp(86 * scale, 62, 86);
  const color = sc.text[text];
  const brush = sc.brush[text];
  const tilt  = { transform: [{ rotate: brushStructure.angle }] };
  return (
    <View style={[s.statusBrush, { width: w, height: h }]}>
      <View style={[s.sbBase,   tilt, { backgroundColor: brush }]} />
      <View style={[s.sbTop,    tilt, { backgroundColor: brush }]} />
      <View style={[s.sbBottom, tilt, { backgroundColor: brush }]} />
      <View style={[s.sbLeft,   tilt, { backgroundColor: brush }]} />
      <View style={[s.sbCutTop,    tilt, { backgroundColor: cardColor }]} />
      <View style={[s.sbCutBottom, tilt, { backgroundColor: cardColor }]} />
      <View style={[s.sbTextBand, { height: bandH }]}>
        <Text style={[s.sbText, { color, fontSize: clamp(18 * scale, 12, 18), lineHeight: clamp(22 * scale, 15, 22) }]}>{text}</Text>
      </View>
      <View style={[s.sbRingBand, { top: bandH + (h - bandH) * 0.2 }]}>
        <WarrantyRing percent={percent} color={sc.ring[text]} brush={brush} size={clamp(37 * scale, 28, 37)} />
      </View>
    </View>
  );
}

// ─── Expiry breakdown modal ────────────────────────────────────────────────────
function ExpiryModal({ product, onClose, colors, isDark }: { product: Product | null; onClose: () => void; colors: any; isDark: boolean }) {
  if (!product) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sc = getStatusColors(isDark);
  const sorted = [...(product.docEntries || [])].sort((a, b) => {
    if (!a.expiry && !b.expiry) return 0;
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry.localeCompare(b.expiry);
  });
  const rowColor = (expiry: string) => {
    if (!expiry) return colors.muted as string;
    const d = Math.ceil((new Date(`${expiry}T00:00:00`).getTime() - today.getTime()) / 86400000);
    return d < 0 ? sc.text['Expired'] : d <= 60 ? sc.text['Expiring soon'] : sc.text['Active'];
  };
  const daysLabel = (expiry: string) => {
    const d = Math.ceil((new Date(`${expiry}T00:00:00`).getTime() - today.getTime()) / 86400000);
    return d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Today!' : `${d}d left`;
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalBackdrop} onPress={onClose} />
      <View style={[s.modalSheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <View style={[s.modalHandle, { backgroundColor: colors.border }]} />
        <Text style={[s.modalTitle, { color: colors.text }]}>What's expiring</Text>
        <Text style={[s.modalSub, { color: colors.muted }]}>{product.name}</Text>
        <ScrollView>
          {sorted.map((entry) => {
            const c = rowColor(entry.expiry);
            return (
              <View key={entry.label} style={[s.modalRow, { borderBottomColor: colors.border }]}>
                <View style={[s.modalDot, { backgroundColor: c }]} />
                <Text style={[s.modalRowLabel, { color: colors.text, flex: 1 }]}>{entry.label}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.modalRowDate, { color: c }]}>
                    {entry.expiry ? formatDisplayDate(entry.expiry) : 'No date set'}
                  </Text>
                  {!!entry.expiry && (
                    <Text style={[s.modalRowDays, { color: c }]}>{daysLabel(entry.expiry)}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
        <Pressable onPress={onClose} style={[s.modalClose, { backgroundColor: colors.primary }]}>
          <Text style={s.modalCloseText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Products() {
  const { width, height }  = useWindowDimensions();
  const navigation         = useNavigation();
  const {
    products,
    productCategories,
    deleteProduct,
    setReminders,
    addProductCategory,
    updateProductCategory,
    deleteProductCategory,
  } = useProducts();
  const { groups }         = useGroups();
  const { colors, isDark } = useAppTheme();
  const sc                 = getStatusColors(isDark);
  const { status, q }      = useLocalSearchParams<{ status?: string; q?: string }>();
  const [cardEditMode,    setCardEditMode]    = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [minimizedIds,    setMinimizedIds]    = useState<Set<string>>(new Set());
  const [expiryModal,     setExpiryModal]     = useState<Product | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categorySheet, setCategorySheet] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryProductIds, setCategoryProductIds] = useState<Set<string>>(new Set());
  const wiggle           = useRef(new Animated.Value(0)).current;
  const keepShakeAction  = useRef(false);
  const initialSearch    = typeof q === 'string' ? q : '';
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);

  // Android: hardware back key closes open sheets/modals before navigating away
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (expiryModal)         { setExpiryModal(null);         return true; }
      if (categorySheet)       { setCategorySheet(null);       return true; }
      if (categoryPickerOpen)  { setCategoryPickerOpen(false); return true; }
      if (pendingDeleteId)     { setPendingDeleteId(null);     return true; }
      if (cardEditMode)        { setCardEditMode(false);       return true; }
      return false;
    });
    return () => sub.remove();
  }, [expiryModal, categorySheet, categoryPickerOpen, pendingDeleteId, cardEditMode]);
  useEffect(() => {
    if (selectedCategoryId && !productCategories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(null);
    }
  }, [productCategories, selectedCategoryId]);
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => setCardEditMode(false));
    return unsub;
  }, [navigation]);
  useEffect(() => {
    if (!cardEditMode) { wiggle.stopAnimation(); wiggle.setValue(0); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(wiggle, { toValue: 1, duration: 78, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0, duration: 78, easing: Easing.linear, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [cardEditMode, wiggle]);

  const toggleMinimize = (id: string) =>
    setMinimizedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const activeStatus = typeof status === 'string' && status in statusLabels ? status : undefined;
  const query = search.trim().toLowerCase();
  const localGroupProductIds = useMemo(
    () => new Set(groups.flatMap((g) => g.products.filter((gp) => g.mergeAllToMain || gp.mergedToMain).map((gp) => gp.productId))),
    [groups],
  );
  const personalProducts = useMemo(
    () => products.filter((p) => p.personal !== false && (!p.groupId || localGroupProductIds.has(p.id))),
    [products, localGroupProductIds],
  );
  const filteredProducts = useMemo(
    () => activeStatus ? personalProducts.filter((p) => p.status === statusLabels[activeStatus as keyof typeof statusLabels]) : personalProducts,
    [activeStatus, personalProducts],
  );
  const selectedCategory = useMemo(
    () => productCategories.find((category) => category.id === selectedCategoryId) || null,
    [productCategories, selectedCategoryId],
  );
  const categoryCounts = useMemo(() => {
    const personalIds = new Set(personalProducts.map((product) => product.id));
    return new Map(productCategories.map((category) => [
      category.id,
      category.productIds.filter((id) => personalIds.has(id)).length,
    ]));
  }, [personalProducts, productCategories]);
  const featuredCategory = useMemo(() => {
    if (selectedCategory) return selectedCategory;
    return [...productCategories].sort((a, b) => (categoryCounts.get(b.id) || 0) - (categoryCounts.get(a.id) || 0))[0] || null;
  }, [categoryCounts, productCategories, selectedCategory]);
  const categoryFilteredProducts = useMemo(
    () => selectedCategory
      ? filteredProducts.filter((p) => selectedCategory.productIds.includes(p.id))
      : filteredProducts,
    [filteredProducts, selectedCategory],
  );
  const searchedProducts = useMemo(
    () => query ? categoryFilteredProducts.filter((p) => matchesProductSearch(p, query)) : categoryFilteredProducts,
    [query, categoryFilteredProducts],
  );
  const showDemoProduct = products.length === 0 && !query && !activeStatus && !selectedCategory;
  const displayProducts = showDemoProduct ? [DEMO_PRODUCT] : searchedProducts;
  const title     = activeStatus ? statusLabels[activeStatus as keyof typeof statusLabels] : 'Products';
  const countText = showDemoProduct
    ? 'Demo preview'
    : `${selectedCategory ? `${selectedCategory.name} · ` : ''}${searchedProducts.length} ${searchedProducts.length === 1 ? 'product' : 'products'}`;
  const cancelSearch = () => {
    setSearch('');
    router.replace(activeStatus ? { pathname: '/products', params: { status: activeStatus } } : '/products');
  };
  const pendingDeleteProduct = useMemo(() => products.find((p) => p.id === pendingDeleteId), [products, pendingDeleteId]);
  const closeDeletePrompt = () => { setPendingDeleteId(null); setCardEditMode(false); };
  const confirmDelete     = () => { if (pendingDeleteId) deleteProduct(pendingDeleteId); setPendingDeleteId(null); setCardEditMode(false); };
  const handleAllCategoryPress = () => {
    setCategoryPickerOpen(false);
    setSelectedCategoryId(null);
  };
  const openCreateCategory = () => {
    setCategoryPickerOpen(false);
    setCategorySheet({ mode: 'create' });
    setCategoryName('');
    setCategoryProductIds(new Set());
  };
  const openManageCategory = (id: string) => {
    const category = productCategories.find((item) => item.id === id);
    if (!category) return;
    setCategoryPickerOpen(false);
    setCategorySheet({ mode: 'edit', id });
    setCategoryName(category.name);
    setCategoryProductIds(new Set(category.productIds));
  };
  const chooseCategory = (id: string) => {
    setSelectedCategoryId(id);
    setCategoryPickerOpen(false);
  };
  const toggleCategoryProduct = (id: string) => {
    setCategoryProductIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const closeCategorySheet = () => setCategorySheet(null);
  const saveCategory = () => {
    const name = categoryName.trim();
    if (!name) return;
    const ids = Array.from(categoryProductIds);
    if (categorySheet?.mode === 'edit') {
      updateProductCategory(categorySheet.id, { name, productIds: ids });
    } else {
      const category = addProductCategory(name, ids);
      setSelectedCategoryId(category.id);
    }
    closeCategorySheet();
  };
  const removeCategory = () => {
    if (categorySheet?.mode !== 'edit') return;
    deleteProductCategory(categorySheet.id);
    setSelectedCategoryId(null);
    closeCategorySheet();
  };

  // ── Responsive sizing ────────────────────────────────────────────────────
  const cs        = clamp(Math.min(width / 390, height / 844), 0.56, 1.08);
  const listPad   = clamp(width * 0.056 * cs, 12, 22);
  const cardR     = clamp(width * 0.072 * cs, 16, 28);
  const cardP     = clamp(width * 0.062 * cs, 13, 24);
  const cardMb    = clamp(height * 0.024 * cs, 10, 20);
  const titleFs   = clamp(width * 0.064 * cs, 17, 25);
  const titleLh   = clamp(width * 0.078 * cs, 21, 30);
  const brandFs   = clamp(width * 0.051 * cs, 14, 20);
  const brandLh   = clamp(width * 0.064 * cs, 18, 25);
  const brandMt   = clamp(height * 0.006 * cs, 3, 5);
  const rowGap    = clamp(width * 0.026 * cs, 6, 10);
  const rowMt     = clamp(height * 0.011 * cs, 4, 10);
  const calSz     = clamp(width * 0.054 * cs, 15, 21);
  const metaFs    = clamp(width * 0.051 * cs, 14, 20);
  const metaLh    = clamp(width * 0.064 * cs, 18, 25);
  const linksMt   = clamp(height * 0.03 * cs, 14, 26);
  const linkPadH  = clamp(width * 0.04 * cs, 10, 16);
  const linkPadV  = clamp(width * 0.032 * cs, 8, 13);
  const linkMb    = clamp(width * 0.028 * cs, 7, 11);
  const linkR     = clamp(width * 0.042 * cs, 11, 16);
  const linkFs    = clamp(width * 0.041 * cs, 13, 16);
  const linkLh    = clamp(width * 0.052 * cs, 16, 20);
  // minimize button (inline with expiry row)
  const miniBtnH  = clamp(26 * cs, 20, 28);
  const miniBtnW  = clamp(36 * cs, 28, 40);
  const miniChevSz= clamp(13 * cs, 10, 15);
  // minimized card
  const miniNameFs  = clamp(width * 0.052 * cs, 15, 21);
  const miniExpFs   = clamp(width * 0.037 * cs, 11, 14);
  const sectionBtnSz= clamp(width * 0.082 * cs, 26, 36);
  const sectionIcSz = clamp(width * 0.05 * cs, 15, 20);
  // empty state
  const emptyMinH   = clamp(height * 0.33, 190, 280);
  const emptyR      = clamp(width * 0.062 * cs, 16, 24);
  const emptyP      = clamp(width * 0.062 * cs, 14, 24);
  const emptyIcSz   = clamp(width * 0.097 * cs, 26, 38);
  const emptyTitleFs= clamp(width * 0.062 * cs, 17, 24);
  const emptyTitleLh= clamp(width * 0.076 * cs, 21, 30);
  const emptyTextFs = clamp(width * 0.044 * cs, 13, 17);
  const emptyTextLh = clamp(width * 0.057 * cs, 17, 22);

  const wiggleStyle = cardEditMode ? {
    transform: [
      { rotate: wiggle.interpolate({ inputRange: [0, 1], outputRange: ['-0.75deg', '0.75deg'] }) },
      { scale: 0.985 },
    ],
  } : undefined;

  return (
    <View style={[s.page, { backgroundColor: colors.page }]}
      onTouchEndCapture={() => {
        if (!cardEditMode) return;
        setTimeout(() => {
          if (keepShakeAction.current) { keepShakeAction.current = false; return; }
          setCardEditMode(false);
        }, 80);
      }}
    >
      <ScrollView style={{ backgroundColor: colors.page }}
        onScrollBeginDrag={() => cardEditMode && setCardEditMode(false)}
      >
        <Header
          title={query ? 'Search' : title} sub={countText}
          plus={() => router.push('/add')}
          searchValue={search} onSearchChange={setSearch} onSearchCancel={cancelSearch}
        />
        <View style={[{ paddingHorizontal: listPad, paddingTop: cardMb, paddingBottom: clamp(height * 0.13, 84, 128) }, s.listArea]}>
          <View style={[s.categoryShelf, { marginBottom: clamp(height * 0.018 * cs, 10, 16) }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRail}>
	              <Pressable
	                onPress={handleAllCategoryPress}
                style={[
                  s.categoryChip,
                  {
                    backgroundColor: !selectedCategory ? colors.primary : colors.card,
                    borderColor: !selectedCategory ? colors.primary : colors.border,
                  },
                ]}
	              >
	                <Ionicons name="albums-outline" size={15} color={!selectedCategory ? 'white' : colors.primary} />
	                <Text style={[s.categoryChipText, { color: !selectedCategory ? 'white' : colors.text }]}>All</Text>
	              </Pressable>
	              {featuredCategory && (
	                <Pressable
	                  onPress={() => setCategoryPickerOpen(true)}
	                  style={[
	                    s.categoryChip,
	                    s.featuredCategoryChip,
	                    {
	                      backgroundColor: selectedCategory ? colors.primary : colors.card,
	                      borderColor: selectedCategory ? colors.primary : colors.border,
	                    },
		                  ]}
		                >
		                  <Ionicons name="chevron-down" size={14} color={selectedCategory ? 'rgba(255,255,255,.86)' : colors.muted} />
		                  <Text
		                    numberOfLines={1}
		                    style={[s.categoryChipText, { color: selectedCategory ? 'white' : colors.text, flexShrink: 1 }]}
		                  >
		                    {featuredCategory.name}
		                  </Text>
		                  <Pressable
		                    onPress={(e) => { e.stopPropagation(); openManageCategory(featuredCategory.id); }}
	                    style={[s.categoryPencil, { backgroundColor: selectedCategory ? 'rgba(255,255,255,.18)' : colors.soft }]}
	                  >
	                    <Ionicons name="create-outline" size={13} color={selectedCategory ? 'white' : colors.primary} />
	                  </Pressable>
	                </Pressable>
	              )}
	              <Pressable
                onPress={openCreateCategory}
                style={[s.categoryChip, { backgroundColor: colors.card, borderColor: colors.primary }]}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={[s.categoryChipText, { color: colors.primary }]}>Category</Text>
              </Pressable>
            </ScrollView>
          </View>
          {cardEditMode ? <Pressable style={s.shakeExitLayer} onPress={() => setCardEditMode(false)} /> : null}

          {showDemoProduct ? (
            <View style={[s.demoNotice, { backgroundColor: colors.soft, borderColor: colors.border }]}>
              <View style={[s.demoIcon, { backgroundColor: colors.card }]}>
                <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.demoTitle, { color: colors.text }]}>Example product preview</Text>
                <Text style={[s.demoText, { color: colors.muted }]}>
                  This is not saved to your vault. Add your first product and the example disappears automatically.
                </Text>
              </View>
            </View>
          ) : null}

          {displayProducts.length === 0 ? (
            <View style={[s.empty, { minHeight: emptyMinH, borderRadius: emptyR, padding: emptyP, backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="file-tray-outline" size={emptyIcSz} color={colors.primary} />
              <Text style={[s.emptyTitle, { fontSize: emptyTitleFs, lineHeight: emptyTitleLh, color: colors.text, marginTop: clamp(height * 0.017 * cs, 8, 14) }]}>No products found</Text>
              <Text style={[s.emptyText, { fontSize: emptyTextFs, lineHeight: emptyTextLh, color: colors.muted, marginTop: clamp(height * 0.01 * cs, 5, 8) }]}>
                {selectedCategory ? 'Tap the pencil icon next to this category to assign products.' : 'Try a different search or filter.'}
              </Text>
            </View>
          ) : displayProducts.map((p) => {
            const isDemo = p.id === DEMO_PRODUCT.id;
            const isMinimized    = minimizedIds.has(p.id);
            const hasMultiExpiry = !!(p.docEntries && p.docEntries.length > 0);
            const elapsedPct     = warrantyElapsedPercent(p.warrantyStart, p.warrantyEnd);

            return (
              <AnimatedPressable
                key={p.id}
                delayLongPress={isDemo ? undefined : 2000}
                onLongPress={() => !isDemo && setCardEditMode(true)}
                onPress={() => {
                  if (cardEditMode) { setCardEditMode(false); return; }
                  router.push(`/product/${p.id}`);
                }}
                style={[
                  s.card,
                  { borderRadius: cardR, padding: cardP, marginBottom: cardMb, backgroundColor: colors.card, borderColor: colors.border },
                  cardEditMode && !isDemo && s.cardEditing,
                  !isDemo && wiggleStyle,
                ]}
              >
                {/* Edit-mode controls (delete / edit) */}
                {cardEditMode && !isDemo && (
                  <>
                    <Pressable
                      testID={`delete-${p.id}`}
                      onPressIn={() => { keepShakeAction.current = true; }}
                      onPress={(e) => { e.stopPropagation(); setPendingDeleteId(p.id); setCardEditMode(true); }}
                      style={s.deleteControl}
                    >
                      <Ionicons name="close" size={18} color="white" />
                    </Pressable>
                    <Pressable
                      testID={`edit-${p.id}`}
                      onPressIn={() => { keepShakeAction.current = true; }}
                      onPress={(e) => {
                        e.stopPropagation();
                        setCardEditMode(false);
                        router.push({ pathname: '/product/[id]', params: { id: p.id, edit: '1' } });
                      }}
                      style={[s.cardEditControl, { backgroundColor: colors.primary }]}
                    >
                      <Ionicons name="create-outline" size={18} color="white" />
                    </Pressable>
                  </>
                )}

                {/* ── MINIMIZED layout ─────────────────────────────────────────────── */}
                {isMinimized ? (
                  <View style={s.miniRoot}>
                    {/* Row 1: dot + full name — no icons competing for space */}
                    <View style={s.miniNameRow}>
                      <View style={[s.miniDot, { backgroundColor: sc.ring[p.status] }]} />
                      <Text style={[s.miniName, { fontSize: miniNameFs, color: sc.text[p.status] }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </View>

                    {/* Row 2: expiry date (left) + section icons + ↓ expand (right) */}
                    <View style={s.miniBottomRow}>
                      {hasMultiExpiry ? (
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); setExpiryModal(p); }}
                          style={s.miniExpiryRow}
                        >
                          <Ionicons name="calendar-outline" size={clamp(11 * cs, 9, 12)} color={colors.muted} />
                          <Text style={[s.miniExpiry, { fontSize: miniExpFs, color: colors.muted }]}>Expires {p.expires}</Text>
                          <Ionicons name="chevron-forward" size={clamp(10 * cs, 8, 11)} color={colors.primary} />
                        </Pressable>
                      ) : (
                        <View style={s.miniExpiryRow}>
                          <Ionicons name="calendar-outline" size={clamp(11 * cs, 9, 12)} color={colors.muted} />
                          <Text style={[s.miniExpiry, { fontSize: miniExpFs, color: colors.muted }]}>Expires {p.expires}</Text>
                        </View>
                      )}

                      {/* 4 section icon buttons + ↓ expand */}
                      <View style={s.miniRight}>
                        {SECTION_ICONS.map((si) => (
                          <Pressable
                            key={si.section}
                            onPress={(e) => {
                              e.stopPropagation();
                              if (!cardEditMode) router.push({ pathname: '/product/[id]', params: { id: p.id, section: si.section } });
                            }}
                            style={[s.miniSectionBtn, {
                              width: sectionBtnSz, height: sectionBtnSz, borderRadius: sectionBtnSz / 2,
                              backgroundColor: colors.soft, borderColor: colors.border,
                            }]}
                          >
                            <Ionicons name={si.icon} size={sectionIcSz} color={colors.primary} />
                          </Pressable>
                        ))}
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); toggleMinimize(p.id); }}
                          style={[s.miniSectionBtn, {
                            width: sectionBtnSz, height: sectionBtnSz, borderRadius: sectionBtnSz / 2,
                            backgroundColor: colors.cardAlt, borderColor: colors.border,
                          }]}
                        >
                          <Ionicons name="chevron-down" size={sectionIcSz * 0.85} color={colors.muted} />
                        </Pressable>
                      </View>
                    </View>
                  </View>

                ) : (
                /* ── FULL layout (original + expiry row minimize btn) ───────────── */
                <>
                  {/* Top: name / brand + status brush — UNCHANGED from original */}
                  <View style={[s.top, { gap: clamp(width * 0.036 * cs, 8, 14) }]}>
                    <View style={{ flex: 1 }}>
                      {isDemo ? <Text style={[s.demoPill, { color: colors.primary, backgroundColor: colors.soft }]}>DEMO ONLY</Text> : null}
                      <Text style={[s.name, { fontSize: titleFs, lineHeight: titleLh, color: colors.text }]}>{p.name}</Text>
                      <Text style={[s.brand, { fontSize: brandFs, lineHeight: brandLh, marginTop: brandMt, color: colors.muted }]}>{p.brand}</Text>
                    </View>
                    <ProductStatusBrush text={p.status} scale={cs} percent={elapsedPct} isDark={isDark} cardColor={colors.card} />
                  </View>

                  {/* Expiry row — inline minimize button on the right */}
                  <View style={[s.expiryLine, { gap: rowGap, marginTop: rowMt }]}>
                    {/* Left: calendar + date (Pressable only if multi-expiry) */}
                    {hasMultiExpiry ? (
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); setExpiryModal(p); }}
                        style={s.expiryLeft}
                      >
                        <Ionicons name="calendar-outline" size={calSz} color={colors.text} />
                        <Text style={[s.meta, { fontSize: metaFs, lineHeight: metaLh, color: colors.text }]}>Expires {p.expires}</Text>
                        <View style={[s.multiDot, { backgroundColor: sc.ring[p.status] }]} />
                        <Text style={[s.multiLabel, { fontSize: clamp(metaFs * 0.7, 10, 14), color: colors.primary }]}>
                          {p.docEntries!.length} expir{p.docEntries!.length === 1 ? 'y' : 'ies'}
                        </Text>
                        <Ionicons name="chevron-forward" size={clamp(calSz * 0.7, 11, 15)} color={colors.primary} />
                      </Pressable>
                    ) : (
                      <View style={s.expiryLeft}>
                        <Ionicons name="calendar-outline" size={calSz} color={colors.text} />
                        <Text style={[s.meta, { fontSize: metaFs, lineHeight: metaLh, color: colors.text }]}>Expires {p.expires}</Text>
                      </View>
                    )}

                    {/* ↑ minimize button */}
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); toggleMinimize(p.id); }}
                      style={[s.minimizeBtn, {
                        height: miniBtnH, width: miniBtnW, borderRadius: clamp(miniBtnH * 0.45, 8, 13),
                        backgroundColor: colors.cardAlt, borderColor: colors.border,
                      }]}
                    >
                      <Ionicons name="chevron-up" size={miniChevSz} color={colors.muted} />
                    </Pressable>
                  </View>

                  {/* Reminder row */}
                  {cardEditMode ? (
                    <View style={[s.reminderRow, { marginTop: clamp(height * 0.006 * cs, 3, 6) }]}>
                      <Ionicons name="notifications-outline" size={clamp(16 * cs, 13, 16)} color={colors.muted} />
                      <Text style={[s.reminderText, { fontSize: clamp(width * 0.038 * cs, 12, 15), lineHeight: clamp(width * 0.048 * cs, 15, 18), color: colors.muted }]}>
                        {nextReminderDate(p.reminders) ? `Next reminder ${formatReminderDate(nextReminderDate(p.reminders))}` : 'No reminder set'}
                      </Text>
                    </View>
                  ) : (
                    isDemo ? (
                      <View style={[s.reminderRow, { marginTop: clamp(height * 0.006 * cs, 3, 6) }]}>
                        <Ionicons name="notifications-outline" size={clamp(16 * cs, 13, 16)} color={colors.muted} />
                        <Text style={[s.reminderText, { fontSize: clamp(width * 0.038 * cs, 12, 15), lineHeight: clamp(width * 0.048 * cs, 15, 18), color: colors.muted }]}>
                          Reminders, documents and coverage live here
                        </Text>
                      </View>
                    ) : (
                    <ExpiryReminder compact startInCalendar productName={p.name} expiryDate={p.warrantyEnd} reminders={p.reminders} onSave={(dates) => setReminders(p.id, dates)}>
                      <View style={[s.reminderRow, { marginTop: clamp(height * 0.006 * cs, 3, 6) }]}>
                        <Ionicons name="notifications-outline" size={clamp(16 * cs, 13, 16)} color={colors.muted} />
                        <Text style={[s.reminderText, { fontSize: clamp(width * 0.038 * cs, 12, 15), lineHeight: clamp(width * 0.048 * cs, 15, 18), color: colors.muted }]}>
                          {nextReminderDate(p.reminders) ? `Next reminder ${formatReminderDate(nextReminderDate(p.reminders))}` : 'No reminder set'}
                        </Text>
                      </View>
                    </ExpiryReminder>
                    )
                  )}

                  {/* 4 section link tiles */}
                  <View style={[s.links, { marginTop: linksMt }]}>
                    {[
                      { label: 'Documents', section: 'documents' },
                      { label: 'Coverage',  section: 'coverage'  },
                      { label: 'Support',   section: 'support'   },
                      { label: 'Extended',  section: 'extended'  },
                    ].map((item) => (
                      <Pressable
                        key={item.section}
                        onPress={(e) => {
                          e.stopPropagation();
                          if (cardEditMode) { setCardEditMode(false); return; }
                          router.push({ pathname: '/product/[id]', params: { id: p.id, section: item.section } });
                        }}
                        style={[s.link, {
                          width: '48%',
                          paddingHorizontal: linkPadH, paddingVertical: linkPadV,
                          marginBottom: linkMb, borderRadius: linkR,
                          backgroundColor: colors.input, borderColor: colors.border,
                        }]}
                      >
                        <Text style={[s.linkText, { color: colors.primary, fontSize: linkFs, lineHeight: linkLh }]}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
                )}
              </AnimatedPressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Category picker opened by double-tapping All */}
      <Modal visible={categoryPickerOpen} transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)}>
        <Pressable style={s.pickerBackdrop} onPress={() => setCategoryPickerOpen(false)} />
        <View style={[s.categoryPicker, { top: clamp(height * 0.255, 188, 228), backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.categoryPickerHead}>
            <Text style={[s.categoryPickerTitle, { color: colors.text }]}>Categories</Text>
            <Pressable onPress={() => setCategoryPickerOpen(false)} style={[s.categoryClose, { backgroundColor: colors.cardAlt }]}>
              <Ionicons name="close" size={17} color={colors.muted} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => { setSelectedCategoryId(null); setCategoryPickerOpen(false); }}
            style={[s.categoryPickRow, { backgroundColor: !selectedCategory ? colors.soft : colors.cardAlt, borderColor: !selectedCategory ? colors.primary : colors.border }]}
          >
            <Ionicons name="albums-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.categoryPickName, { color: colors.text }]}>All products</Text>
              <Text style={[s.categoryPickMeta, { color: colors.muted }]}>{personalProducts.length} products</Text>
            </View>
            {!selectedCategory && <Ionicons name="checkmark" size={18} color={colors.primary} />}
          </Pressable>
          {productCategories.map((category) => {
            const selected = category.id === selectedCategoryId;
            const categoryCount = category.productIds.filter((id) => personalProducts.some((p) => p.id === id)).length;
            return (
              <Pressable
                key={category.id}
                onPress={() => chooseCategory(category.id)}
                style={[s.categoryPickRow, { backgroundColor: selected ? colors.soft : colors.cardAlt, borderColor: selected ? colors.primary : colors.border }]}
              >
                <Ionicons name={selected ? 'folder-open-outline' : 'folder-outline'} size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.categoryPickName, { color: colors.text }]}>{category.name}</Text>
	                  <Text style={[s.categoryPickMeta, { color: colors.muted }]}>
	                    {categoryCount} product{categoryCount === 1 ? '' : 's'}
	                  </Text>
	                </View>
	                {selected && <Ionicons name="checkmark" size={17} color={colors.primary} />}
	                <Pressable
	                  onPress={(e) => { e.stopPropagation(); openManageCategory(category.id); }}
	                  style={[s.categoryPickerEdit, { backgroundColor: colors.soft }]}
	                >
	                  <Ionicons name="create-outline" size={14} color={colors.primary} />
	                </Pressable>
	              </Pressable>
            );
          })}
        </View>
      </Modal>

      {/* Product category create/manage sheet */}
      <Modal visible={categorySheet !== null} transparent animationType="slide" onRequestClose={closeCategorySheet}>
        <Pressable style={s.modalBackdrop} onPress={closeCategorySheet} />
        <View style={[s.categorySheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[s.modalHandle, { backgroundColor: colors.border }]} />
          <View style={s.categorySheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={[s.modalTitle, { color: colors.text }]}>
                {categorySheet?.mode === 'edit' ? 'Manage category' : 'Create category'}
              </Text>
              <Text style={[s.modalSub, { color: colors.muted }]}>Choose products to keep together in Products.</Text>
            </View>
            <Pressable onPress={closeCategorySheet} style={[s.categoryClose, { backgroundColor: colors.cardAlt }]}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
          <TextInput
            value={categoryName}
            onChangeText={setCategoryName}
            placeholder="Kitchen, Studio, Office..."
            placeholderTextColor={colors.muted}
            selectionColor={colors.primary}
            underlineColorAndroid="transparent"
            style={[s.categoryInput, { color: colors.text, backgroundColor: colors.input, borderColor: colors.border }]}
          />
          <ScrollView style={s.categoryProductList} showsVerticalScrollIndicator={false}>
            {personalProducts.map((product) => {
              const selected = categoryProductIds.has(product.id);
              return (
                <Pressable
                  key={product.id}
                  onPress={() => toggleCategoryProduct(product.id)}
                  style={[
                    s.categoryProductRow,
                    {
                      backgroundColor: selected ? colors.soft : colors.cardAlt,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={[s.categoryCheck, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}>
                    {selected && <Ionicons name="checkmark" size={15} color="white" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.categoryProductName, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
                    <Text style={[s.categoryProductMeta, { color: colors.muted }]} numberOfLines={1}>{product.brand} · {product.status}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={s.categoryActions}>
            {categorySheet?.mode === 'edit' && (
              <Pressable onPress={removeCategory} style={[s.categoryDelete, { backgroundColor: isDark ? '#3A1A1A' : '#FFE9EC' }]}>
                <Text style={s.categoryDeleteText}>Delete</Text>
              </Pressable>
            )}
            <Pressable
              onPress={saveCategory}
              disabled={!categoryName.trim()}
              style={[
                s.categorySave,
                { backgroundColor: categoryName.trim() ? colors.primary : colors.border, flex: 1 },
              ]}
            >
              <Text style={s.categorySaveText}>{categorySheet?.mode === 'edit' ? 'Save category' : 'Create category'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Delete confirm modal */}
      <Modal visible={pendingDeleteId !== null} transparent animationType="fade" onRequestClose={closeDeletePrompt}>
        <View style={s.deleteBackdrop}>
          <View style={[s.deletePrompt, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.deleteIcon, { backgroundColor: isDark ? '#3A1A1F' : '#FFE9EC' }]}>
              <Ionicons name="trash-outline" size={23} color="#FF5A62" />
            </View>
            <Text style={[s.deleteTitle, { color: colors.text }]}>Are you sure you want to delete?</Text>
            <Text style={[s.deleteText, { color: colors.muted }]}>
              You will lose all your files and information about {pendingDeleteProduct?.name || 'this product'}.
            </Text>
            <Pressable onPress={confirmDelete} style={s.deletePrimary}>
              <Text style={s.deletePrimaryText}>Delete product</Text>
            </Pressable>
            <Pressable onPress={closeDeletePrompt} style={[s.deleteSecondary, { backgroundColor: colors.soft }]}>
              <Text style={[s.deleteSecondaryText, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Expiry breakdown bottom sheet */}
      <ExpiryModal product={expiryModal} onClose={() => setExpiryModal(null)} colors={colors} isDark={isDark} />
    </View>
  );
}

const s = StyleSheet.create({
  page:           { flex: 1 },
  listArea:       { position: 'relative' },
  shakeExitLayer: { ...StyleSheet.absoluteFill, zIndex: 4 },

  // Product categories
  categoryShelf:  { marginHorizontal: -2 },
  categoryRail:   { gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  categoryChip:   { minHeight: 38, borderRadius: 19, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  featuredCategoryChip:{ maxWidth: 190 },
  categoryChipText: { fontSize: 13, lineHeight: 17, fontWeight: '500', fontFamily: F.i500 },
  categoryChipCount:{ fontSize: 11, lineHeight: 14, fontWeight: '500', fontFamily: F.i500 },
  categoryPencil: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: -5 },
  pickerBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.16)' },
  categoryPicker: { position: 'absolute', left: 18, right: 18, borderRadius: 22, borderWidth: 1, padding: 12, shadowColor: '#000', shadowOpacity: .13, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  categoryPickerHead:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingLeft: 4 },
  categoryPickerTitle:{ fontSize: 18, lineHeight: 23, fontWeight: '900', fontFamily: F.n900 },
  categoryPickRow:{ minHeight: 58, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryPickName:{ fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
  categoryPickMeta:{ fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2, fontFamily: F.i700 },
  categoryPickerEdit:{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  categorySheet:  { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 28 },
  categorySheetHead:{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  categoryClose:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  categoryInput:  { minHeight: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, lineHeight: 20, fontWeight: '800', marginBottom: 12, fontFamily: F.n800 },
  categoryProductList:{ maxHeight: 310 },
  categoryProductRow:{ minHeight: 64, borderRadius: 17, borderWidth: 1, padding: 11, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  categoryCheck:  { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  categoryProductName:{ fontSize: 14, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  categoryProductMeta:{ fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2, fontFamily: F.i700 },
  categoryActions:{ flexDirection: 'row', gap: 10, paddingTop: 12 },
  categoryDelete: { minHeight: 48, borderRadius: 16, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' },
  categoryDeleteText:{ color: '#FF5A62', fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
  categorySave:   { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  categorySaveText:{ color: 'white', fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  demoNotice: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  demoIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  demoTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  demoText: { fontSize: 12, lineHeight: 17, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  demoPill: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: .4, fontFamily: F.n900 },

  // Card
  card:           { backgroundColor: '#F8F7FF', borderWidth: 1, borderColor: '#EEEAFE' },
  cardEditing:    { borderColor: '#D8D0FF', zIndex: 8 },
  deleteControl:  { position: 'absolute', left: -7, top: -7, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5A62', zIndex: 8, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  cardEditControl:{ position: 'absolute', right: -7, top: -7, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 8, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },

  // Full card — original layout
  top:            { flexDirection: 'row', justifyContent: 'space-between' },
  statusBrush:    { alignItems: 'center', justifyContent: 'flex-start', overflow: 'visible', position: 'relative' },
  sbBase:         { position: 'absolute', left: 1, right: 0, top: 6, bottom: 5, opacity: .95 },
  sbTop:          { position: 'absolute', left: -4, right: -6, top: 2, height: '38%', borderTopLeftRadius: 22, opacity: .9 },
  sbBottom:       { position: 'absolute', left: -1, right: -4, bottom: 3, height: '52%', borderBottomLeftRadius: 3, opacity: .9 },
  sbLeft:         { position: 'absolute', left: -8, width: 19, top: 6, bottom: 7, borderTopLeftRadius: 18, borderBottomLeftRadius: 5, opacity: .92 },
  sbCutTop:       { position: 'absolute', right: -5, top: 8, width: '35%', height: 2, backgroundColor: '#F8F7FF', opacity: .72 },
  sbCutBottom:    { position: 'absolute', right: 6, bottom: 10, width: '46%', height: 2, backgroundColor: '#F8F7FF', opacity: .58 },
  sbTextBand:     { alignItems: 'center', justifyContent: 'center' },
  sbText:         { fontWeight: '800', fontFamily: F.n800 },
  sbRingBand:     { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  warrantyRing:   { alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .045, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  name:           { fontWeight: '900', fontFamily: F.n900 },
  brand:          { fontWeight: '700', fontFamily: F.n700 },

  // Expiry row (with inline minimize button)
  expiryLine:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  expiryLeft:     { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' },
  meta:           { fontWeight: '700', fontFamily: F.n700 },
  multiDot:       { width: 6, height: 6, borderRadius: 3 },
  multiLabel:     { fontWeight: '800', fontFamily: F.n800 },
  minimizeBtn:    { alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },

  // Reminder
  reminderRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reminderText:   { fontWeight: '500', fontFamily: F.i500 },

  // Section links
  links:          { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  link:           { borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  linkText:       { fontWeight: '800', textAlign: 'center', fontFamily: F.n800 },

  // Minimized layout
  miniRoot:       { flexDirection: 'column', gap: 5 },
  miniNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBottomRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniDot:        { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  miniName:       { fontWeight: '900', flex: 1, fontFamily: F.n900 },
  miniExpiryRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  miniExpiry:     { fontWeight: '700', fontFamily: F.n700 },
  miniRight:      { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  miniSectionBtn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  // Empty state
  empty:          { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  emptyTitle:     { fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  emptyText:      { textAlign: 'center' },

  // Delete modal
  deleteBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  deletePrompt:   { width: '100%', maxWidth: 320, borderRadius: 22, borderWidth: 1, padding: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: .13, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  deleteIcon:     { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  deleteTitle:    { fontSize: 20, lineHeight: 25, fontWeight: '900', textAlign: 'center', fontFamily: F.n900 },
  deleteText:     { fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 7, marginBottom: 16, fontFamily: F.i700 },
  deletePrimary:  { width: '100%', minHeight: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5A62' },
  deletePrimaryText: { color: 'white', fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  deleteSecondary:{ width: '100%', minHeight: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  deleteSecondaryText: { fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },

  // Expiry breakdown bottom sheet
  modalBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 22, paddingBottom: 36, maxHeight: '80%' },
  modalHandle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  modalTitle:     { fontSize: 22, fontWeight: '900', marginBottom: 4, fontFamily: F.n900 },
  modalSub:       { fontSize: 13, fontWeight: '700', marginBottom: 18, fontFamily: F.i700 },
  modalRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  modalDot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  modalRowLabel:  { fontSize: 15, fontWeight: '900', fontFamily: F.n900 },
  modalRowDate:   { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  modalRowDays:   { fontSize: 11, fontWeight: '800', marginTop: 2, fontFamily: F.n800 },
  modalClose:     { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  modalCloseText: { color: 'white', fontSize: 16, fontWeight: '900', fontFamily: F.n900 },
});
