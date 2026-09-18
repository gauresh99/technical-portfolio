import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Product, DocEntry, ProductCategory } from '../data/products';
import { supabase } from '../lib/supabase';
import type { ProductRow, ProductCategoryRow } from '../lib/supabase';
import { useAuth } from './auth';
import { NotificationService } from '../services/notifications';
import { FileStorageService } from '../services/fileStorage';
import { StorageService } from '../services/storage';
import { formatProductName } from '../utils/productNames';
import { createEntityId } from '../utils/security';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NewProduct = {
  id?:           string;
  name:          string;
  brand?:        string;
  docName?:      string;
  docEntries?:   DocEntry[];
  type?:         string;
  category?:     string;
  warrantyStart?: string;
  warrantyEnd?:  string;
  dateAdded?:    string;
  serialNumber?: string;
  seller?:       string;
  personal?:     boolean;
  keywords?:     string[];
  support?:      { site: string; phone: string; method: string };
  coverage?:     { included: string[]; excluded: string[] };
  steps?:        string[];
};

type ProductsContextValue = {
  products:         Product[];
  productCategories: ProductCategory[];
  loaded:           boolean;
  reloadFromStorage: (options?: { replaceServer?: boolean }) => Promise<void>;
  addProduct:       (product: NewProduct) => Product;
  updateProduct:    (id: string, updates: Partial<Product>) => void;
  deleteProduct:    (id: string) => void;
  deleteAllProducts: () => Promise<boolean>;
  addDocument:      (id: string, docName?: string) => void;
  removeDocument:   (id: string, docName: string) => void;
  setReminders:     (id: string, reminders: string[]) => void;
  addProductCategory:    (name: string, productIds: string[]) => ProductCategory;
  updateProductCategory: (id: string, updates: Partial<Pick<ProductCategory, 'name' | 'productIds'>>) => void;
  deleteProductCategory: (id: string) => void;
};

const ProductsContext = createContext<ProductsContextValue | undefined>(undefined);

type ProductSettings = { localOnly?: boolean };
type ReminderSettings = {
  remindersEnabled?: boolean;
  notificationChannel?: 'Push notification' | 'Email' | 'Both';
  quietStart?: string;
  quietEnd?: string;
};

// ─── Utility ──────────────────────────────────────────────────────────────────

const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

const formatISODate = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `product-${Date.now()}`;

export const computeStatus = (warrantyEndISO: string): Product['status'] => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${warrantyEndISO}T00:00:00`);
  if (!Number.isFinite(expiry.getTime())) return 'Active';
  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (daysLeft < 0)    return 'Expired';
  if (daysLeft <= 60)  return 'Expiring soon';
  return 'Active';
};

const buildProduct = (input: NewProduct): Product => {
  const now        = new Date();
  const cleanName  = formatProductName(input.name);
  const cleanBrand = input.brand?.trim() || 'Unknown brand';

  const docExpiries = (input.docEntries || []).map((d) => d.expiry).filter(Boolean).sort();

  let warrantyEndISO: string;
  let expiryDate:     Date;
  if (input.warrantyEnd) {
    warrantyEndISO = input.warrantyEnd;
    expiryDate     = new Date(`${input.warrantyEnd}T00:00:00`);
    if (!Number.isFinite(expiryDate.getTime())) {
      expiryDate     = new Date(now);
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      warrantyEndISO = formatISODate(expiryDate);
    }
  } else if (docExpiries.length > 0) {
    warrantyEndISO = docExpiries[0];
    expiryDate     = new Date(`${warrantyEndISO}T00:00:00`);
  } else {
    expiryDate = new Date(now); expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    warrantyEndISO = formatISODate(expiryDate);
  }

  const warrantyStartISO = input.warrantyStart || formatISODate(now);
  const addedDate        = input.dateAdded ? new Date(`${input.dateAdded}T00:00:00`) : now;
  const displayAdded     = Number.isFinite(addedDate.getTime()) ? addedDate : now;

  return {
    id:           input.id || createEntityId(slugify(cleanName)),
    name:         cleanName,
    brand:        cleanBrand,
    status:       computeStatus(warrantyEndISO),
    expires:      formatDisplayDate(expiryDate),
    warrantyStart: warrantyStartISO,
    warrantyEnd:  warrantyEndISO,
    dateAdded:    formatDisplayDate(displayAdded),
    type:         input.type || 'Warranty document',
    category:     input.category || undefined,
    personal:     input.personal,
    keywords:     input.keywords || [cleanName, cleanBrand, 'warranty', 'document'],
    serialNumber: input.serialNumber || undefined,
    seller:       input.seller || undefined,
    docs:         [...(input.docName ? [input.docName] : []), ...(input.docEntries || []).map((d) => d.fileName)],
    docEntries:   input.docEntries || undefined,
    support:      input.support || { site: 'Add support site', phone: 'Add support phone', method: 'Add claim method' },
    coverage:     input.coverage || { included: ['Add covered items'], excluded: ['Add exclusions'] },
    steps:        input.steps || ['Add claim steps for this product'],
    reminders:    [],
  };
};

// ─── DB row ↔ Product conversions ────────────────────────────────────────────

function rowToProduct(row: ProductRow, currentUserId?: string): Product {
  const warrantyEndISO = row.warranty_end || '';
  const expiryDate     = warrantyEndISO ? new Date(`${warrantyEndISO}T00:00:00`) : new Date();
  const isOwner         = !currentUserId || row.user_id === currentUserId;
  return {
    id:           row.id,
    ownerId:      row.user_id,
    name:         row.name,
    brand:        row.brand,
    status:       computeStatus(warrantyEndISO),
    expires:      formatDisplayDate(expiryDate),
    warrantyStart: row.warranty_start || '',
    warrantyEnd:  warrantyEndISO,
    dateAdded:    row.date_added
      ? formatDisplayDate(new Date(`${row.date_added}T00:00:00`))
      : formatDisplayDate(new Date(row.created_at)),
    type:         row.type,
    category:     undefined,
    personal:     isOwner ? row.personal : false,
    keywords:     row.keywords,
    serialNumber: row.serial_number || undefined,
    seller:       row.seller || undefined,
    docs:         row.docs,
    docEntries:   row.doc_entries?.length ? row.doc_entries : undefined,
    support:      row.support,
    extended:     row.extended || undefined,
    coverage:     row.coverage,
    steps:        row.steps,
    reminders:    row.reminders,
    groupId:      row.group_id || undefined,
  };
}

function productToRow(p: Product, userId: string): Omit<ProductRow, 'created_at' | 'updated_at'> {
  return {
    id:             p.id,
    user_id:        userId,
    name:           p.name,
    brand:          p.brand,
    type:           p.type,
    warranty_start: p.warrantyStart || null,
    warranty_end:   p.warrantyEnd   || null,
    date_added:     null, // stored as display string in app; skip for now
    serial_number:  p.serialNumber  || null,
    seller:         p.seller        || null,
    keywords:       p.keywords,
    reminders:      p.reminders || [],
    docs:           p.docs,
    doc_entries:    p.docEntries || [],
    support:        p.support,
    extended:       p.extended || null,
    coverage:       p.coverage,
    steps:          p.steps,
    personal:       p.personal ?? true,
    group_id:       p.groupId || null,
  };
}

function rowToCategory(row: ProductCategoryRow): ProductCategory {
  return { id: row.id, name: row.name, productIds: row.product_ids, createdAt: row.created_at };
}

function categoryToRow(c: ProductCategory, userId: string): ProductCategoryRow {
  return { id: c.id, user_id: userId, name: c.name, product_ids: c.productIds, created_at: c.createdAt };
}

const formatCategoryName = (v: string) =>
  v.trim().split(/\s+/).filter(Boolean)
   .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const normalizeCategory = (c: ProductCategory): ProductCategory => ({
  ...c,
  name:       formatCategoryName(c.name) || 'Untitled Category',
  productIds: Array.from(new Set(c.productIds || [])),
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProductsProvider({ children }: { children: React.ReactNode }) {
  const { user }   = useAuth();
  const userId     = user?.id ?? null;

  const [products,          setProducts]          = useState<Product[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [loaded,            setLoaded]            = useState(false);
  const [localOnly,         setLocalOnly]         = useState(false);
  const prevUserIdRef = useRef<string | null>(null);

  // Load from Supabase whenever the user changes
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;

    if (!userId) {
      setProducts([]);
      setProductCategories([]);
      setLocalOnly(false);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    Promise.all([
      StorageService.loadSettings<ProductSettings>(userId),
      StorageService.loadProducts(userId),
      StorageService.loadProductCategories(userId),
    ]).then(async ([savedSettings, cachedProducts, cachedCategories]) => {
      const localOnlyMode = !!savedSettings?.localOnly;
      setLocalOnly(localOnlyMode);
      if (localOnlyMode) {
        setProducts((cachedProducts || []).map((p) => ({ ...p, ownerId: userId, status: computeStatus(p.warrantyEnd) })));
        setProductCategories((cachedCategories || []).map(normalizeCategory));
        setLoaded(true);
        return;
      }

      const [prodRes, catRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('product_categories').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      ]);
      const remoteProducts = (prodRes.data || []).map((row) => rowToProduct(row, userId));
      const remoteIds = new Set(remoteProducts.map((p) => p.id));
      const unsyncedLocal = (cachedProducts || []).filter((p) => !remoteIds.has(p.id) && (!p.ownerId || p.ownerId === userId));
      const mergedProducts = [...unsyncedLocal.map((p) => ({ ...p, ownerId: userId, status: computeStatus(p.warrantyEnd) })), ...remoteProducts];
      setProducts(mergedProducts);
      setProductCategories((catRes.data || []).map(rowToCategory).map(normalizeCategory));
      setLoaded(true);
    });
  }, [userId]);

  useEffect(() => {
    if (!loaded || !userId) return;
    const ownProducts = products.filter((p) => !p.ownerId || p.ownerId === userId);
    StorageService.saveProducts(ownProducts, userId).catch(() => {});
    StorageService.saveProductCategories(productCategories, userId).catch(() => {});
  }, [products, productCategories, loaded, userId]);

  const shouldSyncCloud = useCallback(async () => {
    if (!userId) return false;
    const savedSettings = await StorageService.loadSettings<ProductSettings>(userId);
    const nextLocalOnly = !!savedSettings?.localOnly;
    setLocalOnly(nextLocalOnly);
    return !nextLocalOnly;
  }, [userId, localOnly]);

  // ─── CRUD helpers ──────────────────────────────────────────────────────────

  const syncAddProduct = useCallback((product: Product) => {
    if (!userId) return;
    shouldSyncCloud().then((sync) => {
      if (!sync) return;
      supabase.from('products').insert(productToRow(product, userId)).then(({ error }) => {
        if (error) console.warn('products insert error:', error.message);
      });
    });
  }, [userId, shouldSyncCloud]);

  const syncUpdateProduct = useCallback((product: Product) => {
    if (!userId) return;
    if (product.ownerId && product.ownerId !== userId) return;
    shouldSyncCloud().then((sync) => {
      if (!sync) return;
      supabase.from('products').update(productToRow(product, userId)).eq('id', product.id).then(({ error }) => {
        if (error) console.warn('products update error:', error.message);
      });
    });
  }, [userId, shouldSyncCloud]);

  const syncDeleteProduct = useCallback((id: string) => {
    if (!userId) return;
    shouldSyncCloud().then((sync) => {
      if (!sync) return;
      supabase.from('products').delete().eq('id', id).then(({ error }) => {
        if (error) console.warn('products delete error:', error.message);
      });
    });
  }, [userId, shouldSyncCloud]);

  const syncUpsertCategory = useCallback((cat: ProductCategory) => {
    if (!userId) return;
    shouldSyncCloud().then((sync) => {
      if (!sync) return;
      supabase.from('product_categories').upsert(categoryToRow(cat, userId)).then(({ error }) => {
        if (error) console.warn('categories upsert error:', error.message);
      });
    });
  }, [userId, shouldSyncCloud]);

  const syncDeleteCategory = useCallback((id: string) => {
    if (!userId) return;
    shouldSyncCloud().then((sync) => {
      if (!sync) return;
      supabase.from('product_categories').delete().eq('id', id).then(({ error }) => {
        if (error) console.warn('categories delete error:', error.message);
      });
    });
  }, [userId, shouldSyncCloud]);

  // Re-hydrates in-memory state from AsyncStorage — used by backup restore so
  // restored data appears without an app restart. When signed in, the restored
  // rows are also upserted to Supabase (fire-and-forget, like the other syncs)
  // so they survive the next launch, which loads from the server.
  const reloadFromStorage = useCallback(async (options?: { replaceServer?: boolean }) => {
    const [localProducts, localCategories] = await Promise.all([
      StorageService.loadProducts(userId ?? undefined),
      StorageService.loadProductCategories(userId ?? undefined),
    ]);
    const shouldReplaceServer = Boolean(options?.replaceServer && userId);

    if (localProducts) {
      const refreshed = localProducts.map((p) => ({ ...p, ownerId: userId ?? p.ownerId, status: computeStatus(p.warrantyEnd) }));
      if (shouldReplaceServer && userId) {
        const { error } = await supabase.from('products').delete().eq('user_id', userId);
        if (error) throw new Error(error.message);
      }
      setProducts(refreshed);
      if (userId && !localOnly) {
        const owned = refreshed.filter((p) => !p.ownerId || p.ownerId === userId);
        if (owned.length) {
          supabase.from('products').upsert(owned.map((p) => productToRow(p, userId))).then(({ error }) => {
            if (error) console.warn('products restore sync error:', error.message);
          });
        }
      }
    }
    if (localCategories) {
      const refreshed = localCategories.map(normalizeCategory);
      if (shouldReplaceServer && userId) {
        const { error } = await supabase.from('product_categories').delete().eq('user_id', userId);
        if (error) throw new Error(error.message);
      }
      setProductCategories(refreshed);
      if (userId && !localOnly) {
        supabase.from('product_categories').upsert(refreshed.map((c) => categoryToRow(c, userId))).then(({ error }) => {
          if (error) console.warn('categories restore sync error:', error.message);
        });
      }
    }
  }, [userId]);

  // ─── Context value ─────────────────────────────────────────────────────────

  const value = useMemo<ProductsContextValue>(() => ({
    products, productCategories, loaded, reloadFromStorage,

    addProduct: (input) => {
      const next = { ...buildProduct(input), ownerId: userId ?? undefined };
      setProducts((curr) => [next, ...curr]);
      syncAddProduct(next);
      return next;
    },

    updateProduct: (id, updates) => {
      let updated: Product | undefined;
      setProducts((curr) =>
        curr.map((p) => {
          if (p.id !== id) return p;
          const norm = updates.name ? { ...updates, name: formatProductName(updates.name) } : updates;
          const next = { ...p, ...norm };
          if (updates.warrantyEnd) next.status = computeStatus(updates.warrantyEnd);
          updated = next;
          return next;
        }),
      );
      if (updated) syncUpdateProduct(updated);
    },

    deleteProduct: (id) => {
      setProducts((curr) => curr.filter((p) => p.id !== id));
      setProductCategories((curr) =>
        curr.map((c) => ({ ...c, productIds: c.productIds.filter((pid) => pid !== id) })),
      );
      syncDeleteProduct(id);
      FileStorageService.deleteAllForProduct(id).catch(() => {});
      NotificationService.cancelAllForProduct(id).catch(() => {});
    },

    // Bulk delete that AWAITS the server so success reflects reality (unlike
    // deleteProduct's fire-and-forget sync). Returns false if the server delete
    // fails, so the UI never shows a false "deleted" that resurrects on reload.
    deleteAllProducts: async () => {
      const snapshot = [...products];
      const ownedSnapshot = userId
        ? snapshot.filter((p) => !p.ownerId || p.ownerId === userId)
        : snapshot;
      if (ownedSnapshot.length === 0) return true;

      if (userId && !localOnly) {
        const [productsDelete, categoriesDelete] = await Promise.all([
          supabase.from('products').delete().eq('user_id', userId),
          supabase.from('product_categories').delete().eq('user_id', userId),
        ]);
        const error = productsDelete.error || categoriesDelete.error;
        if (error) {
          console.warn('bulk product delete error:', error.message);
          return false;
        }
        supabase.from('backups').delete().eq('user_id', userId).then(({ error: backupError }) => {
          if (backupError) console.warn('cloud backup cleanup error:', backupError.message);
        });
      }

      // Server delete confirmed (or local-only mode) — clear local state + side effects.
      setProducts((curr) => userId ? curr.filter((p) => p.ownerId && p.ownerId !== userId) : []);
      setProductCategories([]);
      await Promise.all([
        StorageService.clearProducts(userId ?? undefined).catch(() => {}),
        StorageService.clearProductCategories(userId ?? undefined).catch(() => {}),
      ]);
      await Promise.all(
        ownedSnapshot.map((p) => Promise.all([
          FileStorageService.deleteAllForProduct(p.id).catch(() => {}),
          NotificationService.cancelAllForProduct(p.id).catch(() => {}),
        ])),
      );
      return true;
    },

    addDocument: (id, docName) => {
      let updated: Product | undefined;
      setProducts((curr) =>
        curr.map((p) => {
          if (p.id !== id) return p;
          const name = docName?.trim() || `Document_${p.docs.length + 1}.pdf`;
          const next = { ...p, docs: [...p.docs, name] };
          updated = next;
          return next;
        }),
      );
      if (updated) syncUpdateProduct(updated);
    },

    removeDocument: (id, docName) => {
      let updated: Product | undefined;
      setProducts((curr) =>
        curr.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, docs: p.docs.filter((d) => d !== docName) };
          next.docEntries = p.docEntries?.filter((entry) => entry.fileName !== docName && entry.label !== docName);
          updated = next;
          return next;
        }),
      );
      if (updated) syncUpdateProduct(updated);
      FileStorageService.deleteDocument(id, docName).catch(() => {});
    },

    setReminders: (id, reminders) => {
      let updated: Product | undefined;
      setProducts((curr) => {
        const product = curr.find((p) => p.id === id);
        if (product) {
          NotificationService.cancelAllForProduct(id)
            .then(async () => {
              const settings = userId ? await StorageService.loadSettings<ReminderSettings>(userId) : null;
              return Promise.all(reminders.map((d) => NotificationService.scheduleReminder(id, product.name, d, {
                enabled: settings?.remindersEnabled,
                channel: settings?.notificationChannel,
                quietStart: settings?.quietStart,
                quietEnd: settings?.quietEnd,
              })));
            })
            .catch(() => {});
        }
        return curr.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, reminders };
          updated = next;
          return next;
        });
      });
      if (updated) syncUpdateProduct(updated);
    },

    addProductCategory: (name, productIds) => {
      const cat: ProductCategory = normalizeCategory({
        id:        createEntityId(`category-${slugify(name)}`),
        name,      productIds,
        createdAt: new Date().toISOString(),
      });
      setProductCategories((curr) => [cat, ...curr]);
      syncUpsertCategory(cat);
      return cat;
    },

    updateProductCategory: (id, updates) => {
      let updated: ProductCategory | undefined;
      setProductCategories((curr) =>
        curr.map((c) => {
          if (c.id !== id) return c;
          const next = normalizeCategory({ ...c, ...updates });
          updated = next;
          return next;
        }),
      );
      if (updated) syncUpsertCategory(updated);
    },

    deleteProductCategory: (id) => {
      setProductCategories((curr) => curr.filter((c) => c.id !== id));
      syncDeleteCategory(id);
    },
  }), [products, productCategories, loaded, reloadFromStorage, userId, localOnly, syncAddProduct, syncUpdateProduct, syncDeleteProduct, syncUpsertCategory, syncDeleteCategory]);

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider');
  return ctx;
}
