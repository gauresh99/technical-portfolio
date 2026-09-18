import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '../src/store/theme';

export default function NotFoundRedirect() {
  const { colors } = useAppTheme();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/'), 250);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
