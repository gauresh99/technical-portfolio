import { router, type Href } from 'expo-router';

export function safeBack(fallback: Href = '/') {
  router.replace(fallback);
}
