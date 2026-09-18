import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as StoreReview from 'expo-store-review';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { purple } from '../../src/components/ui';
import { useProducts } from '../../src/store/products';
import { useEditGuard } from '../../src/store/editGuard';
import { useAppTheme } from '../../src/store/theme';
import { useAuth } from '../../src/store/auth';
import { deleteAccount, resetPassword } from '../../src/services/supabase-auth';
import { NotificationService } from '../../src/services/notifications';
import { StorageService } from '../../src/services/storage';
import { BackupService } from '../../src/services/backup';
import type { CloudBackupMeta, RestoreSummary } from '../../src/services/backup';
import { DataExportService } from '../../src/services/dataExport';
import { EmailImportService, isProviderConfigured, ReconnectNeededError } from '../../src/services/emailImport';
import type { EmailCandidate, EmailProvider } from '../../src/services/emailImport';
import { FileStorageService } from '../../src/services/fileStorage';
import { isSupabaseConfigured } from '../../src/lib/supabase';
import type { ColorTheme, ThemeMode } from '../../src/store/theme';
import { F } from '../../src/theme/fonts';

const lightCard = '#F5F5F8';
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const baseExportCalendarDates = ['2026-06-20', '2026-06-27', '2026-07-05', '2026-07-18', '2026-08-01'];
const IOS_APP_STORE_ID = 'XXXXXXXX';
const ANDROID_PACKAGE_NAME = 'com.warret.app';
const getStorage = () => {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
};

type SettingsPage = 'profile' | 'reminders' | 'backup' | 'export' | 'privacy' | 'appearance' | 'notifications' | 'storage' | 'help';

type SettingsState = {
  name: string;
  email: string;
  photoUri: string;
  accountType: 'Free' | 'Pro';
  remindersEnabled: boolean;
  notificationChannel: 'Push notification' | 'Email' | 'Both';
  quietStart: string;
  quietEnd: string;
  backupProvider: 'iCloud' | 'Google Drive' | 'Dropbox';
  autoBackup: boolean;
  backupFrequency: 'Daily' | 'Weekly' | 'Monthly';
  exportFormat: 'PDF' | 'CSV' | 'JSON';
  exportScope: string;
  exportCategoryId: string;
  exportStartDate: string;
  exportEndDate: string;
  includeAttachments: boolean;
  exportDelivery: 'Download to device' | 'Send to email';
  scheduledExports: boolean;
  exportFrequency: 'Monthly' | 'Quarterly' | '6 months' | 'Custom';
  customExportDates: string[];
  analytics: boolean;
  personalisation: boolean;
  ocrRetention: string;
  emailAccounts: Array<{ provider: string; email: string; enabled: boolean; lastSync: string }>;
  theme: ThemeMode;
  colorTheme: ColorTheme;
  customColor: string;
  compactDensity: boolean;
  appIcon: string;
  notificationTypes: Record<string, { push: boolean; email: boolean }>;
  scanLearning: boolean;
  localOnly: boolean;
};

const defaultSettings: SettingsState = {
  name: 'Gauresh Maheshwary',
  email: 'gauresh@example.com',
  photoUri: '',
  accountType: 'Free',
  remindersEnabled: true,
  notificationChannel: 'Both',
  quietStart: '10 PM',
  quietEnd: '8 AM',
  backupProvider: 'iCloud',
  autoBackup: false,
  backupFrequency: 'Weekly',
  exportFormat: 'PDF',
  exportScope: 'All products',
  exportCategoryId: '',
  exportStartDate: '2026-01-01',
  exportEndDate: '2026-12-31',
  includeAttachments: true,
  exportDelivery: 'Download to device',
  scheduledExports: false,
  exportFrequency: 'Monthly',
  customExportDates: ['2026-06-20', '2026-07-05'],
  analytics: true,
  personalisation: true,
  ocrRetention: 'Delete scans after processing',
  emailAccounts: [],
  theme: 'System default',
  colorTheme: 'Classic Purple',
  customColor: '#5B4DF0',
  compactDensity: false,
  appIcon: 'Classic',
  notificationTypes: {
    'Expiry alerts':      { push: true,  email: true  },
    'Group notifications':{ push: true,  email: false },
    'Backup reminders':   { push: false, email: true  },
    'App updates':        { push: true,  email: false },
    'Tips & tricks':      { push: false, email: false },
  },
  scanLearning: false,
  localOnly: false,
};

const rows: Array<{ id: SettingsPage; title: string; sub: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'profile', title: 'Profile', sub: 'Name, email, password and account details', icon: 'person-circle-outline' },
  { id: 'reminders', title: 'Expiry reminders', sub: 'Channels, quiet hours and test alerts', icon: 'notifications-outline' },
  { id: 'backup', title: 'Cloud backup', sub: 'Sync warranty files and product data', icon: 'cloud-upload-outline' },
  { id: 'export', title: 'Export all data', sub: 'Download, email or schedule exports', icon: 'download-outline' },
  { id: 'privacy', title: 'Privacy & data', sub: 'Email imports, scans and deletion', icon: 'lock-closed-outline' },
  { id: 'appearance', title: 'Appearance', sub: 'Themes, app icon and display density', icon: 'sunny-outline' },
  { id: 'notifications', title: 'Notifications', sub: 'Manage all app notification types', icon: 'notifications-circle-outline' },
  { id: 'storage', title: 'Storage & cache', sub: 'Manage local storage', icon: 'server-outline' },
  { id: 'help', title: 'Help & About', sub: 'FAQs, contact, feedback and changelog', icon: 'help-circle-outline' },
];

type SettingsSearchItem = {
  page: SettingsPage;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  terms: string;
};

const searchItems: SettingsSearchItem[] = [
  ...rows.map((row) => ({ page: row.id, title: row.title, sub: row.sub, icon: row.icon, terms: `${row.title} ${row.sub}` })),
  { page: 'profile', title: 'Password', sub: 'Profile · Edit password or reset link', icon: 'key-outline', terms: 'password edit password reset forgot login account credentials google signed in' },
  { page: 'profile', title: 'Account details', sub: 'Profile · Name, email and photo', icon: 'person-outline', terms: 'account details profile name email photo avatar user' },
  { page: 'reminders', title: 'Quiet hours', sub: 'Expiry reminders · Choose reminder time window', icon: 'moon-outline', terms: 'quiet hours time timer reminder schedule from until clock' },
  { page: 'reminders', title: 'Notification channel', sub: 'Expiry reminders · Push, email or both', icon: 'notifications-outline', terms: 'notification channel push email both expiry reminder alerts' },
  { page: 'backup', title: 'Backup provider', sub: 'Cloud backup · iCloud, Google Drive or Dropbox', icon: 'cloud-outline', terms: 'backup provider icloud google drive dropbox sync cloud files' },
  { page: 'export', title: 'Scheduled exports', sub: 'Export all data · Monthly, quarterly, custom dates', icon: 'calendar-outline', terms: 'scheduled exports export monthly quarterly 6 months custom calendar dates download csv pdf json' },
  { page: 'privacy', title: 'Delete account', sub: 'Privacy & data · Remove account or warranty records', icon: 'trash-outline', terms: 'delete account records warranty privacy data remove erase danger' },
  { page: 'privacy', title: 'Privacy policy', sub: 'Privacy & data · Legal privacy document', icon: 'document-lock-outline', terms: 'privacy policy terms legal data permissions' },
  { page: 'appearance', title: 'Theme colour', sub: 'Appearance · Classic purple, soft rose or custom colour', icon: 'color-palette-outline', terms: 'theme colour color appearance custom purple rose dark light mode' },
  { page: 'notifications', title: 'Group notifications', sub: 'Notifications · Push and email controls', icon: 'people-outline', terms: 'group notifications push email members activity alerts' },
  { page: 'storage', title: 'Clear cache', sub: 'Storage & cache · Clear images and re-download attachments', icon: 'server-outline', terms: 'storage cache clear image local download attachments memory' },
  { page: 'help', title: 'Contact support', sub: 'Help & About · FAQs, support and app rating', icon: 'help-buoy-outline', terms: 'help support contact faq rate app whats new changelog' },
];

const presetThemeColors: Record<Exclude<ColorTheme, 'Custom'>, string> = {
  'Classic Purple': '#5B4DF0',
  'Soft Rose': '#D94E83',
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatIso(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB');
}

function parseTimeValue(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return { hour: 9, minute: 0, period: 'AM' as 'AM' | 'PM' };
  return {
    hour: clamp(Number(match[1]) || 9, 1, 12),
    minute: clamp(Number(match[2] || 0), 0, 59),
    period: match[3].toUpperCase() as 'AM' | 'PM',
  };
}

function formatTimeValue(hour: number, minute: number, period: 'AM' | 'PM') {
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
}

function isValidHex(hex: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

// Web-only native color input
function NativeColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const ref = useRef<any>(null);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        onPress={() => ref.current?.click?.()}
        style={[s.colorSwatch, { backgroundColor: value, width: 48, height: 48 }]}
      />
      {/* @ts-ignore — web-only */}
      <input
        ref={ref}
        type="color"
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: 1, height: 1, border: 'none', padding: 0 }}
      />
    </View>
  );
}

function ToggleRow({ label, sub, value, onValueChange, disabled }: { label: string; sub?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[s.switchRow, { borderColor: colors.border }, disabled && { opacity: 0.55 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.switchLabel, { color: colors.text }]}>{label}</Text>
        {sub ? <Text style={[s.switchSub, { color: colors.muted }]}>{sub}</Text> : null}
      </View>
      <Switch disabled={disabled} value={value} onValueChange={onValueChange} trackColor={{ false: '#E4E1EC', true: '#C8C0FF' }} thumbColor={value ? purple : 'white'} />
    </View>
  );
}

function Chip({ text, active, onPress, disabled }: { text: string; active?: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[s.chip, { backgroundColor: active ? colors.primary : colors.input, borderColor: active ? colors.primary : colors.border }, disabled && { opacity: 0.5 }]}>
      <Text style={[s.chipText, { color: active ? 'white' : colors.primary }]}>{text}</Text>
    </Pressable>
  );
}

function CheckRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} style={s.checkLine}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.primary : colors.muted} />
      <Text style={[s.checkText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const hourOptions = Array.from({ length: 12 }, (_, idx) => String(idx + 1));
const minuteOptions = Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0'));
const periodOptions: Array<'AM' | 'PM'> = ['AM', 'PM'];
const timeWheelItemHeight = 42;

function TimeWheel({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(parseTimeValue(value));

  useEffect(() => {
    setDraft(parseTimeValue(value));
  }, [value]);

  const setPart = (patch: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const selectedTime = formatTimeValue(draft.hour, draft.minute, draft.period);

  return (
    <View style={[s.timeWheel, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <View style={s.timeWheelColumns}>
        <View pointerEvents="none" style={[s.timeWheelSelection, { backgroundColor: colors.soft, borderColor: colors.border }]} />
        <TimeWheelColumn label="Hour" options={hourOptions} value={String(draft.hour)} onChange={(hour) => setPart({ hour: Number(hour) })} />
        <TimeWheelColumn label="Min" options={minuteOptions} value={String(draft.minute).padStart(2, '0')} onChange={(minute) => setPart({ minute: Number(minute) })} />
        <TimeWheelColumn label="AM/PM" options={periodOptions} value={draft.period} onChange={(period) => setPart({ period: period as 'AM' | 'PM' })} />
      </View>
      <Pressable onPress={() => onSave(selectedTime)} style={[s.timeWheelSave, { backgroundColor: colors.primary }]}>
        <Text style={s.timeWheelSaveText}>Save</Text>
      </Pressable>
    </View>
  );
}

function TimeWheelColumn({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const interactingRef = useRef(false);
  const selectedIndex = Math.max(0, options.indexOf(value));
  const [currentIndex, setCurrentIndex] = useState(selectedIndex);

  useEffect(() => {
    setCurrentIndex(selectedIndex);
    if (!interactingRef.current) {
      scrollRef.current?.scrollTo({ y: selectedIndex * timeWheelItemHeight, animated: false });
    }
  }, [selectedIndex]);

  const nearestIndex = (y: number) => clamp(Math.round(y / timeWheelItemHeight), 0, options.length - 1);
  const trackSelection = (y: number) => {
    const index = nearestIndex(y);
    setCurrentIndex((current) => {
      if (current === index) return current;
      onChange(options[index]);
      return index;
    });
  };
  const settle = (y: number) => {
    const index = nearestIndex(y);
    interactingRef.current = false;
    setCurrentIndex(index);
    onChange(options[index]);
    scrollRef.current?.scrollTo({ y: index * timeWheelItemHeight, animated: true });
  };

  return (
    <View style={s.timeWheelColumn}>
      <Text style={s.timeWheelLabel}>{label}</Text>
      <View style={s.timeWheelWindow}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={timeWheelItemHeight}
          decelerationRate="fast"
          scrollEventThrottle={16}
          contentContainerStyle={s.timeWheelScrollContent}
          onScrollBeginDrag={() => {
            interactingRef.current = true;
          }}
          onScroll={(event) => trackSelection(event.nativeEvent.contentOffset.y)}
          onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.y)}
          onScrollEndDrag={(event) => settle(event.nativeEvent.contentOffset.y)}
        >
          {options.map((option, index) => {
            const active = index === currentIndex;
            return (
              <View key={option} style={[s.timeWheelOption, { height: timeWheelItemHeight }]}>
                <Text style={[s.timeWheelValueText, active ? [s.timeWheelValueActive, { color: colors.primary }] : s.timeWheelValueMuted]}>{option}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={[s.panel, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      {title ? <Text style={[s.panelTitle, { color: colors.text }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

export default function Settings() {
  const { width, height } = useWindowDimensions();
  const { colors, isDark, setAppearance } = useAppTheme();
  const { products, productCategories, reloadFromStorage, deleteAllProducts } = useProducts();
  const { setHasDirtyEdit, setBeforeSave, setBeforeDiscard } = useEditGuard();
  const { logout, user, updateUser } = useAuth();

  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<SettingsState>(defaultSettings);
  const [page, setPage] = useState<SettingsPage | null>(null);
  const [toast, setToast] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupMeta[]>([]);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [danger, setDanger] = useState<null | 'records' | 'account'>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerError, setDangerError] = useState('');
  const [openFaq, setOpenFaq] = useState('How does smart warranty search work?');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [hexInput, setHexInput] = useState(defaultSettings.customColor);
  const [activeQuietTime, setActiveQuietTime] = useState<'start' | 'end'>('start');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetCooldown, setPasswordResetCooldown] = useState(0);
  const [settingsSearch, setSettingsSearch] = useState('');

  const scale = clamp(Math.min(width / 390, height / 844), 0.72, 1.08);
  const pagePadding = clamp(width * 0.06 * scale, 18, 28);
  const selectedRow = rows.find((row) => row.id === page);
  const toastBottom = height > 700 ? 84 : 96;

  const productStats = useMemo(() => {
    const docs = products.reduce((total, product) => total + product.docs.length, 0);
    const reminders = products.reduce((total, product) => total + (product.reminders?.length || 0), 0);
    return { products: products.length, docs, reminders };
  }, [products]);

  const expiryByDate = useMemo(() => products.reduce<Record<string, string[]>>((acc, product) => {
    acc[product.warrantyEnd] = [...(acc[product.warrantyEnd] || []), `${product.name} expires`];
    return acc;
  }, {}), [products]);

  const exportCalendarDates = useMemo(() => (
    [...new Set([...baseExportCalendarDates, ...settings.customExportDates, ...products.map((product) => product.warrantyEnd)])]
      .sort((a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime())
  ), [products, settings.customExportDates]);

  const hasPendingChanges = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const emailValid = isEmail(settings.email);
  const authProvider = user?.signupMethod || 'email';
  const isOAuthAccount = authProvider === 'google' || authProvider === 'apple';
  const settingsSearchQuery = settingsSearch.trim().toLowerCase();
  const settingsSearchResults = useMemo(() => {
    if (!settingsSearchQuery) return [];
    const words = settingsSearchQuery.split(/\s+/).filter(Boolean);
    return searchItems.filter((item) => {
      const haystack = `${item.title} ${item.sub} ${item.terms}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    }).slice(0, 12);
  }, [settingsSearchQuery]);

  const activePrimary = settings.colorTheme === 'Custom'
    ? settings.customColor
    : presetThemeColors[settings.colorTheme as Exclude<ColorTheme, 'Custom'>] || '#5B4DF0';

  const accountDefaults = useMemo<SettingsState>(() => ({
    ...defaultSettings,
    name: user?.name || defaultSettings.name,
    email: user?.email || defaultSettings.email,
    photoUri: user?.photoUri || '',
    accountType: user?.accountType === 'pro' ? 'Pro' : 'Free',
    emailAccounts: user?.email
      ? [{ provider: 'Warret account', email: user.email, enabled: true, lastSync: 'Connected' }]
      : defaultSettings.emailAccounts,
  }), [user]);

  useEffect(() => {
    if (!user?.id) return;
    setHydrated(false);
    StorageService.loadSettings<SettingsState>(user.id).then((saved) => {
      const userFields = {
        name: user.name || accountDefaults.name,
        email: user.email || accountDefaults.email,
        photoUri: user.photoUri || '',
        accountType: user.accountType === 'pro' ? 'Pro' as const : 'Free' as const,
      };
      if (saved) {
        const parsed = {
          ...accountDefaults,
          ...saved,
          ...userFields,
          notificationTypes: {
            ...defaultSettings.notificationTypes,
            ...(saved.notificationTypes || {}),
          },
        };
        setSettings(parsed);
        setSavedSettings(parsed);
        setHexInput(parsed.customColor || defaultSettings.customColor);
        setAppearance({ theme: parsed.theme, colorTheme: parsed.colorTheme, customColor: parsed.customColor });
      } else {
        setSettings(accountDefaults);
        setSavedSettings(accountDefaults);
        setHexInput(accountDefaults.customColor);
        setAppearance({ theme: accountDefaults.theme, colorTheme: accountDefaults.colorTheme, customColor: accountDefaults.customColor });
      }
      setHydrated(true);
    }).catch(() => setHydrated(true));
  }, [accountDefaults, setAppearance, user]);

  useEffect(() => {
    if (passwordResetCooldown <= 0) return;
    const timer = setInterval(() => {
      setPasswordResetCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [passwordResetCooldown]);

  const persistSave = (s: SettingsState) => {
    if (user?.id) StorageService.saveSettings(s, user.id).catch(() => {});
    updateUser({
      name: s.name,
      photoUri: s.photoUri,
      accountType: s.accountType.toLowerCase() as 'free' | 'pro',
    }).catch(() => {});
    setSavedSettings(s);
    setAppearance({ theme: s.theme, colorTheme: s.colorTheme, customColor: s.customColor });
  };

  const update = (patch: Partial<SettingsState>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    // Live-preview appearance changes
    if (patch.theme || patch.colorTheme || patch.customColor) {
      setAppearance({ theme: next.theme, colorTheme: next.colorTheme, customColor: next.customColor });
    }
  };

  useEffect(() => {
    const dirtySettingsPage = !!page && hasPendingChanges;
    setHasDirtyEdit(dirtySettingsPage);
    if (dirtySettingsPage) {
      setBeforeSave(() => {
        persistSave(settings);
      });
      setBeforeDiscard(() => {
        setSettings(savedSettings);
        setHexInput(savedSettings.customColor);
        setAppearance({ theme: savedSettings.theme, colorTheme: savedSettings.colorTheme, customColor: savedSettings.customColor });
      });
    } else {
      setBeforeSave(null);
      setBeforeDiscard(null);
    }
    return () => {
      setHasDirtyEdit(false);
      setBeforeSave(null);
      setBeforeDiscard(null);
    };
  }, [page, hasPendingChanges, settings, savedSettings, setAppearance, setBeforeDiscard, setBeforeSave, setHasDirtyEdit]);

  const handleBack = () => {
    if (hasPendingChanges) {
      setSavePromptOpen(true);
    } else {
      setPage(null);
    }
  };

  const handleSaveNow = () => {
    persistSave(settings);
    setSavePromptOpen(false);
    setPage(null);
    setToast('Settings saved.');
    setTimeout(() => setToast(''), 2200);
  };

  const handleCancelChanges = () => {
    setSettings(savedSettings);
    setHexInput(savedSettings.customColor);
    setAppearance({ theme: savedSettings.theme, colorTheme: savedSettings.colorTheme, customColor: savedSettings.customColor });
    setSavePromptOpen(false);
    setPage(null);
  };

  const runBusy = (label: string, message: string) => {
    setBusyAction(label);
    setToast('');
    setTimeout(() => {
      setBusyAction('');
      setToast(message);
      setTimeout(() => setToast(''), 2200);
    }, 900);
  };

  const flashToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const ownProducts = () =>
    user?.id ? products.filter((product) => !product.ownerId || product.ownerId === user.id) : products;

  const currentSnapshot = () => ({ products: ownProducts(), productCategories });

  const scopedExportProducts = () => {
    let scoped = ownProducts();
    if (settings.exportScope === 'By category') {
      const category = productCategories.find((item) => item.id === settings.exportCategoryId) || productCategories[0];
      scoped = category ? scoped.filter((product) => category.productIds.includes(product.id)) : [];
    }
    if (settings.exportScope === 'By date range') {
      const start = new Date(`${settings.exportStartDate}T00:00:00`).getTime();
      const end = new Date(`${settings.exportEndDate}T23:59:59`).getTime();
      if (Number.isFinite(start) && Number.isFinite(end)) {
        scoped = scoped.filter((product) => {
          const added = new Date(`${product.warrantyStart || product.warrantyEnd}T12:00:00`).getTime();
          return Number.isFinite(added) && added >= Math.min(start, end) && added <= Math.max(start, end);
        });
      }
    }
    return scoped;
  };

  const refreshSettingsFromStorage = async () => {
    if (!user?.id) return;
    const restored = await StorageService.loadSettings<SettingsState>(user.id);
    if (!restored) return;
    const next = {
      ...accountDefaults,
      ...restored,
      name: user.name || restored.name || accountDefaults.name,
      email: user.email || restored.email || accountDefaults.email,
      photoUri: user.photoUri || restored.photoUri || '',
      accountType: user.accountType === 'pro' ? 'Pro' as const : 'Free' as const,
      notificationTypes: {
        ...defaultSettings.notificationTypes,
        ...(restored.notificationTypes || {}),
      },
    };
    setSettings(next);
    setSavedSettings(next);
    setHexInput(next.customColor || defaultSettings.customColor);
    setAppearance({ theme: next.theme, colorTheme: next.colorTheme, customColor: next.customColor });
  };

  const handleBackupNow = async () => {
    if (busyAction === 'backup') return;
    setBusyAction('backup');
    setToast('');
    try {
      if (isSupabaseConfigured && user?.id) {
        await BackupService.backupToCloud(currentSnapshot(), user.id);
        flashToast('Secure cloud backup saved.');
      } else {
        const { fileName } = await BackupService.exportToFile(currentSnapshot(), user?.id);
        flashToast(`Backup file ready: ${fileName}`);
      }
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not create backup.');
    } finally {
      setBusyAction('');
    }
  };

  const handleExportBackupFile = async () => {
    if (busyAction === 'backup-file') return;
    setBusyAction('backup-file');
    try {
      const { fileName } = await BackupService.exportToFile(currentSnapshot(), user?.id);
      flashToast(`Backup file ready: ${fileName}`);
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not export backup file.');
    } finally {
      setBusyAction('');
    }
  };

  const handleExportData = async () => {
    if (busyAction === 'export') return;
    if (settings.exportDelivery === 'Send to email') {
      flashToast('Email delivery needs a server email provider. Use Download to device for now.');
      return;
    }
    setBusyAction('export');
    try {
      const exportedProducts = scopedExportProducts();
      if (settings.exportScope === 'By category' && productCategories.length === 0) {
        flashToast('Create a product category before exporting by category.');
        return;
      }
      const { fileName } = await DataExportService.exportData({
        products: exportedProducts,
        productCategories,
        format: settings.exportFormat,
        includeAttachments: settings.includeAttachments,
      });
      flashToast(`${settings.exportFormat} export ready: ${fileName} · ${exportedProducts.length} products`);
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not export data.');
    } finally {
      setBusyAction('');
    }
  };

  const handleClearCache = async () => {
    if (busyAction === 'cache') return;
    setBusyAction('cache');
    try {
      const result = await FileStorageService.clearTemporaryFiles();
      flashToast(result.deleted ? `Cleared ${result.deleted} temporary file${result.deleted === 1 ? '' : 's'}.` : 'No Warret temporary files to clear.');
    } catch {
      flashToast('Could not clear temporary files.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRefreshAttachments = async () => {
    if (busyAction === 'download') return;
    setBusyAction('download');
    try {
      const docs = products.flatMap((product) => (product.docEntries || product.docs.map((doc) => ({ label: doc, fileName: doc, expiry: '' }))).map((doc) => ({ product, doc })));
      let available = 0;
      for (const { product, doc } of docs) {
        const uri = await FileStorageService.resolveDocumentUri((doc as any).uri, product.id, doc.fileName).catch(() => null);
        if (uri) available += 1;
      }
      flashToast(docs.length ? `${available}/${docs.length} attachments are reachable.` : 'No attachments found yet.');
    } catch {
      flashToast('Could not check attachments.');
    } finally {
      setBusyAction('');
    }
  };

  const openRestoreModal = async () => {
    setRestoreOpen(true);
    setRestoreError('');
    setCloudBackups([]);
    if (!isSupabaseConfigured || !user?.id) return;
    setRestoreBusy(true);
    try {
      setCloudBackups(await BackupService.listCloudBackups());
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'Could not load cloud backups.');
    } finally {
      setRestoreBusy(false);
    }
  };

  const afterRestore = async (summary: RestoreSummary) => {
    await reloadFromStorage({ replaceServer: true });
    await refreshSettingsFromStorage();
    setRestoreOpen(false);
    flashToast(`Restored ${summary.products} products and ${summary.productCategories} categories.`);
  };

  const restoreCloudBackup = async (backupId: string) => {
    if (restoreBusy) return;
    setRestoreBusy(true);
    setRestoreError('');
    try {
      await afterRestore(await BackupService.restoreFromCloud(backupId, user?.id));
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'Could not restore that backup.');
    } finally {
      setRestoreBusy(false);
    }
  };

  const restoreBackupFile = async () => {
    if (restoreBusy) return;
    setRestoreBusy(true);
    setRestoreError('');
    try {
      const summary = await BackupService.importFromFile(user?.id);
      if (summary) await afterRestore(summary);
      else setRestoreOpen(false);
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'Could not restore that backup file.');
    } finally {
      setRestoreBusy(false);
    }
  };

  const handleRateApp = async () => {
    try {
      // Preferred: native in-app review sheet (StoreReview). Needs NO App Store
      // ID and works on both platforms — the OS shows its own rating prompt.
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
        return;
      }

      // Fallback: deep-link to the store listing if native review is unavailable.
      if (Platform.OS === 'ios') {
        if (IOS_APP_STORE_ID !== 'XXXXXXXX') {
          await Linking.openURL(`https://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`);
          return;
        }
        flashToast('In-app rating opens once the app is published.');
        return;
      }

      if (Platform.OS === 'android') {
        const marketUrl = `market://details?id=${ANDROID_PACKAGE_NAME}`;
        const webUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;
        const canOpenMarket = await Linking.canOpenURL(marketUrl);
        await Linking.openURL(canOpenMarket ? marketUrl : webUrl);
        return;
      }

      flashToast('Ratings open from the installed mobile app.');
    } catch {
      flashToast('Could not open the store. Please try again later.');
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email || passwordResetCooldown > 0 || passwordResetLoading) return;
    setPasswordResetLoading(true);
    const { error } = await resetPassword(user.email);
    setPasswordResetLoading(false);

    if (error === '__use_google__') {
      flashToast('This account signs in with Google.');
      return;
    }
    if (error === '__use_apple__') {
      flashToast('This account signs in with Apple.');
      return;
    }
    if (error) {
      flashToast(error.toLowerCase().includes('rate') ? 'Please wait before requesting another link.' : `Error: ${error}`);
      return;
    }

    setPasswordResetCooldown(60);
    flashToast('Password reset link sent to your email.');
  };

  const closeDanger = () => {
    setDanger(null);
    setDeleteConfirm('');
    setDangerError('');
  };

  const handleConfirmDelete = async () => {
    if (dangerLoading) return;
    setDangerError('');

    if (danger === 'records') {
      setDangerLoading(true);
      try {
        // Awaits the server delete — only reports success if it truly persisted.
        const ok = await deleteAllProducts();
        if (!ok) {
          setDangerError('Could not delete records. Check your connection and try again.');
          return;
        }
        closeDanger();
        flashToast('All warranty records deleted.');
      } catch {
        setDangerError('Could not delete records. Check your connection and try again.');
      } finally {
        setDangerLoading(false);
      }
      return;
    }

    if (danger === 'account') {
      if (deleteConfirm !== 'DELETE') return;
      setDangerLoading(true);
      try {
        const { error } = await deleteAccount();
        if (error) {
          // deleteAccount already returns friendly messages — don't double-prefix.
          setDangerError(error);
          return;
        }
        // Account deleted + signed out server-side; clear local auth state.
        closeDanger();
        await logout();
      } catch {
        setDangerError('Could not delete account. Check your connection and try again.');
      } finally {
        setDangerLoading(false);
      }
    }
  };

  const handleTestNotification = async () => {
    if (busyAction === 'test') return;
    if (!settings.remindersEnabled) {
      flashToast('Expiry reminders are turned off.');
      return;
    }
    if (settings.notificationChannel === 'Email') {
      flashToast('Push notifications are off. Email delivery needs the backend email provider.');
      return;
    }
    if (Platform.OS === 'web') {
      flashToast('Notifications are only available in the mobile app.');
      return;
    }
    setBusyAction('test');
    try {
      const granted = await NotificationService.requestPermissions();
      if (!granted) {
        flashToast('Enable notifications in system settings to test.');
        return;
      }
      const id = await NotificationService.sendTestNotification({
        enabled: settings.remindersEnabled,
        channel: settings.notificationChannel,
        quietStart: settings.quietStart,
        quietEnd: settings.quietEnd,
      });
      flashToast(id ? 'Test notification scheduled — arrives in 5 seconds.' : 'Could not send test notification.');
    } catch {
      flashToast('Could not send test notification.');
    } finally {
      setBusyAction('');
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) update({ photoUri: result.assets[0]?.uri || '' });
  };

  const connectEmailAccount = async (provider: EmailProvider) => {
    if (busyAction === `email-${provider}`) return;
    if (!isProviderConfigured(provider)) {
      flashToast(`${provider === 'gmail' ? 'Gmail' : 'Outlook'} OAuth client ID is not configured yet.`);
      return;
    }
    setBusyAction(`email-${provider}`);
    try {
      const connected = provider === 'gmail'
        ? await EmailImportService.connectGmail()
        : await EmailImportService.connectOutlook();
      const providerName = provider === 'gmail' ? 'Gmail' : 'Outlook';
      const nextAccount = { provider: providerName, email: connected.email, enabled: true, lastSync: 'Connected' };
      update({
        emailAccounts: [
          nextAccount,
          ...settings.emailAccounts.filter((account) => account.email !== connected.email),
        ],
      });
      flashToast(`${providerName} connected.`);
    } catch (error) {
      flashToast(error instanceof Error ? error.message : 'Could not connect email account.');
    } finally {
      setBusyAction('');
    }
  };

  const revokeEmailAccount = async (email: string, providerName: string) => {
    const provider = providerName.toLowerCase().includes('outlook') ? 'outlook' : providerName.toLowerCase().includes('gmail') ? 'gmail' : null;
    try {
      if (provider) await EmailImportService.disconnect(provider);
    } catch {}
    update({ emailAccounts: settings.emailAccounts.filter((account) => account.email !== email) });
    flashToast('Email access revoked.');
  };

  const scanEmailAccount = async (providerName: string) => {
    const provider = providerName.toLowerCase().includes('outlook') ? 'outlook' : providerName.toLowerCase().includes('gmail') ? 'gmail' : null;
    if (!provider) {
      flashToast('Only connected Gmail and Outlook inboxes can be scanned.');
      return;
    }
    setBusyAction(`scan-${provider}`);
    try {
      const found = await EmailImportService.scanInbox(provider as EmailProvider);
      flashToast(found.length ? `Found ${found.length} warranty email${found.length === 1 ? '' : 's'}.` : 'No warranty PDFs found in recent email.');
      update({
        emailAccounts: settings.emailAccounts.map((account) =>
          account.provider === providerName ? { ...account, lastSync: 'Just now' } : account,
        ),
      });
    } catch (error) {
      if (error instanceof ReconnectNeededError) flashToast(error.message);
      else flashToast(error instanceof Error ? error.message : 'Could not scan inbox.');
    } finally {
      setBusyAction('');
    }
  };

  const toggleEmailAccount = (email: string) => update({ emailAccounts: settings.emailAccounts.map((account) => account.email === email ? { ...account, enabled: !account.enabled } : account) });
  const toggleNotificationType = (label: string, channel: 'push' | 'email') => {
    update({ notificationTypes: { ...settings.notificationTypes, [label]: { ...settings.notificationTypes[label], [channel]: !settings.notificationTypes[label][channel] } } });
  };
  const toggleCustomExportDate = (date: string) => {
    const next = settings.customExportDates.includes(date) ? settings.customExportDates.filter((item) => item !== date) : [...settings.customExportDates, date];
    update({ customExportDates: next });
    setSelectedCalendarDate(date);
  };

  const renderAvatar = (size = 52) => settings.photoUri ? (
    <Image source={{ uri: settings.photoUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: activePrimary }]}>
      <Text style={s.avatarText}>{initials(settings.name)}</Text>
    </View>
  );

  const renderExportCalendar = () => (
    <View style={s.calendar}>
      <View style={s.calendarHeader}><Text style={[s.panelTitle, { color: colors.text }]}>Export calendar</Text><Text style={[s.note, { color: colors.muted }]}>Tap dates to schedule exports. Dots mark warranty expiries.</Text></View>
      <View style={s.calendarGrid}>
        {exportCalendarDates.map((date) => {
          const selected = settings.customExportDates.includes(date);
          const expiries = expiryByDate[date] || [];
          return (
            <Pressable key={date} onPress={() => toggleCustomExportDate(date)} style={[s.calendarDay, { backgroundColor: selected ? colors.primary : colors.input, borderColor: expiries.length > 0 ? colors.primary : colors.border }, selected && s.calendarDaySelected, expiries.length > 0 && s.calendarDayImportant]}>
              <Text style={[s.calendarDayText, { color: selected ? 'white' : colors.text }]}>{formatIso(date)}</Text>
              {expiries.length > 0 ? <View style={s.expiryDot} /> : null}
            </Pressable>
          );
        })}
      </View>
      {selectedCalendarDate ? (
        <View style={s.dateInfo}>
          <Text style={[s.memberName, { color: colors.text }]}>{formatIso(selectedCalendarDate)}</Text>
          <Text style={[s.memberMeta, { color: colors.muted }]}>
            {expiryByDate[selectedCalendarDate]?.length ? expiryByDate[selectedCalendarDate].join(', ') : 'Custom scheduled export date.'}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderDetail = () => {
    if (!page) return null;

    if (page === 'profile') return (
      <>
        <View style={[s.profileCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Pressable onPress={pickPhoto}>{renderAvatar(64)}</Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[s.profileName, { color: colors.text }]}>{settings.name}</Text>
            <Text style={[s.profileMeta, { color: colors.muted }]}>{productStats.products} products secured</Text>
            <View style={s.badge}><Text style={s.badgeText}>{settings.accountType}</Text></View>
          </View>
        </View>
        <Panel title="Account details">
          <TextInput value={settings.name} onChangeText={(name) => update({ name })} style={[s.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} placeholder="Full name" placeholderTextColor={colors.muted} />
          <TextInput value={settings.email} editable={false} style={[s.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.muted }]} placeholder="Email address" placeholderTextColor={colors.muted} />
          <Text style={[s.memberMeta, { color: colors.muted }]}>Email changes require verification and are not available in this build.</Text>
          {isOAuthAccount ? (
            <View style={[s.authProviderNotice, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name={authProvider === 'google' ? 'logo-google' : 'logo-apple'} size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.authProviderTitle, { color: colors.text }]}>
                  Signed in with {authProvider === 'google' ? 'Google' : 'Apple'}
                </Text>
                <Text style={[s.authProviderSub, { color: colors.muted }]}>
                  Use {authProvider === 'google' ? 'Google' : 'Apple'} to access this account.
                </Text>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={handlePasswordReset}
              disabled={passwordResetLoading || passwordResetCooldown > 0}
              style={[s.secondaryButton, (passwordResetLoading || passwordResetCooldown > 0) && s.disabledButton]}
            >
              {passwordResetLoading ? (
                <ActivityIndicator color={purple} />
              ) : (
                <Text style={s.secondaryButtonText}>
                  {passwordResetCooldown > 0 ? `Resend password link in ${passwordResetCooldown}s` : 'Edit password'}
                </Text>
              )}
            </Pressable>
          )}
          {settings.accountType === 'Free' ? <Pressable onPress={() => router.push('/pro')} style={s.primaryButton}><Ionicons name="sparkles-outline" size={18} color="white" /><Text style={s.primaryButtonText}>Upgrade to Pro</Text></Pressable> : null}
        </Panel>
      </>
    );

    if (page === 'reminders') return (
      <>
        <Panel><ToggleRow label="Enable expiry reminders" sub="Turn warranty expiry notifications on or off." value={settings.remindersEnabled} onValueChange={(remindersEnabled) => update({ remindersEnabled })} /></Panel>
        <Panel title="Notification channel">
          <View style={s.chipWrap}>{['Push notification', 'Email', 'Both'].map((item) => <Chip key={item} text={item} active={settings.notificationChannel === item} onPress={() => update({ notificationChannel: item as SettingsState['notificationChannel'] })} />)}</View>
          <View style={s.quietTabs}>
            <Pressable onPress={() => setActiveQuietTime('start')} style={[s.quietTab, { backgroundColor: activeQuietTime === 'start' ? colors.primary : colors.input, borderColor: activeQuietTime === 'start' ? colors.primary : colors.border }]}>
              <Text style={[s.quietTabLabel, { color: activeQuietTime === 'start' ? 'white' : colors.muted }]}>From</Text>
              <Text style={[s.quietTabTime, { color: activeQuietTime === 'start' ? 'white' : colors.text }]}>{settings.quietStart}</Text>
            </Pressable>
            <Text style={[s.toText, { color: colors.muted }]}>to</Text>
            <Pressable onPress={() => setActiveQuietTime('end')} style={[s.quietTab, { backgroundColor: activeQuietTime === 'end' ? colors.primary : colors.input, borderColor: activeQuietTime === 'end' ? colors.primary : colors.border }]}>
              <Text style={[s.quietTabLabel, { color: activeQuietTime === 'end' ? 'white' : colors.muted }]}>Until</Text>
              <Text style={[s.quietTabTime, { color: activeQuietTime === 'end' ? 'white' : colors.text }]}>{settings.quietEnd}</Text>
            </Pressable>
          </View>
          <TimeWheel
            value={activeQuietTime === 'start' ? settings.quietStart : settings.quietEnd}
            onSave={(value) => update(activeQuietTime === 'start' ? { quietStart: value } : { quietEnd: value })}
          />
          <Text style={[s.note, { color: colors.muted }]}>Quiet hours: no reminders during this window.</Text>
          <Pressable onPress={handleTestNotification} style={s.secondaryButton}>{busyAction === 'test' ? <ActivityIndicator color={colors.text} /> : <Text style={s.secondaryButtonText}>Test notification</Text>}</Pressable>
        </Panel>
      </>
    );

    if (page === 'backup') return (
      <>
        <Panel title="Backup provider">
          <View style={s.chipWrap}>{['iCloud', 'Google Drive', 'Dropbox'].map((item) => (
            <Chip
              key={item}
              text={item}
              active={settings.backupProvider === item}
              onPress={() => {
                update({ backupProvider: item as SettingsState['backupProvider'] });
                flashToast(`${item} direct sync needs its native SDK. Manual backup is available now.`);
              }}
            />
          ))}</View>
          <Text style={[s.note, { color: colors.muted }]}>Manual backups use Supabase when configured, or the device save/share sheet. Direct iCloud, Google Drive and Dropbox sync require provider setup.</Text>
        </Panel>
        <Panel>
          <ToggleRow
            label="Auto-backup"
            sub="Production background auto-backup needs native background tasks. Manual backup works now."
            value={settings.autoBackup}
            onValueChange={(autoBackup) => {
              if (autoBackup) {
                flashToast('Auto-backup needs the production background task. Use Back up now for this build.');
                return;
              }
              update({ autoBackup });
            }}
          />
          {settings.autoBackup ? <View style={s.chipWrap}>{['Daily', 'Weekly', 'Monthly'].map((item) => <Chip key={item} text={item} active={settings.backupFrequency === item} onPress={() => update({ backupFrequency: item as SettingsState['backupFrequency'] })} />)}</View> : null}
        </Panel>
        <Panel title="Backup status">
          <Text style={[s.note, { color: colors.muted }]}>Backups are encrypted in transit and stored under your signed-in Warret account. Provider exports use the device save/share sheet.</Text>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: '1.2%', backgroundColor: activePrimary }]} /></View>
          <Text style={[s.note, { color: colors.muted }]}>{productStats.products} products · {productStats.docs} documents indexed</Text>
          <Pressable onPress={handleBackupNow} style={s.primaryButton}>{busyAction === 'backup' ? <ActivityIndicator color="white" /> : <Ionicons name="cloud-upload-outline" size={18} color="white" />}<Text style={s.primaryButtonText}>Back up now</Text></Pressable>
          <Pressable onPress={handleExportBackupFile} style={s.secondaryButton}>{busyAction === 'backup-file' ? <ActivityIndicator color={colors.text} /> : null}<Text style={s.secondaryButtonText}>Save backup file</Text></Pressable>
          <Pressable onPress={openRestoreModal} style={s.secondaryButton}><Text style={s.secondaryButtonText}>Restore from backup</Text></Pressable>
        </Panel>
      </>
    );

    if (page === 'export') return (
      <>
        <Panel title="Export format"><View style={s.chipWrap}>{['PDF', 'CSV', 'JSON'].map((item) => <Chip key={item} text={item} active={settings.exportFormat === item} onPress={() => update({ exportFormat: item as SettingsState['exportFormat'] })} />)}</View></Panel>
        <Panel title="Scope">
          <View style={s.chipWrap}>{['All products', 'By category', 'By date range'].map((item) => <Chip key={item} text={item} active={settings.exportScope === item} onPress={() => update({ exportScope: item })} />)}</View>
          {settings.exportScope === 'By category' ? (
            productCategories.length ? (
              <View style={[s.chipWrap, { marginTop: 8 }]}>
                {productCategories.map((category) => (
                  <Chip
                    key={category.id}
                    text={category.name}
                    active={(settings.exportCategoryId || productCategories[0]?.id) === category.id}
                    onPress={() => update({ exportCategoryId: category.id })}
                  />
                ))}
              </View>
            ) : <Text style={[s.note, { color: colors.muted }]}>Create a category on the Products page before exporting by category.</Text>
          ) : null}
          {settings.exportScope === 'By date range' ? (
            <>
              <View style={s.timeRow}>
                <TextInput value={settings.exportStartDate} onChangeText={(exportStartDate) => update({ exportStartDate })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[s.timeInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
                <Text style={[s.toText, { color: colors.muted }]}>to</Text>
                <TextInput value={settings.exportEndDate} onChangeText={(exportEndDate) => update({ exportEndDate })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[s.timeInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} />
              </View>
              <Text style={[s.note, { color: colors.muted }]}>Filters by warranty start/end dates saved on products.</Text>
            </>
          ) : null}
        </Panel>
        <Panel>
          <ToggleRow label="Include document list" sub="Adds document names and metadata. Actual files stay in secure storage." value={settings.includeAttachments} onValueChange={(includeAttachments) => update({ includeAttachments })} />
          <View style={s.chipWrap}>{['Download to device', 'Send to email'].map((item) => (
            <Chip
              key={item}
              text={item}
              active={settings.exportDelivery === item}
              onPress={() => {
                if (item === 'Send to email') {
                  flashToast('Email export needs a server email provider. Download works now.');
                  return;
                }
                update({ exportDelivery: item as SettingsState['exportDelivery'] });
              }}
            />
          ))}</View>
          <Pressable onPress={handleExportData} style={s.primaryButton}>{busyAction === 'export' ? <ActivityIndicator color="white" /> : <Ionicons name="download-outline" size={18} color="white" />}<Text style={s.primaryButtonText}>Export</Text></Pressable>
        </Panel>
        <Panel title="Scheduled exports">
          <ToggleRow
            label="Enable scheduled exports"
            sub="Requires a backend scheduler and email provider. Manual exports are live."
            value={settings.scheduledExports}
            onValueChange={(scheduledExports) => {
              if (scheduledExports) {
                flashToast('Scheduled exports need backend cron/email setup before launch.');
                return;
              }
              update({ scheduledExports });
            }}
          />
          <View style={s.chipWrap}>{['Monthly', 'Quarterly', '6 months', 'Custom'].map((item) => <Chip key={item} text={item} active={settings.exportFrequency === item} onPress={() => update({ exportFrequency: item as SettingsState['exportFrequency'] })} />)}</View>
          {settings.exportFrequency === 'Custom' ? renderExportCalendar() : null}
          <TextInput editable={false} value={settings.email} style={[s.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text, opacity: 0.65 }]} placeholder="Delivery email" placeholderTextColor={colors.muted} />
        </Panel>
      </>
    );

    if (page === 'privacy') return (
      <>
        <Panel>
          <ToggleRow label="Analytics & crash reporting" sub="Helps us improve the app anonymously." value={settings.analytics} onValueChange={(analytics) => update({ analytics })} />
          <ToggleRow label="Personalisation" sub="Uses your data to surface smarter warranty insights." value={settings.personalisation} onValueChange={(personalisation) => update({ personalisation })} />
          <ToggleRow label="Improve scan recognition" sub="Allow anonymized scan patterns to improve parsing later." value={settings.scanLearning} onValueChange={(scanLearning) => update({ scanLearning })} />
          <ToggleRow label="Local-only mode" sub="Keep new products on this device until backup is enabled." value={settings.localOnly} onValueChange={(localOnly) => update({ localOnly })} />
        </Panel>
        <Panel title="Email import permissions">
          {settings.emailAccounts.map((account) => {
            const importProvider = account.provider === 'Gmail' || account.provider === 'Outlook';
            return (
              <View key={account.email} style={[s.emailRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.memberName, { color: colors.text }]}>{account.provider}</Text>
                  <Text style={[s.memberMeta, { color: colors.muted }]}>{account.email} · Last sync {account.lastSync}</Text>
                </View>
                <Switch value={account.enabled} onValueChange={() => toggleEmailAccount(account.email)} trackColor={{ false: '#E4E1EC', true: '#C8C0FF' }} thumbColor={account.enabled ? purple : 'white'} />
                {importProvider ? (
                  <>
                    <Pressable onPress={() => scanEmailAccount(account.provider)} style={[s.smallAction, { backgroundColor: colors.input, borderColor: colors.border }]}>
                      <Text style={s.smallActionText}>{busyAction === `scan-${account.provider.toLowerCase() === 'gmail' ? 'gmail' : 'outlook'}` ? 'Scanning' : 'Scan'}</Text>
                    </Pressable>
                    <Pressable onPress={() => revokeEmailAccount(account.email, account.provider)} style={[s.smallAction, { backgroundColor: colors.input, borderColor: colors.border }]}>
                      <Text style={s.smallActionText}>Revoke</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            );
          })}
          <View style={s.emailConnectRow}>
            <Pressable onPress={() => connectEmailAccount('gmail')} style={[s.emailConnectButton, { backgroundColor: colors.input, borderColor: colors.border }]}>
              {busyAction === 'email-gmail' ? <ActivityIndicator color={colors.text} /> : <Ionicons name="logo-google" size={17} color={colors.primary} />}
              <Text style={[s.emailConnectText, { color: colors.text }]}>Gmail</Text>
            </Pressable>
            <Pressable onPress={() => connectEmailAccount('outlook')} style={[s.emailConnectButton, { backgroundColor: colors.input, borderColor: colors.border }]}>
              {busyAction === 'email-outlook' ? <ActivityIndicator color={colors.text} /> : <Ionicons name="mail-outline" size={17} color={colors.primary} />}
              <Text style={[s.emailConnectText, { color: colors.text }]}>Outlook</Text>
            </Pressable>
          </View>
          <Text style={[s.note, { color: colors.muted }]}>Warret requests read-only mail access and stores tokens in Secure Store on mobile. Web sessions reconnect when needed.</Text>
        </Panel>
        <Panel title="OCR data retention"><View style={s.chipWrap}>{['Delete scans after processing', 'Keep for 30 days', 'Keep indefinitely'].map((item) => <Chip key={item} text={item} active={settings.ocrRetention === item} onPress={() => update({ ocrRetention: item })} />)}</View></Panel>
        <Panel title="Data deletion">
          <Pressable onPress={() => setDanger('records')} style={s.dataRow}><Text style={s.dangerText}>Delete all warranty records</Text><Ionicons name="chevron-forward" size={19} color="#FF5A62" /></Pressable>
          <Pressable onPress={() => setDanger('account')} style={s.dataRow}><Text style={s.dangerText}>Delete account</Text><Ionicons name="chevron-forward" size={19} color="#FF5A62" /></Pressable>
          <Pressable onPress={() => setPage('export')} style={[s.dataRow, { borderColor: colors.border }]}><Text style={[s.dataText, { color: colors.text }]}>Download my data</Text><Ionicons name="download-outline" size={19} color={colors.primary} /></Pressable>
          <Pressable onPress={() => router.push('/privacy')} style={[s.dataRow, { borderColor: colors.border }]}><Text style={[s.dataText, { color: colors.text }]}>Privacy policy</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>
          <Pressable onPress={() => router.push('/terms')} style={[s.dataRow, { borderColor: colors.border }]}><Text style={[s.dataText, { color: colors.text }]}>Terms of service</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>
        </Panel>
      </>
    );

    if (page === 'appearance') return (
      <>
        <Panel title="Appearance mode">
          <View style={s.chipWrap}>{(['Light', 'Dark', 'System default'] as ThemeMode[]).map((item) => <Chip key={item} text={item} active={settings.theme === item} onPress={() => update({ theme: item })} />)}</View>
        </Panel>

        <Panel title="App themes">
          {/* Classic Purple */}
          <Pressable onPress={() => update({ colorTheme: 'Classic Purple' })} style={[s.themeRow, { borderColor: colors.border }, settings.colorTheme === 'Classic Purple' && { backgroundColor: colors.soft }]}>
            <View style={[s.colorSwatch, { backgroundColor: '#5B4DF0' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: colors.text }]}>Classic Purple</Text>
              <Text style={[s.memberMeta, { color: colors.muted }]}>Default Warret look</Text>
            </View>
            {settings.colorTheme === 'Classic Purple' ? <Ionicons name="checkmark-circle" size={22} color="#5B4DF0" /> : null}
          </Pressable>

          {/* Soft Rose */}
          <Pressable onPress={() => update({ colorTheme: 'Soft Rose' })} style={[s.themeRow, { borderColor: colors.border }, settings.colorTheme === 'Soft Rose' && { backgroundColor: colors.soft }]}>
            <View style={[s.colorSwatch, { backgroundColor: '#D94E83' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: colors.text }]}>Soft Rose</Text>
              <Text style={[s.memberMeta, { color: colors.muted }]}>Warm pink accent</Text>
            </View>
            {settings.colorTheme === 'Soft Rose' ? <Ionicons name="checkmark-circle" size={22} color="#D94E83" /> : null}
          </Pressable>

          {/* Custom */}
          <Pressable onPress={() => update({ colorTheme: 'Custom' })} style={[s.themeRow, { borderColor: colors.border, borderBottomWidth: 0 }, settings.colorTheme === 'Custom' && { backgroundColor: colors.soft }]}>
            <View style={[s.colorSwatch, { backgroundColor: settings.customColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.memberName, { color: colors.text }]}>Custom colour</Text>
              <Text style={[s.memberMeta, { color: colors.muted }]}>Pick your own accent</Text>
            </View>
            {settings.colorTheme === 'Custom' ? <Ionicons name="checkmark-circle" size={22} color={settings.customColor} /> : null}
          </Pressable>

          {settings.colorTheme === 'Custom' && (
            <View style={[s.customColorPanel, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Text style={[s.fieldLabel, { color: colors.text, marginBottom: 12 }]}>Choose your colour</Text>
              <View style={s.colorPickerRow}>
                <NativeColorPicker
                  value={settings.customColor}
                  onChange={(c) => {
                    update({ customColor: c, colorTheme: 'Custom' });
                    setHexInput(c);
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.memberMeta, { color: colors.muted, marginBottom: 6 }]}>Or enter a hex code</Text>
                  <TextInput
                    value={hexInput}
                    onChangeText={(v) => {
                      setHexInput(v);
                      if (isValidHex(v)) update({ customColor: v, colorTheme: 'Custom' });
                    }}
                    placeholder="#5B4DF0"
                    placeholderTextColor={colors.muted}
                    maxLength={7}
                    autoCapitalize="characters"
                    style={[s.hexInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                  />
                </View>
                <View style={[s.colorPreviewLarge, { backgroundColor: settings.customColor }]} />
              </View>
              <Text style={[s.note, { color: colors.muted, marginTop: 8 }]}>
                Tap the swatch to open the colour wheel, or type a hex value.
              </Text>
            </View>
          )}
        </Panel>

        <Panel title="App icon">
          <View style={s.chipWrap}>{['Classic', 'Mono', 'Dark'].map((item) => (
            <Chip
              key={item}
              text={item}
              active={settings.appIcon === item}
              onPress={() => {
                if (item !== 'Classic') {
                  flashToast('Alternate app icons need the production native build.');
                  return;
                }
                update({ appIcon: item });
              }}
              disabled={item !== 'Classic'}
            />
          ))}</View>
          <Text style={[s.note, { color: colors.muted }]}>Alternate icons require iOS/Android native assets and an app-store build.</Text>
        </Panel>

        <Panel>
          <ToggleRow label="Compact list density" sub="Show tighter product and settings rows." value={settings.compactDensity} onValueChange={(compactDensity) => update({ compactDensity })} />
        </Panel>
      </>
    );

    if (page === 'notifications') return (
      <Panel title="Notification types">
        {Object.entries(settings.notificationTypes).map(([label, value]) => (
          <View key={label} style={s.notificationBlock}>
            <Text style={[s.optionTitle, { color: colors.text }]}>{label}</Text>
            <View style={s.miniToggleRow}>
              <CheckRow label="Push" checked={value.push} onPress={() => toggleNotificationType(label, 'push')} />
              <CheckRow label="Email" checked={value.email} onPress={() => toggleNotificationType(label, 'email')} />
            </View>
          </View>
        ))}
      </Panel>
    );

    if (page === 'storage') return (
      <Panel title="Local storage used">
        <View style={s.progressTrack}><View style={[s.progressFill, { width: '32%', backgroundColor: activePrimary }]} /></View>
        <Text style={[s.note, { color: colors.muted }]}>{productStats.products} products · {productStats.docs} indexed documents · {productStats.reminders} reminders</Text>
        <Pressable onPress={handleClearCache} style={s.secondaryButton}>{busyAction === 'cache' ? <ActivityIndicator color={colors.text} /> : null}<Text style={s.secondaryButtonText}>Clear temporary files</Text></Pressable>
        <Pressable onPress={handleRefreshAttachments} style={s.primaryButton}>{busyAction === 'download' ? <ActivityIndicator color="white" /> : <Ionicons name="cloud-download-outline" size={18} color="white" />}<Text style={s.primaryButtonText}>Check attachment availability</Text></Pressable>
      </Panel>
    );

    return (
      <>
        <Panel title="What's new">{[['1.0.0', 'Custom colour themes, save/cancel settings flow and local warranty parser.'], ['0.9.0', 'Warranty rings, product documents and coverage editing.'], ['0.8.0', 'Responsive iPhone layouts and warranty wallet home.']].map(([version, body]) => <View key={version} style={s.release}><Text style={[s.memberName, { color: colors.text }]}>Version {version}</Text><Text style={[s.memberMeta, { color: colors.muted }]}>{body}</Text></View>)}</Panel>
        <Panel title="FAQs">{['How does smart warranty search work?', 'Where are my documents stored?', 'How do exports work?'].map((question) => <Pressable key={question} onPress={() => setOpenFaq(openFaq === question ? '' : question)} style={s.faqItem}><Text style={[s.memberName, { color: colors.text }]}>{question}</Text>{openFaq === question ? <Text style={[s.memberMeta, { color: colors.muted }]}>Warret uses product names, brands, categories, tags and saved documents to keep warranty details easy to find.</Text> : null}</Pressable>)}</Panel>
        <Panel title="Support"><Pressable onPress={() => Linking.openURL('mailto:support@warret.app')} style={s.primaryButton}><Ionicons name="mail-outline" size={18} color="white" /><Text style={s.primaryButtonText}>Contact support</Text></Pressable><Pressable onPress={handleRateApp} style={s.secondaryButton}><Text style={s.secondaryButtonText}>Rate the app</Text></Pressable><Text style={s.version}>Warret v1.0.0</Text></Panel>
      </>
    );
  };

  // ── SUB-PAGE VIEW ─────────────────────────────────────────────────────────
  if (page) {
    return (
      <View style={[s.page, { backgroundColor: colors.page }]}>
        <View style={[s.detailHero, { paddingTop: clamp(height * 0.058, 34, 52), paddingHorizontal: pagePadding, backgroundColor: colors.primary }]}>
          <Pressable onPress={handleBack} style={s.backButton}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </Pressable>
          <View style={s.detailIcon}><Ionicons name={selectedRow?.icon || 'settings-outline'} size={25} color="white" /></View>
          <Text style={[s.detailTitle, { fontSize: clamp(width * 0.08 * scale, 25, 34), lineHeight: clamp(width * 0.095 * scale, 31, 40) }]}>{selectedRow?.title}</Text>
          <Text style={s.detailSub}>{selectedRow?.sub}</Text>
        </View>

        <ScrollView style={[s.detailBody, { backgroundColor: colors.page }]} contentContainerStyle={{ paddingHorizontal: pagePadding, paddingBottom: 120 }}>
          {renderDetail()}
        </ScrollView>

        {toast ? <View style={[s.toast, { bottom: toastBottom, backgroundColor: colors.cardAlt, borderColor: colors.border }]}><Text style={[s.toastText, { color: colors.primary }]}>{toast}</Text></View> : null}

        {/* Save / Cancel modal triggered by back button */}
        <Modal visible={savePromptOpen} transparent animationType="fade" onRequestClose={() => setSavePromptOpen(false)}>
          <View style={s.modalBackdrop}>
            <View style={[s.modalCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
              <View style={[s.savePromptIcon, { backgroundColor: colors.soft }]}>
                <Ionicons name="save-outline" size={28} color={colors.primary} />
              </View>
              <Text style={[s.modalTitle, { color: colors.text, marginTop: 14 }]}>Save changes?</Text>
              <Text style={[s.modalSub, { color: colors.muted }]}>
                You have unsaved changes. Save now to apply them permanently, or cancel to revert to your previous settings.
              </Text>
              <Pressable onPress={handleSaveNow} style={[s.primaryButton, { backgroundColor: colors.primary }]}>
                <Ionicons name="checkmark" size={18} color="white" />
                <Text style={s.primaryButtonText}>Save now</Text>
              </Pressable>
              <Pressable onPress={handleCancelChanges} style={s.secondaryButton}>
                <Text style={s.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => setSavePromptOpen(false)} style={s.secondaryButton}>
                <Text style={s.secondaryButtonText}>Keep editing</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <ConfirmModals
          restoreOpen={restoreOpen}
          setRestoreOpen={setRestoreOpen}
          cloudBackups={cloudBackups}
          restoreBusy={restoreBusy}
          restoreError={restoreError}
          onRestoreCloud={restoreCloudBackup}
          onRestoreFile={restoreBackupFile}
          danger={danger}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          setToast={setToast}
          onConfirmDelete={handleConfirmDelete}
          onCloseDanger={closeDanger}
          dangerLoading={dangerLoading}
          dangerError={dangerError}
        />
      </View>
    );
  }

  // ── MAIN SETTINGS LIST ────────────────────────────────────────────────────
  return (
    <View style={[s.page, { backgroundColor: colors.page }]}>
      {/* Account header */}
      <View style={[s.accountHeader, { backgroundColor: colors.page, borderBottomColor: colors.border }]}>
        <Text style={[s.pageTitle, { color: colors.text }]}>Settings</Text>
        <Pressable
          onPress={() => setPage('profile')}
          style={[s.accountCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
        >
          {renderAvatar(50)}
          <View style={{ flex: 1 }}>
            <Text style={[s.profileName, { color: colors.text }]}>{settings.name}</Text>
            <Text style={[s.profileMeta, { color: colors.muted }]}>{productStats.products} products · {settings.email}</Text>
          </View>
          <View style={s.badge}><Text style={s.badgeText}>{settings.accountType}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
        <View style={[s.settingsSearchBar, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={settingsSearch}
            onChangeText={setSettingsSearch}
            placeholder="Search settings"
            placeholderTextColor={colors.muted}
            selectionColor={colors.primary}
            returnKeyType="search"
            autoCorrect={false}
            style={[s.settingsSearchInput, { color: colors.text }]}
          />
          {settingsSearch.length > 0 ? (
            <Pressable onPress={() => setSettingsSearch('')} style={s.settingsSearchClear}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, paddingBottom: 120 }]}>
        {settingsSearchQuery ? (
          <>
            <Text style={[s.searchSectionTitle, { color: colors.muted }]}>Search results</Text>
            {settingsSearchResults.length > 0 ? settingsSearchResults.map((item) => (
              <Pressable
                key={`${item.page}-${item.title}`}
                onPress={() => {
                  setPage(item.page);
                  setSettingsSearch('');
                }}
                style={[s.searchResultRow, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
              >
                <View style={[s.rowIcon, { backgroundColor: colors.soft }]}>
                  <Ionicons name={item.icon} size={21} color={colors.primary} />
                </View>
                <View style={s.rowText}>
                  <Text style={[s.rowTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[s.rowSub, { color: colors.muted }]}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
            )) : (
              <View style={[s.searchEmpty, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={28} color={colors.muted} />
                <Text style={[s.searchEmptyTitle, { color: colors.text }]}>No matching settings</Text>
                <Text style={[s.searchEmptySub, { color: colors.muted }]}>Try searching for password, notifications, export, privacy, theme or cache.</Text>
              </View>
            )}
          </>
        ) : (
          <>
        {settings.accountType === 'Free' ? (
          <Pressable onPress={() => router.push('/pro')} style={[s.proPrompt, { backgroundColor: colors.soft, borderColor: colors.border }]}>
            <View style={[s.proPromptIcon, { backgroundColor: colors.primary }]}><Ionicons name="sparkles-outline" size={23} color="white" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.proPromptTitle, { color: colors.text }]}>Upgrade to Pro</Text>
              <Text style={[s.proPromptText, { color: colors.muted }]}>Unlock cloud vaults, smarter exports and advanced reminders.</Text>
            </View>
            <Ionicons name="chevron-forward" size={21} color={colors.primary} />
          </Pressable>
        ) : null}

        {rows.map((row) => (
          <Pressable key={row.id} onPress={() => setPage(row.id)} style={[s.row, { borderColor: colors.border }]}>
            <View style={[s.rowIcon, { backgroundColor: colors.soft }]}><Ionicons name={row.icon} size={22} color={colors.primary} /></View>
            <View style={s.rowText}><Text style={[s.rowTitle, { color: colors.text }]}>{row.title}</Text><Text style={[s.rowSub, { color: colors.muted }]}>{row.sub}</Text></View>
            <Ionicons name="chevron-forward" size={21} color={colors.muted} />
          </Pressable>
        ))}
          </>
        )}

        {/* Sign out */}
        {!settingsSearchQuery ? <View style={[s.signOutSection, { borderTopColor: colors.border }]}>
          <Text style={[s.signedInAs, { color: colors.muted }]}>Signed in as {user?.email || 'unknown'}</Text>
          <Pressable onPress={() => setLogoutOpen(true)} style={[s.signOutBtn, { borderColor: '#FFCDD0', backgroundColor: isDark ? '#2A1217' : '#FFF5F5' }]}>
            <Ionicons name="log-out-outline" size={20} color="#FF5A62" />
            <Text style={s.signOutText}>Sign out</Text>
          </Pressable>
        </View> : null}
      </ScrollView>

      {/* Sign out confirmation */}
      <Modal visible={logoutOpen} transparent animationType="fade" onRequestClose={() => setLogoutOpen(false)}>
        <View style={s.deleteBackdrop}>
          <View style={[s.deletePrompt, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.deleteIcon, { backgroundColor: isDark ? '#2A1217' : '#FFF5F5' }]}>
              <Ionicons name="log-out-outline" size={23} color="#FF5A62" />
            </View>
            <Text style={[s.deleteTitle, { color: colors.text }]}>Sign out of Warret?</Text>
            <Text style={[s.deleteText, { color: colors.muted }]}>Your data is saved locally. You can sign back in at any time.</Text>
            <Pressable onPress={logout} style={s.deletePrimary}>
              <Text style={s.deletePrimaryText}>Sign out</Text>
            </Pressable>
            <Pressable onPress={() => setLogoutOpen(false)} style={[s.deleteSecondary, { backgroundColor: colors.soft }]}>
              <Text style={[s.deleteSecondaryText, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {toast ? <View style={[s.toast, { bottom: toastBottom, backgroundColor: colors.cardAlt, borderColor: colors.border }]}><Text style={[s.toastText, { color: colors.primary }]}>{toast}</Text></View> : null}
    </View>
  );
}

function ConfirmModals({ restoreOpen, setRestoreOpen, cloudBackups, restoreBusy, restoreError, onRestoreCloud, onRestoreFile, danger, deleteConfirm, setDeleteConfirm, setToast, onConfirmDelete, onCloseDanger, dangerLoading, dangerError }: {
  restoreOpen: boolean; setRestoreOpen: (v: boolean) => void;
  cloudBackups: CloudBackupMeta[];
  restoreBusy: boolean;
  restoreError: string;
  onRestoreCloud: (id: string) => void;
  onRestoreFile: () => void;
  danger: null | 'records' | 'account';
  deleteConfirm: string; setDeleteConfirm: (v: string) => void;
  setToast: (v: string) => void;
  onConfirmDelete: () => void; onCloseDanger: () => void;
  dangerLoading: boolean; dangerError: string;
}) {
  const { colors } = useAppTheme();
  const confirmDisabled = dangerLoading || (danger === 'account' && deleteConfirm !== 'DELETE');
  const backupDate = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  return (
    <>
      <Modal visible={restoreOpen} transparent animationType="fade" onRequestClose={() => setRestoreOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Restore from backup?</Text>
            <Text style={[s.modalSub, { color: colors.muted }]}>Choose a secure cloud restore point or import a Warret backup file. Current local changes may be replaced.</Text>
            {restoreBusy ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : null}
            {restoreError ? <Text style={[s.dangerText, { fontSize: 13, marginTop: 10 }]}>{restoreError}</Text> : null}
            {!restoreBusy && cloudBackups.length === 0 ? (
              <Text style={[s.modalSub, { color: colors.muted, marginTop: 10 }]}>No cloud restore points found yet.</Text>
            ) : null}
            {cloudBackups.map((backup) => (
              <Pressable key={backup.id} disabled={restoreBusy} onPress={() => onRestoreCloud(backup.id)} style={[s.modalOption, { borderColor: colors.border }]}>
                <Text style={[s.dataText, { color: colors.text }]}>{backupDate(backup.createdAt)}</Text>
                <Text style={[s.note, { color: colors.muted }]}>{backup.platform || 'Warret'} · {Math.max(1, Math.round(backup.sizeBytes / 1024))} KB</Text>
              </Pressable>
            ))}
            <Pressable disabled={restoreBusy} onPress={onRestoreFile} style={[s.primaryButton, restoreBusy && s.disabledButton]}>
              <Ionicons name="folder-open-outline" size={18} color="white" />
              <Text style={s.primaryButtonText}>Import backup file</Text>
            </Pressable>
            <Pressable disabled={restoreBusy} onPress={() => setRestoreOpen(false)} style={s.secondaryButton}><Text style={s.secondaryButtonText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={danger !== null} transparent animationType="fade" onRequestClose={dangerLoading ? undefined : onCloseDanger}>
        <View style={s.modalBackdrop}><View style={[s.modalCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}><Text style={[s.modalTitle, { color: colors.text }]}>{danger === 'account' ? 'Delete account?' : 'Delete all warranty records?'}</Text><Text style={[s.modalSub, { color: colors.muted }]}>{danger === 'account' ? 'This permanently deletes your account, profile, products and uploaded files. This cannot be undone. Type DELETE to confirm.' : 'This will remove all saved warranty products, files and reminders from this wallet. This cannot be undone.'}</Text>{danger === 'account' ? <TextInput value={deleteConfirm} onChangeText={setDeleteConfirm} editable={!dangerLoading} autoCapitalize="characters" autoCorrect={false} style={[s.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.text }]} placeholder="Type DELETE" placeholderTextColor={colors.muted} /> : null}{dangerError ? <Text style={[s.dangerText, { fontSize: 13, marginTop: 10 }]}>{dangerError}</Text> : null}<Pressable disabled={confirmDisabled} onPress={onConfirmDelete} style={[s.dangerButton, confirmDisabled && s.disabledButton]}>{dangerLoading ? <ActivityIndicator color="white" /> : <Text style={s.dangerButtonText}>Confirm delete</Text>}</Pressable><Pressable disabled={dangerLoading} onPress={onCloseDanger} style={s.secondaryButton}><Text style={s.secondaryButtonText}>Cancel</Text></Pressable></View></View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  // Account header
  accountHeader: { paddingTop: 54, paddingBottom: 12, paddingHorizontal: 22, borderBottomWidth: 1 },
  pageTitle: { fontSize: 36, fontWeight: '900', fontFamily: F.n900, marginBottom: 14 },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 20, borderWidth: 1 },
  settingsSearchBar: { minHeight: 46, marginTop: 12, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  settingsSearchInput: { flex: 1, minHeight: 42, fontSize: 16, lineHeight: 20, fontWeight: '500', fontFamily: F.i500, outlineStyle: 'solid', outlineWidth: 0 },
  settingsSearchClear: { padding: 4 },
  // List
  list: { paddingTop: 16 },
  searchSectionTitle: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8, marginLeft: 2 },
  searchResultRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  searchEmpty: { alignItems: 'center', gap: 8, padding: 24, borderRadius: 20, borderWidth: 1 },
  searchEmptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', fontFamily: F.n900 },
  searchEmptySub: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500, textAlign: 'center' },
  proPrompt: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, marginBottom: 12, borderRadius: 20, borderWidth: 1 },
  proPromptIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  proPromptTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', fontFamily: F.n900 },
  proPromptText: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500, marginTop: 3 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontSize: 17, lineHeight: 22, fontWeight: '900', fontFamily: F.n900 },
  profileName: { fontSize: 17, lineHeight: 22, fontWeight: '900', fontFamily: F.n900 },
  profileMeta: { fontSize: 13, lineHeight: 17, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  badge: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#EDE9FF' },
  badgeText: { color: purple, fontSize: 12, lineHeight: 15, fontWeight: '900', fontFamily: F.n900 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, borderBottomWidth: 1 },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', fontFamily: F.n900 },
  rowSub: { fontSize: 13, lineHeight: 17, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  // Floating save bar
  saveBar: { position: 'absolute', left: 16, right: 16, bottom: 92, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 20, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  saveBarTitle: { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  saveBarSub: { fontSize: 12, fontWeight: '500', fontFamily: F.i500, marginTop: 1 },
  saveNowBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 13 },
  saveNowText: { color: 'white', fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  cancelChangesBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 13, borderWidth: 1 },
  cancelChangesText: { fontSize: 14, fontWeight: '900', fontFamily: F.n900 },
  // Detail hero
  detailHero: { paddingBottom: 28, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)' },
  detailIcon: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 18, backgroundColor: 'rgba(255,255,255,.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.34)' },
  detailTitle: { color: 'white', fontWeight: '900', fontFamily: F.n900, marginTop: 14 },
  detailSub: { color: '#D7D1FF', fontSize: 15, lineHeight: 21, fontWeight: '500', fontFamily: F.i500, marginTop: 4 },
  detailBody: { flex: 1 },
  // Panels
  panel: { marginTop: 20, padding: 16, borderRadius: 20, backgroundColor: lightCard, borderWidth: 1 },
  panelTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', fontFamily: F.n900, marginBottom: 12 },
  switchRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9, borderBottomWidth: 1 },
  switchLabel: { fontSize: 16, lineHeight: 21, fontWeight: '900', fontFamily: F.n900 },
  switchSub: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500, marginTop: 3 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: { minHeight: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1 },
  chipText: { fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900 },
  checkLine: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  checkText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '800', fontFamily: F.n800 },
  profileCard: { minHeight: 98, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, marginTop: 20, borderRadius: 20, borderWidth: 1 },
  input: { minHeight: 45, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, fontSize: 15, lineHeight: 20, fontWeight: '800', fontFamily: F.n800, marginTop: 9 },
  inputError: { borderColor: '#FF5A62' },
  errorText: { color: '#FF5A62', fontSize: 12, lineHeight: 16, fontWeight: '800', fontFamily: F.n800, marginTop: 5 },
  primaryButton: { minHeight: 46, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: purple, marginTop: 16, paddingHorizontal: 14 },
  primaryButtonText: { color: 'white', fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  secondaryButton: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0ECFF', marginTop: 12, paddingHorizontal: 14 },
  secondaryButtonText: { color: purple, fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
  authProviderNotice: { minHeight: 58, borderRadius: 14, borderWidth: 1, marginTop: 12, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  authProviderTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
  authProviderSub: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  memberName: { fontSize: 15, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  memberMeta: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500, marginTop: 2 },
  optionTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13 },
  timeInput: { flex: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 10, fontSize: 14, lineHeight: 18, fontWeight: '800', fontFamily: F.n800 },
  toText: { fontSize: 13, fontWeight: '900', fontFamily: F.n900 },
  quietTabs: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  quietTab: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  quietTabLabel: { fontSize: 10, lineHeight: 13, fontWeight: '900', fontFamily: F.n900, textTransform: 'uppercase' },
  quietTabTime: { fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900, marginTop: 1 },
  timeWheel: { minHeight: 224, borderRadius: 24, borderWidth: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, marginTop: 12, position: 'relative', overflow: 'hidden' },
  timeWheelColumns: { height: 168, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 20, position: 'relative', overflow: 'hidden' },
  timeWheelColumn: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  timeWheelLabel: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  timeWheelWindow: { width: '100%', height: 168, overflow: 'hidden' },
  timeWheelSelection: { position: 'absolute', left: 8, right: 8, top: 61, height: 46, borderRadius: 15, borderWidth: 1 },
  timeWheelScrollContent: { paddingVertical: 63 },
  timeWheelOption: { alignItems: 'center', justifyContent: 'center' },
  timeWheelValueText: { fontSize: 29, lineHeight: 35, fontWeight: '500', fontFamily: F.i500, textAlign: 'center' },
  timeWheelValueActive: { opacity: 1, fontSize: 31, lineHeight: 37, fontWeight: '700', fontFamily: F.n700 },
  timeWheelValueMuted: { color: '#8C8799', opacity: .52 },
  timeWheelSave: { minHeight: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  timeWheelSaveText: { color: 'white', fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
  note: { fontSize: 13, lineHeight: 18, fontWeight: '500', fontFamily: F.i500, marginTop: 10 },
  progressTrack: { height: 9, borderRadius: 5, overflow: 'hidden', backgroundColor: '#E7E2F6', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: 5 },
  dataRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#ECE8FA' },
  dataText: { fontSize: 15, lineHeight: 20, fontWeight: '800', fontFamily: F.n800 },
  dangerText: { color: '#FF5A62', fontSize: 15, lineHeight: 20, fontWeight: '900', fontFamily: F.n900 },
  emailRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, paddingVertical: 8 },
  emailConnectRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  emailConnectButton: { flex: 1, minHeight: 42, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  emailConnectText: { fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900 },
  smallAction: { minHeight: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1 },
  smallActionText: { color: purple, fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },
  signOutSection: { marginTop: 18, paddingTop: 16, borderTopWidth: 1 },
  signedInAs: { fontSize: 12, lineHeight: 16, fontWeight: '800', fontFamily: F.n800, marginBottom: 9 },
  signOutBtn: { minHeight: 48, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutText: { color: '#FF5A62', fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  deleteBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.42)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  deletePrompt: { width: '100%', maxWidth: 330, borderRadius: 22, borderWidth: 1, padding: 18, alignItems: 'center' },
  deleteIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  deleteTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', fontFamily: F.n900, textAlign: 'center' },
  deleteText: { fontSize: 14, lineHeight: 20, fontWeight: '500', fontFamily: F.i500, textAlign: 'center', marginTop: 6, marginBottom: 14 },
  deletePrimary: { minHeight: 45, borderRadius: 15, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5A62' },
  deletePrimaryText: { color: 'white', fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  deleteSecondary: { minHeight: 43, borderRadius: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  deleteSecondaryText: { fontSize: 14, lineHeight: 18, fontWeight: '900', fontFamily: F.n900 },
  notificationBlock: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#ECE8FA' },
  miniToggleRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  faqItem: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#ECE8FA' },
  version: { textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '800', fontFamily: F.n800, marginTop: 18 },
  release: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#ECE8FA' },
  toast: { position: 'absolute', left: 42, right: 42, minHeight: 38, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, shadowColor: '#000', shadowOpacity: .08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  toastText: { fontSize: 13, lineHeight: 17, fontWeight: '900', fontFamily: F.n900, textAlign: 'center' },
  calendar: { marginTop: 14 },
  calendarHeader: { marginBottom: 8 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  calendarDay: { width: 76, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, position: 'relative' },
  calendarDaySelected: {},
  calendarDayImportant: { borderWidth: 2 },
  calendarDayText: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontFamily: F.n900 },
  expiryDot: { position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: purple },
  dateInfo: { padding: 12, marginTop: 10, borderRadius: 15, borderWidth: 1, borderColor: '#E4DEF8' },
  themeRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  colorSwatch: { width: 38, height: 38, borderRadius: 13 },
  // Custom color panel
  customColorPanel: { marginTop: 8, padding: 14, borderRadius: 16, borderWidth: 1 },
  colorPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  hexInput: { minHeight: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, fontSize: 15, fontWeight: '900', fontFamily: F.n900, letterSpacing: 1 },
  colorPreviewLarge: { width: 40, height: 40, borderRadius: 12 },
  fieldLabel: { fontSize: 15, fontWeight: '900', fontFamily: F.n900 },
  // Save prompt modal
  savePromptIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 330, borderRadius: 22, borderWidth: 1, padding: 18, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  modalTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', fontFamily: F.n900 },
  modalSub: { fontSize: 14, lineHeight: 20, fontWeight: '500', fontFamily: F.i500, marginTop: 6, marginBottom: 10 },
  modalOption: { minHeight: 42, justifyContent: 'center', borderBottomWidth: 1 },
  dangerButton: { minHeight: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5A62', marginTop: 14 },
  dangerButtonText: { color: 'white', fontSize: 15, lineHeight: 19, fontWeight: '900', fontFamily: F.n900 },
  disabledButton: { opacity: .45 },
  empty: { padding: 18, borderRadius: 18, backgroundColor: lightCard },
});
