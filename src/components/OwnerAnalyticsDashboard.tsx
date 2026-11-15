import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  IndianRupee,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Store,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  type AnalyticsCustomer,
  type AnalyticsEvent,
  type CartItem,
  type Order,
  type Product,
  getGuestShortCode,
  getISTDateKey,
  isRegisteredCustomerId,
} from '../defaultData';

interface OwnerAnalyticsDashboardProps {
  products: Product[];
  orders: Order[];
  analyticsEvents: AnalyticsEvent[];
  analyticsCustomers: AnalyticsCustomer[];
  activeCartItems: CartItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onViewFullOrder?: (order: Order) => void;
  formatCurrency: (val: number) => string;
}

type DatePreset = 'today' | '7d' | '30d' | '90d' | 'custom';
type SalesGranularity = 'daily' | 'weekly' | 'monthly';
type SalesMetric = 'revenue' | 'orders';
type ProductViewTab = 'rankings' | 'mostViewed' | 'mostOrdered' | 'mostCarted' | 'leastViewed';

const EARNED_STATUSES = new Set(['completed', 'delivered', 'collected']);

function parseOrderAmount(order: Order): number {
  const rawPrice: any = order.price;
  if (typeof rawPrice === 'number' && isFinite(rawPrice) && rawPrice >= 0) {
    return rawPrice;
  }
  if (typeof rawPrice === 'string') {
    const num = parseFloat(rawPrice.replace(/[^\d.]/g, ''));
    if (!isNaN(num) && isFinite(num) && num >= 0) return num;
  }
  if (typeof order.unitPrice === 'number' && isFinite(order.unitPrice) && order.unitPrice >= 0) {
    const qty = typeof order.quantity === 'number' && order.quantity > 0 ? order.quantity : 1;
    return order.unitPrice * qty;
  }
  return 0;
}

function shiftISTDateKey(baseDateKey: string, deltaDays: number): string {
  const [y, m, d] = baseDateKey.split('-').map(Number);
  const utc = Date.UTC(y || 2026, (m || 1) - 1, d || 1);
  const shifted = new Date(utc + deltaDays * 86400000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function enumerateDateKeys(startKey: string, endKey: string, maxDays = 120): string[] {
  const keys: string[] = [];
  let cursor = startKey;
  let guard = 0;
  while (cursor <= endKey && guard < maxDays) {
    keys.push(cursor);
    cursor = shiftISTDateKey(cursor, 1);
    guard += 1;
  }
  return keys;
}

function getMondayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const day = utcDate.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return shiftISTDateKey(dateKey, diffToMonday);
}

function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function formatDateTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

function formatFullDateKeyIST(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatFullMonthTitle(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatFullDateTimeIST(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '—';
  }
}

function derivePaymentStatus(order: Order): {
  label: string;
  tone: 'paid' | 'pending' | 'cancelled';
} {
  const s = (order.status || 'New').trim().toLowerCase();
  if (s === 'completed' || s === 'delivered' || s === 'collected') {
    return { label: 'Paid', tone: 'paid' };
  }
  if (s === 'cancelled') {
    return { label: 'Cancelled / Unpaid', tone: 'cancelled' };
  }
  if (s === 'preparing' || s === 'dispatched' || s === 'ready for pickup') {
    return { label: 'Paid / In Prep', tone: 'paid' };
  }
  if (s === 'confirmed' && order.paymentRecipientName?.trim()) {
    return { label: `Pending · To ${order.paymentRecipientName.trim()}`, tone: 'pending' };
  }
  if (order.mode === 'Adult') {
    return { label: 'Pending (UPI / Cash)', tone: 'pending' };
  }
  return { label: 'Pending', tone: 'pending' };
}

function getOrderStatusTone(status?: string): string {
  const s = (status || 'New').trim().toLowerCase();
  if (s === 'completed' || s === 'delivered' || s === 'collected') return 'completed';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'preparing' || s === 'dispatched' || s === 'ready for pickup') return 'progress';
  if (s === 'confirmed') return 'confirmed';
  return 'new';
}

export const OwnerAnalyticsDashboard: React.FC<OwnerAnalyticsDashboardProps> = ({
  products,
  orders,
  analyticsEvents,
  analyticsCustomers,
  activeCartItems,
  loading,
  onRefresh,
  onViewFullOrder,
  formatCurrency,
}) => {
  const todayKey = useMemo(() => getISTDateKey(), []);
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>(() =>
    shiftISTDateKey(getISTDateKey(), -29)
  );
  const [customEndDate, setCustomEndDate] = useState<string>(() => getISTDateKey());
  const [salesGranularity, setSalesGranularity] = useState<SalesGranularity>('daily');
  const [salesMetric, setSalesMetric] = useState<SalesMetric>('revenue');
  const [hoveredBucketIdx, setHoveredBucketIdx] = useState<number | null>(null);
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [isLiveCartModalOpen, setIsLiveCartModalOpen] = useState<boolean>(false);
  const [liveCartViewTab, setLiveCartViewTab] = useState<'products' | 'customers'>('customers');
  const [inlineCartViewTab, setInlineCartViewTab] = useState<'customers' | 'products'>('customers');
  const [productTab, setProductTab] = useState<ProductViewTab>('rankings');

  useEffect(() => {
    if (!selectedBucketKey && !isLiveCartModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBucketKey(null);
        setIsLiveCartModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedBucketKey, isLiveCartModalOpen]);

  const { startDateKey, endDateKey, rangeLabel } = useMemo(() => {
    if (datePreset === 'today') {
      return {
        startDateKey: todayKey,
        endDateKey: todayKey,
        rangeLabel: `Today (${formatShortDate(todayKey)})`,
      };
    }
    if (datePreset === '7d') {
      const start = shiftISTDateKey(todayKey, -6);
      return {
        startDateKey: start,
        endDateKey: todayKey,
        rangeLabel: 'Last 7 days',
      };
    }
    if (datePreset === '30d') {
      const start = shiftISTDateKey(todayKey, -29);
      return {
        startDateKey: start,
        endDateKey: todayKey,
        rangeLabel: 'Last 30 days',
      };
    }
    if (datePreset === '90d') {
      const start = shiftISTDateKey(todayKey, -89);
      return {
        startDateKey: start,
        endDateKey: todayKey,
        rangeLabel: 'Last 90 days',
      };
    }
    const cleanStart = customStartDate || shiftISTDateKey(todayKey, -29);
    const cleanEnd = customEndDate || todayKey;
    const orderedStart = cleanStart <= cleanEnd ? cleanStart : cleanEnd;
    const orderedEnd = cleanStart <= cleanEnd ? cleanEnd : cleanStart;
    return {
      startDateKey: orderedStart,
      endDateKey: orderedEnd,
      rangeLabel: `${formatShortDate(orderedStart)} – ${formatShortDate(orderedEnd)}`,
    };
  }, [datePreset, todayKey, customStartDate, customEndDate]);

  // Filter real orders & analytics events inside the active IST date range
  const {
    rangeOrders,
    nonCancelledRangeOrders,
    rangeVisitEvents,
    rangeViewEvents,
    rangeCartEvents,
  } = useMemo(() => {
    const rOrders = orders.filter((o) => {
      if (!o || !o.createdAt) return false;
      const key = getISTDateKey(o.createdAt);
      return key >= startDateKey && key <= endDateKey;
    });

    const validOrders = rOrders.filter(
      (o) => (o.status || '').trim().toLowerCase() !== 'cancelled'
    );

    const visits: AnalyticsEvent[] = [];
    const views: AnalyticsEvent[] = [];
    const carts: AnalyticsEvent[] = [];

    for (const ev of analyticsEvents) {
      if (!ev || !ev.dateKey) continue;
      if (ev.dateKey < startDateKey || ev.dateKey > endDateKey) continue;
      if (ev.type === 'visit') visits.push(ev);
      else if (ev.type === 'product_view') views.push(ev);
      else if (ev.type === 'add_to_cart') carts.push(ev);
    }

    return {
      rangeOrders: rOrders,
      nonCancelledRangeOrders: validOrders,
      rangeVisitEvents: visits,
      rangeViewEvents: views,
      rangeCartEvents: carts,
    };
  }, [orders, analyticsEvents, startDateKey, endDateKey]);

  // ----------------- 1. OVERVIEW METRICS -----------------
  const overview = useMemo(() => {
    const uniqueVisitorIds = new Set<string>();
    for (const v of rangeVisitEvents) {
      if (v.customerId) uniqueVisitorIds.add(v.customerId);
    }
    for (const o of rangeOrders) {
      if (o.customerId) uniqueVisitorIds.add(o.customerId);
    }

    const totalVisitsCount = Math.max(
      uniqueVisitorIds.size,
      rangeVisitEvents.reduce((acc, ev) => acc + (ev.count || 1), 0)
    );

    const totalProductViews = rangeViewEvents.reduce(
      (acc, ev) => acc + (ev.count || 1),
      0
    );
    const distinctProductsViewed = new Set(
      rangeViewEvents.map((ev) => ev.productId).filter(Boolean)
    ).size;

    const totalOrders = nonCancelledRangeOrders.length;
    const completedOrdersCount = nonCancelledRangeOrders.filter((o) =>
      EARNED_STATUSES.has((o.status || '').trim().toLowerCase())
    ).length;
    const cancelledOrdersCount = rangeOrders.length - nonCancelledRangeOrders.length;

    const totalRevenue = nonCancelledRangeOrders.reduce(
      (acc, o) => acc + parseOrderAmount(o),
      0
    );
    const earnedRevenue = nonCancelledRangeOrders
      .filter((o) => EARNED_STATUSES.has((o.status || '').trim().toLowerCase()))
      .reduce((acc, o) => acc + parseOrderAmount(o), 0);

    const activeProductsCount = products.filter((p) => p.available !== false).length;
    const draftProductsCount = products.filter((p) => p.available === false).length;

    const totalAddedToCart = rangeCartEvents.reduce(
      (acc, ev) => acc + (typeof ev.quantity === 'number' && ev.quantity > 0 ? ev.quantity : ev.count || 1),
      0
    );
    const distinctCartProducts = new Set(
      rangeCartEvents.map((ev) => ev.productId).filter(Boolean)
    ).size;

    return {
      totalVisitors: uniqueVisitorIds.size,
      totalVisitsCount,
      totalProductViews,
      distinctProductsViewed,
      totalOrders,
      completedOrdersCount,
      cancelledOrdersCount,
      totalRevenue,
      earnedRevenue,
      activeProductsCount,
      draftProductsCount,
      totalProductsCount: products.length,
      totalAddedToCart,
      distinctCartProducts,
    };
  }, [
    rangeVisitEvents,
    rangeViewEvents,
    rangeCartEvents,
    rangeOrders,
    nonCancelledRangeOrders,
    products,
  ]);

  // ----------------- 1B. LIVE ACTIVE CUSTOMER CARTS (REAL-TIME FIRESTORE) -----------------
  const liveCartSummary = useMemo(() => {
    const dedupedItems = new Map<string, CartItem>();
    for (const raw of activeCartItems) {
      if (!raw || !raw.customerId || !raw.productId) continue;
      const qty =
        typeof raw.quantity === 'number' && isFinite(raw.quantity)
          ? Math.round(raw.quantity)
          : 1;
      if (qty <= 0) continue;

      const colourKey = String(raw.colour || '').trim().toLowerCase() || 'default';
      const dedupeKey = raw.id || `${raw.customerId}__${raw.productId}__${colourKey}`;
      if (!dedupedItems.has(dedupeKey)) {
        dedupedItems.set(dedupeKey, { ...raw, quantity: qty });
      }
    }

    const analyticsCustomerById = new Map<string, AnalyticsCustomer>();
    for (const c of analyticsCustomers) {
      if (c?.customerId) {
        analyticsCustomerById.set(c.customerId, c);
      }
    }

    // Exact customerId -> explicitly provided order name (never guessed)
    const orderNameByCustomerId = new Map<string, string>();
    for (const o of orders) {
      if (o?.customerId && o?.name?.trim()) {
        orderNameByCustomerId.set(o.customerId, o.name.trim());
      }
    }

    // Build collision-free short guest codes for all active cart customer IDs
    const uniqueActiveCustomerIds = new Set<string>();
    for (const item of dedupedItems.values()) {
      uniqueActiveCustomerIds.add(item.customerId);
    }
    const baseCodeBuckets = new Map<string, string[]>();
    for (const cid of uniqueActiveCustomerIds) {
      const code4 = getGuestShortCode(cid, 4);
      const bucket = baseCodeBuckets.get(code4) || [];
      bucket.push(cid);
      baseCodeBuckets.set(code4, bucket);
    }
    const resolvedGuestCodes = new Map<string, string>();
    for (const cid of uniqueActiveCustomerIds) {
      const code4 = getGuestShortCode(cid, 4);
      const bucket = baseCodeBuckets.get(code4) || [];
      resolvedGuestCodes.set(cid, bucket.length > 1 ? getGuestShortCode(cid, 6) : code4);
    }

    const resolveCustomerIdentity = (cid: string, itemsForCustomer: CartItem[]) => {
      const custDoc = analyticsCustomerById.get(cid);
      const itemMarkedRegistered = itemsForCustomer.some((it) => it.isGuest === false);
      const itemMarkedGuest = itemsForCustomer.some((it) => it.isGuest === true);
      const isRegistered =
        isRegisteredCustomerId(cid) ||
        custDoc?.isAuthenticated === true ||
        (itemMarkedRegistered && !itemMarkedGuest);

      // Prefer latest explicit name from cart item, then analytics profile, then exact customerId order
      let itemProvidedName = '';
      for (const it of itemsForCustomer) {
        if (it.customerName && it.customerName.trim()) {
          itemProvidedName = it.customerName.trim();
        }
      }
      const explicitName =
        itemProvidedName ||
        custDoc?.displayName?.trim() ||
        orderNameByCustomerId.get(cid) ||
        '';

      const shortCode = resolvedGuestCodes.get(cid) || getGuestShortCode(cid, 4);
      const guestTag = `Guest Customer #${shortCode}`;

      if (isRegistered) {
        return {
          isRegistered: true,
          hasExplicitName: Boolean(explicitName),
          customerLabel: explicitName || `Registered Customer #${shortCode}`,
          customerSubLabel: 'Registered Account',
          badgeLabel: 'Registered',
          badgeTone: 'registered' as const,
          shortCode,
        };
      }

      if (explicitName) {
        return {
          isRegistered: false,
          hasExplicitName: true,
          customerLabel: explicitName,
          customerSubLabel: guestTag,
          badgeLabel: 'Guest · Named',
          badgeTone: 'guest-named' as const,
          shortCode,
        };
      }

      return {
        isRegistered: false,
        hasExplicitName: false,
        customerLabel: guestTag,
        customerSubLabel: `Guest ID #${shortCode}`,
        badgeLabel: 'Guest',
        badgeTone: 'guest' as const,
        shortCode,
      };
    };

    interface LiveProductCartEntry {
      customerId: string;
      customerLabel: string;
      isRegistered: boolean;
      quantity: number;
      colour?: string;
      updatedAt: string;
    }

    interface LiveProductInCartRow {
      productId: string;
      productName: string;
      productImageUrl: string;
      category: string;
      unitPrice: number;
      totalQuantity: number;
      customerIds: Set<string>;
      entries: LiveProductCartEntry[];
    }

    interface LiveCustomerCartRow {
      customerId: string;
      customerLabel: string;
      customerSubLabel: string;
      badgeLabel: string;
      badgeTone: 'registered' | 'guest-named' | 'guest';
      isRegistered: boolean;
      totalQuantity: number;
      totalValue: number;
      distinctProductIds: Set<string>;
      items: Array<CartItem & { resolvedImage: string; resolvedName: string; resolvedPrice: number }>;
      lastUpdatedAt: string;
    }

    // Group items per unique customerId first so identity resolution has full context
    const itemsByCustomer = new Map<string, CartItem[]>();
    for (const item of dedupedItems.values()) {
      const list = itemsByCustomer.get(item.customerId) || [];
      list.push(item);
      itemsByCustomer.set(item.customerId, list);
    }

    const identityByCustomerId = new Map<
      string,
      ReturnType<typeof resolveCustomerIdentity>
    >();
    for (const [cid, list] of itemsByCustomer.entries()) {
      identityByCustomerId.set(cid, resolveCustomerIdentity(cid, list));
    }

    const prodMap = new Map<string, LiveProductInCartRow>();
    const custMap = new Map<string, LiveCustomerCartRow>();
    let totalQuantity = 0;

    for (const item of dedupedItems.values()) {
      const qty = item.quantity || 1;
      totalQuantity += qty;

      const catalogProd = products.find((p) => p.id === item.productId);
      const resolvedName = catalogProd?.name || item.productName || 'Product';
      const resolvedImage =
        (catalogProd?.imageUrls && catalogProd.imageUrls[0]) ||
        catalogProd?.imageUrl ||
        item.productImageUrl ||
        '/toys/toy-40ba4ba9-1.jpg';
      const resolvedCategory = catalogProd?.category || item.category || 'Other';
      const unitPrice = typeof catalogProd?.price === 'number' ? catalogProd.price : item.price || 0;
      const identity =
        identityByCustomerId.get(item.customerId) ||
        resolveCustomerIdentity(item.customerId, [item]);
      const itemTime = item.updatedAt || item.addedAt || '';

      // Aggregate per product across all customers
      const existingProd = prodMap.get(item.productId) || {
        productId: item.productId,
        productName: resolvedName,
        productImageUrl: resolvedImage,
        category: resolvedCategory,
        unitPrice,
        totalQuantity: 0,
        customerIds: new Set<string>(),
        entries: [],
      };
      existingProd.totalQuantity += qty;
      existingProd.customerIds.add(item.customerId);
      existingProd.entries.push({
        customerId: item.customerId,
        customerLabel: identity.customerLabel,
        isRegistered: identity.isRegistered,
        quantity: qty,
        colour: item.colour,
        updatedAt: itemTime,
      });
      prodMap.set(item.productId, existingProd);

      // Track each customer's cart separately by exact unique customerId
      const existingCust = custMap.get(item.customerId) || {
        customerId: item.customerId,
        customerLabel: identity.customerLabel,
        customerSubLabel: identity.customerSubLabel,
        badgeLabel: identity.badgeLabel,
        badgeTone: identity.badgeTone,
        isRegistered: identity.isRegistered,
        totalQuantity: 0,
        totalValue: 0,
        distinctProductIds: new Set<string>(),
        items: [],
        lastUpdatedAt: itemTime,
      };
      existingCust.totalQuantity += qty;
      existingCust.totalValue += unitPrice * qty;
      existingCust.distinctProductIds.add(item.productId);
      existingCust.items.push({
        ...item,
        resolvedName,
        resolvedImage,
        resolvedPrice: unitPrice,
      });
      if (itemTime > existingCust.lastUpdatedAt) {
        existingCust.lastUpdatedAt = itemTime;
      }
      custMap.set(item.customerId, existingCust);
    }

    const productsInCarts = Array.from(prodMap.values())
      .map((p) => ({
        ...p,
        customerCount: p.customerIds.size,
      }))
      .sort(
        (a, b) =>
          b.totalQuantity - a.totalQuantity ||
          b.customerCount - a.customerCount ||
          a.productName.localeCompare(b.productName)
      );

    const customerCarts = Array.from(custMap.values())
      .map((c) => ({
        ...c,
        distinctCount: c.distinctProductIds.size,
      }))
      .sort(
        (a, b) =>
          new Date(b.lastUpdatedAt || 0).getTime() - new Date(a.lastUpdatedAt || 0).getTime() ||
          b.totalQuantity - a.totalQuantity
      );

    return {
      totalQuantity,
      distinctProductsCount: prodMap.size,
      activeCustomersCount: custMap.size,
      productsInCarts,
      customerCarts,
    };
  }, [activeCartItems, products, analyticsCustomers, orders]);

  // ----------------- 2. SALES ANALYTICS (DAILY / WEEKLY / MONTHLY & CHART) -----------------
  const salesSummary = useMemo(() => {
    const start7 = shiftISTDateKey(todayKey, -6);
    const start30 = shiftISTDateKey(todayKey, -29);

    let dailyRev = 0;
    let dailyOrders = 0;
    let weeklyRev = 0;
    let weeklyOrders = 0;
    let monthlyRev = 0;
    let monthlyOrders = 0;

    for (const o of orders) {
      if (!o || !o.createdAt) continue;
      if ((o.status || '').trim().toLowerCase() === 'cancelled') continue;
      const key = getISTDateKey(o.createdAt);
      const amt = parseOrderAmount(o);
      if (key === todayKey) {
        dailyRev += amt;
        dailyOrders += 1;
      }
      if (key >= start7 && key <= todayKey) {
        weeklyRev += amt;
        weeklyOrders += 1;
      }
      if (key >= start30 && key <= todayKey) {
        monthlyRev += amt;
        monthlyOrders += 1;
      }
    }

    const avgOrderValue =
      overview.totalOrders > 0 ? overview.totalRevenue / overview.totalOrders : 0;

    return {
      dailyRev,
      dailyOrders,
      weeklyRev,
      weeklyOrders,
      monthlyRev,
      monthlyOrders,
      avgOrderValue,
    };
  }, [orders, todayKey, overview.totalOrders, overview.totalRevenue]);

  const salesChartBuckets = useMemo(() => {
    interface SalesBucket {
      key: string;
      label: string;
      periodTitle: string;
      revenue: number;
      orders: number;
      bucketOrders: Order[];
    }
    const map = new Map<string, SalesBucket>();

    if (salesGranularity === 'daily') {
      const days = enumerateDateKeys(startDateKey, endDateKey, 95);
      for (const dk of days) {
        map.set(dk, {
          key: dk,
          label: formatShortDate(dk),
          periodTitle: formatFullDateKeyIST(dk),
          revenue: 0,
          orders: 0,
          bucketOrders: [],
        });
      }
      for (const o of rangeOrders) {
        const dk = getISTDateKey(o.createdAt);
        const existing = map.get(dk) || {
          key: dk,
          label: formatShortDate(dk),
          periodTitle: formatFullDateKeyIST(dk),
          revenue: 0,
          orders: 0,
          bucketOrders: [],
        };
        existing.bucketOrders.push(o);
        if ((o.status || '').trim().toLowerCase() !== 'cancelled') {
          existing.revenue += parseOrderAmount(o);
          existing.orders += 1;
        }
        map.set(dk, existing);
      }
    } else if (salesGranularity === 'weekly') {
      const days = enumerateDateKeys(startDateKey, endDateKey, 365);
      for (const dk of days) {
        const wk = getMondayKey(dk);
        if (!map.has(wk)) {
          const wkEnd = shiftISTDateKey(wk, 6);
          map.set(wk, {
            key: wk,
            label: `Wk ${formatShortDate(wk)}`,
            periodTitle: `${formatFullDateKeyIST(wk)} – ${formatFullDateKeyIST(wkEnd)}`,
            revenue: 0,
            orders: 0,
            bucketOrders: [],
          });
        }
      }
      for (const o of rangeOrders) {
        const wk = getMondayKey(getISTDateKey(o.createdAt));
        const wkEnd = shiftISTDateKey(wk, 6);
        const existing = map.get(wk) || {
          key: wk,
          label: `Wk ${formatShortDate(wk)}`,
          periodTitle: `${formatFullDateKeyIST(wk)} – ${formatFullDateKeyIST(wkEnd)}`,
          revenue: 0,
          orders: 0,
          bucketOrders: [],
        };
        existing.bucketOrders.push(o);
        if ((o.status || '').trim().toLowerCase() !== 'cancelled') {
          existing.revenue += parseOrderAmount(o);
          existing.orders += 1;
        }
        map.set(wk, existing);
      }
    } else {
      // monthly
      const startMonth = startDateKey.slice(0, 7);
      const endMonth = endDateKey.slice(0, 7);
      let [cy, cm] = startMonth.split('-').map(Number);
      const [ey, em] = endMonth.split('-').map(Number);
      let guard = 0;
      while ((cy < ey || (cy === ey && cm <= em)) && guard < 36) {
        const mk = `${cy}-${String(cm).padStart(2, '0')}`;
        map.set(mk, {
          key: mk,
          label: formatMonthLabel(mk),
          periodTitle: formatFullMonthTitle(mk),
          revenue: 0,
          orders: 0,
          bucketOrders: [],
        });
        cm += 1;
        if (cm > 12) {
          cm = 1;
          cy += 1;
        }
        guard += 1;
      }
      for (const o of rangeOrders) {
        const mk = getISTDateKey(o.createdAt).slice(0, 7);
        const existing = map.get(mk) || {
          key: mk,
          label: formatMonthLabel(mk),
          periodTitle: formatFullMonthTitle(mk),
          revenue: 0,
          orders: 0,
          bucketOrders: [],
        };
        existing.bucketOrders.push(o);
        if ((o.status || '').trim().toLowerCase() !== 'cancelled') {
          existing.revenue += parseOrderAmount(o);
          existing.orders += 1;
        }
        map.set(mk, existing);
      }
    }

    return Array.from(map.values())
      .map((bucket) => ({
        ...bucket,
        bucketOrders: [...bucket.bucketOrders].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [salesGranularity, startDateKey, endDateKey, rangeOrders]);

  const statusBreakdown = useMemo(() => {
    const groups = [
      { key: 'new', label: 'New / Pending', statuses: ['new', 'contacted', 'confirmed'], color: '#d97706', count: 0, revenue: 0 },
      { key: 'progress', label: 'Preparing & Out', statuses: ['preparing', 'dispatched', 'ready for pickup'], color: '#3b82f6', count: 0, revenue: 0 },
      { key: 'completed', label: 'Completed / Delivered', statuses: ['completed', 'delivered', 'collected'], color: '#15803d', count: 0, revenue: 0 },
      { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'], color: '#b65c4b', count: 0, revenue: 0 },
    ];

    for (const o of rangeOrders) {
      const s = (o.status || 'New').trim().toLowerCase();
      const target =
        groups.find((g) => g.statuses.includes(s)) || groups[0];
      target.count += 1;
      target.revenue += parseOrderAmount(o);
    }

    return groups;
  }, [rangeOrders]);

  // ----------------- 3. PRODUCT ANALYTICS & POPULARITY RANKINGS -----------------
  const productAnalytics = useMemo(() => {
    interface ProductStatsRow {
      productId: string;
      name: string;
      category: string;
      imageUrl: string;
      price: number;
      available: boolean;
      views: number;
      cartAdds: number;
      ordersCount: number;
      unitsOrdered: number;
      revenue: number;
      popularityScore: number;
    }

    const rowMap = new Map<string, ProductStatsRow>();
    const nameLookup = new Map<string, string>();

    for (const p of products) {
      const img = (p.imageUrls && p.imageUrls[0]) || p.imageUrl || '/toys/toy-40ba4ba9-1.jpg';
      rowMap.set(p.id, {
        productId: p.id,
        name: p.name,
        category: p.category || 'Other',
        imageUrl: img,
        price: p.price,
        available: p.available !== false,
        views: 0,
        cartAdds: 0,
        ordersCount: 0,
        unitsOrdered: 0,
        revenue: 0,
        popularityScore: 0,
      });
      nameLookup.set(p.name.trim().toLowerCase(), p.id);
    }

    const ensureRow = (pid?: string, pname?: string, cat?: string): ProductStatsRow | null => {
      const cleanId = pid && rowMap.has(pid) ? pid : undefined;
      if (cleanId) return rowMap.get(cleanId)!;

      const byName = pname ? nameLookup.get(pname.trim().toLowerCase()) : undefined;
      if (byName && rowMap.has(byName)) return rowMap.get(byName)!;

      if (!pid && !pname) return null;
      const fallbackId = pid || `legacy_${pname}`;
      if (!rowMap.has(fallbackId)) {
        rowMap.set(fallbackId, {
          productId: fallbackId,
          name: pname || 'Product',
          category: cat || 'Other',
          imageUrl: '/toys/toy-40ba4ba9-1.jpg',
          price: 0,
          available: false,
          views: 0,
          cartAdds: 0,
          ordersCount: 0,
          unitsOrdered: 0,
          revenue: 0,
          popularityScore: 0,
        });
      }
      return rowMap.get(fallbackId)!;
    };

    for (const ev of rangeViewEvents) {
      const row = ensureRow(ev.productId, ev.productName, ev.category);
      if (row) row.views += ev.count || 1;
    }

    for (const ev of rangeCartEvents) {
      const row = ensureRow(ev.productId, ev.productName, ev.category);
      if (row) {
        row.cartAdds +=
          typeof ev.quantity === 'number' && ev.quantity > 0
            ? ev.quantity
            : ev.count || 1;
      }
    }

    for (const o of nonCancelledRangeOrders) {
      const row = ensureRow(o.productId, o.productName);
      if (row) {
        row.ordersCount += 1;
        row.unitsOrdered += typeof o.quantity === 'number' && o.quantity > 0 ? o.quantity : 1;
        row.revenue += parseOrderAmount(o);
      }
    }

    const allRows = Array.from(rowMap.values()).map((r) => ({
      ...r,
      popularityScore: r.views * 1 + r.cartAdds * 3 + r.unitsOrdered * 5,
    }));

    const rankings = [...allRows].sort(
      (a, b) =>
        b.popularityScore - a.popularityScore ||
        b.revenue - a.revenue ||
        b.views - a.views ||
        a.name.localeCompare(b.name)
    );

    const mostViewed = [...allRows]
      .filter((r) => r.views > 0 || r.available)
      .sort((a, b) => b.views - a.views || b.popularityScore - a.popularityScore);

    const mostOrdered = [...allRows]
      .filter((r) => r.ordersCount > 0 || r.available)
      .sort(
        (a, b) =>
          b.unitsOrdered - a.unitsOrdered ||
          b.ordersCount - a.ordersCount ||
          b.revenue - a.revenue
      );

    const mostCarted = [...allRows]
      .filter((r) => r.cartAdds > 0 || r.available)
      .sort((a, b) => b.cartAdds - a.cartAdds || b.views - a.views);

    const leastViewed = [...allRows]
      .filter((r) => r.available)
      .sort((a, b) => a.views - b.views || a.unitsOrdered - b.unitsOrdered || a.name.localeCompare(b.name));

    return {
      rankings,
      mostViewed,
      mostOrdered,
      mostCarted,
      leastViewed,
    };
  }, [products, rangeViewEvents, rangeCartEvents, nonCancelledRangeOrders]);

  // ----------------- 4. CUSTOMER ANALYTICS -----------------
  const customerAnalytics = useMemo(() => {
    interface CustomerSummary {
      customerId: string;
      displayName: string;
      mode: string;
      firstSeenAt: string;
      firstSeenDateKey: string;
      lastSeenAt: string;
      lastSeenDateKey: string;
      totalVisitsAllTime: number;
      rangeVisits: number;
      rangeViews: number;
      rangeCartAdds: number;
      rangeOrdersCount: number;
      rangeSpent: number;
      allTimeOrdersCount: number;
      activityScore: number;
      isNewInRange: boolean;
      isReturningInRange: boolean;
    }

    const custMap = new Map<string, CustomerSummary>();

    const touchCustomer = (cid: string, seenAt: string) => {
      const cleanId = cid || 'guest';
      const dk = getISTDateKey(seenAt);
      const existing = custMap.get(cleanId);
      if (!existing) {
        const defaultGuestLabel = isRegisteredCustomerId(cleanId)
          ? `Registered Customer #${getGuestShortCode(cleanId, 4)}`
          : `Guest Customer #${getGuestShortCode(cleanId, 4)}`;
        custMap.set(cleanId, {
          customerId: cleanId,
          displayName: defaultGuestLabel,
          mode: 'Visitor',
          firstSeenAt: seenAt,
          firstSeenDateKey: dk,
          lastSeenAt: seenAt,
          lastSeenDateKey: dk,
          totalVisitsAllTime: 0,
          rangeVisits: 0,
          rangeViews: 0,
          rangeCartAdds: 0,
          rangeOrdersCount: 0,
          rangeSpent: 0,
          allTimeOrdersCount: 0,
          activityScore: 0,
          isNewInRange: false,
          isReturningInRange: false,
        });
      } else {
        if (seenAt < existing.firstSeenAt) {
          existing.firstSeenAt = seenAt;
          existing.firstSeenDateKey = dk;
        }
        if (seenAt > existing.lastSeenAt) {
          existing.lastSeenAt = seenAt;
          existing.lastSeenDateKey = dk;
        }
      }
      return custMap.get(cleanId)!;
    };

    // Seed from analyticsCustomers docs
    for (const c of analyticsCustomers) {
      if (!c || !c.customerId) continue;
      const entry = touchCustomer(c.customerId, c.firstSeenAt || c.createdAt);
      touchCustomer(c.customerId, c.lastSeenAt || c.updatedAt || c.firstSeenAt);
      entry.totalVisitsAllTime = Math.max(entry.totalVisitsAllTime, c.visitCount || 0);
      if (c.displayName && c.displayName.trim()) {
        entry.displayName = c.displayName.trim();
      }
      if (c.mode) entry.mode = c.mode;
    }

    // Merge all historical orders so previously registered buyers are included
    for (const o of orders) {
      if (!o || !o.customerId) continue;
      const entry = touchCustomer(o.customerId, o.createdAt);
      entry.allTimeOrdersCount += 1;
      if (o.name && o.name.trim()) {
        entry.displayName = o.name.trim();
      }
      if (o.mode) entry.mode = o.mode;

      const dk = getISTDateKey(o.createdAt);
      if (dk >= startDateKey && dk <= endDateKey && (o.status || '').toLowerCase() !== 'cancelled') {
        entry.rangeOrdersCount += 1;
        entry.rangeSpent += parseOrderAmount(o);
      }
    }

    // Track distinct active days in range per customer
    const activeDatesInRange = new Map<string, Set<string>>();
    const markRangeDate = (cid: string, dk: string) => {
      if (!activeDatesInRange.has(cid)) activeDatesInRange.set(cid, new Set());
      activeDatesInRange.get(cid)!.add(dk);
    };

    for (const ev of rangeVisitEvents) {
      if (!ev.customerId) continue;
      const entry = touchCustomer(ev.customerId, ev.createdAt);
      entry.rangeVisits += ev.count || 1;
      markRangeDate(ev.customerId, ev.dateKey);
    }

    for (const ev of rangeViewEvents) {
      if (!ev.customerId) continue;
      const entry = touchCustomer(ev.customerId, ev.createdAt);
      entry.rangeViews += ev.count || 1;
      markRangeDate(ev.customerId, ev.dateKey);
    }

    for (const ev of rangeCartEvents) {
      if (!ev.customerId) continue;
      const entry = touchCustomer(ev.customerId, ev.createdAt);
      entry.rangeCartAdds +=
        typeof ev.quantity === 'number' && ev.quantity > 0
          ? ev.quantity
          : ev.count || 1;
      markRangeDate(ev.customerId, ev.dateKey);
    }

    for (const o of rangeOrders) {
      if (!o.customerId) continue;
      markRangeDate(o.customerId, getISTDateKey(o.createdAt));
    }

    let newCount = 0;
    let returningCount = 0;

    for (const entry of custMap.values()) {
      const daysSet = activeDatesInRange.get(entry.customerId);
      const activeInRange =
        (daysSet && daysSet.size > 0) ||
        (entry.lastSeenDateKey >= startDateKey && entry.lastSeenDateKey <= endDateKey);

      if (entry.firstSeenDateKey >= startDateKey && entry.firstSeenDateKey <= endDateKey) {
        entry.isNewInRange = true;
        newCount += 1;
      } else if (
        activeInRange &&
        (entry.firstSeenDateKey < startDateKey ||
          entry.allTimeOrdersCount >= 2 ||
          entry.totalVisitsAllTime >= 2)
      ) {
        entry.isReturningInRange = true;
        returningCount += 1;
      }

      entry.activityScore =
        entry.rangeOrdersCount * 10 +
        entry.rangeCartAdds * 4 +
        entry.rangeViews * 2 +
        entry.rangeVisits * 2 +
        (entry.rangeSpent > 0 ? Math.min(20, Math.round(entry.rangeSpent / 50)) : 0);
    }

    const activeCustomersRanked = Array.from(custMap.values())
      .filter(
        (c) =>
          c.rangeOrdersCount > 0 ||
          c.rangeCartAdds > 0 ||
          c.rangeViews > 0 ||
          c.rangeVisits > 0
      )
      .sort(
        (a, b) =>
          b.activityScore - a.activityScore ||
          b.rangeSpent - a.rangeSpent ||
          b.rangeOrdersCount - a.rangeOrdersCount
      );

    return {
      totalRegisteredCustomers: custMap.size,
      newCustomersCount: newCount,
      returningCustomersCount: returningCount,
      mostActiveCustomers: activeCustomersRanked,
    };
  }, [
    analyticsCustomers,
    orders,
    rangeVisitEvents,
    rangeViewEvents,
    rangeCartEvents,
    rangeOrders,
    startDateKey,
    endDateKey,
  ]);

  // ----------------- CHART GEOMETRY -----------------
  const chartModel = useMemo(() => {
    const svgW = 720;
    const svgH = 260;
    const padLeft = 52;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 38;
    const plotW = svgW - padLeft - padRight;
    const plotH = svgH - padTop - padBottom;

    const values = salesChartBuckets.map((b) =>
      salesMetric === 'revenue' ? b.revenue : b.orders
    );
    const rawMax = values.length > 0 ? Math.max(...values) : 0;
    const maxVal = rawMax > 0 ? rawMax * 1.15 : salesMetric === 'revenue' ? 100 : 5;

    const count = Math.max(1, salesChartBuckets.length);
    const stepX = plotW / count;
    const barW = clampBarWidth(stepX * 0.56);

    const points = salesChartBuckets.map((b, i) => {
      const val = salesMetric === 'revenue' ? b.revenue : b.orders;
      const ratio = maxVal > 0 ? val / maxVal : 0;
      const barH = Math.max(val > 0 ? 4 : 0, ratio * plotH);
      const x = padLeft + i * stepX + stepX / 2;
      const y = padTop + plotH - barH;
      return {
        ...b,
        val,
        x,
        barX: x - barW / 2,
        y,
        barH,
        barW,
      };
    });

    const linePath = points
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      ratio: t,
      y: padTop + plotH - t * plotH,
      value: Math.round(t * maxVal),
    }));

    return { svgW, svgH, padLeft, padRight, padTop, padBottom, plotW, plotH, points, linePath, yTicks };
  }, [salesChartBuckets, salesMetric]);

  const activeProductList = useMemo(() => {
    if (productTab === 'mostViewed') return productAnalytics.mostViewed;
    if (productTab === 'mostOrdered') return productAnalytics.mostOrdered;
    if (productTab === 'mostCarted') return productAnalytics.mostCarted;
    if (productTab === 'leastViewed') return productAnalytics.leastViewed;
    return productAnalytics.rankings;
  }, [productTab, productAnalytics]);

  const topChartProducts = useMemo(
    () => activeProductList.slice(0, 5),
    [activeProductList]
  );

  const activeHoveredPoint =
    hoveredBucketIdx !== null && chartModel.points[hoveredBucketIdx]
      ? chartModel.points[hoveredBucketIdx]
      : null;

  const selectedBucketIndex = useMemo(() => {
    if (!selectedBucketKey) return -1;
    return salesChartBuckets.findIndex((b) => b.key === selectedBucketKey);
  }, [salesChartBuckets, selectedBucketKey]);

  const selectedBucket =
    selectedBucketIndex >= 0 ? salesChartBuckets[selectedBucketIndex] : null;

  const handleSelectBucket = (bucketKey: string, idx: number) => {
    setHoveredBucketIdx(idx);
    setSelectedBucketKey(bucketKey);
  };

  return (
    <section className="analytics-dashboard" aria-label="Owner Analytics Dashboard">
      {/* Header + Date Range Filters */}
      <div className="analytics-header-card">
        <div className="analytics-header-top">
          <div>
            <span className="eyebrow">REAL-TIME STORE INTELLIGENCE</span>
            <h2>Analytics Dashboard</h2>
            <p>
              Live metrics synced from Firebase products, orders, customer visits, and cart activity ({rangeLabel}).
            </p>
          </div>
          <button
            type="button"
            className="secondary-btn analytics-refresh-btn"
            onClick={() => void onRefresh()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'refresh-spinning' : ''} />
            {loading ? 'Syncing…' : 'Refresh data'}
          </button>
        </div>

        <div className="analytics-filter-bar" role="group" aria-label="Analytics date range filter">
          <div className="analytics-preset-pills">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7d', label: 'Last 7 days' },
                { id: '30d', label: 'Last 30 days' },
                { id: '90d', label: 'Last 90 days' },
                { id: 'custom', label: 'Custom range' },
              ] as Array<{ id: DatePreset; label: string }>
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`analytics-preset-btn ${datePreset === preset.id ? 'active' : ''}`}
                onClick={() => {
                  setDatePreset(preset.id);
                  setHoveredBucketIdx(null);
                  setSelectedBucketKey(null);
                  if (preset.id === 'today' || preset.id === '7d' || preset.id === '30d') {
                    setSalesGranularity('daily');
                  } else if (preset.id === '90d') {
                    setSalesGranularity('weekly');
                  }
                }}
              >
                {preset.id === 'custom' && <Calendar size={13} />}
                {preset.label}
              </button>
            ))}
          </div>

          {datePreset === 'custom' && (
            <div className="analytics-custom-dates">
              <label>
                <span>From</span>
                <input
                  type="date"
                  value={customStartDate}
                  max={todayKey}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="date"
                  value={customEndDate}
                  max={todayKey}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 1. DASHBOARD OVERVIEW KPI GRID */}
      <div className="analytics-kpi-grid">
        <article className="analytics-kpi-card">
          <div className="analytics-kpi-head">
            <span>Total website visitors</span>
            <Users size={18} />
          </div>
          <strong className="analytics-kpi-val">{overview.totalVisitors.toLocaleString('en-IN')}</strong>
          <small className="analytics-kpi-sub">
            {overview.totalVisitsCount} tracked visits in range
          </small>
        </article>

        <article className="analytics-kpi-card">
          <div className="analytics-kpi-head">
            <span>Total product views</span>
            <Eye size={18} />
          </div>
          <strong className="analytics-kpi-val">{overview.totalProductViews.toLocaleString('en-IN')}</strong>
          <small className="analytics-kpi-sub">
            {overview.distinctProductsViewed} distinct products viewed
          </small>
        </article>

        <article className="analytics-kpi-card">
          <div className="analytics-kpi-head">
            <span>Total orders</span>
            <PackageCheck size={18} />
          </div>
          <strong className="analytics-kpi-val">{overview.totalOrders.toLocaleString('en-IN')}</strong>
          <small className="analytics-kpi-sub">
            {overview.completedOrdersCount} completed
            {overview.cancelledOrdersCount > 0 ? ` · ${overview.cancelledOrdersCount} cancelled` : ''}
          </small>
        </article>

        <article className="analytics-kpi-card highlight">
          <div className="analytics-kpi-head">
            <span>Total revenue</span>
            <IndianRupee size={18} />
          </div>
          <strong className="analytics-kpi-val">{formatCurrency(overview.totalRevenue)}</strong>
          <small className="analytics-kpi-sub">
            {formatCurrency(overview.earnedRevenue)} delivered/completed
          </small>
        </article>

        <article className="analytics-kpi-card">
          <div className="analytics-kpi-head">
            <span>Total products</span>
            <Store size={18} />
          </div>
          <strong className="analytics-kpi-val">{overview.totalProductsCount.toLocaleString('en-IN')}</strong>
          <small className="analytics-kpi-sub">
            {overview.activeProductsCount} live · {overview.draftProductsCount} drafts
          </small>
        </article>

        <article
          className="analytics-kpi-card analytics-kpi-clickable"
          role="button"
          tabIndex={0}
          onClick={() => setIsLiveCartModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsLiveCartModalOpen(true);
            }
          }}
          title="Tap to inspect products currently in customer carts"
        >
          <div className="analytics-kpi-head">
            <span>Products added to cart</span>
            <ShoppingCart size={18} />
          </div>
          <strong className="analytics-kpi-val">
            {liveCartSummary.totalQuantity.toLocaleString('en-IN')}
          </strong>
          <small className="analytics-kpi-sub">
            {liveCartSummary.distinctProductsCount} distinct{' '}
            {liveCartSummary.distinctProductsCount === 1 ? 'product' : 'products'} ·{' '}
            {liveCartSummary.activeCustomersCount}{' '}
            {liveCartSummary.activeCustomersCount === 1 ? 'cart' : 'carts'}
            {liveCartSummary.totalQuantity > 0 ? ' · View items' : ''}
          </small>
        </article>
      </div>

      {/* 1B. LIVE ACTIVE CUSTOMER CARTS PANEL (REAL-TIME CUSTOMER IDENTIFICATION) */}
      <div className="analytics-section-card">
        <div className="analytics-section-head">
          <div>
            <h3>
              <ShoppingCart size={18} /> Live Active Customer Carts
            </h3>
            <p>
              Real-time carts across logged-in shoppers and guest customers (
              {liveCartSummary.totalQuantity} {liveCartSummary.totalQuantity === 1 ? 'unit' : 'units'} across{' '}
              {liveCartSummary.activeCustomersCount}{' '}
              {liveCartSummary.activeCustomersCount === 1 ? 'active cart' : 'active carts'}).
            </p>
          </div>

          {liveCartSummary.totalQuantity > 0 && (
            <div className="analytics-segmented" role="tablist" aria-label="Active carts breakdown view">
              <button
                type="button"
                role="tab"
                aria-selected={inlineCartViewTab === 'customers'}
                className={inlineCartViewTab === 'customers' ? 'active' : ''}
                onClick={() => setInlineCartViewTab('customers')}
              >
                By Customer ({liveCartSummary.activeCustomersCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inlineCartViewTab === 'products'}
                className={inlineCartViewTab === 'products' ? 'active' : ''}
                onClick={() => setInlineCartViewTab('products')}
              >
                By Product ({liveCartSummary.distinctProductsCount})
              </button>
            </div>
          )}
        </div>

        {liveCartSummary.totalQuantity === 0 ? (
          <div className="analytics-empty-inline">
            No products are currently in customer carts. This section updates automatically as shoppers add or remove toys.
          </div>
        ) : inlineCartViewTab === 'customers' ? (
          <div className="analytics-live-carts-grid">
            {liveCartSummary.customerCarts.map((cust) => (
              <article key={cust.customerId} className="analytics-sheet-order-card">
                <div className="analytics-sheet-order-top">
                  <div className="analytics-sheet-customer-info">
                    <div className="analytics-cust-title-row">
                      <strong>{cust.customerLabel}</strong>
                      <span className={`analytics-identity-pill ${cust.badgeTone}`}>
                        {cust.badgeLabel}
                      </span>
                    </div>
                    <span>
                      {cust.customerSubLabel} · {cust.distinctCount}{' '}
                      {cust.distinctCount === 1 ? 'product' : 'products'}
                    </span>
                  </div>
                  <div className="analytics-sheet-order-meta-right">
                    <span className="analytics-sheet-order-id">
                      Qty: {cust.totalQuantity} · {formatCurrency(cust.totalValue)}
                    </span>
                    {cust.lastUpdatedAt && (
                      <time dateTime={cust.lastUpdatedAt}>
                        Updated {formatDateTimeShort(cust.lastUpdatedAt)}
                      </time>
                    )}
                  </div>
                </div>

                {cust.items.map((item) => (
                  <div key={item.id} className="analytics-sheet-product-row">
                    <img
                      src={item.resolvedImage}
                      alt={item.resolvedName}
                      className="analytics-sheet-prod-img"
                      loading="lazy"
                    />
                    <div className="analytics-sheet-prod-details">
                      <strong>{item.resolvedName}</strong>
                      <div className="analytics-sheet-prod-sub">
                        <span>Qty: {item.quantity}</span>
                        {item.colour && <span>Colour: {item.colour}</span>}
                      </div>
                    </div>
                    <div className="analytics-sheet-order-amount">
                      <span>Subtotal</span>
                      <strong>{formatCurrency((item.resolvedPrice || 0) * (item.quantity || 1))}</strong>
                    </div>
                  </div>
                ))}
              </article>
            ))}
          </div>
        ) : (
          <div className="analytics-live-carts-grid">
            {liveCartSummary.productsInCarts.map((prod) => (
              <article key={prod.productId} className="analytics-sheet-order-card">
                <div className="analytics-sheet-product-row">
                  <img
                    src={prod.productImageUrl}
                    alt={prod.productName}
                    className="analytics-sheet-prod-img"
                    loading="lazy"
                  />
                  <div className="analytics-sheet-prod-details">
                    <strong>{prod.productName}</strong>
                    <div className="analytics-sheet-prod-sub">
                      <span>{prod.category}</span>
                      <span>{formatCurrency(prod.unitPrice)} each</span>
                      <span>
                        In {prod.customerCount}{' '}
                        {prod.customerCount === 1 ? 'customer cart' : 'customer carts'}
                      </span>
                    </div>
                  </div>
                  <div className="analytics-sheet-order-amount">
                    <span>Qty in Carts</span>
                    <strong>{prod.totalQuantity}</strong>
                  </div>
                </div>

                <div className="analytics-sheet-order-footer">
                  <div className="analytics-sheet-badges">
                    {prod.entries.map((entry, idx) => (
                      <span
                        key={`${entry.customerId}-${entry.colour || 'default'}-${idx}`}
                        className="analytics-status-pill order-progress"
                      >
                        {entry.customerLabel}: ×{entry.quantity}
                        {entry.colour ? ` (${entry.colour})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* 2. SALES ANALYTICS & INTERACTIVE TREND CHARTS */}
      <div className="analytics-section-card">
        <div className="analytics-section-head">
          <div>
            <h3>
              <TrendingUp size={18} /> Sales & Order Trends
            </h3>
            <p>Daily, weekly, and monthly revenue performance computed from live Firestore orders.</p>
          </div>

          <div className="analytics-chart-controls">
            <div className="analytics-segmented">
              {(['daily', 'weekly', 'monthly'] as SalesGranularity[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={salesGranularity === g ? 'active' : ''}
                  onClick={() => {
                    setSalesGranularity(g);
                    setHoveredBucketIdx(null);
                    setSelectedBucketKey(null);
                  }}
                >
                  {g === 'daily' ? 'Daily' : g === 'weekly' ? 'Weekly' : 'Monthly'}
                </button>
              ))}
            </div>

            <div className="analytics-segmented">
              <button
                type="button"
                className={salesMetric === 'revenue' ? 'active' : ''}
                onClick={() => setSalesMetric('revenue')}
              >
                Revenue (₹)
              </button>
              <button
                type="button"
                className={salesMetric === 'orders' ? 'active' : ''}
                onClick={() => setSalesMetric('orders')}
              >
                Orders
              </button>
            </div>
          </div>
        </div>

        {/* Daily / Weekly / Monthly / AOV Strip */}
        <div className="analytics-sales-strip">
          <div className="analytics-sales-stat">
            <span>Daily sales (Today)</span>
            <strong>{formatCurrency(salesSummary.dailyRev)}</strong>
            <small>{salesSummary.dailyOrders} {salesSummary.dailyOrders === 1 ? 'order' : 'orders'}</small>
          </div>
          <div className="analytics-sales-stat">
            <span>Weekly sales (7d)</span>
            <strong>{formatCurrency(salesSummary.weeklyRev)}</strong>
            <small>{salesSummary.weeklyOrders} {salesSummary.weeklyOrders === 1 ? 'order' : 'orders'}</small>
          </div>
          <div className="analytics-sales-stat">
            <span>Monthly sales (30d)</span>
            <strong>{formatCurrency(salesSummary.monthlyRev)}</strong>
            <small>{salesSummary.monthlyOrders} {salesSummary.monthlyOrders === 1 ? 'order' : 'orders'}</small>
          </div>
          <div className="analytics-sales-stat">
            <span>Average order value</span>
            <strong>{formatCurrency(Math.round(salesSummary.avgOrderValue))}</strong>
            <small>In selected range</small>
          </div>
        </div>

        <div className="analytics-charts-layout">
          {/* Interactive Bar + Line Trend SVG Chart */}
          <div className="analytics-chart-panel">
            <div className="analytics-chart-toolbar">
              <span className="analytics-chart-caption">
                {salesMetric === 'revenue' ? 'Revenue trend' : 'Order volume trend'} ({salesGranularity})
              </span>
              {activeHoveredPoint ? (
                <div className="analytics-chart-tooltip-bar">
                  <strong>{activeHoveredPoint.label}</strong>
                  <span>{formatCurrency(activeHoveredPoint.revenue)}</span>
                  <span>
                    {activeHoveredPoint.orders}{' '}
                    {activeHoveredPoint.orders === 1 ? 'order' : 'orders'}
                  </span>
                </div>
              ) : (
                <span className="analytics-chart-hint">Tap any bar or data point to inspect orders</span>
              )}
            </div>

            {chartModel.points.length === 0 ? (
              <div className="analytics-empty-inline">
                No order data available for the selected date range.
              </div>
            ) : (
              <div className="analytics-svg-scroll">
                <svg
                  viewBox={`0 0 ${chartModel.svgW} ${chartModel.svgH}`}
                  className="analytics-svg-chart"
                  role="img"
                  aria-label="Sales and order trend chart"
                >
                  {/* Gridlines + Y-axis labels */}
                  {chartModel.yTicks.map((tick, idx) => (
                    <g key={idx}>
                      <line
                        x1={chartModel.padLeft}
                        x2={chartModel.svgW - chartModel.padRight}
                        y1={tick.y}
                        y2={tick.y}
                        stroke="#e6e9dc"
                        strokeDasharray={idx === 0 ? undefined : '4 4'}
                        strokeWidth={1}
                      />
                      <text
                        x={chartModel.padLeft - 8}
                        y={tick.y + 4}
                        textAnchor="end"
                        className="analytics-axis-label"
                      >
                        {salesMetric === 'revenue'
                          ? tick.value >= 1000
                            ? `₹${(tick.value / 1000).toFixed(tick.value % 1000 === 0 ? 0 : 1)}k`
                            : `₹${tick.value}`
                          : tick.value}
                      </text>
                    </g>
                  ))}

                  {/* Interactive Bars */}
                  {chartModel.points.map((pt, i) => {
                    const isHovered = hoveredBucketIdx === i;
                    const isSelected = selectedBucketKey === pt.key;
                    const isActive = isHovered || isSelected;
                    return (
                      <g
                        key={pt.key}
                        className="analytics-bar-group"
                        role="button"
                        tabIndex={0}
                        aria-label={`${pt.periodTitle}: ${formatCurrency(pt.revenue)}, ${pt.bucketOrders.length} orders. Click to view orders.`}
                        onMouseEnter={() => setHoveredBucketIdx(i)}
                        onMouseLeave={() => setHoveredBucketIdx(null)}
                        onClick={() => handleSelectBucket(pt.key, i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectBucket(pt.key, i);
                          }
                        }}
                      >
                        {/* Invisible wide hit target for easy touch interaction */}
                        <rect
                          x={pt.barX - 4}
                          y={chartModel.padTop}
                          width={pt.barW + 8}
                          height={chartModel.plotH}
                          fill="transparent"
                        />
                        <rect
                          x={pt.barX}
                          y={pt.y}
                          width={pt.barW}
                          height={pt.barH}
                          rx={Math.min(5, pt.barW / 2)}
                          fill={isActive ? '#29392b' : pt.val > 0 ? '#85a64e' : '#edf0e4'}
                          style={{ transition: 'fill 140ms ease' }}
                        />
                      </g>
                    );
                  })}

                  {/* Smooth Trend Line Overlay */}
                  {chartModel.points.length > 1 && (
                    <path
                      d={chartModel.linePath}
                      fill="none"
                      stroke="#29392b"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.78}
                      pointerEvents="none"
                    />
                  )}

                  {/* Clickable Data Nodes */}
                  {chartModel.points.map((pt, i) => {
                    const isHovered = hoveredBucketIdx === i;
                    const isSelected = selectedBucketKey === pt.key;
                    const isActive = isHovered || isSelected;
                    const hasData = pt.val > 0 || pt.bucketOrders.length > 0;
                    return (
                      <g
                        key={`node-${pt.key}`}
                        className="analytics-bar-group"
                        onMouseEnter={() => setHoveredBucketIdx(i)}
                        onMouseLeave={() => setHoveredBucketIdx(null)}
                        onClick={() => handleSelectBucket(pt.key, i)}
                      >
                        <circle cx={pt.x} cy={pt.y} r={11} fill="transparent" />
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isActive ? 5.8 : hasData ? 3.5 : 2.3}
                          fill={
                            isSelected
                              ? '#d97706'
                              : isHovered
                              ? '#d97706'
                              : hasData
                              ? '#29392b'
                              : '#c8d1b8'
                          }
                          stroke="#fffefa"
                          strokeWidth={1.5}
                        />
                      </g>
                    );
                  })}

                  {/* X-axis sparse labels */}
                  {chartModel.points.map((pt, i) => {
                    const total = chartModel.points.length;
                    const step = total <= 10 ? 1 : total <= 22 ? 3 : Math.ceil(total / 8);
                    const shouldShow = i === 0 || i === total - 1 || i % step === 0;
                    if (!shouldShow) return null;
                    return (
                      <text
                        key={`x-${pt.key}`}
                        x={pt.x}
                        y={chartModel.svgH - 12}
                        textAnchor="middle"
                        className="analytics-axis-label"
                      >
                        {pt.label}
                      </text>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* Order Fulfillment Breakdown */}
          <div className="analytics-breakdown-panel">
            <h4>Order Status Breakdown</h4>
            <div className="analytics-status-bars">
              {statusBreakdown.map((item) => {
                const pct =
                  rangeOrders.length > 0
                    ? Math.round((item.count / rangeOrders.length) * 100)
                    : 0;
                return (
                  <div key={item.key} className="analytics-status-row">
                    <div className="analytics-status-meta">
                      <span>{item.label}</span>
                      <strong>
                        {item.count} ({pct}%) · {formatCurrency(item.revenue)}
                      </strong>
                    </div>
                    <div className="analytics-progress-track">
                      <div
                        className="analytics-progress-fill"
                        style={{ width: `${pct}%`, background: item.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. PRODUCT ANALYTICS & POPULARITY RANKINGS */}
      <div className="analytics-section-card">
        <div className="analytics-section-head">
          <div>
            <h3>
              <Flame size={18} /> Product Analytics & Popularity Rankings
            </h3>
            <p>
              Compare views, cart additions, orders, and revenue across all catalog toys.
            </p>
          </div>

          <div className="analytics-segmented" role="tablist" aria-label="Product analytics views">
            {(
              [
                { id: 'rankings', label: 'Popularity Rank' },
                { id: 'mostViewed', label: 'Most Viewed' },
                { id: 'mostOrdered', label: 'Most Ordered' },
                { id: 'mostCarted', label: 'Most Carted' },
                { id: 'leastViewed', label: 'Least Viewed' },
              ] as Array<{ id: ProductViewTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={productTab === tab.id}
                className={productTab === tab.id ? 'active' : ''}
                onClick={() => setProductTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Top 5 Horizontal Engagement Bar Chart */}
        {topChartProducts.length > 0 && (
          <div className="analytics-top-products-visual">
            <div className="analytics-visual-legend">
              <span className="legend-item views">Views</span>
              <span className="legend-item cart">Added to Cart</span>
              <span className="legend-item orders">Units Ordered</span>
            </div>

            {(() => {
              const maxMetric = Math.max(
                1,
                ...topChartProducts.map((p) =>
                  Math.max(p.views, p.cartAdds, p.unitsOrdered)
                )
              );
              return (
                <div className="analytics-horiz-bars">
                  {topChartProducts.map((p, idx) => (
                    <div key={p.productId} className="analytics-horiz-row">
                      <div className="analytics-horiz-label">
                        <span className="analytics-rank-num">#{idx + 1}</span>
                        <span className="analytics-horiz-name">{p.name}</span>
                      </div>
                      <div className="analytics-horiz-tracks">
                        <div className="analytics-mini-bar-line">
                          <div
                            className="analytics-mini-fill views"
                            style={{ width: `${(p.views / maxMetric) * 100}%` }}
                          />
                          <span>{p.views}</span>
                        </div>
                        <div className="analytics-mini-bar-line">
                          <div
                            className="analytics-mini-fill cart"
                            style={{ width: `${(p.cartAdds / maxMetric) * 100}%` }}
                          />
                          <span>{p.cartAdds}</span>
                        </div>
                        <div className="analytics-mini-bar-line">
                          <div
                            className="analytics-mini-fill orders"
                            style={{ width: `${(p.unitsOrdered / maxMetric) * 100}%` }}
                          />
                          <span>{p.unitsOrdered}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Full Product Performance Table */}
        {activeProductList.length === 0 ? (
          <div className="analytics-empty-inline">
            No product analytics records found for this filter.
          </div>
        ) : (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="num">Views</th>
                  <th className="num">Cart Adds</th>
                  <th className="num">Orders</th>
                  <th className="num">Revenue</th>
                  <th className="num">Popularity</th>
                </tr>
              </thead>
              <tbody>
                {activeProductList.map((row, idx) => (
                  <tr key={row.productId}>
                    <td className="num">
                      <span className={`analytics-rank-badge ${idx < 3 ? 'top' : ''}`}>
                        #{idx + 1}
                      </span>
                    </td>
                    <td>
                      <div className="analytics-prod-cell">
                        <img src={row.imageUrl} alt="" loading="lazy" />
                        <div>
                          <strong>{row.name}</strong>
                          <small>
                            {row.available ? formatCurrency(row.price) : 'Draft / Archived'}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{row.category}</td>
                    <td className="num">{row.views}</td>
                    <td className="num">{row.cartAdds}</td>
                    <td className="num">
                      {row.unitsOrdered}
                      {row.ordersCount !== row.unitsOrdered ? ` (${row.ordersCount} ord)` : ''}
                    </td>
                    <td className="num">
                      <strong>{formatCurrency(row.revenue)}</strong>
                    </td>
                    <td className="num">
                      <span className="analytics-score-val">{row.popularityScore}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. CUSTOMER ANALYTICS */}
      <div className="analytics-section-card">
        <div className="analytics-section-head">
          <div>
            <h3>
              <Activity size={18} /> Customer Analytics
            </h3>
            <p>
              Registered customers, new vs returning buyer breakdown, and most active shoppers.
            </p>
          </div>
        </div>

        <div className="analytics-customer-kpis">
          <div className="analytics-cust-kpi">
            <Users size={18} />
            <div>
              <span>Total registered customers</span>
              <strong>{customerAnalytics.totalRegisteredCustomers.toLocaleString('en-IN')}</strong>
            </div>
          </div>
          <div className="analytics-cust-kpi new">
            <UserPlus size={18} />
            <div>
              <span>New customers ({rangeLabel})</span>
              <strong>{customerAnalytics.newCustomersCount.toLocaleString('en-IN')}</strong>
            </div>
          </div>
          <div className="analytics-cust-kpi returning">
            <UserCheck size={18} />
            <div>
              <span>Returning customers</span>
              <strong>{customerAnalytics.returningCustomersCount.toLocaleString('en-IN')}</strong>
            </div>
          </div>
        </div>

        {/* New vs Returning Split Bar */}
        {customerAnalytics.newCustomersCount + customerAnalytics.returningCustomersCount > 0 && (
          <div className="analytics-retention-bar-box">
            {(() => {
              const totalActive =
                customerAnalytics.newCustomersCount +
                customerAnalytics.returningCustomersCount;
              const newPct = Math.round(
                (customerAnalytics.newCustomersCount / totalActive) * 100
              );
              const retPct = 100 - newPct;
              return (
                <>
                  <div className="analytics-retention-labels">
                    <span>
                      <ArrowUpRight size={14} /> New: {customerAnalytics.newCustomersCount} ({newPct}%)
                    </span>
                    <span>
                      <ArrowDownRight size={14} /> Returning: {customerAnalytics.returningCustomersCount} ({retPct}%)
                    </span>
                  </div>
                  <div className="analytics-retention-track">
                    <div className="analytics-retention-new" style={{ width: `${newPct}%` }} />
                    <div className="analytics-retention-ret" style={{ width: `${retPct}%` }} />
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Most Active Customers Table */}
        <h4 className="analytics-sub-heading">Most Active Customers ({rangeLabel})</h4>
        {customerAnalytics.mostActiveCustomers.length === 0 ? (
          <div className="analytics-empty-inline">
            No customer activity recorded during the selected date range yet.
          </div>
        ) : (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className="num">Visits</th>
                  <th className="num">Views</th>
                  <th className="num">Cart Adds</th>
                  <th className="num">Orders</th>
                  <th className="num">Spent</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {customerAnalytics.mostActiveCustomers.slice(0, 20).map((c, idx) => (
                  <tr key={c.customerId}>
                    <td className="num">#{idx + 1}</td>
                    <td>
                      <div className="analytics-cust-name">
                        <strong>{c.displayName}</strong>
                        <small>{c.customerId.slice(0, 14)}</small>
                      </div>
                    </td>
                    <td>
                      <span className="analytics-cust-type">
                        {c.isReturningInRange ? 'Returning' : c.isNewInRange ? 'New' : c.mode}
                      </span>
                    </td>
                    <td className="num">{c.rangeVisits}</td>
                    <td className="num">{c.rangeViews}</td>
                    <td className="num">{c.rangeCartAdds}</td>
                    <td className="num">{c.rangeOrdersCount}</td>
                    <td className="num">
                      <strong>{formatCurrency(c.rangeSpent)}</strong>
                    </td>
                    <td>{formatDateTimeShort(c.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* INTERACTIVE REVENUE CHART ORDER DETAILS POPUP / BOTTOM SHEET */}
      {selectedBucket && (
        <div
          className="analytics-orders-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="analytics-orders-sheet-title"
          onClick={() => setSelectedBucketKey(null)}
        >
          <div
            className="analytics-orders-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="analytics-sheet-drag-handle" aria-hidden="true" />

            <div className="analytics-sheet-header">
              <div className="analytics-sheet-title-wrap">
                <span className="eyebrow">
                  {salesGranularity === 'daily'
                    ? 'DAILY REVENUE ORDERS'
                    : salesGranularity === 'weekly'
                    ? 'WEEKLY REVENUE ORDERS'
                    : 'MONTHLY REVENUE ORDERS'}
                </span>
                <h3 id="analytics-orders-sheet-title">{selectedBucket.periodTitle}</h3>
                <p>
                  {selectedBucket.bucketOrders.length}{' '}
                  {selectedBucket.bucketOrders.length === 1 ? 'order placed' : 'orders placed'}
                  {selectedBucket.bucketOrders.length !== selectedBucket.orders
                    ? ` (${selectedBucket.bucketOrders.length - selectedBucket.orders} cancelled)`
                    : ''}
                </p>
              </div>

              <div className="analytics-sheet-header-right">
                <div className="analytics-sheet-nav-group">
                  <button
                    type="button"
                    className="analytics-sheet-nav-btn"
                    disabled={selectedBucketIndex <= 0}
                    onClick={() => {
                      if (selectedBucketIndex > 0) {
                        const prev = salesChartBuckets[selectedBucketIndex - 1];
                        setSelectedBucketKey(prev.key);
                        setHoveredBucketIdx(selectedBucketIndex - 1);
                      }
                    }}
                    title="Previous date"
                    aria-label="Previous date"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="analytics-sheet-nav-btn"
                    disabled={selectedBucketIndex >= salesChartBuckets.length - 1}
                    onClick={() => {
                      if (selectedBucketIndex < salesChartBuckets.length - 1) {
                        const next = salesChartBuckets[selectedBucketIndex + 1];
                        setSelectedBucketKey(next.key);
                        setHoveredBucketIdx(selectedBucketIndex + 1);
                      }
                    }}
                    title="Next date"
                    aria-label="Next date"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <button
                  type="button"
                  className="analytics-sheet-close-btn"
                  onClick={() => setSelectedBucketKey(null)}
                  aria-label="Close order details"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="analytics-sheet-revenue-banner">
              <div>
                <span>Total revenue for selected {salesGranularity === 'daily' ? 'date' : 'period'}</span>
                <strong>{formatCurrency(selectedBucket.revenue)}</strong>
              </div>
              <span className="analytics-sheet-count-pill">
                <PackageCheck size={14} />
                {selectedBucket.orders} active {selectedBucket.orders === 1 ? 'order' : 'orders'}
              </span>
            </div>

            <div className="analytics-sheet-body">
              {selectedBucket.bucketOrders.length === 0 ? (
                <div className="analytics-sheet-empty">
                  <div className="analytics-sheet-empty-icon">📦</div>
                  <strong>No orders on this date.</strong>
                  <p>Select another green bar or data point on the chart to inspect its orders.</p>
                </div>
              ) : (
                <div className="analytics-sheet-orders-list">
                  {selectedBucket.bucketOrders.map((order) => {
                    const qty = typeof order.quantity === 'number' && order.quantity > 0 ? order.quantity : 1;
                    const amount = parseOrderAmount(order);
                    const payment = derivePaymentStatus(order);
                    const statusTone = getOrderStatusTone(order.status);
                    const prodImg =
                      order.productImageUrl ||
                      products.find((p) => p.id === order.productId)?.imageUrl ||
                      '/toys/toy-40ba4ba9-1.jpg';
                    const customerDetail =
                      order.mode === 'Adult'
                        ? order.phone
                          ? `Adult · ${order.phone}`
                          : 'Adult Order'
                        : order.studentClass
                        ? `Child · Class ${order.studentClass}${order.section ? `-${order.section}` : ''}`
                        : 'Child Order';

                    return (
                      <article key={order.id} className="analytics-sheet-order-card">
                        <div className="analytics-sheet-order-top">
                          <div className="analytics-sheet-customer-info">
                            <strong>{order.name || 'Customer'}</strong>
                            <span>{customerDetail}</span>
                          </div>
                          <div className="analytics-sheet-order-meta-right">
                            <span className="analytics-sheet-order-id">
                              #{order.orderNumber || order.id.slice(0, 8)}
                            </span>
                            <time dateTime={order.createdAt}>
                              {formatFullDateTimeIST(order.createdAt)}
                            </time>
                          </div>
                        </div>

                        <div className="analytics-sheet-product-row">
                          <img
                            src={prodImg}
                            alt={order.productName}
                            className="analytics-sheet-prod-img"
                            loading="lazy"
                          />
                          <div className="analytics-sheet-prod-details">
                            <strong>{order.productName}</strong>
                            <div className="analytics-sheet-prod-sub">
                              <span>Qty: {qty}</span>
                              {order.colour && <span>Colour: {order.colour}</span>}
                              {order.isRescueDeal && <span>Rescue Deal</span>}
                              {order.isCampaignDiscount && order.campaignName && (
                                <span>{order.campaignName}</span>
                              )}
                            </div>
                          </div>
                          <div className="analytics-sheet-order-amount">
                            <span>Total</span>
                            <strong>{formatCurrency(amount)}</strong>
                          </div>
                        </div>

                        <div className="analytics-sheet-order-footer">
                          <div className="analytics-sheet-badges">
                            <span className={`analytics-status-pill payment-${payment.tone}`}>
                              Payment: {payment.label}
                            </span>
                            <span className={`analytics-status-pill order-${statusTone}`}>
                              Status: {order.status || 'New'}
                            </span>
                          </div>

                          {onViewFullOrder && (
                            <button
                              type="button"
                              className="analytics-view-full-order-btn"
                              onClick={() => {
                                setSelectedBucketKey(null);
                                onViewFullOrder(order);
                              }}
                            >
                              View Full Order <ArrowRight size={14} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* LIVE CUSTOMER CARTS BREAKDOWN POPUP / BOTTOM SHEET */}
      {isLiveCartModalOpen && (
        <div
          className="analytics-orders-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="analytics-live-cart-sheet-title"
          onClick={() => setIsLiveCartModalOpen(false)}
        >
          <div
            className="analytics-orders-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="analytics-sheet-drag-handle" aria-hidden="true" />

            <div className="analytics-sheet-header">
              <div className="analytics-sheet-title-wrap">
                <span className="eyebrow">REAL-TIME ACTIVE CARTS</span>
                <h3 id="analytics-live-cart-sheet-title">Products Currently in Carts</h3>
                <p>
                  {liveCartSummary.totalQuantity}{' '}
                  {liveCartSummary.totalQuantity === 1 ? 'unit' : 'units'} across{' '}
                  {liveCartSummary.distinctProductsCount}{' '}
                  {liveCartSummary.distinctProductsCount === 1 ? 'distinct product' : 'distinct products'}
                </p>
              </div>

              <div className="analytics-sheet-header-right">
                <button
                  type="button"
                  className="analytics-sheet-close-btn"
                  onClick={() => setIsLiveCartModalOpen(false)}
                  aria-label="Close live carts breakdown"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="analytics-sheet-revenue-banner">
              <div>
                <span>Total active cart quantity</span>
                <strong>{liveCartSummary.totalQuantity.toLocaleString('en-IN')}</strong>
              </div>
              <span className="analytics-sheet-count-pill">
                <ShoppingCart size={14} />
                {liveCartSummary.activeCustomersCount}{' '}
                {liveCartSummary.activeCustomersCount === 1 ? 'customer cart' : 'customer carts'}
              </span>
            </div>

            {liveCartSummary.totalQuantity > 0 && (
              <div style={{ padding: '12px 22px 0' }}>
                <div className="analytics-segmented" role="tablist" aria-label="Live cart view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={liveCartViewTab === 'products'}
                    className={liveCartViewTab === 'products' ? 'active' : ''}
                    onClick={() => setLiveCartViewTab('products')}
                  >
                    By Product ({liveCartSummary.distinctProductsCount})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={liveCartViewTab === 'customers'}
                    className={liveCartViewTab === 'customers' ? 'active' : ''}
                    onClick={() => setLiveCartViewTab('customers')}
                  >
                    By Customer Cart ({liveCartSummary.activeCustomersCount})
                  </button>
                </div>
              </div>
            )}

            <div className="analytics-sheet-body">
              {liveCartSummary.totalQuantity === 0 ? (
                <div className="analytics-sheet-empty">
                  <div className="analytics-sheet-empty-icon">🛒</div>
                  <strong>No products in customer carts right now.</strong>
                  <p>Live active carts update here automatically as shoppers add or remove toys.</p>
                </div>
              ) : liveCartViewTab === 'products' ? (
                <div className="analytics-sheet-orders-list">
                  {liveCartSummary.productsInCarts.map((prod) => (
                    <article key={prod.productId} className="analytics-sheet-order-card">
                      <div className="analytics-sheet-product-row">
                        <img
                          src={prod.productImageUrl}
                          alt={prod.productName}
                          className="analytics-sheet-prod-img"
                          loading="lazy"
                        />
                        <div className="analytics-sheet-prod-details">
                          <strong>{prod.productName}</strong>
                          <div className="analytics-sheet-prod-sub">
                            <span>{prod.category}</span>
                            <span>{formatCurrency(prod.unitPrice)} each</span>
                            <span>
                              In {prod.customerCount}{' '}
                              {prod.customerCount === 1 ? 'customer cart' : 'customer carts'}
                            </span>
                          </div>
                        </div>
                        <div className="analytics-sheet-order-amount">
                          <span>Qty in Carts</span>
                          <strong>{prod.totalQuantity}</strong>
                        </div>
                      </div>

                      <div className="analytics-sheet-order-footer">
                        <div className="analytics-sheet-badges">
                          {prod.entries.map((entry, idx) => (
                            <span
                              key={`${entry.customerId}-${entry.colour || 'default'}-${idx}`}
                              className="analytics-status-pill order-progress"
                            >
                              {entry.customerLabel}: ×{entry.quantity}
                              {entry.colour ? ` (${entry.colour})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="analytics-sheet-orders-list">
                  {liveCartSummary.customerCarts.map((cust) => (
                    <article key={cust.customerId} className="analytics-sheet-order-card">
                      <div className="analytics-sheet-order-top">
                        <div className="analytics-sheet-customer-info">
                          <div className="analytics-cust-title-row">
                            <strong>{cust.customerLabel}</strong>
                            <span className={`analytics-identity-pill ${cust.badgeTone}`}>
                              {cust.badgeLabel}
                            </span>
                          </div>
                          <span>
                            {cust.customerSubLabel} · {cust.distinctCount}{' '}
                            {cust.distinctCount === 1 ? 'distinct product' : 'distinct products'}
                          </span>
                        </div>
                        <div className="analytics-sheet-order-meta-right">
                          <span className="analytics-sheet-order-id">
                            Total Qty: {cust.totalQuantity} · {formatCurrency(cust.totalValue)}
                          </span>
                          {cust.lastUpdatedAt && (
                            <time dateTime={cust.lastUpdatedAt}>
                              Updated {formatFullDateTimeIST(cust.lastUpdatedAt)}
                            </time>
                          )}
                        </div>
                      </div>

                      {cust.items.map((item) => (
                        <div key={item.id} className="analytics-sheet-product-row">
                          <img
                            src={item.resolvedImage}
                            alt={item.resolvedName}
                            className="analytics-sheet-prod-img"
                            loading="lazy"
                          />
                          <div className="analytics-sheet-prod-details">
                            <strong>{item.resolvedName}</strong>
                            <div className="analytics-sheet-prod-sub">
                              <span>Qty: {item.quantity}</span>
                              {item.colour && <span>Colour: {item.colour}</span>}
                            </div>
                          </div>
                          <div className="analytics-sheet-order-amount">
                            <span>Subtotal</span>
                            <strong>{formatCurrency((item.resolvedPrice || 0) * (item.quantity || 1))}</strong>
                          </div>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

function clampBarWidth(val: number): number {
  return Math.max(8, Math.min(44, val));
}
