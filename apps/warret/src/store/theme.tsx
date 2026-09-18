import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'Light' | 'Dark' | 'System default';
export type ColorTheme = 'Classic Purple' | 'Soft Rose' | 'Custom';

const settingsKey = 'warret.settings.v2';
const getStorage = () => {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
};

const presetThemes: Record<Exclude<ColorTheme, 'Custom'>, { primary: string; soft: string }> = {
  'Classic Purple': { primary: '#5B4DF0', soft: '#F0ECFF' },
  'Soft Rose': { primary: '#D94E83', soft: '#FFE5EF' },
};

function hexToSoft(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const mix = (c: number) => Math.round(c + (255 - c) * 0.82).toString(16).padStart(2, '0');
    return `#${mix(r)}${mix(g)}${mix(b)}`;
  } catch {
    return '#F0ECFF';
  }
}

type ThemeContextValue = {
  theme: ThemeMode;
  colorTheme: ColorTheme;
  customColor: string;
  isDark: boolean;
  colors: {
    primary: string;
    page: string;
    card: string;
    cardAlt: string;
    text: string;
    muted: string;
    border: string;
    input: string;
    soft: string;
  };
  setAppearance: (appearance: Partial<{ theme: ThemeMode; colorTheme: ColorTheme; customColor: string }>) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>('System default');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('Classic Purple');
  const [customColor, setCustomColor] = useState('#5B4DF0');

  useEffect(() => {
    try {
      const raw = getStorage()?.getItem(settingsKey) || null;
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.theme) setTheme(parsed.theme);
      if (parsed.colorTheme) setColorTheme(parsed.colorTheme);
      if (parsed.customColor) setCustomColor(parsed.customColor);
    } catch {}
  }, []);

  const setAppearance: ThemeContextValue['setAppearance'] = (appearance) => {
    if (appearance.theme) setTheme(appearance.theme);
    if (appearance.colorTheme) setColorTheme(appearance.colorTheme);
    if (appearance.customColor) setCustomColor(appearance.customColor);
  };

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = theme === 'Dark';
    let primary: string;
    let soft: string;
    if (colorTheme === 'Custom') {
      primary = customColor;
      soft = hexToSoft(customColor);
    } else {
      const preset = presetThemes[colorTheme] || presetThemes['Classic Purple'];
      primary = preset.primary;
      soft = preset.soft;
    }
    return {
      theme,
      colorTheme,
      customColor,
      isDark,
      colors: {
        primary,
        page: isDark ? '#111018' : 'white',
        card: isDark ? '#1C1A25' : '#F8F7FF',
        cardAlt: isDark ? '#24212E' : '#F5F5F8',
        text: isDark ? '#FFFFFF' : '#25222F',
        muted: isDark ? '#C9C4D6' : '#7E778E',
        border: isDark ? '#343041' : '#EEEAFE',
        input: isDark ? '#211E2A' : 'white',
        soft: isDark ? '#2C2738' : soft,
      },
      setAppearance,
    };
  }, [theme, colorTheme, customColor]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useAppTheme must be used within ThemeProvider');
  return context;
}
