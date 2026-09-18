import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product, ProductCategory } from '../data/products';
import type { Group } from '../data/groups';

const PRODUCTS_KEY = 'warret.products.v1';
const PRODUCT_CATEGORIES_KEY = 'warret.productCategories.v1';
const SETTINGS_KEY = 'warret.settings.v2';
const GROUPS_KEY   = 'warret.groups.v1';

const scopedKey = (base: string, scopeId?: string) =>
  scopeId ? `${base}.${scopeId}` : base;

export const StorageService = {
  async loadProducts(scopeId?: string): Promise<Product[] | null> {
    try {
      const json = await AsyncStorage.getItem(scopedKey(PRODUCTS_KEY, scopeId));
      if (!json) return null;
      return JSON.parse(json) as Product[];
    } catch {
      return null;
    }
  },

  async saveProducts(products: Product[], scopeId?: string): Promise<void> {
    try {
      await AsyncStorage.setItem(scopedKey(PRODUCTS_KEY, scopeId), JSON.stringify(products));
    } catch {
      // storage write failure is non-fatal
    }
  },

  async clearProducts(scopeId?: string): Promise<void> {
    await AsyncStorage.removeItem(scopedKey(PRODUCTS_KEY, scopeId));
  },

  async loadProductCategories(scopeId?: string): Promise<ProductCategory[] | null> {
    try {
      const json = await AsyncStorage.getItem(scopedKey(PRODUCT_CATEGORIES_KEY, scopeId));
      if (!json) return null;
      return JSON.parse(json) as ProductCategory[];
    } catch {
      return null;
    }
  },

  async saveProductCategories(categories: ProductCategory[], scopeId?: string): Promise<void> {
    try {
      await AsyncStorage.setItem(scopedKey(PRODUCT_CATEGORIES_KEY, scopeId), JSON.stringify(categories));
    } catch {
      // storage write failure is non-fatal
    }
  },

  async clearProductCategories(scopeId?: string): Promise<void> {
    await AsyncStorage.removeItem(scopedKey(PRODUCT_CATEGORIES_KEY, scopeId));
  },

  async loadSettings<T>(scopeId?: string): Promise<T | null> {
    try {
      const json = await AsyncStorage.getItem(scopeId ? `${SETTINGS_KEY}.${scopeId}` : SETTINGS_KEY);
      if (!json) return null;
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  },

  async saveSettings<T>(settings: T, scopeId?: string): Promise<void> {
    try {
      await AsyncStorage.setItem(scopeId ? `${SETTINGS_KEY}.${scopeId}` : SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // storage write failure is non-fatal
    }
  },

  async loadGroups(scopeId?: string): Promise<Group[] | null> {
    try {
      const json = await AsyncStorage.getItem(scopedKey(GROUPS_KEY, scopeId));
      if (!json) return null;
      return JSON.parse(json) as Group[];
    } catch {
      return null;
    }
  },

  async saveGroups(groups: Group[], scopeId?: string): Promise<void> {
    try {
      await AsyncStorage.setItem(scopedKey(GROUPS_KEY, scopeId), JSON.stringify(groups));
    } catch {}
  },

  async clearGroups(scopeId?: string): Promise<void> {
    await AsyncStorage.removeItem(scopedKey(GROUPS_KEY, scopeId));
  },
};
