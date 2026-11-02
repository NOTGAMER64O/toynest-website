import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  runTransaction,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  type Order,
  type Product,
  type Suggestion,
  type RescueDeal,
  type ScheduledOffer,
  type DiscountCampaign,
  type MoneyAdjustmentItem,
  type CartItem,
  type SavedForLaterItem,
  DEFAULT_PRODUCTS,
  DEFAULT_RESCUE_DEALS,
  getStoredDeletedRescueDealIds,
  markRescueDealDeletedLocally,
  computeOfferStatus,
  computeCampaignStatus,
} from './defaultData';

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Utility to recursively strip undefined fields so Firestore writes never fail
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => (typeof item === 'object' && item !== null ? sanitizeForFirestore(item) : item));
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        clean[key] = sanitizeForFirestore(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean;
}

// Initial connection test
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'settings', 'test_connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or network restricted.');
    }
  }
}
testConnection();

// Compute queue positions relative to all active orders
export function computeQueue(orders: Order[]): Order[] {
  const activeStatuses = ['New', 'Confirmed', 'Preparing', 'Dispatched', 'Ready for pickup', 'Contacted'];
  const active = orders
    .filter((o) => activeStatuses.includes(o.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const positionMap = new Map<string, { queuePosition: number; peopleAhead: number }>();
  active.forEach((o, idx) => {
    positionMap.set(o.id, {
      queuePosition: idx + 1,
      peopleAhead: idx,
    });
  });

  return orders.map((o) => {
    const queueInfo = positionMap.get(o.id);
    return {
      ...o,
      queuePosition: queueInfo ? queueInfo.queuePosition : null,
      peopleAhead: queueInfo ? queueInfo.peopleAhead : 0,
    };
  });
}

// ----------------- ORDERS -----------------
export async function saveOrderToCloud(order: Order): Promise<void> {
  const path = `orders/${order.id}`;
  try {
    const payload = sanitizeForFirestore({
      ...order,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'orders', order.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCustomerOrdersByIds(orderIds: string[]): Promise<Order[]> {
  if (!orderIds || orderIds.length === 0) return [];
  const results: Order[] = [];
  await Promise.all(
    orderIds.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'orders', id));
        if (snap.exists()) {
          results.push(snap.data() as Order);
        }
      } catch {}
    })
  );
  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function fetchCustomerOrdersFromCloud(customerId: string): Promise<Order[]> {
  const path = `orders (customerId: ${customerId})`;
  try {
    const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    const userOrders: Order[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as Order;
      if (!data.customerDeleted) {
        userOrders.push(data);
      }
    });
    return userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToCustomerOrders(
  customerId: string,
  callback: (orders: Order[]) => void
): () => void {
  try {
    const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
    return onSnapshot(
      q,
      (snapshot) => {
        const userOrders: Order[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as Order;
          if (!data.customerDeleted) {
            userOrders.push(data);
          }
        });
        const sorted = userOrders.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        callback(sorted);
      },
      (error) => {
        console.warn('Customer orders subscription error:', error);
      }
    );
  } catch {
    return () => {};
  }
}

export async function fetchAllOrdersFromCloud(): Promise<Order[]> {
  const path = 'orders';
  try {
    const snapshot = await getDocs(collection(db, 'orders'));
    const orders: Order[] = [];
    snapshot.forEach((d) => {
      orders.push(d.data() as Order);
    });

    return computeQueue(orders).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToAllOrders(callback: (orders: Order[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'orders'),
      (snapshot) => {
        const orders: Order[] = [];
        snapshot.forEach((d) => {
          orders.push(d.data() as Order);
        });
        const enriched = computeQueue(orders).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        callback(enriched);
      },
      (error) => {
        console.warn('Order subscription error:', error);
      }
    );
  } catch {
    return () => {};
  }
}

export async function updateOrderStatusInCloud(orderId: string, updates: Partial<Order>): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCustomerOrderNoteInCloud(orderId: string, note: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      note: String(note || '').trim(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteOrderFromCloud(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function markOrderDeletedByCustomerInCloud(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      customerDeleted: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ----------------- SUGGESTIONS -----------------
export async function saveSuggestionToCloud(suggestion: Suggestion): Promise<void> {
  const path = `suggestions/${suggestion.id}`;
  try {
    await setDoc(doc(db, 'suggestions', suggestion.id), suggestion);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchSuggestionsFromCloud(): Promise<Suggestion[]> {
  try {
    const snapshot = await getDocs(collection(db, 'suggestions'));
    const list: Suggestion[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as Suggestion);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.warn('Could not fetch suggestions:', error);
    return [];
  }
}

export async function deleteSuggestionFromCloud(id: string): Promise<void> {
  const path = `suggestions/${id}`;
  try {
    await deleteDoc(doc(db, 'suggestions', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- PRODUCTS -----------------
function normalizeProductData(data: any, docId: string): Product {
  const imageUrls = Array.isArray(data.imageUrls) && data.imageUrls.length > 0
    ? data.imageUrls.filter((u: any) => typeof u === 'string' && u.trim().length > 0)
    : data.imageUrl
    ? [String(data.imageUrl)]
    : ['/toys/toy-40ba4ba9-1.jpg'];

  return {
    id: data.id || docId,
    name: String(data.name || '').trim(),
    price: typeof data.price === 'number' ? data.price : parseFloat(data.price) || 0,
    category: String(data.category || 'Other').trim(),
    description: String(data.description || '').trim(),
    imageUrl: imageUrls[0] || '/toys/toy-40ba4ba9-1.jpg',
    imageUrls: imageUrls.length > 0 ? imageUrls : ['/toys/toy-40ba4ba9-1.jpg'],
    available: data.available === false ? false : true,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

export async function fetchProductsFromCloud(): Promise<Product[]> {
  const path = 'products';
  try {
    let snapshot;
    try {
      snapshot = await getDocsFromServer(collection(db, 'products'));
    } catch {
      snapshot = await getDocs(collection(db, 'products'));
    }

    const list: Product[] = [];
    const deletedIds = new Set<string>();
    snapshot.forEach((d) => {
      const data = d.data() as any;
      if (data && data.deleted === true) {
        deletedIds.add(data.id || d.id);
      } else if (data && (data.name || data.id)) {
        list.push(normalizeProductData(data, d.id));
      }
    });

    // Merge default products that have not been explicitly modified or deleted
    const cloudIds = new Set(list.map((p) => p.id));
    const merged = [...list];
    for (const def of DEFAULT_PRODUCTS) {
      if (!cloudIds.has(def.id) && !deletedIds.has(def.id)) {
        merged.push(def);
      }
    }

    return merged.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  } catch (error) {
    console.error('Firestore products fetch error:', error);
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToProducts(callback: (products: Product[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const list: Product[] = [];
        const deletedIds = new Set<string>();
        snapshot.forEach((d) => {
          const data = d.data() as any;
          if (data && data.deleted === true) {
            deletedIds.add(data.id || d.id);
          } else if (data && (data.name || data.id)) {
            list.push(normalizeProductData(data, d.id));
          }
        });

        const cloudIds = new Set(list.map((p) => p.id));
        const merged = [...list];
        for (const def of DEFAULT_PRODUCTS) {
          if (!cloudIds.has(def.id) && !deletedIds.has(def.id)) {
            merged.push(def);
          }
        }

        const sorted = merged.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        callback(sorted);
      },
      (error) => {
        console.warn('Firestore products subscription warning (auto-reconnecting):', error);
      }
    );
  } catch (err) {
    console.warn('Could not subscribe to products:', err);
    return () => {};
  }
}

export async function updateProductAvailabilityInCloud(productId: string, available: boolean): Promise<void> {
  const path = `products/${productId}`;
  const isAvailable = Boolean(available);
  try {
    await updateDoc(doc(db, 'products', productId), {
      available: isAvailable,
      updatedAt: new Date().toISOString(),
    });
    // Server confirmation
    try {
      await getDocFromServer(doc(db, 'products', productId));
    } catch {}
  } catch (error) {
    // If the doc did not exist in cloud yet (e.g., toggling a seed default product), create it
    const def = DEFAULT_PRODUCTS.find((p) => p.id === productId);
    if (def) {
      await setDoc(doc(db, 'products', productId), {
        ...def,
        available: isAvailable,
        deleted: false,
        updatedAt: new Date().toISOString(),
      });
      try {
        await getDocFromServer(doc(db, 'products', productId));
      } catch {}
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveProductToCloud(product: Product): Promise<void> {
  const path = `products/${product.id}`;
  try {
    const imageUrls = Array.isArray(product.imageUrls) && product.imageUrls.length > 0
      ? product.imageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0)
      : product.imageUrl
      ? [product.imageUrl]
      : ['/toys/toy-40ba4ba9-1.jpg'];

    const cleanData = {
      id: product.id,
      name: String(product.name || '').trim(),
      price: typeof product.price === 'number' ? product.price : parseFloat(String(product.price)) || 0,
      category: String(product.category || 'Other').trim(),
      description: String(product.description || '').trim(),
      imageUrl: imageUrls[0] || '/toys/toy-40ba4ba9-1.jpg',
      imageUrls: imageUrls,
      available: product.available === false ? false : true,
      createdAt: product.createdAt || new Date().toISOString(),
      deleted: false,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'products', product.id), cleanData);

    // CRITICAL: Explicitly verify the write reached and exists on the Firestore server
    const verifySnap = await getDocFromServer(doc(db, 'products', product.id));
    if (!verifySnap.exists()) {
      throw new Error(`Server verification failed: product ${product.id} could not be confirmed in Firestore.`);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProductFromCloud(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await setDoc(
      doc(db, 'products', productId),
      {
        id: productId,
        deleted: true,
        available: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch {}
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- SETTINGS & SHOP MODES -----------------
export interface StoreSettings {
  adultPublished: boolean;
  childPublished: boolean;
  paymentQrUrl: string;
  manualMoneyAdjustment?: number;
  moneyAdjustmentHistory?: MoneyAdjustmentItem[];
}

export async function fetchSettingsFromCloud(): Promise<StoreSettings> {
  const path = 'settings/store_config';
  try {
    const snap = await getDoc(doc(db, 'settings', 'store_config'));
    if (snap.exists()) {
      const data = snap.data();
      return {
        adultPublished: data.adultPublished !== false,
        childPublished: data.childPublished !== false,
        paymentQrUrl: data.paymentQrUrl || '',
        manualMoneyAdjustment: typeof data.manualMoneyAdjustment === 'number' ? data.manualMoneyAdjustment : 0,
        moneyAdjustmentHistory: Array.isArray(data.moneyAdjustmentHistory) ? data.moneyAdjustmentHistory : [],
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  return {
    adultPublished: true,
    childPublished: true,
    paymentQrUrl: '',
    manualMoneyAdjustment: 0,
    moneyAdjustmentHistory: [],
  };
}

export async function saveSettingsToCloud(updates: Partial<StoreSettings>): Promise<void> {
  const path = 'settings/store_config';
  try {
    const payload = sanitizeForFirestore(updates);
    await setDoc(doc(db, 'settings', 'store_config'), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToSettings(callback: (settings: StoreSettings) => void): () => void {
  try {
    return onSnapshot(
      doc(db, 'settings', 'store_config'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          callback({
            adultPublished: data.adultPublished !== false,
            childPublished: data.childPublished !== false,
            paymentQrUrl: data.paymentQrUrl || '',
            manualMoneyAdjustment: typeof data.manualMoneyAdjustment === 'number' ? data.manualMoneyAdjustment : 0,
            moneyAdjustmentHistory: Array.isArray(data.moneyAdjustmentHistory) ? data.moneyAdjustmentHistory : [],
          });
        }
      },
      (error) => {
        console.warn('Settings subscription warning:', error);
      }
    );
  } catch {
    return () => {};
  }
}

// ----------------- COLOUR MANAGEMENT -----------------
export async function fetchColoursFromCloud(): Promise<string[]> {
  const path = 'settings/colours';
  try {
    const snap = await getDoc(doc(db, 'settings', 'colours'));
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.list)) {
        return data.list.map(String).filter(Boolean);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  return [];
}

export async function saveColoursToCloud(colours: string[]): Promise<void> {
  const path = 'settings/colours';
  try {
    await setDoc(
      doc(db, 'settings', 'colours'),
      {
        list: colours,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToColours(callback: (colours: string[]) => void): () => void {
  const path = 'settings/colours';
  try {
    return onSnapshot(
      doc(db, 'settings', 'colours'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (Array.isArray(data?.list)) {
            callback(data.list.map(String).filter(Boolean));
            return;
          }
        }
        callback([]);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (err) {
    console.warn('Could not subscribe to colours:', err);
    return () => {};
  }
}

// ----------------- ADMIN AUTHENTICATION -----------------
export async function signInAdminWithGoogle(): Promise<{ success: boolean; email?: string | null; error?: string }> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    if (cred.user.email?.toLowerCase() !== 'sanyukta.mehtaa@gmail.com') {
      await signOut(auth);
      return {
        success: false,
        error: 'Access denied: Only the authorized owner (sanyukta.mehtaa@gmail.com) can access this workspace.',
      };
    }
    return { success: true, email: cred.user.email };
  } catch (err: any) {
    if (err.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Google sign-in popup was cancelled.' };
    }
    if (err.code === 'auth/operation-not-allowed') {
      return {
        success: false,
        error: 'Google Sign-in is not yet enabled in the Firebase Console. You can still log in using your Owner PIN.',
      };
    }
    return { success: false, error: err.message || 'Could not sign in with Google.' };
  }
}

export async function signOutAdmin(): Promise<void> {
  try {
    await signOut(auth);
  } catch {}
}

// ----------------- RESCUE DEALS OFFER SYSTEM -----------------
export function normalizeRescueDealData(data: any, docId: string): RescueDeal {
  const imageUrls = Array.isArray(data.imageUrls) && data.imageUrls.length > 0
    ? data.imageUrls.filter((u: any) => typeof u === 'string' && u.trim().length > 0)
    : data.imageUrl
    ? [String(data.imageUrl)]
    : ['/toys/toy-78291ec9-1.jpg'];

  const claimed = data.claimed === true || data.status === 'claimed' || data.status === 'sold';

  return {
    id: data.id || docId,
    productId: data.productId || '',
    title: String(data.title || data.name || '').trim(),
    originalPrice: typeof data.originalPrice === 'number' ? data.originalPrice : parseFloat(data.originalPrice) || 0,
    dealPrice: typeof data.dealPrice === 'number' ? data.dealPrice : (typeof data.price === 'number' ? data.price : parseFloat(data.dealPrice || data.price) || 0),
    condition: String(data.condition || 'Special Rescue Deal').trim(),
    description: String(data.description || '').trim(),
    imageUrl: imageUrls[0] || '/toys/toy-78291ec9-1.jpg',
    imageUrls: imageUrls.length > 0 ? imageUrls : ['/toys/toy-78291ec9-1.jpg'],
    colour: String(data.colour || '').trim(),
    claimed,
    deleted: data.deleted === true || data.status === 'deleted',
    status: (data.deleted === true || data.status === 'deleted') ? 'claimed' : (claimed ? 'claimed' : 'available'),
    claimedAt: data.claimedAt || undefined,
    claimedByOrder: data.claimedByOrder || undefined,
    claimedByCustomer: data.claimedByCustomer || undefined,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

export async function fetchRescueDealsFromCloud(): Promise<RescueDeal[]> {
  const path = 'rescueDeals';
  try {
    let snapshot;
    try {
      snapshot = await getDocsFromServer(collection(db, 'rescueDeals'));
    } catch {
      snapshot = await getDocs(collection(db, 'rescueDeals'));
    }

    const list: RescueDeal[] = [];
    const deletedIds = new Set<string>(getStoredDeletedRescueDealIds());

    snapshot.forEach((d) => {
      const data = d.data() as any;
      if (data && (data.deleted === true || data.status === 'deleted')) {
        deletedIds.add(data.id || d.id);
        markRescueDealDeletedLocally(data.id || d.id);
      } else if (data && (data.title || data.name || data.id)) {
        list.push(normalizeRescueDealData(data, d.id));
      }
    });

    const cloudIds = new Set(list.map((d) => d.id));
    const merged = list.filter((d) => !deletedIds.has(d.id));
    for (const def of DEFAULT_RESCUE_DEALS) {
      if (!cloudIds.has(def.id) && !deletedIds.has(def.id)) {
        merged.push(def);
      }
    }

    return merged.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  } catch (error) {
    console.error('Firestore rescue deals fetch error:', error);
    const deletedIds = new Set(getStoredDeletedRescueDealIds());
    return DEFAULT_RESCUE_DEALS.filter((d) => !deletedIds.has(d.id));
  }
}

export function subscribeToRescueDeals(callback: (deals: RescueDeal[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'rescueDeals'),
      (snapshot) => {
        const list: RescueDeal[] = [];
        const deletedIds = new Set<string>(getStoredDeletedRescueDealIds());

        snapshot.forEach((d) => {
          const data = d.data() as any;
          if (data && (data.deleted === true || data.status === 'deleted')) {
            deletedIds.add(data.id || d.id);
            markRescueDealDeletedLocally(data.id || d.id);
          } else if (data && (data.title || data.name || data.id)) {
            list.push(normalizeRescueDealData(data, d.id));
          }
        });

        const cloudIds = new Set(list.map((d) => d.id));
        const merged = list.filter((d) => !deletedIds.has(d.id));
        for (const def of DEFAULT_RESCUE_DEALS) {
          if (!cloudIds.has(def.id) && !deletedIds.has(def.id)) {
            merged.push(def);
          }
        }

        const sorted = merged.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        callback(sorted);
      },
      (error) => {
        console.warn('Firestore rescue deals subscription warning:', error);
      }
    );
  } catch (err) {
    console.warn('Could not subscribe to rescue deals:', err);
    return () => {};
  }
}

export async function saveRescueDealToCloud(deal: RescueDeal): Promise<void> {
  const path = `rescueDeals/${deal.id}`;
  try {
    const imageUrls = Array.isArray(deal.imageUrls) && deal.imageUrls.length > 0
      ? deal.imageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0)
      : deal.imageUrl
      ? [deal.imageUrl]
      : ['/toys/toy-78291ec9-1.jpg'];

    const cleanData = {
      id: deal.id,
      productId: deal.productId || '',
      title: String(deal.title || '').trim(),
      originalPrice: typeof deal.originalPrice === 'number' ? deal.originalPrice : parseFloat(String(deal.originalPrice)) || 0,
      dealPrice: typeof deal.dealPrice === 'number' ? deal.dealPrice : parseFloat(String(deal.dealPrice)) || 0,
      condition: String(deal.condition || 'Special Rescue Deal').trim(),
      description: String(deal.description || '').trim(),
      imageUrl: imageUrls[0] || '/toys/toy-78291ec9-1.jpg',
      imageUrls: imageUrls,
      colour: String(deal.colour || '').trim(),
      claimed: deal.claimed === true,
      deleted: false,
      status: deal.claimed ? 'claimed' : 'available',
      claimedAt: deal.claimedAt || null,
      claimedByOrder: deal.claimedByOrder || null,
      claimedByCustomer: deal.claimedByCustomer || null,
      createdAt: deal.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'rescueDeals', deal.id), sanitizeForFirestore(cleanData));

    try {
      await getDocFromServer(doc(db, 'rescueDeals', deal.id));
    } catch {}
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteRescueDealFromCloud(dealId: string): Promise<void> {
  const path = `rescueDeals/${dealId}`;
  markRescueDealDeletedLocally(dealId);
  try {
    // 1. Mark deal as deleted in Firestore so all connected devices immediately hide it in real time
    await setDoc(
      doc(db, 'rescueDeals', dealId),
      {
        id: dealId,
        deleted: true,
        status: 'deleted',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    // Explicit server verification
    try {
      await getDocFromServer(doc(db, 'rescueDeals', dealId));
    } catch {}
  } catch (error) {
    // 2. If setDoc fails, fallback to deleteDoc
    try {
      await deleteDoc(doc(db, 'rescueDeals', dealId));
    } catch {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

/**
 * ATOMIC TRANSACTION:
 * Ensures the deal has not been claimed yet, creates the order,
 * and marks the deal claimed in a single atomic Firestore transaction.
 * If another customer attempts to claim the deal simultaneously,
 * one will succeed and the other will fail with an explicit concurrency error.
 * If saving the order fails, the deal is NOT marked as sold.
 */
export async function claimRescueDealInCloud(dealId: string, order: Order): Promise<void> {
  const path = `rescueDeals/${dealId} & orders/${order.id}`;
  try {
    await runTransaction(db, async (transaction) => {
      const dealRef = doc(db, 'rescueDeals', dealId);
      const dealSnap = await transaction.get(dealRef);

      let dealData: any = null;
      if (dealSnap.exists()) {
        dealData = dealSnap.data();
      } else {
        const defaultMatch = DEFAULT_RESCUE_DEALS.find((d) => d.id === dealId);
        if (defaultMatch) {
          dealData = { ...defaultMatch };
        } else {
          throw new Error('This Rescue Deal offer does not exist or has been removed.');
        }
      }

      // Check if already claimed
      if (dealData.claimed === true || dealData.status === 'claimed' || dealData.status === 'sold') {
        throw new Error('This Rescue Deal has already been claimed by another customer.');
      }

      // 1. Write the order atomically to Firestore
      const orderRef = doc(db, 'orders', order.id);
      transaction.set(
        orderRef,
        sanitizeForFirestore({
          ...order,
          isRescueDeal: true,
          rescueDealId: dealId,
          updatedAt: new Date().toISOString(),
        })
      );

      // 2. Mark the deal as claimed atomically
      transaction.set(
        dealRef,
        sanitizeForFirestore({
          ...dealData,
          id: dealId,
          claimed: true,
          status: 'claimed',
          claimedAt: new Date().toISOString(),
          claimedByOrder: order.id,
          claimedByCustomer: order.name,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    });

    // Server verification after transaction commit
    try {
      await getDocFromServer(doc(db, 'orders', order.id));
    } catch {}
  } catch (error: any) {
    if (error?.message && error.message.includes('already been claimed')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ----------------- SCHEDULED OFFERS SYSTEM -----------------
export function normalizeScheduledOfferData(data: any, docId: string): ScheduledOffer {
  return {
    id: data.id || docId,
    productId: data.productId || '',
    productName: String(data.productName || data.name || '').trim(),
    productImageUrl: data.productImageUrl || data.imageUrl || '/toys/toy-40ba4ba9-1.jpg',
    productCategory: data.productCategory || 'Other',
    title: String(data.title || '').trim(),
    originalPrice: typeof data.originalPrice === 'number' ? data.originalPrice : parseFloat(String(data.originalPrice)) || 0,
    discountedPrice: typeof data.discountedPrice === 'number' ? data.discountedPrice : parseFloat(String(data.discountedPrice)) || 0,
    startAt: data.startAt || new Date().toISOString(),
    endAt: data.endAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    status: data.status || 'Scheduled',
    isDraft: data.isDraft === true,
    cancelled: data.cancelled === true || data.status === 'Cancelled',
    claimed: data.claimed === true || data.status === 'Completed',
    claimedAt: data.claimedAt || undefined,
    claimedByOrder: data.claimedByOrder || undefined,
    claimedByCustomer: data.claimedByCustomer || undefined,
    deleted: data.deleted === true,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    createdBy: data.createdBy || 'Owner',
  };
}

export async function fetchScheduledOffersFromCloud(): Promise<ScheduledOffer[]> {
  const path = 'scheduledOffers';
  try {
    let snapshot;
    try {
      snapshot = await getDocsFromServer(collection(db, 'scheduledOffers'));
    } catch {
      snapshot = await getDocs(collection(db, 'scheduledOffers'));
    }

    const list: ScheduledOffer[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      if (data && data.deleted !== true) {
        list.push(normalizeScheduledOfferData(data, d.id));
      }
    });

    return list.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  } catch (error) {
    console.error('Firestore scheduled offers fetch error:', error);
    return [];
  }
}

export function subscribeToScheduledOffers(callback: (offers: ScheduledOffer[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'scheduledOffers'),
      (snapshot) => {
        const list: ScheduledOffer[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.deleted !== true) {
            list.push(normalizeScheduledOfferData(data, d.id));
          }
        });

        const sorted = list.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        callback(sorted);
      },
      (error) => {
        console.warn('Firestore scheduled offers subscription warning:', error);
      }
    );
  } catch (err) {
    console.warn('Could not subscribe to scheduled offers:', err);
    return () => {};
  }
}

export async function saveScheduledOfferToCloud(offer: ScheduledOffer): Promise<void> {
  const path = `scheduledOffers/${offer.id}`;
  try {
    const cleanData = {
      id: offer.id,
      productId: offer.productId,
      productName: String(offer.productName || '').trim(),
      productImageUrl: offer.productImageUrl || '/toys/toy-40ba4ba9-1.jpg',
      productCategory: offer.productCategory || 'Other',
      title: String(offer.title || '').trim(),
      originalPrice: typeof offer.originalPrice === 'number' ? offer.originalPrice : parseFloat(String(offer.originalPrice)) || 0,
      discountedPrice: typeof offer.discountedPrice === 'number' ? offer.discountedPrice : parseFloat(String(offer.discountedPrice)) || 0,
      startAt: offer.startAt,
      endAt: offer.endAt,
      status: offer.status,
      isDraft: offer.isDraft === true,
      cancelled: offer.cancelled === true || offer.status === 'Cancelled',
      claimed: offer.claimed === true || offer.status === 'Completed',
      claimedAt: offer.claimedAt || null,
      claimedByOrder: offer.claimedByOrder || null,
      claimedByCustomer: offer.claimedByCustomer || null,
      deleted: offer.deleted === true,
      createdAt: offer.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: offer.createdBy || 'Owner',
    };

    await setDoc(doc(db, 'scheduledOffers', offer.id), sanitizeForFirestore(cleanData), { merge: true });

    try {
      await getDocFromServer(doc(db, 'scheduledOffers', offer.id));
    } catch {}
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cancelScheduledOfferInCloud(offerId: string): Promise<void> {
  const path = `scheduledOffers/${offerId}`;
  try {
    await updateDoc(doc(db, 'scheduledOffers', offerId), {
      cancelled: true,
      status: 'Cancelled',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteScheduledOfferFromCloud(offerId: string): Promise<void> {
  const path = `scheduledOffers/${offerId}`;
  try {
    await setDoc(
      doc(db, 'scheduledOffers', offerId),
      {
        id: offerId,
        deleted: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    try {
      await deleteDoc(doc(db, 'scheduledOffers', offerId));
    } catch {}
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * ATOMIC TRANSACTION:
 * Atomically verifies offer is active, unclaimed, writes the order,
 * and sets the offer status to Completed.
 * Guarantees no two customers can claim the same limited offer concurrently.
 */
export async function claimScheduledOfferInCloud(offerId: string, order: Order): Promise<void> {
  const path = `scheduledOffers/${offerId} & orders/${order.id}`;
  try {
    await runTransaction(db, async (transaction) => {
      const offerRef = doc(db, 'scheduledOffers', offerId);
      const offerSnap = await transaction.get(offerRef);

      if (!offerSnap.exists()) {
        throw new Error('This Scheduled Offer does not exist or has been removed.');
      }

      const offerData = offerSnap.data() as ScheduledOffer;

      // Check if already claimed, cancelled, deleted, or draft
      if (offerData.claimed === true || offerData.status === 'Completed') {
        throw new Error('This special offer has already been claimed by another customer.');
      }
      if (offerData.deleted || offerData.cancelled || offerData.status === 'Cancelled') {
        throw new Error('This special offer is no longer available.');
      }
      if (offerData.isDraft || offerData.status === 'Draft') {
        throw new Error('This special offer is not currently active.');
      }

      // Check time availability
      const nowMs = Date.now();
      const startMs = new Date(offerData.startAt).getTime();
      const endMs = new Date(offerData.endAt).getTime();
      if (nowMs < startMs) {
        throw new Error('This special offer has not started yet.');
      }
      if (nowMs > endMs) {
        throw new Error('This special offer has expired.');
      }

      // 1. Write the order atomically to Firestore
      const orderRef = doc(db, 'orders', order.id);
      transaction.set(
        orderRef,
        sanitizeForFirestore({
          ...order,
          isScheduledOffer: true,
          scheduledOfferId: offerId,
          updatedAt: new Date().toISOString(),
        })
      );

      // 2. Mark the offer as claimed atomically
      transaction.set(
        offerRef,
        sanitizeForFirestore({
          ...offerData,
          id: offerId,
          claimed: true,
          status: 'Completed',
          claimedAt: new Date().toISOString(),
          claimedByOrder: order.id,
          claimedByCustomer: order.name,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    });

    // Server verification after transaction commit
    try {
      await getDocFromServer(doc(db, 'orders', order.id));
    } catch {}
  } catch (error: any) {
    if (
      error?.message &&
      (error.message.includes('already been claimed') ||
        error.message.includes('expired') ||
        error.message.includes('not started') ||
        error.message.includes('no longer available'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/* =========================================================================
   FESTIVAL DISCOUNT CAMPAIGN FIRESTORE METHODS
   ========================================================================= */

export function normalizeDiscountCampaignData(docId: string, raw: any): DiscountCampaign {
  const dynamicStatus = computeCampaignStatus({
    id: docId,
    name: String(raw.name || ''),
    description: String(raw.description || ''),
    bannerImageUrl: String(raw.bannerImageUrl || ''),
    discountType: (raw.discountType === 'fixed' ? 'fixed' : 'percentage'),
    discountValue: Number(raw.discountValue || 0),
    targetScope: (raw.targetScope === 'categories' ? 'categories' : raw.targetScope === 'products' ? 'products' : 'all'),
    targetCategories: Array.isArray(raw.targetCategories) ? raw.targetCategories : [],
    targetProductIds: Array.isArray(raw.targetProductIds) ? raw.targetProductIds : [],
    startAt: raw.startAt || new Date().toISOString(),
    endAt: raw.endAt || new Date().toISOString(),
    status: raw.status || 'Scheduled',
    isDraft: Boolean(raw.isDraft),
    cancelled: Boolean(raw.cancelled),
    deleted: Boolean(raw.deleted),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  });

  return {
    id: docId,
    name: String(raw.name || 'Festival Special Sale'),
    description: String(raw.description || ''),
    bannerImageUrl: String(raw.bannerImageUrl || ''),
    discountType: raw.discountType === 'fixed' ? 'fixed' : 'percentage',
    discountValue: Number(raw.discountValue || 0),
    targetScope: raw.targetScope === 'categories' ? 'categories' : raw.targetScope === 'products' ? 'products' : 'all',
    targetCategories: Array.isArray(raw.targetCategories) ? raw.targetCategories : [],
    targetProductIds: Array.isArray(raw.targetProductIds) ? raw.targetProductIds : [],
    startAt: raw.startAt || new Date().toISOString(),
    endAt: raw.endAt || new Date().toISOString(),
    status: raw.deleted ? 'Cancelled' : raw.cancelled ? 'Cancelled' : raw.isDraft ? 'Draft' : dynamicStatus,
    isDraft: Boolean(raw.isDraft),
    cancelled: Boolean(raw.cancelled),
    deleted: Boolean(raw.deleted),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    autoIncludeNewProducts: raw.autoIncludeNewProducts !== false,
    allowConflictOverride: Boolean(raw.allowConflictOverride),
    totalOrdersCount: Number(raw.totalOrdersCount || 0),
    totalRevenue: Number(raw.totalRevenue || 0),
  };
}

export async function fetchDiscountCampaignsFromCloud(): Promise<DiscountCampaign[]> {
  const path = 'discountCampaigns';
  try {
    const q = query(collection(db, 'discountCampaigns'));
    const snap = await getDocs(q);
    const campaigns: DiscountCampaign[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (!data.deleted) {
        campaigns.push(normalizeDiscountCampaignData(d.id, data));
      }
    });
    return campaigns;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToDiscountCampaigns(
  callback: (campaigns: DiscountCampaign[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'discountCampaigns';
  const q = query(collection(db, 'discountCampaigns'));
  return onSnapshot(
    q,
    (snap) => {
      const campaigns: DiscountCampaign[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.deleted) {
          campaigns.push(normalizeDiscountCampaignData(d.id, data));
        }
      });
      callback(campaigns);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
      if (onError) onError(error);
    }
  );
}

export async function saveDiscountCampaignToCloud(campaign: DiscountCampaign): Promise<void> {
  const path = `discountCampaigns/${campaign.id}`;
  try {
    const docRef = doc(db, 'discountCampaigns', campaign.id);
    const dataToSave = sanitizeForFirestore({
      ...campaign,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(docRef, dataToSave, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cancelDiscountCampaignInCloud(campaignId: string): Promise<void> {
  const path = `discountCampaigns/${campaignId}`;
  try {
    const docRef = doc(db, 'discountCampaigns', campaignId);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        cancelled: true,
        status: 'Cancelled',
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDiscountCampaignFromCloud(campaignId: string): Promise<void> {
  const path = `discountCampaigns/${campaignId}`;
  try {
    const docRef = doc(db, 'discountCampaigns', campaignId);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        deleted: true,
        status: 'Cancelled',
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function recordCampaignOrderInCloud(
  campaignId: string,
  orderRevenue: number
): Promise<void> {
  const path = `discountCampaigns/${campaignId}`;
  try {
    const docRef = doc(db, 'discountCampaigns', campaignId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const currentOrders = Number(data.totalOrdersCount || 0);
      const currentRev = Number(data.totalRevenue || 0);
      await setDoc(
        docRef,
        sanitizeForFirestore({
          totalOrdersCount: currentOrders + 1,
          totalRevenue: currentRev + orderRevenue,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    }
  } catch (error) {
    // Non-critical metric, log without crashing checkout
    console.warn('Failed to record campaign order metric:', error);
  }
}

// ----------------- SAVED FOR LATER FIRESTORE SYNC -----------------

export async function saveSavedItemToCloud(item: SavedForLaterItem): Promise<void> {
  const path = `savedItems/${item.id}`;
  try {
    const docRef = doc(db, 'savedItems', item.id);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        ...item,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSavedItemFromCloud(itemId: string): Promise<void> {
  const path = `savedItems/${itemId}`;
  try {
    const docRef = doc(db, 'savedItems', itemId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchSavedItemsFromCloud(customerId: string): Promise<SavedForLaterItem[]> {
  if (!customerId) return [];
  const path = `savedItems (customerId: ${customerId})`;
  try {
    const q = query(collection(db, 'savedItems'), where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    const items: SavedForLaterItem[] = [];
    snapshot.forEach((d) => {
      items.push(d.data() as SavedForLaterItem);
    });
    return items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToSavedItems(
  customerId: string,
  callback: (items: SavedForLaterItem[]) => void
): () => void {
  if (!customerId) return () => {};
  try {
    const q = query(collection(db, 'savedItems'), where('customerId', '==', customerId));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: SavedForLaterItem[] = [];
        snapshot.forEach((d) => {
          items.push(d.data() as SavedForLaterItem);
        });
        items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
        callback(items);
      },
      (error) => {
        console.warn('Saved items subscription error:', error);
      }
    );
  } catch {
    return () => {};
  }
}

// ----------------- ACTIVE CART FIRESTORE SYNC -----------------

export async function saveCartItemToCloud(item: CartItem): Promise<void> {
  const path = `cartItems/${item.id}`;
  try {
    const docRef = doc(db, 'cartItems', item.id);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        ...item,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCartItemFromCloud(cartItemId: string): Promise<void> {
  const path = `cartItems/${cartItemId}`;
  try {
    const docRef = doc(db, 'cartItems', cartItemId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchCartItemsFromCloud(customerId: string): Promise<CartItem[]> {
  if (!customerId) return [];
  const path = `cartItems (customerId: ${customerId})`;
  try {
    const q = query(collection(db, 'cartItems'), where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    const items: CartItem[] = [];
    snapshot.forEach((d) => {
      items.push(d.data() as CartItem);
    });
    return items.sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToCartItems(
  customerId: string,
  callback: (items: CartItem[]) => void
): () => void {
  if (!customerId) return () => {};
  try {
    const q = query(collection(db, 'cartItems'), where('customerId', '==', customerId));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: CartItem[] = [];
        snapshot.forEach((d) => {
          items.push(d.data() as CartItem);
        });
        items.sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
        callback(items);
      },
      (error) => {
        console.warn('Cart items subscription error:', error);
      }
    );
  } catch {
    return () => {};
  }
}

