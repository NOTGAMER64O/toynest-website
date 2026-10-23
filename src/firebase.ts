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
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { type Order, type Product, type Suggestion, DEFAULT_PRODUCTS } from './defaultData';

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
  const activeStatuses = ['New', 'Confirmed', 'Preparing', 'Dispatched'];
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
    await setDoc(doc(db, 'orders', order.id), {
      ...order,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCustomerOrdersFromCloud(customerId: string): Promise<Order[]> {
  const path = 'orders';
  try {
    const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    const userOrders: Order[] = [];
    snapshot.forEach((d) => {
      userOrders.push(d.data() as Order);
    });

    // Also fetch all active orders to compute queue accurately
    const allSnapshot = await getDocs(collection(db, 'orders'));
    const allOrders: Order[] = [];
    allSnapshot.forEach((d) => {
      allOrders.push(d.data() as Order);
    });

    const activeStatuses = ['New', 'Confirmed', 'Preparing', 'Dispatched'];
    const active = allOrders
      .filter((o) => activeStatuses.includes(o.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const posMap = new Map<string, { queuePosition: number; peopleAhead: number }>();
    active.forEach((o, idx) => {
      posMap.set(o.id, { queuePosition: idx + 1, peopleAhead: idx });
    });

    return userOrders
      .map((o) => {
        const info = posMap.get(o.id);
        return {
          ...o,
          queuePosition: info ? info.queuePosition : null,
          peopleAhead: info ? info.peopleAhead : 0,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
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
  const path = 'orders';
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
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
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

export async function deleteOrderFromCloud(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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
  const path = 'suggestions';
  try {
    const snapshot = await getDocs(collection(db, 'suggestions'));
    const list: Suggestion[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as Suggestion);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
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
export async function fetchProductsFromCloud(): Promise<Product[]> {
  const path = 'products';
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    const list: Product[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as Product);
    });
    if (list.length === 0) {
      // Seed default products to cloud
      for (const p of DEFAULT_PRODUCTS) {
        await setDoc(doc(db, 'products', p.id), p);
      }
      return DEFAULT_PRODUCTS;
    }
    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return DEFAULT_PRODUCTS;
  }
}

export async function saveProductToCloud(product: Product): Promise<void> {
  const path = `products/${product.id}`;
  try {
    await setDoc(doc(db, 'products', product.id), product);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProductFromCloud(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- SETTINGS & SHOP MODES -----------------
export async function fetchSettingsFromCloud(): Promise<{ adultPublished: boolean; childPublished: boolean; paymentQrUrl: string }> {
  const path = 'settings/store_config';
  try {
    const snap = await getDoc(doc(db, 'settings', 'store_config'));
    if (snap.exists()) {
      const data = snap.data();
      return {
        adultPublished: data.adultPublished !== false,
        childPublished: data.childPublished !== false,
        paymentQrUrl: data.paymentQrUrl || '',
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  return { adultPublished: true, childPublished: true, paymentQrUrl: '' };
}

export async function saveSettingsToCloud(updates: { adultPublished?: boolean; childPublished?: boolean; paymentQrUrl?: string }): Promise<void> {
  const path = 'settings/store_config';
  try {
    await setDoc(doc(db, 'settings', 'store_config'), updates, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
