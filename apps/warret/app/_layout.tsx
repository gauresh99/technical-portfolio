import { useEffect } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { useAppFonts } from '../src/theme/fonts';
import { ProductsProvider } from '../src/store/products';
import { GroupsProvider } from '../src/store/groups';
import { EditGuardProvider } from '../src/store/editGuard';
import { ThemeProvider, useAppTheme } from '../src/store/theme';
import { AuthProvider, useAuth } from '../src/store/auth';
import { NotificationService } from '../src/services/notifications';
import AuthScreen from './auth';
import OnboardingScreen from './onboarding';
import ResetPasswordScreen from './reset-password';

// ─── Authenticated app — Stack navigator ──────────────────────────────────────
function AppStack() {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        // On Android use explicit slide animation; on iOS use the platform default
        // (which includes the native swipe-back gesture automatically).
        animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
        contentStyle: { backgroundColor: colors.page },
      }}
    >
      {/* Tabs — disallow swiping the entire tab bar off screen */}
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />

      {/* Detail screens — all get iOS swipe-back + Android edge swipe */}
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="group/[id]" />
      <Stack.Screen name="group/settings" />
      <Stack.Screen name="upcoming" />
      <Stack.Screen name="join" />
      <Stack.Screen name="import" />
      <Stack.Screen name="document" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="terms" />

      {/* Presented modally from the bottom */}
      <Stack.Screen
        name="add"
        options={{
          animation: 'slide_from_bottom',
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="pro"
        options={{
          animation: 'slide_from_bottom',
          gestureDirection: 'vertical',
        }}
      />
    </Stack>
  );
}

function PublicLinkStack() {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
        contentStyle: { backgroundColor: colors.page },
      }}
    >
      <Stack.Screen name="join" />
      <Stack.Screen name="import" />
      <Stack.Screen name="document" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="terms" />
    </Stack>
  );
}

// ─── Root navigator — gates auth + onboarding ─────────────────────────────────
function RootNavigator() {
  const { user, loaded, onboardingDone, isPasswordRecovery } = useAuth();
  const { colors } = useAppTheme();
  const pathname = usePathname();

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#5B4DF0" />
      </View>
    );
  }

  if (['/verify', '/document', '/join', '/import'].includes(pathname)) return <PublicLinkStack />;
  if (!user && ['/privacy', '/terms'].includes(pathname)) return <PublicLinkStack />;
  if (isPasswordRecovery)  return <ResetPasswordScreen />;
  if (!user)               return <AuthScreen />;
  if (!onboardingDone)     return <OnboardingScreen />;

  return <AppStack />;
}

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function Layout() {
  const [fontsLoaded] = useAppFonts();

  useEffect(() => {
    if (Platform.OS !== 'web') {
      NotificationService.requestPermissions().catch(() => {});
    }
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E0C16' }}>
        <ActivityIndicator size="large" color="#5B4DF0" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <ProductsProvider>
          <GroupsProvider>
            <EditGuardProvider>
              <RootNavigator />
            </EditGuardProvider>
          </GroupsProvider>
        </ProductsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
