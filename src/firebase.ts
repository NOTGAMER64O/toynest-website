import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  type FirestoreSettings,
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
  limit,
  startAfter,
  onSnapshot,
  updateDoc,
  deleteDoc,
  runTransaction,
  writeBatch,
  increment,
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
  type PopularSearchItem,
  type AnalyticsEvent,
  type AnalyticsCustomer,
  type ProductQuestion,
  type ProductQuestionStatus,
  type AiAssistantState,
  type AiKnowledgeEntry,
  type AiTrainingAnswer,
  type AiTrainingStepKey,
  type AiGuidanceQuestion,
  type WatchdogAlert,
  type WatchdogActivityLog,
  DEFAULT_PRODUCTS,
  DEFAULT_RESCUE_DEALS,
  DEFAULT_AI_ASSISTANT_STATE,
  getStoredDeletedRescueDealIds,
  markRescueDealDeletedLocally,
  computeOfferStatus,
  computeCampaignStatus,
  getISTDateKey,
  getGuestShortCode,
  isRegisteredCustomerId,
} from './defaultData';
import { smartSearchProducts } from './utils/smartSearch';
import { findProductBySlugOrId } from './utils/productSlug';

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

function createFirestoreInstance() {
  try {
    return initializeFirestore(
      app,
      {
        localCache:
          typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
            ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
            : memoryLocalCache(),
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
      } as FirestoreSettings,
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          localCache: memoryLocalCache(),
          experimentalAutoDetectLongPolling: true,
          ignoreUndefinedProperties: true,
        } as FirestoreSettings,
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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

export function isOfflineOrTransientError(error: unknown): boolean {
  const code = typeof (error as any)?.code === 'string' ? (error as any).code : '';
  const status = Number((error as any)?.status || 0);
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    status === 429 ||
    status === 503 ||
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    code === 'resource-exhausted' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    message.includes('the client is offline') ||
    message.includes('Failed to get document because the client is offline') ||
    message.includes('Could not reach Cloud Firestore backend') ||
    message.includes('Quota limit exceeded') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('timed out') ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError')
  );
}

const DEFAULT_FIRESTORE_TIMEOUT_MS = 10000;

export async function withFirestoreTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_FIRESTORE_TIMEOUT_MS,
  label: string = 'Firestore request'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`${label} timed out after ${timeoutMs}ms`);
          (err as any).code = 'deadline-exceeded';
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ----------------- IN-FLIGHT DEDUP & SHORT-TTL CACHE -----------------
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

function getCachedValue<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCachedValue<T>(key: string, data: T, ttlMs: number): void {
  if (ttlMs <= 0) return;
  responseCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateFirestoreCache(prefix?: string): void {
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const k of Array.from(responseCache.keys())) {
    if (k === prefix || k.startsWith(prefix)) {
      responseCache.delete(k);
    }
  }
}

async function dedupedCachedFetch<T>(
  key: string,
  ttlMs: number,
  forceRefresh: boolean,
  fetcher: () => Promise<T>
): Promise<T> {
  if (!forceRefresh) {
    const cached = getCachedValue<T>(key);
    if (cached !== null) {
      return cached;
    }
  }

  const inflightKey = forceRefresh ? `${key}::force` : key;
  const existingPromise = inFlightRequests.get(inflightKey);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const runPromise = (async () => {
    try {
      const result = await fetcher();
      setCachedValue(key, result, ttlMs);
      return result;
    } finally {
      inFlightRequests.delete(inflightKey);
    }
  })();

  inFlightRequests.set(inflightKey, runPromise);
  return runPromise;
}

function parseFirestoreRestValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return String(val.stringValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return arr.map((item: any) => parseFirestoreRestValue(item));
  }
  if ('mapValue' in val) {
    return parseFirestoreRestFields(val.mapValue?.fields || {});
  }
  return undefined;
}

function parseFirestoreRestFields(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) {
    const parsed = parseFirestoreRestValue(v);
    if (parsed !== undefined) {
      result[k] = parsed;
    }
  }
  return result;
}

async function fetchFirestoreDocViaRest(collectionName: string, docId: string): Promise<Record<string, any> | null> {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
      const res = await fetch(url, {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json || !json.fields) return null;
      return parseFirestoreRestFields(json.fields);
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

async function runFirestoreStructuredQueryViaRest(
  structuredQuery: Record<string, any>,
  timeoutMs: number = 9000
): Promise<Array<{ id: string; fields: Record<string, any> }>> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) {
      const err: any = new Error(`Firestore REST runQuery HTTP ${res.status}`);
      err.status = res.status;
      if (res.status === 429) err.code = 'resource-exhausted';
      throw err;
    }
    const rows = (await res.json()) as any[];
    if (!Array.isArray(rows)) return [];
    const results: Array<{ id: string; fields: Record<string, any> }> = [];
    for (const row of rows) {
      if (!row?.document?.name || !row?.document?.fields) continue;
      const parts = String(row.document.name).split('/');
      const docId = parts[parts.length - 1] || '';
      results.push({
        id: docId,
        fields: parseFirestoreRestFields(row.document.fields),
      });
    }
    return results;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function parseShuffleOrderIds(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const clean = typeof item === 'string' ? item.trim() : '';
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    unique.push(clean);
  }
  return unique;
}

function buildSettingsFromRaw(data: Record<string, any>): StoreSettings {
  return {
    adultPublished: data.adultPublished !== false,
    childPublished: data.childPublished !== false,
    paymentQrUrl: data.paymentQrUrl || '',
    manualMoneyAdjustment: typeof data.manualMoneyAdjustment === 'number' ? data.manualMoneyAdjustment : 0,
    moneyAdjustmentHistory: Array.isArray(data.moneyAdjustmentHistory) ? data.moneyAdjustmentHistory : [],
    filamentCostPerGram: parseFilamentCostPerGram(data.filamentCostPerGram),
    filamentCostUpdatedAt: typeof data.filamentCostUpdatedAt === 'string' ? data.filamentCostUpdatedAt : undefined,
    productShuffleOrder: parseShuffleOrderIds(data.productShuffleOrder),
    productAutoShuffle: data.productAutoShuffle === true,
    productShuffledAt: typeof data.productShuffledAt === 'string' ? data.productShuffledAt : undefined,
  };
}

// Initial connection test — also primes settings cache so startup avoids duplicate reads
export async function testConnection() {
  try {
    const snap = await withFirestoreTimeout(
      getDocFromServer(doc(db, 'settings', 'store_config')),
      7000,
      'testConnection'
    );
    if (snap.exists()) {
      setCachedValue('settings:store_config', buildSettingsFromRaw(snap.data()), 60000);
    }
  } catch (error) {
    if (!isOfflineOrTransientError(error)) {
      console.warn('Firestore connection check warning:', error);
    }
  }
}
void testConnection();

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
  invalidateFirestoreCache('customerOrders:');
  invalidateFirestoreCache('allOrders');
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

export async function fetchCustomerOrdersFromCloud(
  customerId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<Order[]> {
  if (!customerId) return [];
  const path = `orders (customerId: ${customerId})`;
  return dedupedCachedFetch(`customerOrders:${customerId}`, 15000, Boolean(options.forceRefresh), async () => {
    try {
      const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(q) : getDocs(q),
        10000,
        'fetchCustomerOrdersFromCloud'
      );
      const userOrders: Order[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as Order;
        if (!data.customerDeleted) {
          userOrders.push(data);
        }
      });
      return userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      if (isOfflineOrTransientError(err)) {
        console.warn('Customer orders fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(err, OperationType.LIST, path);
      return [];
    }
  });
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

export async function fetchAllOrdersFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<Order[]> {
  const path = 'orders';
  return dedupedCachedFetch('allOrders', 15000, Boolean(options.forceRefresh), async () => {
    try {
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh
          ? getDocsFromServer(collection(db, 'orders'))
          : getDocs(collection(db, 'orders')),
        12000,
        'fetchAllOrdersFromCloud'
      );
      const orders: Order[] = [];
      snapshot.forEach((d) => {
        orders.push(d.data() as Order);
      });

      return computeQueue(orders).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        console.warn('Orders list fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
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
  invalidateFirestoreCache('customerOrders:');
  invalidateFirestoreCache('allOrders');
  try {
    await updateDoc(
      doc(db, 'orders', orderId),
      sanitizeForFirestore({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitCustomerOrderClarificationInCloud(
  orderId: string,
  clarificationText: string,
  nextAiVerification: Order['aiVerification'],
  optionalContactUpdates?: { phone?: string; address?: string; studentClass?: string; section?: string }
): Promise<void> {
  const path = `orders/${orderId}`;
  invalidateFirestoreCache('customerOrders:');
  invalidateFirestoreCache('allOrders');
  try {
    await updateDoc(
      doc(db, 'orders', orderId),
      sanitizeForFirestore({
        note: clarificationText.trim(),
        status: 'Clarification Submitted',
        ...(optionalContactUpdates?.phone !== undefined ? { phone: optionalContactUpdates.phone.trim() } : {}),
        ...(optionalContactUpdates?.address !== undefined ? { address: optionalContactUpdates.address.trim() } : {}),
        ...(optionalContactUpdates?.studentClass !== undefined ? { studentClass: optionalContactUpdates.studentClass } : {}),
        ...(optionalContactUpdates?.section !== undefined ? { section: optionalContactUpdates.section.trim() } : {}),
        aiVerification: nextAiVerification,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCustomerOrderNoteInCloud(orderId: string, note: string): Promise<void> {
  const path = `orders/${orderId}`;
  invalidateFirestoreCache('customerOrders:');
  invalidateFirestoreCache('allOrders');
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
  invalidateFirestoreCache('customerOrders:');
  invalidateFirestoreCache('allOrders');
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function markOrderDeletedByCustomerInCloud(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  invalidateFirestoreCache('customerOrders:');
  invalidateFirestoreCache('allOrders');
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
function sanitizeProductHighlights(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => (typeof h === 'string' ? h.trim().slice(0, 160) : ''))
    .filter((h) => h.length > 0)
    .slice(0, 6);
}

function normalizeProductData(
  data: any,
  docId: string,
  options: { isSummaryOnly?: boolean } = {}
): Product {
  const imageUrls = Array.isArray(data.imageUrls) && data.imageUrls.length > 0
    ? data.imageUrls.filter((u: any) => typeof u === 'string' && u.trim().length > 0)
    : data.imageUrl
    ? [String(data.imageUrl)]
    : ['/toys/toy-40ba4ba9-1.jpg'];
  const highlights = sanitizeProductHighlights(data.highlights);

  const cleanSlug = typeof data.slug === 'string' ? data.slug.trim().toLowerCase() : '';
  const photoCount =
    typeof data.photoCount === 'number' && isFinite(data.photoCount) && data.photoCount > 0
      ? Math.round(data.photoCount)
      : imageUrls.length;

  return {
    id: data.id || docId,
    ...(cleanSlug ? { slug: cleanSlug } : {}),
    name: String(data.name || '').trim(),
    price: typeof data.price === 'number' ? data.price : parseFloat(data.price) || 0,
    category: String(data.category || 'Other').trim(),
    description: String(data.description || '').trim(),
    ...(highlights.length > 0 ? { highlights } : {}),
    imageUrl: imageUrls[0] || '/toys/toy-40ba4ba9-1.jpg',
    imageUrls: imageUrls.length > 0 ? imageUrls : ['/toys/toy-40ba4ba9-1.jpg'],
    available: data.available === false ? false : true,
    createdAt: data.createdAt || new Date().toISOString(),
    photoCount,
    ...(options.isSummaryOnly ? { isSummaryOnly: true } : {}),
  };
}

const PRODUCT_SUMMARY_SELECT_FIELDS = [
  { fieldPath: 'id' },
  { fieldPath: 'slug' },
  { fieldPath: 'name' },
  { fieldPath: 'price' },
  { fieldPath: 'category' },
  { fieldPath: 'description' },
  { fieldPath: 'highlights' },
  { fieldPath: 'imageUrl' },
  { fieldPath: 'photoCount' },
  { fieldPath: 'available' },
  { fieldPath: 'createdAt' },
  { fieldPath: 'deleted' },
];

export interface ProductPageResult {
  products: Product[];
  hasMore: boolean;
  nextCursorCreatedAt: string | null;
  degradedOffline?: boolean;
}

/**
 * Fetches a paginated slice of lightweight product summaries (cover image only,
 * omitting heavy base64 gallery arrays) sorted newest-first using Firestore's
 * built-in single-field `createdAt` index (zero composite indexes required).
 * Falls back cleanly to SDK cache (`getDocs`) and DEFAULT_PRODUCTS on transient/quota errors.
 */
export async function fetchProductsPageFromCloud(
  options: {
    pageSize?: number;
    cursorCreatedAt?: string | null;
    forceRefresh?: boolean;
  } = {}
): Promise<ProductPageResult> {
  const pageSize = Math.max(4, Math.min(36, options.pageSize || 12));
  const cursor = options.cursorCreatedAt || null;
  const cacheKey = `products:page:${pageSize}:${cursor || 'first'}`;

  return dedupedCachedFetch(cacheKey, 60000, Boolean(options.forceRefresh), async () => {
    try {
      const structuredQuery: Record<string, any> = {
        from: [{ collectionId: 'products' }],
        select: { fields: PRODUCT_SUMMARY_SELECT_FIELDS },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: pageSize + 1,
      };
      if (cursor) {
        structuredQuery.startAt = {
          values: [{ stringValue: cursor }],
          before: false,
        };
      }

      const rows = await runFirestoreStructuredQueryViaRest(structuredQuery, 9000);
      const hasMore = rows.length > pageSize;
      const slicedRows = hasMore ? rows.slice(0, pageSize) : rows;
      const lastRaw = slicedRows[slicedRows.length - 1];
      const nextCursorCreatedAt =
        hasMore && lastRaw?.fields?.createdAt ? String(lastRaw.fields.createdAt) : null;

      const list: Product[] = [];
      const deletedIds = new Set<string>();
      for (const row of slicedRows) {
        const data = row.fields;
        if (data && data.deleted === true) {
          deletedIds.add(String(data.id || row.id));
        } else if (data && (data.name || data.id)) {
          list.push(normalizeProductData(data, row.id, { isSummaryOnly: true }));
        }
      }

      if (!hasMore && !cursor) {
        const cloudIds = new Set(list.map((p) => p.id));
        for (const def of DEFAULT_PRODUCTS) {
          if (!cloudIds.has(def.id) && !deletedIds.has(def.id)) {
            list.push(def);
          }
        }
      } else if (!hasMore && cursor) {
        const cloudIds = new Set(list.map((p) => p.id));
        for (const def of DEFAULT_PRODUCTS) {
          if (!cloudIds.has(def.id) && !deletedIds.has(def.id)) {
            list.push(def);
          }
        }
      }

      return {
        products: list.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        ),
        hasMore,
        nextCursorCreatedAt,
      };
    } catch (restError) {
      // Fallback to Firestore Web SDK cache/network query
      try {
        const baseRef = collection(db, 'products');
        const q = cursor
          ? query(baseRef, orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize + 1))
          : query(baseRef, orderBy('createdAt', 'desc'), limit(pageSize + 1));
        const snapshot = await withFirestoreTimeout(
          options.forceRefresh ? getDocsFromServer(q) : getDocs(q),
          9000,
          'fetchProductsPageFromCloud'
        );

        const docs = snapshot.docs;
        const hasMore = docs.length > pageSize;
        const slicedDocs = hasMore ? docs.slice(0, pageSize) : docs;
        const lastDoc = slicedDocs[slicedDocs.length - 1];
        const nextCursorCreatedAt =
          hasMore && lastDoc?.data()?.createdAt ? String(lastDoc.data().createdAt) : null;

        const list: Product[] = [];
        const deletedIds = new Set<string>();
        for (const d of slicedDocs) {
          const data = d.data() as any;
          if (data && data.deleted === true) {
            deletedIds.add(data.id || d.id);
          } else if (data && (data.name || data.id)) {
            list.push(normalizeProductData(data, d.id, { isSummaryOnly: false }));
          }
        }

        if (!hasMore) {
          const cloudIds = new Set(list.map((p) => p.id));
          for (const def of DEFAULT_PRODUCTS) {
            if (!cloudIds.has(def.id) && !deletedIds.has(def.id)) {
              list.push(def);
            }
          }
        }

        return {
          products: list.sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          ),
          hasMore,
          nextCursorCreatedAt,
        };
      } catch (sdkErr) {
        if (isOfflineOrTransientError(sdkErr) || isOfflineOrTransientError(restError)) {
          console.warn('Products page fetch degraded gracefully while offline/rate-limited.');
          return {
            products: cursor
              ? []
              : [...DEFAULT_PRODUCTS].sort(
                  (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                ),
            hasMore: false,
            nextCursorCreatedAt: null,
            degradedOffline: true,
          };
        }
        throw sdkErr;
      }
    }
  });
}

/**
 * Fetches lightweight summaries for all products (no multi-image arrays) — ideal for
 * category filtering, search expansion, and dynamic slug resolution (~80% smaller than full collection).
 */
export async function fetchAllProductSummariesFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<Product[]> {
  return dedupedCachedFetch('products:summaries_all', 60000, Boolean(options.forceRefresh), async () => {
    try {
      const rows = await runFirestoreStructuredQueryViaRest(
        {
          from: [{ collectionId: 'products' }],
          select: { fields: PRODUCT_SUMMARY_SELECT_FIELDS },
          limit: 200,
        },
        10000
      );

      const list: Product[] = [];
      const deletedIds = new Set<string>();
      for (const row of rows) {
        const data = row.fields;
        if (data && data.deleted === true) {
          deletedIds.add(String(data.id || row.id));
        } else if (data && (data.name || data.id)) {
          list.push(normalizeProductData(data, row.id, { isSummaryOnly: true }));
        }
      }

      const cloudIds = new Set(list.map((p) => p.id));
      for (const def of DEFAULT_PRODUCTS) {
        if (!cloudIds.has(def.id) && !deletedIds.has(def.id)) {
          list.push(def);
        }
      }

      return list.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    } catch {
      return fetchProductsFromCloud(options);
    }
  });
}

/**
 * Fetches a single full product document (including full gallery `imageUrls`) by ID.
 * Uses Firestore SDK `getDoc` so IndexedDB cache hits instantaneously on repeat views.
 */
export async function fetchProductByIdFromCloud(
  productId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<Product | null> {
  if (!productId) return null;
  const cacheKey = `products:detail:${productId}`;
  return dedupedCachedFetch(cacheKey, 120000, Boolean(options.forceRefresh), async () => {
    try {
      const snap = await withFirestoreTimeout(
        options.forceRefresh
          ? getDocFromServer(doc(db, 'products', productId))
          : getDoc(doc(db, 'products', productId)),
        9000,
        `fetchProductByIdFromCloud(${productId})`
      );
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data?.deleted === true) return null;
        return normalizeProductData(data, snap.id, { isSummaryOnly: false });
      }
    } catch (err) {
      if (isOfflineOrTransientError(err)) {
        const restData = await fetchFirestoreDocViaRest('products', productId);
        if (restData && restData.deleted !== true) {
          return normalizeProductData(restData, productId, { isSummaryOnly: false });
        }
      }
    }
    const def = DEFAULT_PRODUCTS.find((p) => p.id === productId);
    return def || null;
  });
}

/**
 * Resolves a product from a clean URL slug or document ID efficiently (single-doc or lightweight
 * slug query first; falls back to lightweight summary scan only if needed), then hydrates its
 * single full product document for gallery images.
 */
export async function fetchProductBySlugOrIdFromCloud(
  slugOrId: string,
  existingProducts: Product[] = []
): Promise<Product | null> {
  const cleanTarget = String(slugOrId || '').trim();
  if (!cleanTarget) return null;

  const localMatch = findProductBySlugOrId(cleanTarget, existingProducts);
  if (localMatch) {
    if (!localMatch.isSummaryOnly) return localMatch;
    const full = await fetchProductByIdFromCloud(localMatch.id);
    return full || localMatch;
  }

  // 1. Try direct ID lookup if target matches doc ID format or already exists as ID
  try {
    const directSnap = await withFirestoreTimeout(
      getDoc(doc(db, 'products', cleanTarget)),
      7000,
      'directProductLookup'
    );
    if (directSnap.exists()) {
      const data = directSnap.data() as any;
      if (data?.deleted !== true) {
        return normalizeProductData(data, directSnap.id, { isSummaryOnly: false });
      }
    }
  } catch {}

  // 2. Try indexed single-field `slug` equality query (0 composite index required)
  const normalizedSlug = cleanTarget.toLowerCase();
  try {
    const slugQ = query(collection(db, 'products'), where('slug', '==', normalizedSlug), limit(1));
    const slugSnap = await withFirestoreTimeout(getDocs(slugQ), 7000, 'slugLookup');
    if (!slugSnap.empty) {
      const d = slugSnap.docs[0];
      const data = d.data() as any;
      if (data?.deleted !== true) {
        return normalizeProductData(data, d.id, { isSummaryOnly: false });
      }
    }
  } catch {}

  // 3. Fallback: lightweight projected summary scan (no multi-photo bloat), then hydrate single doc
  try {
    const summaries = await fetchAllProductSummariesFromCloud();
    const matched = findProductBySlugOrId(cleanTarget, summaries);
    if (!matched) return null;
    const full = await fetchProductByIdFromCloud(matched.id);
    return full || matched;
  } catch {
    return null;
  }
}

export async function fetchProductsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<Product[]> {
  const path = 'products';
  return dedupedCachedFetch('products:all', 60000, Boolean(options.forceRefresh), async () => {
    try {
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh
          ? getDocsFromServer(collection(db, 'products'))
          : getDocs(collection(db, 'products')),
        12000,
        'fetchProductsFromCloud'
      );

      const list: Product[] = [];
      const deletedIds = new Set<string>();
      snapshot.forEach((d) => {
        const data = d.data() as any;
        if (data && data.deleted === true) {
          deletedIds.add(data.id || d.id);
        } else if (data && (data.name || data.id)) {
          list.push(normalizeProductData(data, d.id, { isSummaryOnly: false }));
        }
      });

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
      if (isOfflineOrTransientError(error)) {
        console.warn('Firestore products fetch skipped while offline/rate-limited; using cached/default catalog.');
        return [...DEFAULT_PRODUCTS].sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
      }
      console.error('Firestore products fetch error:', error);
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
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
            list.push(normalizeProductData(data, d.id, { isSummaryOnly: false }));
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
        setCachedValue('products:all', sorted, 60000);
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

export function filterAndRankProducts(products: Product[], rawQuery: string): Product[] {
  const q = rawQuery.trim();
  const availableProducts = products.filter((p) => p && p.available !== false);
  if (!q) return availableProducts;
  return smartSearchProducts(availableProducts, q).products;
}

export async function searchProductsFromCloud(rawQuery: string): Promise<Product[]> {
  const allProducts = await fetchAllProductSummariesFromCloud();
  return filterAndRankProducts(allProducts, rawQuery);
}

export async function updateProductAvailabilityInCloud(productId: string, available: boolean): Promise<void> {
  const path = `products/${productId}`;
  const isAvailable = Boolean(available);
  invalidateFirestoreCache('products:');
  try {
    await updateDoc(doc(db, 'products', productId), {
      available: isAvailable,
      updatedAt: new Date().toISOString(),
    });
    try {
      await getDocFromServer(doc(db, 'products', productId));
    } catch {}
  } catch (error) {
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
  invalidateFirestoreCache('products:');
  try {
    const imageUrls = Array.isArray(product.imageUrls) && product.imageUrls.length > 0
      ? product.imageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0)
      : product.imageUrl
      ? [product.imageUrl]
      : ['/toys/toy-40ba4ba9-1.jpg'];

    const highlights = sanitizeProductHighlights(product.highlights);

    const cleanData = {
      id: product.id,
      ...(typeof product.slug === 'string' && product.slug.trim()
        ? { slug: product.slug.trim().toLowerCase() }
        : {}),
      name: String(product.name || '').trim(),
      price: typeof product.price === 'number' ? product.price : parseFloat(String(product.price)) || 0,
      category: String(product.category || 'Other').trim(),
      description: String(product.description || '').trim(),
      highlights,
      imageUrl: imageUrls[0] || '/toys/toy-40ba4ba9-1.jpg',
      imageUrls: imageUrls,
      photoCount: imageUrls.length,
      available: product.available === false ? false : true,
      createdAt: product.createdAt || new Date().toISOString(),
      deleted: false,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'products', product.id), cleanData);

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
  invalidateFirestoreCache('products:');
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
  filamentCostPerGram?: number | null;
  filamentCostUpdatedAt?: string;
  productShuffleOrder?: string[];
  productAutoShuffle?: boolean;
  productShuffledAt?: string;
}

function parseFilamentCostPerGram(raw: any): number | null {
  if (typeof raw === 'number' && isFinite(raw) && raw > 0) {
    return Math.round(raw * 100) / 100;
  }
  return null;
}

export async function fetchSettingsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<StoreSettings> {
  const path = 'settings/store_config';
  return dedupedCachedFetch('settings:store_config', 60000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = doc(db, 'settings', 'store_config');
      const snap = await withFirestoreTimeout(
        options.forceRefresh ? getDocFromServer(ref) : getDoc(ref),
        8000,
        'fetchSettingsFromCloud'
      );
      if (snap.exists()) {
        return buildSettingsFromRaw(snap.data());
      }
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        const restData = await fetchFirestoreDocViaRest('settings', 'store_config');
        if (restData) {
          return buildSettingsFromRaw(restData);
        }
        throw error;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
    return {
      adultPublished: true,
      childPublished: true,
      paymentQrUrl: '',
      manualMoneyAdjustment: 0,
      moneyAdjustmentHistory: [],
      filamentCostPerGram: null,
      productShuffleOrder: [],
      productAutoShuffle: false,
    };
  });
}

export async function saveSettingsToCloud(updates: Partial<StoreSettings>): Promise<void> {
  const path = 'settings/store_config';
  invalidateFirestoreCache('settings:');
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
          const parsed = buildSettingsFromRaw(snapshot.data());
          setCachedValue('settings:store_config', parsed, 60000);
          callback(parsed);
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
export async function fetchColoursFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<string[]> {
  const path = 'settings/colours';
  return dedupedCachedFetch('settings:colours', 120000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = doc(db, 'settings', 'colours');
      const snap = await withFirestoreTimeout(
        options.forceRefresh ? getDocFromServer(ref) : getDoc(ref),
        8000,
        'fetchColoursFromCloud'
      );
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.list)) {
          return data.list.map(String).filter(Boolean);
        }
      }
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        const restData = await fetchFirestoreDocViaRest('settings', 'colours');
        if (restData && Array.isArray(restData.list)) {
          return restData.list.map(String).filter(Boolean);
        }
        throw error;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
    return [];
  });
}

export async function saveColoursToCloud(colours: string[]): Promise<void> {
  const path = 'settings/colours';
  invalidateFirestoreCache('settings:colours');
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
        if (isOfflineOrTransientError(error)) {
          console.warn('Colours subscription offline warning:', error);
          return;
        }
        try {
          handleFirestoreError(error, OperationType.GET, path);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('Could not subscribe to colours:', err);
    return () => {};
  }
}

function formatFirebaseAuthError(err: any, options: { isOwner?: boolean } = {}): string {
  const code = String(err?.code || '');
  const rawMessage = String(err?.message || '');
  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'this domain';
  const currentHost =
    typeof window !== 'undefined' ? window.location.hostname : 'this domain';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return options.isOwner
      ? 'Google sign-in popup was cancelled.'
      : 'Sign-in popup was cancelled.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Sign-in popup was blocked by your browser. Please allow popups and try again.';
  }
  if (code === 'auth/operation-not-allowed') {
    return options.isOwner
      ? 'Google Sign-in is not yet enabled in the Firebase Console. You can still log in using your Owner PIN.'
      : 'Google Sign-In is not yet enabled in Firebase Authentication.';
  }
  if (
    code === 'auth/requests-from-referer-are-blocked' ||
    rawMessage.includes('requests-from-referer') ||
    rawMessage.includes('API_KEY_HTTP_REFERRER_BLOCKED')
  ) {
    return `Sign-in is blocked by your Firebase API Key's HTTP referrer restrictions in Google Cloud Console. Allow both ${currentOrigin}/* and https://famous-hook-j3kqt.firebaseapp.com/* under Website restrictions, or continue as a guest.`;
  }
  if (code === 'auth/unauthorized-domain') {
    return `Domain "${currentHost}" is not in Firebase Authentication Authorized Domains. Add it in Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while connecting to Google Sign-In. Please check your internet connection and try again.';
  }
  if (code === 'auth/internal-error') {
    return 'Google Sign-In could not complete (Firebase auth handler blocked or misconfigured). Check Authorized Domains and API key HTTP referrer restrictions, or continue as a guest.';
  }
  return rawMessage || 'Could not sign in right now.';
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
    return { success: false, error: formatFirebaseAuthError(err, { isOwner: true }) };
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

export async function fetchRescueDealsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<RescueDeal[]> {
  return dedupedCachedFetch('rescueDeals:all', 30000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = collection(db, 'rescueDeals');
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
        9000,
        'fetchRescueDealsFromCloud'
      );

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
      console.warn('Firestore rescue deals fetch warning:', error);
      const deletedIds = new Set(getStoredDeletedRescueDealIds());
      return DEFAULT_RESCUE_DEALS.filter((d) => !deletedIds.has(d.id));
    }
  });
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
        setCachedValue('rescueDeals:all', sorted, 30000);
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
  invalidateFirestoreCache('rescueDeals:');
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
  invalidateFirestoreCache('rescueDeals:');
  try {
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
    try {
      await getDocFromServer(doc(db, 'rescueDeals', dealId));
    } catch {}
  } catch (error) {
    try {
      await deleteDoc(doc(db, 'rescueDeals', dealId));
    } catch {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

export async function claimRescueDealInCloud(dealId: string, order: Order): Promise<void> {
  const path = `rescueDeals/${dealId} & orders/${order.id}`;
  invalidateFirestoreCache('rescueDeals:');
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

      if (dealData.claimed === true || dealData.status === 'claimed' || dealData.status === 'sold') {
        throw new Error('This Rescue Deal has already been claimed by another customer.');
      }

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

export async function fetchScheduledOffersFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<ScheduledOffer[]> {
  return dedupedCachedFetch('scheduledOffers:all', 30000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = collection(db, 'scheduledOffers');
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
        9000,
        'fetchScheduledOffersFromCloud'
      );

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
      console.warn('Firestore scheduled offers fetch warning:', error);
      return [];
    }
  });
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
        setCachedValue('scheduledOffers:all', sorted, 30000);
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
  invalidateFirestoreCache('scheduledOffers:');
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
  invalidateFirestoreCache('scheduledOffers:');
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
  invalidateFirestoreCache('scheduledOffers:');
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
  invalidateFirestoreCache('scheduledOffers:');
  invalidateFirestoreCache('customerOrders:');
  invalidateFirestoreCache('allOrders');
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

export async function fetchDiscountCampaignsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<DiscountCampaign[]> {
  const path = 'discountCampaigns';
  return dedupedCachedFetch('discountCampaigns:all', 60000, Boolean(options.forceRefresh), async () => {
    try {
      const q = query(collection(db, 'discountCampaigns'));
      const snap = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(q) : getDocs(q),
        9000,
        'fetchDiscountCampaignsFromCloud'
      );
      const campaigns: DiscountCampaign[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.deleted) {
          campaigns.push(normalizeDiscountCampaignData(d.id, data));
        }
      });
      return campaigns;
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        console.warn('Discount campaigns fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
}

export function subscribeToDiscountCampaigns(
  callback: (campaigns: DiscountCampaign[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'discountCampaigns';
  try {
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
        setCachedValue('discountCampaigns:all', campaigns, 60000);
        callback(campaigns);
      },
      (error) => {
        if (isOfflineOrTransientError(error)) {
          console.warn('Discount campaigns subscription offline warning:', error);
        } else {
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch {}
        }
        if (onError) onError(error);
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveDiscountCampaignToCloud(campaign: DiscountCampaign): Promise<void> {
  const path = `discountCampaigns/${campaign.id}`;
  invalidateFirestoreCache('discountCampaigns:');
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
  invalidateFirestoreCache('discountCampaigns:');
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
  invalidateFirestoreCache('discountCampaigns:');
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

// ----------------- PERMANENT CART FIRESTORE SYNC -----------------

export function buildCartDocId(
  prefix: 'cart',
  customerId: string,
  productId: string,
  colour?: string
): string {
  const safeCustomer = String(customerId || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeProduct = String(productId || 'prod').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeColour = String(colour || '').trim()
    ? String(colour).trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    : 'default';
  const full = `${prefix}_${safeCustomer}_${safeProduct}_${safeColour}`;
  if (full.length <= 128) return full;
  const suffix = getGuestShortCode(full, 8);
  return `${full.slice(0, 118)}_${suffix}`;
}

export async function saveCartItemToCloud(item: CartItem): Promise<void> {
  const path = `cartItems/${item.id}`;
  try {
    const docRef = doc(db, 'cartItems', item.id);
    const isGuest =
      typeof item.isGuest === 'boolean'
        ? item.isGuest
        : !isRegisteredCustomerId(item.customerId);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        ...item,
        isGuest,
        guestCode: isGuest ? item.guestCode || getGuestShortCode(item.customerId) : undefined,
        updatedAt: item.updatedAt || new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('Cart item saved locally; cloud sync deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCartItemFromCloud(cartItemId: string): Promise<void> {
  const path = `cartItems/${cartItemId}`;
  try {
    const docRef = doc(db, 'cartItems', cartItemId);
    await deleteDoc(docRef);
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('Cart item removal saved locally; cloud delete deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchCartItemsFromCloud(
  customerId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<CartItem[]> {
  if (!customerId) return [];
  const path = `cartItems (customerId: ${customerId})`;
  return dedupedCachedFetch(`cartItems:${customerId}`, 15000, Boolean(options.forceRefresh), async () => {
    try {
      const q = query(collection(db, 'cartItems'), where('customerId', '==', customerId));
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(q) : getDocs(q),
        8000,
        'fetchCartItemsFromCloud'
      );
      const items: CartItem[] = [];
      snapshot.forEach((d) => {
        items.push(d.data() as CartItem);
      });
      return items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        console.warn('Cart items fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
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
        if (snapshot.metadata.fromCache && snapshot.empty) {
          return;
        }
        const items: CartItem[] = [];
        snapshot.forEach((d) => {
          items.push(d.data() as CartItem);
        });
        items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
        setCachedValue(`cartItems:${customerId}`, items, 15000);
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

function normalizeActiveCartSnapshot(snapshot: any): CartItem[] {
  const deduped = new Map<string, CartItem>();
  snapshot.forEach((d: any) => {
    const raw = d.data() as CartItem;
    if (!raw || !raw.customerId || !raw.productId) return;
    const qty = typeof raw.quantity === 'number' && isFinite(raw.quantity) ? Math.round(raw.quantity) : 1;
    if (qty <= 0) return;

    const itemId = String(raw.id || d.id);
    const colourKey = String(raw.colour || '').trim().toLowerCase() || 'default';
    const dedupeKey = itemId || `${raw.customerId}__${raw.productId}__${colourKey}`;

    const normalized: CartItem = {
      ...raw,
      id: itemId,
      quantity: qty,
    };

    const existing = deduped.get(dedupeKey);
    if (!existing) {
      deduped.set(dedupeKey, normalized);
    } else {
      const existingTime = new Date(existing.updatedAt || existing.addedAt || 0).getTime();
      const incomingTime = new Date(normalized.updatedAt || normalized.addedAt || 0).getTime();
      if (incomingTime >= existingTime) {
        deduped.set(dedupeKey, normalized);
      }
    }
  });
  return Array.from(deduped.values()).sort(
    (a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime()
  );
}

export async function fetchAllCartItemsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<CartItem[]> {
  const path = 'cartItems';
  return dedupedCachedFetch('cartItems:all', 15000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = collection(db, 'cartItems');
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
        9000,
        'fetchAllCartItemsFromCloud'
      );
      return normalizeActiveCartSnapshot(snapshot);
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        console.warn('All cart items fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
}

export function subscribeToAllCartItems(
  callback: (items: CartItem[]) => void
): () => void {
  const path = 'cartItems';
  try {
    return onSnapshot(
      collection(db, 'cartItems'),
      (snapshot) => {
        const items = normalizeActiveCartSnapshot(snapshot);
        setCachedValue('cartItems:all', items, 15000);
        callback(items);
      },
      (error) => {
        console.warn('All cart items subscription warning:', error);
        if (!isOfflineOrTransientError(error)) {
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch {}
        }
      }
    );
  } catch {
    return () => {};
  }
}

// ----------------- POPULAR SEARCHES (OWNER-MANAGED, LIVE ON CUSTOMER SIDE) -----------------
function normalizePopularSearch(data: any, docId: string): PopularSearchItem {
  return {
    id: String(data?.id || docId),
    term: String(data?.term || '').trim(),
    order: typeof data?.order === 'number' && isFinite(data.order) ? data.order : 0,
    createdAt: data?.createdAt || new Date().toISOString(),
    updatedAt: data?.updatedAt || data?.createdAt || new Date().toISOString(),
  };
}

export async function fetchPopularSearchesFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<PopularSearchItem[]> {
  const path = 'popularSearches';
  return dedupedCachedFetch('popularSearches:all', 120000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = collection(db, 'popularSearches');
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
        8000,
        'fetchPopularSearchesFromCloud'
      );
      const items: PopularSearchItem[] = [];
      snapshot.forEach((d) => {
        const normalized = normalizePopularSearch(d.data(), d.id);
        if (normalized.term) {
          items.push(normalized);
        }
      });
      return items.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        console.warn('Popular searches fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
}

export function subscribeToPopularSearches(
  callback: (items: PopularSearchItem[]) => void
): () => void {
  const path = 'popularSearches';
  try {
    return onSnapshot(
      collection(db, 'popularSearches'),
      (snapshot) => {
        const items: PopularSearchItem[] = [];
        snapshot.forEach((d) => {
          const normalized = normalizePopularSearch(d.data(), d.id);
          if (normalized.term) {
            items.push(normalized);
          }
        });
        items.sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        setCachedValue('popularSearches:all', items, 120000);
        callback(items);
      },
      (error) => {
        console.warn('Popular searches subscription warning:', error);
        if (!isOfflineOrTransientError(error)) {
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch {}
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function savePopularSearchToCloud(item: PopularSearchItem): Promise<void> {
  const path = `popularSearches/${item.id}`;
  invalidateFirestoreCache('popularSearches:');
  try {
    const cleanTerm = String(item.term || '').trim().slice(0, 100);
    if (!cleanTerm) {
      throw new Error('Popular search term cannot be empty.');
    }
    const payload = sanitizeForFirestore({
      id: item.id,
      term: cleanTerm,
      order: typeof item.order === 'number' ? item.order : 0,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'popularSearches', item.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePopularSearchFromCloud(searchId: string): Promise<void> {
  const path = `popularSearches/${searchId}`;
  invalidateFirestoreCache('popularSearches:');
  try {
    await deleteDoc(doc(db, 'popularSearches', searchId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function reorderPopularSearchesInCloud(orderedItems: PopularSearchItem[]): Promise<void> {
  const path = 'popularSearches (batch reorder)';
  invalidateFirestoreCache('popularSearches:');
  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    orderedItems.forEach((item, index) => {
      const payload = sanitizeForFirestore({
        id: item.id,
        term: String(item.term || '').trim().slice(0, 100),
        order: index,
        createdAt: item.createdAt || nowIso,
        updatedAt: nowIso,
      });
      batch.set(doc(db, 'popularSearches', item.id), payload);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/* =========================================================================
   OWNER ANALYTICS TRACKING & REAL-TIME AGGREGATION
   ========================================================================= */

let memorySessionId = '';
const trackedVisitSessionKeys = new Set<string>();
const trackedProductViewKeys = new Set<string>();
const trackedCartEventIds = new Set<string>();
const lastCartTrackTimeByProduct = new Map<string, number>();

function sanitizeAnalyticsId(raw: string): string {
  const cleaned = String(raw || 'anon')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  return cleaned.slice(0, 128) || 'anon';
}

export function getOrCreateAnalyticsSessionId(): string {
  if (memorySessionId) return memorySessionId;
  try {
    const existing = sessionStorage.getItem('playnix_analytics_session_id');
    if (existing && /^[a-zA-Z0-9_-]{4,64}$/.test(existing)) {
      memorySessionId = existing;
      return existing;
    }
    const generated = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('playnix_analytics_session_id', generated);
    memorySessionId = generated;
    return generated;
  } catch {
    memorySessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return memorySessionId;
  }
}

async function ensureAnalyticsCustomerDoc(
  customerId: string,
  delta: {
    visit?: number;
    view?: number;
    cart?: number;
    displayName?: string;
    mode?: 'Child' | 'Adult' | 'Visitor';
    isAuthenticated?: boolean;
    isGuest?: boolean;
    linkedFromGuestId?: string;
  }
): Promise<void> {
  const safeCustomerId = sanitizeAnalyticsId(customerId);
  const custRef = doc(db, 'analyticsCustomers', safeCustomerId);
  const nowIso = new Date().toISOString();
  const isRegistered =
    typeof delta.isAuthenticated === 'boolean'
      ? delta.isAuthenticated
      : isRegisteredCustomerId(customerId);
  const isGuest = typeof delta.isGuest === 'boolean' ? delta.isGuest : !isRegistered;
  const guestCode = isGuest ? getGuestShortCode(customerId) : undefined;

  try {
    const existingSnap = await getDoc(custRef);
    if (!existingSnap.exists()) {
      const initialDoc: AnalyticsCustomer = {
        id: safeCustomerId,
        customerId: String(customerId || safeCustomerId).slice(0, 128),
        displayName: delta.displayName ? delta.displayName.trim().slice(0, 100) : undefined,
        isAuthenticated: isRegistered,
        isGuest,
        guestCode,
        linkedFromGuestId: delta.linkedFromGuestId
          ? String(delta.linkedFromGuestId).slice(0, 128)
          : undefined,
        mode: delta.mode || 'Visitor',
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        visitCount: delta.visit ?? 1,
        productViewCount: delta.view ?? 0,
        cartAddCount: delta.cart ?? 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(custRef, sanitizeForFirestore(initialDoc));
      return;
    }

    const updates: Record<string, any> = {
      lastSeenAt: nowIso,
      updatedAt: nowIso,
      isAuthenticated: isRegistered,
      isGuest,
    };
    if (guestCode) updates.guestCode = guestCode;
    if (delta.visit && delta.visit > 0) updates.visitCount = increment(delta.visit);
    if (delta.view && delta.view > 0) updates.productViewCount = increment(delta.view);
    if (delta.cart && delta.cart > 0) updates.cartAddCount = increment(delta.cart);
    if (delta.displayName && delta.displayName.trim()) {
      updates.displayName = delta.displayName.trim().slice(0, 100);
    }
    if (delta.linkedFromGuestId && delta.linkedFromGuestId.trim()) {
      updates.linkedFromGuestId = delta.linkedFromGuestId.trim().slice(0, 128);
    }
    if (delta.mode && delta.mode !== 'Visitor') {
      updates.mode = delta.mode;
    }

    await updateDoc(custRef, sanitizeForFirestore(updates));
  } catch (err) {
    console.warn('Analytics customer profile sync warning:', err);
  }
}

/**
 * Associates an explicitly entered customer name (e.g. entered during checkout
 * or confirmed by an authenticated user) with their existing cart items, saved items,
 * and analytics customer profile without ever inventing or guessing names.
 */
export async function syncCustomerNameWithCartInCloud(
  customerId: string,
  providedName: string,
  options?: { isAuthenticated?: boolean; mode?: 'Child' | 'Adult' | 'Visitor' }
): Promise<void> {
  const cleanName = String(providedName || '').trim().slice(0, 100);
  if (!customerId || !cleanName) return;

  const isAuthenticated =
    typeof options?.isAuthenticated === 'boolean'
      ? options.isAuthenticated
      : isRegisteredCustomerId(customerId);
  const isGuest = !isAuthenticated;
  const guestCode = isGuest ? getGuestShortCode(customerId) : undefined;
  const nowIso = new Date().toISOString();

  await ensureAnalyticsCustomerDoc(customerId, {
    visit: 0,
    displayName: cleanName,
    isAuthenticated,
    isGuest,
    mode: options?.mode,
  });

  try {
    const cartSnap = await getDocs(
      query(collection(db, 'cartItems'), where('customerId', '==', customerId))
    );

    if (cartSnap.empty) return;

    const batch = writeBatch(db);
    cartSnap.forEach((d) => {
      batch.set(
        d.ref,
        sanitizeForFirestore({
          customerName: cleanName,
          isGuest,
          guestCode,
          updatedAt: nowIso,
        }),
        { merge: true }
      );
    });
    await batch.commit();
  } catch (err) {
    if (isOfflineOrTransientError(err)) {
      console.warn('Cart name cloud sync skipped while offline.');
      return;
    }
    handleFirestoreError(err, OperationType.WRITE, `cartItems (name sync: ${customerId})`);
  }
}

export async function trackWebsiteVisit(customerId: string): Promise<void> {
  if (!customerId) return;
  const dateKey = getISTDateKey();
  const sessionId = sanitizeAnalyticsId(getOrCreateAnalyticsSessionId());
  const safeCustomerId = sanitizeAnalyticsId(customerId);
  const dedupKey = `${dateKey}_${sessionId}_${safeCustomerId}`;

  if (trackedVisitSessionKeys.has(dedupKey)) return;
  try {
    if (sessionStorage.getItem(`playnix_visit_logged_${dateKey}_${safeCustomerId}`)) {
      trackedVisitSessionKeys.add(dedupKey);
      return;
    }
    sessionStorage.setItem(`playnix_visit_logged_${dateKey}_${safeCustomerId}`, '1');
  } catch {}
  trackedVisitSessionKeys.add(dedupKey);

  const eventId = sanitizeAnalyticsId(`visit_${dateKey}_${safeCustomerId}`);
  const eventRef = doc(db, 'analyticsEvents', eventId);
  const nowIso = new Date().toISOString();

  try {
    const existing = await getDoc(eventRef);
    if (!existing.exists()) {
      const payload: AnalyticsEvent = {
        id: eventId,
        type: 'visit',
        dateKey,
        customerId: String(customerId).slice(0, 128),
        sessionId,
        count: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(eventRef, sanitizeForFirestore(payload));
    } else {
      await updateDoc(eventRef, {
        updatedAt: nowIso,
      });
    }
  } catch (err) {
    console.warn('Analytics website visit tracking warning:', err);
  }

  // Increment customer visit count once per browser session
  try {
    const sessionVisitKey = `playnix_cust_visit_inc_${dateKey}`;
    if (!sessionStorage.getItem(sessionVisitKey)) {
      sessionStorage.setItem(sessionVisitKey, '1');
      await ensureAnalyticsCustomerDoc(customerId, { visit: 1 });
    }
  } catch {
    await ensureAnalyticsCustomerDoc(customerId, { visit: 1 });
  }
}

export async function trackProductView(
  product: { id: string; name: string; category?: string },
  customerId: string
): Promise<void> {
  if (!product || !product.id || !customerId) return;
  const dateKey = getISTDateKey();
  const sessionId = sanitizeAnalyticsId(getOrCreateAnalyticsSessionId());
  const safeProdId = sanitizeAnalyticsId(product.id);
  const dedupKey = `view_${dateKey}_${sessionId}_${safeProdId}`;

  if (trackedProductViewKeys.has(dedupKey)) return;
  try {
    if (sessionStorage.getItem(`playnix_pview_${dedupKey}`)) {
      trackedProductViewKeys.add(dedupKey);
      return;
    }
    sessionStorage.setItem(`playnix_pview_${dedupKey}`, '1');
  } catch {}
  trackedProductViewKeys.add(dedupKey);

  const eventId = sanitizeAnalyticsId(dedupKey);
  const eventRef = doc(db, 'analyticsEvents', eventId);
  const nowIso = new Date().toISOString();

  try {
    const payload: AnalyticsEvent = {
      id: eventId,
      type: 'product_view',
      dateKey,
      customerId: String(customerId).slice(0, 128),
      sessionId,
      productId: String(product.id).slice(0, 128),
      productName: String(product.name || '').trim().slice(0, 200),
      category: String(product.category || 'Other').trim().slice(0, 100),
      count: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await setDoc(eventRef, sanitizeForFirestore(payload), { merge: true });
    await ensureAnalyticsCustomerDoc(customerId, { view: 1 });
  } catch (err) {
    console.warn('Analytics product view tracking warning:', err);
  }
}

export async function trackAddToCartEvent(
  product: { id: string; name: string; category?: string },
  quantity: number,
  customerId: string
): Promise<void> {
  if (!product || !product.id || !customerId) return;
  const safeQty = Math.max(1, Math.min(20, Math.round(quantity || 1)));
  const nowMs = Date.now();
  const lastAt = lastCartTrackTimeByProduct.get(product.id) || 0;
  if (nowMs - lastAt < 1200) return;
  lastCartTrackTimeByProduct.set(product.id, nowMs);

  const dateKey = getISTDateKey(nowMs);
  const sessionId = sanitizeAnalyticsId(getOrCreateAnalyticsSessionId());
  const safeProdId = sanitizeAnalyticsId(product.id);
  const eventId = sanitizeAnalyticsId(`cart_${dateKey}_${sessionId}_${safeProdId}`);
  const eventRef = doc(db, 'analyticsEvents', eventId);
  const nowIso = new Date(nowMs).toISOString();

  try {
    if (trackedCartEventIds.has(eventId)) {
      await updateDoc(eventRef, {
        count: increment(1),
        quantity: increment(safeQty),
        updatedAt: nowIso,
      });
    } else {
      const existing = await getDoc(eventRef);
      if (existing.exists()) {
        await updateDoc(eventRef, {
          count: increment(1),
          quantity: increment(safeQty),
          updatedAt: nowIso,
        });
      } else {
        const payload: AnalyticsEvent = {
          id: eventId,
          type: 'add_to_cart',
          dateKey,
          customerId: String(customerId).slice(0, 128),
          sessionId,
          productId: String(product.id).slice(0, 128),
          productName: String(product.name || '').trim().slice(0, 200),
          category: String(product.category || 'Other').trim().slice(0, 100),
          count: 1,
          quantity: safeQty,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await setDoc(eventRef, sanitizeForFirestore(payload));
      }
      trackedCartEventIds.add(eventId);
    }

    await ensureAnalyticsCustomerDoc(customerId, { cart: safeQty });
  } catch (err) {
    console.warn('Analytics add-to-cart tracking warning:', err);
  }
}

export async function syncAnalyticsCustomerOrderProfile(
  customerId: string,
  displayName: string,
  mode: 'Child' | 'Adult'
): Promise<void> {
  if (!customerId) return;
  await ensureAnalyticsCustomerDoc(customerId, {
    displayName,
    mode,
  });
}

export async function fetchAnalyticsEventsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<AnalyticsEvent[]> {
  const path = 'analyticsEvents';
  return dedupedCachedFetch('analyticsEvents:all', 30000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = collection(db, 'analyticsEvents');
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
        10000,
        'fetchAnalyticsEventsFromCloud'
      );
      const list: AnalyticsEvent[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as AnalyticsEvent;
        if (data && data.type && data.dateKey) {
          list.push({ ...data, id: data.id || d.id });
        }
      });
      return list;
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        console.warn('Analytics events fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
}

export function subscribeToAnalyticsEvents(
  callback: (events: AnalyticsEvent[]) => void
): () => void {
  const path = 'analyticsEvents';
  try {
    return onSnapshot(
      collection(db, 'analyticsEvents'),
      (snapshot) => {
        const list: AnalyticsEvent[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as AnalyticsEvent;
          if (data && data.type && data.dateKey) {
            list.push({ ...data, id: data.id || d.id });
          }
        });
        setCachedValue('analyticsEvents:all', list, 30000);
        callback(list);
      },
      (error) => {
        console.warn('Analytics events subscription warning:', error);
        if (!isOfflineOrTransientError(error)) {
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch {}
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function fetchAnalyticsCustomersFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<AnalyticsCustomer[]> {
  const path = 'analyticsCustomers';
  return dedupedCachedFetch('analyticsCustomers:all', 30000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = collection(db, 'analyticsCustomers');
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
        10000,
        'fetchAnalyticsCustomersFromCloud'
      );
      const list: AnalyticsCustomer[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as AnalyticsCustomer;
        if (data && data.customerId) {
          list.push({ ...data, id: data.id || d.id });
        }
      });
      return list;
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        console.warn('Analytics customers fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
}

export function subscribeToAnalyticsCustomers(
  callback: (customers: AnalyticsCustomer[]) => void
): () => void {
  const path = 'analyticsCustomers';
  try {
    return onSnapshot(
      collection(db, 'analyticsCustomers'),
      (snapshot) => {
        const list: AnalyticsCustomer[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as AnalyticsCustomer;
          if (data && data.customerId) {
            list.push({ ...data, id: data.id || d.id });
          }
        });
        callback(list);
      },
      (error) => {
        console.warn('Analytics customers subscription warning:', error);
        if (!isOfflineOrTransientError(error)) {
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch {}
        }
      }
    );
  } catch {
    return () => {};
  }
}

// ----------------- PRODUCT QUESTIONS & OWNER ANSWERS -----------------

function normalizeProductQuestion(data: any, docId: string): ProductQuestion {
  return {
    id: String(data?.id || docId),
    productId: String(data?.productId || ''),
    productName: String(data?.productName || 'Product'),
    productImageUrl: String(data?.productImageUrl || ''),
    customerId: String(data?.customerId || ''),
    guestCode: data?.guestCode ? String(data.guestCode) : undefined,
    customerName: data?.customerName ? String(data.customerName) : '',
    question: String(data?.question || ''),
    answer: data?.answer ? String(data.answer) : '',
    status: data?.status === 'Answered' ? 'Answered' : 'Pending',
    createdAt: String(data?.createdAt || new Date().toISOString()),
    answeredAt: data?.answeredAt ? String(data.answeredAt) : undefined,
    updatedAt: data?.updatedAt ? String(data.updatedAt) : undefined,
  };
}

export async function submitProductQuestionToCloud(questionObj: ProductQuestion): Promise<void> {
  const path = `productQuestions/${questionObj.id}`;
  try {
    const nowIso = questionObj.createdAt || new Date().toISOString();
    const cleanPayload = sanitizeForFirestore({
      id: questionObj.id.slice(0, 128),
      productId: questionObj.productId.slice(0, 128),
      productName: questionObj.productName.trim().slice(0, 200) || 'Product',
      productImageUrl: String(questionObj.productImageUrl || '').slice(0, 800000),
      customerId: questionObj.customerId.slice(0, 128),
      guestCode: (questionObj.guestCode || getGuestShortCode(questionObj.customerId)).slice(0, 16),
      customerName: String(questionObj.customerName || '').trim().slice(0, 100),
      question: questionObj.question.trim().slice(0, 1000),
      answer: '',
      status: 'Pending',
      createdAt: nowIso.slice(0, 64),
      updatedAt: nowIso.slice(0, 64),
    });

    await setDoc(doc(db, 'productQuestions', questionObj.id), cleanPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToProductQuestionsByProduct(
  productId: string,
  customerId: string,
  callback: (questions: ProductQuestion[]) => void
): () => void {
  if (!productId || !customerId) return () => {};
  const path = `productQuestions?customerId=${customerId}&productId=${productId}`;
  try {
    const q = query(collection(db, 'productQuestions'), where('customerId', '==', customerId));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: ProductQuestion[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as any;
          if (
            data &&
            data.question &&
            data.productId === productId &&
            data.customerId === customerId
          ) {
            list.push(normalizeProductQuestion(data, d.id));
          }
        });
        list.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        callback(list);
      },
      (error) => {
        console.warn('Product questions subscription warning:', error);
        if (!isOfflineOrTransientError(error)) {
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch {}
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function fetchAllProductQuestionsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<ProductQuestion[]> {
  const path = 'productQuestions';
  return dedupedCachedFetch('productQuestions:all', 20000, Boolean(options.forceRefresh), async () => {
    try {
      const ref = collection(db, 'productQuestions');
      const snapshot = await withFirestoreTimeout(
        options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
        9000,
        'fetchAllProductQuestionsFromCloud'
      );
      const list: ProductQuestion[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        if (data && data.question) {
          list.push(normalizeProductQuestion(data, d.id));
        }
      });
      return list.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    } catch (error) {
      if (isOfflineOrTransientError(error)) {
        console.warn('Product questions fetch skipped while offline/rate-limited.');
        return [];
      }
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  });
}

export function subscribeToAllProductQuestions(
  callback: (questions: ProductQuestion[]) => void
): () => void {
  const path = 'productQuestions';
  try {
    return onSnapshot(
      collection(db, 'productQuestions'),
      (snapshot) => {
        const list: ProductQuestion[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as any;
          if (data && data.question) {
            list.push(normalizeProductQuestion(data, d.id));
          }
        });
        list.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        callback(list);
      },
      (error) => {
        console.warn('Owner product questions subscription warning:', error);
        if (!isOfflineOrTransientError(error)) {
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch {}
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function answerProductQuestionInCloud(
  questionId: string,
  answer: string,
  status: ProductQuestionStatus = 'Answered'
): Promise<void> {
  const path = `productQuestions/${questionId}`;
  try {
    const nowIso = new Date().toISOString();
    const cleanAnswer = answer.trim().slice(0, 2000);
    await updateDoc(doc(db, 'productQuestions', questionId), {
      answer: cleanAnswer,
      status,
      answeredAt: status === 'Answered' ? nowIso : '',
      updatedAt: nowIso,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateProductQuestionStatusInCloud(
  questionId: string,
  status: ProductQuestionStatus
): Promise<void> {
  const path = `productQuestions/${questionId}`;
  try {
    const nowIso = new Date().toISOString();
    await updateDoc(doc(db, 'productQuestions', questionId), {
      status,
      answeredAt: status === 'Answered' ? nowIso : '',
      updatedAt: nowIso,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProductQuestionFromCloud(questionId: string): Promise<void> {
  const path = `productQuestions/${questionId}`;
  try {
    await deleteDoc(doc(db, 'productQuestions', questionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- PLAYNIX AI ASSISTANT (OWNER-ONLY DATA) -----------------

function normalizeAiAssistantState(data: any): AiAssistantState {
  const trainingStatus =
    data?.trainingStatus === 'completed' || data?.trainingStatus === 'in_progress'
      ? data.trainingStatus
      : 'not_started';
  return {
    id: 'config',
    enabled: data?.enabled !== false,
    hasCompletedInitialScan: Boolean(data?.hasCompletedInitialScan),
    lastScannedAt: data?.lastScannedAt ? String(data.lastScannedAt) : undefined,
    scanSummary: data?.scanSummary ? String(data.scanSummary) : undefined,
    learnedHighlights: Array.isArray(data?.learnedHighlights)
      ? data.learnedHighlights.map(String).slice(0, 40)
      : [],
    missingInfoItems: Array.isArray(data?.missingInfoItems)
      ? data.missingInfoItems.map(String).slice(0, 60)
      : [],
    trainingStatus,
    trainingCurrentStepIndex:
      typeof data?.trainingCurrentStepIndex === 'number' && isFinite(data.trainingCurrentStepIndex)
        ? Math.max(0, Math.min(20, Math.round(data.trainingCurrentStepIndex)))
        : 0,
    trainingCompletedAt: data?.trainingCompletedAt ? String(data.trainingCompletedAt) : undefined,
    geminiConfigured: typeof data?.geminiConfigured === 'boolean' ? data.geminiConfigured : undefined,
    responseStyleMode:
      data?.responseStyleMode === 'short_direct' ||
      data?.responseStyleMode === 'detailed' ||
      data?.responseStyleMode === 'balanced'
        ? data.responseStyleMode
        : 'balanced',
    customInstructions: data?.customInstructions ? String(data.customInstructions).slice(0, 2000) : '',
    updatedAt: String(data?.updatedAt || new Date().toISOString()),
  };
}

function normalizeAiKnowledgeEntry(data: any, docId: string): AiKnowledgeEntry {
  const validCategories = new Set([
    'catalog',
    'product_spec',
    'delivery',
    'returns',
    'payment',
    'availability',
    'orders',
    'support',
    'faq',
    'policy',
    'tone',
  ]);
  const cat = validCategories.has(data?.category) ? data.category : 'faq';
  return {
    id: String(data?.id || docId).slice(0, 128),
    title: String(data?.title || 'Shop Knowledge').trim().slice(0, 240),
    content: String(data?.content || '').trim().slice(0, 5000),
    category: cat,
    source: data?.source === 'website' ? 'website' : 'owner',
    productId: data?.productId ? String(data.productId).slice(0, 128) : undefined,
    productName: data?.productName ? String(data.productName).slice(0, 200) : undefined,
    trainingStepKey: data?.trainingStepKey ? String(data.trainingStepKey).slice(0, 64) : undefined,
    verified: data?.verified !== false,
    createdAt: String(data?.createdAt || new Date().toISOString()).slice(0, 64),
    updatedAt: String(data?.updatedAt || new Date().toISOString()).slice(0, 64),
  };
}

function normalizeAiTrainingAnswer(data: any, docId: string): AiTrainingAnswer {
  const stepKey = String(data?.stepKey || docId) as AiTrainingStepKey;
  const status =
    data?.status === 'answered' || data?.status === 'skipped' ? data.status : 'pending';
  return {
    id: stepKey,
    stepKey,
    question: String(data?.question || '').trim().slice(0, 500),
    answer: String(data?.answer || '').trim().slice(0, 4000),
    status,
    createdAt: String(data?.createdAt || new Date().toISOString()).slice(0, 64),
    updatedAt: String(data?.updatedAt || new Date().toISOString()).slice(0, 64),
  };
}

export async function fetchAiAssistantStateFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<AiAssistantState> {
  const path = 'aiAssistantState/config';
  try {
    const ref = doc(db, 'aiAssistantState', 'config');
    const snap = await withFirestoreTimeout(
      options.forceRefresh ? getDocFromServer(ref) : getDoc(ref),
      8000,
      'fetchAiAssistantStateFromCloud'
    );
    if (snap.exists()) {
      return normalizeAiAssistantState(snap.data());
    }
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      const restData = await fetchFirestoreDocViaRest('aiAssistantState', 'config');
      if (restData) return normalizeAiAssistantState(restData);
      return { ...DEFAULT_AI_ASSISTANT_STATE };
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
  return { ...DEFAULT_AI_ASSISTANT_STATE };
}

export function subscribeToAiAssistantState(
  callback: (state: AiAssistantState) => void
): () => void {
  try {
    return onSnapshot(
      doc(db, 'aiAssistantState', 'config'),
      (snap) => {
        if (snap.exists()) {
          callback(normalizeAiAssistantState(snap.data()));
        }
      },
      (error) => {
        if (!isOfflineOrTransientError(error)) {
          console.warn('AI Assistant state subscription warning:', error);
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveAiAssistantStateToCloud(state: AiAssistantState): Promise<void> {
  const path = 'aiAssistantState/config';
  try {
    const payload = sanitizeForFirestore({
      id: 'config',
      enabled: Boolean(state.enabled),
      hasCompletedInitialScan: Boolean(state.hasCompletedInitialScan),
      lastScannedAt: state.lastScannedAt ? String(state.lastScannedAt).slice(0, 64) : undefined,
      scanSummary: state.scanSummary ? String(state.scanSummary).slice(0, 4000) : undefined,
      learnedHighlights: Array.isArray(state.learnedHighlights)
        ? state.learnedHighlights.map((s) => String(s).slice(0, 300)).slice(0, 40)
        : undefined,
      missingInfoItems: Array.isArray(state.missingInfoItems)
        ? state.missingInfoItems.map((s) => String(s).slice(0, 300)).slice(0, 60)
        : undefined,
      trainingStatus: state.trainingStatus || 'not_started',
      trainingCurrentStepIndex: Math.max(
        0,
        Math.min(20, Math.round(state.trainingCurrentStepIndex || 0))
      ),
      trainingCompletedAt: state.trainingCompletedAt
        ? String(state.trainingCompletedAt).slice(0, 64)
        : undefined,
      geminiConfigured:
        typeof state.geminiConfigured === 'boolean' ? state.geminiConfigured : undefined,
      responseStyleMode:
        state.responseStyleMode === 'short_direct' ||
        state.responseStyleMode === 'detailed' ||
        state.responseStyleMode === 'balanced'
          ? state.responseStyleMode
          : undefined,
      customInstructions:
        typeof state.customInstructions === 'string'
          ? state.customInstructions.trim().slice(0, 2000)
          : undefined,
      updatedAt: (state.updatedAt || new Date().toISOString()).slice(0, 64),
    });
    await setDoc(doc(db, 'aiAssistantState', 'config'), payload, { merge: true });
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI state save deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchAiKnowledgeFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<AiKnowledgeEntry[]> {
  const path = 'aiKnowledge';
  try {
    const ref = collection(db, 'aiKnowledge');
    const snapshot = await withFirestoreTimeout(
      options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
      9000,
      'fetchAiKnowledgeFromCloud'
    );
    const list: AiKnowledgeEntry[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      if (data && data.title && data.content) {
        list.push(normalizeAiKnowledgeEntry(data, d.id));
      }
    });
    return list.sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI knowledge fetch skipped while offline.');
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToAiKnowledge(
  callback: (entries: AiKnowledgeEntry[]) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, 'aiKnowledge'),
      (snapshot) => {
        const list: AiKnowledgeEntry[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.title && data.content) {
            list.push(normalizeAiKnowledgeEntry(data, d.id));
          }
        });
        list.sort(
          (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        );
        callback(list);
      },
      (error) => {
        if (!isOfflineOrTransientError(error)) {
          console.warn('AI knowledge subscription warning:', error);
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveAiKnowledgeEntryToCloud(entry: AiKnowledgeEntry): Promise<void> {
  const safeId = String(entry.id || `know_${Date.now().toString(36)}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  const path = `aiKnowledge/${safeId}`;
  try {
    const nowIso = new Date().toISOString();
    const payload = sanitizeForFirestore({
      id: safeId,
      title: String(entry.title || '').trim().slice(0, 240),
      content: String(entry.content || '').trim().slice(0, 5000),
      category: entry.category || 'faq',
      source: entry.source === 'website' ? 'website' : 'owner',
      productId: entry.productId ? String(entry.productId).slice(0, 128) : undefined,
      productName: entry.productName ? String(entry.productName).trim().slice(0, 200) : undefined,
      trainingStepKey: entry.trainingStepKey
        ? String(entry.trainingStepKey).slice(0, 64)
        : undefined,
      verified: entry.verified !== false,
      createdAt: (entry.createdAt || nowIso).slice(0, 64),
      updatedAt: (entry.updatedAt || nowIso).slice(0, 64),
    });
    await setDoc(doc(db, 'aiKnowledge', safeId), payload);
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI knowledge save deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAiKnowledgeEntryFromCloud(entryId: string): Promise<void> {
  const path = `aiKnowledge/${entryId}`;
  try {
    await deleteDoc(doc(db, 'aiKnowledge', entryId));
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI knowledge delete deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function replaceWebsiteScanKnowledgeInCloud(
  websiteEntries: AiKnowledgeEntry[]
): Promise<void> {
  const path = 'aiKnowledge (website scan batch)';
  try {
    const existingSnap = await getDocs(collection(db, 'aiKnowledge'));
    const nextIds = new Set(websiteEntries.map((e) => e.id));
    const batch = writeBatch(db);

    existingSnap.forEach((d) => {
      const data = d.data();
      if (data?.source === 'website' && !nextIds.has(d.id)) {
        batch.delete(d.ref);
      }
    });

    const nowIso = new Date().toISOString();
    for (const entry of websiteEntries) {
      const safeId = String(entry.id)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 128);
      const payload = sanitizeForFirestore({
        id: safeId,
        title: String(entry.title || '').trim().slice(0, 240),
        content: String(entry.content || '').trim().slice(0, 5000),
        category: entry.category || 'catalog',
        source: 'website',
        productId: entry.productId ? String(entry.productId).slice(0, 128) : undefined,
        productName: entry.productName ? String(entry.productName).trim().slice(0, 200) : undefined,
        verified: true,
        createdAt: (entry.createdAt || nowIso).slice(0, 64),
        updatedAt: (entry.updatedAt || nowIso).slice(0, 64),
      });
      batch.set(doc(db, 'aiKnowledge', safeId), payload);
    }

    await batch.commit();
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('Website scan knowledge batch sync deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchAiTrainingAnswersFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<AiTrainingAnswer[]> {
  const path = 'aiTrainingAnswers';
  try {
    const ref = collection(db, 'aiTrainingAnswers');
    const snapshot = await withFirestoreTimeout(
      options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
      9000,
      'fetchAiTrainingAnswersFromCloud'
    );
    const list: AiTrainingAnswer[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      if (data && data.stepKey) {
        list.push(normalizeAiTrainingAnswer(data, d.id));
      }
    });
    return list;
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI training answers fetch skipped while offline.');
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToAiTrainingAnswers(
  callback: (answers: AiTrainingAnswer[]) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, 'aiTrainingAnswers'),
      (snapshot) => {
        const list: AiTrainingAnswer[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.stepKey) {
            list.push(normalizeAiTrainingAnswer(data, d.id));
          }
        });
        callback(list);
      },
      (error) => {
        if (!isOfflineOrTransientError(error)) {
          console.warn('AI training answers subscription warning:', error);
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveAiTrainingAnswerToCloud(answerObj: AiTrainingAnswer): Promise<void> {
  const path = `aiTrainingAnswers/${answerObj.stepKey}`;
  try {
    const nowIso = new Date().toISOString();
    const payload = sanitizeForFirestore({
      id: answerObj.stepKey,
      stepKey: answerObj.stepKey,
      question: String(answerObj.question || '').trim().slice(0, 500),
      answer: String(answerObj.answer || '').trim().slice(0, 4000),
      status: answerObj.status || 'pending',
      createdAt: (answerObj.createdAt || nowIso).slice(0, 64),
      updatedAt: (answerObj.updatedAt || nowIso).slice(0, 64),
    });
    await setDoc(doc(db, 'aiTrainingAnswers', answerObj.stepKey), payload);
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI training answer save deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function normalizeAiGuidanceQuestion(data: any, docId: string): AiGuidanceQuestion {
  const validCategories = new Set([
    'catalog',
    'product_spec',
    'delivery',
    'returns',
    'payment',
    'availability',
    'orders',
    'support',
    'faq',
    'policy',
    'tone',
  ]);
  const cat = validCategories.has(data?.category) ? data.category : 'product_spec';
  const source =
    data?.source === 'customer_question' || data?.source === 'ai_audit'
      ? data.source
      : 'scan';
  const status =
    data?.status === 'answered' || data?.status === 'dismissed' ? data.status : 'open';
  return {
    id: String(data?.id || docId).slice(0, 128),
    question: String(data?.question || '').trim().slice(0, 500),
    context: data?.context ? String(data.context).trim().slice(0, 600) : undefined,
    category: cat,
    source,
    productId: data?.productId ? String(data.productId).slice(0, 128) : undefined,
    productName: data?.productName ? String(data.productName).trim().slice(0, 200) : undefined,
    customerQuestionId: data?.customerQuestionId
      ? String(data.customerQuestionId).slice(0, 128)
      : undefined,
    answer: data?.answer ? String(data.answer).trim().slice(0, 4000) : undefined,
    status,
    createdAt: String(data?.createdAt || new Date().toISOString()).slice(0, 64),
    answeredAt: data?.answeredAt ? String(data.answeredAt).slice(0, 64) : undefined,
    updatedAt: String(data?.updatedAt || new Date().toISOString()).slice(0, 64),
  };
}

export async function fetchAiGuidanceQuestionsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<AiGuidanceQuestion[]> {
  const path = 'aiGuidanceQuestions';
  try {
    const ref = collection(db, 'aiGuidanceQuestions');
    const snapshot = await withFirestoreTimeout(
      options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
      9000,
      'fetchAiGuidanceQuestionsFromCloud'
    );
    const list: AiGuidanceQuestion[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      if (data && data.question) {
        list.push(normalizeAiGuidanceQuestion(data, d.id));
      }
    });
    return list.sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI guidance questions fetch skipped while offline.');
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToAiGuidanceQuestions(
  callback: (list: AiGuidanceQuestion[]) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, 'aiGuidanceQuestions'),
      (snapshot) => {
        const list: AiGuidanceQuestion[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.question) {
            list.push(normalizeAiGuidanceQuestion(data, d.id));
          }
        });
        list.sort(
          (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        );
        callback(list);
      },
      (error) => {
        if (!isOfflineOrTransientError(error)) {
          console.warn('AI guidance questions subscription warning:', error);
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveAiGuidanceQuestionToCloud(item: AiGuidanceQuestion): Promise<void> {
  const safeId = String(item.id || `guide_${Date.now().toString(36)}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  const path = `aiGuidanceQuestions/${safeId}`;
  try {
    const nowIso = new Date().toISOString();
    const payload = sanitizeForFirestore({
      id: safeId,
      question: String(item.question || '').trim().slice(0, 500),
      context: item.context ? String(item.context).trim().slice(0, 600) : undefined,
      category: item.category || 'product_spec',
      source:
        item.source === 'customer_question' || item.source === 'ai_audit'
          ? item.source
          : 'scan',
      productId: item.productId ? String(item.productId).slice(0, 128) : undefined,
      productName: item.productName ? String(item.productName).trim().slice(0, 200) : undefined,
      customerQuestionId: item.customerQuestionId
        ? String(item.customerQuestionId).slice(0, 128)
        : undefined,
      answer: item.answer ? String(item.answer).trim().slice(0, 4000) : undefined,
      status:
        item.status === 'answered' || item.status === 'dismissed' ? item.status : 'open',
      createdAt: (item.createdAt || nowIso).slice(0, 64),
      answeredAt: item.answeredAt ? String(item.answeredAt).slice(0, 64) : undefined,
      updatedAt: (item.updatedAt || nowIso).slice(0, 64),
    });
    await setDoc(doc(db, 'aiGuidanceQuestions', safeId), payload);
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI guidance question save deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAiGuidanceQuestionFromCloud(questionId: string): Promise<void> {
  const path = `aiGuidanceQuestions/${questionId}`;
  try {
    await deleteDoc(doc(db, 'aiGuidanceQuestions', questionId));
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('AI guidance question delete deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- AI WATCHDOG ALERTS & ACTIVITY LOGS -----------------
function sanitizeWatchdogIdForFirestore(rawId: string, prefix = 'wd'): string {
  const clean = String(rawId || `${prefix}_${Date.now().toString(36)}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 128);
  return clean || `${prefix}_${Date.now().toString(36)}`;
}

function normalizeWatchdogAlert(data: any, docId: string): WatchdogAlert {
  const validCategories = new Set(['orders', 'products', 'pricing', 'website']);
  const validSeverities = new Set(['info', 'warning', 'critical']);
  const validStatuses = new Set(['Pending', 'Resolved', 'Ignored']);
  const validTargets = new Set(['order', 'product', 'deal', 'offer', 'campaign', 'website']);

  return {
    id: sanitizeWatchdogIdForFirestore(String(data?.id || docId), 'wd'),
    title: String(data?.title || 'Watchdog Alert').trim().slice(0, 200),
    explanation: String(data?.explanation || '').trim().slice(0, 800),
    recommendedAction: String(data?.recommendedAction || 'Inspect item in dashboard').trim().slice(0, 400),
    category: validCategories.has(data?.category) ? data.category : 'website',
    severity: validSeverities.has(data?.severity) ? data.severity : 'warning',
    status: validStatuses.has(data?.status) ? data.status : 'Pending',
    ...(validTargets.has(data?.targetType) ? { targetType: data.targetType } : {}),
    ...(data?.targetId ? { targetId: String(data.targetId).slice(0, 128) } : {}),
    ...(data?.targetLabel ? { targetLabel: String(data.targetLabel).trim().slice(0, 200) } : {}),
    detectedBy: data?.detectedBy === 'gemini_ai' ? 'gemini_ai' : 'rules',
    detectedAt: String(data?.detectedAt || data?.updatedAt || new Date().toISOString()).slice(0, 64),
    updatedAt: String(data?.updatedAt || data?.detectedAt || new Date().toISOString()).slice(0, 64),
    ...(data?.resolvedAt ? { resolvedAt: String(data.resolvedAt).slice(0, 64) } : {}),
    ...(data?.ownerNote ? { ownerNote: String(data.ownerNote).trim().slice(0, 400) } : {}),
  };
}

function normalizeWatchdogLog(data: any, docId: string): WatchdogActivityLog {
  const validCategories = new Set(['orders', 'products', 'pricing', 'website', 'system']);
  const validActions = new Set([
    'detected',
    'scan_completed',
    'ai_analyzed',
    'resolved',
    'ignored',
    'reopened',
    'auto_resolved',
  ]);
  const validActors = new Set(['AI Watchdog', 'Gemini AI', 'Owner']);
  const validSeverities = new Set(['info', 'warning', 'critical']);

  return {
    id: sanitizeWatchdogIdForFirestore(String(data?.id || docId), 'log'),
    ...(data?.alertId ? { alertId: String(data.alertId).slice(0, 128) } : {}),
    ...(data?.alertTitle ? { alertTitle: String(data.alertTitle).trim().slice(0, 200) } : {}),
    category: validCategories.has(data?.category) ? data.category : 'system',
    action: validActions.has(data?.action) ? data.action : 'detected',
    actor: validActors.has(data?.actor) ? data.actor : 'AI Watchdog',
    details: String(data?.details || '').trim().slice(0, 500),
    ...(validSeverities.has(data?.severity) ? { severity: data.severity } : {}),
    at: String(data?.at || new Date().toISOString()).slice(0, 64),
  };
}

export async function fetchWatchdogAlertsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<WatchdogAlert[]> {
  const path = 'watchdogAlerts';
  try {
    const ref = collection(db, 'watchdogAlerts');
    const snapshot = await withFirestoreTimeout(
      options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
      9000,
      'fetchWatchdogAlertsFromCloud'
    );
    const list: WatchdogAlert[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      if (data && data.title) {
        list.push(normalizeWatchdogAlert(data, d.id));
      }
    });
    return list.sort(
      (a, b) => new Date(b.updatedAt || b.detectedAt || 0).getTime() - new Date(a.updatedAt || a.detectedAt || 0).getTime()
    );
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('Watchdog alerts fetch skipped while offline.');
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToWatchdogAlerts(callback: (alerts: WatchdogAlert[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'watchdogAlerts'),
      (snapshot) => {
        const list: WatchdogAlert[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.title) {
            list.push(normalizeWatchdogAlert(data, d.id));
          }
        });
        list.sort(
          (a, b) => new Date(b.updatedAt || b.detectedAt || 0).getTime() - new Date(a.updatedAt || a.detectedAt || 0).getTime()
        );
        callback(list);
      },
      (error) => {
        if (!isOfflineOrTransientError(error)) {
          console.warn('Watchdog alerts subscription warning:', error);
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveWatchdogAlertToCloud(alert: WatchdogAlert): Promise<void> {
  const safeId = sanitizeWatchdogIdForFirestore(alert.id, 'wd');
  const path = `watchdogAlerts/${safeId}`;
  try {
    const nowIso = new Date().toISOString();
    const payload = sanitizeForFirestore({
      id: safeId,
      title: String(alert.title || 'Watchdog Alert').trim().slice(0, 200),
      explanation: String(alert.explanation || '').trim().slice(0, 800),
      recommendedAction: String(alert.recommendedAction || 'Inspect item').trim().slice(0, 400),
      category: alert.category,
      severity: alert.severity,
      status: alert.status,
      ...(alert.targetType ? { targetType: alert.targetType } : {}),
      ...(alert.targetId ? { targetId: String(alert.targetId).slice(0, 128) } : {}),
      ...(alert.targetLabel ? { targetLabel: String(alert.targetLabel).trim().slice(0, 200) } : {}),
      detectedBy: alert.detectedBy === 'gemini_ai' ? 'gemini_ai' : 'rules',
      detectedAt: (alert.detectedAt || nowIso).slice(0, 64),
      updatedAt: (alert.updatedAt || nowIso).slice(0, 64),
      ...(alert.resolvedAt ? { resolvedAt: String(alert.resolvedAt).slice(0, 64) } : {}),
      ...(alert.ownerNote ? { ownerNote: String(alert.ownerNote).trim().slice(0, 400) } : {}),
    });
    await setDoc(doc(db, 'watchdogAlerts', safeId), payload);
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('Watchdog alert save deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchWatchdogLogsFromCloud(
  options: { forceRefresh?: boolean } = {}
): Promise<WatchdogActivityLog[]> {
  const path = 'watchdogLogs';
  try {
    const ref = collection(db, 'watchdogLogs');
    const snapshot = await withFirestoreTimeout(
      options.forceRefresh ? getDocsFromServer(ref) : getDocs(ref),
      9000,
      'fetchWatchdogLogsFromCloud'
    );
    const list: WatchdogActivityLog[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      if (data && data.action && data.details) {
        list.push(normalizeWatchdogLog(data, d.id));
      }
    });
    return list
      .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
      .slice(0, 250);
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('Watchdog logs fetch skipped while offline.');
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToWatchdogLogs(callback: (logs: WatchdogActivityLog[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'watchdogLogs'),
      (snapshot) => {
        const list: WatchdogActivityLog[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.action && data.details) {
            list.push(normalizeWatchdogLog(data, d.id));
          }
        });
        list.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
        callback(list.slice(0, 250));
      },
      (error) => {
        if (!isOfflineOrTransientError(error)) {
          console.warn('Watchdog logs subscription warning:', error);
        }
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveWatchdogLogToCloud(entry: WatchdogActivityLog): Promise<void> {
  const safeId = sanitizeWatchdogIdForFirestore(entry.id, 'log');
  const path = `watchdogLogs/${safeId}`;
  try {
    const payload = sanitizeForFirestore({
      id: safeId,
      ...(entry.alertId ? { alertId: sanitizeWatchdogIdForFirestore(entry.alertId, 'wd') } : {}),
      ...(entry.alertTitle ? { alertTitle: String(entry.alertTitle).trim().slice(0, 200) } : {}),
      category: entry.category || 'system',
      action: entry.action,
      actor: entry.actor,
      details: String(entry.details || '').trim().slice(0, 500),
      ...(entry.severity ? { severity: entry.severity } : {}),
      at: String(entry.at || new Date().toISOString()).slice(0, 64),
    });
    await setDoc(doc(db, 'watchdogLogs', safeId), payload);
  } catch (error) {
    if (isOfflineOrTransientError(error)) {
      console.warn('Watchdog log save deferred while offline.');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

