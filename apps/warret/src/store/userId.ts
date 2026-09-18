import AsyncStorage from '@react-native-async-storage/async-storage';
import { createEntityId } from '../utils/security';

const KEY = 'warret.userId';
let cached: string | null = null;

function gen(): string {
  return createEntityId('u');
}

export async function getOrCreateUserId(): Promise<string> {
  if (cached) return cached;
  const stored = await AsyncStorage.getItem(KEY);
  if (stored) { cached = stored; return stored; }
  const id = gen();
  await AsyncStorage.setItem(KEY, id);
  cached = id;
  return id;
}
