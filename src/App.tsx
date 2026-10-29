import React, { useState, useEffect, useMemo } from 'react';
import {
  Menu,
  Boxes,
  PackageCheck,
  ShieldCheck,
  X,
  ShoppingBag,
  MessageSquare,
  ArrowLeft,
  RefreshCw,
  Store,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Share2,
  FileText,
  Palette,
  ChevronDown,
  Check,
  IndianRupee,
  MoreVertical,
  Layers,
  QrCode,
  Search,
  Minus,
  Plus,
  Flame,
  Tag,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

const da = (val: number | string) => '₹' + Number(val).toLocaleString('en-IN');

export const EARNED_ORDER_STATUSES = new Set(['completed', 'delivered', 'collected']);

export function isOrderEarned(order: { status?: string } | null | undefined): boolean {
  if (!order || !order.status) return false;
  return EARNED_ORDER_STATUSES.has(order.status.trim().toLowerCase());
}

export function parseOrderPrice(rawPrice: any, quantity?: number, unitPrice?: number): number {
  if (typeof rawPrice === 'number') {
    return isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0;
  }
  if (typeof rawPrice === 'string') {
    const cleaned = rawPrice.replace(/[^\d.]/g, '');
    const num = parseFloat(cleaned);
    return !isNaN(num) && isFinite(num) && num > 0 ? num : 0;
  }
  if (typeof unitPrice === 'number' && unitPrice > 0) {
    const qty = typeof quantity === 'number' && quantity > 0 ? quantity : 1;
    return unitPrice * qty;
  }
  return 0;
}

export function calculateTotalMoneyEarned(orders: Order[] = []): number {
  if (!Array.isArray(orders) || orders.length === 0) return 0;
  const seenIds = new Set<string>();
  let total = 0;

  for (const order of orders) {
    if (!order || !order.id || seenIds.has(order.id)) continue;
    seenIds.add(order.id);

    if (isOrderEarned(order)) {
      total += parseOrderPrice(order.price, order.quantity, order.unitPrice);
    }
  }

  return total;
}

export function getOrderStatusClass(status?: string): string {
  if (!status) return 'order-status-new';
  const clean = status.trim().toLowerCase();
  if (clean === 'confirmed') return 'order-status-confirmed';
  if (clean === 'preparing') return 'order-status-preparing';
  if (clean === 'dispatched' || clean === 'ready for pickup') return 'order-status-dispatched';
  if (clean === 'completed' || clean === 'delivered' || clean === 'collected') return 'order-status-completed';
  if (clean === 'cancelled') return 'order-status-cancelled';
  if (clean === 'new') return 'order-status-new';
  return `order-status-${clean.replace(/\s+/g, '-')}`;
}

function getCustomerKey(): string {
  const KEY = 'toynest_customer_key';
  let val = localStorage.getItem(KEY);
  if (!val) {
    val =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, val);
  }
  return val;
}

function getSeenOrderStatuses(): Record<string, string> {
  try {
    const raw = localStorage.getItem('toynest_seen_order_statuses');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSeenOrderStatuses(statuses: Record<string, string>) {
  try {
    localStorage.setItem('toynest_seen_order_statuses', JSON.stringify(statuses));
  } catch {}
}

function getCustomerDeletedOrderIds(): string[] {
  try {
    const raw = localStorage.getItem('toynest_customer_deleted_order_ids');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveCustomerDeletedOrderIds(ids: string[]) {
  try {
    localStorage.setItem('toynest_customer_deleted_order_ids', JSON.stringify(ids));
  } catch {}
}

function markOrderDeletedByCustomerLocally(orderId: string) {
  const current = getCustomerDeletedOrderIds();
  if (!current.includes(orderId)) {
    saveCustomerDeletedOrderIds([...current, orderId]);
  }
}

function getSeenOwnerOrderIds(): string[] {
  try {
    const raw = localStorage.getItem('toynest_seen_owner_order_ids');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function markAllOwnerOrdersSeen(orders: Order[] = []) {
  try {
    const current = getSeenOwnerOrderIds();
    const idSet = new Set(current);
    orders.forEach((o) => {
      if (o?.id) idSet.add(o.id);
    });
    localStorage.setItem('toynest_seen_owner_order_ids', JSON.stringify(Array.from(idSet)));
  } catch {}
}

const api = {
  async get(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return { data };
  },
  async post(url: string, body: any) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
    const data = await res.json();
    return { data };
  },
  async delete(url: string) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
    const data = await res.json();
    return { data };
  },
};

import {
  DEFAULT_PRODUCTS,
  DEFAULT_OWNER_PIN,
  type Product,
  type Order,
  type Suggestion,
  type RescueDeal,
  DEFAULT_RESCUE_DEALS,
  getStoredDeletedRescueDealIds,
} from './defaultData';
import {
  saveOrderToCloud,
  fetchCustomerOrdersByIds,
  fetchCustomerOrdersFromCloud,
  fetchAllOrdersFromCloud,
  subscribeToAllOrders,
  subscribeToCustomerOrders,
  updateOrderStatusInCloud,
  deleteOrderFromCloud,
  markOrderDeletedByCustomerInCloud,
  saveSuggestionToCloud,
  fetchSuggestionsFromCloud,
  deleteSuggestionFromCloud,
  fetchProductsFromCloud,
  subscribeToProducts,
  updateProductAvailabilityInCloud,
  saveProductToCloud,
  deleteProductFromCloud,
  fetchSettingsFromCloud,
  saveSettingsToCloud,
  fetchColoursFromCloud,
  saveColoursToCloud,
  subscribeToColours,
  fetchRescueDealsFromCloud,
  subscribeToRescueDeals,
  saveRescueDealToCloud,
  deleteRescueDealFromCloud,
  claimRescueDealInCloud,
} from './firebase';

function getStoredColours(): string[] {
  try {
    const raw = localStorage.getItem('playnix_colours');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredColours(colours: string[]) {
  try {
    localStorage.setItem('playnix_colours', JSON.stringify(colours));
  } catch {}
}

const COLOR_NAME_MAP: Record<string, string> = {
  'rose gold': '#b76e79',
  rosegold: '#b76e79',
  'baby blue': '#89cff0',
  babyblue: '#89cff0',
  'baby pink': '#f4c2c2',
  babypink: '#f4c2c2',
  'mint green': '#98ff98',
  mintgreen: '#98ff98',
  mint: '#3eb489',
  'neon green': '#39ff14',
  neongreen: '#39ff14',
  'electric blue': '#7df9ff',
  electricblue: '#7df9ff',
  'sky blue': '#87ceeb',
  skyblue: '#87ceeb',
  'royal blue': '#4169e1',
  royalblue: '#4169e1',
  'midnight blue': '#191970',
  midnightblue: '#191970',
  'forest green': '#228b22',
  forestgreen: '#228b22',
  'lime green': '#32cd32',
  limegreen: '#32cd32',
  'pastel pink': '#ffd1dc',
  pastelpink: '#ffd1dc',
  'pastel blue': '#aec6cf',
  pastelblue: '#aec6cf',
  'pastel yellow': '#fdfd96',
  pastelyellow: '#fdfd96',
  'pastel green': '#77dd77',
  pastelgreen: '#77dd77',
  'pastel purple': '#c3b1e1',
  pastelpurple: '#c3b1e1',
  peach: '#ffe5b4',
  cream: '#fffdd0',
  charcoal: '#36454f',
  ruby: '#e0115f',
  emerald: '#50c878',
  sapphire: '#0f52ba',
  copper: '#b87333',
  bronze: '#cd7f32',
  mustard: '#ffdb58',
  burgundy: '#800020',
  wine: '#722f37',
  lilac: '#c8a2c8',
  lavender: '#e6e6fa',
  magenta: '#ff00ff',
  cyan: '#00ffff',
  turquoise: '#40e0d0',
};

function resolveColourCss(colourName: string): string {
  if (!colourName) return '#94a3b8';
  const clean = colourName.trim().toLowerCase();
  if (clean.startsWith('#') || clean.startsWith('rgb') || clean.startsWith('hsl')) {
    return clean;
  }
  if (COLOR_NAME_MAP[clean]) {
    return COLOR_NAME_MAP[clean];
  }
  const compact = clean.replace(/[\s-_]+/g, '');
  if (COLOR_NAME_MAP[compact]) {
    return COLOR_NAME_MAP[compact];
  }
  return compact;
}

function ColourDot({ colour, size = 16 }: { colour: string; size?: number }) {
  const cssColor = resolveColourCss(colour);
  return (
    <span
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: cssColor,
        border: '1px solid #d1d5db',
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
      }}
    />
  );
}

interface ColourSelectDropdownProps {
  value: string;
  options: string[];
  onChange: (val: string) => void;
}

function ColourSelectDropdown({ value, options, onChange }: ColourSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedColour = options.find((o) => o === value) || (value ? value : '');

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Which colour?"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: '100%',
          border: isOpen ? '1px solid #8ba66b' : '1px solid #e7e6dd',
          borderRadius: '8px',
          background: '#fffefa',
          padding: '12px',
          color: '#30382f',
          fontSize: '12px',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px #e8efd9' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {selectedColour ? (
            <>
              <ColourDot colour={selectedColour} size={16} />
              <span style={{ fontWeight: 600, color: '#242b24', fontSize: '13px' }}>
                {selectedColour}
              </span>
            </>
          ) : (
            <span style={{ color: '#8a8f84', fontSize: '12px' }}>Select a colour</span>
          )}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: '#6e776a',
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Available colours"
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            left: 0,
            right: 0,
            zIndex: 70,
            background: '#fffefa',
            border: '1px solid #dfe2d4',
            borderRadius: '10px',
            boxShadow: '0 12px 28px rgba(40, 50, 30, 0.14)',
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '6px',
          }}
        >
          {options.map((col) => {
            const isSelected = col === value;
            return (
              <div
                key={col}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => {
                  onChange(col);
                  setIsOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange(col);
                    setIsOpen(false);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  background: isSelected ? '#eef2e3' : 'transparent',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '13px',
                  color: isSelected ? '#29392b' : '#30382f',
                  transition: 'background 0.12s ease',
                  marginBottom: '2px',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f4f6ed';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                  <ColourDot colour={col} size={16} />
                  <span>{col}</span>
                </div>
                {isSelected && (
                  <Check size={14} style={{ color: '#566b3c', strokeWidth: 2.5 }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getStoredProducts(): Product[] {
  try {
    const raw = localStorage.getItem('toynest_local_products');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_PRODUCTS;
}

function saveStoredProducts(products: Product[]) {
  try {
    localStorage.setItem('toynest_local_products', JSON.stringify(products));
  } catch {}
}

function getStoredOrders(): Order[] {
  try {
    const raw = localStorage.getItem('toynest_local_orders');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredOrders(orders: Order[]) {
  try {
    localStorage.setItem('toynest_local_orders', JSON.stringify(orders));
  } catch {}
}

function computeLocalQueuePositions(orders: Order[]): Order[] {
  const activeStatuses = ['New', 'Confirmed', 'Preparing', 'Dispatched', 'Ready for pickup', 'Contacted'];
  const activeOrders = [...orders]
    .filter((o) => activeStatuses.includes(o.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const positionMap = new Map<string, { queuePosition: number; peopleAhead: number }>();
  activeOrders.forEach((o, idx) => {
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

async function compressImageFile(file: File, maxDim = 800, quality = 0.72): Promise<File> {
  return new Promise<File>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            resolve(new File([blob], cleanName, { type: 'image/jpeg', lastModified: Date.now() }));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = String(e.target?.result || '');
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function fileToOptimizedDataUrl(file: File, maxDim = 800, quality = 0.72): Promise<string> {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(e.target?.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(String(e.target?.result || ''));
      img.src = String(e.target?.result || '');
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

async function guaranteeSafeImagePayload(imageUrls: string[]): Promise<string[]> {
  if (!imageUrls || imageUrls.length === 0) return ['/toys/toy-40ba4ba9-1.jpg'];
  const totalLength = imageUrls.reduce((acc, u) => acc + (u?.length || 0), 0);
  if (totalLength < 550000) return imageUrls;

  // Recompress oversized data URLs to strictly stay under 500KB
  const recompressed = await Promise.all(
    imageUrls.map(async (url) => {
      if (!url.startsWith('data:')) return url;
      return new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 500;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(url);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.62));
        };
        img.onerror = () => resolve(url);
        img.src = url;
      });
    })
  );
  return recompressed;
}

export default function App() {
  const [page, setPage] = useState<'home' | 'buy' | 'myOrders' | 'suggestions' | 'ownerLogin' | 'owner'>('home');
  const [products, setProducts] = useState<Product[]>(() => getStoredProducts());
  const [selectedCategory, setSelectedCategory] = useState<string>('All categories');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [ownerOrders, setOwnerOrders] = useState<Order[]>([]);
  const totalMoneyEarned = useMemo(() => calculateTotalMoneyEarned(ownerOrders), [ownerOrders]);
  const [ownerPin, setOwnerPin] = useState<string>(() => {
    try {
      return sessionStorage.getItem('playnix_owner_pin') || '';
    } catch {
      return '';
    }
  });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState<boolean>(false);
  const [isOwnerMenuOpen, setIsOwnerMenuOpen] = useState<boolean>(false);
  const [selectedProductForBuy, setSelectedProductForBuy] = useState<Product | null>(null);
  const [selectedDealForBuy, setSelectedDealForBuy] = useState<RescueDeal | null>(null);
  const [rescueDeals, setRescueDeals] = useState<RescueDeal[]>(() => {
    const deleted = new Set(getStoredDeletedRescueDealIds());
    return DEFAULT_RESCUE_DEALS.filter((d) => !deleted.has(d.id));
  });
  const [orderQuantity, setOrderQuantity] = useState<number>(1);
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null);
  const [galleryImageIndex, setGalleryImageIndex] = useState<number>(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [ownerTab, setOwnerTab] = useState<
    'products' | 'drafts' | 'orders' | 'suggestions' | 'sections' | 'payment' | 'colours' | 'rescueDeals'
  >('products');
  const [isAddingDeal, setIsAddingDeal] = useState<boolean>(false);
  const [dealSaving, setDealSaving] = useState<boolean>(false);
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);
  const [newDealForm, setNewDealForm] = useState({
    productId: '',
    title: '',
    originalPrice: '',
    dealPrice: '',
    condition: 'Open Box - Single piece',
    colour: '',
    description: '',
    imageUrl: '',
  });

  const availableRescueDeals = useMemo(() => {
    return rescueDeals.filter((d) => !d.claimed && d.status !== 'claimed');
  }, [rescueDeals]);
  const [productFilter, setProductFilter] = useState<'all' | 'published' | 'drafts'>('all');
  const [checkoutMode, setCheckoutMode] = useState<'Child' | 'Adult' | null>(null);
  const [adultPublished, setAdultPublished] = useState<boolean>(true);
  const [childPublished, setChildPublished] = useState<boolean>(true);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string>('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [availableColours, setAvailableColours] = useState<string[]>(() => getStoredColours());
  const [newColourInput, setNewColourInput] = useState<string>('');
  const [ownerSuggestions, setOwnerSuggestions] = useState<Suggestion[]>([]);
  const [customerSuggestion, setCustomerSuggestion] = useState<string>('');
  const [submittingSuggestion, setSubmittingSuggestion] = useState<boolean>(false);
  const [suggestionSuccess, setSuggestionSuccess] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'Pending' | 'Completed' | 'Cancelled'>('Pending');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');

  const filteredOwnerOrders = useMemo(() => {
    const q = orderSearchQuery.trim().toLowerCase();
    return ownerOrders.filter((o) => {
      const matchesStatus =
        orderStatusFilter === 'Pending'
          ? !['Completed', 'Delivered', 'Collected', 'Cancelled'].includes(o.status)
          : orderStatusFilter === 'Completed'
          ? ['Completed', 'Delivered', 'Collected'].includes(o.status)
          : o.status === orderStatusFilter;

      if (!matchesStatus) return false;

      if (q) {
        const customerName = (o.name || '').toLowerCase();
        const productName = (o.productName || '').toLowerCase();
        const orderNumber = (o.orderNumber || '').toLowerCase();
        const orderId = (o.id || '').toLowerCase();
        return (
          customerName.includes(q) ||
          productName.includes(q) ||
          orderNumber.includes(q) ||
          orderId.includes(q)
        );
      }

      return true;
    });
  }, [ownerOrders, orderStatusFilter, orderSearchQuery]);
  const [checkoutForm, setCheckoutForm] = useState({
    name: '',
    studentClass: '',
    section: '',
    phone: '',
    address: '',
    note: '',
    colour: '',
  });
  const [productForm, setProductForm] = useState({
    name: '',
    price: '',
    description: '',
    category: '',
  });
  const [productImages, setProductImages] = useState<File[]>([]);
  const [editExistingImages, setEditExistingImages] = useState<string[]>([]);
  const [productSubmitTarget, setProductSubmitTarget] = useState<'published' | 'draft'>('published');
  const editingProduct = useMemo(
    () => (editingProductId ? products.find((p) => p.id === editingProductId) || null : null),
    [editingProductId, products]
  );
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [customerId] = useState<string>(() => getCustomerKey());
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState<boolean>(false);
  const [myOrdersError, setMyOrdersError] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [hasStatusUpdateNotification, setHasStatusUpdateNotification] = useState<boolean>(false);
  const [hasOwnerOrderNotification, setHasOwnerOrderNotification] = useState<boolean>(false);
  const [ownerNewOrdersCount, setOwnerNewOrdersCount] = useState<number>(0);
  const [deletingCustomerOrderId, setDeletingCustomerOrderId] = useState<string | null>(null);

  const shareShop = async () => {
    const url = 'https://playnixshop-website.vercel.app/';
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Playnix - Toy Shop',
          text: 'Browse the toy shelf and order on Playnix!',
          url,
        });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  const loadProducts = async () => {
    try {
      const cloudProds = await fetchProductsFromCloud();
      if (Array.isArray(cloudProds) && cloudProds.length > 0) {
        setProducts(cloudProds);
        saveStoredProducts(cloudProds);
        return;
      }
    } catch (err) {
      console.warn('Could not load products from cloud:', err);
    }
    try {
      const res = await api.get('/api/products');
      if (res.data?.products && Array.isArray(res.data.products) && res.data.products.length > 0) {
        const currentStored = getStoredProducts();
        const serverIds = new Set(res.data.products.map((p: Product) => p.id));
        const merged = [
          ...res.data.products,
          ...currentStored.filter((p) => !serverIds.has(p.id)),
        ];
        setProducts(merged);
        saveStoredProducts(merged);
        return;
      }
    } catch {}
    setProducts(getStoredProducts());
  };

  const loadOwnerProducts = async () => {
    try {
      const cloudProds = await fetchProductsFromCloud();
      if (Array.isArray(cloudProds) && cloudProds.length > 0) {
        setProducts(cloudProds);
        saveStoredProducts(cloudProds);
        return;
      }
    } catch (err) {
      console.warn('Could not load owner products from cloud:', err);
    }
    try {
      const res = await ownerPost('/api/owner/products/list', {});
      if (res.data?.products && Array.isArray(res.data.products) && res.data.products.length > 0) {
        const currentStored = getStoredProducts();
        const serverIds = new Set(res.data.products.map((p: Product) => p.id));
        const merged = [
          ...res.data.products,
          ...currentStored.filter((p) => !serverIds.has(p.id)),
        ];
        setProducts(merged);
        saveStoredProducts(merged);
        return;
      }
    } catch {}
    setProducts(getStoredProducts());
  };

  const loadOwnerSuggestions = async () => {
    try {
      const cloudSuggestions = await fetchSuggestionsFromCloud();
      if (cloudSuggestions.length > 0) {
        setOwnerSuggestions(cloudSuggestions);
        return;
      }
    } catch {}
    try {
      const res = await api.post('/api/owner/suggestions', { pin: ownerPin });
      setOwnerSuggestions(res.data.suggestions || []);
    } catch {}
  };

  const dismissOwnerNotification = () => {
    setHasOwnerOrderNotification(false);
    setOwnerNewOrdersCount(0);
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem('toynest_owner_acknowledged_time', nowIso);
    } catch {}

    const stored = getStoredOrders();
    markAllOwnerOrdersSeen(stored);
    if (ownerOrders.length > 0) {
      markAllOwnerOrdersSeen(ownerOrders);
    }

    // Also fetch latest orders from cloud to record all existing IDs as seen
    fetchAllOrdersFromCloud()
      .then((cloudOrders) => {
        if (Array.isArray(cloudOrders) && cloudOrders.length > 0) {
          saveStoredOrders(cloudOrders);
          markAllOwnerOrdersSeen(cloudOrders);
        }
      })
      .catch(() => {});
  };

  const handleOpenOwnerAccess = () => {
    setPage('ownerLogin');
    setErrorMessage('');
    setIsSideMenuOpen(false);
    dismissOwnerNotification();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const dismissCustomerNotification = () => {
    setHasStatusUpdateNotification(false);
    const orders = myOrders.length > 0 ? myOrders : getStoredOrders().filter((o) => o.customerId === customerId);
    const seen = getSeenOrderStatuses();
    orders.forEach((o) => {
      seen[o.id] = o.status;
    });
    saveSeenOrderStatuses(seen);
  };

  const handleDeleteCustomerOrder = async (orderId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this order from your view?');
    if (!confirmed) return;

    setDeletingCustomerOrderId(orderId);
    try {
      await markOrderDeletedByCustomerInCloud(orderId);
    } catch (err) {
      console.warn('Could not update Firestore for customer delete:', err);
    }

    try {
      await api.post('/api/orders/customer-delete', { orderId, customerId });
    } catch (err) {
      console.warn('Could not update server for customer delete:', err);
    }

    // Mark locally in customer deleted list
    markOrderDeletedByCustomerLocally(orderId);

    // Update stored local orders: preserve order for owner, but mark customerDeleted: true
    const currentStored = getStoredOrders();
    const updatedStored = currentStored.map((o) =>
      o.id === orderId ? { ...o, customerDeleted: true } : o
    );
    saveStoredOrders(updatedStored);

    // Update myOrders state immediately
    setMyOrders((prev) => prev.filter((o) => o.id !== orderId));
    setDeletingCustomerOrderId(null);
  };

  const loadOwnerOrders = async () => {
    try {
      const cloudOrders = await fetchAllOrdersFromCloud();
      if (Array.isArray(cloudOrders)) {
        setOwnerOrders(cloudOrders);
        saveStoredOrders(cloudOrders);
        markAllOwnerOrdersSeen(cloudOrders);
        const newOrders = cloudOrders.filter((o) => o.status === 'New');
        setOwnerNewOrdersCount(newOrders.length);
        setHasOwnerOrderNotification(false);
        return;
      }
    } catch {}
    try {
      const res = await api.post('/api/owner/orders', { pin: ownerPin });
      if (res.data?.orders && Array.isArray(res.data.orders)) {
        const orders: Order[] = res.data.orders;
        setOwnerOrders(orders);
        saveStoredOrders(orders);
        markAllOwnerOrdersSeen(orders);
        const newOrders = orders.filter((o) => o.status === 'New');
        setOwnerNewOrdersCount(newOrders.length);
        setHasOwnerOrderNotification(false);
        return;
      }
    } catch {}
    const localOrders = getStoredOrders();
    setOwnerOrders(localOrders);
    markAllOwnerOrdersSeen(localOrders);
    const newLocal = localOrders.filter((o) => o.status === 'New');
    setOwnerNewOrdersCount(newLocal.length);
    setHasOwnerOrderNotification(false);
  };

  const loadPaymentQr = async () => {
    try {
      const settings = await fetchSettingsFromCloud();
      if (settings.paymentQrUrl) {
        setPaymentQrUrl(settings.paymentQrUrl);
        return;
      }
    } catch {}
    try {
      const res = await api.get('/api/payment-qr');
      if (res.data?.url) {
        setPaymentQrUrl(res.data.url);
        return;
      }
    } catch {}
    setPaymentQrUrl(localStorage.getItem('toynest_payment_qr') || '/payment/adult-qr.jpg');
  };

  const loadShopModes = async () => {
    try {
      const settings = await fetchSettingsFromCloud();
      if (settings && (settings.adultPublished !== undefined || settings.childPublished !== undefined)) {
        setAdultPublished(settings.adultPublished !== false);
        setChildPublished(settings.childPublished !== false);
        return;
      }
    } catch {}
    try {
      const res = await api.get('/api/shop-modes');
      if (res.data) {
        setAdultPublished(res.data.adultPublished !== false);
        setChildPublished(res.data.childPublished !== false);
        return;
      }
    } catch {}
    try {
      const local = localStorage.getItem('toynest_shop_modes');
      if (local) {
        const parsed = JSON.parse(local);
        setAdultPublished(parsed.adultPublished !== false);
        setChildPublished(parsed.childPublished !== false);
        return;
      }
    } catch {}
    setAdultPublished(true);
    setChildPublished(true);
  };

  const saveShopModes = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      await saveSettingsToCloud({ adultPublished, childPublished });
    } catch {}
    try {
      await ownerPost('/api/owner/shop-modes', {
        adultPublished,
        childPublished,
      });
    } catch {}
    localStorage.setItem(
      'toynest_shop_modes',
      JSON.stringify({ adultPublished, childPublished })
    );
    if (
      (checkoutMode === 'Adult' && !adultPublished) ||
      (checkoutMode === 'Child' && !childPublished)
    ) {
      setCheckoutMode(null);
    }
    setSuccessMessage(
      'Shop sections saved. Draft sections are hidden from customers and can be published again anytime.'
    );
    setLoading(false);
  };

  const savePaymentQr = async () => {
    if (!qrFile) {
      setErrorMessage('Choose a QR code image first.');
      return;
    }
    if (qrFile.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(qrFile.type)) {
      setErrorMessage('Choose a JPG, PNG or WebP QR image under 1 MB.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(qrFile);
      });
      let qrUrl = '';
      try {
        const res = await ownerPost('/api/owner/payment-qr', {
          data: base64Data,
          contentType: qrFile.type,
        });
        qrUrl = res.data.url || '';
      } catch {}
      if (!qrUrl) {
        qrUrl = `data:${qrFile.type};base64,${base64Data}`;
      }
      setPaymentQrUrl(qrUrl);
      localStorage.setItem('toynest_payment_qr', qrUrl);
      try {
        await saveSettingsToCloud({ paymentQrUrl: qrUrl });
      } catch {}
      setQrFile(null);
      setSuccessMessage('Adult payment QR code saved.');
    } catch {
      setErrorMessage('Could not save the QR code. Please try another image.');
    } finally {
      setLoading(false);
    }
  };

  const loadColours = async () => {
    try {
      const cloudColours = await fetchColoursFromCloud();
      if (cloudColours && Array.isArray(cloudColours) && cloudColours.length > 0) {
        setAvailableColours(cloudColours);
        saveStoredColours(cloudColours);
        return;
      }
    } catch {}
    try {
      const res = await api.get('/api/colours');
      if (res.data?.colours && Array.isArray(res.data.colours) && res.data.colours.length > 0) {
        setAvailableColours(res.data.colours);
        saveStoredColours(res.data.colours);
        return;
      }
    } catch {}
    setAvailableColours(getStoredColours());
  };

  const handleAddColour = async () => {
    const trimmed = newColourInput.trim();
    if (!trimmed) {
      setErrorMessage('Please enter a colour name.');
      return;
    }
    const exists = availableColours.some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setErrorMessage(`Colour "${trimmed}" already exists.`);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    const updated = [...availableColours, trimmed];
    setAvailableColours(updated);
    saveStoredColours(updated);
    setNewColourInput('');

    try {
      await saveColoursToCloud(updated);
    } catch (err) {
      console.warn('Could not save colour to cloud:', err);
    }

    try {
      await ownerPost('/api/owner/colours/add', { colour: trimmed });
    } catch (err) {
      console.warn('Could not save colour to backend:', err);
    }

    setSuccessMessage(`Colour "${trimmed}" added.`);
    setLoading(false);
  };

  const handleRemoveColour = async (colourToRemove: string) => {
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    const updated = availableColours.filter(
      (c) => c.toLowerCase() !== colourToRemove.toLowerCase()
    );
    setAvailableColours(updated);
    saveStoredColours(updated);

    try {
      await saveColoursToCloud(updated);
    } catch (err) {
      console.warn('Could not remove colour from cloud:', err);
    }

    try {
      await ownerPost('/api/owner/colours/delete', { colour: colourToRemove });
    } catch (err) {
      console.warn('Could not remove colour from backend:', err);
    }

    setSuccessMessage(`Colour "${colourToRemove}" removed.`);
    setLoading(false);
  };

  useEffect(() => {
    loadPaymentQr();
    loadShopModes();
    loadColours();

    let unsubProducts = () => {};
    try {
      unsubProducts = subscribeToProducts((cloudProds) => {
        if (Array.isArray(cloudProds) && cloudProds.length > 0) {
          setProducts(cloudProds);
          saveStoredProducts(cloudProds);
        }
      });
    } catch (err) {
      console.warn('Real-time products subscription error:', err);
      loadProducts();
    }

    let unsubColours = () => {};
    try {
      unsubColours = subscribeToColours((colours) => {
        if (Array.isArray(colours)) {
          setAvailableColours(colours);
          saveStoredColours(colours);
        }
      });
    } catch {}

    let unsubDeals = () => {};
    try {
      unsubDeals = subscribeToRescueDeals((cloudDeals) => {
        if (Array.isArray(cloudDeals)) {
          setRescueDeals(cloudDeals);
        }
      });
    } catch (err) {
      console.warn('Real-time rescue deals subscription error:', err);
      fetchRescueDealsFromCloud().then((deals) => {
        if (Array.isArray(deals) && deals.length > 0) {
          setRescueDeals(deals);
        }
      }).catch(() => {});
    }

    return () => {
      unsubProducts();
      unsubColours();
      unsubDeals();
    };
  }, []);

  const checkOrderUpdates = async () => {
    if (!customerId) return;
    const deletedIds = new Set(getCustomerDeletedOrderIds());
    try {
      const cloudOrders = await fetchCustomerOrdersFromCloud(customerId);
      if (Array.isArray(cloudOrders)) {
        const visibleOrders = cloudOrders.filter(
          (o) => !o.customerDeleted && !deletedIds.has(o.id)
        );
        const otherOrders = getStoredOrders().filter((o) => o.customerId !== customerId);
        saveStoredOrders([...cloudOrders, ...otherOrders]);

        const seen = getSeenOrderStatuses();
        const hasUnseenStatus = visibleOrders.some((o) => seen[o.id] !== o.status);
        setHasStatusUpdateNotification(hasUnseenStatus);
        return;
      }
    } catch {}

    const stored = getStoredOrders().filter(
      (o) => o.customerId === customerId && !o.customerDeleted && !deletedIds.has(o.id)
    );
    if (stored.length === 0) return;
    const seen = getSeenOrderStatuses();
    const hasUnseenStatus = stored.some((o) => seen[o.id] !== o.status);
    setHasStatusUpdateNotification(hasUnseenStatus);
  };

  const checkOwnerOrderUpdates = async () => {
    const getAcknowledgedTime = (): number => {
      try {
        const raw = localStorage.getItem('toynest_owner_acknowledged_time');
        if (raw) {
          const t = new Date(raw).getTime();
          if (!isNaN(t)) return t;
        }
      } catch {}
      return 0;
    };
    const ackTime = getAcknowledgedTime();

    try {
      const cloudOrders = await fetchAllOrdersFromCloud();
      if (Array.isArray(cloudOrders) && cloudOrders.length > 0) {
        saveStoredOrders(cloudOrders);
        const seenIds = new Set(getSeenOwnerOrderIds());
        const unseenNewOrders = cloudOrders.filter((o) => {
          if (o.status !== 'New') return false;
          if (seenIds.has(o.id)) return false;
          if (ackTime > 0) {
            const orderTime = new Date(o.createdAt).getTime();
            if (!isNaN(orderTime) && orderTime <= ackTime) return false;
          }
          return true;
        });

        setOwnerNewOrdersCount(unseenNewOrders.length);
        setHasOwnerOrderNotification(unseenNewOrders.length > 0);
        return;
      }
    } catch {}

    try {
      const res = await api.get('/api/orders/pending-summary');
      const { newCount, latestOrderId, latestOrderTime } = res.data || {};
      const seenIds = new Set(getSeenOwnerOrderIds());

      if (newCount > 0 && latestOrderId) {
        let isAcknowledged = seenIds.has(latestOrderId);
        if (!isAcknowledged && ackTime > 0 && latestOrderTime) {
          const orderTime = new Date(latestOrderTime).getTime();
          if (!isNaN(orderTime) && orderTime <= ackTime) {
            isAcknowledged = true;
          }
        }
        if (!isAcknowledged) {
          setHasOwnerOrderNotification(true);
          setOwnerNewOrdersCount(newCount);
          return;
        }
      }
    } catch {}

    const stored = getStoredOrders();
    const seenIds = new Set(getSeenOwnerOrderIds());
    const unseenNewOrders = stored.filter((o) => {
      if (o.status !== 'New') return false;
      if (seenIds.has(o.id)) return false;
      if (ackTime > 0) {
        const orderTime = new Date(o.createdAt).getTime();
        if (!isNaN(orderTime) && orderTime <= ackTime) return false;
      }
      return true;
    });

    setOwnerNewOrdersCount(unseenNewOrders.length);
    setHasOwnerOrderNotification(unseenNewOrders.length > 0);
  };

  useEffect(() => {
    checkOrderUpdates();
    if (page === 'owner') {
      checkOwnerOrderUpdates();
    }
    const interval = setInterval(() => {
      checkOrderUpdates();
      if (page === 'owner') {
        checkOwnerOrderUpdates();
      }
    }, 15000);
    const handleFocus = () => {
      checkOrderUpdates();
      if (page === 'owner') {
        checkOwnerOrderUpdates();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [customerId, page]);

  // Real-time Firestore sync for customer orders across devices
  useEffect(() => {
    if (!customerId) return;
    let unsub = () => {};
    try {
      unsub = subscribeToCustomerOrders(customerId, (liveOrders) => {
        if (Array.isArray(liveOrders)) {
          const deletedIds = new Set(getCustomerDeletedOrderIds());
          const visibleOrders = liveOrders.filter(
            (o) => !o.customerDeleted && !deletedIds.has(o.id)
          );
          const enriched = computeLocalQueuePositions(visibleOrders);
          setMyOrders(enriched);
          const otherStored = getStoredOrders().filter((o) => o.customerId !== customerId);
          saveStoredOrders([...liveOrders, ...otherStored]);
        }
      });
    } catch (err) {
      console.warn('Customer order subscription error:', err);
    }
    return () => {
      unsub();
    };
  }, [customerId]);

  // Real-time Firestore sync when owner dashboard is active
  useEffect(() => {
    if (page === 'owner') {
      const unsubscribe = subscribeToAllOrders((liveOrders) => {
        if (Array.isArray(liveOrders)) {
          setOwnerOrders(liveOrders);
          saveStoredOrders(liveOrders);
        }
      });
      return () => unsubscribe();
    }
  }, [page]);

  const loadMyOrders = async () => {
    setMyOrdersLoading(true);
    setMyOrdersError('');
    const deletedIds = new Set(getCustomerDeletedOrderIds());
    try {
      await loadPaymentQr();
      
      // 1. Fetch latest orders directly from Cloud Firestore (shared database)
      const cloudOrders = await fetchCustomerOrdersFromCloud(customerId);
      if (Array.isArray(cloudOrders)) {
        const visibleOrders = cloudOrders.filter(
          (o) => !o.customerDeleted && !deletedIds.has(o.id)
        );
        const enriched = computeLocalQueuePositions(visibleOrders);
        setMyOrders(enriched);
        
        // Save cloud orders without wiping other records
        const otherStored = getStoredOrders().filter((o) => o.customerId !== customerId);
        saveStoredOrders([...cloudOrders, ...otherStored]);

        const seen = getSeenOrderStatuses();
        enriched.forEach((o) => {
          seen[o.id] = o.status;
        });
        saveSeenOrderStatuses(seen);
        setHasStatusUpdateNotification(false);
        setMyOrdersLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Could not query customer orders from Firestore:', err);
    }

    // 2. Fallback to server endpoint
    try {
      const res = await api.post('/api/orders/mine', { customerId });
      if (res.data?.orders && Array.isArray(res.data.orders)) {
        const orders: Order[] = res.data.orders.filter(
          (o: Order) => !o.customerDeleted && !deletedIds.has(o.id)
        );
        const enriched = computeLocalQueuePositions(orders);
        setMyOrders(enriched);
        const otherStored = getStoredOrders().filter((o) => o.customerId !== customerId);
        saveStoredOrders([...res.data.orders, ...otherStored]);

        const seen = getSeenOrderStatuses();
        orders.forEach((o) => {
          seen[o.id] = o.status;
        });
        saveSeenOrderStatuses(seen);
        setHasStatusUpdateNotification(false);
        setMyOrdersLoading(false);
        return;
      }
    } catch {}

    // 3. Fallback to local storage only if network failed
    const allStoredOrders = getStoredOrders();
    const activeStored = allStoredOrders.filter(
      (o) => o.customerId === customerId && !o.customerDeleted && !deletedIds.has(o.id)
    );
    const enrichedStored = computeLocalQueuePositions(activeStored);
    setMyOrders(enrichedStored);
    const seen = getSeenOrderStatuses();
    activeStored.forEach((o) => {
      seen[o.id] = o.status;
    });
    saveSeenOrderStatuses(seen);
    setHasStatusUpdateNotification(false);
    setMyOrdersLoading(false);
  };

  useEffect(() => {
    if (page === 'myOrders') {
      loadMyOrders();
    }
  }, [page, customerId]);

  // Stop green blinking indicator when visiting owner access (welcome owner screen)
  useEffect(() => {
    if (page === 'ownerLogin') {
      dismissOwnerNotification();
    }
  }, [page]);

  // Preload images when viewing gallery
  useEffect(() => {
    if (!galleryProduct) return;
    const urls =
      galleryProduct.imageUrls && galleryProduct.imageUrls.length
        ? galleryProduct.imageUrls
        : galleryProduct.imageUrl
        ? [galleryProduct.imageUrl]
        : [];
    urls.forEach((u) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = u;
      if (typeof img.decode === 'function') {
        img.decode().catch(() => {});
      }
    });
  }, [galleryProduct]);

  // Escape key and body scroll lock for owner menu panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOwnerMenuOpen(false);
      }
    };
    if (isOwnerMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else if (!isSideMenuOpen) {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (!isSideMenuOpen) {
        document.body.style.overflow = '';
      }
    };
  }, [isOwnerMenuOpen, isSideMenuOpen]);

  // Ensure owner menu panel is closed if owner exits dashboard
  useEffect(() => {
    if (page !== 'owner') {
      setIsOwnerMenuOpen(false);
    }
  }, [page]);

  const ownerPost = async (url: string, body: any) => {
    let pinToSend = ownerPin;
    if (!pinToSend) {
      try {
        pinToSend = sessionStorage.getItem('playnix_owner_pin') || DEFAULT_OWNER_PIN;
      } catch {
        pinToSend = DEFAULT_OWNER_PIN;
      }
    }
    return api.post(url, { ...body, pin: pinToSend });
  };

  const refreshShop = async () => {
    setIsRefreshing(true);
    setErrorMessage('');
    try {
      await Promise.all([
        loadProducts(),
        loadShopModes(),
        loadColours(),
        fetchRescueDealsFromCloud().then((d) => Array.isArray(d) && setRescueDeals(d)).catch(() => {}),
      ]);
      setSuccessMessage('Shop refreshed. You are seeing the latest published toys.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshOwnerDashboard = async () => {
    setIsRefreshing(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await Promise.all([
        loadOwnerProducts(),
        loadOwnerOrders(),
        loadColours(),
        fetchRescueDealsFromCloud().then((d) => Array.isArray(d) && setRescueDeals(d)).catch(() => {}),
      ]);
      if (ownerTab === 'suggestions') await loadOwnerSuggestions();
      if (ownerTab === 'sections') await loadShopModes();
      if (ownerTab === 'payment') await loadPaymentQr();
      if (ownerTab === 'colours') await loadColours();
      setSuccessMessage('Dashboard refreshed with the latest data.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const verifyOwnerLogin = async () => {
    setLoading(true);
    setErrorMessage('');
    const enteredPin = ownerPin.trim();
    const normalizedEntered = enteredPin.toUpperCase();

    // Strictly only allow fixed owner PIN 'ANAND1904' (case-insensitive)
    const isPinValid = normalizedEntered === DEFAULT_OWNER_PIN;

    if (isPinValid) {
      try {
        sessionStorage.setItem('playnix_owner_pin', DEFAULT_OWNER_PIN);
      } catch {}
      setOwnerPin(DEFAULT_OWNER_PIN);
      try {
        localStorage.removeItem('toynest_custom_owner_pin');
      } catch {}
      try {
        await ownerPost('/api/owner/verify', {});
      } catch (err) {
        console.warn('Backend verification call skipped or offline on host:', err);
      }
      setErrorMessage('');
      setPage('owner');
      setOwnerTab('products');
      loadOwnerProducts().catch(() => {});
      loadOwnerOrders().catch(() => {});
      setLoading(false);
      return;
    }

    try {
      await ownerPost('/api/owner/verify', {});
      setErrorMessage('');
      setPage('owner');
      setOwnerTab('products');
      await loadOwnerProducts();
      await loadOwnerOrders();
    } catch {
      setErrorMessage('Incorrect PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduct = async (isDraft: boolean) => {
    const targetAvailable = !isDraft;
    setErrorMessage('');
    setSuccessMessage('');

    const cleanName = productForm.name.trim();
    const cleanPrice = Number(productForm.price);
    if (!cleanName || isNaN(cleanPrice) || cleanPrice <= 0) {
      setErrorMessage('Please enter a toy name and a valid price (greater than ₹0).');
      return;
    }

    setLoading(true);

    try {
      // 1. Process all newly added pictures directly into clean optimized JPEG data URLs
      const newOptimizedDataUrls: string[] = [];
      if (productImages.length > 0) {
        for (const file of productImages) {
          const dataUrl = await fileToOptimizedDataUrl(file, 800, 0.72);
          if (dataUrl) newOptimizedDataUrls.push(dataUrl);
        }
      }

      if (editingProductId) {
        // ---- EDIT EXISTING PRODUCT / DRAFT ----
        const existing =
          products.find((p) => p.id === editingProductId) ||
          getStoredProducts().find((p) => p.id === editingProductId);

        let finalImageUrls = [...editExistingImages, ...newOptimizedDataUrls];
        if (finalImageUrls.length === 0) {
          finalImageUrls = existing?.imageUrls?.length
            ? existing.imageUrls
            : existing?.imageUrl
            ? [existing.imageUrl]
            : ['/toys/toy-40ba4ba9-1.jpg'];
        }

        // Guarantee payload is safely under Firestore limit
        finalImageUrls = await guaranteeSafeImagePayload(finalImageUrls);

        const updatedItem: Product = {
          id: editingProductId,
          name: cleanName,
          price: cleanPrice,
          description: productForm.description.trim(),
          category: productForm.category.trim() || 'Other',
          imageUrl: finalImageUrls[0] || '/toys/toy-40ba4ba9-1.jpg',
          imageUrls: finalImageUrls,
          available: targetAvailable,
          createdAt: existing?.createdAt || new Date().toISOString(),
        };

        // CRITICAL: Await Firestore write first! If Firestore write fails, DO NOT falsely claim success!
        await saveProductToCloud(updatedItem);

        // Notify server backend as secondary sync
        ownerPost('/api/owner/products/update', updatedItem).catch(() => {});

        // Update local React state and storage
        setProducts((prev) => {
          const next = prev.map((p) => (p.id === editingProductId ? updatedItem : p));
          saveStoredProducts(next);
          return next;
        });

        setEditingProductId(null);
        setProductForm({ name: '', price: '', description: '', category: '' });
        setProductImages([]);
        setEditExistingImages([]);
        setProductSubmitTarget('published');
        setSuccessMessage(
          targetAvailable
            ? `"${updatedItem.name}" published to shop!`
            : `"${updatedItem.name}" saved as draft. Hidden from customers.`
        );

        if (isDraft) {
          setOwnerTab('drafts');
          setProductFilter('drafts');
        } else {
          setProductFilter('published');
        }
        setLoading(false);
        return;
      }

      // ---- CREATE NEW PRODUCT / DRAFT ----
      let finalImageUrls = [...newOptimizedDataUrls];
      if (finalImageUrls.length === 0) {
        finalImageUrls = ['/toys/toy-40ba4ba9-1.jpg'];
      }
      finalImageUrls = await guaranteeSafeImagePayload(finalImageUrls);

      const productId = `toy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newProduct: Product = {
        id: productId,
        name: cleanName,
        price: cleanPrice,
        description: productForm.description.trim(),
        category: productForm.category.trim() || 'Other',
        imageUrl: finalImageUrls[0],
        imageUrls: finalImageUrls,
        available: targetAvailable,
        createdAt: new Date().toISOString(),
      };

      // CRITICAL: Await Firestore write first!
      await saveProductToCloud(newProduct);

      // Notify server backend as secondary sync
      ownerPost('/api/owner/products', newProduct).catch(() => {});

      setProducts((prev) => {
        const next = [newProduct, ...prev.filter((p) => p.id !== productId)];
        saveStoredProducts(next);
        return next;
      });

      setProductForm({ name: '', price: '', description: '', category: '' });
      setProductImages([]);
      setEditExistingImages([]);
      setProductSubmitTarget('published');
      setSuccessMessage(
        isDraft
          ? `"${newProduct.name}" saved as draft. You can find it in the Drafts tab.`
          : `"${newProduct.name}" added and published in your shop!`
      );

      if (isDraft) {
        setOwnerTab('drafts');
        setProductFilter('drafts');
      } else {
        setProductFilter('published');
      }
    } catch (err: any) {
      console.error('Error saving product to database:', err);
      setErrorMessage(
        err?.message
          ? `Could not save toy to cloud database: ${err.message}`
          : 'Could not save toy to the cloud database. Please check your network and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleProductVisibility = async (p: Product) => {
    const newAvail = p.available === false;
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await updateProductAvailabilityInCloud(p.id, newAvail);

      setProducts((prev) => {
        const next = prev.map((item) =>
          item.id === p.id ? { ...item, available: newAvail } : item
        );
        saveStoredProducts(next);
        return next;
      });

      ownerPost('/api/owner/products/update', { id: p.id, available: newAvail }).catch(() => {});

      setSuccessMessage(
        newAvail
          ? `"${p.name}" published to shop!`
          : `"${p.name}" moved to drafts and hidden from customers.`
      );
    } catch (err: any) {
      console.error('Could not update product availability:', err);
      setErrorMessage(
        err?.message ? `Failed to update status: ${err.message}` : 'Failed to update visibility in cloud database.'
      );
    } finally {
      setLoading(false);
    }
  };

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setProductForm({
      name: p.name,
      price: String(p.price),
      description: p.description || '',
      category: p.category || 'Other',
    });
    const currentImgs =
      p.imageUrls && p.imageUrls.length > 0
        ? [...p.imageUrls]
        : p.imageUrl
        ? [p.imageUrl]
        : [];
    setEditExistingImages(currentImgs);
    setProductImages([]);
    setProductSubmitTarget(p.available === false ? 'draft' : 'published');
    setErrorMessage('');
    setSuccessMessage('');
    setOwnerTab('products');
    window.scrollTo({ top: 320, behavior: 'smooth' });
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setProductForm({ name: '', price: '', description: '', category: '' });
    setProductImages([]);
    setEditExistingImages([]);
    setProductSubmitTarget('published');
    setErrorMessage('');
  };

  const deleteProduct = async (id: string) => {
    const p = products.find((item) => item.id === id);
    const toyName = p?.name || 'this toy';
    if (!window.confirm(`Are you sure you want to delete "${toyName}"?`)) {
      return;
    }
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await deleteProductFromCloud(id);
      ownerPost('/api/owner/products/delete', { id }).catch(() => {});
      setProducts((prev) => {
        const next = prev.filter((item) => item.id !== id);
        saveStoredProducts(next);
        return next;
      });
      setSuccessMessage(`"${toyName}" was removed.`);
    } catch (err: any) {
      console.error('Could not delete toy from cloud:', err);
      setErrorMessage(
        err?.message ? `Failed to delete: ${err.message}` : 'Failed to delete toy from cloud database.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRescueDeal = async (deal: RescueDeal) => {
    if (!window.confirm(`Delete rescue deal "${deal.title}"?`)) {
      return;
    }
    setDeletingDealId(deal.id);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      // 1. Optimistic UI update
      setRescueDeals((prev) => prev.filter((d) => d.id !== deal.id));
      
      // 2. Cloud delete & local storage marker
      await deleteRescueDealFromCloud(deal.id);
      
      // 3. Backend secondary sync
      try {
        await api.delete(`/api/rescue-deals/${deal.id}`);
      } catch {}

      setSuccessMessage(`Rescue deal "${deal.title}" was removed.`);
    } catch (err: any) {
      console.error('Error deleting rescue deal:', err);
      // Revert if error
      try {
        const fresh = await fetchRescueDealsFromCloud();
        setRescueDeals(fresh);
      } catch {}
      setErrorMessage(err?.message || 'Could not delete rescue deal.');
    } finally {
      setDeletingDealId(null);
    }
  };

  const handleSuggestionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuggestionSuccess('');
    setErrorMessage('');
    const val = customerSuggestion.trim();
    if (!val) {
      setErrorMessage('Please write a suggestion before submitting.');
      return;
    }
    setSubmittingSuggestion(true);
    const newSug: Suggestion = {
      id: `sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      suggestion: val,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveSuggestionToCloud(newSug);
      try {
        await api.post('/api/suggestions', { suggestion: val });
      } catch {}
      setCustomerSuggestion('');
      setSuggestionSuccess('Thanks! Your suggestion has been sent.');
    } catch {
      setErrorMessage('Could not send your suggestion. Please try again.');
    } finally {
      setSubmittingSuggestion(false);
    }
  };


  const handlePlaceOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');

    const targetItem = selectedDealForBuy || selectedProductForBuy;
    if (!targetItem || !checkoutForm.name.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }

    // If checkout is for a Rescue Deal, verify it's not already claimed
    if (selectedDealForBuy) {
      if (selectedDealForBuy.claimed || selectedDealForBuy.status === 'claimed') {
        setErrorMessage('This Rescue Deal is no longer available as it has already been claimed.');
        return;
      }
    }

    let validatedQuantity = 1;
    let unitPrice = 0;
    let totalPrice = 0;

    if (selectedDealForBuy) {
      validatedQuantity = 1; // Strict single-quantity offer
      unitPrice = selectedDealForBuy.dealPrice;
      totalPrice = selectedDealForBuy.dealPrice;
    } else if (selectedProductForBuy) {
      const parsedQty = parseInt(String(orderQuantity), 10);
      if (isNaN(parsedQty) || parsedQty < 1 || parsedQty > 5) {
        setErrorMessage('Please select a quantity between 1 and 5.');
        return;
      }
      validatedQuantity = Math.min(5, Math.max(1, parsedQty));
      unitPrice = selectedProductForBuy.price;
      totalPrice = unitPrice * validatedQuantity;
    }

    if (checkoutMode === 'Adult') {
      const phoneDigits = checkoutForm.phone.replace(/\D/g, '').length;
      if (phoneDigits < 7 || phoneDigits > 15) {
        setErrorMessage('Enter a valid phone number.');
        return;
      }
      if (!checkoutForm.address.trim()) {
        setErrorMessage('Please enter your delivery address.');
        return;
      }
    } else {
      if (!checkoutForm.studentClass || !checkoutForm.section.trim()) {
        setErrorMessage('Please fill in class and section.');
        return;
      }
    }

    const finalColour = selectedDealForBuy
      ? (selectedDealForBuy.colour || checkoutForm.colour || '')
      : (checkoutForm.colour || '');

    if (!selectedDealForBuy && availableColours.length > 0 && !finalColour) {
      setErrorMessage('Please select a colour.');
      return;
    }

    setLoading(true);

    const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const orderNumber = `TN-${Math.floor(1000 + Math.random() * 9000)}`;
    const orderItemName = selectedDealForBuy
      ? `[Rescue Deal] ${selectedDealForBuy.title}`
      : selectedProductForBuy!.name;
    const orderItemImage = selectedDealForBuy
      ? selectedDealForBuy.imageUrl
      : (selectedProductForBuy!.imageUrl || (selectedProductForBuy!.imageUrls && selectedProductForBuy!.imageUrls[0]) || '');

    const orderData: Order = {
      id: orderId,
      orderNumber,
      customerId,
      mode: checkoutMode || 'Child',
      productId: selectedDealForBuy ? (selectedDealForBuy.productId || selectedDealForBuy.id) : selectedProductForBuy!.id,
      productName: orderItemName,
      productImageUrl: orderItemImage,
      price: totalPrice,
      quantity: validatedQuantity,
      unitPrice: unitPrice,
      name: checkoutForm.name.trim(),
      studentClass: checkoutMode === 'Adult' ? '' : checkoutForm.studentClass,
      section: checkoutMode === 'Adult' ? '' : checkoutForm.section.trim(),
      phone: checkoutMode === 'Adult' ? checkoutForm.phone.trim() : '',
      address: checkoutMode === 'Adult' ? checkoutForm.address.trim() : '',
      note: checkoutForm.note.trim(),
      status: 'New',
      createdAt: new Date().toISOString(),
      colour: finalColour,
      isRescueDeal: Boolean(selectedDealForBuy),
      rescueDealId: selectedDealForBuy ? selectedDealForBuy.id : undefined,
      rescueCondition: selectedDealForBuy ? selectedDealForBuy.condition : undefined,
    };

    try {
      if (selectedDealForBuy) {
        // ATOMIC TRANSACTION:
        // Reads the deal in Firestore, checks that claimed === false,
        // writes the order, and updates the deal to claimed: true in a single atomic commit.
        // If claimed by someone else or if order write fails, the transaction is rejected and rolls back.
        await claimRescueDealInCloud(selectedDealForBuy.id, orderData);

        try {
          await api.post('/api/orders', {
            ...orderData,
            productName: orderItemName,
          });
        } catch {}

        // Update local state immediately so user sees it right away
        setRescueDeals((prev) =>
          prev.map((d) => (d.id === selectedDealForBuy.id ? { ...d, claimed: true, status: 'claimed' } : d))
        );
      } else {
        let createdOrder: Order | null = null;
        try {
          const res = await api.post('/api/orders', {
            customerId,
            mode: checkoutMode || 'Child',
            productId: selectedProductForBuy!.id,
            name: checkoutForm.name.trim(),
            studentClass: checkoutMode === 'Adult' ? '' : checkoutForm.studentClass,
            section: checkoutMode === 'Adult' ? '' : checkoutForm.section.trim(),
            phone: checkoutMode === 'Adult' ? checkoutForm.phone.trim() : '',
            address: checkoutMode === 'Adult' ? checkoutForm.address.trim() : '',
            note: checkoutForm.note.trim(),
            colour: checkoutForm.colour || '',
            quantity: validatedQuantity,
            unitPrice: unitPrice,
            price: totalPrice,
          });
          if (res.data?.order) {
            createdOrder = res.data.order;
          }
        } catch {}

        const finalOrder = createdOrder || orderData;
        await saveOrderToCloud(finalOrder);
      }

      const allExisting = getStoredOrders().filter((o) => o.id !== orderData.id);
      const updatedList = computeLocalQueuePositions([orderData, ...allExisting]);
      saveStoredOrders(updatedList);

      setHasStatusUpdateNotification(true);
      setHasOwnerOrderNotification(true);
      setSuccessMessage('');
      setPage('myOrders');
      await loadMyOrders();
      setCheckoutForm({ name: '', studentClass: '', section: '', phone: '', address: '', note: '', colour: '' });
      setSelectedProductForBuy(null);
      setSelectedDealForBuy(null);
      setOrderQuantity(1);
    } catch (saveErr: any) {
      console.error('Error completing order:', saveErr);
      const msg = saveErr?.message || String(saveErr);
      if (msg.includes('already been claimed') || msg.includes('claimed by another customer')) {
        setErrorMessage('Sorry! This Rescue Deal has already been claimed by another customer and is no longer available.');
        try {
          const fresh = await fetchRescueDealsFromCloud();
          setRescueDeals(fresh);
        } catch {}
      } else {
        setErrorMessage('Failed to place order. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (order: Order, newStatus: string) => {
    try {
      await updateOrderStatusInCloud(order.id, {
        status: newStatus,
        paymentRecipientName: order.paymentRecipientName || '',
        paymentRecipientClass: order.paymentRecipientClass || '',
        paymentRecipientSection: order.paymentRecipientSection || '',
        ownerNote: order.ownerNote || '',
      });
    } catch {}
    try {
      await ownerPost('/api/owner/orders/status', {
        id: order.id,
        status: newStatus,
        paymentRecipientName: order.paymentRecipientName || '',
        paymentRecipientClass: order.paymentRecipientClass || '',
        paymentRecipientSection: order.paymentRecipientSection || '',
        ownerNote: order.ownerNote || '',
      });
    } catch {}
    setOwnerOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
    );
    const updated = getStoredOrders().map((o) => (o.id === order.id ? { ...o, status: newStatus } : o));
    saveStoredOrders(updated);
    setSuccessMessage('Order status updated.');
  };

  const savePaymentRecipient = async (order: Order) => {
    if (
      !order.paymentRecipientName?.trim() ||
      !order.paymentRecipientClass?.trim() ||
      !order.paymentRecipientSection?.trim()
    ) {
      setErrorMessage('Enter the payment recipient name, class and section.');
      return;
    }
    setErrorMessage('');
    try {
      await updateOrderStatusInCloud(order.id, {
        status: order.status,
        paymentRecipientName: order.paymentRecipientName.trim(),
        paymentRecipientClass: order.paymentRecipientClass.trim(),
        paymentRecipientSection: order.paymentRecipientSection.trim(),
      });
    } catch {}
    try {
      await ownerPost('/api/owner/orders/status', {
        id: order.id,
        status: order.status,
        paymentRecipientName: order.paymentRecipientName.trim(),
        paymentRecipientClass: order.paymentRecipientClass.trim(),
        paymentRecipientSection: order.paymentRecipientSection.trim(),
      });
    } catch {}
    const updated = getStoredOrders().map((o) =>
      o.id === order.id
        ? {
            ...o,
            paymentRecipientName: order.paymentRecipientName?.trim(),
            paymentRecipientClass: order.paymentRecipientClass?.trim(),
            paymentRecipientSection: order.paymentRecipientSection?.trim(),
          }
        : o
    );
    saveStoredOrders(updated);
    setOwnerOrders(updated);
    setSuccessMessage('Payment recipient saved.');
  };

  const handleOrderFieldChange = (orderId: string, field: string, val: string) => {
    setOwnerOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, [field]: val } : o))
    );
  };

  const handleOwnerNoteChange = (orderId: string, val: string) => {
    setOwnerOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ownerNote: val } : o))
    );
  };

  const saveOwnerNote = async (order: Order) => {
    setErrorMessage('');
    try {
      await updateOrderStatusInCloud(order.id, {
        status: order.status,
        paymentRecipientName: order.paymentRecipientName || '',
        paymentRecipientClass: order.paymentRecipientClass || '',
        paymentRecipientSection: order.paymentRecipientSection || '',
        ownerNote: (order.ownerNote || '').trim(),
      });
    } catch {}
    try {
      await ownerPost('/api/owner/orders/status', {
        id: order.id,
        status: order.status,
        paymentRecipientName: order.paymentRecipientName || '',
        paymentRecipientClass: order.paymentRecipientClass || '',
        paymentRecipientSection: order.paymentRecipientSection || '',
        ownerNote: (order.ownerNote || '').trim(),
      });
    } catch {}
    const updated = getStoredOrders().map((o) =>
      o.id === order.id ? { ...o, ownerNote: (order.ownerNote || '').trim() } : o
    );
    saveStoredOrders(updated);
    setOwnerOrders(updated);
    setSuccessMessage('Customer note saved.');
  };

  const deleteSuggestion = async (s: Suggestion) => {
    if (confirm('Delete this customer suggestion permanently? This cannot be undone.')) {
      setErrorMessage('');
      try {
        await deleteSuggestionFromCloud(s.id);
      } catch {}
      try {
        await ownerPost('/api/owner/suggestions/delete', { id: s.id });
      } catch {}
      setOwnerSuggestions((prev) => prev.filter((item) => item.id !== s.id));
      setSuccessMessage('Suggestion deleted.');
    }
  };

  const deleteOldOrder = async (order: Order) => {
    const statusLower = (order.status || '').trim().toLowerCase();
    const canDelete = ['completed', 'complete', 'delivered', 'collected', 'cancelled'].includes(statusLower);
    if (!canDelete) {
      setErrorMessage('Only completed, delivered, collected, or cancelled orders can be deleted.');
      return;
    }

    const orderRef = order.orderNumber || order.id.slice(0, 8);
    if (
      !confirm(
        `Delete finished order ${orderRef} for ${order.name}? This cannot be undone.`
      )
    ) {
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    let cloudDeleted = false;
    let backendDeleted = false;
    let cloudError: any = null;
    let backendError: any = null;

    // 1. Delete permanently from Cloud Firestore (the primary shared database)
    try {
      await deleteOrderFromCloud(order.id);
      cloudDeleted = true;
    } catch (err) {
      cloudError = err;
      console.error('Failed to delete order from Cloud Firestore:', err);
    }

    // 2. Delete permanently from server storage
    try {
      const res = await ownerPost('/api/owner/orders/delete', { id: order.id });
      if (res.data?.success) {
        backendDeleted = true;
      }
    } catch (err) {
      backendError = err;
      console.warn('Failed to delete order from backend server:', err);
    }

    // Requirement 6: Handle database errors properly.
    // Do not show a successful deletion message unless the database confirms the deletion.
    if (!cloudDeleted && !backendDeleted) {
      setLoading(false);
      const errMsg =
        cloudError instanceof Error
          ? cloudError.message
          : backendError instanceof Error
          ? backendError.message
          : 'Could not delete order from the shared database. Please check your connection and try again.';
      setErrorMessage(`Database deletion failed: ${errMsg}`);
      return;
    }

    // 3. Immediately remove from local state
    setOwnerOrders((prev) => prev.filter((o) => o.id !== order.id));

    // 4. Immediately remove from local storage cache
    const updatedStored = getStoredOrders().filter((o) => o.id !== order.id);
    saveStoredOrders(updatedStored);

    // 5. Clean notification tracking
    try {
      const seenStatuses = getSeenOrderStatuses();
      if (seenStatuses[order.id]) {
        delete seenStatuses[order.id];
        saveSeenOrderStatuses(seenStatuses);
      }
      const seenOwner = getSeenOwnerOrderIds().filter((id) => id !== order.id);
      localStorage.setItem('toynest_seen_owner_order_ids', JSON.stringify(seenOwner));
    } catch {}

    setSuccessMessage(`Order ${orderRef} deleted permanently from the database.`);
    setLoading(false);
  };

  return (
    <div className="app-shell">
      {/* Top Header Bar */}
      <header className="topbar">
        <button
          className="menu-toggle"
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={isSideMenuOpen}
          style={{ position: 'relative' }}
          onClick={() => setIsSideMenuOpen(true)}
        >
          <Menu size={23} />
          {(hasOwnerOrderNotification || hasStatusUpdateNotification) && (
            <span
              className="blinking-green-dot"
              style={{ top: '4px', right: '4px' }}
              title="New updates"
            />
          )}
        </button>

        <button
          className="brand"
          onClick={() => {
            setPage('home');
            setCheckoutMode(null);
            setErrorMessage('');
          }}
        >
          <span className="brand-icon">
            <img
              className="brand-logo"
              src="/resources/toynest-logo.png"
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <Boxes size={23} />
          </span>
          <span>Playnix</span>
        </button>

        <div className="top-actions">
          {page !== 'owner' ? (
            <>
              <span className="open-label">
                <span className="dot"></span> Toy shop
              </span>
              <button
                className="owner-link"
                type="button"
                onClick={shareShop}
                title="Copy shop link"
              >
                <Share2 size={16} /> {copiedLink ? 'Copied link!' : 'Share shop'}
              </button>
              <button
                className="owner-link"
                style={{ position: 'relative' }}
                onClick={() => {
                  setPage('myOrders');
                  setErrorMessage('');
                }}
              >
                <PackageCheck size={16} /> My Orders
                {hasStatusUpdateNotification && (
                  <span
                    className="blinking-green-dot"
                    title="Your active order is in progress!"
                    aria-label="Order status update notification"
                  />
                )}
              </button>
              <button
                className="owner-link"
                style={{ position: 'relative' }}
                onClick={handleOpenOwnerAccess}
              >
                <ShieldCheck size={16} /> Owner
                {hasOwnerOrderNotification && (
                  <span
                    className="blinking-green-dot"
                    title={`${ownerNewOrdersCount} new order request(s)!`}
                    aria-label="New order notification"
                  />
                )}
              </button>
            </>
          ) : (
            <div className="owner-topbar-actions">
              <button
                className="owner-link"
                type="button"
                onClick={() => {
                  setPage('home');
                  setOwnerPin('');
                  setIsOwnerMenuOpen(false);
                }}
              >
                Exit owner
              </button>
              <button
                className="owner-dots-btn"
                type="button"
                onClick={() => setIsOwnerMenuOpen(true)}
                title="Owner options menu (Shop Sections, Payment QR, Manage Colours)"
                aria-label="Owner options menu"
              >
                <MoreVertical size={20} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Side Navigation Menu */}
      {isSideMenuOpen && (
        <div className="side-menu-backdrop" onClick={() => setIsSideMenuOpen(false)}>
          <aside
            className="side-menu-panel"
            aria-label="Playnix navigation"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="side-menu-heading">
              <div className="side-menu-brand">
                <span className="brand-icon">
                  <Boxes size={21} />
                </span>
                <span>Playnix</span>
              </div>
              <button
                className="side-menu-close"
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setIsSideMenuOpen(false)}
              >
                <X size={21} />
              </button>
            </div>

            <div className="side-menu-links">
              <button
                type="button"
                onClick={() => {
                  setPage('home');
                  setCheckoutMode(null);
                  setErrorMessage('');
                  setIsSideMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <Boxes size={19} /> Home
              </button>
              <button
                type="button"
                onClick={() => {
                  setPage('suggestions');
                  setErrorMessage('');
                  setSuggestionSuccess('');
                  setIsSideMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <MessageSquare size={19} /> Suggestions?
              </button>
              <button
                type="button"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
                onClick={() => {
                  setPage('myOrders');
                  setErrorMessage('');
                  setIsSideMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PackageCheck size={19} /> My Orders
                </span>
                {hasStatusUpdateNotification && (
                  <span
                    className="blinking-green-dot-inline"
                    title="Active orders in progress"
                    aria-label="Active order notification"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={shareShop}
              >
                <Share2 size={19} /> {copiedLink ? 'Link copied!' : 'Share shop'}
              </button>
              <button
                type="button"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
                onClick={handleOpenOwnerAccess}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={19} /> Owner access
                </span>
                {hasOwnerOrderNotification && (
                  <span
                    className="blinking-green-dot-inline"
                    title={`${ownerNewOrdersCount || 'New'} order request(s)`}
                    aria-label="New order notification"
                  />
                )}
              </button>
            </div>

            <div className="side-menu-footer">
              A little joy for every day <span>✦</span>
            </div>
          </aside>
        </div>
      )}

      {/* Owner Right-Side Slide-Out Panel */}
      {page === 'owner' && isOwnerMenuOpen && (
        <div
          className="owner-panel-backdrop"
          onClick={() => setIsOwnerMenuOpen(false)}
          role="presentation"
        >
          <aside
            className="owner-panel-drawer"
            aria-label="Owner Settings and Options"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="owner-panel-header">
              <div className="owner-panel-title">
                <span className="owner-panel-icon">
                  <ShieldCheck size={20} />
                </span>
                <div>
                  <h3>Owner Menu</h3>
                  <small>Configuration & Tools</small>
                </div>
              </div>
              <button
                className="owner-panel-close-btn"
                type="button"
                onClick={() => setIsOwnerMenuOpen(false)}
                aria-label="Close owner panel"
              >
                <X size={20} />
              </button>
            </div>

            <div className="owner-panel-content">
              <span className="owner-panel-section-label">STORE CONFIGURATION</span>

              <div className="owner-panel-items">
                {/* 1. Shop Sections */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'sections' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('sections');
                    loadShopModes();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon">
                    <Layers size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Shop Sections</strong>
                    <span>Adult & Child section visibility</span>
                  </div>
                  {ownerTab === 'sections' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {adultPublished && childPublished
                        ? 'Both on'
                        : adultPublished
                        ? 'Adult'
                        : childPublished
                        ? 'Child'
                        : 'Draft'}
                    </span>
                  )}
                </button>

                {/* 2. Payment QR */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'payment' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('payment');
                    loadPaymentQr();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon">
                    <QrCode size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Payment QR</strong>
                    <span>UPI QR code for adult orders</span>
                  </div>
                  {ownerTab === 'payment' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {paymentQrUrl ? 'Uploaded' : 'Not set'}
                    </span>
                  )}
                </button>

                {/* 3. Manage Colours */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'colours' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('colours');
                    loadColours();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon">
                    <Palette size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Manage Colours</strong>
                    <span>Toy color choices for orders</span>
                  </div>
                  {ownerTab === 'colours' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {availableColours.length} colours
                    </span>
                  )}
                </button>
              </div>

              <div className="owner-panel-divider" />

              <span className="owner-panel-section-label">MAIN DASHBOARD</span>
              <div className="owner-panel-quick-nav">
                <button
                  type="button"
                  className={`owner-quick-btn ${ownerTab === 'products' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('products');
                    setIsOwnerMenuOpen(false);
                  }}
                >
                  <Store size={15} /> Products ({products.filter((p) => p.available !== false).length})
                </button>
                <button
                  type="button"
                  className={`owner-quick-btn ${ownerTab === 'drafts' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('drafts');
                    setIsOwnerMenuOpen(false);
                  }}
                >
                  <FileText size={15} /> Drafts ({products.filter((p) => p.available === false).length})
                </button>
                <button
                  type="button"
                  className={`owner-quick-btn ${ownerTab === 'orders' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('orders');
                    loadOwnerOrders();
                    setIsOwnerMenuOpen(false);
                  }}
                >
                  <PackageCheck size={15} /> Orders ({ownerOrders.length})
                </button>
                <button
                  type="button"
                  className={`owner-quick-btn ${ownerTab === 'suggestions' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('suggestions');
                    loadOwnerSuggestions();
                    setIsOwnerMenuOpen(false);
                  }}
                >
                  <MessageSquare size={15} /> Suggestions ({ownerSuggestions.length})
                </button>
                <button
                  type="button"
                  className={`owner-quick-btn ${ownerTab === 'rescueDeals' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('rescueDeals');
                    setIsOwnerMenuOpen(false);
                  }}
                >
                  <Flame size={15} /> Rescue Deals ({rescueDeals.length})
                </button>
              </div>
            </div>

            <div className="owner-panel-footer">
              <button
                type="button"
                className="owner-panel-exit-btn"
                onClick={() => {
                  setIsOwnerMenuOpen(false);
                  setPage('home');
                  setOwnerPin('');
                }}
              >
                Exit owner area
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Areas */}
      <main>
        {/* HOME VIEW: Shop unavailable if both sections draft */}
        {page === 'home' && !adultPublished && !childPublished && (
          <section className="mode-choice">
            <span className="eyebrow">WELCOME TO PLAYNIX</span>
            <h1>Shop temporarily unavailable</h1>
            <p>Please check back later.</p>
          </section>
        )}

        {/* HOME VIEW: Normal */}
        {page === 'home' && (adultPublished || childPublished) && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">LITTLE THINGS, BIG SMILES</span>
                <h1>
                  Find your next
                  <br />
                  <em>favourite toy.</em>
                </h1>
                <p>
                  Discover fun picks, check the price, and place your order in just a few steps.
                </p>
                <button
                  className="primary-btn"
                  onClick={() => {
                    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Explore toys <ArrowLeft className="arrow-down" size={17} />
                </button>
                <div className="hero-proof">
                  <span className="proof-icon">✦</span> A little joy for every day
                </div>
              </div>

              <div className="hero-art">
                <div className="sun-shape"></div>
                <div className="toy-emoji">🧸</div>
                <div className="floating-card card-one">
                  🚀 <span>Ready for fun?</span>
                </div>
                <div className="floating-card card-two">
                  ⭐ <span>Pick your favourite</span>
                </div>
                <div className="hero-caption">PLAY MORE. SMILE MORE.</div>
              </div>
            </section>

            {/* RESCUE DEALS SECTION: Available Single-Quantity Clearance & Special Offers */}
            {availableRescueDeals.length > 0 && (
              <section className="rescue-deals-section" id="rescue-deals">
                <div className="section-head rescue-head">
                  <div>
                    <span className="eyebrow rescue-eyebrow">⚡ LIMITED RESCUE DEALS</span>
                    <h2>
                      Rescue Deals <span className="rescue-counter">({availableRescueDeals.length} available)</span>
                    </h2>
                    <p>
                      Special single-quantity clearance pieces & open-box offers. Once claimed, they are instantly sold and removed!
                    </p>
                  </div>
                  <div className="rescue-pill-banner">
                    <Flame size={16} /> Only 1 of each · Instant claim
                  </div>
                </div>

                <div className="rescue-deals-grid">
                  {availableRescueDeals.map((deal) => {
                    const discountPct =
                      deal.originalPrice > deal.dealPrice
                        ? Math.round(((deal.originalPrice - deal.dealPrice) / deal.originalPrice) * 100)
                        : 0;

                    return (
                      <article className="rescue-card" key={deal.id}>
                        <div className="rescue-card-img-wrap">
                          <img
                            src={deal.imageUrl || (deal.imageUrls && deal.imageUrls[0]) || '/toys/toy-78291ec9-1.jpg'}
                            alt={deal.title}
                            loading="lazy"
                            decoding="async"
                            width={320}
                            height={200}
                          />
                          <span className="rescue-urgency-tag">
                            <Flame size={13} /> ONLY 1 LEFT
                          </span>
                          {discountPct > 0 && (
                            <span className="rescue-discount-bubble">
                              {discountPct}% OFF
                            </span>
                          )}
                        </div>

                        <div className="rescue-card-body">
                          <div className="rescue-card-meta">
                            <span className="rescue-condition-pill">{deal.condition || 'Special Rescue Deal'}</span>
                            {deal.colour && (
                              <span className="rescue-colour-pill">
                                <ColourDot colour={deal.colour} size={11} /> {deal.colour}
                              </span>
                            )}
                            <span className="rescue-claim-mode">Single Item</span>
                          </div>

                          <h3>{deal.title}</h3>
                          <p className="rescue-desc">
                            {deal.description || 'Special single-quantity rescue clearance offer.'}
                          </p>

                          <div className="rescue-bottom">
                            <div className="rescue-price-cluster">
                              {deal.originalPrice > deal.dealPrice && (
                                <del className="rescue-orig-price">{da(deal.originalPrice)}</del>
                              )}
                              <strong className="rescue-deal-price">{da(deal.dealPrice)}</strong>
                              {deal.originalPrice > deal.dealPrice && (
                                <span className="rescue-savings-text">
                                  Save {da(deal.originalPrice - deal.dealPrice)}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              className="rescue-claim-btn"
                              onClick={() => {
                                if (deal.claimed || deal.status === 'claimed') {
                                  setErrorMessage('This Rescue Deal has already been claimed by another customer.');
                                  return;
                                }
                                setSelectedDealForBuy(deal);
                                setSelectedProductForBuy(null);
                                setOrderQuantity(1);
                                setCheckoutMode(null);
                                setCheckoutForm({
                                  name: '',
                                  studentClass: '',
                                  section: '',
                                  phone: '',
                                  address: '',
                                  note: '',
                                  colour: deal.colour || '',
                                });
                                setErrorMessage('');
                                setPage('buy');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              <Flame size={15} /> Claim Deal
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="catalog" id="catalog">
              <div className="section-head">
                <div>
                  <span className="eyebrow">THE COLLECTION</span>
                  <h2>
                    Toy shelf <span>({products.filter((p) => p.available !== false).length})</span>
                  </h2>
                  <p>Pick a toy you love. The price is shown upfront.</p>
                </div>

                <div className="catalog-actions">
                  <div className="catalog-tag">
                    <ShoppingBag size={16} /> Easy ordering
                  </div>
                  <button
                    className="secondary-btn refresh-btn"
                    onClick={() => void refreshShop()}
                    disabled={isRefreshing}
                  >
                    <RefreshCw size={16} className={isRefreshing ? 'refresh-spinning' : ''} />
                    {isRefreshing ? 'Refreshing…' : 'Refresh shop'}
                  </button>
                </div>
              </div>

              <div className="category-filter">
                <label htmlFor="customer-category">Category</label>
                <select
                  id="customer-category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option>All categories</option>
                  {Array.from(
                    new Set(
                      products
                        .filter((p) => p.available !== false)
                        .map((p) => p.category || 'Other')
                    )
                  )
                    .sort()
                    .map((cat) => (
                      <option key={cat}>{cat}</option>
                    ))}
                </select>
              </div>

              {products.filter((p) => p.available !== false).length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🪁</div>
                  <h3>The toy shelf is waiting!</h3>
                  <p>New toys will appear here when the owner adds them.</p>
                  <button className="secondary-btn" onClick={() => setPage('ownerLogin')}>
                    Owner? Add your first toy
                  </button>
                </div>
              ) : (
                <div className="product-grid">
                  {products
                    .filter(
                      (p) =>
                        p.available !== false &&
                        (selectedCategory === 'All categories' ||
                          (p.category || 'Other') === selectedCategory)
                    )
                    .map((p, idx) => {
                      const count = (p.imageUrls && p.imageUrls.length) || (p.imageUrl ? 1 : 0);
                      const firstImg = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
                      const isAboveFold = idx < 2;
                      return (
                        <article className="product-card" key={p.id}>
                          <button
                            type="button"
                            className="product-image product-image-button"
                            aria-label={`View photos and details for ${p.name}`}
                            onClick={() => {
                              setGalleryProduct(p);
                              setGalleryImageIndex(0);
                            }}
                          >
                            {firstImg ? (
                              <img
                                src={firstImg}
                                alt={p.name}
                                loading={isAboveFold ? 'eager' : 'lazy'}
                                decoding={isAboveFold ? 'sync' : 'async'}
                                fetchPriority={isAboveFold ? 'high' : 'low'}
                                width={320}
                                height={220}
                              />
                            ) : (
                              <div className="placeholder-toy">🧸</div>
                            )}
                            <span className="product-badge">
                              {count > 1 ? `${count} PHOTOS · TAP TO VIEW` : 'TAP TO VIEW'}
                            </span>
                          </button>

                          <div className="product-info">
                            <span className="product-category">{p.category || 'Other'}</span>
                            <h3>{p.name}</h3>
                            <p className="product-desc">
                              {p.description || 'A fun new friend for playtime.'}
                            </p>
                            <div className="product-bottom">
                              <strong>{da(p.price)}</strong>
                              <button
                                className="buy-btn"
                                onClick={() => {
                                  setSelectedProductForBuy(p);
                                  setOrderQuantity(1);
                                  setCheckoutMode(null);
                                  setCheckoutForm({
                                    name: '',
                                    studentClass: '',
                                    section: '',
                                    phone: '',
                                    address: '',
                                    note: '',
                                    colour: '',
                                  });
                                  setErrorMessage('');
                                  setPage('buy');
                                }}
                              >
                                Buy now <ArrowLeft size={15} />
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                </div>
              )}
            </section>
          </>
        )}

        {/* SUGGESTIONS VIEW */}
        {page === 'suggestions' && (
          <section className="form-page suggestions-page">
            <button
              className="back-link"
              type="button"
              onClick={() => {
                setPage('home');
                setErrorMessage('');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <ArrowLeft size={16} /> Back to toys
            </button>

            <section className="suggestions-box" aria-label="Suggestions box">
              <h2>Suggestions box - Got any suggestions?</h2>
              <form className="suggestion-form" onSubmit={handleSuggestionSubmit}>
                <label htmlFor="customer-suggestion">Write your suggestion</label>
                <textarea
                  id="customer-suggestion"
                  value={customerSuggestion}
                  onChange={(e) => setCustomerSuggestion(e.target.value)}
                  placeholder="Tell us which toys you'd like to see…"
                  maxLength={1000}
                  rows={4}
                  required
                />
                <button className="primary-btn" type="submit" disabled={submittingSuggestion}>
                  {submittingSuggestion ? 'Sending…' : 'Send suggestion'}
                </button>
                {suggestionSuccess && <p className="success-msg">{suggestionSuccess}</p>}
                {errorMessage && page === 'suggestions' && (
                  <p className="error-msg">{errorMessage}</p>
                )}
              </form>
            </section>
          </section>
        )}

        {/* BUY / CHECKOUT VIEW */}
        {page === 'buy' && (selectedProductForBuy || selectedDealForBuy) && (
          <section className="form-page">
            <button
              className="back-link"
              onClick={() => {
                setPage('home');
                setErrorMessage('');
                setSelectedDealForBuy(null);
                setSelectedProductForBuy(null);
              }}
            >
              <ArrowLeft size={16} /> Back to shop
            </button>

            {checkoutMode ? (
              <div className="form-layout">
                {/* Order Summary */}
                <div className="order-summary">
                  {selectedDealForBuy ? (
                    <>
                      <span className="eyebrow rescue-eyebrow">⚡ RESCUE DEAL · LIMITED OFFER</span>
                      <div className="summary-image">
                        <img
                          src={selectedDealForBuy.imageUrl || '/toys/toy-78291ec9-1.jpg'}
                          alt={selectedDealForBuy.title}
                        />
                      </div>

                      <div style={{ marginBottom: '10px' }}>
                        <span className="rescue-condition-pill">{selectedDealForBuy.condition}</span>
                      </div>

                      <h2>{selectedDealForBuy.title}</h2>
                      <p>{selectedDealForBuy.description || 'Special single-quantity rescue clearance offer.'}</p>

                      {Boolean(selectedDealForBuy.claimed || selectedDealForBuy.status === 'claimed') && (
                        <div className="rescue-claimed-warning-box" role="alert">
                          <AlertCircle size={22} style={{ flexShrink: 0 }} />
                          <div>
                            <strong>No Longer Available</strong>
                            <p>This single-quantity Rescue Deal has already been claimed by another customer.</p>
                          </div>
                        </div>
                      )}

                      <div className="summary-price-box">
                        <div className="summary-price-breakdown">
                          {selectedDealForBuy.originalPrice > selectedDealForBuy.dealPrice && (
                            <div className="summary-breakdown-row">
                              <span>Regular price</span>
                              <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                                {da(selectedDealForBuy.originalPrice)}
                              </span>
                            </div>
                          )}
                          <div className="summary-breakdown-row">
                            <span>Special Rescue Price</span>
                            <span style={{ color: '#b45309', fontWeight: 800 }}>
                              {da(selectedDealForBuy.dealPrice)}
                            </span>
                          </div>
                          <div className="summary-breakdown-row">
                            <span>Quantity</span>
                            <span>1 toy (Single item offer)</span>
                          </div>
                        </div>
                        <div className="summary-price">
                          <span>Total Price</span>
                          <strong style={{ color: '#b45309' }}>{da(selectedDealForBuy.dealPrice)}</strong>
                        </div>
                      </div>
                    </>
                  ) : selectedProductForBuy ? (
                    <>
                      <span className="eyebrow">YOUR PICK</span>
                      <div className="summary-image summary-gallery">
                        {(selectedProductForBuy.imageUrls && selectedProductForBuy.imageUrls.length
                          ? selectedProductForBuy.imageUrls
                          : selectedProductForBuy.imageUrl
                          ? [selectedProductForBuy.imageUrl]
                          : []
                        ).length ? (
                          (selectedProductForBuy.imageUrls && selectedProductForBuy.imageUrls.length
                            ? selectedProductForBuy.imageUrls
                            : [selectedProductForBuy.imageUrl!]
                          ).map((url, idx) => (
                            <img key={url} src={url} alt={`${selectedProductForBuy.name} photo ${idx + 1}`} />
                          ))
                        ) : (
                          <span>🧸</span>
                        )}
                      </div>

                      {(selectedProductForBuy.imageUrls?.length || 0) > 1 && (
                        <p className="gallery-caption">
                          {selectedProductForBuy.imageUrls?.length} photos of this toy
                        </p>
                      )}

                      <h2>{selectedProductForBuy.name}</h2>
                      <p>{selectedProductForBuy.description || 'A little bundle of fun.'}</p>

                      <div className="summary-price-box">
                        {orderQuantity > 1 && (
                          <div className="summary-price-breakdown">
                            <div className="summary-breakdown-row">
                              <span>Unit price</span>
                              <span>{da(selectedProductForBuy.price)}</span>
                            </div>
                            <div className="summary-breakdown-row">
                              <span>Quantity</span>
                              <span>{orderQuantity} toys</span>
                            </div>
                          </div>
                        )}
                        <div className="summary-price">
                          <span>{orderQuantity > 1 ? 'Total Price' : 'Price'}</span>
                          <strong>{da(selectedProductForBuy.price * orderQuantity)}</strong>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="secure-note">
                    <ShieldCheck size={17} /> Your order details are only used to process your request.
                  </div>
                </div>

                {/* Form Details */}
                <form className="panel-form" onSubmit={handlePlaceOrder}>
                  <span className="eyebrow">ORDER DETAILS</span>
                  <h2>{selectedDealForBuy ? 'Claim Rescue Deal' : 'Make it yours.'}</h2>
                  <p className="form-subtitle">
                    {checkoutMode === 'Adult'
                      ? 'Enter your contact and delivery details to place the order.'
                      : 'Fill in your school details to place the order.'}
                  </p>

                  {/* Child Warning */}
                  {checkoutMode === 'Child' && (
                    <p className="child-eligibility-warning" role="note">
                      ⚠️ Child option is only available for BCS students.
                    </p>
                  )}

                  {/* Adult Warning */}
                  {checkoutMode === 'Adult' && (
                    <p className="child-eligibility-warning" role="note">
                      ⚠️ If you are BCS student please use child option
                    </p>
                  )}

                  {/* Quantity Handler: Fixed 1 for Rescue Deals, or 1-5 stepper for Regular Products */}
                  {selectedDealForBuy ? (
                    <div className="quantity-field-wrapper rescue-quantity-fixed">
                      <div className="quantity-field-header">
                        <span className="quantity-label">Quantity</span>
                        <span className="rescue-single-badge">⚡ Single-Quantity Deal</span>
                      </div>
                      <div className="rescue-quantity-callout">
                        <Sparkles size={16} /> This is a unique single unit. Once ordered, it is immediately sold out.
                      </div>
                    </div>
                  ) : selectedProductForBuy ? (
                    <div className="quantity-field-wrapper">
                      <div className="quantity-field-header">
                        <span className="quantity-label" id="quantity-control-label">
                          Quantity
                        </span>
                        <span className="quantity-badge">Limit: 1 – 5</span>
                      </div>

                      <div
                        className="quantity-selector-box"
                        role="group"
                        aria-labelledby="quantity-control-label"
                      >
                        <button
                          type="button"
                          className="quantity-stepper-btn minus"
                          onClick={() => setOrderQuantity((q) => Math.max(1, q - 1))}
                          disabled={orderQuantity <= 1}
                          aria-label="Decrease quantity"
                          title="Decrease quantity (minimum 1)"
                        >
                          <Minus size={18} strokeWidth={2.5} />
                        </button>

                        <div className="quantity-display" aria-live="polite">
                          <span className="quantity-num">{orderQuantity}</span>
                          <span className="quantity-unit">
                            {orderQuantity === 1 ? 'toy' : 'toys'}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="quantity-stepper-btn plus"
                          onClick={() => setOrderQuantity((q) => Math.min(5, q + 1))}
                          disabled={orderQuantity >= 5}
                          aria-label="Increase quantity"
                          title="Increase quantity (maximum 5)"
                        >
                          <Plus size={18} strokeWidth={2.5} />
                        </button>
                      </div>

                      {orderQuantity > 1 ? (
                        <div className="quantity-calc-hint">
                          {da(selectedProductForBuy.price)} × {orderQuantity} ={' '}
                          <strong>{da(selectedProductForBuy.price * orderQuantity)}</strong>
                        </div>
                      ) : (
                        <div className="quantity-calc-hint">
                          Unit price: <strong>{da(selectedProductForBuy.price)}</strong>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <label>
                    Your name
                    <input
                      value={checkoutForm.name}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, name: e.target.value })}
                      placeholder="Enter your full name"
                      required
                      maxLength={80}
                    />
                  </label>

                  {checkoutMode === 'Adult' ? (
                    <>
                      <label>
                        Phone number
                        <input
                          type="tel"
                          value={checkoutForm.phone}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, phone: e.target.value })
                          }
                          placeholder="Enter your phone number"
                          required
                          maxLength={20}
                          autoComplete="tel"
                        />
                      </label>
                      <label>
                        Delivery address
                        <textarea
                          value={checkoutForm.address}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, address: e.target.value })
                          }
                          placeholder="House/building, street, area, city and PIN code"
                          required
                          maxLength={300}
                          autoComplete="street-address"
                          rows={3}
                        />
                      </label>
                    </>
                  ) : (
                    <div className="two-fields">
                      <label>
                        Class
                        <select
                          value={checkoutForm.studentClass}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, studentClass: e.target.value })
                          }
                          required
                        >
                          <option value="">Choose class</option>
                          {['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map(
                            (c) => (
                              <option key={c}>{c}</option>
                            )
                          )}
                        </select>
                      </label>
                      <label>
                        Section
                        <input
                          value={checkoutForm.section}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, section: e.target.value })
                          }
                          placeholder="e.g. A"
                          required
                          maxLength={10}
                        />
                      </label>
                    </div>
                  )}

                  {/* Colour Selection: Locked for Rescue Deals, Interactive for regular items */}
                  {selectedDealForBuy ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '15px 0' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#454d41' }}>
                        Product Colour
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: '#fffdf5',
                          border: '1.5px solid #fde68a',
                          borderRadius: '10px',
                          color: '#1f2937',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ColourDot colour={selectedDealForBuy.colour || checkoutForm.colour || 'Standard'} size={15} />
                          <span>{selectedDealForBuy.colour || checkoutForm.colour || 'Standard / As Pictured'}</span>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#b45309',
                            background: '#fef3c7',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            border: '1px solid #fcd34d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          🔒 Fixed for this deal
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#78716c' }}>
                        Pre-selected by store · This single-piece rescue deal is only available in this colour and cannot be changed.
                      </span>
                    </div>
                  ) : (
                    availableColours.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '15px 0' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#454d41' }}>
                          Which colour?
                        </span>
                        <ColourSelectDropdown
                          value={checkoutForm.colour}
                          options={availableColours}
                          onChange={(c) =>
                            setCheckoutForm({ ...checkoutForm, colour: c })
                          }
                        />
                      </div>
                    )
                  )}

                  <label>
                    Note (optional)
                    <textarea
                      value={checkoutForm.note}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, note: e.target.value })}
                      placeholder="Any extra details?"
                      maxLength={250}
                    />
                  </label>

                  {errorMessage && <p className="error-msg">{errorMessage}</p>}

                  <button
                    className="primary-btn full-btn"
                    disabled={
                      loading ||
                      Boolean(selectedDealForBuy && (selectedDealForBuy.claimed || selectedDealForBuy.status === 'claimed'))
                    }
                  >
                    {loading ? (
                      'Securing order…'
                    ) : selectedDealForBuy ? (
                      selectedDealForBuy.claimed || selectedDealForBuy.status === 'claimed' ? (
                        'Offer Claimed by Another Shopper'
                      ) : (
                        <>
                          Claim & Place Order · {da(selectedDealForBuy.dealPrice)} <ArrowLeft size={16} />
                        </>
                      )
                    ) : selectedProductForBuy ? (
                      <>
                        Place order · {orderQuantity > 1 ? `${orderQuantity} toys · ` : ''}{da(selectedProductForBuy.price * orderQuantity)} <ArrowLeft size={16} />
                      </>
                    ) : (
                      'Place order'
                    )}
                  </button>

                  <p className="fine-print">
                    Ordering can take a while
                  </p>
                </form>
              </div>
            ) : (
              <section className="mode-choice checkout-mode-choice">
                <span className="eyebrow">CHECKOUT</span>
                <h2>ARE YOU -</h2>
                <p>Choose the order type to see the right details form.</p>
                {selectedDealForBuy && (selectedDealForBuy.claimed || selectedDealForBuy.status === 'claimed') && (
                  <div className="rescue-claimed-warning-box" style={{ maxWidth: '540px', margin: '0 auto 20px', textAlign: 'left' }}>
                    <AlertCircle size={22} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>This Rescue Deal has already been claimed!</strong>
                      <p>Another customer has already claimed this offer. Please choose another toy from the shop.</p>
                    </div>
                  </div>
                )}
                <div className="mode-choice-grid">
                  {adultPublished && (
                    <button
                      type="button"
                      className="mode-choice-card"
                      onClick={() => {
                        setCheckoutMode('Adult');
                        setErrorMessage('');
                      }}
                    >
                      <span>🛍️</span>
                      <strong>Adult</strong>
                      <small>Contact and delivery details</small>
                    </button>
                  )}
                  {childPublished && (
                    <button
                      type="button"
                      className="mode-choice-card"
                      onClick={() => {
                        setCheckoutMode('Child');
                        setErrorMessage('');
                      }}
                    >
                      <span>🧸</span>
                      <strong>Child</strong>
                      <small>Name, class and section</small>
                    </button>
                  )}
                  {!adultPublished && !childPublished && (
                    <p className="empty-state compact">Ordering is temporarily unavailable.</p>
                  )}
                </div>
              </section>
            )}
          </section>
        )}

        {/* MY ORDERS VIEW */}
        {page === 'myOrders' && (
          <section className="owner-dashboard customer-orders-page">
            <div className="dashboard-heading">
              <div>
                <span className="eyebrow">YOUR ORDER HISTORY</span>
                <h1>My Orders</h1>
                <p>All orders placed from this browser appear here automatically.</p>
              </div>
              <button
                className="secondary-btn"
                onClick={() => void loadMyOrders()}
                disabled={myOrdersLoading}
              >
                {myOrdersLoading ? 'Refreshing…' : 'Refresh orders'}
              </button>
            </div>

            {myOrdersError && <p className="error-msg">{myOrdersError}</p>}

            {myOrdersLoading && myOrders.length === 0 ? (
              <div className="empty-state compact">
                <h3>Loading your orders…</h3>
              </div>
            ) : myOrders.length === 0 ? (
              <div className="empty-state compact">
                <div className="empty-icon">📦</div>
                <h3>No orders yet</h3>
                <p>When you place an order from this browser, it will show up here automatically.</p>
                <button className="primary-btn" onClick={() => setPage('home')}>
                  Browse toys <ArrowLeft size={16} />
                </button>
              </div>
            ) : (
              <div className="orders-list">
                {myOrders.map((o) => (
                  <article
                    className={`order-card ${getOrderStatusClass(o.status)}`}
                    data-status={o.status}
                    key={o.id}
                  >
                    {o.productImageUrl && (
                      <div className="order-product-preview">
                        <img src={o.productImageUrl} alt={o.productName} loading="lazy" decoding="async" width={80} height={80} />
                      </div>
                    )}
                    <div className="order-top">
                      <div>
                        <span className="order-id">ORDER NUMBER · {o.orderNumber || o.id}</span>
                        <h3>
                          {o.productName}
                          {o.isRescueDeal && (
                            <span className="rescue-badge-order">
                              <Flame size={11} /> Rescue Deal
                            </span>
                          )}
                          {(o.quantity || 1) > 1 && (
                            <span className="order-qty-tag">× {o.quantity}</span>
                          )}
                        </h3>
                      </div>
                      <strong>{da(o.price)}</strong>
                    </div>

                    <div className="order-details">
                      <span>
                        <b>Status</b>
                        {o.status}
                      </span>
                      <span>
                        <b>Quantity</b>
                        {o.quantity || 1} {o.quantity && o.quantity > 1 ? 'items' : 'item'}
                        {o.quantity && o.quantity > 1 && (
                          <small style={{ display: 'block', color: '#78816f', fontSize: '10px' }}>
                            ({da(o.unitPrice || Math.round(o.price / o.quantity))} each)
                          </small>
                        )}
                      </span>
                      <span>
                        <b>Placed</b>
                        {new Date(o.createdAt).toLocaleDateString('en-IN')}
                      </span>
                      <span>
                        <b>Class</b>
                        {o.studentClass}
                      </span>
                      <span>
                        <b>Section</b>
                        {o.section}
                      </span>
                      {o.colour && (
                        <span>
                          <b>Colour</b>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <ColourDot colour={o.colour} size={13} />
                            <span>{o.colour}</span>
                          </span>
                        </span>
                      )}
                    </div>

                    {o.status === 'Confirmed' && (
                      <div className="order-status-highlight-badge status-confirmed">
                        <span className="dot-pulse green"></span> Order confirmed by owner
                      </div>
                    )}
                    {o.status === 'Dispatched' && (
                      <div className="order-status-highlight-badge status-dispatched">
                        <span className="dot-pulse blue"></span> Order dispatched & on the way!
                      </div>
                    )}

                    {o.ownerNote?.trim() && (
                      <div className="queue-status owner-customer-note">
                        <strong>Note from the owner</strong>
                        <p>{o.ownerNote}</p>
                      </div>
                    )}

                    {o.mode === 'Adult' && o.status === 'New' && (
                      <div className="queue-status payment-instruction adult-payment-instruction">
                        <strong>Payment required</strong>
                        <p>
                          Please pay {da(o.price)} using the QR code shown below to proceed with
                          your order.
                        </p>
                        {paymentQrUrl ? (
                          <img
                            className="payment-qr-image"
                            src={paymentQrUrl}
                            alt="Adult payment QR code"
                          />
                        ) : (
                          <p>The owner has not added a QR code yet.</p>
                        )}
                        <p>Before paying, verify the payment recipient and amount.</p>
                      </div>
                    )}

                    {o.mode === 'Adult' && o.status === 'Confirmed' && (
                      <div className="queue-status payment-instruction">
                        <strong>Your order has been confirmed and is being prepared.</strong>
                      </div>
                    )}

                    {o.status === 'Dispatched' && (
                      <div className="queue-status payment-instruction">
                        <strong>Your order is dispatched and will be delivered soon</strong>
                      </div>
                    )}

                    {o.status === 'Confirmed' && o.mode !== 'Adult' && (
                      <div className="queue-status payment-instruction">
                        <strong>Payment needed for preparation</strong>
                        {o.paymentRecipientName &&
                        o.paymentRecipientClass &&
                        o.paymentRecipientSection ? (
                          <p>
                            Please pay {da(o.price)} to <b>{o.paymentRecipientName}</b>, Class{' '}
                            <b>{o.paymentRecipientClass}</b>, Section{' '}
                            <b>{o.paymentRecipientSection}</b> for preparation of your order.
                          </p>
                        ) : (
                          <p>
                            Your order is confirmed. Payment recipient details will appear here when
                            the owner adds them.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Status & Queue tracking */}
                    {o.status === 'Cancelled' ? (
                      <div className="queue-status order-cancelled-status">
                        <strong>Order cancelled</strong>
                        <p>This order has been cancelled and is no longer in the active queue.</p>
                      </div>
                    ) : o.status === 'Completed' ? (
                      <div className="queue-status order-completed-status">
                        <strong>Order completed! 🎉</strong>
                        <p>Thank you for shopping with Playnix!</p>
                      </div>
                    ) : o.queuePosition !== null && o.queuePosition !== undefined && o.queuePosition > 0 ? (
                      <div className="queue-status">
                        <strong>
                          {o.peopleAhead === 0
                            ? 'You are next in line!'
                            : `${o.peopleAhead} people are ahead of you`}
                        </strong>
                        <p>
                          Your queue position is #{o.queuePosition}. Refresh to see the latest
                          status.
                        </p>
                      </div>
                    ) : (
                      <div className="queue-status">
                        <strong>
                          {o.status === 'New'
                            ? 'Order received & pending'
                            : o.status === 'Confirmed'
                            ? 'Order confirmed'
                            : o.status === 'Preparing'
                            ? 'Preparing your toy'
                            : o.status === 'Dispatched'
                            ? 'Order dispatched'
                            : `Status: ${o.status}`}
                        </strong>
                        <p>
                          {o.status === 'New'
                            ? 'Your order has been placed successfully and is waiting for owner confirmation.'
                            : o.status === 'Confirmed'
                            ? 'Your order is confirmed and scheduled for preparation.'
                            : o.status === 'Preparing'
                            ? 'Your order is being assembled and packed.'
                            : o.status === 'Dispatched'
                            ? 'Your toy is on the way!'
                            : 'Your order is active in the shop queue.'}
                        </p>
                      </div>
                    )}

                    {['completed', 'complete', 'delivered', 'collected', 'cancelled'].includes(
                      (o.status || '').trim().toLowerCase()
                    ) && (
                      <div className="customer-order-actions">
                        <button
                          type="button"
                          className="customer-delete-order-btn"
                          onClick={() => void handleDeleteCustomerOrder(o.id)}
                          disabled={deletingCustomerOrderId === o.id}
                          title="Delete this order from your order history"
                        >
                          <Trash2 size={13} />
                          {deletingCustomerOrderId === o.id ? 'Deleting…' : 'Delete order'}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <button className="back-link center-link" onClick={() => setPage('home')}>
              <ArrowLeft size={16} /> Back to shop
            </button>
            <p className="fine-print">
              Order history is linked to this browser on this device. Clearing browser data or using another device/browser may make these orders unavailable here.
            </p>
          </section>
        )}

        {/* OWNER LOGIN VIEW */}
        {page === 'ownerLogin' && (
          <section className="login-wrap">
            <div className="login-card">
              <div className="login-icon">
                <ShieldCheck size={26} />
              </div>
              <span className="eyebrow">PRIVATE AREA</span>
              <h1>Welcome, owner.</h1>
              <p>Enter your owner PIN to manage toys and customer orders.</p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyOwnerLogin();
                }}
              >
                <label>
                  Owner PIN
                  <input
                    type="password"
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value)}
                    placeholder="Enter your PIN"
                    required
                    autoComplete="current-password"
                  />
                </label>
                {errorMessage && <p className="error-msg">{errorMessage}</p>}
                <button className="primary-btn full-btn" disabled={loading}>
                  {loading ? 'Checking…' : 'Open dashboard'} <ArrowLeft size={16} />
                </button>
              </form>
              <button
                className="back-link center-link"
                onClick={() => {
                  setPage('home');
                  setErrorMessage('');
                }}
              >
                <ArrowLeft size={16} /> Back to shop
              </button>
            </div>
          </section>
        )}

        {/* OWNER DASHBOARD VIEW */}
        {page === 'owner' && (
          <section className="owner-dashboard">
            <div className="dashboard-heading">
              <div>
                <span className="eyebrow">OWNER WORKSPACE</span>
                <h1>Your dashboard.</h1>
                <p>Manage the toy shelf and keep track of orders.</p>
              </div>
              <div className="dashboard-heading-actions">
                <button
                  className="secondary-btn refresh-btn"
                  onClick={() => void refreshOwnerDashboard()}
                  disabled={isRefreshing}
                >
                  <RefreshCw size={16} className={isRefreshing ? 'refresh-spinning' : ''} />
                  {isRefreshing ? 'Refreshing…' : 'Refresh dashboard'}
                </button>
                <button
                  className="secondary-btn"
                  onClick={() => {
                    setPage('home');
                    setOwnerPin('');
                    setIsOwnerMenuOpen(false);
                  }}
                >
                  Exit owner area
                </button>
                <button
                  className="owner-dots-btn-inline"
                  type="button"
                  onClick={() => setIsOwnerMenuOpen(true)}
                  title="Owner options (Shop Sections, Payment QR, Manage Colours)"
                  aria-label="Owner options menu"
                >
                  <MoreVertical size={19} />
                </button>
              </div>
            </div>

            <div className="stats-row">
              <div
                className="stat-card stat-card-earned"
                onClick={() => {
                  setOwnerTab('orders');
                  setOrderStatusFilter('Completed');
                }}
                style={{ cursor: 'pointer' }}
                title="View completed & fulfilled orders"
              >
                <span>Total Money Earned</span>
                <strong style={{ color: '#273824' }}>{da(totalMoneyEarned)}</strong>
                <IndianRupee size={20} />
              </div>
              <div
                className="stat-card"
                onClick={() => setOwnerTab('products')}
                style={{ cursor: 'pointer' }}
                title="View live toys"
              >
                <span>Live toys</span>
                <strong>{products.filter((p) => p.available !== false).length}</strong>
                <Store size={20} />
              </div>
              <div
                className="stat-card"
                onClick={() => setOwnerTab('drafts')}
                style={{ cursor: 'pointer' }}
                title="View draft products"
              >
                <span>Draft products</span>
                <strong>{products.filter((p) => p.available === false).length}</strong>
                <FileText size={20} />
              </div>
              <div
                className="stat-card"
                onClick={() => setOwnerTab('orders')}
                style={{ cursor: 'pointer' }}
                title="View orders"
              >
                <span>Total orders</span>
                <strong>{ownerOrders.length}</strong>
                <PackageCheck size={20} />
              </div>
              <div
                className="stat-card"
                onClick={() => setOwnerTab('orders')}
                style={{ cursor: 'pointer' }}
                title="View orders needing follow-up"
              >
                <span>To follow up</span>
                <strong>{ownerOrders.filter((o) => o.status === 'New').length}</strong>
                <Store size={20} />
              </div>
            </div>

            <div className="dashboard-tabs">
              <button
                className={ownerTab === 'products' ? 'active' : ''}
                onClick={() => setOwnerTab('products')}
              >
                Products ({products.filter((p) => p.available !== false).length})
              </button>
              <button
                className={ownerTab === 'drafts' ? 'active' : ''}
                onClick={() => setOwnerTab('drafts')}
              >
                Drafts ({products.filter((p) => p.available === false).length})
              </button>
              <button
                className={ownerTab === 'orders' ? 'active' : ''}
                style={{ position: 'relative' }}
                onClick={() => {
                  setOwnerTab('orders');
                  loadOwnerOrders();
                }}
              >
                Orders ({ownerOrders.length})
                {hasOwnerOrderNotification && (
                  <span
                    className="blinking-green-dot"
                    style={{ top: '6px', right: '8px' }}
                    title="New order request received!"
                  />
                )}
              </button>
              <button
                className={ownerTab === 'suggestions' ? 'active' : ''}
                onClick={() => {
                  setOwnerTab('suggestions');
                  loadOwnerSuggestions();
                }}
              >
                Suggestions ({ownerSuggestions.length})
              </button>
              <button
                className={ownerTab === 'rescueDeals' ? 'active' : ''}
                onClick={() => {
                  setOwnerTab('rescueDeals');
                }}
              >
                ⚡ Rescue Deals ({rescueDeals.length})
              </button>
              {(ownerTab === 'sections' || ownerTab === 'payment' || ownerTab === 'colours') && (
                <button
                  className="active panel-active-tab-indicator"
                  type="button"
                  onClick={() => setIsOwnerMenuOpen(true)}
                  title="Active section opened from Owner Menu (Tap to change)"
                >
                  {ownerTab === 'sections' && '⚙️ Shop Sections'}
                  {ownerTab === 'payment' && '💳 Payment QR'}
                  {ownerTab === 'colours' && '🎨 Manage Colours'}
                </button>
              )}
            </div>

            {successMessage && <p className="success-msg">{successMessage}</p>}
            {errorMessage && <p className="error-msg">{errorMessage}</p>}

            {/* SECTIONS TAB */}
            {ownerTab === 'sections' && (
              <div className="panel-form add-form">
                <span className="eyebrow">CUSTOMER VISIBILITY</span>
                <h2>Adult and Child sections</h2>
                <p>
                  Keep a section in Draft to hide it from the customer home screen without deleting its settings, products, or order history.
                </p>
                <label className="section-publish-row">
                  <input
                    type="checkbox"
                    checked={adultPublished}
                    onChange={(e) => setAdultPublished(e.target.checked)}
                  />
                  <span>
                    <strong>Adult section</strong>
                    <small>
                      {adultPublished ? 'Published — customers can open it' : 'Draft — hidden from customers'}
                    </small>
                  </span>
                </label>
                <label className="section-publish-row">
                  <input
                    type="checkbox"
                    checked={childPublished}
                    onChange={(e) => setChildPublished(e.target.checked)}
                  />
                  <span>
                    <strong>Child section</strong>
                    <small>
                      {childPublished ? 'Published — customers can open it' : 'Draft — hidden from customers'}
                    </small>
                  </span>
                </label>
                {!adultPublished && !childPublished && (
                  <p className="fine-print">
                    Both sections are in Draft. Customers will see a temporary-unavailable message.
                  </p>
                )}
                <button
                  className="primary-btn full-btn"
                  disabled={loading}
                  onClick={() => void saveShopModes()}
                >
                  {loading ? 'Saving…' : 'Save section settings'}
                </button>
              </div>
            )}

            {/* PRODUCTS TAB */}
            {ownerTab === 'products' && (
              <div className="manage-layout">
                <form
                  className="panel-form add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSaveProduct(false);
                  }}
                >
                  <span className="eyebrow">
                    {editingProductId
                      ? `UPDATE LISTING · ${editingProduct?.available === false ? 'DRAFT' : 'PUBLISHED'}`
                      : 'NEW ARRIVAL'}
                  </span>
                  <h2>{editingProductId ? 'Edit toy details' : 'Add a toy'}</h2>
                  {editingProduct && (
                    <div
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        marginBottom: '12px',
                        background: editingProduct.available === false ? '#fef3c7' : '#ecfdf5',
                        color: editingProduct.available === false ? '#92400e' : '#065f46',
                        border: `1px solid ${editingProduct.available === false ? '#fde68a' : '#a7f3d0'}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {editingProduct.available === false
                        ? '📝 Currently saved as draft (hidden from customers)'
                        : '✓ Currently published and visible in shop'}
                    </div>
                  )}
                  <label>
                    Toy name
                    <input
                      value={productForm.name}
                      onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                      placeholder="e.g. Mini race car"
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Price (₹)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                      placeholder="e.g. 150"
                      required
                    />
                  </label>
                  <label>
                    Category
                    <input
                      value={productForm.category}
                      onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                      placeholder="e.g. Cars, Dolls, Puzzles"
                      maxLength={50}
                    />
                    <small>Leave blank to use the Other category.</small>
                  </label>
                  <label>
                    Description (optional)
                    <textarea
                      value={productForm.description}
                      onChange={(e) =>
                        setProductForm({ ...productForm, description: e.target.value })
                      }
                      placeholder="Tell customers about the toy"
                      maxLength={250}
                    />
                  </label>

                  {/* PHOTO MANAGEMENT (ADD & REMOVE PICTURES) */}
                  {editingProductId ? (
                    <div
                      className="edit-photos-manager"
                      style={{
                        margin: '18px 0',
                        padding: '15px',
                        background: '#f8faf3',
                        borderRadius: '12px',
                        border: '1px solid #dce4d0',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '12px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            color: '#273824',
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                          }}
                        >
                          Toy Pictures ({editExistingImages.length + productImages.length}/5)
                        </span>
                        <small style={{ color: '#687462', fontSize: '11px', fontWeight: 600 }}>
                          Up to 5 pictures total
                        </small>
                      </div>

                      {/* 1. Existing saved pictures with remove option */}
                      {editExistingImages.length > 0 && (
                        <div style={{ marginBottom: '14px' }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#465440',
                              marginBottom: '8px',
                            }}
                          >
                            Current photos ({editExistingImages.length}) — tap ✕ to remove:
                          </span>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {editExistingImages.map((imgUrl, idx) => (
                              <div
                                key={`existing-${idx}-${imgUrl}`}
                                style={{
                                  position: 'relative',
                                  width: '74px',
                                  height: '74px',
                                  borderRadius: '10px',
                                  overflow: 'hidden',
                                  border: idx === 0 ? '2px solid #58733d' : '1px solid #d5dbc9',
                                  background: '#fff',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                                }}
                              >
                                <img
                                  src={imgUrl}
                                  alt={`Current picture ${idx + 1}`}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: '0',
                                    left: '0',
                                    right: '0',
                                    background: idx === 0 ? '#3f592a' : 'rgba(25,35,20,0.75)',
                                    color: '#fff',
                                    fontSize: '9px',
                                    textAlign: 'center',
                                    padding: '1px 0',
                                    fontWeight: 700,
                                  }}
                                >
                                  {idx === 0 ? 'Cover' : `#${idx + 1}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditExistingImages((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    );
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top: '3px',
                                    right: '3px',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    border: '1.5px solid #fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                                  }}
                                  title="Remove this photo"
                                  aria-label={`Remove photo ${idx + 1}`}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {editExistingImages.length === 0 && (
                        <p
                          style={{
                            fontSize: '12px',
                            color: '#b45309',
                            margin: '4px 0 12px 0',
                            fontWeight: 600,
                          }}
                        >
                          ⚠️ All previous pictures removed. Add at least 1 new photo below, or a default toy picture will be used.
                        </p>
                      )}

                      {/* 2. Newly added pictures with remove option */}
                      {productImages.length > 0 && (
                        <div style={{ marginBottom: '14px' }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#275225',
                              marginBottom: '8px',
                            }}
                          >
                            Newly added photos ({productImages.length}) — tap ✕ to remove:
                          </span>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {productImages.map((f, idx) => {
                              const previewUrl = URL.createObjectURL(f);
                              return (
                                <div
                                  key={`new-${f.name}-${idx}`}
                                  style={{
                                    position: 'relative',
                                    width: '74px',
                                    height: '74px',
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    border: '2px dashed #628741',
                                    background: '#fff',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                                  }}
                                >
                                  <img
                                    src={previewUrl}
                                    alt={`New preview ${idx + 1}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onLoad={() => URL.revokeObjectURL(previewUrl)}
                                  />
                                  <span
                                    style={{
                                      position: 'absolute',
                                      bottom: '0',
                                      left: '0',
                                      right: '0',
                                      background: '#3a5929',
                                      color: '#fff',
                                      fontSize: '9px',
                                      textAlign: 'center',
                                      padding: '1px 0',
                                      fontWeight: 700,
                                    }}
                                  >
                                    + New
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setProductImages((prev) => prev.filter((_, i) => i !== idx));
                                    }}
                                    style={{
                                      position: 'absolute',
                                      top: '3px',
                                      right: '3px',
                                      width: '22px',
                                      height: '22px',
                                      borderRadius: '50%',
                                      background: '#dc2626',
                                      color: '#ffffff',
                                      border: '1.5px solid #fff',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '11px',
                                      fontWeight: 'bold',
                                      boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                                    }}
                                    title="Remove this new photo"
                                    aria-label="Remove new photo"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 3. Add more pictures button if under 5 total */}
                      {editExistingImages.length + productImages.length < 5 ? (
                        <label className="upload-box" style={{ cursor: 'pointer', marginTop: '6px' }}>
                          <span className="upload-symbol">＋</span>
                          <strong>
                            Add pictures (can add {5 - (editExistingImages.length + productImages.length)} more)
                          </strong>
                          <small>Pick from camera or gallery · Auto-optimized for quick upload</small>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/*"
                            multiple
                            onChange={async (e) => {
                              const rawFiles = Array.from(e.target.files || []);
                              if (rawFiles.length === 0) return;
                              setLoading(true);
                              setErrorMessage('');
                              try {
                                const compressed = await Promise.all(rawFiles.map((f) => compressImageFile(f)));
                                const currentTotal = editExistingImages.length + productImages.length;
                                const availableSlots = 5 - currentTotal;
                                if (availableSlots <= 0) {
                                  setErrorMessage('Maximum 5 pictures allowed.');
                                  return;
                                }
                                const toAdd = compressed.slice(0, availableSlots);
                                if (compressed.length > availableSlots) {
                                  setErrorMessage(
                                    `Only added ${availableSlots} picture(s) to stay within the 5-picture limit.`
                                  );
                                }
                                setProductImages((prev) => [...prev, ...toAdd]);
                              } catch {
                                setErrorMessage('Could not process selected image(s).');
                              } finally {
                                setLoading(false);
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                        </label>
                      ) : (
                        <p style={{ fontSize: '12px', color: '#4d5d47', margin: '6px 0 0', fontWeight: 600 }}>
                          ✓ Maximum 5 photos selected. Remove any photo above if you want to add another.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="upload-box-wrapper" style={{ margin: '14px 0' }}>
                      <label className="upload-box" style={{ cursor: 'pointer' }}>
                        <span className="upload-symbol">＋</span>
                        <strong>
                          {productImages.length
                            ? `${productImages.length}/5 photos chosen — tap to add more`
                            : 'Choose toy pictures (up to 5)'}
                        </strong>
                        <small>Any phone camera or gallery photo · Auto-optimized for instant upload</small>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/*"
                          multiple
                          onChange={async (e) => {
                            const rawFiles = Array.from(e.target.files || []);
                            if (rawFiles.length === 0) return;
                            setLoading(true);
                            setErrorMessage('');
                            try {
                              const compressed = await Promise.all(rawFiles.map((f) => compressImageFile(f)));
                              const merged = [...productImages];
                              for (const f of compressed) {
                                if (!merged.some((m) => m.name === f.name && m.size === f.size)) {
                                  merged.push(f);
                                }
                              }
                              if (merged.length > 5) {
                                setErrorMessage('Please choose no more than 5 photos in total.');
                                setProductImages(merged.slice(0, 5));
                              } else {
                                setProductImages(merged);
                              }
                            } catch {
                              setErrorMessage('Could not process selected image(s).');
                            } finally {
                              setLoading(false);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </label>

                      {productImages.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '10px',
                            flexWrap: 'wrap',
                            marginTop: '10px',
                            padding: '10px',
                            background: '#f7f8f2',
                            borderRadius: '10px',
                            border: '1px solid #e2e6d6',
                          }}
                        >
                          {productImages.map((f, idx) => {
                            const previewUrl = URL.createObjectURL(f);
                            return (
                              <div
                                key={`${f.name}-${idx}`}
                                style={{
                                  position: 'relative',
                                  width: '64px',
                                  height: '64px',
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  border: '1px solid #ced5c2',
                                  background: '#fff',
                                }}
                              >
                                <img
                                  src={previewUrl}
                                  alt={`Preview ${idx + 1}`}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onLoad={() => URL.revokeObjectURL(previewUrl)}
                                />
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: '0',
                                    left: '0',
                                    right: '0',
                                    background: 'rgba(20,25,18,0.75)',
                                    color: '#fff',
                                    fontSize: '9px',
                                    textAlign: 'center',
                                    padding: '1px 0',
                                    fontWeight: 700,
                                  }}
                                >
                                  {idx === 0 ? 'Cover' : `#${idx + 1}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    setProductImages((prev) => prev.filter((_, i) => i !== idx));
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    background: '#dc2626',
                                    color: '#fff',
                                    border: '1.5px solid #fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    lineHeight: 1,
                                  }}
                                  title="Remove this photo"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="product-save-actions">
                    <button
                      type="button"
                      className="primary-btn full-btn"
                      disabled={loading}
                      onClick={() => void handleSaveProduct(false)}
                    >
                      {loading
                        ? 'Saving…'
                        : editingProductId
                        ? editingProduct?.available === false
                          ? 'Publish to shop'
                          : 'Save changes (published)'
                        : 'Publish product'}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn full-btn"
                      disabled={loading}
                      onClick={() => void handleSaveProduct(true)}
                    >
                      {loading
                        ? 'Saving…'
                        : editingProductId
                        ? editingProduct?.available === false
                          ? 'Save changes as draft'
                          : 'Move to drafts'
                        : 'Save as draft'}
                    </button>
                  </div>

                  {editingProductId && (
                    <button
                      type="button"
                      className="secondary-btn full-btn"
                      onClick={cancelEditProduct}
                    >
                      Cancel editing
                    </button>
                  )}
                </form>

                <div className="manage-products">
                  <div className="manage-title">
                    <h2>Your toys</h2>
                    <span>
                      {products.filter((p) => p.available !== false).length} published ·{' '}
                      {products.filter((p) => p.available === false).length} drafts
                    </span>
                  </div>

                  <div className="filter-pills">
                    <button
                      type="button"
                      className={`filter-pill ${productFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setProductFilter('all')}
                    >
                      All ({products.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${productFilter === 'published' ? 'active' : ''}`}
                      onClick={() => setProductFilter('published')}
                    >
                      Published ({products.filter((p) => p.available !== false).length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${productFilter === 'drafts' ? 'active' : ''}`}
                      onClick={() => setProductFilter('drafts')}
                    >
                      Drafts ({products.filter((p) => p.available === false).length})
                    </button>
                  </div>

                  {products.filter((p) => {
                    if (productFilter === 'published') return p.available !== false;
                    if (productFilter === 'drafts') return p.available === false;
                    return true;
                  }).length === 0 ? (
                    <div className="mini-empty">
                      {productFilter === 'drafts'
                        ? 'No toys currently in draft.'
                        : 'Your products will appear here.'}
                    </div>
                  ) : (
                    products
                      .filter((p) => {
                        if (productFilter === 'published') return p.available !== false;
                        if (productFilter === 'drafts') return p.available === false;
                        return true;
                      })
                      .map((p) => {
                        const firstImg = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
                        return (
                          <div className="manage-item" key={p.id}>
                            <div className="manage-thumb">
                              {firstImg ? <img src={firstImg} alt="" /> : '🧸'}
                            </div>
                            <div className="manage-item-text">
                              <strong>{p.name}</strong>
                              <span>
                                {da(p.price)} · {p.category || 'Other'}
                              </span>
                              <span
                                className={
                                  p.available === false
                                    ? 'product-status draft-status'
                                    : 'product-status published-status'
                                }
                              >
                                {p.available === false
                                  ? 'Draft · hidden from customers'
                                  : 'Published · visible to customers'}
                              </span>
                            </div>
                            <button
                              className="secondary-btn product-visibility-btn"
                              onClick={() => void toggleProductVisibility(p)}
                            >
                              {p.available === false ? 'Publish' : 'Unpublish'}
                            </button>
                            <button
                              className="icon-btn"
                              aria-label={`Edit ${p.name}`}
                              title="Edit toy details"
                              onClick={() => startEditProduct(p)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-btn danger"
                              aria-label={`Delete ${p.name}`}
                              onClick={() => void deleteProduct(p.id)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}

            {/* DRAFTS TAB - DEDICATED SEPARATE SECTION FOR DRAFT PRODUCTS */}
            {ownerTab === 'drafts' && (
              <div className="drafts-section">
                <div className="drafts-section-header">
                  <div>
                    <span className="eyebrow">UNPUBLISHED ITEMS</span>
                    <h2>Draft Products ({products.filter((p) => p.available === false).length})</h2>
                    <p>
                      These toys are saved as drafts and hidden from customers.
                      You can review, edit details, or publish them to make them live in your shop.
                    </p>
                  </div>
                  <button
                    className="primary-btn"
                    onClick={() => {
                      setEditingProductId(null);
                      setProductForm({ name: '', price: '', description: '', category: '' });
                      setProductImages([]);
                      setOwnerTab('products');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    + Add new toy
                  </button>
                </div>

                {products.filter((p) => p.available === false).length === 0 ? (
                  <div className="empty-state" style={{ margin: '20px 0' }}>
                    <div className="empty-icon">📝</div>
                    <h3>No products in draft</h3>
                    <p>
                      All your toys are currently live in the shop! When you create a toy and click
                      &quot;Save as draft&quot; or unpublish a live toy, it will appear in this dedicated section.
                    </p>
                    <button
                      className="secondary-btn"
                      onClick={() => setOwnerTab('products')}
                    >
                      Go to Products
                    </button>
                  </div>
                ) : (
                  <div className="draft-products-grid">
                    {products
                      .filter((p) => p.available === false)
                      .map((p) => {
                        const firstImg = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
                        return (
                          <div className="draft-card" key={p.id}>
                            <div className="draft-card-image">
                              {firstImg ? (
                                <img src={firstImg} alt={p.name} />
                              ) : (
                                <span style={{ fontSize: '60px' }}>🧸</span>
                              )}
                              <span className="draft-badge-pill">Draft</span>
                            </div>
                            <div className="draft-card-content">
                              <span className="draft-category">{p.category || 'Other'}</span>
                              <h3>{p.name}</h3>
                              {p.description && <p className="draft-desc">{p.description}</p>}
                              <strong className="draft-price">{da(p.price)}</strong>
                              <div className="draft-card-actions">
                                <button
                                  className="primary-btn publish-now-btn"
                                  onClick={() => void toggleProductVisibility(p)}
                                  title="Make this toy visible to all customers"
                                >
                                  Publish to shop
                                </button>
                                <button
                                  className="secondary-btn"
                                  onClick={() => {
                                    startEditProduct(p);
                                    setOwnerTab('products');
                                  }}
                                  title="Edit toy details"
                                >
                                  <Pencil size={15} /> Edit
                                </button>
                                <button
                                  className="icon-btn danger"
                                  onClick={() => void deleteProduct(p.id)}
                                  title="Delete draft"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* ORDERS TAB */}
            {ownerTab === 'orders' && (
              <>
                <div className="orders-toolbar">
                  <div className="dashboard-tabs order-filters">
                    <button
                      className={orderStatusFilter === 'Pending' ? 'active' : ''}
                      onClick={() => setOrderStatusFilter('Pending')}
                    >
                      Pending (
                      {
                        ownerOrders.filter(
                          (o) => !['Completed', 'Delivered', 'Collected', 'Cancelled'].includes(o.status)
                        ).length
                      }
                      )
                    </button>
                    <button
                      className={orderStatusFilter === 'Completed' ? 'active' : ''}
                      onClick={() => setOrderStatusFilter('Completed')}
                    >
                      Completed ({ownerOrders.filter((o) => ['Completed', 'Delivered', 'Collected'].includes(o.status)).length})
                    </button>
                    <button
                      className={orderStatusFilter === 'Cancelled' ? 'active' : ''}
                      onClick={() => setOrderStatusFilter('Cancelled')}
                    >
                      Cancelled ({ownerOrders.filter((o) => o.status === 'Cancelled').length})
                    </button>
                  </div>

                  <div className="orders-search-wrapper">
                    <Search size={16} className="orders-search-icon" aria-hidden="true" />
                    <input
                      type="text"
                      className="orders-search-input"
                      value={orderSearchQuery}
                      onChange={(e) => setOrderSearchQuery(e.target.value)}
                      placeholder="Search customer or product name…"
                      aria-label="Filter orders by customer name or product name"
                    />
                    {orderSearchQuery && (
                      <button
                        type="button"
                        className="orders-search-clear"
                        onClick={() => setOrderSearchQuery('')}
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {orderSearchQuery.trim() && (
                  <div className="orders-search-feedback">
                    <span>
                      Found <strong>{filteredOwnerOrders.length}</strong> {filteredOwnerOrders.length === 1 ? 'order' : 'orders'} matching &ldquo;{orderSearchQuery.trim()}&rdquo; in {orderStatusFilter}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOrderSearchQuery('')}
                      className="orders-search-feedback-clear"
                    >
                      Clear search
                    </button>
                  </div>
                )}

                {orderStatusFilter === 'Completed' && (
                  <div
                    style={{
                      background: '#f4f6ec',
                      border: '1px solid #dfe5cd',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      marginBottom: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IndianRupee size={18} style={{ color: '#4f6937' }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#2f3d24' }}>
                        Total Money Earned from Fulfilled Orders:
                      </span>
                    </div>
                    <strong style={{ fontSize: '17px', color: '#273824', fontFamily: 'Manrope, sans-serif' }}>
                      {da(totalMoneyEarned)}
                    </strong>
                  </div>
                )}

                <div className="orders-list">
                  {filteredOwnerOrders.length === 0 ? (
                    <div className="empty-state compact">
                      <div className="empty-icon">{orderSearchQuery.trim() ? '🔍' : '📦'}</div>
                      <h3>
                        {orderSearchQuery.trim()
                          ? `No orders matching "${orderSearchQuery.trim()}"`
                          : orderStatusFilter === 'Pending'
                          ? 'No pending orders'
                          : `No ${orderStatusFilter.toLowerCase()} orders`}
                      </h3>
                      <p>
                        {orderSearchQuery.trim()
                          ? `We couldn't find any orders matching this customer name or product name in the ${orderStatusFilter} tab.`
                          : 'Orders will appear here when their status matches this section.'}
                      </p>
                      {orderSearchQuery.trim() && (
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{ marginTop: '10px' }}
                          onClick={() => setOrderSearchQuery('')}
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredOwnerOrders.map((o) => (
                        <article
                          className={`order-card ${getOrderStatusClass(o.status)}`}
                          data-status={o.status}
                          key={o.id}
                        >
                          {o.productImageUrl && (
                            <div className="order-product-preview">
                              <img src={o.productImageUrl} alt={o.productName} />
                            </div>
                          )}
                          <div className="order-mode-label">{o.mode || 'Child'} order</div>
                          <div className="order-top">
                            <div>
                              <span className="order-id">ORDER · {o.orderNumber || o.id.slice(0, 8)}</span>
                              <h3>
                                {o.productName}
                                {o.isRescueDeal && (
                                  <span className="rescue-badge-order">
                                    <Flame size={11} /> Rescue Deal
                                  </span>
                                )}
                                {(o.quantity || 1) > 1 && (
                                  <span className="order-qty-tag">Qty: {o.quantity}</span>
                                )}
                              </h3>
                            </div>
                            <strong>{da(o.price)}</strong>
                          </div>

                          <div className="order-details">
                            <span>
                              <b>{o.mode === 'Adult' ? 'Customer' : 'Student'}</b>
                              {o.name}
                            </span>
                            <span>
                              <b>Quantity</b>
                              <strong style={{ color: '#273824' }}>
                                {o.quantity || 1} {o.quantity && o.quantity > 1 ? 'items' : 'item'}
                              </strong>
                              {o.quantity && o.quantity > 1 && (
                                <small style={{ display: 'block', color: '#78816f', fontSize: '10px' }}>
                                  ({da(o.unitPrice || Math.round(o.price / o.quantity))} each)
                                </small>
                              )}
                            </span>
                            {o.mode === 'Adult' ? (
                              <>
                                <span>
                                  <b>Phone</b>
                                  {o.phone || 'Not provided'}
                                </span>
                                <span>
                                  <b>Delivery address</b>
                                  {o.address || 'Not provided'}
                                </span>
                              </>
                            ) : (
                              <>
                                <span>
                                  <b>Class</b>
                                  {o.studentClass}
                                </span>
                                <span>
                                  <b>Section</b>
                                  {o.section}
                                </span>
                              </>
                            )}
                            <span>
                              <b>Placed</b>
                              {new Date(o.createdAt).toLocaleDateString('en-IN')}
                            </span>
                            <span>
                              <b>Queue</b>
                              {o.queuePosition ? `#${o.queuePosition} · ${o.peopleAhead} ahead` : 'Finished'}
                            </span>
                            {o.colour && (
                              <span>
                                <b>Colour</b>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  <ColourDot colour={o.colour} size={13} />
                                  <strong style={{ color: '#15803d' }}>{o.colour}</strong>
                                </span>
                              </span>
                            )}
                          </div>

                          {o.note && <p className="order-note">Note: {o.note}</p>}

                          <label className="status-select">
                            Order status
                            <select
                              value={
                                ['Delivered', 'Collected'].includes(o.status)
                                  ? 'Completed'
                                  : o.status === 'Ready for pickup'
                                  ? 'Dispatched'
                                  : o.status
                              }
                              onChange={(e) => void updateOrderStatus(o, e.target.value)}
                            >
                              <option>New</option>
                              <option>Confirmed</option>
                              <option>Preparing</option>
                              <option>Dispatched</option>
                              <option>Completed</option>
                              <option>Cancelled</option>
                            </select>
                          </label>

                          {o.status === 'Confirmed' && (
                            <div className="payment-recipient-fields">
                              <strong>Payment recipient (shown to customer after confirmation)</strong>
                              <label>
                                Name
                                <input
                                  value={o.paymentRecipientName || ''}
                                  onChange={(e) =>
                                    handleOrderFieldChange(o.id, 'paymentRecipientName', e.target.value)
                                  }
                                  placeholder="Recipient name"
                                  maxLength={80}
                                />
                              </label>
                              <div className="two-fields">
                                <label>
                                  Class
                                  <input
                                    value={o.paymentRecipientClass || ''}
                                    onChange={(e) =>
                                      handleOrderFieldChange(o.id, 'paymentRecipientClass', e.target.value)
                                    }
                                    placeholder="e.g. 8"
                                    maxLength={30}
                                  />
                                </label>
                                <label>
                                  Section
                                  <input
                                    value={o.paymentRecipientSection || ''}
                                    onChange={(e) =>
                                      handleOrderFieldChange(o.id, 'paymentRecipientSection', e.target.value)
                                    }
                                    placeholder="e.g. A"
                                    maxLength={30}
                                  />
                                </label>
                              </div>
                              <button
                                className="secondary-btn"
                                onClick={() => void savePaymentRecipient(o)}
                              >
                                Save payment recipient
                              </button>
                            </div>
                          )}

                          <div className="payment-recipient-fields owner-note-fields">
                            <strong>Note to customer</strong>
                            <label>
                              Message
                              <textarea
                                value={o.ownerNote || ''}
                                onChange={(e) => handleOwnerNoteChange(o.id, e.target.value)}
                                placeholder="Write an update or instructions for the customer…"
                                maxLength={500}
                                rows={3}
                              />
                            </label>
                            <button className="secondary-btn" onClick={() => void saveOwnerNote(o)}>
                              Save customer note
                            </button>
                          </div>

                          {['completed', 'complete', 'delivered', 'collected', 'cancelled'].includes((o.status || '').trim().toLowerCase()) && (
                            <button
                              className="secondary-btn"
                              disabled={loading}
                              onClick={() => void deleteOldOrder(o)}
                            >
                              <Trash2 size={16} /> {loading ? 'Deleting…' : 'Delete old order'}
                            </button>
                          )}
                        </article>
                      ))
                  )}
                </div>
              </>
            )}

            {/* SUGGESTIONS TAB */}
            {ownerTab === 'suggestions' && (
              <section className="suggestions-owner-panel">
                <div className="manage-title">
                  <h2>Customer suggestions</h2>
                  <button className="secondary-btn" onClick={() => void loadOwnerSuggestions()}>
                    Refresh
                  </button>
                </div>

                {ownerSuggestions.length === 0 ? (
                  <div className="empty-state compact">
                    <div className="empty-icon">💡</div>
                    <h3>No suggestions yet</h3>
                    <p>Customer ideas will appear here after they submit them.</p>
                  </div>
                ) : (
                  <div className="suggestions-list">
                    {ownerSuggestions.map((s) => (
                      <article className="suggestion-card" key={s.id}>
                        <p>{s.suggestion}</p>
                        <div className="suggestion-card-footer">
                          <span>{new Date(s.createdAt).toLocaleString('en-IN')}</span>
                          <button
                            className="secondary-btn"
                            onClick={() => void deleteSuggestion(s)}
                            aria-label="Delete suggestion"
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* PAYMENT QR TAB */}
            {ownerTab === 'payment' && (
              <section className="payment-qr-panel">
                <span className="eyebrow">ADULT CHECKOUT</span>
                <h2>Adult payment QR code</h2>
                <p>Upload or replace the QR code customers see while an Adult order is New.</p>
                {paymentQrUrl ? (
                  <img
                    className="payment-qr-image owner-qr-preview"
                    src={paymentQrUrl}
                    alt="Current Adult payment QR code"
                  />
                ) : (
                  <div className="qr-empty">No QR code uploaded yet.</div>
                )}
                <label className="upload-box">
                  <span className="upload-symbol">＋</span>
                  <strong>{qrFile ? qrFile.name : 'Choose QR code image'}</strong>
                  <small>JPG, PNG or WebP · under 1 MB</small>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setQrFile(e.currentTarget.files?.[0] || null)}
                  />
                </label>
                <button
                  className="primary-btn"
                  onClick={() => void savePaymentQr()}
                  disabled={loading || !qrFile}
                >
                  {loading ? 'Saving QR…' : paymentQrUrl ? 'Replace QR code' : 'Save QR code'}
                </button>
              </section>
            )}

            {/* MANAGE COLOURS TAB */}
            {ownerTab === 'colours' && (
              <div className="panel-form add-form">
                <span className="eyebrow">TOY CUSTOMIZATION</span>
                <h2>Manage Colours</h2>
                <p>
                  Add or remove colour options for customer orders. When at least one colour is available, customers will see the &quot;Which colour?&quot; dropdown in the order form.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAddColour();
                  }}
                  style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '1rem', marginBottom: '1.5rem' }}
                >
                  <label style={{ flex: 1, minWidth: '220px', margin: 0 }}>
                    Colour name
                    <input
                      type="text"
                      value={newColourInput}
                      onChange={(e) => setNewColourInput(e.target.value)}
                      placeholder="e.g. Red, Blue, Black, White, Pink"
                      maxLength={40}
                      autoFocus
                    />
                  </label>
                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={loading || !newColourInput.trim()}
                    style={{ height: '46px', whiteSpace: 'nowrap' }}
                  >
                    {loading ? 'Adding…' : '+ Add colour'}
                  </button>
                </form>

                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                      Available colours ({availableColours.length})
                    </h3>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => void loadColours()}
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      <RefreshCw size={14} /> Refresh colours
                    </button>
                  </div>

                  {availableColours.length === 0 ? (
                    <div className="empty-state compact" style={{ padding: '2rem 1rem', textAlign: 'center', background: '#f9fafb', borderRadius: '10px', border: '1px dashed #d1d5db' }}>
                      <div className="empty-icon" style={{ fontSize: '32px', marginBottom: '8px' }}>🎨</div>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 600 }}>No colours added yet</h4>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                        When no colours are added, the &quot;Which colour?&quot; field is hidden from customers. Add your first colour above!
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {availableColours.map((colour) => (
                        <div
                          key={colour}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 16px',
                            background: '#ffffff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '10px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                          }}
                        >
                          <ColourDot colour={colour} size={16} />
                          <span>{colour}</span>
                          <button
                            type="button"
                            onClick={() => void handleRemoveColour(colour)}
                            className="icon-btn danger"
                            title={`Remove ${colour}`}
                            aria-label={`Remove ${colour}`}
                            style={{
                              padding: '4px',
                              marginLeft: '6px',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: '#ef4444',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RESCUE DEALS TAB */}
            {ownerTab === 'rescueDeals' && (
              <div className="rescue-manager-panel">
                <div className="rescue-manager-header">
                  <div>
                    <span className="eyebrow rescue-eyebrow">CLEARANCE & SPECIAL OFFERS</span>
                    <h3>⚡ Rescue Deals Manager</h3>
                    <p>
                      Create and monitor single-quantity clearance offers. When ordered by a customer, the deal is automatically marked sold and removed from public view across all devices.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setIsAddingDeal(!isAddingDeal);
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                  >
                    {isAddingDeal ? '✕ Close Form' : '➕ Add Rescue Deal'}
                  </button>
                </div>

                {/* ADD NEW RESCUE DEAL FORM */}
                {isAddingDeal && (
                  <form
                    className="panel-form add-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setErrorMessage('');
                      setSuccessMessage('');

                      const title = newDealForm.title.trim();
                      const dealPrice = parseFloat(newDealForm.dealPrice);
                      const origPrice = parseFloat(newDealForm.originalPrice) || dealPrice;

                      if (!title) {
                        setErrorMessage('Please enter a deal title.');
                        return;
                      }
                      if (isNaN(dealPrice) || dealPrice <= 0) {
                        setErrorMessage('Please enter a valid deal price in ₹.');
                        return;
                      }

                      setDealSaving(true);
                      const newDeal: RescueDeal = {
                        id: `deal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                        productId: newDealForm.productId || '',
                        title,
                        originalPrice: origPrice,
                        dealPrice,
                        condition: newDealForm.condition.trim() || 'Special Rescue Deal',
                        colour: newDealForm.colour.trim(),
                        description: newDealForm.description.trim(),
                        imageUrl: newDealForm.imageUrl || '/toys/toy-78291ec9-1.jpg',
                        claimed: false,
                        status: 'available',
                        createdAt: new Date().toISOString(),
                      };

                      try {
                        await saveRescueDealToCloud(newDeal);
                        try {
                          await api.post('/api/rescue-deals', newDeal);
                        } catch {}

                        setRescueDeals((prev) => [newDeal, ...prev.filter((d) => d.id !== newDeal.id)]);
                        setSuccessMessage(`Rescue deal "${title}" published and is now live!`);
                        setIsAddingDeal(false);
                        setNewDealForm({
                          productId: '',
                          title: '',
                          originalPrice: '',
                          dealPrice: '',
                          condition: 'Open Box - Single piece',
                          colour: '',
                          description: '',
                          imageUrl: '',
                        });
                      } catch (err: any) {
                        setErrorMessage(err?.message || 'Could not publish rescue deal.');
                      } finally {
                        setDealSaving(false);
                      }
                    }}
                  >
                    <span className="eyebrow rescue-eyebrow">NEW RESCUE DEAL</span>
                    <h2>Create Single-Quantity Deal</h2>
                    <p className="form-subtitle">
                      Set special pricing for an open-box, clearance, or display piece.
                    </p>

                    <label>
                      Autofill from existing catalog product (optional)
                      <select
                        value={newDealForm.productId}
                        onChange={(e) => {
                          const prodId = e.target.value;
                          const found = products.find((p) => p.id === prodId);
                          if (found) {
                            setNewDealForm({
                              ...newDealForm,
                              productId: prodId,
                              title: `${found.name} (Special Deal)`,
                              originalPrice: String(found.price),
                              dealPrice: String(Math.max(1, Math.round(found.price * 0.7))),
                              imageUrl: found.imageUrl || (found.imageUrls && found.imageUrls[0]) || '',
                              description: found.description || 'Special single-quantity rescue clearance offer.',
                            });
                          } else {
                            setNewDealForm({
                              ...newDealForm,
                              productId: '',
                            });
                          }
                        }}
                      >
                        <option value="">-- Choose a product or enter details manually --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Regular ₹{p.price})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Deal Title
                      <input
                        type="text"
                        value={newDealForm.title}
                        onChange={(e) => setNewDealForm({ ...newDealForm, title: e.target.value })}
                        placeholder="e.g. Spider-Noir Figure (Display Model)"
                        required
                        maxLength={150}
                      />
                    </label>

                    <div className="two-fields">
                      <label>
                        Original Regular Price (₹)
                        <input
                          type="number"
                          value={newDealForm.originalPrice}
                          onChange={(e) => setNewDealForm({ ...newDealForm, originalPrice: e.target.value })}
                          placeholder="e.g. 79"
                          min={1}
                        />
                      </label>
                      <label>
                        Special Deal Price (₹)
                        <input
                          type="number"
                          value={newDealForm.dealPrice}
                          onChange={(e) => setNewDealForm({ ...newDealForm, dealPrice: e.target.value })}
                          placeholder="e.g. 49"
                          required
                          min={1}
                        />
                      </label>
                    </div>

                    <div className="two-fields">
                      <label>
                        Condition / Note
                        <input
                          type="text"
                          value={newDealForm.condition}
                          onChange={(e) => setNewDealForm({ ...newDealForm, condition: e.target.value })}
                          placeholder="e.g. Open Box, Last 1 in Stock, Transit Crease"
                          required
                          maxLength={60}
                        />
                      </label>
                      <label>
                        Product Colour (Preselected & locked for customer)
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={newDealForm.colour}
                            onChange={(e) => setNewDealForm({ ...newDealForm, colour: e.target.value })}
                            placeholder="e.g. Black, Red, Grey"
                            maxLength={50}
                            style={{ flex: 1 }}
                          />
                          {newDealForm.colour && (
                            <ColourDot colour={newDealForm.colour} size={20} />
                          )}
                        </div>
                      </label>
                    </div>

                    {availableColours.length > 0 && (
                      <div style={{ marginBottom: '14px', background: '#fafaf9', padding: '10px 12px', borderRadius: '8px', border: '1px solid #eeece5' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#555d50', display: 'block', marginBottom: '6px' }}>
                          Quick pick from store colours:
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {availableColours.map((col) => {
                            const isSelected = (newDealForm.colour || '').toLowerCase() === col.toLowerCase();
                            return (
                              <button
                                key={col}
                                type="button"
                                onClick={() => setNewDealForm({ ...newDealForm, colour: col })}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '3px 10px',
                                  fontSize: '12px',
                                  borderRadius: '999px',
                                  border: isSelected ? '1.5px solid #b45309' : '1px solid #d1d5db',
                                  background: isSelected ? '#fef3c7' : '#ffffff',
                                  color: isSelected ? '#92400e' : '#374151',
                                  cursor: 'pointer',
                                  fontWeight: isSelected ? 700 : 500,
                                }}
                              >
                                <ColourDot colour={col} size={11} />
                                {col}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <label>
                      Image URL
                      <input
                        type="text"
                        value={newDealForm.imageUrl}
                        onChange={(e) => setNewDealForm({ ...newDealForm, imageUrl: e.target.value })}
                        placeholder="/toys/toy-78291ec9-1.jpg"
                      />
                    </label>

                    <label>
                      Description
                      <textarea
                        value={newDealForm.description}
                        onChange={(e) => setNewDealForm({ ...newDealForm, description: e.target.value })}
                        placeholder="Explain condition, why it's discounted, etc."
                        rows={3}
                        maxLength={500}
                      />
                    </label>

                    <button type="submit" className="primary-btn" disabled={dealSaving}>
                      {dealSaving ? 'Publishing…' : 'Publish Rescue Deal'}
                    </button>
                  </form>
                )}

                {/* ACTIVE RESCUE DEALS LIST */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#2b251d' }}>
                      Active Rescue Deals ({availableRescueDeals.length})
                    </h4>
                    <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>
                      ● Live on customer storefront
                    </span>
                  </div>

                  {availableRescueDeals.length === 0 ? (
                    <div className="empty-state compact" style={{ padding: '24px', textAlign: 'center' }}>
                      <p style={{ margin: 0 }}>No active deals currently available. Add a deal above to feature it on the shop!</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                      {availableRescueDeals.map((deal) => (
                        <div
                          key={deal.id}
                          style={{
                            background: '#fffefa',
                            border: '1px solid #eeece5',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center',
                          }}
                        >
                          <img
                            src={deal.imageUrl || '/toys/toy-78291ec9-1.jpg'}
                            alt=""
                            style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ display: 'block', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {deal.title}
                            </strong>
                            <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 700, margin: '2px 0' }}>
                              {da(deal.dealPrice)} {deal.originalPrice > deal.dealPrice && <del style={{ color: '#9ca3af', fontSize: '10px' }}>{da(deal.originalPrice)}</del>}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                              <span className="status-badge-available">Available (1 in stock)</span>
                              {deal.colour && (
                                <span className="rescue-colour-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#374151', fontWeight: 600 }}>
                                  <ColourDot colour={deal.colour} size={10} /> {deal.colour}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Delete this rescue deal"
                            disabled={deletingDealId === deal.id}
                            onClick={() => handleDeleteRescueDeal(deal)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* CLAIMED / SOLD RESCUE DEALS LIST */}
                <div style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#2b251d' }}>
                      Claimed / Sold Deals ({rescueDeals.filter((d) => d.claimed || d.status === 'claimed').length})
                    </h4>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                      Automatically removed from customer shop upon purchase
                    </span>
                  </div>

                  {rescueDeals.filter((d) => d.claimed || d.status === 'claimed').length === 0 ? (
                    <div className="empty-state compact" style={{ padding: '24px', textAlign: 'center' }}>
                      <p style={{ margin: 0 }}>No deals have been claimed yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                      {rescueDeals
                        .filter((d) => d.claimed || d.status === 'claimed')
                        .map((deal) => (
                          <div
                            key={deal.id}
                            style={{
                              background: '#f9f9f6',
                              border: '1px solid #e7e5dc',
                              borderRadius: '12px',
                              padding: '16px',
                              display: 'flex',
                              gap: '12px',
                              alignItems: 'center',
                              opacity: 0.9,
                            }}
                          >
                            <img
                              src={deal.imageUrl || '/toys/toy-78291ec9-1.jpg'}
                              alt=""
                              style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <strong style={{ display: 'block', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {deal.title}
                              </strong>
                              <div style={{ fontSize: '12px', color: '#555d50', fontWeight: 700, margin: '2px 0' }}>
                                Sold for {da(deal.dealPrice)}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                                <span className="status-badge-claimed">Claimed & Sold</span>
                                {deal.colour && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#e5e7eb', color: '#374151', fontWeight: 600 }}>
                                    <ColourDot colour={deal.colour} size={10} /> {deal.colour}
                                  </span>
                                )}
                              </div>
                              {deal.claimedByCustomer && (
                                <small style={{ display: 'block', color: '#6b7280', fontSize: '10px', marginTop: '4px' }}>
                                  By: {deal.claimedByCustomer}
                                </small>
                              )}
                            </div>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Remove record from archive"
                              disabled={deletingDealId === deal.id}
                              onClick={() => handleDeleteRescueDeal(deal)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Gallery Modal Dialog */}
      {galleryProduct && (
        <div className="gallery-overlay" role="presentation" onClick={() => setGalleryProduct(null)}>
          <section
            className="gallery-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${galleryProduct.name} photo gallery`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="gallery-close"
              type="button"
              aria-label="Close gallery"
              onClick={() => setGalleryProduct(null)}
            >
              <X size={22} />
            </button>

            {(() => {
              const urls =
                galleryProduct.imageUrls && galleryProduct.imageUrls.length
                  ? galleryProduct.imageUrls
                  : galleryProduct.imageUrl
                  ? [galleryProduct.imageUrl]
                  : [];
              const navigatePhoto = (delta: number) => {
                if (urls.length > 1) {
                  setGalleryImageIndex((prev) => (prev + delta + urls.length) % urls.length);
                }
              };

              return (
                <>
                  <div
                    className="gallery-viewer"
                    onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
                    onTouchEnd={(e) => {
                      if (touchStartX !== null && e.changedTouches[0]) {
                        const diff = e.changedTouches[0].clientX - touchStartX;
                        if (Math.abs(diff) > 45) {
                          navigatePhoto(diff < 0 ? 1 : -1);
                        }
                      }
                      setTouchStartX(null);
                    }}
                  >
                    {urls.length ? (
                      <img
                        src={urls[galleryImageIndex] || urls[0]}
                        alt={`${galleryProduct.name}, photo ${galleryImageIndex + 1}`}
                        decoding="async"
                        fetchPriority="high"
                      />
                    ) : (
                      <div className="gallery-placeholder">🧸</div>
                    )}
                    {urls.length > 1 && (
                      <>
                        <button
                          className="gallery-arrow gallery-prev"
                          type="button"
                          aria-label="Previous photo"
                          onClick={() => navigatePhoto(-1)}
                        >
                          <ChevronLeft size={25} />
                        </button>
                        <button
                          className="gallery-arrow gallery-next"
                          type="button"
                          aria-label="Next photo"
                          onClick={() => navigatePhoto(1)}
                        >
                          <ChevronRight size={25} />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="gallery-details">
                    <div className="gallery-counter">
                      PHOTO {galleryImageIndex + 1} OF {Math.max(urls.length, 1)}
                    </div>
                    <h2>{galleryProduct.name}</h2>
                    <p>{galleryProduct.description || 'A fun new friend for playtime.'}</p>
                    <div className="gallery-footer">
                      <strong>{da(galleryProduct.price)}</strong>
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={() => {
                          setSelectedProductForBuy(galleryProduct);
                          setOrderQuantity(1);
                          setGalleryProduct(null);
                          setCheckoutMode(null);
                          setCheckoutForm({
                            name: '',
                            studentClass: '',
                            section: '',
                            phone: '',
                            address: '',
                            note: '',
                            colour: '',
                          });
                          setErrorMessage('');
                          setPage('buy');
                        }}
                      >
                        Buy now <ArrowLeft size={16} />
                      </button>
                    </div>
                    {urls.length > 1 && (
                      <p className="gallery-swipe-hint">Swipe left or right to see more photos</p>
                    )}
                  </div>
                </>
              );
            })()}
          </section>
        </div>
      )}

      {/* Footer */}
      <footer>
        <div className="footer-brand">
          <span className="brand-icon">
            <img
              className="brand-logo"
              src="/resources/toynest-logo.png"
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <Boxes size={18} />
          </span>{' '}
          Playnix
        </div>
        <p className="footer-tagline">
          TECHNOBLADE NEVER DIES
        </p>
        <button
          onClick={() => {
            setPage('ownerLogin');
            setErrorMessage('');
          }}
        >
          Owner access
        </button>
      </footer>
    </div>
  );
}
