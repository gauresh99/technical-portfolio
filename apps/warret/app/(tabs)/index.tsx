import { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header, Pill, purple } from '../../src/components/ui';
import { matchesProductSearch } from '../../src/data/products';
import { useProducts } from '../../src/store/products';
import { useGroups } from '../../src/store/groups';
import { useAppTheme } from '../../src/store/theme';
import { getUpcomingExpiries } from '../upcoming';
import { formatDisplayDate } from '../../src/components/DatePickerModal';
import { F } from '../../src/theme/fonts';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
function StatHighlight({
  label,
  count,
  color,
  fill,
  pageColor,
  labelStyle,
  countStyle,
}: {
  label: string;
  count: string;
  color: string;
  fill: string;
  pageColor: string;
  labelStyle: object;
  countStyle: object;
}) {
  return (
    <>
      <View style={s.statBrushLayer}>
        <View style={[s.statBrushBase, { backgroundColor: fill }]} />
        <View style={[s.statBrushLeft, { backgroundColor: fill }]} />
        <View style={[s.statBrushMiddle, { backgroundColor: fill }]} />
        <View style={[s.statBrushRight, { backgroundColor: fill }]} />
        <View style={[s.statBrushTopSmudge, { backgroundColor: fill }]} />
        <View style={[s.statBrushBottomSmudge, { backgroundColor: fill }]} />
        <View style={[s.statBrushCutLeft, { backgroundColor: pageColor }]} />
        <View style={[s.statBrushCutRight, { backgroundColor: pageColor }]} />
      </View>
      <Text style={[s.label, labelStyle, { color, textShadowColor: fill }]}>
        {label}
      </Text>
      <Text style={[s.num, countStyle, { color }]}>{`(${count})`}</Text>
    </>
  );
}

export default function Home() {
  const { width, height } = useWindowDimensions();
  const { products } = useProducts();
  const { groups } = useGroups();
  const { colors, isDark } = useAppTheme();
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const cs          = clamp(Math.min(width / 390, height / 844), 0.56, 1.08);
  const statPadding = clamp(width * 0.046, 16, 22);
  const statGap     = clamp(width * 0.012, 4, 6);
  const cardWidth   = (width - statPadding * 2 - statGap) / 2;

  // Main products = personal products + products from groups saved locally
  const mergedGroupProductIds = useMemo(
    () => new Set(groups.flatMap((g) => g.products.filter((gp) => g.mergeAllToMain || gp.mergedToMain).map((gp) => gp.productId))),
    [groups],
  );
  const mainProducts = useMemo(
    () => products.filter((p) => p.personal !== false && (!p.groupId || mergedGroupProductIds.has(p.id))),
    [products, mergedGroupProductIds],
  );

  const summaryStats = useMemo(() => [
    { count: String(mainProducts.length),                                               label: 'Total',    status: undefined,   color: isDark ? '#8880C8' : '#6F63F3', fill: isDark ? '#2E2A4A' : '#756BEE', bg: isDark ? '#2E2A4A' : '#F0EEFF' },
    { count: String(mainProducts.filter((p) => p.status === 'Active').length),          label: 'Active',   status: 'active',    color: isDark ? '#3D9B68' : '#24935A', fill: isDark ? '#1A3A29' : '#4FA970', bg: isDark ? '#1A3A29' : '#EAFBF1' },
    { count: String(mainProducts.filter((p) => p.status === 'Expiring soon').length),   label: 'Expiring', status: 'expiring',  color: isDark ? '#B8822A' : '#C8751B', fill: isDark ? '#3A2A10' : '#D68B35', bg: isDark ? '#3A2A10' : '#FFF4DA' },
    { count: String(mainProducts.filter((p) => p.status === 'Expired').length),         label: 'Expired',  status: 'expired',   color: isDark ? '#B85555' : '#D83A41', fill: isDark ? '#3A1A1A' : '#DE5F65', bg: isDark ? '#3A1A1A' : '#FFECEC' },
  ], [mainProducts, isDark]);

  const widgetSizing = useMemo(() => ({
    card: {
      height:          clamp(cardWidth * 0.56 * cs, 58, 132),
      borderRadius:    clamp(cardWidth * 0.13 * cs, 12, 26),
      paddingHorizontal: clamp(cardWidth * 0.1 * cs, 8, 24),
      paddingVertical: clamp(cardWidth * 0.08 * cs, 7, 18),
    },
    label: {
      fontSize:   clamp(cardWidth * 0.155 * cs, 16, 31),
      lineHeight: clamp(cardWidth * 0.19 * cs, 20, 37),
    },
    num: {
      left:       clamp(cardWidth * 0.075 * cs, 6, 18),
      bottom:     clamp(cardWidth * 0.045 * cs, 3, 10),
      fontSize:   clamp(cardWidth * 0.09 * cs, 10, 20),
      lineHeight: clamp(cardWidth * 0.12 * cs, 13, 24),
    },
  }), [cardWidth, cs]);

  const addButtonSize = clamp(width * 0.27 * cs, 56, 118);
  const addIconSize   = clamp(addButtonSize * 0.53, 30, 62);

  // Upcoming expiry toolbar (uses all products including non-merged group products)
  const upcoming     = useMemo(() => getUpcomingExpiries(products, 10), [products]);
  const nextExpiry   = upcoming[0] ?? null;
  const toolbarPadH  = clamp(width * 0.028, 10, 14);
  const toolbarPadV  = clamp(height * 0.011, 8, 12);

  const searchResults = useMemo(
    () => query ? mainProducts.filter((p) => matchesProductSearch(p, query)).slice(0, 12) : [],
    [query, mainProducts],
  );
  const submitSearch = () => {
    if (query) router.push({ pathname: '/products', params: { q: query } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <Header
        title="Warret"
        sub="Your Digital Vault"
        plus={() => router.push({ pathname: '/add', params: { from: '/' } })}
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={submitSearch}
        onSearchCancel={() => setSearch('')}
      />

      {query ? (
        <ScrollView style={[s.searchPage, { backgroundColor: colors.page }]} contentContainerStyle={s.searchContent}>
          {searchResults.length ? (
            searchResults.map((product) => (
              <Pressable key={product.id} onPress={() => router.push(`/product/${product.id}`)} style={[s.resultRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.resultIcon, { backgroundColor: colors.soft }]}>
                  <Ionicons name="cube-outline" size={20} color={colors.primary} />
                </View>
                <View style={s.resultText}>
                  <Text style={[s.resultName, { color: colors.text }]}>{product.name}</Text>
                  <Text style={[s.resultBrand, { color: colors.muted }]}>{product.brand}</Text>
                </View>
                <Pill text={product.status} />
              </Pressable>
            ))
          ) : (
            <View style={s.noResults}>
              <Text style={[s.noResultsTitle, { color: colors.text }]}>No products found</Text>
              <Text style={[s.noResultsText, { color: colors.muted }]}>Try another name or brand.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1, backgroundColor: colors.page }} contentContainerStyle={{ flexGrow: 1 }}>
          {/* Stat cards */}
          <View style={[s.stats, { gap: statGap, paddingHorizontal: statPadding, paddingTop: clamp(height * 0.026, 8, 28) }]}>
            {summaryStats.map((item) => (
              <Pressable
                key={item.label}
                onPress={() => item.status ? router.push({ pathname: '/products', params: { status: item.status } }) : router.push('/products')}
                style={[s.statCard, widgetSizing.card, { width: cardWidth }]}
              >
                <StatHighlight
                  label={item.label}
                  count={item.count}
                  color={item.color}
                  fill={item.bg}
                  pageColor={colors.page}
                  labelStyle={widgetSizing.label}
                  countStyle={widgetSizing.num}
                />
              </Pressable>
            ))}
          </View>

          {/* ── Upcoming expiry toolbar ─────────────────────────────────────── */}
          {nextExpiry && (() => {
            const daysLeft = nextExpiry.daysLeft;
            const daysStr  = daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d left`;
            return (
              <Pressable
                onPress={() => router.push('/upcoming')}
                style={[s.toolbar, {
                  marginHorizontal: statPadding,
                  marginTop: clamp(height * 0.015, 8, 14),
                  borderRadius: clamp(width * 0.03 * cs, 10, 14),
                  paddingHorizontal: toolbarPadH,
                  paddingVertical: toolbarPadV,
                }]}
              >
                <View style={[s.toolbarBar, { backgroundColor: colors.primary }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.toolbarLabel, { fontSize: clamp(width * 0.026 * cs, 8, 11), color: colors.muted }]}>
                    UPCOMING EXPIRY
                  </Text>
                  <Text style={[s.toolbarText, { fontSize: clamp(width * 0.038 * cs, 12, 15), color: colors.text }]} numberOfLines={1}>
                    {nextExpiry.productName}
                    {nextExpiry.label !== 'Warranty' ? ` · ${nextExpiry.label}` : ''}
                    {' '}expiring on {formatDisplayDate(nextExpiry.expiry)}
                  </Text>
                </View>
                <View style={s.daysPill}>
                  <Text style={[s.daysText, { color: colors.text, fontSize: clamp(width * 0.028 * cs, 9, 12) }]}>{daysStr}</Text>
                </View>
                <View style={s.toolbarChevron}>
                  <Ionicons name="chevron-forward" size={clamp(15 * cs, 11, 17)} color={colors.text} />
                </View>
              </Pressable>
            );
          })()}

          {/* ── Add product section ─────────────────────────────────────────── */}
          <View style={[s.addWrap, {
            paddingTop: clamp(height * 0.05, 16, 40),
            paddingBottom: clamp(height * 0.025, 12, 36),
          }]}>
            <Pressable onPress={() => router.push({ pathname: '/add', params: { from: '/' } })} style={[s.bigPlus, {
              width: addButtonSize, height: addButtonSize, borderRadius: addButtonSize / 2,
              backgroundColor: colors.primary,
            }]}>
              <Ionicons name="add" size={addIconSize} color="white" />
            </Pressable>
            <Text style={[s.addText, {
              fontSize: clamp(width * 0.066 * cs, 16, 28),
              lineHeight: clamp(width * 0.078 * cs, 20, 34),
              marginTop: clamp(height * 0.014, 6, 20),
              color: colors.text,
            }]}>
              Add a Product
            </Text>
            <Text style={[s.help, {
              fontSize: clamp(width * 0.04 * cs, 11, 17),
              lineHeight: clamp(width * 0.05 * cs, 14, 22),
              marginTop: clamp(height * 0.006, 3, 8),
              color: colors.muted,
            }]}>
              Upload all product documents
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  searchPage:    { flex: 1 },
  searchContent: { padding: 22, paddingBottom: 120 },
  resultRow:     { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 12, borderRadius: 22, borderWidth: 1 },
  resultIcon:    { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  resultText:    { flex: 1 },
  resultName:    { fontSize: 17, fontFamily: F.n900, fontWeight: '900' },
  resultBrand:   { fontSize: 14, fontFamily: F.i500, fontWeight: '500', marginTop: 3 },
  noResults:     { padding: 14 },
  noResultsTitle:{ fontSize: 17, fontFamily: F.n900, fontWeight: '900' },
  noResultsText: { fontSize: 14, marginTop: 4 },

  stats:    { flexDirection: 'row', flexWrap: 'wrap' },
  statCard: { justifyContent: 'center', position: 'relative', overflow: 'visible' },
  statBrushLayer: { ...StyleSheet.absoluteFill, overflow: 'visible' },
  statBrushBase: { position: 'absolute', left: 7, right: 7, top: -3, bottom: -3, opacity: .78, borderRadius: 5 },
  statBrushLeft: { position: 'absolute', left: -5, width: '34%', top: -7, bottom: -8, borderTopLeftRadius: 24, borderBottomLeftRadius: 8, opacity: .88 },
  statBrushMiddle: { position: 'absolute', left: '27%', width: '42%', top: -10, bottom: -4, opacity: .78 },
  statBrushRight: { position: 'absolute', right: -7, width: '36%', top: -5, bottom: -10, borderTopRightRadius: 7, borderBottomRightRadius: 22, opacity: .82 },
  statBrushTopSmudge: { position: 'absolute', left: 6, right: 10, top: -6, height: 15, borderRadius: 12, opacity: .55 },
  statBrushBottomSmudge: { position: 'absolute', left: 12, right: 3, bottom: -7, height: 17, borderRadius: 12, opacity: .48 },
  statBrushCutLeft: { position: 'absolute', left: 10, top: 7, width: 2, height: '40%', opacity: .48 },
  statBrushCutRight: { position: 'absolute', right: 16, bottom: 11, width: 2, height: '42%', opacity: .38 },
  num:      { position: 'absolute', fontFamily: F.n900, fontWeight: '800', opacity: .72, textShadowColor: 'rgba(255,255,255,.45)', textShadowOffset: { width: 0, height: .7 }, textShadowRadius: .9 },
  label:    { alignSelf: 'stretch', textAlign: 'center', marginBottom: 12, fontFamily: F.n700, fontWeight: '700', letterSpacing: 0.1, textShadowOffset: { width: 0, height: .4 }, textShadowRadius: .7 },

  // Upcoming toolbar
  toolbar:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolbarBar:    { width: 4, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0 },
  toolbarLabel:  { fontFamily: F.n900, fontWeight: '900', letterSpacing: 0.4, marginBottom: 2 },
  toolbarText:   { fontFamily: F.n800, fontWeight: '800', lineHeight: 21 },
  toolbarChevron:{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  daysPill:      { paddingHorizontal: 4, paddingVertical: 2, flexShrink: 0 },
  daysText:      { fontFamily: F.n900, fontWeight: '900' },

  // Add section
  addWrap:  { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  bigPlus:  { alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  addText:  { fontFamily: F.n800, fontWeight: '800' },
  help:     { fontFamily: F.i500, fontWeight: '500' },
});
