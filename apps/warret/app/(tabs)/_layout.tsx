import { Platform } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEditGuard } from '../../src/store/editGuard';
import { useAppTheme } from '../../src/store/theme';
import { F } from '../../src/theme/fonts';

export default function TabsLayout() {
  const { hasDirtyEdit, requestLeave } = useEditGuard();
  const { colors, isDark } = useAppTheme();

  const guardedTab = (path: '/' | '/products' | '/groups' | '/settings') => ({
    tabPress: (event: any) => {
      if (hasDirtyEdit) {
        event.preventDefault();
        requestLeave(() => router.replace(path));
      } else if (path === '/products') {
        event.preventDefault();
        router.replace('/products');
      }
    },
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? '#B7B0C8' : undefined,
        tabBarStyle: {
          height: Platform.OS === 'android' ? 64 : 82,
          paddingBottom: Platform.OS === 'android' ? 10 : 18,
          paddingTop: 10,
          backgroundColor: colors.page,
          borderTopColor: colors.border,
          elevation: Platform.OS === 'android' ? 8 : 0,
        },
        tabBarLabelStyle: { fontFamily: F.n700, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }}
        listeners={guardedTab('/')}
      />
      <Tabs.Screen
        name="products"
        options={{ title: 'Products', tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} /> }}
        listeners={guardedTab('/products')}
      />
      <Tabs.Screen
        name="groups"
        options={{ title: 'Groups', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} /> }}
        listeners={guardedTab('/groups')}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }}
        listeners={guardedTab('/settings')}
      />
    </Tabs>
  );
}
