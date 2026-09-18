/**
 * Central font token definitions.
 * Import { F, loadAppFonts } everywhere instead of repeating font name strings.
 *
 * Nunito  → brand moments, headings, numbers, button text
 * Inter   → body copy, labels, metadata, settings rows, dates
 */

import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

export function useAppFonts() {
  return useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
}

// ─── Font name tokens ─────────────────────────────────────────────────────────
// Nunito — headings, brand, numbers, buttons
export const F = {
  // Nunito
  n400: 'Nunito_400Regular',
  n500: 'Nunito_500Medium',
  n600: 'Nunito_600SemiBold',
  n700: 'Nunito_700Bold',
  n800: 'Nunito_800ExtraBold',
  n900: 'Nunito_900Black',
  // Inter
  i400: 'Inter_400Regular',
  i500: 'Inter_500Medium',
  i600: 'Inter_600SemiBold',
  i700: 'Inter_700Bold',
} as const;

// ─── Semantic aliases ─────────────────────────────────────────────────────────
export const AppFont = {
  // Brand / display
  appName:        { fontFamily: F.n900 },
  display:        { fontFamily: F.n900 },
  // Headings
  heading1:       { fontFamily: F.n800 },
  heading2:       { fontFamily: F.n700 },
  heading3:       { fontFamily: F.n700 },
  // UI emphasis
  cardTitle:      { fontFamily: F.n700 },
  buttonLabel:    { fontFamily: F.n700 },
  tabLabel:       { fontFamily: F.n700 },
  // Numbers / countdowns
  bigNumber:      { fontFamily: F.n900 },
  number:         { fontFamily: F.n700 },
  // Body / data
  body:           { fontFamily: F.i400 },
  bodyMedium:     { fontFamily: F.i500 },
  label:          { fontFamily: F.i700 },
  labelSemi:      { fontFamily: F.i600 },
  metadata:       { fontFamily: F.i500 },
  caption:        { fontFamily: F.i400 },
  // Form
  fieldLabel:     { fontFamily: F.i700 },
  fieldValue:     { fontFamily: F.i500 },
  fieldPlaceholder: { fontFamily: F.i400 },
  // Settings
  settingTitle:   { fontFamily: F.i500 },
  settingSub:     { fontFamily: F.i400 },
};
