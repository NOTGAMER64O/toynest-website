import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertTriangle,
  Calendar,
  Clock,
  ShoppingCart,
  Maximize2,
  BarChart3,
  HelpCircle,
  Bot,
  ShieldAlert,
  Settings,
  Scale,
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
  let val: string | null = null;
  try {
    val = localStorage.getItem(KEY);
  } catch {}
  if (!val && typeof document !== 'undefined') {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${KEY}=`));
    if (match) {
      val = decodeURIComponent(match.split('=')[1] || '');
    }
  }
  if (!val) {
    val =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  try {
    localStorage.setItem(KEY, val);
  } catch {}
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${KEY}=${encodeURIComponent(val)}; path=/; max-age=31536000; SameSite=Lax`;
    }
  } catch {}
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
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const msg = `HTTP ${res.status} on GET ${url}`;
        if (res.status >= 500 || res.status === 404) {
          recordWebsiteError('api', msg, url);
        }
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      return { data };
    } catch (err: any) {
      if (!String(err?.message || '').startsWith('HTTP error')) {
        recordWebsiteError('api', err?.message || `Network failure on GET ${url}`, url);
      }
      throw err;
    }
  },
  async post(url: string, body: any, options?: { timeoutMs?: number }) {
    const timeoutMs = options?.timeoutMs ?? 25000;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer =
      controller && timeoutMs > 0
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error || `HTTP error ${res.status}`;
        if (res.status >= 500 || (res.status !== 401 && res.status !== 400)) {
          recordWebsiteError('api', `${errMsg} on POST ${url}`, url);
        }
        const httpErr: any = new Error(errMsg);
        httpErr.status = res.status;
        httpErr.data = err;
        throw httpErr;
      }
      const data = await res.json();
      return { data };
    } catch (err: any) {
      if (!String(err?.message || '').includes('HTTP error') && !String(err?.message || '').includes('Invalid owner PIN')) {
        recordWebsiteError('api', err?.message || `Network failure on POST ${url}`, url);
      }
      throw err;
    } finally {
      if (timer !== null) window.clearTimeout(timer);
    }
  },
  async delete(url: string) {
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error || `HTTP error ${res.status}`;
        if (res.status >= 500) {
          recordWebsiteError('api', `${errMsg} on DELETE ${url}`, url);
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      return { data };
    } catch (err: any) {
      recordWebsiteError('api', err?.message || `Network failure on DELETE ${url}`, url);
      throw err;
    }
  },
};

import {
  DEFAULT_PRODUCTS,
  DEFAULT_OWNER_PIN,
  type Product,
  type Order,
  type Suggestion,
  type RescueDeal,
  type ScheduledOffer,
  type OfferComputedStatus,
  type DiscountCampaign,
  type CampaignDiscountType,
  type CampaignTargetScope,
  type CampaignStatus,
  type FestivalBannerPreset,
  type ProductDiscountInfo,
  type MoneyAdjustmentItem,
  type CampaignConflict,
  type CartItem,
  type PopularSearchItem,
  type AnalyticsEvent,
  type AnalyticsCustomer,
  type ProductQuestion,
  type ProductQuestionStatus,
  type AiAssistantState,
  type AiResponseStyleMode,
  type AiKnowledgeEntry,
  type AiTrainingAnswer,
  type AiTrainingStepKey,
  type AiSuggestedReplyResult,
  type AiGuidanceQuestion,
  type AiLearningFeatureKey,
  type AiOwnerLearningRecord,
  type PendingAiRejectionDraft,
  type OrderAiVerification,
  type OrderAuditEntry,
  DEFAULT_RESCUE_DEALS,
  DEFAULT_AI_ASSISTANT_STATE,
  PLAYNIX_TRAINING_QUESTIONS,
  FESTIVAL_BANNER_PRESETS,
  getStoredDeletedRescueDealIds,
  getStoredMoneyAdjustment,
  saveStoredMoneyAdjustment,
  getStoredMoneyAdjustmentHistory,
  saveStoredMoneyAdjustmentHistory,
  getStoredCart,
  saveStoredCart,
  markCartItemDeletedLocally,
  unmarkCartItemDeletedLocally,
  mergePermanentCartItems,
  getStoredPopularSearches,
  saveStoredPopularSearches,
  getStoredProductQuestions,
  saveStoredProductQuestions,
  getStoredAiState,
  saveStoredAiState,
  getStoredAiKnowledge,
  saveStoredAiKnowledge,
  getStoredAiGuidanceQuestions,
  saveStoredAiGuidanceQuestions,
  getStoredAiTrainingAnswers,
  saveStoredAiTrainingAnswers,
  computeOfferStatus,
  computeCampaignStatus,
  calculateProductDiscount,
  getStoredDiscountCampaigns,
  saveStoredDiscountCampaigns,
  detectCampaignConflicts,
  getCampaignTargetProductIds,
  formatInIST,
  formatTimeRemaining,
  getGuestShortCode,
  formatGuestCustomerLabel,
  getStoredGuestName,
  saveStoredGuestName,
  type WatchdogAlert,
  type WatchdogAlertStatus,
  type WatchdogActivityLog,
  getStoredWatchdogAlerts,
  saveStoredWatchdogAlerts,
  getStoredWatchdogLogs,
  saveStoredWatchdogLogs,
} from './defaultData';
import {
  saveOrderToCloud,
  fetchCustomerOrdersByIds,
  fetchCustomerOrdersFromCloud,
  fetchAllOrdersFromCloud,
  subscribeToAllOrders,
  subscribeToCustomerOrders,
  updateOrderStatusInCloud,
  submitCustomerOrderClarificationInCloud,
  updateCustomerOrderNoteInCloud,
  deleteOrderFromCloud,
  markOrderDeletedByCustomerInCloud,
  saveSuggestionToCloud,
  fetchSuggestionsFromCloud,
  deleteSuggestionFromCloud,
  fetchProductsFromCloud,
  fetchProductsPageFromCloud,
  fetchAllProductSummariesFromCloud,
  fetchProductByIdFromCloud,
  fetchProductBySlugOrIdFromCloud,
  invalidateFirestoreCache,
  updateProductAvailabilityInCloud,
  saveProductToCloud,
  deleteProductFromCloud,
  fetchSettingsFromCloud,
  saveSettingsToCloud,
  subscribeToSettings,
  fetchColoursFromCloud,
  saveColoursToCloud,
  fetchRescueDealsFromCloud,
  subscribeToRescueDeals,
  saveRescueDealToCloud,
  deleteRescueDealFromCloud,
  claimRescueDealInCloud,
  fetchScheduledOffersFromCloud,
  subscribeToScheduledOffers,
  saveScheduledOfferToCloud,
  deleteScheduledOfferFromCloud,
  cancelScheduledOfferInCloud,
  claimScheduledOfferInCloud,
  fetchDiscountCampaignsFromCloud,
  saveDiscountCampaignToCloud,
  cancelDiscountCampaignInCloud,
  deleteDiscountCampaignFromCloud,
  recordCampaignOrderInCloud,
  saveCartItemToCloud,
  deleteCartItemFromCloud,
  fetchCartItemsFromCloud,
  subscribeToCartItems,
  fetchAllCartItemsFromCloud,
  subscribeToAllCartItems,
  buildCartDocId,
  syncCustomerNameWithCartInCloud,
  searchProductsFromCloud,
  fetchPopularSearchesFromCloud,
  savePopularSearchToCloud,
  deletePopularSearchFromCloud,
  reorderPopularSearchesInCloud,
  trackWebsiteVisit,
  trackProductView,
  trackAddToCartEvent,
  syncAnalyticsCustomerOrderProfile,
  fetchAnalyticsEventsFromCloud,
  fetchAnalyticsCustomersFromCloud,
  subscribeToAnalyticsEvents,
  subscribeToAnalyticsCustomers,
  fetchAllProductQuestionsFromCloud,
  subscribeToAllProductQuestions,
  answerProductQuestionInCloud,
  updateProductQuestionStatusInCloud,
  deleteProductQuestionFromCloud,
  fetchAiAssistantStateFromCloud,
  subscribeToAiAssistantState,
  saveAiAssistantStateToCloud,
  fetchAiKnowledgeFromCloud,
  subscribeToAiKnowledge,
  saveAiKnowledgeEntryToCloud,
  deleteAiKnowledgeEntryFromCloud,
  replaceWebsiteScanKnowledgeInCloud,
  fetchAiTrainingAnswersFromCloud,
  subscribeToAiTrainingAnswers,
  saveAiTrainingAnswerToCloud,
  fetchAiGuidanceQuestionsFromCloud,
  subscribeToAiGuidanceQuestions,
  saveAiGuidanceQuestionToCloud,
  deleteAiGuidanceQuestionFromCloud,
  fetchWatchdogAlertsFromCloud,
  subscribeToWatchdogAlerts,
  saveWatchdogAlertToCloud,
  fetchWatchdogLogsFromCloud,
  subscribeToWatchdogLogs,
  saveWatchdogLogToCloud,
  fetchAiOwnerLearningRecordsFromCloud,
  subscribeToAiOwnerLearningRecords,
  createAiOwnerLearningRecordInCloud,
} from './firebase';
import { buildCompactLearningPayload } from './utils/aiLearningMemory';
import { AiRejectionFeedbackModal } from './components/AiRejectionFeedbackModal';
import { CustomerSearchBar } from './components/CustomerSearchBar';
import { CustomerProductDetail } from './components/CustomerProductDetail';
import { OwnerPopularSearchesManager } from './components/OwnerPopularSearchesManager';
import { FullScreenImageGallery } from './components/FullScreenImageGallery';
import { OwnerAnalyticsDashboard } from './components/OwnerAnalyticsDashboard';
import { HeroToyShowcase } from './components/HeroToyShowcase';
import { AnimatedCategoryDropdown } from './components/AnimatedCategoryDropdown';
import { ProductQuestionsSection } from './components/ProductQuestionsSection';
import { OwnerProductQuestionsManager } from './components/OwnerProductQuestionsManager';
import { OwnerPlaynixAiAssistant } from './components/OwnerPlaynixAiAssistant';
import { OwnerAiWatchdogDashboard } from './components/OwnerAiWatchdogDashboard';
import { OrderVerificationCard } from './components/OrderVerificationCard';
import { runDeterministicOrderInspection } from './utils/orderVerification';
import {
  reconcileWatchdogAudit,
  computeWatchdogMetrics,
  sanitizeWatchdogDocId,
} from './utils/aiWatchdog';
import {
  type CapturedWebsiteError,
  installWebsiteErrorListeners,
  subscribeWebsiteErrors,
  getCapturedWebsiteErrors,
  recordWebsiteError,
  clearCapturedWebsiteError,
} from './utils/websiteErrorMonitor';
import { OwnerProductPriceAdvisor } from './components/OwnerProductPriceAdvisor';
import {
  OrderSuccessCelebration,
  type OrderCelebrationData,
} from './components/OrderSuccessCelebration';
import {
  SITE_BASE_URL,
  buildProductSeoMeta,
  findProductBySlugOrId,
  generateProductSlugForCreate,
  getProductPath,
  getUniqueProductSlug,
  parseProductSlugFromPath,
} from './utils/productSlug';
import {
  shuffleProductIds,
  orderProductsByShuffleIds,
} from './utils/productShuffle';

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

function getStoredScheduledOffers(): ScheduledOffer[] {
  try {
    const raw = localStorage.getItem('playnix_scheduled_offers');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredScheduledOffers(offers: ScheduledOffer[]) {
  try {
    localStorage.setItem('playnix_scheduled_offers', JSON.stringify(offers));
  } catch {}
}

/**
 * Format a Date object to YYYY-MM-DDTHH:mm for HTML datetime-local inputs.
 * Uses local browser time which aligns with user's Indian Standard Time input.
 */
function toDatetimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
    // Store lightweight product summaries in localStorage to stay safely below the 5MB browser quota;
    // full multi-image galleries are cached automatically in Firestore IndexedDB persistentLocalCache.
    const compact = products.slice(0, 60).map((p) => {
      const cover = p.imageUrl || (p.imageUrls && p.imageUrls[0]) || '/toys/toy-40ba4ba9-1.jpg';
      const photoCount = p.photoCount || (p.imageUrls ? p.imageUrls.length : 1);
      return {
        ...p,
        imageUrl: cover,
        imageUrls: [cover],
        photoCount,
        isSummaryOnly: photoCount > 1 ? true : p.isSummaryOnly,
      };
    });
    const serialized = JSON.stringify(compact);
    if (serialized.length < 1_800_000) {
      localStorage.setItem('toynest_local_products', serialized);
    } else {
      localStorage.setItem('toynest_local_products', JSON.stringify(compact.slice(0, 12)));
    }
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
  const initialStoredProducts = useMemo(() => getStoredProducts(), []);
  const initialUrlSlug = useMemo(
    () =>
      typeof window !== 'undefined' ? parseProductSlugFromPath(window.location.pathname) : null,
    []
  );
  const initialUrlMatchedProduct = useMemo(
    () =>
      initialUrlSlug ? findProductBySlugOrId(initialUrlSlug, initialStoredProducts) || null : null,
    [initialUrlSlug, initialStoredProducts]
  );

  const [products, setProducts] = useState<Product[]>(initialStoredProducts);
  const [requestedProductSlug, setRequestedProductSlug] = useState<string | null>(initialUrlSlug);
  const [cloudProductsLoaded, setCloudProductsLoaded] = useState<boolean>(false);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState<boolean>(false);
  const [hasMoreProducts, setHasMoreProducts] = useState<boolean>(false);
  const [productsNextCursor, setProductsNextCursor] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [page, setPage] = useState<
    'home' | 'productDetail' | 'buy' | 'myOrders' | 'suggestions' | 'ownerLogin' | 'owner'
  >(() => (initialUrlSlug ? 'productDetail' : 'home'));
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(
    initialUrlMatchedProduct
  );
  const [searchCloudSyncing, setSearchCloudSyncing] = useState<boolean>(false);
  const [lastSearchCloudSyncAt, setLastSearchCloudSyncAt] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('All categories');
  const allSummariesLoadedRef = useRef<boolean>(false);
  const [productShuffleOrder, setProductShuffleOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('playnix_product_shuffle_order');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) : [];
    } catch {
      return [];
    }
  });
  const [productAutoShuffle, setProductAutoShuffle] = useState<boolean>(() => {
    try {
      return localStorage.getItem('playnix_product_auto_shuffle') === 'true';
    } catch {
      return false;
    }
  });
  const [productShuffledAt, setProductShuffledAt] = useState<string>(() => {
    try {
      return localStorage.getItem('playnix_product_shuffled_at') || '';
    } catch {
      return '';
    }
  });
  const [sessionAutoShuffleOrder, setSessionAutoShuffleOrder] = useState<string[]>([]);
  const [shuffleSaving, setShuffleSaving] = useState<boolean>(false);
  const autoShuffleVisitDoneRef = useRef<boolean>(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [ownerOrders, setOwnerOrders] = useState<Order[]>([]);
  const [manualMoneyAdjustment, setManualMoneyAdjustment] = useState<number>(() => getStoredMoneyAdjustment());
  const [moneyAdjustmentHistory, setMoneyAdjustmentHistory] = useState<MoneyAdjustmentItem[]>(() => getStoredMoneyAdjustmentHistory());
  const [isMoneyModalOpen, setIsMoneyModalOpen] = useState<boolean>(false);
  const [moneyModalTab, setMoneyModalTab] = useState<'add' | 'subtract'>('add');
  const [moneyInputAmount, setMoneyInputAmount] = useState<string>('');
  const [moneyInputNote, setMoneyInputNote] = useState<string>('');
  const [moneySaving, setMoneySaving] = useState<boolean>(false);

  const baseOrdersEarned = useMemo(() => calculateTotalMoneyEarned(ownerOrders), [ownerOrders]);
  const totalMoneyEarned = useMemo(() => {
    return baseOrdersEarned + manualMoneyAdjustment;
  }, [baseOrdersEarned, manualMoneyAdjustment]);
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
  const [galleryAskTrigger, setGalleryAskTrigger] = useState<number>(0);
  const [isGalleryZoomOpen, setIsGalleryZoomOpen] = useState<boolean>(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const galleryDidSwipeRef = useRef<boolean>(false);
  const [ownerTab, setOwnerTab] = useState<
    'products' | 'drafts' | 'orders' | 'suggestions' | 'questions' | 'aiAssistant' | 'watchdog' | 'filamentSettings' | 'analytics' | 'sections' | 'payment' | 'colours' | 'popularSearches' | 'rescueDeals' | 'scheduledOffers' | 'campaigns'
  >('products');
  const [ownerProductQuestions, setOwnerProductQuestions] = useState<ProductQuestion[]>(() =>
    getStoredProductQuestions()
  );
  const [questionsLoading, setQuestionsLoading] = useState<boolean>(false);
  const pendingQuestionsCount = useMemo(
    () => ownerProductQuestions.filter((q) => q.status === 'Pending').length,
    [ownerProductQuestions]
  );
  const [aiState, setAiState] = useState<AiAssistantState>(() => getStoredAiState());
  const [aiKnowledge, setAiKnowledge] = useState<AiKnowledgeEntry[]>(() => getStoredAiKnowledge());
  const [aiTrainingAnswers, setAiTrainingAnswers] = useState<AiTrainingAnswer[]>(() =>
    getStoredAiTrainingAnswers()
  );
  const [aiGuidanceQuestions, setAiGuidanceQuestions] = useState<AiGuidanceQuestion[]>(() =>
    getStoredAiGuidanceQuestions()
  );
  const [aiOwnerLearningRecords, setAiOwnerLearningRecords] = useState<AiOwnerLearningRecord[]>([]);
  const [pendingAiRejection, setPendingAiRejection] = useState<PendingAiRejectionDraft | null>(null);
  const [aiGuidanceLoading, setAiGuidanceLoading] = useState<boolean>(false);
  const [aiScanning, setAiScanning] = useState<boolean>(false);
  const [aiScanFeedback, setAiScanFeedback] = useState<{
    message: string;
    isError?: boolean;
  } | null>(null);
  const [aiGeminiStatus, setAiGeminiStatus] = useState<{
    checked: boolean;
    geminiConfigured: boolean;
    model?: string;
    backendError?: string;
  }>({ checked: false, geminiConfigured: false });
  const aiInitialScanTriggeredRef = useRef<boolean>(false);
  const [watchdogAlerts, setWatchdogAlerts] = useState<WatchdogAlert[]>(() =>
    getStoredWatchdogAlerts()
  );
  const [watchdogLogs, setWatchdogLogs] = useState<WatchdogActivityLog[]>(() =>
    getStoredWatchdogLogs()
  );
  const [watchdogScanning, setWatchdogScanning] = useState<boolean>(false);
  const [watchdogLastScanAt, setWatchdogLastScanAt] = useState<string | null>(null);
  const [watchdogAiHealthSummary, setWatchdogAiHealthSummary] = useState<string>('');
  const [capturedWebsiteErrors, setCapturedWebsiteErrors] = useState<CapturedWebsiteError[]>(() =>
    getCapturedWebsiteErrors()
  );
  const watchdogLastGeminiScanRef = useRef<number>(0);
  const watchdogAlertsRef = useRef<WatchdogAlert[]>(watchdogAlerts);
  watchdogAlertsRef.current = watchdogAlerts;
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [analyticsCustomers, setAnalyticsCustomers] = useState<AnalyticsCustomer[]>([]);
  const [allCartItems, setAllCartItems] = useState<CartItem[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  const [popularSearches, setPopularSearches] = useState<PopularSearchItem[]>(() => getStoredPopularSearches());
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

  // Scheduled Offers System States
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  const [scheduledOffers, setScheduledOffers] = useState<ScheduledOffer[]>(() => getStoredScheduledOffers());
  const [selectedOfferForBuy, setSelectedOfferForBuy] = useState<ScheduledOffer | null>(null);
  const [offerFilterTab, setOfferFilterTab] = useState<'all' | 'scheduled' | 'active' | 'expired' | 'cancelled'>('all');
  const [isAddingOffer, setIsAddingOffer] = useState<boolean>(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [offerSaving, setOfferSaving] = useState<boolean>(false);
  const [offerPreviewModalOpen, setOfferPreviewModalOpen] = useState<boolean>(false);
  const [offerForm, setOfferForm] = useState({
    productId: '',
    title: '',
    originalPrice: '',
    discountedPrice: '',
    startAt: toDatetimeLocalString(new Date()),
    endAt: toDatetimeLocalString(new Date(Date.now() + 24 * 3600 * 1000)),
    isDraft: false,
  });

  // Festival-Wide Discount Campaign System States
  const [discountCampaigns, setDiscountCampaigns] = useState<DiscountCampaign[]>(() => getStoredDiscountCampaigns());
  const [campaignFilterTab, setCampaignFilterTab] = useState<'all' | 'active' | 'scheduled' | 'drafts' | 'expired' | 'cancelled'>('all');
  const [isAddingCampaign, setIsAddingCampaign] = useState<boolean>(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignSaving, setCampaignSaving] = useState<boolean>(false);
  const [campaignPreviewModalOpen, setCampaignPreviewModalOpen] = useState<boolean>(false);
  const [campaignForm, setCampaignForm] = useState<{
    name: string;
    description: string;
    bannerImageUrl: string;
    discountType: CampaignDiscountType;
    discountValue: string;
    targetScope: CampaignTargetScope;
    targetCategories: string[];
    targetProductIds: string[];
    startAt: string;
    endAt: string;
    isDraft: boolean;
    autoIncludeNewProducts: boolean;
    allowConflictOverride: boolean;
  }>({
    name: 'Diwali Dhamaka Sale',
    description: 'Special festive celebration across our toy shelves! Limited time savings for all kids.',
    bannerImageUrl: 'diwali',
    discountType: 'percentage',
    discountValue: '20',
    targetScope: 'all',
    targetCategories: [],
    targetProductIds: [],
    startAt: toDatetimeLocalString(new Date()),
    endAt: toDatetimeLocalString(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
    isDraft: false,
    autoIncludeNewProducts: true,
    allowConflictOverride: false,
  });
  const [campaignProductSearch, setCampaignProductSearch] = useState<string>('');
  const [customerActiveCampaignId, setCustomerActiveCampaignId] = useState<string>('all');

  // Active discount campaigns evaluated against reliable currentTime (ticks every 1s)
  const activeDiscountCampaigns = useMemo(() => {
    return discountCampaigns.filter(
      (c) => !c.deleted && !c.cancelled && computeCampaignStatus(c, currentTime) === 'Active'
    );
  }, [discountCampaigns, currentTime]);

  // Selected or primary active campaign for the customer homepage showcase
  const selectedCustomerCampaign = useMemo(() => {
    if (customerActiveCampaignId !== 'all') {
      const found = activeDiscountCampaigns.find((c) => c.id === customerActiveCampaignId);
      if (found) return found;
    }
    return activeDiscountCampaigns.length > 0 ? activeDiscountCampaigns[0] : null;
  }, [customerActiveCampaignId, activeDiscountCampaigns]);

  const primaryActiveCampaign = selectedCustomerCampaign;

  // Real-time conflict detector for the campaign creation form
  const detectedCampaignConflicts = useMemo<CampaignConflict[]>(() => {
    if (!isAddingCampaign) return [];
    try {
      const sDate = new Date(campaignForm.startAt);
      const eDate = new Date(campaignForm.endAt);
      if (isNaN(sDate.getTime()) || isNaN(eDate.getTime()) || eDate.getTime() <= sDate.getTime()) {
        return [];
      }
      return detectCampaignConflicts(
        {
          id: editingCampaignId || undefined,
          targetScope: campaignForm.targetScope,
          targetCategories: campaignForm.targetCategories,
          targetProductIds: campaignForm.targetProductIds,
          startAt: sDate.toISOString(),
          endAt: eDate.toISOString(),
        },
        discountCampaigns,
        products,
        currentTime
      );
    } catch {
      return [];
    }
  }, [
    isAddingCampaign,
    editingCampaignId,
    campaignForm.targetScope,
    campaignForm.targetCategories,
    campaignForm.targetProductIds,
    campaignForm.startAt,
    campaignForm.endAt,
    discountCampaigns,
    products,
    currentTime,
  ]);

  // Active scheduled offers for customer storefront (calculated with reliable currentTime)
  const activeScheduledOffers = useMemo(() => {
    return scheduledOffers.filter(
      (o) => !o.deleted && !o.claimed && computeOfferStatus(o, currentTime) === 'Active'
    );
  }, [scheduledOffers, currentTime]);

  // Lookup map for quick catalog badge/price overlay
  const activeOffersByProductId = useMemo(() => {
    const map = new Map<string, ScheduledOffer>();
    for (const offer of activeScheduledOffers) {
      if (offer.productId && !map.has(offer.productId)) {
        map.set(offer.productId, offer);
      }
    }
    return map;
  }, [activeScheduledOffers]);

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
  const [orderStatusFilter, setOrderStatusFilter] = useState<'Pending' | 'Flagged' | 'Completed' | 'Cancelled'>('Pending');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [highlightedOwnerOrderId, setHighlightedOwnerOrderId] = useState<string | null>(null);
  const [inspectingOrderId, setInspectingOrderId] = useState<string | null>(null);
  const [orderDecisionSavingId, setOrderDecisionSavingId] = useState<string | null>(null);
  const [clarifyingCustomerOrderId, setClarifyingCustomerOrderId] = useState<string | null>(null);
  const [customerClarifyReplyDraft, setCustomerClarifyReplyDraft] = useState<string>('');
  const [customerClarifyPhoneDraft, setCustomerClarifyPhoneDraft] = useState<string>('');
  const [customerClarifyAddressDraft, setCustomerClarifyAddressDraft] = useState<string>('');
  const [customerClarifyClassDraft, setCustomerClarifyClassDraft] = useState<string>('');
  const [customerClarifySectionDraft, setCustomerClarifySectionDraft] = useState<string>('');
  const [savingCustomerClarifyId, setSavingCustomerClarifyId] = useState<string | null>(null);

  const isOrderFlaggedForOwner = (o: Order): boolean => {
    const v = o.aiVerification;
    if (!v) return false;
    if (v.decisionStatus === 'approved' || v.decisionStatus === 'rejected') return false;
    if (v.riskLevel === 'HIGH' || v.riskLevel === 'MEDIUM') return true;
    if (v.decisionStatus === 'pending_review' || v.decisionStatus === 'clarification_requested') return true;
    if (
      o.status === 'On Hold (AI Review)' ||
      o.status === 'Awaiting Clarification' ||
      o.status === 'Clarification Submitted'
    ) {
      return true;
    }
    return false;
  };

  const flaggedOrdersForOwner = useMemo(() => {
    return ownerOrders
      .filter(isOrderFlaggedForOwner)
      .sort((a, b) => {
        const rank = (o: Order) =>
          o.aiVerification?.riskLevel === 'HIGH' ? 0 : o.aiVerification?.riskLevel === 'MEDIUM' ? 1 : 2;
        const rDiff = rank(a) - rank(b);
        if (rDiff !== 0) return rDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [ownerOrders]);

  const filteredOwnerOrders = useMemo(() => {
    const q = orderSearchQuery.trim().toLowerCase();
    return ownerOrders.filter((o) => {
      const matchesStatus =
        orderStatusFilter === 'Pending'
          ? !['Completed', 'Delivered', 'Collected', 'Cancelled'].includes(o.status)
          : orderStatusFilter === 'Flagged'
          ? isOrderFlaggedForOwner(o)
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
  const [filamentCostPerGram, setFilamentCostPerGram] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('playnix_filament_cost_per_gram');
      if (!saved) return null;
      const parsed = Number(saved);
      return isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
    } catch {
      return null;
    }
  });
  const [filamentCostInput, setFilamentCostInput] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('playnix_filament_cost_per_gram');
      if (!saved) return '';
      const parsed = Number(saved);
      return isFinite(parsed) && parsed > 0 ? String(Math.round(parsed * 100) / 100) : '';
    } catch {
      return '';
    }
  });
  const [filamentCostSaving, setFilamentCostSaving] = useState<boolean>(false);
  const [filamentCostFeedback, setFilamentCostFeedback] = useState<{
    message: string;
    isError?: boolean;
  } | null>(null);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [editExistingImages, setEditExistingImages] = useState<string[]>([]);
  const [productSubmitTarget, setProductSubmitTarget] = useState<'published' | 'draft'>('published');
  const editingProduct = useMemo(
    () => (editingProductId ? products.find((p) => p.id === editingProductId) || null : null),
    [editingProductId, products]
  );
  const [successMessage, setSuccessMessage] = useState<string>('');
  const guestCustomerId = useMemo(() => getCustomerKey(), []);
  const [guestProvidedName, setGuestProvidedName] = useState<string>(() =>
    getStoredGuestName(getCustomerKey())
  );
  const lastSyncedGuestNameRef = useRef<string>('');
  const customerId = guestCustomerId;
  const [cartItems, setCartItems] = useState<CartItem[]>(() => getStoredCart(getCustomerKey()));
  const cartItemsRef = useRef<CartItem[]>(cartItems);
  cartItemsRef.current = cartItems;
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [cartToastMessage, setCartToastMessage] = useState<string>('');
  const [cartAnimKey, setCartAnimKey] = useState<number>(0);
  const [isCartBouncing, setIsCartBouncing] = useState<boolean>(false);
  const [justAddedProductId, setJustAddedProductId] = useState<string | null>(null);
  const [orderSuccessCelebration, setOrderSuccessCelebration] = useState<OrderCelebrationData | null>(null);
  const cartBounceTimerRef = useRef<number | null>(null);
  const justAddedTimerRef = useRef<number | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState<boolean>(false);
  const [myOrdersError, setMyOrdersError] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [hasStatusUpdateNotification, setHasStatusUpdateNotification] = useState<boolean>(false);
  const [hasOwnerOrderNotification, setHasOwnerOrderNotification] = useState<boolean>(false);
  const [ownerNewOrdersCount, setOwnerNewOrdersCount] = useState<number>(0);
  const [deletingCustomerOrderId, setDeletingCustomerOrderId] = useState<string | null>(null);
  const [editingCustomerNoteOrderId, setEditingCustomerNoteOrderId] = useState<string | null>(null);
  const [customerNoteDraft, setCustomerNoteDraft] = useState<string>('');
  const [savingCustomerNoteOrderId, setSavingCustomerNoteOrderId] = useState<string | null>(null);
  const [customerNoteSuccessId, setCustomerNoteSuccessId] = useState<string | null>(null);

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

  const mergePreservingFullGalleries = (
    incoming: Product[],
    existing: Product[],
    options: { replaceCatalog?: boolean } = {}
  ): Product[] => {
    const existingById = new Map(existing.map((p) => [p.id, p]));
    const normalizedIncoming = incoming.map((p) => {
      const prev = existingById.get(p.id);
      if (
        prev &&
        !prev.isSummaryOnly &&
        Array.isArray(prev.imageUrls) &&
        prev.imageUrls.length > 1 &&
        p.isSummaryOnly
      ) {
        return {
          ...p,
          imageUrls: prev.imageUrls,
          imageUrl: prev.imageUrl || p.imageUrl,
          photoCount: prev.imageUrls.length,
          isSummaryOnly: false,
        };
      }
      return p;
    });

    if (options.replaceCatalog) {
      return normalizedIncoming;
    }

    const incomingIds = new Set(normalizedIncoming.map((p) => p.id));
    return [...normalizedIncoming, ...existing.filter((p) => !incomingIds.has(p.id))].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  };

  const loadProducts = async (options: { forceRefresh?: boolean } = {}) => {
    setProductsLoading(true);
    setProductsError(null);
    if (options.forceRefresh) {
      allSummariesLoadedRef.current = false;
      invalidateFirestoreCache('products:');
    }
    try {
      const pageRes = await fetchProductsPageFromCloud({
        pageSize: 12,
        forceRefresh: options.forceRefresh,
      });

      if (pageRes.degradedOffline) {
        setProductsError('Showing saved toys — live cloud sync is temporarily unavailable.');
      }

      if (Array.isArray(pageRes.products) && pageRes.products.length > 0) {
        const shouldReplace = !pageRes.hasMore;
        setProducts((prev) => {
          const next = mergePreservingFullGalleries(pageRes.products, prev, {
            replaceCatalog: shouldReplace,
          });
          saveStoredProducts(next);
          return next;
        });
        setHasMoreProducts(pageRes.hasMore);
        setProductsNextCursor(pageRes.nextCursorCreatedAt);
        setCloudProductsLoaded(true);
        setProductsLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Could not load products from cloud:', err);
      setProductsError('Could not reach Playnix cloud right now. Showing saved toys.');
    }

    try {
      const res = await api.get('/api/products');
      if (res.data?.products && Array.isArray(res.data.products) && res.data.products.length > 0) {
        setProducts((prev) => {
          const next = mergePreservingFullGalleries(res.data.products, prev, {
            replaceCatalog: true,
          });
          saveStoredProducts(next);
          return next;
        });
        setHasMoreProducts(false);
        setProductsNextCursor(null);
        setProductsError(null);
        setCloudProductsLoaded(true);
        setProductsLoading(false);
        return;
      }
    } catch {}

    setProducts(getStoredProducts());
    setCloudProductsLoaded(true);
    setProductsLoading(false);
  };

  const loadMoreProducts = async () => {
    if (loadingMoreProducts || !hasMoreProducts || !productsNextCursor) return;
    setLoadingMoreProducts(true);
    try {
      const nextRes = await fetchProductsPageFromCloud({
        pageSize: 12,
        cursorCreatedAt: productsNextCursor,
      });
      if (Array.isArray(nextRes.products) && nextRes.products.length > 0) {
        setProducts((prev) => {
          const next = mergePreservingFullGalleries(nextRes.products, prev);
          saveStoredProducts(next);
          return next;
        });
      }
      setHasMoreProducts(nextRes.hasMore);
      setProductsNextCursor(nextRes.nextCursorCreatedAt);
      if (!nextRes.hasMore) {
        allSummariesLoadedRef.current = true;
      }
    } catch (err) {
      console.warn('Could not load more products:', err);
    } finally {
      setLoadingMoreProducts(false);
    }
  };

  const ensureAllProductSummariesLoaded = async (forceRefresh = false) => {
    if (!forceRefresh && (allSummariesLoadedRef.current || !hasMoreProducts)) return;
    const now = Date.now();
    if (!forceRefresh && (searchCloudSyncing || now - lastSearchCloudSyncAt < 30000)) return;
    setSearchCloudSyncing(true);
    try {
      const cloudSummaries = await fetchAllProductSummariesFromCloud({ forceRefresh });
      if (Array.isArray(cloudSummaries) && cloudSummaries.length > 0) {
        setProducts((prev) => {
          const next = mergePreservingFullGalleries(cloudSummaries, prev, {
            replaceCatalog: true,
          });
          saveStoredProducts(next);
          return next;
        });
        setHasMoreProducts(false);
        setProductsNextCursor(null);
        allSummariesLoadedRef.current = true;
      }
      setLastSearchCloudSyncAt(Date.now());
    } catch (err) {
      console.warn('Catalog summary sync notice:', err);
    } finally {
      setSearchCloudSyncing(false);
    }
  };

  const hydrateSingleProductGallery = async (productId: string) => {
    if (!productId) return;
    try {
      const fullProd = await fetchProductByIdFromCloud(productId);
      if (!fullProd) return;
      setProducts((prev) =>
        prev.map((item) => (item.id === fullProd.id ? fullProd : item))
      );
      setSelectedProductForDetail((curr) =>
        curr && curr.id === fullProd.id ? fullProd : curr
      );
      setGalleryProduct((curr) =>
        curr && curr.id === fullProd.id ? fullProd : curr
      );
    } catch {}
  };

  const ensureCloudProductsForSearch = async () => {
    await ensureAllProductSummariesLoaded(false);
  };

  const loadOwnerProducts = async (forceRefresh = false) => {
    try {
      const cloudProds = await fetchProductsFromCloud({ forceRefresh });
      if (Array.isArray(cloudProds) && cloudProds.length > 0) {
        setProducts(cloudProds);
        setHasMoreProducts(false);
        setProductsNextCursor(null);
        allSummariesLoadedRef.current = true;
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

  const loadOwnerProductQuestions = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    setQuestionsLoading(true);
    try {
      const list = await fetchAllProductQuestionsFromCloud();
      setOwnerProductQuestions(list);
      saveStoredProductQuestions(list);
    } catch (err) {
      console.warn('Could not load owner product questions:', err);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleSaveQuestionAnswer = async (
    questionId: string,
    answer: string,
    status: ProductQuestionStatus
  ) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    await answerProductQuestionInCloud(questionId, answer, status);
    const nowIso = new Date().toISOString();
    setOwnerProductQuestions((prev) => {
      const next = prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              answer: answer.trim(),
              status,
              answeredAt: status === 'Answered' ? nowIso : '',
              updatedAt: nowIso,
            }
          : q
      );
      saveStoredProductQuestions(next);
      return next;
    });
  };

  const handleMarkQuestionStatus = async (
    questionId: string,
    status: ProductQuestionStatus
  ) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    await updateProductQuestionStatusInCloud(questionId, status);
    const nowIso = new Date().toISOString();
    setOwnerProductQuestions((prev) => {
      const next = prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              status,
              answeredAt: status === 'Answered' ? nowIso : '',
              updatedAt: nowIso,
            }
          : q
      );
      saveStoredProductQuestions(next);
      return next;
    });
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    await deleteProductQuestionFromCloud(questionId);
    setOwnerProductQuestions((prev) => {
      const next = prev.filter((q) => q.id !== questionId);
      saveStoredProductQuestions(next);
      return next;
    });
  };

  // ----------------- PLAYNIX AI ASSISTANT HANDLERS (OWNER ONLY) -----------------
  const checkAiServerStatus = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    try {
      const res = await ownerPost('/api/owner/ai/status', {});
      setAiGeminiStatus({
        checked: true,
        geminiConfigured: Boolean(res.data?.geminiConfigured),
        model: res.data?.model,
        backendError: undefined,
      });
    } catch (err: any) {
      setAiGeminiStatus((prev) => ({
        ...prev,
        checked: true,
        backendError:
          err?.message || 'Could not reach Playnix AI server backend (/api/owner/ai/status).',
      }));
    }
  };

  const loadOwnerAiData = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    try {
      const [cloudState, cloudKnowledge, cloudTraining, cloudGuidance, cloudLearning] = await Promise.all([
        fetchAiAssistantStateFromCloud(),
        fetchAiKnowledgeFromCloud(),
        fetchAiTrainingAnswersFromCloud(),
        fetchAiGuidanceQuestionsFromCloud(),
        fetchAiOwnerLearningRecordsFromCloud(),
      ]);
      setAiState(cloudState);
      saveStoredAiState(cloudState);
      setAiKnowledge(cloudKnowledge);
      saveStoredAiKnowledge(cloudKnowledge);
      setAiTrainingAnswers(cloudTraining);
      saveStoredAiTrainingAnswers(cloudTraining);
      setAiGuidanceQuestions(cloudGuidance);
      saveStoredAiGuidanceQuestions(cloudGuidance);
      if (Array.isArray(cloudLearning)) {
        setAiOwnerLearningRecords(cloudLearning);
      }
    } catch (err) {
      console.warn('Could not load Playnix AI data from Firebase:', err);
    }
    await checkAiServerStatus();
  };

  const openAiRejectionFeedback = (draft: PendingAiRejectionDraft) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    setPendingAiRejection(draft);
  };

  const handleCreateAiLearningRecord = async (input: {
    featureKey: AiLearningFeatureKey;
    featureName?: string;
    originalRequest: string;
    rejectedResponse: string;
    ownerCorrection: string;
    productId?: string;
    productName?: string;
  }) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    const created = await createAiOwnerLearningRecordInCloud(input);
    setAiOwnerLearningRecords((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
    setSuccessMessage('Saved owner correction privately for Playnix AI.');
  };

  const triggerWebsiteAiScan = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    setAiScanning(true);
    setAiScanFeedback(null);
    try {
      const answeredQuestions = ownerProductQuestions
        .filter((q) => q.status === 'Answered' && q.answer?.trim())
        .map((q) => ({
          id: q.id,
          productId: q.productId,
          productName: q.productName,
          question: q.question,
          answer: q.answer,
          status: q.status,
        }));

      const lightweightProducts = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        description: p.description,
        available: p.available,
        imageCount: Array.isArray(p.imageUrls)
          ? p.imageUrls.length
          : p.imageUrl
          ? 1
          : 0,
      }));
      const lightweightDeals = rescueDeals.map((d) => ({
        id: d.id,
        title: d.title,
        dealPrice: d.dealPrice,
        originalPrice: d.originalPrice,
        condition: d.condition,
        deleted: d.deleted,
        claimed: d.claimed,
        status: d.status,
      }));
      const lightweightOffers = scheduledOffers.map((o) => ({
        id: o.id,
        title: o.title,
        productName: o.productName,
        discountedPrice: o.discountedPrice,
        originalPrice: o.originalPrice,
        startAt: o.startAt,
        endAt: o.endAt,
        deleted: o.deleted,
        cancelled: o.cancelled,
        isDraft: o.isDraft,
        claimed: o.claimed,
      }));

      const res = await ownerPost('/api/owner/ai/scan', {
        products: lightweightProducts,
        rescueDeals: lightweightDeals,
        scheduledOffers: lightweightOffers,
        discountCampaigns,
        shopModes: { adultPublished, childPublished },
        availableColours,
        answeredQuestions,
        existingTrainingAnswers: aiTrainingAnswers,
        relevantLearningRecords: buildCompactLearningPayload(aiOwnerLearningRecords, {
          featureKey: 'website_scanner',
          requestText: 'website catalog summary highlights missing info scan',
        }),
      });

      const data = res.data || {};
      const websiteEntries: AiKnowledgeEntry[] = Array.isArray(data.websiteEntries)
        ? data.websiteEntries
        : [];
      const nowIso = data.scannedAt || new Date().toISOString();

      await replaceWebsiteScanKnowledgeInCloud(websiteEntries);

      setAiKnowledge((prev) => {
        const ownerOnly = prev.filter((e) => e.source === 'owner');
        const next = [...ownerOnly, ...websiteEntries].sort(
          (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        );
        saveStoredAiKnowledge(next);
        return next;
      });

      const nextState: AiAssistantState = {
        ...aiState,
        id: 'config',
        hasCompletedInitialScan: true,
        lastScannedAt: nowIso,
        scanSummary: data.scanSummary || aiState.scanSummary,
        learnedHighlights: Array.isArray(data.learnedHighlights)
          ? data.learnedHighlights
          : aiState.learnedHighlights,
        missingInfoItems: Array.isArray(data.missingInfoItems)
          ? data.missingInfoItems
          : aiState.missingInfoItems,
        geminiConfigured: Boolean(data.geminiConfigured),
        updatedAt: nowIso,
      };
      setAiState(nextState);
      saveStoredAiState(nextState);
      await saveAiAssistantStateToCloud(nextState);
      setAiGeminiStatus((prev) => ({
        ...prev,
        checked: true,
        geminiConfigured: Boolean(data.geminiConfigured),
        backendError: undefined,
      }));

      setAiScanFeedback({
        message: data.usedGemini
          ? `Website scanned with Gemini AI — ${websiteEntries.length} verified knowledge entries updated.`
          : `Website scanned factually — ${websiteEntries.length} verified entries saved. ${data.geminiStatusNote || ''}`.trim(),
        isError: false,
      });

      // Automatically generate any open help/guidance questions AI needs from the owner
      void handleRequestAiGuidance(true);
    } catch (err: any) {
      setAiScanFeedback({
        message:
          err?.response?.data?.error ||
          err?.message ||
          'Could not complete website scan. Please check connection and retry.',
        isError: true,
      });
    } finally {
      setAiScanning(false);
    }
  };

  const handleToggleAiEnabled = async (nextEnabled: boolean) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    const nowIso = new Date().toISOString();
    const nextState: AiAssistantState = {
      ...aiState,
      enabled: nextEnabled,
      updatedAt: nowIso,
    };
    setAiState(nextState);
    saveStoredAiState(nextState);
    await saveAiAssistantStateToCloud(nextState);
  };

  const handleSaveAiBehaviorSettings = async (settings: {
    responseStyleMode: AiResponseStyleMode;
    customInstructions: string;
  }) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    const nowIso = new Date().toISOString();
    const nextState: AiAssistantState = {
      ...aiState,
      responseStyleMode: settings.responseStyleMode,
      customInstructions: settings.customInstructions.trim().slice(0, 2000),
      updatedAt: nowIso,
    };
    setAiState(nextState);
    saveStoredAiState(nextState);
    await saveAiAssistantStateToCloud(nextState);
  };

  const handleSaveAiKnowledgeEntry = async (
    entryInput: Omit<AiKnowledgeEntry, 'createdAt' | 'updatedAt'> & {
      createdAt?: string;
      updatedAt?: string;
    }
  ) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    const nowIso = new Date().toISOString();
    const fullEntry: AiKnowledgeEntry = {
      ...entryInput,
      createdAt: entryInput.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await saveAiKnowledgeEntryToCloud(fullEntry);
    setAiKnowledge((prev) => {
      const filtered = prev.filter((e) => e.id !== fullEntry.id);
      const next = [fullEntry, ...filtered].sort(
        (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      );
      saveStoredAiKnowledge(next);
      return next;
    });
  };

  const handleDeleteAiKnowledgeEntry = async (entryId: string) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    await deleteAiKnowledgeEntryFromCloud(entryId);
    setAiKnowledge((prev) => {
      const next = prev.filter((e) => e.id !== entryId);
      saveStoredAiKnowledge(next);
      return next;
    });
  };

  const handleSaveTrainingAnswer = async (
    stepKey: AiTrainingStepKey,
    answer: string,
    status: 'answered' | 'skipped',
    nextStepIndex: number,
    finishTraining = false
  ) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    const def = PLAYNIX_TRAINING_QUESTIONS.find((q) => q.stepKey === stepKey);
    if (!def) return;

    const nowIso = new Date().toISOString();
    const existingAns = aiTrainingAnswers.find((a) => a.stepKey === stepKey);
    const answerObj: AiTrainingAnswer = {
      id: stepKey,
      stepKey,
      question: def.question,
      answer: answer.trim(),
      status,
      createdAt: existingAns?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await saveAiTrainingAnswerToCloud(answerObj);
    const updatedAnswers = [
      ...aiTrainingAnswers.filter((a) => a.stepKey !== stepKey),
      answerObj,
    ];
    setAiTrainingAnswers(updatedAnswers);
    saveStoredAiTrainingAnswers(updatedAnswers);

    const knowId = `owner_train_${stepKey}`;
    if (status === 'answered' && answer.trim()) {
      await handleSaveAiKnowledgeEntry({
        id: knowId,
        title: def.title,
        content: answer.trim(),
        category: def.category,
        source: 'owner',
        trainingStepKey: stepKey,
        verified: true,
      });
    } else if (status === 'skipped' && !answer.trim()) {
      const existingKnow = aiKnowledge.find((k) => k.id === knowId);
      if (existingKnow) {
        await handleDeleteAiKnowledgeEntry(knowId);
      }
    }

    const nextState: AiAssistantState = {
      ...aiState,
      trainingStatus: finishTraining ? 'completed' : 'in_progress',
      trainingCurrentStepIndex: Math.max(
        0,
        Math.min(PLAYNIX_TRAINING_QUESTIONS.length - 1, nextStepIndex)
      ),
      trainingCompletedAt: finishTraining ? nowIso : aiState.trainingCompletedAt,
      updatedAt: nowIso,
    };
    setAiState(nextState);
    saveStoredAiState(nextState);
    await saveAiAssistantStateToCloud(nextState);
  };

  const handleFinishTraining = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    const nowIso = new Date().toISOString();
    const nextState: AiAssistantState = {
      ...aiState,
      trainingStatus: 'completed',
      trainingCompletedAt: nowIso,
      updatedAt: nowIso,
    };
    setAiState(nextState);
    saveStoredAiState(nextState);
    await saveAiAssistantStateToCloud(nextState);
  };

  const handleJumpTrainingStep = async (stepIndex: number) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    const clamped = Math.max(0, Math.min(PLAYNIX_TRAINING_QUESTIONS.length - 1, stepIndex));
    const nextState: AiAssistantState = {
      ...aiState,
      trainingCurrentStepIndex: clamped,
      updatedAt: new Date().toISOString(),
    };
    setAiState(nextState);
    saveStoredAiState(nextState);
    await saveAiAssistantStateToCloud(nextState);
  };

  const recordAiGuidanceQuestion = async (input: {
    id?: string;
    question: string;
    context?: string;
    category?: AiKnowledgeEntry['category'];
    source: AiGuidanceQuestion['source'];
    productId?: string;
    productName?: string;
    customerQuestionId?: string;
  }) => {
    const cleanQuestion = String(input.question || '').trim().slice(0, 500);
    if (!cleanQuestion) return null;
    const norm = cleanQuestion.toLowerCase();
    const existing = aiGuidanceQuestions.find(
      (g) =>
        g.question.trim().toLowerCase() === norm ||
        (input.customerQuestionId &&
          g.customerQuestionId === input.customerQuestionId &&
          g.status !== 'dismissed')
    );
    if (existing) return existing;

    const nowIso = new Date().toISOString();
    const safeId = (
      input.id ||
      `guide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    )
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 128);

    const newEntry: AiGuidanceQuestion = {
      id: safeId,
      question: cleanQuestion,
      context: input.context ? String(input.context).trim().slice(0, 600) : undefined,
      category: input.category || 'product_spec',
      source: input.source,
      productId: input.productId || undefined,
      productName: input.productName || undefined,
      customerQuestionId: input.customerQuestionId || undefined,
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setAiGuidanceQuestions((prev) => {
      if (prev.some((g) => g.id === newEntry.id || g.question.trim().toLowerCase() === norm)) {
        return prev;
      }
      const next = [newEntry, ...prev];
      saveStoredAiGuidanceQuestions(next);
      return next;
    });
    await saveAiGuidanceQuestionToCloud(newEntry);
    return newEntry;
  };

  const handleRequestAiGuidance = async (silent = false) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return 0;
    if (!silent) setAiGuidanceLoading(true);
    try {
      const pendingQs = ownerProductQuestions
        .filter((q) => q.status === 'Pending')
        .map((q) => ({
          id: q.id,
          productId: q.productId,
          productName: q.productName,
          question: q.question,
        }));

      // Preserve chronological conversation history across consecutive Ask AI requests
      const orderedHistory = [...aiGuidanceQuestions].sort(
        (a, b) =>
          new Date(a.createdAt || a.updatedAt || 0).getTime() -
          new Date(b.createdAt || b.updatedAt || 0).getTime()
      );

      const res = await ownerPost('/api/owner/ai/ask-guidance', {
        conversationId: 'playnix_owner_ask_ai',
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          available: p.available,
          description: p.description,
        })),
        pendingQuestions: pendingQs,
        knowledgeEntries: aiKnowledge.slice(0, 100),
        trainingAnswers: aiTrainingAnswers,
        existingGuidanceQuestions: orderedHistory,
        conversationHistory: orderedHistory.map((g) => ({
          id: g.id,
          question: g.question,
          answer: g.answer,
          status: g.status,
          category: g.category,
          productId: g.productId,
          productName: g.productName,
          context: g.context,
          createdAt: g.createdAt,
          answeredAt: g.answeredAt,
          updatedAt: g.updatedAt,
        })),
        relevantLearningRecords: buildCompactLearningPayload(aiOwnerLearningRecords, {
          featureKey: 'ai_guidance',
          requestText: pendingQs.map((q) => q.question).join(' '),
        }),
      });
      const list = Array.isArray(res.data?.questions) ? res.data.questions : [];
      let addedCount = 0;
      for (const item of list) {
        const created = await recordAiGuidanceQuestion({
          id: item.id,
          question: item.question,
          context: item.context,
          category: item.category,
          source: item.source || 'ai_audit',
          productId: item.productId,
          productName: item.productName,
          customerQuestionId: item.customerQuestionId,
        });
        if (created) addedCount++;
      }
      return addedCount;
    } catch (err) {
      if (!silent) console.warn('Could not ask AI for guidance questions:', err);
      return 0;
    } finally {
      if (!silent) setAiGuidanceLoading(false);
    }
  };

  const handleAnswerAiGuidanceQuestion = async (questionId: string, answerText: string) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    const cleanAnswer = answerText.trim();
    if (!cleanAnswer) throw new Error('Please type your answer before saving.');
    const target = aiGuidanceQuestions.find((g) => g.id === questionId);
    if (!target) return;

    const nowIso = new Date().toISOString();
    const updatedItem: AiGuidanceQuestion = {
      ...target,
      answer: cleanAnswer.slice(0, 4000),
      status: 'answered',
      answeredAt: nowIso,
      updatedAt: nowIso,
    };

    await handleSaveAiKnowledgeEntry({
      id: `know_guide_${target.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
      title: target.question.slice(0, 200),
      content: `AI Question: ${target.question}\nOwner Guidance: ${cleanAnswer}`,
      category: target.category || 'product_spec',
      source: 'owner',
      productId: target.productId,
      productName: target.productName,
      verified: true,
    });

    await saveAiGuidanceQuestionToCloud(updatedItem);
    setAiGuidanceQuestions((prev) => {
      const next = [updatedItem, ...prev.filter((g) => g.id !== questionId)].sort(
        (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      );
      saveStoredAiGuidanceQuestions(next);
      return next;
    });

    // Keep backend Ask AI conversation history in sync immediately for consecutive requests
    void ownerPost('/api/owner/ai/ask-guidance/reply', {
      conversationId: 'playnix_owner_ask_ai',
      questionId: updatedItem.id,
      question: updatedItem.question,
      answer: updatedItem.answer,
      status: 'answered',
      productId: updatedItem.productId,
      productName: updatedItem.productName,
      category: updatedItem.category,
    }).catch(() => {});
  };

  const handleDismissAiGuidanceQuestion = async (questionId: string) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    const target = aiGuidanceQuestions.find((g) => g.id === questionId);
    if (!target) return;
    const updatedItem: AiGuidanceQuestion = {
      ...target,
      status: 'dismissed',
      updatedAt: new Date().toISOString(),
    };
    await saveAiGuidanceQuestionToCloud(updatedItem);
    setAiGuidanceQuestions((prev) => {
      const next = prev.map((g) => (g.id === questionId ? updatedItem : g));
      saveStoredAiGuidanceQuestions(next);
      return next;
    });

    void ownerPost('/api/owner/ai/ask-guidance/reply', {
      conversationId: 'playnix_owner_ask_ai',
      questionId: updatedItem.id,
      question: updatedItem.question,
      status: 'dismissed',
      productId: updatedItem.productId,
      productName: updatedItem.productName,
      category: updatedItem.category,
    }).catch(() => {});
  };

  const handleDeleteAiGuidanceQuestion = async (questionId: string) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    await deleteAiGuidanceQuestionFromCloud(questionId);
    setAiGuidanceQuestions((prev) => {
      const next = prev.filter((g) => g.id !== questionId);
      saveStoredAiGuidanceQuestions(next);
      return next;
    });
  };

  const handleTeachAiFromProductQuestion = async (
    questionObj: ProductQuestion,
    linkedProduct: Product | null,
    aiAskedQuestion: string,
    ownerAnswerText: string
  ) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    const cleanAnswer = ownerAnswerText.trim();
    if (!cleanAnswer) throw new Error('Enter the detail you want to teach Playnix AI.');
    const nowIso = new Date().toISOString();
    const guideId = `guide_cq_${questionObj.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    const guideDoc: AiGuidanceQuestion = {
      id: guideId,
      question: aiAskedQuestion.trim().slice(0, 500) || `Details for "${questionObj.productName}"`,
      context: `Customer asked: "${questionObj.question.slice(0, 200)}"`,
      category: 'product_spec',
      source: 'customer_question',
      productId: linkedProduct?.id || questionObj.productId,
      productName: linkedProduct?.name || questionObj.productName,
      customerQuestionId: questionObj.id,
      answer: cleanAnswer.slice(0, 4000),
      status: 'answered',
      createdAt: nowIso,
      answeredAt: nowIso,
      updatedAt: nowIso,
    };

    const knowEntryId = `know_guide_${guideId}`.slice(0, 128);
    await handleSaveAiKnowledgeEntry({
      id: knowEntryId,
      title: guideDoc.question.slice(0, 200),
      content: `Owner Note for ${guideDoc.productName}: ${cleanAnswer}`,
      category: 'product_spec',
      source: 'owner',
      productId: guideDoc.productId,
      productName: guideDoc.productName,
      verified: true,
    });
    await saveAiGuidanceQuestionToCloud(guideDoc);
    setAiGuidanceQuestions((prev) => {
      const next = [guideDoc, ...prev.filter((g) => g.id !== guideId)];
      saveStoredAiGuidanceQuestions(next);
      return next;
    });

    void ownerPost('/api/owner/ai/ask-guidance/reply', {
      conversationId: 'playnix_owner_ask_ai',
      questionId: guideDoc.id,
      question: guideDoc.question,
      answer: guideDoc.answer,
      status: 'answered',
      productId: guideDoc.productId,
      productName: guideDoc.productName,
      category: guideDoc.category,
    }).catch(() => {});

    // Re-run suggestion immediately using the newly taught verified knowledge entry
    const enrichedKnowledge: AiKnowledgeEntry[] = [
      {
        id: knowEntryId,
        title: guideDoc.question.slice(0, 200),
        content: `Owner Note for ${guideDoc.productName}: ${cleanAnswer}`,
        category: 'product_spec',
        source: 'owner',
        productId: guideDoc.productId,
        productName: guideDoc.productName,
        verified: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      ...aiKnowledge.filter((k) => k.id !== knowEntryId),
    ];

    let effectivePrice: number | undefined = linkedProduct?.price;
    let activeOfferLabel: string | undefined;
    if (linkedProduct) {
      const discount = calculateProductDiscount(linkedProduct, activeDiscountCampaigns);
      if (discount.hasDiscount) {
        effectivePrice = discount.discountedPrice;
        activeOfferLabel = discount.discountLabel || discount.campaignName;
      }
    }
    const updatedHistory = [
      ...aiGuidanceQuestions.filter((g) => g.id !== guideId),
      guideDoc,
    ];
    const res = await ownerPost('/api/owner/ai/suggest-answer', {
      conversationId: 'playnix_owner_ask_ai',
      product: linkedProduct
        ? {
            id: linkedProduct.id,
            name: linkedProduct.name,
            category: linkedProduct.category,
            price: linkedProduct.price,
            available: linkedProduct.available,
            description: linkedProduct.description,
            imageCount: Array.isArray(linkedProduct.imageUrls)
              ? linkedProduct.imageUrls.length
              : linkedProduct.imageUrl
              ? 1
              : 0,
          }
        : null,
      productId: linkedProduct?.id || questionObj.productId,
      productName: linkedProduct?.name || questionObj.productName,
      effectivePrice,
      activeOfferLabel,
      availableColours,
      question: questionObj.question,
      knowledgeEntries: enrichedKnowledge,
      trainingAnswers: aiTrainingAnswers,
      existingGuidanceQuestions: updatedHistory,
      responseStyleMode: aiState.responseStyleMode || 'balanced',
      customInstructions: aiState.customInstructions || '',
      relevantLearningRecords: buildCompactLearningPayload(aiOwnerLearningRecords, {
        featureKey: 'product_question_reply',
        requestText: questionObj.question,
        productId: linkedProduct?.id || questionObj.productId,
        productName: linkedProduct?.name || questionObj.productName,
      }),
    });
    return res.data;
  };

  const runGroundedAiSuggestion = async (
    product: Product | null,
    questionText: string,
    endpoint: '/api/owner/ai/suggest-answer' | '/api/owner/ai/test-question',
    fallbackProductId?: string,
    fallbackProductName?: string,
    customerQuestionId?: string
  ): Promise<{
    success: boolean;
    geminiConfigured?: boolean;
    errorCategory?: 'network' | 'quota' | 'auth' | 'server_temporary';
    retryable?: boolean;
    error?: string;
    suggestion?: AiSuggestedReplyResult;
  }> => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      return {
        success: false,
        geminiConfigured: aiGeminiStatus.geminiConfigured,
        errorCategory: 'auth',
        retryable: false,
        error: 'API authentication error: AI configuration needs attention.',
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        success: false,
        geminiConfigured: aiGeminiStatus.geminiConfigured,
        errorCategory: 'network',
        retryable: true,
        error: 'Network issue: Check your internet connection.',
      };
    }

    let effectivePrice: number | undefined = product?.price;
    let activeOfferLabel: string | undefined;
    if (product) {
      const discount = calculateProductDiscount(product, activeDiscountCampaigns);
      if (discount.hasDiscount) {
        effectivePrice = discount.discountedPrice;
        activeOfferLabel = discount.discountLabel || discount.campaignName;
      }
    }

    const lightweightProduct = product
      ? {
          id: product.id,
          name: product.name,
          category: product.category,
          price: product.price,
          available: product.available,
          description: product.description,
          imageCount: Array.isArray(product.imageUrls)
            ? product.imageUrls.length
            : product.imageUrl
            ? 1
            : 0,
        }
      : null;

    try {
      const res = await ownerPost(
        endpoint,
        {
          conversationId: 'playnix_owner_ask_ai',
          product: lightweightProduct,
          productId: product?.id || fallbackProductId,
          productName: product?.name || fallbackProductName,
          effectivePrice,
          activeOfferLabel,
          availableColours,
          question: questionText,
          knowledgeEntries: aiKnowledge,
          trainingAnswers: aiTrainingAnswers,
          existingGuidanceQuestions: aiGuidanceQuestions,
          responseStyleMode: aiState.responseStyleMode || 'balanced',
          customInstructions: aiState.customInstructions || '',
          relevantLearningRecords: buildCompactLearningPayload(aiOwnerLearningRecords, {
            featureKey:
              endpoint === '/api/owner/ai/test-question' ? 'test_question' : 'product_question_reply',
            requestText: questionText,
            productId: product?.id || fallbackProductId,
            productName: product?.name || fallbackProductName,
          }),
        },
        { timeoutMs: 24000 }
      );

      if (typeof res.data?.geminiConfigured === 'boolean') {
        setAiGeminiStatus((prev) => ({
          ...prev,
          checked: true,
          geminiConfigured: Boolean(res.data.geminiConfigured),
        }));
      }

      // If AI detected missing info on a customer question, automatically log a help question for the owner
      const sug: AiSuggestedReplyResult | undefined = res.data?.suggestion;
      if (
        endpoint === '/api/owner/ai/suggest-answer' &&
        res.data?.success &&
        sug &&
        sug.groundingStatus !== 'verified'
      ) {
        const helpQ =
          (sug.ownerClarificationQuestion || '').trim() ||
          (sug.missingInfoNote
            ? `Missing info for "${product?.name || fallbackProductName || 'Product'}": ${sug.missingInfoNote}`
            : '');
        if (helpQ) {
          void recordAiGuidanceQuestion({
            id: customerQuestionId ? `guide_cq_${customerQuestionId}` : undefined,
            question: helpQ,
            context: `Customer asked on "${product?.name || fallbackProductName || 'Product'}": "${questionText.slice(0, 180)}"`,
            category: 'product_spec',
            source: 'customer_question',
            productId: product?.id || fallbackProductId,
            productName: product?.name || fallbackProductName,
            customerQuestionId,
          });
        }
      }

      return res.data;
    } catch (err: any) {
      const msgLower = String(err?.message || '').toLowerCase();
      const status = typeof err?.status === 'number' ? err.status : undefined;
      if (
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        err?.name === 'TypeError' ||
        /failed to fetch|networkerror|load failed|internet disconnected/.test(msgLower)
      ) {
        return {
          success: false,
          geminiConfigured: aiGeminiStatus.geminiConfigured,
          errorCategory: 'network',
          retryable: true,
          error: 'Network issue: Check your internet connection.',
        };
      }
      if (status === 401 || status === 403 || /invalid owner pin|authentication|api key/.test(msgLower)) {
        return {
          success: false,
          geminiConfigured: false,
          errorCategory: 'auth',
          retryable: false,
          error: 'API authentication error: AI configuration needs attention.',
        };
      }
      if (status === 429 || /quota|resource_exhausted|rate limit/.test(msgLower)) {
        return {
          success: false,
          geminiConfigured: aiGeminiStatus.geminiConfigured,
          errorCategory: 'quota',
          retryable: false,
          error: 'API quota exceeded: AI usage limit reached. Try again later.',
        };
      }
      return {
        success: false,
        geminiConfigured: aiGeminiStatus.geminiConfigured,
        errorCategory: 'server_temporary',
        retryable: true,
        error: 'AI is temporarily unavailable. Retry shortly.',
      };
    }
  };

  const handleSuggestAiReplyForQuestion = async (
    questionObj: ProductQuestion,
    linkedProduct: Product | null
  ) => {
    return runGroundedAiSuggestion(
      linkedProduct,
      questionObj.question,
      '/api/owner/ai/suggest-answer',
      questionObj.productId,
      questionObj.productName,
      questionObj.id
    );
  };

  const handleTestAiQuestion = async (product: Product, questionText: string) => {
    return runGroundedAiSuggestion(
      product,
      questionText,
      '/api/owner/ai/test-question',
      product.id,
      product.name
    );
  };

  // ----------------- AI WATCHDOG MONITORING HANDLERS -----------------
  const watchdogMetrics = useMemo(
    () =>
      computeWatchdogMetrics({
        orders: ownerOrders,
        alerts: watchdogAlerts,
        websiteErrors: capturedWebsiteErrors,
      }),
    [ownerOrders, watchdogAlerts, capturedWebsiteErrors]
  );

  const runWatchdogScan = async (useGemini = true) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    if (watchdogScanning) return;
    setWatchdogScanning(true);

    try {
      const baseInput = {
        orders: ownerOrders,
        products,
        rescueDeals,
        scheduledOffers,
        discountCampaigns,
        productQuestions: ownerProductQuestions,
        websiteErrors: capturedWebsiteErrors,
        adultPublished,
        childPublished,
        geminiStatus: aiGeminiStatus,
        existingAlerts: watchdogAlertsRef.current,
        availableColours,
      };

      const firstPass = reconcileWatchdogAudit(baseInput, [], { allowAutoResolveRules: true });
      let combinedAlerts = firstPass.nextAlerts;
      const allChangedAlerts = [...firstPass.changedAlerts];
      const allNewLogs = [...firstPass.newLogs];
      let latestMetrics = firstPass.metrics;

      // Save deterministic findings & auto-resolutions immediately
      if (allChangedAlerts.length > 0) {
        setWatchdogAlerts(combinedAlerts);
        saveStoredWatchdogAlerts(combinedAlerts);
        await Promise.all(allChangedAlerts.map((a) => saveWatchdogAlertToCloud(a).catch(() => {})));
      }

      if (useGemini) {
        watchdogLastGeminiScanRef.current = Date.now();
        try {
          const rulePending = combinedAlerts
            .filter((a) => a.status === 'Pending' && a.detectedBy === 'rules')
            .map((a) => ({
              id: a.id,
              title: a.title,
              category: a.category,
              targetId: a.targetId,
            }));

          const res = await ownerPost('/api/owner/watchdog/analyze', {
            stats: latestMetrics,
            products: products.slice(0, 60).map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              price: p.price,
              available: p.available,
              description: p.description,
            })),
            orders: ownerOrders.slice(0, 40).map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              name: o.name,
              mode: o.mode,
              productId: o.productId,
              productName: o.productName,
              quantity: o.quantity,
              price: o.price,
              status: o.status,
              note: o.note,
              aiVerification: o.aiVerification,
            })),
            deals: rescueDeals.filter((d) => !d.deleted).slice(0, 20),
            offers: scheduledOffers.filter((o) => !o.deleted).slice(0, 20),
            campaigns: discountCampaigns.filter((c) => !c.deleted).slice(0, 15),
            ruleFindings: rulePending,
            websiteErrors: capturedWebsiteErrors.slice(0, 15),
            relevantLearningRecords: buildCompactLearningPayload(aiOwnerLearningRecords, {
              featureKey: 'ai_watchdog',
              requestText: rulePending.map((r) => r.title).join(' '),
            }),
          });

          if (res.data?.healthSummary) {
            setWatchdogAiHealthSummary(String(res.data.healthSummary));
          }

          const aiCandidates = Array.isArray(res.data?.extraAlerts) ? res.data.extraAlerts : [];
          if (aiCandidates.length > 0) {
            const secondPass = reconcileWatchdogAudit(
              { ...baseInput, existingAlerts: combinedAlerts },
              aiCandidates,
              { allowAutoResolveRules: false }
            );
            combinedAlerts = secondPass.nextAlerts;
            if (secondPass.changedAlerts.length > 0) {
              setWatchdogAlerts(combinedAlerts);
              saveStoredWatchdogAlerts(combinedAlerts);
              await Promise.all(
                secondPass.changedAlerts.map((a) => saveWatchdogAlertToCloud(a).catch(() => {}))
              );
            }
            allNewLogs.push(...secondPass.newLogs);
            latestMetrics = secondPass.metrics;
          }

          allNewLogs.push({
            id: sanitizeWatchdogDocId(
              `log_scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
            ),
            category: 'system',
            action: res.data?.usedGemini ? 'ai_analyzed' : 'scan_completed',
            actor: res.data?.usedGemini ? 'Gemini AI' : 'AI Watchdog',
            details: `Scanned ${latestMetrics.ordersChecked} orders, ${products.length} products, offers & website health (${latestMetrics.totalPendingAlerts} pending alerts, ${latestMetrics.criticalAlerts} critical).`,
            at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('Gemini Watchdog analysis skipped (using rule checks):', err);
        }
      }

      if (allNewLogs.length > 0) {
        setWatchdogLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const merged = [
            ...allNewLogs.filter((l) => !existingIds.has(l.id)),
            ...prev,
          ].slice(0, 250);
          saveStoredWatchdogLogs(merged);
          return merged;
        });
        await Promise.all(allNewLogs.map((l) => saveWatchdogLogToCloud(l).catch(() => {})));
      }

      setWatchdogLastScanAt(new Date().toISOString());
    } finally {
      setWatchdogScanning(false);
    }
  };

  const loadOwnerWatchdogData = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    try {
      const [cloudAlerts, cloudLogs] = await Promise.all([
        fetchWatchdogAlertsFromCloud(),
        fetchWatchdogLogsFromCloud(),
      ]);
      setWatchdogAlerts(cloudAlerts);
      saveStoredWatchdogAlerts(cloudAlerts);
      setWatchdogLogs(cloudLogs);
      saveStoredWatchdogLogs(cloudLogs);
    } catch (err) {
      console.warn('Could not load Watchdog data from Firestore:', err);
    }
  };

  const handleUpdateWatchdogAlertStatus = async (
    alert: WatchdogAlert,
    nextStatus: WatchdogAlertStatus,
    ownerNote?: string
  ) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    const nowIso = new Date().toISOString();
    const updatedAlert: WatchdogAlert = {
      ...alert,
      status: nextStatus,
      updatedAt: nowIso,
      ...(nextStatus === 'Resolved' || nextStatus === 'Ignored' ? { resolvedAt: nowIso } : {}),
      ...(ownerNote ? { ownerNote } : {}),
    };

    // If resolving/ignoring a browser runtime website error alert, clear its captured session buffer entry
    if (
      (nextStatus === 'Resolved' || nextStatus === 'Ignored') &&
      alert.category === 'website' &&
      alert.targetId?.startsWith('we_')
    ) {
      clearCapturedWebsiteError(alert.targetId);
    }

    setWatchdogAlerts((prev) => {
      const next = prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a));
      saveStoredWatchdogAlerts(next);
      return next;
    });
    await saveWatchdogAlertToCloud(updatedAlert).catch(() => {});

    const actionVerb =
      nextStatus === 'Resolved' ? 'resolved' : nextStatus === 'Ignored' ? 'ignored' : 'reopened';
    const logEntry: WatchdogActivityLog = {
      id: sanitizeWatchdogDocId(
        `log_owner_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      ),
      alertId: updatedAlert.id,
      alertTitle: updatedAlert.title,
      category: updatedAlert.category,
      action: actionVerb,
      actor: 'Owner',
      details: `Owner marked "${updatedAlert.title}" as ${nextStatus}${
        ownerNote ? ` — Note: ${ownerNote}` : ''
      }.`,
      severity: updatedAlert.severity,
      at: nowIso,
    };
    setWatchdogLogs((prev) => {
      const next = [logEntry, ...prev].slice(0, 250);
      saveStoredWatchdogLogs(next);
      return next;
    });
    await saveWatchdogLogToCloud(logEntry).catch(() => {});
  };

  const handleInspectWatchdogTarget = (alert: WatchdogAlert) => {
    if (alert.targetType === 'order' && alert.targetId) {
      const targetOrder = ownerOrders.find((o) => o.id === alert.targetId);
      setOwnerTab('orders');
      setOrderStatusFilter(
        targetOrder && isOrderFlaggedForOwner(targetOrder)
          ? 'Flagged'
          : targetOrder?.status === 'Cancelled'
          ? 'Cancelled'
          : 'Pending'
      );
      setHighlightedOwnerOrderId(alert.targetId);
      setTimeout(() => {
        const el = document.getElementById(`owner-order-card-${alert.targetId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
      return;
    }

    if (alert.targetType === 'product') {
      if (alert.targetId && alert.targetId !== 'products') {
        const prod = products.find((p) => p.id === alert.targetId);
        if (prod) {
          startEditProduct(prod);
          return;
        }
      }
      setOwnerTab('products');
      window.scrollTo({ top: 320, behavior: 'smooth' });
      return;
    }

    if (alert.targetType === 'deal') {
      setOwnerTab('rescueDeals');
      window.scrollTo({ top: 320, behavior: 'smooth' });
      return;
    }

    if (alert.targetType === 'offer') {
      setOwnerTab('scheduledOffers');
      window.scrollTo({ top: 320, behavior: 'smooth' });
      return;
    }

    if (alert.targetType === 'campaign') {
      setOwnerTab('campaigns');
      window.scrollTo({ top: 320, behavior: 'smooth' });
      return;
    }

    if (alert.targetId === 'sections') {
      setOwnerTab('sections');
      void loadShopModes();
    } else if (alert.targetId === 'questions') {
      setOwnerTab('questions');
      void loadOwnerProductQuestions();
    } else if (alert.targetId === 'aiAssistant') {
      setOwnerTab('aiAssistant');
      void loadOwnerAiData();
    } else {
      setOwnerTab('products');
    }
    window.scrollTo({ top: 320, behavior: 'smooth' });
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

  const handleSaveCustomerNote = async (orderId: string) => {
    const trimmed = customerNoteDraft.trim();
    setSavingCustomerNoteOrderId(orderId);
    setErrorMessage('');

    // 1. Update Cloud Firestore
    try {
      await updateCustomerOrderNoteInCloud(orderId, trimmed);
    } catch (err) {
      console.warn('Could not update customer note in Cloud Firestore:', err);
    }

    // 2. Update backend server
    try {
      await api.post('/api/orders/customer-note', { orderId, note: trimmed });
    } catch (err) {
      console.warn('Could not update customer note on server:', err);
    }

    // 3. Update local stored orders (both for customer and owner views)
    const currentStored = getStoredOrders();
    const updatedStored = currentStored.map((o) =>
      o.id === orderId ? { ...o, note: trimmed } : o
    );
    saveStoredOrders(updatedStored);

    // 4. Update customer active order state
    setMyOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, note: trimmed } : o))
    );

    // 5. Update owner order state if active
    setOwnerOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, note: trimmed } : o))
    );

    setSavingCustomerNoteOrderId(null);
    setEditingCustomerNoteOrderId(null);
    setCustomerNoteSuccessId(orderId);
    setTimeout(() => {
      setCustomerNoteSuccessId((curr) => (curr === orderId ? null : curr));
    }, 4000);
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

  const applyStoreSettings = (settings: any) => {
    if (!settings) return false;
    if (settings.paymentQrUrl) {
      setPaymentQrUrl(settings.paymentQrUrl);
      try {
        localStorage.setItem('toynest_payment_qr', settings.paymentQrUrl);
      } catch {}
    } else {
      setPaymentQrUrl((prev) => prev || localStorage.getItem('toynest_payment_qr') || '/payment/adult-qr.jpg');
    }
    if (settings.adultPublished !== undefined || settings.childPublished !== undefined) {
      setAdultPublished(settings.adultPublished !== false);
      setChildPublished(settings.childPublished !== false);
      try {
        localStorage.setItem(
          'toynest_shop_modes',
          JSON.stringify({
            adultPublished: settings.adultPublished !== false,
            childPublished: settings.childPublished !== false,
          })
        );
      } catch {}
    }
    if (typeof settings.manualMoneyAdjustment === 'number') {
      setManualMoneyAdjustment(settings.manualMoneyAdjustment);
      saveStoredMoneyAdjustment(settings.manualMoneyAdjustment);
    }
    if (Array.isArray(settings.moneyAdjustmentHistory)) {
      setMoneyAdjustmentHistory(settings.moneyAdjustmentHistory);
      saveStoredMoneyAdjustmentHistory(settings.moneyAdjustmentHistory);
    }
    if (
      typeof settings.filamentCostPerGram === 'number' &&
      isFinite(settings.filamentCostPerGram) &&
      settings.filamentCostPerGram > 0
    ) {
      const cleanRate = Math.round(settings.filamentCostPerGram * 100) / 100;
      setFilamentCostPerGram(cleanRate);
      setFilamentCostInput(String(cleanRate));
      try {
        localStorage.setItem('playnix_filament_cost_per_gram', String(cleanRate));
      } catch {}
    }
    if (Array.isArray(settings.productShuffleOrder)) {
      const cleanOrder = settings.productShuffleOrder.filter(
        (id: any): id is string => typeof id === 'string' && id.trim().length > 0
      );
      setProductShuffleOrder(cleanOrder);
      try {
        localStorage.setItem('playnix_product_shuffle_order', JSON.stringify(cleanOrder));
      } catch {}
    }
    if (typeof settings.productAutoShuffle === 'boolean') {
      setProductAutoShuffle(settings.productAutoShuffle);
      try {
        localStorage.setItem('playnix_product_auto_shuffle', settings.productAutoShuffle ? 'true' : 'false');
      } catch {}
    }
    if (typeof settings.productShuffledAt === 'string') {
      setProductShuffledAt(settings.productShuffledAt);
      try {
        localStorage.setItem('playnix_product_shuffled_at', settings.productShuffledAt);
      } catch {}
    }
    return true;
  };

  const loadStoreSettings = async (forceRefresh = false) => {
    try {
      const settings = await fetchSettingsFromCloud({ forceRefresh });
      if (applyStoreSettings(settings)) {
        return;
      }
    } catch {}
    try {
      const [qrRes, modesRes] = await Promise.allSettled([
        api.get('/api/payment-qr'),
        api.get('/api/shop-modes'),
      ]);
      if (qrRes.status === 'fulfilled' && qrRes.value.data?.url) {
        setPaymentQrUrl(qrRes.value.data.url);
      } else {
        setPaymentQrUrl((prev) => prev || localStorage.getItem('toynest_payment_qr') || '/payment/adult-qr.jpg');
      }
      if (modesRes.status === 'fulfilled' && modesRes.value.data) {
        setAdultPublished(modesRes.value.data.adultPublished !== false);
        setChildPublished(modesRes.value.data.childPublished !== false);
        return;
      }
    } catch {}
    setPaymentQrUrl((prev) => prev || localStorage.getItem('toynest_payment_qr') || '/payment/adult-qr.jpg');
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

  const loadPaymentQr = async (forceRefresh = false) => {
    await loadStoreSettings(forceRefresh);
  };

  const loadShopModes = async (forceRefresh = false) => {
    await loadStoreSettings(forceRefresh);
  };

  const handleSaveFilamentCost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFilamentCostFeedback(null);
    const trimmed = filamentCostInput.trim();
    const numericCost = Number(trimmed);
    if (!trimmed || !isFinite(numericCost) || numericCost <= 0) {
      setFilamentCostFeedback({
        message: 'Please enter a valid cost per gram greater than ₹0.',
        isError: true,
      });
      return;
    }

    const cleanRate = Math.round(numericCost * 100) / 100;
    setFilamentCostSaving(true);
    try {
      await saveSettingsToCloud({
        filamentCostPerGram: cleanRate,
        filamentCostUpdatedAt: new Date().toISOString(),
      });
      setFilamentCostPerGram(cleanRate);
      setFilamentCostInput(String(cleanRate));
      try {
        localStorage.setItem('playnix_filament_cost_per_gram', String(cleanRate));
      } catch {}
      setFilamentCostFeedback({
        message: `Saved permanently! Future AI calculations will use ₹${cleanRate} per gram.`,
      });
    } catch (err: any) {
      setFilamentCostFeedback({
        message: err?.message || 'Could not save filament cost right now. Please try again.',
        isError: true,
      });
    } finally {
      setFilamentCostSaving(false);
    }
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

  const loadColours = async (forceRefresh = false) => {
    try {
      const cloudColours = await fetchColoursFromCloud({ forceRefresh });
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

  const loadPopularSearches = async (forceRefresh = false) => {
    try {
      const cloudItems = await fetchPopularSearchesFromCloud({ forceRefresh });
      setPopularSearches(cloudItems);
      saveStoredPopularSearches(cloudItems);
    } catch (err) {
      console.warn('Could not load popular searches from cloud:', err);
      setPopularSearches(getStoredPopularSearches());
    }
  };

  const ensureAuthorizedOwner = (): boolean => {
    if (page !== 'owner' || ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      setErrorMessage('Unauthorized: Only the authorized owner can manage popular searches.');
      return false;
    }
    return true;
  };

  const handleAddPopularSearch = async (rawTerm: string) => {
    if (!ensureAuthorizedOwner()) return;
    const trimmed = rawTerm.trim();
    if (!trimmed) {
      setErrorMessage('Please enter a popular search keyword.');
      return;
    }
    const exists = popularSearches.some(
      (item) => item.term.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setErrorMessage(`"${trimmed}" is already in your popular searches list.`);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    const nextOrder =
      popularSearches.length > 0
        ? Math.max(...popularSearches.map((p) => p.order ?? 0)) + 1
        : 0;

    const newItem: PopularSearchItem = {
      id: `pop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      term: trimmed.slice(0, 100),
      order: nextOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...popularSearches, newItem];
    setPopularSearches(updated);
    saveStoredPopularSearches(updated);

    try {
      await savePopularSearchToCloud(newItem);
      setSuccessMessage(`Added "${newItem.term}" to popular searches.`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save popular search to Firebase.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditPopularSearch = async (item: PopularSearchItem, rawNewTerm: string) => {
    if (!ensureAuthorizedOwner()) return;
    const trimmed = rawNewTerm.trim();
    if (!trimmed) {
      setErrorMessage('Popular search keyword cannot be empty.');
      return;
    }
    const duplicate = popularSearches.some(
      (other) => other.id !== item.id && other.term.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setErrorMessage(`"${trimmed}" already exists in popular searches.`);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    const updatedItem: PopularSearchItem = {
      ...item,
      term: trimmed.slice(0, 100),
      updatedAt: new Date().toISOString(),
    };
    const updatedList = popularSearches.map((p) => (p.id === item.id ? updatedItem : p));
    setPopularSearches(updatedList);
    saveStoredPopularSearches(updatedList);

    try {
      await savePopularSearchToCloud(updatedItem);
      setSuccessMessage(`Updated popular search to "${updatedItem.term}".`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not update popular search in Firebase.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePopularSearch = async (searchId: string) => {
    if (!ensureAuthorizedOwner()) return;
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    const remaining = popularSearches
      .filter((p) => p.id !== searchId)
      .map((p, index) => ({ ...p, order: index }));

    setPopularSearches(remaining);
    saveStoredPopularSearches(remaining);

    try {
      await deletePopularSearchFromCloud(searchId);
      if (remaining.length > 0) {
        await reorderPopularSearchesInCloud(remaining);
      }
      setSuccessMessage('Popular search removed.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not delete popular search from Firebase.');
    } finally {
      setLoading(false);
    }
  };

  const handleReorderPopularSearches = async (orderedItems: PopularSearchItem[]) => {
    if (!ensureAuthorizedOwner()) return;
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    const normalized = orderedItems.map((item, idx) => ({
      ...item,
      order: idx,
      updatedAt: new Date().toISOString(),
    }));
    setPopularSearches(normalized);
    saveStoredPopularSearches(normalized);

    try {
      await reorderPopularSearchesInCloud(normalized);
      setSuccessMessage('Popular search display order updated.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save display order to Firebase.');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalyticsData = async () => {
    if (page !== 'owner' || ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    setAnalyticsLoading(true);
    try {
      const [events, customers, cloudOrders, cloudCartItems] = await Promise.all([
        fetchAnalyticsEventsFromCloud(),
        fetchAnalyticsCustomersFromCloud(),
        fetchAllOrdersFromCloud(),
        fetchAllCartItemsFromCloud(),
      ]);
      setAnalyticsEvents(events);
      setAnalyticsCustomers(customers);
      setAllCartItems(cloudCartItems);
      if (Array.isArray(cloudOrders) && cloudOrders.length > 0) {
        setOwnerOrders(cloudOrders);
        saveStoredOrders(cloudOrders);
      }
    } catch (err) {
      console.warn('Could not load analytics data from cloud:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleViewFullOrderFromAnalytics = (order: Order) => {
    if (page !== 'owner' || ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    const status = (order.status || 'New').trim();
    const targetFilter: 'Pending' | 'Completed' | 'Cancelled' =
      ['Completed', 'Delivered', 'Collected'].includes(status)
        ? 'Completed'
        : status === 'Cancelled'
        ? 'Cancelled'
        : 'Pending';

    setOrderStatusFilter(targetFilter);
    setOrderSearchQuery(order.orderNumber || order.id);
    setHighlightedOwnerOrderId(order.id);
    setOwnerTab('orders');

    setTimeout(() => {
      const el = document.getElementById(`owner-order-card-${order.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 90);

    setTimeout(() => {
      setHighlightedOwnerOrderId((curr) => (curr === order.id ? null : curr));
    }, 4200);
  };

  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  const navigateToProduct = (prod: Product) => {
    const slug = getUniqueProductSlug(prod, productsRef.current);
    const targetPath = `/products/${encodeURIComponent(slug)}`;
    setRequestedProductSlug(slug);
    setSelectedProductForDetail(prod);
    setErrorMessage('');
    setCheckoutMode(null);
    setPage('productDetail');
    if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.history.pushState(
        { page: 'productDetail', productId: prod.id, slug },
        '',
        targetPath
      );
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (prod.isSummaryOnly || (prod.imageUrls && prod.imageUrls.length <= 1 && (prod.photoCount ?? 1) > 1)) {
      void hydrateSingleProductGallery(prod.id);
    }
  };

  const navigateToHome = (options: { pushHistory?: boolean } = {}) => {
    const shouldPush = options.pushHistory !== false;
    setRequestedProductSlug(null);
    setSelectedProductForDetail(null);
    setCheckoutMode(null);
    setErrorMessage('');
    setPage('home');
    if (shouldPush && typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({ page: 'home' }, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keep browser Back / Forward buttons in sync with / and /products/:slug
  useEffect(() => {
    const handlePopState = () => {
      const slug = parseProductSlugFromPath(window.location.pathname);
      if (slug) {
        const matched = findProductBySlugOrId(slug, productsRef.current);
        setRequestedProductSlug(slug);
        setSelectedProductForDetail(matched || null);
        setCheckoutMode(null);
        setErrorMessage('');
        setPage('productDetail');
        if (matched && (matched.isSummaryOnly || (matched.photoCount ?? 1) > (matched.imageUrls?.length ?? 1))) {
          void hydrateSingleProductGallery(matched.id);
        }
      } else {
        setRequestedProductSlug(null);
        setSelectedProductForDetail(null);
        setCheckoutMode(null);
        setErrorMessage('');
        setPage('home');
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Resolve requested product URL slug cleanly (direct 1-doc lookup first, full summary scan only if needed)
  useEffect(() => {
    if (!requestedProductSlug) return;
    const matched = findProductBySlugOrId(requestedProductSlug, products);
    if (matched) {
      setSelectedProductForDetail(matched);
      if (matched.isSummaryOnly) {
        void hydrateSingleProductGallery(matched.id);
      }
      const canonicalPath = getProductPath(matched, products);
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== canonicalPath &&
        parseProductSlugFromPath(window.location.pathname) !== null
      ) {
        window.history.replaceState(
          { page: 'productDetail', productId: matched.id, slug: getUniqueProductSlug(matched, products) },
          '',
          canonicalPath
        );
      }
    } else {
      let cancelled = false;
      void fetchProductBySlugOrIdFromCloud(requestedProductSlug, products)
        .then((resolved) => {
          if (cancelled) return;
          if (resolved) {
            setProducts((prev) => mergePreservingFullGalleries([resolved], prev));
            setSelectedProductForDetail(resolved);
          } else if (cloudProductsLoaded) {
            setSelectedProductForDetail(null);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [requestedProductSlug, products, cloudProductsLoaded]);

  // Keep browser URL clean when user returns to home view via any action
  useEffect(() => {
    if (page === 'home' && typeof window !== 'undefined' && window.location.pathname.startsWith('/products/')) {
      window.history.pushState({ page: 'home' }, '', '/');
    }
  }, [page]);

  // Dynamic SEO Head & Structured Data sync (Home vs Individual Product Page)
  useEffect(() => {
    const homeTitle = 'Playnix – Affordable Toys & 3D Printed Products';
    const homeDescription =
      'Playnix – Your trusted online destination for affordable toys, creative 3D-printed products and unique finds. Discover great products at budget-friendly prices with convenient shopping!';
    const homeCanonical = `${SITE_BASE_URL}/`;
    const homeImage = `${SITE_BASE_URL}/resources/toynest-logo.png`;

    const setMetaAttr = (selector: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute('content', content);
    };

    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const existingProductLd = document.getElementById('playnix-product-jsonld');

    if (page === 'productDetail' && (selectedProductForDetail || requestedProductSlug)) {
      const liveProd = selectedProductForDetail
        ? products.find((p) => p.id === selectedProductForDetail.id) || selectedProductForDetail
        : null;

      if (liveProd) {
        const activeOffer = activeOffersByProductId.get(liveProd.id);
        const campaignDiscount = calculateProductDiscount(liveProd, activeDiscountCampaigns);
        const effectivePrice = activeOffer
          ? activeOffer.discountedPrice
          : campaignDiscount.isDiscounted
          ? campaignDiscount.discountedPrice
          : liveProd.price;

        const seoMeta = buildProductSeoMeta(liveProd, products, {
          effectivePrice,
          activeOfferTitle: activeOffer?.title,
          origin: SITE_BASE_URL,
        });

        document.title = seoMeta.title;
        setMetaAttr('meta[name="description"]', seoMeta.description);
        setMetaAttr('meta[name="robots"]', seoMeta.robots);
        if (canonicalEl) canonicalEl.setAttribute('href', seoMeta.canonicalUrl);
        setMetaAttr('meta[property="og:type"]', 'product');
        setMetaAttr('meta[property="og:url"]', seoMeta.canonicalUrl);
        setMetaAttr('meta[property="og:title"]', seoMeta.ogTitle);
        setMetaAttr('meta[property="og:description"]', seoMeta.ogDescription);
        setMetaAttr('meta[property="og:image"]', seoMeta.ogImage);
        setMetaAttr('meta[property="og:image:alt"]', seoMeta.ogImageAlt);
        setMetaAttr('meta[name="twitter:title"]', seoMeta.ogTitle);
        setMetaAttr('meta[name="twitter:description"]', seoMeta.ogDescription);
        setMetaAttr('meta[name="twitter:image"]', seoMeta.ogImage);
        setMetaAttr('meta[name="twitter:image:alt"]', seoMeta.ogImageAlt);

        const scriptEl =
          existingProductLd ||
          (() => {
            const created = document.createElement('script');
            created.id = 'playnix-product-jsonld';
            created.type = 'application/ld+json';
            document.head.appendChild(created);
            return created;
          })();
        scriptEl.textContent = JSON.stringify(seoMeta.jsonLd);
        return;
      }

      // Product not found or still resolving
      document.title = cloudProductsLoaded
        ? 'Product Not Found – Playnix'
        : 'Loading Product – Playnix';
      setMetaAttr('meta[name="robots"]', 'noindex, follow');
      if (existingProductLd) existingProductLd.remove();
      return;
    }

    if (existingProductLd) {
      existingProductLd.remove();
    }

    let nextTitle = homeTitle;
    let nextDescription = homeDescription;
    let nextRobots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

    if (page === 'myOrders') {
      nextTitle = 'My Orders – Playnix';
    } else if (page === 'buy') {
      nextTitle = 'Checkout – Playnix';
      nextRobots = 'noindex, nofollow';
    } else if (page === 'owner' || page === 'ownerLogin') {
      nextTitle = 'Owner Dashboard – Playnix';
      nextRobots = 'noindex, nofollow';
    }

    document.title = nextTitle;
    setMetaAttr('meta[name="description"]', nextDescription);
    setMetaAttr('meta[name="robots"]', nextRobots);
    if (canonicalEl) canonicalEl.setAttribute('href', homeCanonical);
    setMetaAttr('meta[property="og:type"]', 'website');
    setMetaAttr('meta[property="og:url"]', homeCanonical);
    setMetaAttr('meta[property="og:title"]', nextTitle);
    setMetaAttr('meta[property="og:description"]', nextDescription);
    setMetaAttr('meta[property="og:image"]', homeImage);
    setMetaAttr('meta[property="og:image:alt"]', homeTitle);
    setMetaAttr('meta[name="twitter:title"]', nextTitle);
    setMetaAttr('meta[name="twitter:description"]', nextDescription);
    setMetaAttr('meta[name="twitter:image"]', homeImage);
    setMetaAttr('meta[name="twitter:image:alt"]', homeTitle);
  }, [
    page,
    selectedProductForDetail,
    requestedProductSlug,
    products,
    cloudProductsLoaded,
    activeOffersByProductId,
    activeDiscountCampaigns,
  ]);

  useEffect(() => {
    // Single deduplicated startup fetches (no duplicate subscriptions + parallel full scans)
    void loadStoreSettings();
    void loadColours();
    void loadPopularSearches();
    void loadProducts();
    void fetchDiscountCampaignsFromCloud()
      .then((cloudCampaigns) => {
        if (Array.isArray(cloudCampaigns)) {
          setDiscountCampaigns(cloudCampaigns);
          saveStoredDiscountCampaigns(cloudCampaigns);
        }
      })
      .catch(() => {});

    // Keep real-time listeners only where live concurrent inventory / offer updates matter
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

    let unsubOffers = () => {};
    try {
      unsubOffers = subscribeToScheduledOffers((cloudOffers) => {
        if (Array.isArray(cloudOffers)) {
          setScheduledOffers(cloudOffers);
          saveStoredScheduledOffers(cloudOffers);
        }
      });
    } catch (err) {
      console.warn('Real-time scheduled offers subscription error:', err);
      fetchScheduledOffersFromCloud().then((offers) => {
        if (Array.isArray(offers)) {
          setScheduledOffers(offers);
          saveStoredScheduledOffers(offers);
        }
      }).catch(() => {});
    }

    return () => {
      unsubDeals();
      unsubOffers();
    };
  }, []);

  // Ensure all lightweight summaries are loaded when shuffling or auto-shuffling is active
  // so every product on the website participates cleanly without pulling heavy photo arrays.
  useEffect(() => {
    if (!cloudProductsLoaded) return;
    if ((productAutoShuffle || productShuffleOrder.length > 0) && hasMoreProducts) {
      void ensureAllProductSummariesLoaded();
    }
  }, [cloudProductsLoaded, productAutoShuffle, productShuffleOrder.length, hasMoreProducts]);

  // Automatic Shuffle: once per website visit when enabled, generate a fresh random arrangement
  useEffect(() => {
    if (!productAutoShuffle) {
      autoShuffleVisitDoneRef.current = false;
      setSessionAutoShuffleOrder([]);
      return;
    }
    if (!cloudProductsLoaded || products.length === 0) return;

    const allIds = Array.from(new Set(products.map((p) => p.id).filter(Boolean)));
    if (allIds.length === 0) return;

    // Wait until full summaries finish loading before locking final visit shuffle,
    // or shuffle immediately if no extra pages remain.
    if (!hasMoreProducts && !autoShuffleVisitDoneRef.current) {
      autoShuffleVisitDoneRef.current = true;
      setSessionAutoShuffleOrder(shuffleProductIds(allIds));
    } else if (hasMoreProducts && sessionAutoShuffleOrder.length === 0) {
      setSessionAutoShuffleOrder(shuffleProductIds(allIds));
    }
  }, [productAutoShuffle, cloudProductsLoaded, hasMoreProducts, products.length]);

  const activeShuffleIds = useMemo(() => {
    if (productAutoShuffle) {
      return sessionAutoShuffleOrder.length > 0 ? sessionAutoShuffleOrder : productShuffleOrder;
    }
    return productShuffleOrder;
  }, [productAutoShuffle, sessionAutoShuffleOrder, productShuffleOrder]);

  const homepageDisplayProducts = useMemo(
    () => orderProductsByShuffleIds(products, activeShuffleIds),
    [products, activeShuffleIds]
  );

  const ensureFullProductsListForShuffle = async (): Promise<Product[]> => {
    if (hasMoreProducts) {
      try {
        const cloudSummaries = await fetchAllProductSummariesFromCloud();
        if (Array.isArray(cloudSummaries) && cloudSummaries.length > 0) {
          const merged = mergePreservingFullGalleries(cloudSummaries, productsRef.current, {
            replaceCatalog: true,
          });
          setProducts(merged);
          saveStoredProducts(merged);
          setHasMoreProducts(false);
          setProductsNextCursor(null);
          allSummariesLoadedRef.current = true;
          return merged;
        }
      } catch {}
    }
    return productsRef.current;
  };

  const persistShuffleSettings = async (updates: {
    productShuffleOrder?: string[];
    productAutoShuffle?: boolean;
    productShuffledAt?: string;
  }) => {
    if (updates.productShuffleOrder !== undefined) {
      setProductShuffleOrder(updates.productShuffleOrder);
      try {
        localStorage.setItem('playnix_product_shuffle_order', JSON.stringify(updates.productShuffleOrder));
      } catch {}
    }
    if (updates.productAutoShuffle !== undefined) {
      setProductAutoShuffle(updates.productAutoShuffle);
      try {
        localStorage.setItem('playnix_product_auto_shuffle', updates.productAutoShuffle ? 'true' : 'false');
      } catch {}
    }
    if (updates.productShuffledAt !== undefined) {
      setProductShuffledAt(updates.productShuffledAt);
      try {
        localStorage.setItem('playnix_product_shuffled_at', updates.productShuffledAt);
      } catch {}
    }

    await saveSettingsToCloud(updates);
  };

  const handleShuffleAllProducts = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    setShuffleSaving(true);
    try {
      const latestProducts = await ensureFullProductsListForShuffle();
      const allIds = Array.from(new Set(latestProducts.map((p) => p.id).filter(Boolean)));
      const nextOrder = shuffleProductIds(allIds);
      const nowIso = new Date().toISOString();
      if (productAutoShuffle) {
        autoShuffleVisitDoneRef.current = true;
        setSessionAutoShuffleOrder(nextOrder);
      }
      await persistShuffleSettings({
        productShuffleOrder: nextOrder,
        productShuffledAt: nowIso,
      });
    } finally {
      setShuffleSaving(false);
    }
  };

  const handleShuffleAgain = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    setShuffleSaving(true);
    try {
      const latestProducts = await ensureFullProductsListForShuffle();
      const currentOrderedIds = orderProductsByShuffleIds(
        latestProducts,
        activeShuffleIds
      ).map((p) => p.id);
      const nextOrder = shuffleProductIds(currentOrderedIds, currentOrderedIds);
      const nowIso = new Date().toISOString();
      if (productAutoShuffle) {
        autoShuffleVisitDoneRef.current = true;
        setSessionAutoShuffleOrder(nextOrder);
      }
      await persistShuffleSettings({
        productShuffleOrder: nextOrder,
        productShuffledAt: nowIso,
      });
    } finally {
      setShuffleSaving(false);
    }
  };

  const handleToggleAutoShuffle = async (enabled: boolean) => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    setShuffleSaving(true);
    try {
      const latestProducts = await ensureFullProductsListForShuffle();
      if (enabled) {
        const allIds = Array.from(new Set(latestProducts.map((p) => p.id).filter(Boolean)));
        const freshOrder = shuffleProductIds(allIds);
        autoShuffleVisitDoneRef.current = true;
        setSessionAutoShuffleOrder(freshOrder);
        await persistShuffleSettings({
          productAutoShuffle: true,
          productShuffleOrder: productShuffleOrder.length > 0 ? productShuffleOrder : freshOrder,
          productShuffledAt: productShuffledAt || new Date().toISOString(),
        });
      } else {
        autoShuffleVisitDoneRef.current = false;
        setSessionAutoShuffleOrder([]);
        await persistShuffleSettings({
          productAutoShuffle: false,
        });
      }
    } finally {
      setShuffleSaving(false);
    }
  };

  const handleResetShuffleOrder = async () => {
    if (ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) {
      throw new Error('Unauthorized owner access');
    }
    setShuffleSaving(true);
    try {
      autoShuffleVisitDoneRef.current = false;
      setSessionAutoShuffleOrder([]);
      await persistShuffleSettings({
        productShuffleOrder: [],
        productAutoShuffle: false,
        productShuffledAt: '',
      });
    } finally {
      setShuffleSaving(false);
    }
  };

  // Only run 1-second live clock timer while offers or campaigns exist (avoids idle re-renders)
  useEffect(() => {
    const hasTimedPromos =
      scheduledOffers.some((o) => !o.deleted && !o.claimed && !o.cancelled && !o.isDraft) ||
      discountCampaigns.some((c) => !c.deleted && !c.cancelled && !c.isDraft);
    if (!hasTimedPromos) return;
    const clockTimer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, [scheduledOffers, discountCampaigns]);

  // Real-time Firestore sync for customer orders (drives status badges without 15s polling)
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

          const seen = getSeenOrderStatuses();
          const hasUnseenStatus = visibleOrders.some((o) => seen[o.id] !== o.status);
          setHasStatusUpdateNotification(hasUnseenStatus);
        }
      });
    } catch (err) {
      console.warn('Customer order subscription error:', err);
    }
    return () => {
      unsub();
    };
  }, [customerId]);

  const associateCheckoutNameWithGuestCart = (rawName: string) => {
    const cleanName = rawName.trim().slice(0, 100);
    if (cleanName.length < 2) return;
    if (cleanName === lastSyncedGuestNameRef.current) return;
    lastSyncedGuestNameRef.current = cleanName;

    setGuestProvidedName(cleanName);
    saveStoredGuestName(guestCustomerId, cleanName);

    const activeGuestCode = getGuestShortCode(customerId);
    setCartItems((prev) => {
      const next = prev.map((it) =>
        it.customerId === customerId
          ? {
              ...it,
              customerName: cleanName,
              isGuest: true,
              guestCode: activeGuestCode,
            }
          : it
      );
      saveStoredCart(customerId, next);
      return next;
    });

    void syncCustomerNameWithCartInCloud(customerId, cleanName, {
      isAuthenticated: false,
      mode: checkoutMode || 'Visitor',
    }).catch((err) => {
      console.warn('Could not sync checkout name with cart:', err);
    });
  };

  // Debounced association when guest enters their name on the checkout page
  useEffect(() => {
    if (page !== 'buy') return;
    const clean = checkoutForm.name.trim();
    if (clean.length < 2 || clean === lastSyncedGuestNameRef.current) return;
    const timer = window.setTimeout(() => {
      associateCheckoutNameWithGuestCart(clean);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [page, checkoutForm.name, customerId]);

  // Pre-fill checkout name if customer already provided their name
  useEffect(() => {
    if (page !== 'buy') return;
    const knownName = guestProvidedName || '';
    if (knownName && !checkoutForm.name.trim()) {
      setCheckoutForm((prev) => (prev.name.trim() ? prev : { ...prev, name: knownName }));
    }
  }, [page, guestProvidedName]);

  // Real-time permanent cart synchronization across visits & cloud storage (no duplicate simultaneous getDocs)
  useEffect(() => {
    if (!customerId) return;
    let unsubCart = () => {};
    let settledInitialSnapshot = false;

    const reconcileWithCloud = (cloudItems: CartItem[]) => {
      settledInitialSnapshot = true;
      const localItems = getStoredCart(customerId);
      const { merged, missingInCloud, staleInCloudIds } = mergePermanentCartItems(
        customerId,
        localItems.length > 0 ? localItems : cartItemsRef.current,
        cloudItems
      );

      setCartItems(merged);
      saveStoredCart(customerId, merged);

      if (missingInCloud.length > 0) {
        missingInCloud.forEach((item) => {
          void saveCartItemToCloud(item).catch(() => {});
        });
      }
      if (staleInCloudIds.length > 0) {
        staleInCloudIds.forEach((id) => {
          void deleteCartItemFromCloud(id).catch(() => {});
        });
      }
    };

    try {
      unsubCart = subscribeToCartItems(customerId, (liveCart) => {
        reconcileWithCloud(liveCart);
      });
    } catch (err) {
      console.warn('Cart subscription error:', err);
    }

    // Fallback one-time fetch ONLY if real-time listener doesn't deliver within 3.5s
    const fallbackTimer = window.setTimeout(() => {
      if (!settledInitialSnapshot) {
        fetchCartItemsFromCloud(customerId)
          .then((items) => {
            if (!settledInitialSnapshot) {
              reconcileWithCloud(items || []);
            }
          })
          .catch(() => {});
      }
    }, 3500);

    const flushCartToStorage = () => {
      saveStoredCart(customerId, cartItemsRef.current);
    };
    window.addEventListener('beforeunload', flushCartToStorage);
    window.addEventListener('pagehide', flushCartToStorage);

    return () => {
      window.clearTimeout(fallbackTimer);
      flushCartToStorage();
      window.removeEventListener('beforeunload', flushCartToStorage);
      window.removeEventListener('pagehide', flushCartToStorage);
      unsubCart();
    };
  }, [customerId]);

  // Automatic, deduplicated customer-side analytics tracking (visits & product views)
  useEffect(() => {
    if (!customerId || page === 'owner' || page === 'ownerLogin') return;
    void trackWebsiteVisit(customerId);
  }, [customerId, page]);

  useEffect(() => {
    if (!customerId || page === 'owner' || page === 'ownerLogin') return;
    const viewedProduct =
      page === 'productDetail' && selectedProductForDetail
        ? selectedProductForDetail
        : galleryProduct;
    if (viewedProduct) {
      void trackProductView(viewedProduct, customerId);
    }
  }, [customerId, page, selectedProductForDetail, galleryProduct]);

  // Real-time Firestore sync when owner dashboard is active (updates unseen new order badge live without polling)
  useEffect(() => {
    if (page === 'owner') {
      const unsubOrders = subscribeToAllOrders((liveOrders) => {
        if (Array.isArray(liveOrders)) {
          setOwnerOrders(liveOrders);
          saveStoredOrders(liveOrders);
          try {
            const rawAck = localStorage.getItem('toynest_owner_acknowledged_time');
            const ackTime = rawAck ? new Date(rawAck).getTime() : 0;
            const seenIds = new Set(getSeenOwnerOrderIds());
            const unseenNewOrders = liveOrders.filter((o) => {
              if (o.status !== 'New' || seenIds.has(o.id)) return false;
              if (ackTime > 0 && !isNaN(ackTime)) {
                const orderTime = new Date(o.createdAt).getTime();
                if (!isNaN(orderTime) && orderTime <= ackTime) return false;
              }
              return true;
            });
            setOwnerNewOrdersCount(unseenNewOrders.length);
            setHasOwnerOrderNotification(unseenNewOrders.length > 0);
          } catch {}
        }
      });
      const unsubSettings = subscribeToSettings((settings) => {
        if (typeof settings.manualMoneyAdjustment === 'number') {
          setManualMoneyAdjustment(settings.manualMoneyAdjustment);
          saveStoredMoneyAdjustment(settings.manualMoneyAdjustment);
        }
        if (Array.isArray(settings.moneyAdjustmentHistory)) {
          setMoneyAdjustmentHistory(settings.moneyAdjustmentHistory);
          saveStoredMoneyAdjustmentHistory(settings.moneyAdjustmentHistory);
        }
        if (typeof settings.filamentCostPerGram === 'number' && isFinite(settings.filamentCostPerGram) && settings.filamentCostPerGram > 0) {
          const cleanRate = Math.round(settings.filamentCostPerGram * 100) / 100;
          setFilamentCostPerGram(cleanRate);
          try {
            localStorage.setItem('playnix_filament_cost_per_gram', String(cleanRate));
          } catch {}
        }
      });

      let unsubAnalyticsEvents = () => {};
      let unsubAnalyticsCustomers = () => {};
      let unsubAllCartItems = () => {};
      let unsubProductQuestions = () => {};
      let unsubAiState = () => {};
      let unsubAiKnowledge = () => {};
      let unsubAiTraining = () => {};
      let unsubAiGuidance = () => {};
      let unsubWatchdogAlerts = () => {};
      let unsubWatchdogLogs = () => {};
      let unsubOwnerLearning = () => {};
      if (ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN) {
        setAnalyticsLoading(true);
        unsubAnalyticsEvents = subscribeToAnalyticsEvents((events) => {
          setAnalyticsEvents(events);
          setAnalyticsLoading(false);
        });
        unsubAnalyticsCustomers = subscribeToAnalyticsCustomers((customers) => {
          setAnalyticsCustomers(customers);
        });
        unsubAllCartItems = subscribeToAllCartItems((liveCarts) => {
          setAllCartItems(liveCarts);
        });
        setQuestionsLoading(true);
        unsubProductQuestions = subscribeToAllProductQuestions((list) => {
          setOwnerProductQuestions(list);
          saveStoredProductQuestions(list);
          setQuestionsLoading(false);
        });
        unsubAiState = subscribeToAiAssistantState((nextAi) => {
          setAiState(nextAi);
          saveStoredAiState(nextAi);
        });
        unsubAiKnowledge = subscribeToAiKnowledge((entries) => {
          setAiKnowledge(entries);
          saveStoredAiKnowledge(entries);
        });
        unsubAiTraining = subscribeToAiTrainingAnswers((answers) => {
          setAiTrainingAnswers(answers);
          saveStoredAiTrainingAnswers(answers);
        });
        unsubAiGuidance = subscribeToAiGuidanceQuestions((list) => {
          setAiGuidanceQuestions(list);
          saveStoredAiGuidanceQuestions(list);
        });
        unsubWatchdogAlerts = subscribeToWatchdogAlerts((list) => {
          setWatchdogAlerts(list);
          saveStoredWatchdogAlerts(list);
        });
        unsubWatchdogLogs = subscribeToWatchdogLogs((list) => {
          setWatchdogLogs(list);
          saveStoredWatchdogLogs(list);
        });
        unsubOwnerLearning = subscribeToAiOwnerLearningRecords((records) => {
          setAiOwnerLearningRecords(records);
        });
        void checkAiServerStatus();
      } else {
        setAllCartItems([]);
        setAiOwnerLearningRecords([]);
      }

      return () => {
        unsubOrders();
        unsubSettings();
        unsubAnalyticsEvents();
        unsubAnalyticsCustomers();
        unsubAllCartItems();
        unsubProductQuestions();
        unsubAiState();
        unsubAiKnowledge();
        unsubAiTraining();
        unsubAiGuidance();
        unsubWatchdogAlerts();
        unsubWatchdogLogs();
        unsubOwnerLearning();
      };
    } else {
      setAllCartItems([]);
      setAiOwnerLearningRecords([]);
    }
  }, [page, ownerPin]);

  // Global browser & promise error monitor for AI Watchdog Website Error tracking
  useEffect(() => {
    const cleanup = installWebsiteErrorListeners();
    const unsub = subscribeWebsiteErrors((list) => {
      setCapturedWebsiteErrors(list);
    });
    return () => {
      cleanup();
      unsub();
    };
  }, []);

  // Automatic real-data rule monitoring whenever owner dashboard data changes
  useEffect(() => {
    if (page !== 'owner' || ownerPin.trim().toUpperCase() !== DEFAULT_OWNER_PIN) return;
    const timer = window.setTimeout(() => {
      void runWatchdogScan(false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    page,
    ownerPin,
    ownerOrders.length,
    products.length,
    rescueDeals.length,
    scheduledOffers.length,
    discountCampaigns.length,
    capturedWebsiteErrors.length,
    adultPublished,
    childPublished,
  ]);

  // Run full Gemini + Rules Watchdog audit when Watchdog dashboard opens (max once per 90s automatically)
  useEffect(() => {
    if (
      page === 'owner' &&
      ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN &&
      ownerTab === 'watchdog' &&
      !watchdogScanning &&
      Date.now() - watchdogLastGeminiScanRef.current > 90_000
    ) {
      void runWatchdogScan(true);
    }
  }, [page, ownerPin, ownerTab]);

  // Auto-run Initial Website Scan once on first visit to Playnix AI Assistant
  useEffect(() => {
    if (
      page === 'owner' &&
      ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN &&
      ownerTab === 'aiAssistant' &&
      !aiState.hasCompletedInitialScan &&
      !aiScanning &&
      !aiInitialScanTriggeredRef.current
    ) {
      aiInitialScanTriggeredRef.current = true;
      void triggerWebsiteAiScan();
    }
  }, [page, ownerPin, ownerTab, aiState.hasCompletedInitialScan, aiScanning]);

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

  // Ensure owner menu panel is closed if owner exits dashboard, and clear celebration after leaving orders
  useEffect(() => {
    if (page !== 'owner') {
      setIsOwnerMenuOpen(false);
    }
    if (page !== 'myOrders') {
      setOrderSuccessCelebration(null);
    }
  }, [page]);

  // Lightweight scroll-entry reveal for product cards (respects prefers-reduced-motion)
  useEffect(() => {
    if (page !== 'home') return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.product-card-reveal'));
    if (cards.length === 0) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      cards.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.95) {
        card.classList.add('is-revealed');
      } else {
        observer.observe(card);
      }
    });

    return () => observer.disconnect();
  }, [page, selectedCategory, products.length, adultPublished, childPublished]);

  // ----------------- PERMANENT SHOPPING CART HANDLERS -----------------
  const triggerCartBounce = (productId?: string) => {
    setCartAnimKey((prev) => prev + 1);
    setIsCartBouncing(false);
    window.requestAnimationFrame(() => {
      setIsCartBouncing(true);
    });
    if (cartBounceTimerRef.current !== null) {
      window.clearTimeout(cartBounceTimerRef.current);
    }
    cartBounceTimerRef.current = window.setTimeout(() => {
      setIsCartBouncing(false);
    }, 650);

    if (productId) {
      setJustAddedProductId(productId);
      if (justAddedTimerRef.current !== null) {
        window.clearTimeout(justAddedTimerRef.current);
      }
      justAddedTimerRef.current = window.setTimeout(() => {
        setJustAddedProductId((curr) => (curr === productId ? null : curr));
      }, 1100);
    }
  };

  const showCartToast = (msg: string) => {
    setCartToastMessage(msg);
    setTimeout(() => {
      setCartToastMessage((curr) => (curr === msg ? '' : curr));
    }, 3200);
  };

  const handleAddToCart = async (
    prod: Product,
    colour?: string,
    qty: number = 1,
    isRescueDeal?: boolean,
    rescueDealId?: string,
    isScheduledOffer?: boolean,
    scheduledOfferId?: string
  ) => {
    const cleanColour = colour || '';
    const existingIndex = cartItems.findIndex(
      (it) => it.productId === prod.id && (it.colour || '') === cleanColour
    );
    let updated: CartItem[];
    let targetItem: CartItem;

    const resolvedCustomerName = guestProvidedName?.trim() || undefined;
    const isGuestSession = true;
    const activeGuestCode = getGuestShortCode(customerId);
    const nowIso = new Date().toISOString();

    if (existingIndex >= 0) {
      const current = cartItems[existingIndex];
      const newQty = isRescueDeal ? 1 : Math.min(5, (current.quantity || 1) + qty);
      targetItem = {
        ...current,
        quantity: newQty,
        customerName: resolvedCustomerName || current.customerName,
        isGuest: isGuestSession,
        guestCode: activeGuestCode,
        updatedAt: nowIso,
      };
      updated = [...cartItems];
      updated[existingIndex] = targetItem;
    } else {
      const itemId = buildCartDocId('cart', customerId, prod.id, cleanColour);
      targetItem = {
        id: itemId,
        customerId,
        customerName: resolvedCustomerName,
        isGuest: isGuestSession,
        guestCode: activeGuestCode,
        productId: prod.id,
        productName: prod.name,
        productImageUrl: (prod.imageUrls && prod.imageUrls[0]) || prod.imageUrl || '/toys/toy-40ba4ba9-1.jpg',
        category: prod.category,
        price: prod.price,
        colour: cleanColour,
        quantity: isRescueDeal ? 1 : Math.min(5, Math.max(1, qty)),
        isRescueDeal: Boolean(isRescueDeal),
        rescueDealId,
        isScheduledOffer: Boolean(isScheduledOffer),
        scheduledOfferId,
        addedAt: nowIso,
        updatedAt: nowIso,
      };
      updated = [targetItem, ...cartItems];
    }

    unmarkCartItemDeletedLocally(customerId, targetItem.id);
    setCartItems(updated);
    saveStoredCart(customerId, updated);
    triggerCartBounce(prod.id);
    showCartToast(`Added "${prod.name}" to cart`);

    if (page !== 'owner' && page !== 'ownerLogin') {
      void trackAddToCartEvent(
        prod,
        isRescueDeal ? 1 : Math.min(5, Math.max(1, qty)),
        customerId
      );
    }

    try {
      await saveCartItemToCloud(targetItem);
    } catch (err) {
      console.warn('Could not save cart item to cloud:', err);
    }
  };

  const handleRemoveFromCart = async (itemId: string) => {
    const target = cartItems.find((it) => it.id === itemId);
    const next = cartItems.filter((it) => it.id !== itemId);
    markCartItemDeletedLocally(customerId, itemId);
    setCartItems(next);
    saveStoredCart(customerId, next);
    if (target) showCartToast(`Removed "${target.productName}" from cart`);
    try {
      await deleteCartItemFromCloud(itemId);
    } catch (err) {
      console.warn('Could not delete cart item from cloud:', err);
    }
  };

  const handleUpdateCartQty = async (itemId: string, newQty: number) => {
    if (newQty < 1) {
      await handleRemoveFromCart(itemId);
      return;
    }
    const clamped = Math.min(5, Math.max(1, newQty));
    const target = cartItems.find((it) => it.id === itemId);
    if (!target) return;
    const updatedItem = { ...target, quantity: clamped, updatedAt: new Date().toISOString() };
    const next = cartItems.map((it) => (it.id === itemId ? updatedItem : it));
    unmarkCartItemDeletedLocally(customerId, itemId);
    setCartItems(next);
    saveStoredCart(customerId, next);
    try {
      await saveCartItemToCloud(updatedItem);
    } catch (err) {
      console.warn('Could not update cart item in cloud:', err);
    }
  };

  const handleCheckoutCartItem = (cartItem: CartItem) => {
    const prod = products.find((p) => p.id === cartItem.productId);
    if (!prod || prod.available === false) {
      setErrorMessage(`"${cartItem.productName}" is currently unavailable.`);
      return;
    }
    setSelectedProductForBuy(prod);
    setSelectedDealForBuy(null);
    setSelectedOfferForBuy(null);
    setOrderQuantity(cartItem.quantity || 1);
    setCheckoutForm({
      name: guestProvidedName || '',
      studentClass: '',
      section: '',
      phone: '',
      address: '',
      note: '',
      colour: cartItem.colour || '',
    });
    setCheckoutMode(null);
    setIsCartOpen(false);
    setErrorMessage('');
    setPage('buy');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const ownerPost = async (url: string, body: any, options?: { timeoutMs?: number }) => {
    let pinToSend = ownerPin;
    if (!pinToSend) {
      try {
        pinToSend = sessionStorage.getItem('playnix_owner_pin') || DEFAULT_OWNER_PIN;
      } catch {
        pinToSend = DEFAULT_OWNER_PIN;
      }
    }
    return api.post(url, { ...body, pin: pinToSend }, options);
  };

  const refreshShop = async () => {
    setIsRefreshing(true);
    setErrorMessage('');
    try {
      await Promise.all([
        loadProducts({ forceRefresh: true }),
        loadStoreSettings(true),
        loadColours(true),
        loadPopularSearches(true),
        fetchDiscountCampaignsFromCloud({ forceRefresh: true })
          .then((campaigns) => {
            if (Array.isArray(campaigns)) {
              setDiscountCampaigns(campaigns);
              saveStoredDiscountCampaigns(campaigns);
            }
          })
          .catch(() => {}),
        fetchRescueDealsFromCloud({ forceRefresh: true })
          .then((d) => Array.isArray(d) && setRescueDeals(d))
          .catch(() => {}),
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
    invalidateFirestoreCache();
    try {
      await Promise.all([
        loadOwnerProducts(true),
        loadOwnerOrders(),
        loadColours(true),
        loadStoreSettings(true),
        fetchRescueDealsFromCloud({ forceRefresh: true })
          .then((d) => Array.isArray(d) && setRescueDeals(d))
          .catch(() => {}),
      ]);
      if (ownerTab === 'suggestions') await loadOwnerSuggestions();
      if (ownerTab === 'questions') await loadOwnerProductQuestions();
      if (ownerTab === 'aiAssistant') await loadOwnerAiData();
      if (ownerTab === 'watchdog') {
        await loadOwnerWatchdogData();
        await runWatchdogScan(true);
      }
      if (ownerTab === 'popularSearches') await loadPopularSearches(true);
      if (ownerTab === 'analytics') await loadAnalyticsData();
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
      void loadOwnerProducts();
      setLoading(false);
      return;
    }

    try {
      await ownerPost('/api/owner/verify', {});
      setErrorMessage('');
      setPage('owner');
      setOwnerTab('products');
      await loadOwnerProducts();
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

        const stableSlug =
          existing?.slug ||
          generateProductSlugForCreate(
            existing?.name || cleanName,
            products.filter((p) => p.id !== editingProductId),
            editingProductId
          );

        const updatedItem: Product = {
          id: editingProductId,
          slug: stableSlug,
          name: cleanName,
          price: cleanPrice,
          description: productForm.description.trim(),
          category: productForm.category.trim() || 'Other',
          ...(Array.isArray(existing?.highlights) && existing.highlights.length > 0
            ? { highlights: existing.highlights }
            : {}),
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
      const productSlug = generateProductSlugForCreate(cleanName, products, productId);
      const newProduct: Product = {
        id: productId,
        slug: productSlug,
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

  const handleAddMoney = async (customAmt?: number, customNote?: string) => {
    const amt = customAmt !== undefined ? customAmt : parseFloat(moneyInputAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMessage('Please enter a valid amount greater than ₹0.');
      return;
    }
    const note = (customNote !== undefined ? customNote : moneyInputNote).trim();
    setMoneySaving(true);
    setErrorMessage('');

    const newItem: MoneyAdjustmentItem = {
      id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'add',
      amount: amt,
      ...(note ? { note } : {}),
      createdAt: new Date().toISOString(),
    };

    const newAdjustment = manualMoneyAdjustment + amt;
    const newHistory = [newItem, ...moneyAdjustmentHistory];

    setManualMoneyAdjustment(newAdjustment);
    setMoneyAdjustmentHistory(newHistory);
    saveStoredMoneyAdjustment(newAdjustment);
    saveStoredMoneyAdjustmentHistory(newHistory);
    setMoneyInputAmount('');
    setMoneyInputNote('');

    try {
      await saveSettingsToCloud({
        manualMoneyAdjustment: newAdjustment,
        moneyAdjustmentHistory: newHistory,
      });
      setSuccessMessage(`Added ${da(amt)} to Total Money counter.`);
    } catch (err) {
      console.warn('Could not sync money adjustment to cloud:', err);
      setSuccessMessage(`Added ${da(amt)} locally.`);
    } finally {
      setMoneySaving(false);
    }
  };

  const handleSubtractMoney = async (customAmt?: number, customNote?: string) => {
    const amt = customAmt !== undefined ? customAmt : parseFloat(moneyInputAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMessage('Please enter a valid amount greater than ₹0.');
      return;
    }
    const note = (customNote !== undefined ? customNote : moneyInputNote).trim();
    setMoneySaving(true);
    setErrorMessage('');

    const newItem: MoneyAdjustmentItem = {
      id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'subtract',
      amount: amt,
      ...(note ? { note } : {}),
      createdAt: new Date().toISOString(),
    };

    const newAdjustment = manualMoneyAdjustment - amt;
    const newHistory = [newItem, ...moneyAdjustmentHistory];

    setManualMoneyAdjustment(newAdjustment);
    setMoneyAdjustmentHistory(newHistory);
    saveStoredMoneyAdjustment(newAdjustment);
    saveStoredMoneyAdjustmentHistory(newHistory);
    setMoneyInputAmount('');
    setMoneyInputNote('');

    try {
      await saveSettingsToCloud({
        manualMoneyAdjustment: newAdjustment,
        moneyAdjustmentHistory: newHistory,
      });
      setSuccessMessage(`Subtracted ${da(amt)} from Total Money counter.`);
    } catch (err) {
      console.warn('Could not sync money adjustment to cloud:', err);
      setSuccessMessage(`Subtracted ${da(amt)} locally.`);
    } finally {
      setMoneySaving(false);
    }
  };

  const handleDeleteAdjustmentItem = async (itemId: string) => {
    const item = moneyAdjustmentHistory.find((i) => i.id === itemId);
    if (!item) return;

    setMoneySaving(true);
    const newAdjustment = item.type === 'add'
      ? manualMoneyAdjustment - item.amount
      : manualMoneyAdjustment + item.amount;
    const newHistory = moneyAdjustmentHistory.filter((i) => i.id !== itemId);

    setManualMoneyAdjustment(newAdjustment);
    setMoneyAdjustmentHistory(newHistory);
    saveStoredMoneyAdjustment(newAdjustment);
    saveStoredMoneyAdjustmentHistory(newHistory);

    try {
      await saveSettingsToCloud({
        manualMoneyAdjustment: newAdjustment,
        moneyAdjustmentHistory: newHistory,
      });
      setSuccessMessage(`Reverted adjustment of ${da(item.amount)}.`);
    } catch (err) {
      console.warn('Could not sync adjustment deletion to cloud:', err);
    } finally {
      setMoneySaving(false);
    }
  };

  const handleResetAdjustments = async () => {
    if (!window.confirm('Reset all manual money additions and subtractions to ₹0? Earnings from fulfilled orders will stay untouched.')) {
      return;
    }

    setMoneySaving(true);
    setManualMoneyAdjustment(0);
    setMoneyAdjustmentHistory([]);
    saveStoredMoneyAdjustment(0);
    saveStoredMoneyAdjustmentHistory([]);

    try {
      await saveSettingsToCloud({
        manualMoneyAdjustment: 0,
        moneyAdjustmentHistory: [],
      });
      setSuccessMessage('Reset manual adjustments to ₹0.');
    } catch (err) {
      console.warn('Could not sync reset to cloud:', err);
    } finally {
      setMoneySaving(false);
    }
  };

  // ----------------- SCHEDULED OFFERS OWNER HANDLERS -----------------
  const checkOfferOverlap = (
    productId: string,
    startAtIso: string,
    endAtIso: string,
    excludeOfferId?: string
  ): boolean => {
    const newStart = new Date(startAtIso).getTime();
    const newEnd = new Date(endAtIso).getTime();

    return scheduledOffers.some((o) => {
      if (o.id === excludeOfferId) return false;
      if (o.deleted || o.cancelled || o.claimed || o.isDraft) return false;
      if (o.productId !== productId) return false;

      const existingStart = new Date(o.startAt).getTime();
      const existingEnd = new Date(o.endAt).getTime();

      // Check if time intervals overlap
      return Math.max(newStart, existingStart) < Math.min(newEnd, existingEnd);
    });
  };

  const handleSaveScheduledOffer = async (asDraft: boolean = false) => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!offerForm.productId) {
      setErrorMessage('Please select a product from the list for this scheduled offer.');
      return;
    }

    const selectedProd = products.find((p) => p.id === offerForm.productId);
    if (!selectedProd) {
      setErrorMessage('Selected product could not be found.');
      return;
    }

    const title = offerForm.title.trim() || `${selectedProd.name} Special Offer`;
    const origPrice = parseFloat(offerForm.originalPrice) || selectedProd.price;
    const discPrice = parseFloat(offerForm.discountedPrice);

    if (isNaN(discPrice) || discPrice <= 0) {
      setErrorMessage('Please enter a valid discounted price greater than ₹0.');
      return;
    }

    if (discPrice >= origPrice) {
      setErrorMessage(`Discounted price (₹${discPrice}) must be lower than the regular price (₹${origPrice}).`);
      return;
    }

    if (!offerForm.startAt || !offerForm.endAt) {
      setErrorMessage('Please select both a start date/time and an end date/time.');
      return;
    }

    const startDate = new Date(offerForm.startAt);
    const endDate = new Date(offerForm.endAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setErrorMessage('Invalid start or end date/time format.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setErrorMessage('Offer end date and time must be after the start date and time.');
      return;
    }

    const startAtIso = startDate.toISOString();
    const endAtIso = endDate.toISOString();

    // Prevent overlapping active offers for the same product
    if (!asDraft && checkOfferOverlap(selectedProd.id, startAtIso, endAtIso, editingOfferId || undefined)) {
      setErrorMessage(
        `Another offer is already scheduled for "${selectedProd.name}" during this timeframe. Please choose non-overlapping dates or edit the existing offer.`
      );
      return;
    }

    setOfferSaving(true);

    const offerId = editingOfferId || `offer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const productImg = (selectedProd.imageUrls && selectedProd.imageUrls[0]) || selectedProd.imageUrl || '/toys/toy-40ba4ba9-1.jpg';

    const offerToSave: ScheduledOffer = {
      id: offerId,
      productId: selectedProd.id,
      productName: selectedProd.name,
      productImageUrl: productImg,
      productCategory: selectedProd.category || 'Other',
      title,
      originalPrice: origPrice,
      discountedPrice: discPrice,
      startAt: startAtIso,
      endAt: endAtIso,
      status: asDraft ? 'Draft' : 'Scheduled',
      isDraft: asDraft,
      cancelled: false,
      claimed: false,
      deleted: false,
      createdAt: editingOfferId
        ? (scheduledOffers.find((o) => o.id === editingOfferId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'Owner',
    };

    // Calculate initial dynamic status
    offerToSave.status = computeOfferStatus(offerToSave, Date.now());

    try {
      await saveScheduledOfferToCloud(offerToSave);

      setScheduledOffers((prev) => {
        const idx = prev.findIndex((o) => o.id === offerId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = offerToSave;
          saveStoredScheduledOffers(next);
          return next;
        }
        const next = [offerToSave, ...prev];
        saveStoredScheduledOffers(next);
        return next;
      });

      setSuccessMessage(
        asDraft
          ? `Offer for "${selectedProd.name}" saved as draft.`
          : editingOfferId
          ? `Offer "${title}" updated successfully.`
          : `Offer "${title}" scheduled successfully!`
      );

      // Reset form
      setIsAddingOffer(false);
      setEditingOfferId(null);
      setOfferPreviewModalOpen(false);
      setOfferForm({
        productId: '',
        title: '',
        originalPrice: '',
        discountedPrice: '',
        startAt: toDatetimeLocalString(new Date()),
        endAt: toDatetimeLocalString(new Date(Date.now() + 24 * 3600 * 1000)),
        isDraft: false,
      });
    } catch (err: any) {
      console.error('Error saving scheduled offer:', err);
      setErrorMessage(err?.message || 'Could not save scheduled offer to cloud.');
    } finally {
      setOfferSaving(false);
    }
  };

  const handleCancelScheduledOffer = async (offerId: string) => {
    if (!window.confirm('Cancel this scheduled offer? It will immediately stop and be marked as cancelled.')) {
      return;
    }
    setErrorMessage('');
    try {
      await cancelScheduledOfferInCloud(offerId);
      setScheduledOffers((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, cancelled: true, status: 'Cancelled' } : o))
      );
      setSuccessMessage('Offer was cancelled.');
    } catch (err) {
      console.error('Could not cancel offer:', err);
      setErrorMessage('Failed to cancel offer.');
    }
  };

  const handleDeleteScheduledOffer = async (offerId: string) => {
    if (!window.confirm('Permanently delete this scheduled offer? This cannot be undone.')) {
      return;
    }
    setErrorMessage('');
    try {
      await deleteScheduledOfferFromCloud(offerId);
      setScheduledOffers((prev) => prev.filter((o) => o.id !== offerId));
      setSuccessMessage('Offer deleted successfully.');
    } catch (err) {
      console.error('Could not delete offer:', err);
      setErrorMessage('Failed to delete offer.');
    }
  };

  const startEditOffer = (offer: ScheduledOffer) => {
    setEditingOfferId(offer.id);
    const startDate = new Date(offer.startAt);
    const endDate = new Date(offer.endAt);

    setOfferForm({
      productId: offer.productId,
      title: offer.title,
      originalPrice: String(offer.originalPrice),
      discountedPrice: String(offer.discountedPrice),
      startAt: toDatetimeLocalString(isNaN(startDate.getTime()) ? new Date() : startDate),
      endAt: toDatetimeLocalString(isNaN(endDate.getTime()) ? new Date(Date.now() + 24 * 3600 * 1000) : endDate),
      isDraft: offer.isDraft === true,
    });
    setIsAddingOffer(true);
    setOfferPreviewModalOpen(false);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  // ----------------- FESTIVAL CAMPAIGN OWNER HANDLERS -----------------
  const handleSaveDiscountCampaign = async (asDraft: boolean = false) => {
    setErrorMessage('');
    setSuccessMessage('');

    const name = campaignForm.name.trim();
    if (!name) {
      setErrorMessage('Please enter a campaign name (e.g. Diwali Sale, Christmas Joy Fest).');
      return;
    }

    const discVal = parseFloat(campaignForm.discountValue);
    if (isNaN(discVal) || discVal <= 0) {
      setErrorMessage(
        campaignForm.discountType === 'percentage'
          ? 'Please enter a valid discount percentage between 1% and 90%.'
          : 'Please enter a valid discount amount greater than ₹0.'
      );
      return;
    }

    if (campaignForm.discountType === 'percentage' && discVal > 90) {
      setErrorMessage('Discount percentage cannot exceed 90%.');
      return;
    }

    if (campaignForm.targetScope === 'categories' && (!campaignForm.targetCategories || campaignForm.targetCategories.length === 0)) {
      setErrorMessage('Please select at least one category to apply the discount.');
      return;
    }

    if (campaignForm.targetScope === 'products' && (!campaignForm.targetProductIds || campaignForm.targetProductIds.length === 0)) {
      setErrorMessage('Please select at least one product for this campaign.');
      return;
    }

    const startDate = new Date(campaignForm.startAt);
    const endDate = new Date(campaignForm.endAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setErrorMessage('Please select valid start and end dates.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setErrorMessage('Campaign end date and time must be after the start date and time.');
      return;
    }

    if (!asDraft && detectedCampaignConflicts.length > 0 && !campaignForm.allowConflictOverride) {
      const conflictCount = detectedCampaignConflicts.reduce((sum, c) => sum + c.conflictingProductIds.length, 0);
      setErrorMessage(
        `Discount conflict: ${conflictCount} product(s) overlap with another active or scheduled campaign. Please resolve the overlapping selection or check "Allow Best Discount (Anti-Stacking)" to proceed.`
      );
      return;
    }

    setCampaignSaving(true);

    const campaignId = editingCampaignId || `camp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const startAtIso = startDate.toISOString();
    const endAtIso = endDate.toISOString();

    const campaignToSave: DiscountCampaign = {
      id: campaignId,
      name,
      description: campaignForm.description.trim(),
      bannerImageUrl: campaignForm.bannerImageUrl.trim() || 'diwali',
      discountType: campaignForm.discountType,
      discountValue: discVal,
      targetScope: campaignForm.targetScope,
      targetCategories: campaignForm.targetScope === 'categories' ? campaignForm.targetCategories : [],
      targetProductIds: campaignForm.targetScope === 'products' ? campaignForm.targetProductIds : [],
      startAt: startAtIso,
      endAt: endAtIso,
      status: asDraft ? 'Draft' : 'Scheduled',
      isDraft: asDraft,
      cancelled: false,
      deleted: false,
      autoIncludeNewProducts: campaignForm.autoIncludeNewProducts !== false,
      allowConflictOverride: Boolean(campaignForm.allowConflictOverride),
      createdAt: editingCampaignId
        ? (discountCampaigns.find((c) => c.id === editingCampaignId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'Owner',
      totalOrdersCount: editingCampaignId
        ? (discountCampaigns.find((c) => c.id === editingCampaignId)?.totalOrdersCount || 0)
        : 0,
      totalRevenue: editingCampaignId
        ? (discountCampaigns.find((c) => c.id === editingCampaignId)?.totalRevenue || 0)
        : 0,
    };

    campaignToSave.status = computeCampaignStatus(campaignToSave, Date.now());

    try {
      await saveDiscountCampaignToCloud(campaignToSave);

      setDiscountCampaigns((prev) => {
        const idx = prev.findIndex((c) => c.id === campaignId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = campaignToSave;
          saveStoredDiscountCampaigns(next);
          return next;
        }
        const next = [campaignToSave, ...prev];
        saveStoredDiscountCampaigns(next);
        return next;
      });

      setSuccessMessage(
        asDraft
          ? `Campaign "${name}" saved as draft.`
          : editingCampaignId
          ? `Campaign "${name}" updated successfully.`
          : `Campaign "${name}" scheduled successfully!`
      );

      setIsAddingCampaign(false);
      setEditingCampaignId(null);
      setCampaignPreviewModalOpen(false);
      setCampaignProductSearch('');
      setCampaignForm({
        name: 'Diwali Dhamaka Sale',
        description: 'Special festive celebration across our toy shelves! Limited time savings for all kids.',
        bannerImageUrl: 'diwali',
        discountType: 'percentage',
        discountValue: '20',
        targetScope: 'all',
        targetCategories: [],
        targetProductIds: [],
        startAt: toDatetimeLocalString(new Date()),
        endAt: toDatetimeLocalString(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
        isDraft: false,
        autoIncludeNewProducts: true,
        allowConflictOverride: false,
      });
    } catch (err: any) {
      console.error('Error saving discount campaign:', err);
      setErrorMessage(err?.message || 'Could not save discount campaign to cloud.');
    } finally {
      setCampaignSaving(false);
    }
  };

  const handleCancelDiscountCampaign = async (campaignId: string) => {
    if (!window.confirm('Cancel this festival campaign? Discounts will immediately stop applying to products.')) {
      return;
    }
    setErrorMessage('');
    try {
      await cancelDiscountCampaignInCloud(campaignId);
      setDiscountCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? { ...c, cancelled: true, status: 'Cancelled' } : c))
      );
      setSuccessMessage('Campaign was paused and cancelled.');
    } catch (err) {
      console.error('Could not cancel campaign:', err);
      setErrorMessage('Failed to cancel campaign.');
    }
  };

  const handleDeleteDiscountCampaign = async (campaignId: string) => {
    if (!window.confirm('Permanently delete this campaign? This cannot be undone.')) {
      return;
    }
    setErrorMessage('');
    try {
      await deleteDiscountCampaignFromCloud(campaignId);
      setDiscountCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
      setSuccessMessage('Campaign deleted successfully.');
    } catch (err) {
      console.error('Could not delete campaign:', err);
      setErrorMessage('Failed to delete campaign.');
    }
  };

  const startEditCampaign = (campaign: DiscountCampaign) => {
    setEditingCampaignId(campaign.id);
    const startDate = new Date(campaign.startAt);
    const endDate = new Date(campaign.endAt);

    setCampaignProductSearch('');
    setCampaignForm({
      name: campaign.name,
      description: campaign.description || '',
      bannerImageUrl: campaign.bannerImageUrl || 'diwali',
      discountType: campaign.discountType,
      discountValue: String(campaign.discountValue),
      targetScope: campaign.targetScope,
      targetCategories: campaign.targetCategories || [],
      targetProductIds: campaign.targetProductIds || [],
      startAt: toDatetimeLocalString(isNaN(startDate.getTime()) ? new Date() : startDate),
      endAt: toDatetimeLocalString(isNaN(endDate.getTime()) ? new Date(Date.now() + 7 * 24 * 3600 * 1000) : endDate),
      isDraft: campaign.isDraft === true,
      autoIncludeNewProducts: campaign.autoIncludeNewProducts !== false,
      allowConflictOverride: Boolean(campaign.allowConflictOverride),
    });
    setIsAddingCampaign(true);
    setCampaignPreviewModalOpen(false);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handlePlaceOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');

    const targetItem = selectedDealForBuy || selectedOfferForBuy || selectedProductForBuy;
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

    // If checkout is for a Scheduled Offer, verify it's not claimed or expired
    if (selectedOfferForBuy) {
      if (selectedOfferForBuy.claimed || selectedOfferForBuy.status === 'Completed') {
        setErrorMessage('This Special Offer is no longer available as it has already been claimed.');
        return;
      }
      if (computeOfferStatus(selectedOfferForBuy, Date.now()) !== 'Active') {
        setErrorMessage('This Special Offer is no longer active.');
        return;
      }
    }

    let validatedQuantity = 1;
    let unitPrice = 0;
    let totalPrice = 0;
    let productDiscountInfo: ProductDiscountInfo = {
      isDiscounted: false,
      hasDiscount: false,
      originalPrice: 0,
      discountedPrice: 0,
      discountAmount: 0,
      savingsPerUnit: 0,
      discountPercent: 0,
    };

    if (selectedDealForBuy) {
      validatedQuantity = 1; // Strict single-quantity offer
      unitPrice = selectedDealForBuy.dealPrice;
      totalPrice = selectedDealForBuy.dealPrice;
    } else if (selectedOfferForBuy) {
      validatedQuantity = 1; // Limited scheduled offer
      unitPrice = selectedOfferForBuy.discountedPrice;
      totalPrice = selectedOfferForBuy.discountedPrice;
    } else if (selectedProductForBuy) {
      const parsedQty = parseInt(String(orderQuantity), 10);
      if (isNaN(parsedQty) || parsedQty < 1 || parsedQty > 5) {
        setErrorMessage('Please select a quantity between 1 and 5.');
        return;
      }
      validatedQuantity = Math.min(5, Math.max(1, parsedQty));

      // Calculate dynamic festival campaign discount
      productDiscountInfo = calculateProductDiscount(selectedProductForBuy, activeDiscountCampaigns);
      unitPrice = productDiscountInfo.isDiscounted ? productDiscountInfo.discountedPrice : selectedProductForBuy.price;
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
      : selectedOfferForBuy
      ? `[Special Offer] ${selectedOfferForBuy.title}`
      : selectedProductForBuy!.name;
    const orderItemImage = selectedDealForBuy
      ? selectedDealForBuy.imageUrl
      : selectedOfferForBuy
      ? (selectedOfferForBuy.productImageUrl || '')
      : (selectedProductForBuy!.imageUrl || (selectedProductForBuy!.imageUrls && selectedProductForBuy!.imageUrls[0]) || '');

    const isCampaignEligible = Boolean(
      !selectedDealForBuy && !selectedOfferForBuy && productDiscountInfo.isDiscounted
    );

    const orderDataBase: Order = {
      id: orderId,
      orderNumber,
      customerId,
      mode: checkoutMode || 'Child',
      productId: selectedDealForBuy
        ? (selectedDealForBuy.productId || selectedDealForBuy.id)
        : selectedOfferForBuy
        ? selectedOfferForBuy.productId
        : selectedProductForBuy!.id,
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
      isScheduledOffer: Boolean(selectedOfferForBuy),
      isCampaignDiscount: isCampaignEligible,
      ...(isCampaignEligible
        ? {
            campaignId: productDiscountInfo.campaignId,
            campaignName: productDiscountInfo.campaignName,
            originalPrice: selectedProductForBuy!.price,
            discountSaved: (selectedProductForBuy!.price - productDiscountInfo.discountedPrice) * validatedQuantity,
          }
        : {}),
      ...(selectedDealForBuy
        ? {
            rescueDealId: selectedDealForBuy.id,
            rescueCondition: selectedDealForBuy.condition || '',
          }
        : {}),
      ...(selectedOfferForBuy
        ? {
            scheduledOfferId: selectedOfferForBuy.id,
          }
        : {}),
    };

    const linkedProdForInspection = products.find((p) => p.id === orderDataBase.productId);
    const seenRecentIds = new Set<string>();
    const recentOrdersPool = [...ownerOrders, ...myOrders, ...getStoredOrders()].filter((ord) => {
      if (!ord?.id || seenRecentIds.has(ord.id)) return false;
      seenRecentIds.add(ord.id);
      return true;
    });
    const ruleInspection = runDeterministicOrderInspection(
      orderDataBase,
      linkedProdForInspection,
      recentOrdersPool
    );
    const initialVerification = ruleInspection.verification;
    const orderData: Order = {
      ...orderDataBase,
      status: initialVerification.riskLevel === 'HIGH' ? 'On Hold (AI Review)' : 'New',
      aiVerification: initialVerification,
    };

    try {
      let confirmedOrderNumber = orderNumber;
      let finalSavedOrder: Order = orderData;

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
      } else if (selectedOfferForBuy) {
        // ATOMIC TRANSACTION FOR SCHEDULED OFFERS:
        // Validates offer is active and unclaimed, writes the order,
        // and marks the scheduled offer as completed/sold in a single atomic commit.
        await claimScheduledOfferInCloud(selectedOfferForBuy.id, orderData);

        try {
          await api.post('/api/orders', {
            ...orderData,
            productName: orderItemName,
          });
        } catch {}

        // Update local state immediately so offer is removed from customer active view
        setScheduledOffers((prev) =>
          prev.map((o) => (o.id === selectedOfferForBuy.id ? { ...o, claimed: true, status: 'Completed' } : o))
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
            status: orderData.status,
            aiVerification: orderData.aiVerification,
          });
          if (res.data?.order) {
            createdOrder = res.data.order;
          }
        } catch {}

        finalSavedOrder = createdOrder
          ? {
              ...orderData,
              ...createdOrder,
              status: createdOrder.status || orderData.status,
              aiVerification: createdOrder.aiVerification || orderData.aiVerification,
            }
          : orderData;
        confirmedOrderNumber = finalSavedOrder.orderNumber || orderNumber;
        await saveOrderToCloud(finalSavedOrder);

        // Record metrics for the festival campaign
        if (isCampaignEligible && productDiscountInfo.campaignId) {
          recordCampaignOrderInCloud(productDiscountInfo.campaignId, totalPrice).catch(() => {});
        }
      }

      const allExisting = getStoredOrders().filter((o) => o.id !== finalSavedOrder.id);
      const updatedList = computeLocalQueuePositions([finalSavedOrder, ...allExisting]);
      saveStoredOrders(updatedList);

      void syncAnalyticsCustomerOrderProfile(
        customerId,
        checkoutForm.name.trim(),
        checkoutMode || 'Child'
      );
      associateCheckoutNameWithGuestCart(checkoutForm.name.trim());

      setHasStatusUpdateNotification(true);
      setHasOwnerOrderNotification(true);
      setSuccessMessage('');
      setOrderSuccessCelebration({
        orderNumber: confirmedOrderNumber,
        productName: orderItemName,
        totalPrice,
        quantity: validatedQuantity,
      });
      setPage('myOrders');
      await loadMyOrders();
      setCheckoutForm({ name: '', studentClass: '', section: '', phone: '', address: '', note: '', colour: '' });
      setSelectedProductForBuy(null);
      setSelectedDealForBuy(null);
      setSelectedOfferForBuy(null);
      setOrderQuantity(1);

      if (ruleInspection.needsAiContextCheck) {
        void runAsyncGeminiOrderInspection(
          finalSavedOrder,
          linkedProdForInspection,
          recentOrdersPool,
          initialVerification
        );
      }
    } catch (saveErr: any) {
      console.error('Error completing order:', saveErr);
      const msg = saveErr?.message || String(saveErr);
      if (msg.includes('already been claimed') || msg.includes('claimed by another customer')) {
        setErrorMessage('Sorry! This special offer has already been claimed by another customer and is no longer available.');
        try {
          const freshDeals = await fetchRescueDealsFromCloud();
          setRescueDeals(freshDeals);
        } catch {}
        try {
          const freshOffers = await fetchScheduledOffersFromCloud();
          setScheduledOffers(freshOffers);
        } catch {}
      } else if (msg.includes('expired')) {
        setErrorMessage('Sorry! This special offer has expired and is no longer active.');
      } else {
        setErrorMessage('Failed to place order. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const syncOrderUpdateLocally = (orderId: string, patch: Partial<Order>) => {
    setOwnerOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    setMyOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    const stored = getStoredOrders().map((o) => (o.id === orderId ? { ...o, ...patch } : o));
    saveStoredOrders(stored);
  };

  const runAsyncGeminiOrderInspection = async (
    targetOrder: Order,
    linkedProd: Product | undefined,
    recentPool: Order[],
    baseline: OrderAiVerification
  ) => {
    try {
      const res = await api.post('/api/orders/inspect', {
        order: targetOrder,
        product: linkedProd
          ? {
              id: linkedProd.id,
              name: linkedProd.name,
              category: linkedProd.category,
              description: linkedProd.description,
              price: linkedProd.price,
            }
          : undefined,
        recentOrders: recentPool.slice(0, 12),
        availableColours,
        ruleBaseline: baseline,
      });

      const nextVerification = res.data?.verification as OrderAiVerification | undefined;
      if (!nextVerification) return;

      const nextStatus =
        nextVerification.riskLevel === 'HIGH' ? 'On Hold (AI Review)' : 'New';

      try {
        await updateOrderStatusInCloud(targetOrder.id, {
          status: nextStatus,
          aiVerification: nextVerification,
        });
      } catch {}

      syncOrderUpdateLocally(targetOrder.id, {
        status: nextStatus,
        aiVerification: nextVerification,
      });
    } catch {
      // Safe fallback: order & deterministic rule baseline are already persisted
    }
  };

  const persistOwnerVerificationDecision = async (
    order: Order,
    nextStatus: string,
    nextVerification: OrderAiVerification,
    nextOwnerNote?: string
  ) => {
    setOrderDecisionSavingId(order.id);
    setErrorMessage('');
    const resolvedOwnerNote = nextOwnerNote !== undefined ? nextOwnerNote : order.ownerNote || '';

    try {
      await updateOrderStatusInCloud(order.id, {
        status: nextStatus,
        paymentRecipientName: order.paymentRecipientName || '',
        paymentRecipientClass: order.paymentRecipientClass || '',
        paymentRecipientSection: order.paymentRecipientSection || '',
        ownerNote: resolvedOwnerNote,
        aiVerification: nextVerification,
      });
    } catch {}

    try {
      await ownerPost('/api/owner/orders/status', {
        id: order.id,
        status: nextStatus,
        paymentRecipientName: order.paymentRecipientName || '',
        paymentRecipientClass: order.paymentRecipientClass || '',
        paymentRecipientSection: order.paymentRecipientSection || '',
        ownerNote: resolvedOwnerNote,
        aiVerification: nextVerification,
      });
    } catch {}

    syncOrderUpdateLocally(order.id, {
      status: nextStatus,
      ownerNote: resolvedOwnerNote,
      aiVerification: nextVerification,
    });
    setOrderDecisionSavingId(null);
  };

  const handleApproveOrder = async (order: Order, ownerNote?: string) => {
    const nowIso = new Date().toISOString();
    const prev = order.aiVerification;
    const auditEntry: OrderAuditEntry = {
      at: nowIso,
      actor: 'Owner',
      action: 'approved',
      note: ownerNote || 'Owner confirmed order is legitimate and resumed processing.',
    };
    const nextVerification: OrderAiVerification = {
      riskLevel: prev?.riskLevel || 'LOW',
      decisionStatus: 'approved',
      recommendedAction: 'Approve',
      confidence: prev?.confidence ?? 90,
      summaryReason: prev?.summaryReason || 'Reviewed and approved by owner.',
      flaggedFields: prev?.flaggedFields || [],
      inspectedAt: prev?.inspectedAt || nowIso,
      inspectedBy: prev?.inspectedBy || 'rules',
      modelUsed: prev?.modelUsed,
      clarificationMessage: prev?.clarificationMessage,
      customerClarificationReply: prev?.customerClarificationReply,
      customerClarifiedAt: prev?.customerClarifiedAt,
      ownerDecisionAt: nowIso,
      ownerDecisionNote: ownerNote || 'Approved by owner',
      auditHistory: [...(prev?.auditHistory || []), auditEntry].slice(-20),
    };
    const nextStatus = ['On Hold (AI Review)', 'Awaiting Clarification', 'Clarification Submitted'].includes(order.status)
      ? 'New'
      : order.status;
    await persistOwnerVerificationDecision(order, nextStatus, nextVerification);
    setSuccessMessage(`Order ${order.orderNumber || order.id} approved and ready for processing.`);
  };

  const handleRequestOrderClarification = async (order: Order, clarificationMessage: string) => {
    const nowIso = new Date().toISOString();
    const prev = order.aiVerification;
    const cleanMsg = clarificationMessage.trim();
    const auditEntry: OrderAuditEntry = {
      at: nowIso,
      actor: 'Owner',
      action: 'clarification_requested',
      note: cleanMsg,
    };
    const nextVerification: OrderAiVerification = {
      riskLevel: prev?.riskLevel || 'MEDIUM',
      decisionStatus: 'clarification_requested',
      recommendedAction: 'Verify Details',
      confidence: prev?.confidence ?? 80,
      summaryReason: prev?.summaryReason || 'Clarification requested by owner.',
      flaggedFields: prev?.flaggedFields || [],
      inspectedAt: prev?.inspectedAt || nowIso,
      inspectedBy: prev?.inspectedBy || 'rules',
      modelUsed: prev?.modelUsed,
      clarificationMessage: cleanMsg,
      customerClarificationReply: prev?.customerClarificationReply,
      customerClarifiedAt: prev?.customerClarifiedAt,
      ownerDecisionAt: nowIso,
      ownerDecisionNote: 'Clarification requested from customer',
      auditHistory: [...(prev?.auditHistory || []), auditEntry].slice(-20),
    };
    await persistOwnerVerificationDecision(order, 'Awaiting Clarification', nextVerification, cleanMsg);
    setSuccessMessage(`Clarification request sent to ${order.name || 'customer'} for order ${order.orderNumber || order.id}.`);
  };

  const handleRejectOrder = async (order: Order, reason?: string) => {
    const nowIso = new Date().toISOString();
    const prev = order.aiVerification;
    const cleanReason = (reason || 'Rejected & cancelled by owner after verification review.').trim();
    const auditEntry: OrderAuditEntry = {
      at: nowIso,
      actor: 'Owner',
      action: 'rejected',
      note: cleanReason,
    };
    const nextVerification: OrderAiVerification = {
      riskLevel: prev?.riskLevel || 'HIGH',
      decisionStatus: 'rejected',
      recommendedAction: 'Hold & Review',
      confidence: prev?.confidence ?? 95,
      summaryReason: prev?.summaryReason || cleanReason,
      flaggedFields: prev?.flaggedFields || [],
      inspectedAt: prev?.inspectedAt || nowIso,
      inspectedBy: prev?.inspectedBy || 'rules',
      modelUsed: prev?.modelUsed,
      clarificationMessage: prev?.clarificationMessage,
      customerClarificationReply: prev?.customerClarificationReply,
      customerClarifiedAt: prev?.customerClarifiedAt,
      ownerDecisionAt: nowIso,
      ownerDecisionNote: cleanReason,
      auditHistory: [...(prev?.auditHistory || []), auditEntry].slice(-20),
    };
    await persistOwnerVerificationDecision(order, 'Cancelled', nextVerification, cleanReason);
    setSuccessMessage(`Order ${order.orderNumber || order.id} cancelled (record & audit log preserved).`);
  };

  const handleReinspectOrder = async (order: Order) => {
    setInspectingOrderId(order.id);
    setErrorMessage('');
    try {
      const linkedProd = products.find((p) => p.id === order.productId);
      const recentPool = ownerOrders.filter((o) => o.id !== order.id);
      const ruleRes = runDeterministicOrderInspection(order, linkedProd, recentPool);
      let nextVerification = ruleRes.verification;

      try {
        const res = await api.post('/api/orders/inspect', {
          pin: ownerPin.trim() || DEFAULT_OWNER_PIN,
          order,
          product: linkedProd
            ? {
                id: linkedProd.id,
                name: linkedProd.name,
                category: linkedProd.category,
                description: linkedProd.description,
                price: linkedProd.price,
              }
            : undefined,
          recentOrders: recentPool.slice(0, 12),
          availableColours,
          ruleBaseline: ruleRes.verification,
          relevantLearningRecords: buildCompactLearningPayload(aiOwnerLearningRecords, {
            featureKey: 'order_verification',
            requestText: `${order.name} ${order.productName} ${order.note || ''}`,
            productId: order.productId,
            productName: order.productName,
          }),
        });
        if (res.data?.verification) {
          nextVerification = res.data.verification;
        }
      } catch {}

      const prev = order.aiVerification;
      const reinspectAudit: OrderAuditEntry = {
        at: new Date().toISOString(),
        actor: 'Playnix AI',
        action: 'reinspected',
        riskLevel: nextVerification.riskLevel,
        note: `Re-inspected (${nextVerification.riskLevel} risk · ${nextVerification.confidence}% confidence)`,
      };
      const mergedAudit: OrderAuditEntry[] = [
        ...(prev?.auditHistory || []),
        reinspectAudit,
      ].slice(-20);

      const finalVerification: OrderAiVerification = {
        ...nextVerification,
        clarificationMessage: prev?.clarificationMessage,
        customerClarificationReply: prev?.customerClarificationReply,
        customerClarifiedAt: prev?.customerClarifiedAt,
        auditHistory: mergedAudit,
      };

      const isFinalOrInProgress = [
        'Confirmed',
        'Preparing',
        'Dispatched',
        'Ready for pickup',
        'Completed',
        'Delivered',
        'Collected',
        'Cancelled',
      ].includes(order.status);

      const nextStatus = isFinalOrInProgress
        ? order.status
        : finalVerification.riskLevel === 'HIGH'
        ? 'On Hold (AI Review)'
        : order.status === 'On Hold (AI Review)'
        ? 'New'
        : order.status;

      await persistOwnerVerificationDecision(order, nextStatus, finalVerification);
      setSuccessMessage(`Playnix AI re-inspected order ${order.orderNumber || order.id} (${finalVerification.riskLevel} RISK).`);
    } finally {
      setInspectingOrderId(null);
    }
  };

  const handleCustomerSubmitClarification = async (order: Order) => {
    const reply = customerClarifyReplyDraft.trim();
    if (!reply) {
      setMyOrdersError('Please write a short message verifying or updating your order details.');
      return;
    }
    setMyOrdersError('');
    setSavingCustomerClarifyId(order.id);
    const nowIso = new Date().toISOString();
    const prev = order.aiVerification;
    const auditEntry: OrderAuditEntry = {
      at: nowIso,
      actor: 'Customer',
      action: 'customer_clarified',
      note: reply,
    };
    const nextVerification: OrderAiVerification = {
      riskLevel: prev?.riskLevel || 'MEDIUM',
      decisionStatus: 'pending_review',
      recommendedAction: 'Approve',
      confidence: prev?.confidence ?? 80,
      summaryReason: prev?.summaryReason || 'Customer submitted clarification for owner review.',
      flaggedFields: prev?.flaggedFields || [],
      inspectedAt: prev?.inspectedAt || nowIso,
      inspectedBy: prev?.inspectedBy || 'rules',
      modelUsed: prev?.modelUsed,
      clarificationMessage: prev?.clarificationMessage,
      customerClarificationReply: reply,
      customerClarifiedAt: nowIso,
      ownerDecisionAt: prev?.ownerDecisionAt,
      ownerDecisionNote: prev?.ownerDecisionNote,
      auditHistory: [...(prev?.auditHistory || []), auditEntry].slice(-20),
    };

    const contactPatch: {
      phone?: string;
      address?: string;
      studentClass?: string;
      section?: string;
    } = {};
    if (order.mode === 'Adult') {
      if (customerClarifyPhoneDraft.trim()) contactPatch.phone = customerClarifyPhoneDraft.trim();
      if (customerClarifyAddressDraft.trim()) contactPatch.address = customerClarifyAddressDraft.trim();
    } else {
      if (customerClarifyClassDraft.trim()) contactPatch.studentClass = customerClarifyClassDraft.trim();
      if (customerClarifySectionDraft.trim()) contactPatch.section = customerClarifySectionDraft.trim();
    }

    try {
      await submitCustomerOrderClarificationInCloud(
        order.id,
        reply,
        nextVerification,
        contactPatch
      );
    } catch (err) {
      console.warn('Could not save clarification to Firestore:', err);
    }

    syncOrderUpdateLocally(order.id, {
      status: 'Clarification Submitted',
      ...contactPatch,
      aiVerification: nextVerification,
    });
    setSavingCustomerClarifyId(null);
    setClarifyingCustomerOrderId(null);
    setCustomerClarifyReplyDraft('');
    setCustomerClarifyPhoneDraft('');
    setCustomerClarifyAddressDraft('');
    setCustomerClarifyClassDraft('');
    setCustomerClarifySectionDraft('');
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
          onClick={() => navigateToHome()}
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
                className={`owner-link cart-nav-btn ${isCartBouncing ? 'is-cart-bouncing' : ''}`}
                type="button"
                style={{ position: 'relative' }}
                onClick={() => setIsCartOpen(true)}
                title="View Shopping Cart"
              >
                <ShoppingCart size={16} className="cart-nav-icon" /> Cart
                {cartItems.length > 0 && (
                  <span key={`nav-badge-${cartAnimKey}`} className="cart-badge-count cart-badge-pop">
                    {cartItems.reduce((acc, it) => acc + (it.quantity || 1), 0)}
                  </span>
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
                title="Owner options menu (Product Questions, Scheduled Offers, Rescue Deals, Shop Sections, Payment QR, Manage Colours)"
                aria-label="Owner options menu"
              >
                <MoreVertical size={20} />
                {pendingQuestionsCount > 0 && (
                  <span
                    className="blinking-green-dot"
                    style={{ top: '4px', right: '4px' }}
                    title={`${pendingQuestionsCount} pending customer question(s)`}
                  />
                )}
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
                  setIsSideMenuOpen(false);
                  navigateToHome();
                }}
              >
                <Boxes size={19} /> Home
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
                  setIsSideMenuOpen(false);
                  setIsCartOpen(true);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShoppingCart size={19} /> Shopping Cart
                </span>
                {cartItems.length > 0 && (
                  <span key={`side-badge-${cartAnimKey}`} className="cart-badge-count cart-badge-pop" style={{ marginLeft: 'auto' }}>
                    {cartItems.reduce((acc, it) => acc + (it.quantity || 1), 0)}
                  </span>
                )}
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
              <span className="owner-panel-section-label">PROMOTIONS & OFFERS</span>

              <div className="owner-panel-items">
                {/* 1. Festival Campaigns */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'campaigns' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('campaigns');
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                    <Sparkles size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Festival Campaigns</strong>
                    <span>Storewide & category festival discounts</span>
                  </div>
                  {ownerTab === 'campaigns' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {activeDiscountCampaigns.length > 0
                        ? `${activeDiscountCampaigns.length} live`
                        : `${discountCampaigns.filter((c) => !c.deleted).length} total`}
                    </span>
                  )}
                </button>

                {/* 2. Rescue Deals */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'rescueDeals' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('rescueDeals');
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon" style={{ backgroundColor: '#ffedd5', color: '#c2410c' }}>
                    <Flame size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Rescue Deals</strong>
                    <span>Single-stock clearance & bargain shelf</span>
                  </div>
                  {ownerTab === 'rescueDeals' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {rescueDeals.filter((d) => !d.claimed && !d.deleted).length} available
                    </span>
                  )}
                </button>
              </div>

              <div className="owner-panel-divider" />

              <span className="owner-panel-section-label">STORE CONFIGURATION</span>

              <div className="owner-panel-items">
                {/* 3. Shop Sections */}
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

                {/* 4. Payment QR */}
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

                {/* 5. Manage Colours */}
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

                {/* 6. Edit Popular Searches */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'popularSearches' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('popularSearches');
                    void loadPopularSearches();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon">
                    <Search size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Edit Popular Searches</strong>
                    <span>Customer search bar suggestions</span>
                  </div>
                  {ownerTab === 'popularSearches' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {popularSearches.length} saved
                    </span>
                  )}
                </button>

                {/* 7. Product Questions */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'questions' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('questions');
                    void loadOwnerProductQuestions();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                    <HelpCircle size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Product Questions</strong>
                    <span>Reply to customer Q&A on products</span>
                  </div>
                  {ownerTab === 'questions' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {pendingQuestionsCount > 0
                        ? `${pendingQuestionsCount} pending`
                        : `${ownerProductQuestions.length} total`}
                    </span>
                  )}
                </button>

                {/* 8. Playnix AI Assistant */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'aiAssistant' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('aiAssistant');
                    void loadOwnerAiData();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon" style={{ backgroundColor: '#ede9fe', color: '#5b21b6' }}>
                    <Bot size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Playnix AI Assistant</strong>
                    <span>Website scan, training &amp; Q&amp;A drafts</span>
                  </div>
                  {ownerTab === 'aiAssistant' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {!aiState.enabled
                        ? 'Paused'
                        : aiState.hasCompletedInitialScan
                        ? 'AI On'
                        : 'Setup'}
                    </span>
                  )}
                </button>

                {/* 9. AI Watchdog */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'watchdog' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('watchdog');
                    void loadOwnerWatchdogData();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div
                    className="owner-panel-item-icon"
                    style={{
                      backgroundColor: watchdogMetrics.criticalAlerts > 0 ? '#fee2e2' : '#dcfce7',
                      color: watchdogMetrics.criticalAlerts > 0 ? '#b91c1c' : '#166534',
                    }}
                  >
                    <ShieldAlert size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>AI Watchdog</strong>
                    <span>Orders, products, pricing &amp; error alerts</span>
                  </div>
                  {ownerTab === 'watchdog' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span
                      className="owner-panel-status-tag"
                      style={
                        watchdogMetrics.criticalAlerts > 0
                          ? { backgroundColor: '#fee2e2', color: '#991b1b' }
                          : watchdogMetrics.totalPendingAlerts > 0
                          ? { backgroundColor: '#fef3c7', color: '#92400e' }
                          : undefined
                      }
                    >
                      {watchdogMetrics.criticalAlerts > 0
                        ? `${watchdogMetrics.criticalAlerts} critical`
                        : watchdogMetrics.totalPendingAlerts > 0
                        ? `${watchdogMetrics.totalPendingAlerts} alerts`
                        : 'Healthy'}
                    </span>
                  )}
                </button>

                {/* 10. Filament Cost Settings */}
                <button
                  type="button"
                  className={`owner-panel-item ${ownerTab === 'filamentSettings' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('filamentSettings');
                    setFilamentCostFeedback(null);
                    if (filamentCostPerGram !== null) {
                      setFilamentCostInput(String(filamentCostPerGram));
                    }
                    void loadShopModes();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <div className="owner-panel-item-icon" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                    <Scale size={20} />
                  </div>
                  <div className="owner-panel-item-info">
                    <strong>Filament Cost Settings</strong>
                    <span>1g filament cost for AI price calculator</span>
                  </div>
                  {ownerTab === 'filamentSettings' ? (
                    <span className="owner-panel-active-tag">Active</span>
                  ) : (
                    <span className="owner-panel-status-tag">
                      {filamentCostPerGram && filamentCostPerGram > 0
                        ? `₹${filamentCostPerGram}/g`
                        : 'Not set'}
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
                  className={`owner-quick-btn ${ownerTab === 'analytics' ? 'active' : ''}`}
                  onClick={() => {
                    setOwnerTab('analytics');
                    void loadAnalyticsData();
                    setIsOwnerMenuOpen(false);
                    window.scrollTo({ top: 320, behavior: 'smooth' });
                  }}
                >
                  <BarChart3 size={15} /> Analytics Dashboard
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
                <span className="eyebrow">PLAYNIX · AFFORDABLE TOYS &amp; 3D PRINTS</span>
                <h1>
                  Playnix affordable
                  <br />
                  <em>toys &amp; 3D prints.</em>
                </h1>
                <p>
                  Shop Playnix online for affordable toys, 3D printed products, and unique budget-friendly picks delivered in a few easy steps.
                </p>
                <button
                  className="primary-btn"
                  onClick={() => {
                    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Explore Playnix <ArrowLeft className="arrow-down" size={17} />
                </button>
                <div className="hero-proof">
                  <span className="proof-icon">✦</span> Budget-friendly online shopping at Playnix
                </div>
              </div>

              <HeroToyShowcase
                products={products}
                isHomeVisible={page === 'home'}
                onSelectProduct={(prod) => navigateToProduct(prod)}
              />
            </section>

            {/* FESTIVAL-WIDE DISCOUNT CAMPAIGN SHOWCASE: Dedicated promotional section */}
            {activeDiscountCampaigns.length > 0 && selectedCustomerCampaign && (
              <section className="festival-campaign-showcase" id="festival-campaign">
                {/* Multi-Campaign Switcher Tabs for Customers to Browse Different Active Campaigns */}
                {activeDiscountCampaigns.length > 1 && (
                  <div className="customer-campaigns-nav">
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '6px', flexShrink: 0 }}>
                      <Sparkles size={14} style={{ color: '#d97706' }} /> Active Campaigns ({activeDiscountCampaigns.length}):
                    </span>
                    {activeDiscountCampaigns.map((camp) => {
                      const isActive = selectedCustomerCampaign.id === camp.id;
                      const discTag = camp.discountType === 'percentage' ? `${camp.discountValue}% OFF` : `₹${camp.discountValue} FLAT OFF`;
                      return (
                        <button
                          key={camp.id}
                          type="button"
                          className={`customer-campaign-pill ${isActive ? 'active' : ''}`}
                          onClick={() => setCustomerActiveCampaignId(camp.id)}
                        >
                          <span>{camp.name}</span>
                          <span className="pill-discount-tag">{discTag}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {(() => {
                  const currentCamp = selectedCustomerCampaign;
                  const preset = FESTIVAL_BANNER_PRESETS.find((p) => p.id === currentCamp.bannerImageUrl);
                  const bgImage = preset?.imageUrl || (currentCamp.bannerImageUrl?.startsWith('http') ? currentCamp.bannerImageUrl : undefined);
                  const gradient = preset?.gradient || 'linear-gradient(135deg, #78350f 0%, #b45309 45%, #f59e0b 100%)';
                  const badge = preset?.badge || '🎉 FESTIVAL SALE';
                  const countdown = formatTimeRemaining(currentCamp.endAt, currentTime);

                  const eligibleProducts = products.filter((p) => {
                    if (p.available === false) return false;
                    if (currentCamp.targetScope === 'all') return true;
                    if (currentCamp.targetScope === 'categories') {
                      return currentCamp.targetCategories?.includes(p.category || 'Other');
                    }
                    if (currentCamp.targetScope === 'products') {
                      return currentCamp.targetProductIds?.includes(p.id);
                    }
                    return false;
                  });

                  return (
                    <>
                      <div
                        className="festival-hero-banner"
                        style={{
                          backgroundImage: bgImage ? `url(${bgImage})` : undefined,
                          background: !bgImage ? gradient : undefined,
                        }}
                      >
                        <div
                          className="festival-hero-overlay"
                          style={{
                            background: bgImage
                              ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.72) 0%, rgba(15, 23, 42, 0.88) 100%)'
                              : 'rgba(0,0,0,0.12)',
                          }}
                        />
                        <div className="festival-hero-content">
                          <span className="festival-badge-pill">
                            <Sparkles size={12} /> {badge}
                          </span>
                          <h2 className="festival-hero-title">
                            {currentCamp.name.toUpperCase()} – GET{' '}
                            {currentCamp.discountType === 'percentage'
                              ? `${currentCamp.discountValue}% OFF`
                              : `₹${currentCamp.discountValue} FLAT OFF`}
                            !
                          </h2>
                          {currentCamp.description && (
                            <p className="festival-hero-desc">{currentCamp.description}</p>
                          )}
                          <div className="festival-discount-highlight">
                            <Tag size={16} />
                            <span>
                              {currentCamp.targetScope === 'all'
                                ? `FLAT ${currentCamp.discountType === 'percentage' ? `${currentCamp.discountValue}% OFF STOREWIDE` : `₹${currentCamp.discountValue} OFF ON ALL TOYS`}`
                                : currentCamp.targetScope === 'categories'
                                ? `FLAT ${currentCamp.discountType === 'percentage' ? `${currentCamp.discountValue}% OFF` : `₹${currentCamp.discountValue} OFF`} ON ${currentCamp.targetCategories?.join(', ')}`
                                : `SPECIAL DISCOUNT ON ${currentCamp.targetProductIds?.length} FEATURED TOYS`}
                            </span>
                          </div>

                          {/* Live Countdown Timer in Asia/Kolkata timezone */}
                          <div className="festival-timer-wrap">
                            <span className="festival-timer-label">
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              Festival Offer Ends In:
                            </span>
                            <div className="festival-timer-boxes">
                              {countdown.days > 0 && (
                                <>
                                  <div className="festival-time-box">
                                    <span className="festival-time-num">{String(countdown.days).padStart(2, '0')}</span>
                                    <span className="festival-time-sub">Days</span>
                                  </div>
                                  <span className="festival-timer-colon">:</span>
                                </>
                              )}
                              <div className="festival-time-box">
                                <span className="festival-time-num">{String(countdown.hours).padStart(2, '0')}</span>
                                <span className="festival-time-sub">Hours</span>
                              </div>
                              <span className="festival-timer-colon">:</span>
                              <div className="festival-time-box">
                                <span className="festival-time-num">{String(countdown.minutes).padStart(2, '0')}</span>
                                <span className="festival-time-sub">Mins</span>
                              </div>
                              <span className="festival-timer-colon">:</span>
                              <div className="festival-time-box">
                                <span className="festival-time-num">{String(countdown.seconds).padStart(2, '0')}</span>
                                <span className="festival-time-sub">Secs</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Featured eligible products shelf */}
                      {eligibleProducts.length > 0 && (
                        <div className="festival-products-section">
                          <div className="festival-products-header">
                            <h4>
                              <Sparkles size={16} style={{ color: '#d97706' }} /> Featured Festival Deals
                            </h4>
                            <span className="festival-scope-tag">
                              {currentCamp.targetScope === 'all'
                                ? `All ${eligibleProducts.length} Toys Included`
                                : `${eligibleProducts.length} Toys On Sale`}
                            </span>
                          </div>

                          <div className="festival-products-grid">
                            {eligibleProducts.slice(0, 6).map((p) => {
                              const discountInfo = calculateProductDiscount(p, [currentCamp]);
                              const firstImg = (p.imageUrls && p.imageUrls[0]) || p.imageUrl || '/toys/toy-40ba4ba9-1.jpg';
                              const productHref = getProductPath(p, products);

                              return (
                                <article
                                  className="festival-product-card"
                                  key={`fest_${p.id}`}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => {
                                    if (window.getSelection()?.toString().trim()) return;
                                    navigateToProduct(p);
                                  }}
                                >
                                  <span className="festival-card-badge">
                                    {discountInfo.discountLabel}
                                  </span>
                                  <a
                                    href={productHref}
                                    className="festival-card-product-link"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                                        e.preventDefault();
                                        navigateToProduct(p);
                                      }
                                    }}
                                  >
                                    <img src={firstImg} alt={p.name} className="festival-card-image" loading="lazy" />
                                    <h5 className="festival-card-title">{p.name}</h5>
                                  </a>
                                  <div className="festival-card-pricing">
                                    <span className="festival-final-price">{da(discountInfo.discountedPrice)}</span>
                                    <span className="festival-original-price">{da(p.price)}</span>
                                  </div>
                                  <span className="festival-savings-pill">
                                    Save {da(p.price - discountInfo.discountedPrice)}
                                  </span>
                                  <button
                                    type="button"
                                    className="festival-card-buy-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedProductForBuy(p);
                                      setSelectedDealForBuy(null);
                                      setSelectedOfferForBuy(null);
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
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                  >
                                    <ShoppingBag size={14} /> Buy with Discount
                                  </button>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </section>
            )}

            {/* SCHEDULED OFFERS / SPECIAL OFFERS SECTION: Dedicated active promotions with countdowns */}
            {activeScheduledOffers.length > 0 && (
              <section className="scheduled-offers-section" id="special-offers">
                <div className="scheduled-offers-header">
                  <div>
                    <span className="eyebrow scheduled-offers-eyebrow">
                      <Sparkles size={13} /> TIME-LIMITED SPECIAL OFFERS
                    </span>
                    <h2>
                      Special Offers <span className="rescue-counter" style={{ background: '#dcfce7', color: '#15803d' }}>({activeScheduledOffers.length} Active)</span>
                    </h2>
                    <p>
                      Exclusive limited-time discounts on favorite toys! Prices automatically return to regular after the countdown.
                    </p>
                  </div>
                  <div className="rescue-pill-banner" style={{ background: '#e8f5e3', color: '#166534', border: '1px solid #bbf7d0' }}>
                    <Clock size={15} /> Real-Time Countdown · Instant Claim
                  </div>
                </div>

                <div className="scheduled-offers-grid">
                  {activeScheduledOffers.map((offer) => {
                    const discountPct =
                      offer.originalPrice > offer.discountedPrice
                        ? Math.round(((offer.originalPrice - offer.discountedPrice) / offer.originalPrice) * 100)
                        : 0;
                    const countdown = formatTimeRemaining(offer.endAt, currentTime);

                    return (
                      <article className="scheduled-offer-card" key={offer.id}>
                        <div className="scheduled-offer-image-wrap">
                          <img
                            src={offer.productImageUrl || '/toys/toy-40ba4ba9-1.jpg'}
                            alt={offer.title}
                            loading="lazy"
                          />
                          <span className="special-offer-pill">
                            <Sparkles size={11} /> SPECIAL OFFER
                          </span>
                          {discountPct > 0 && (
                            <span className="special-offer-discount-bubble">
                              {discountPct}% OFF
                            </span>
                          )}
                        </div>

                        <div className="countdown-timer-box">
                          <span className="timer-label">
                            <Clock size={12} /> Ends in
                          </span>
                          <span className="timer-digits">
                            {countdown.formatted}
                          </span>
                        </div>

                        <div className="scheduled-offer-body">
                          <div className="scheduled-offer-meta">
                            <span className="scheduled-offer-category">{offer.productCategory || 'Special'}</span>
                            <span style={{ fontSize: '11px', color: '#65715d' }}>{offer.productName}</span>
                          </div>

                          <h3 className="scheduled-offer-title">{offer.title}</h3>
                          <p className="scheduled-offer-desc">
                            Save {da(offer.originalPrice - offer.discountedPrice)} on {offer.productName}! Regular price is {da(offer.originalPrice)}.
                          </p>

                          <div className="scheduled-offer-price-row">
                            <div className="scheduled-offer-price-block">
                              <span className="scheduled-offer-original-price">{da(offer.originalPrice)}</span>
                              <strong className="scheduled-offer-deal-price">{da(offer.discountedPrice)}</strong>
                            </div>

                            <button
                              type="button"
                              className="scheduled-offer-buy-btn"
                              onClick={() => {
                                const matchedProd = products.find((p) => p.id === offer.productId);
                                setSelectedOfferForBuy(offer);
                                setSelectedProductForBuy(matchedProd || null);
                                setSelectedDealForBuy(null);
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
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              <Tag size={13} /> Grab Offer
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

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
                  <span className="eyebrow">PLAYNIX COLLECTION</span>
                  <h2>
                    Playnix toy shelf <span>({products.filter((p) => p.available !== false).length})</span>
                  </h2>
                  <p>Browse cheap toys online and unique 3D printed products with upfront prices.</p>
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

              <CustomerSearchBar
                products={products}
                popularSearches={popularSearches}
                activeOffersByProductId={activeOffersByProductId}
                activeDiscountCampaigns={activeDiscountCampaigns}
                isSyncingCloud={searchCloudSyncing}
                onEnsureCloudProducts={() => void ensureCloudProductsForSearch()}
                onSelectProduct={(prod) => navigateToProduct(prod)}
                formatCurrency={da}
              />

              <AnimatedCategoryDropdown
                id="customer-category"
                label="Category"
                value={selectedCategory}
                options={[
                  'All categories',
                  ...Array.from(
                    new Set(
                      products
                        .filter((p) => p.available !== false)
                        .map((p) => p.category || 'Other')
                    )
                  ).sort(),
                ]}
                onChange={(cat) => {
                  setSelectedCategory(cat);
                  if (cat !== 'All categories' && hasMoreProducts) {
                    void ensureAllProductSummariesLoaded();
                  }
                }}
              />

              {productsError && (
                <div className="catalog-sync-notice" role="status">
                  <span>{productsError}</span>
                  <button
                    type="button"
                    className="catalog-sync-retry-btn"
                    onClick={() => void loadProducts({ forceRefresh: true })}
                    disabled={productsLoading || isRefreshing}
                  >
                    <RefreshCw size={13} className={productsLoading ? 'refresh-spinning' : ''} /> Retry
                  </button>
                </div>
              )}

              {productsLoading && products.filter((p) => p.available !== false).length === 0 ? (
                <div className="product-grid" aria-busy="true" aria-label="Loading Playnix toys">
                  {Array.from({ length: 6 }).map((_, sIdx) => (
                    <div className="product-card product-skeleton-card" key={`skel-${sIdx}`}>
                      <div className="product-image product-skeleton-media" />
                      <div className="product-info">
                        <div className="product-skeleton-line short" />
                        <div className="product-skeleton-line title" />
                        <div className="product-skeleton-line" />
                        <div className="product-skeleton-line medium" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : products.filter((p) => p.available !== false).length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🪁</div>
                  <h3>The toy shelf is waiting!</h3>
                  <p>New toys will appear here when the owner adds them.</p>
                  <button className="secondary-btn" onClick={() => setPage('ownerLogin')}>
                    Owner? Add your first toy
                  </button>
                </div>
              ) : (
                <>
                  <div className="product-grid category-transition-grid" key={`cat-grid-${selectedCategory}`}>
                    {homepageDisplayProducts
                      .filter(
                        (p) =>
                          p.available !== false &&
                          (selectedCategory === 'All categories' ||
                            (p.category || 'Other') === selectedCategory)
                      )
                      .map((p, idx) => {
                        const count = p.photoCount || (p.imageUrls && p.imageUrls.length) || (p.imageUrl ? 1 : 0);
                        const firstImg = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
                        const isAboveFold = idx < 4;
                        const activeOffer = activeOffersByProductId.get(p.id);
                        const campaignDiscount = calculateProductDiscount(p, activeDiscountCampaigns);
                        const hasDiscount = Boolean(activeOffer || campaignDiscount.isDiscounted);
                        const effectivePrice = activeOffer
                          ? activeOffer.discountedPrice
                          : campaignDiscount.isDiscounted
                          ? campaignDiscount.discountedPrice
                          : p.price;
                        const originalPrice = p.price;
                        const savingsAmount = originalPrice - effectivePrice;
                        const discountPct =
                          originalPrice > 0 ? Math.round((savingsAmount / originalPrice) * 100) : 0;
                        const isJustAdded = justAddedProductId === p.id;

                        const productHref = getProductPath(p, products);

                        return (
                          <article
                            className="product-card product-card-reveal"
                            key={p.id}
                            style={
                              {
                                '--reveal-delay': `${Math.min(idx % 6, 5) * 45}ms`,
                              } as React.CSSProperties
                            }
                            onClick={() => {
                              if (window.getSelection()?.toString().trim()) return;
                              navigateToProduct(p);
                            }}
                          >
                            <div className="product-media-wrap">
                              <a
                                href={productHref}
                                className="product-image product-image-button"
                                aria-label={`View details and photos for ${p.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                                    e.preventDefault();
                                    navigateToProduct(p);
                                  }
                                }}
                              >
                                {firstImg ? (
                                  <img
                                    src={firstImg}
                                    alt={p.name}
                                    loading={isAboveFold ? 'eager' : 'lazy'}
                                    decoding="async"
                                    fetchPriority={isAboveFold ? 'high' : 'low'}
                                    width={320}
                                    height={220}
                                  />
                                ) : (
                                  <div className="placeholder-toy">🧸</div>
                                )}
                                {activeOffer ? (
                                  <span className="catalog-card-offer-badge">
                                    <Sparkles size={10} style={{ display: 'inline', marginRight: '3px' }} /> SPECIAL OFFER
                                  </span>
                                ) : campaignDiscount.isDiscounted ? (
                                  <span className="catalog-festival-badge">
                                    <Sparkles size={10} /> {campaignDiscount.discountLabel}
                                  </span>
                                ) : null}
                                <span className="product-badge">
                                  {count > 1 ? `${count} PHOTOS · TAP TO VIEW` : 'TAP TO VIEW'}
                                </span>
                              </a>
                            </div>

                            <div className="product-info">
                              <span className="product-category">{p.category || 'Other'}</span>

                              {activeOffer ? (
                                <div className="catalog-offer-timer-strip">
                                  <Clock size={12} /> Ends: {formatTimeRemaining(activeOffer.endAt, currentTime).formatted}
                                </div>
                              ) : campaignDiscount.isDiscounted && primaryActiveCampaign ? (
                                <div className="catalog-offer-timer-strip" style={{ color: '#b45309', background: '#fef3c7' }}>
                                  <Clock size={12} /> {primaryActiveCampaign.name}: {formatTimeRemaining(primaryActiveCampaign.endAt, currentTime).formatted}
                                </div>
                              ) : null}

                              <h3>
                                <a
                                  href={productHref}
                                  className="product-title-link"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                                      e.preventDefault();
                                      navigateToProduct(p);
                                    }
                                  }}
                                >
                                  {p.name}
                                </a>
                              </h3>
                              <p className="product-desc">
                                {p.description || 'A fun new friend for playtime.'}
                              </p>
                              <div className="product-bottom">
                                {hasDiscount ? (
                                  <div>
                                    <span style={{ fontSize: '12px', color: '#88927e', textDecoration: 'line-through', marginRight: '6px' }}>
                                      {da(originalPrice)}
                                    </span>
                                    <strong style={{ color: '#15803d', fontSize: '20px' }}>{da(effectivePrice)}</strong>
                                    <span style={{ display: 'block', fontSize: '10px', color: '#15803d', fontWeight: 800 }}>
                                      Save {da(savingsAmount)} ({discountPct}% OFF)
                                    </span>
                                  </div>
                                ) : (
                                  <strong>{da(p.price)}</strong>
                                )}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    className={`secondary-btn product-add-cart-btn ${isJustAdded ? 'is-just-added' : ''}`}
                                    style={{ padding: '8px 11px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                    title="Add to cart"
                                    aria-label={`Add ${p.name} to cart`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleAddToCart(p, '', 1, false, undefined, Boolean(activeOffer), activeOffer?.id);
                                    }}
                                  >
                                    {isJustAdded ? <Check size={15} /> : <ShoppingCart size={15} />}
                                  </button>
                                  <button
                                    className="buy-btn"
                                    style={hasDiscount ? { background: '#273824', color: '#ffffff' } : {}}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (activeOffer) {
                                        setSelectedOfferForBuy(activeOffer);
                                      } else {
                                        setSelectedOfferForBuy(null);
                                      }
                                      setSelectedProductForBuy(p);
                                      setSelectedDealForBuy(null);
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
                                    {hasDiscount ? 'Grab Deal' : 'Buy now'} <ArrowLeft size={15} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                  </div>

                  {hasMoreProducts && selectedCategory === 'All categories' && (
                    <div className="catalog-load-more-wrap">
                      <button
                        type="button"
                        className="secondary-btn catalog-load-more-btn"
                        onClick={() => void loadMoreProducts()}
                        disabled={loadingMoreProducts}
                      >
                        {loadingMoreProducts ? (
                          <>
                            <RefreshCw size={15} className="refresh-spinning" /> Loading more toys…
                          </>
                        ) : (
                          <>Load more toys</>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {/* INDIVIDUAL PRODUCT DETAIL PAGE (/products/:slug) */}
        {page === 'productDetail' && (
          selectedProductForDetail ? (
            <CustomerProductDetail
              product={products.find((p) => p.id === selectedProductForDetail.id) || selectedProductForDetail}
              activeOffer={activeOffersByProductId.get(selectedProductForDetail.id)}
              activeDiscountCampaigns={activeDiscountCampaigns}
              currentTime={currentTime}
              onBack={() => navigateToHome()}
              onBuyNow={(prod, activeOffer) => {
                if (activeOffer) {
                  setSelectedOfferForBuy(activeOffer);
                } else {
                  setSelectedOfferForBuy(null);
                }
                setSelectedProductForBuy(prod);
                setSelectedDealForBuy(null);
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
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onAddToCart={(prod, activeOffer) => {
                void handleAddToCart(prod, '', 1, false, undefined, Boolean(activeOffer), activeOffer?.id);
              }}
              formatCurrency={da}
              customerId={customerId}
              defaultCustomerName={guestProvidedName}
              onCustomerNameProvided={associateCheckoutNameWithGuestCart}
            />
          ) : (
            <section className="form-page product-detail-page" aria-label="Product lookup">
              <div className="product-not-found-card">
                {!cloudProductsLoaded ? (
                  <>
                    <div className="empty-icon">🧸</div>
                    <h1>Loading toy details…</h1>
                    <p>Fetching the latest product information from Playnix.</p>
                  </>
                ) : (
                  <>
                    <div className="empty-icon">🔍</div>
                    <h1>Toy not found</h1>
                    <p>
                      {productsError
                        ? 'We could not reach the shop right now. Check your connection and try again.'
                        : "We couldn't find a product at this URL. It may have been removed or renamed."}
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {productsError && (
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => void loadProducts({ forceRefresh: true })}
                        >
                          <RefreshCw size={15} /> Retry
                        </button>
                      )}
                      <a
                        href="/"
                        className="primary-btn"
                        onClick={(e) => {
                          if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                            e.preventDefault();
                            navigateToHome();
                          }
                        }}
                      >
                        <ArrowLeft size={16} /> Back to Playnix shop
                      </a>
                    </div>
                  </>
                )}
              </div>
            </section>
          )
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
        {page === 'buy' && (selectedProductForBuy || selectedDealForBuy || selectedOfferForBuy) && (
          <section className="form-page">
            <button
              className="back-link"
              onClick={() => {
                setPage('home');
                setErrorMessage('');
                setSelectedDealForBuy(null);
                setSelectedOfferForBuy(null);
                setSelectedProductForBuy(null);
              }}
            >
              <ArrowLeft size={16} /> Back to shop
            </button>

            {checkoutMode ? (
              <div className="form-layout">
                {/* Order Summary */}
                <div className="order-summary">
                  {selectedOfferForBuy ? (
                    <>
                      <span className="eyebrow scheduled-offers-eyebrow">
                        <Sparkles size={12} /> SPECIAL SCHEDULED OFFER
                      </span>
                      <div className="summary-image">
                        <img
                          src={selectedOfferForBuy.productImageUrl || '/toys/toy-40ba4ba9-1.jpg'}
                          alt={selectedOfferForBuy.title}
                        />
                      </div>

                      <div style={{ marginBottom: '10px' }}>
                        <span className="special-offer-pill">
                          <Sparkles size={11} /> SPECIAL OFFER · {Math.round(((selectedOfferForBuy.originalPrice - selectedOfferForBuy.discountedPrice) / selectedOfferForBuy.originalPrice) * 100)}% OFF
                        </span>
                      </div>

                      <h2>{selectedOfferForBuy.title}</h2>
                      <p>{selectedOfferForBuy.productName} — Limited time promotion.</p>

                      {Boolean(selectedOfferForBuy.claimed || selectedOfferForBuy.status === 'Completed') ? (
                        <div className="rescue-claimed-warning-box" role="alert">
                          <AlertCircle size={22} style={{ flexShrink: 0 }} />
                          <div>
                            <strong>No Longer Available</strong>
                            <p>This special offer has already been claimed by another customer.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="countdown-timer-box" style={{ borderRadius: '8px', marginBottom: '14px' }}>
                          <span className="timer-label"><Clock size={13} /> Time remaining</span>
                          <span className="timer-digits">{formatTimeRemaining(selectedOfferForBuy.endAt, currentTime).formatted}</span>
                        </div>
                      )}

                      <div className="summary-price-box">
                        <div className="summary-price-breakdown">
                          <div className="summary-breakdown-row">
                            <span>Regular store price</span>
                            <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                              {da(selectedOfferForBuy.originalPrice)}
                            </span>
                          </div>
                          <div className="summary-breakdown-row">
                            <span>Promotional Offer Price</span>
                            <span style={{ color: '#15803d', fontWeight: 800 }}>
                              {da(selectedOfferForBuy.discountedPrice)}
                            </span>
                          </div>
                          <div className="summary-breakdown-row">
                            <span>Instant Savings</span>
                            <span style={{ color: '#15803d', fontWeight: 700 }}>
                              Save {da(selectedOfferForBuy.originalPrice - selectedOfferForBuy.discountedPrice)}
                            </span>
                          </div>
                          <div className="summary-breakdown-row">
                            <span>Quantity</span>
                            <span>1 toy</span>
                          </div>
                        </div>
                        <div className="summary-price">
                          <span>Total Price</span>
                          <strong style={{ color: '#15803d' }}>{da(selectedOfferForBuy.discountedPrice)}</strong>
                        </div>
                      </div>
                    </>
                  ) : selectedDealForBuy ? (
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

                      {(() => {
                        const campaignDisc = calculateProductDiscount(selectedProductForBuy, activeDiscountCampaigns);
                        const effectiveUnit = campaignDisc.hasDiscount ? campaignDisc.discountedPrice : selectedProductForBuy.price;
                        const originalUnit = selectedProductForBuy.price;

                        return (
                          <div className="summary-price-box">
                            {campaignDisc.hasDiscount && (
                              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  🎉 {campaignDisc.campaignName}
                                </span>
                                <span style={{ fontSize: '11px', fontWeight: 800, background: '#b45309', color: '#fff', padding: '2px 8px', borderRadius: '999px' }}>
                                  {campaignDisc.discountType === 'percentage' ? `${campaignDisc.discountValue}% OFF` : `SAVE ₹${campaignDisc.discountValue}`}
                                </span>
                              </div>
                            )}

                            {(orderQuantity > 1 || campaignDisc.hasDiscount) && (
                              <div className="summary-price-breakdown">
                                <div className="summary-breakdown-row">
                                  <span>Unit price</span>
                                  <span>
                                    {campaignDisc.hasDiscount ? (
                                      <>
                                        <del style={{ color: '#9ca3af', marginRight: '6px' }}>{da(originalUnit)}</del>
                                        <strong style={{ color: '#15803d' }}>{da(effectiveUnit)}</strong>
                                      </>
                                    ) : (
                                      da(originalUnit)
                                    )}
                                  </span>
                                </div>
                                {orderQuantity > 1 && (
                                  <div className="summary-breakdown-row">
                                    <span>Quantity</span>
                                    <span>{orderQuantity} toys</span>
                                  </div>
                                )}
                                {campaignDisc.hasDiscount && (
                                  <div className="summary-breakdown-row" style={{ color: '#15803d', fontWeight: 600 }}>
                                    <span>Total savings</span>
                                    <span>- {da(campaignDisc.savingsPerUnit * orderQuantity)}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="summary-price">
                              <span>{orderQuantity > 1 ? 'Total Price' : 'Price'}</span>
                              <strong style={campaignDisc.hasDiscount ? { color: '#15803d' } : undefined}>
                                {da(effectiveUnit * orderQuantity)}
                              </strong>
                            </div>
                          </div>
                        );
                      })()}
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
                      onBlur={(e) => associateCheckoutNameWithGuestCart(e.target.value)}
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

            {orderSuccessCelebration && (
              <OrderSuccessCelebration
                celebration={orderSuccessCelebration}
                formatCurrency={da}
                onDismiss={() => setOrderSuccessCelebration(null)}
              />
            )}

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

                    {/* Customer note to owner */}
                    <div className="customer-order-note-box">
                      <div className="customer-order-note-head">
                        <span className="customer-order-note-title">
                          <MessageSquare size={13} /> Note to owner
                        </span>
                        {editingCustomerNoteOrderId !== o.id && (
                          <button
                            type="button"
                            className="customer-order-note-edit-btn"
                            onClick={() => {
                              setEditingCustomerNoteOrderId(o.id);
                              setCustomerNoteDraft(o.note || '');
                            }}
                          >
                            <Pencil size={11} /> {o.note?.trim() ? 'Edit note' : 'Add note'}
                          </button>
                        )}
                      </div>

                      {customerNoteSuccessId === o.id && (
                        <span className="customer-order-note-success">
                          <Check size={13} /> Note sent to owner!
                        </span>
                      )}

                      {editingCustomerNoteOrderId === o.id ? (
                        <div className="customer-order-note-form">
                          <textarea
                            className="customer-order-note-textarea"
                            placeholder="Add delivery instructions, preferred colour details, or a message for the owner…"
                            value={customerNoteDraft}
                            onChange={(e) => setCustomerNoteDraft(e.target.value)}
                            maxLength={250}
                            rows={3}
                            autoFocus
                          />
                          <div className="customer-order-note-actions">
                            <button
                              type="button"
                              className="customer-order-note-save-btn"
                              disabled={savingCustomerNoteOrderId === o.id}
                              onClick={() => void handleSaveCustomerNote(o.id)}
                            >
                              {savingCustomerNoteOrderId === o.id ? 'Saving…' : 'Save note'}
                            </button>
                            <button
                              type="button"
                              className="customer-order-note-cancel-btn"
                              onClick={() => {
                                setEditingCustomerNoteOrderId(null);
                                setCustomerNoteDraft('');
                              }}
                            >
                              Cancel
                            </button>
                            {o.note?.trim() && (
                              <button
                                type="button"
                                className="customer-order-note-clear-btn"
                                onClick={() => {
                                  setCustomerNoteDraft('');
                                  void handleSaveCustomerNote(o.id);
                                }}
                              >
                                Remove note
                              </button>
                            )}
                          </div>
                        </div>
                      ) : o.note?.trim() ? (
                        <p className="customer-order-note-text">"{o.note}"</p>
                      ) : (
                        <p className="customer-order-note-empty-hint">
                          No note added yet. Tap "Add note" to leave special instructions for the owner.
                        </p>
                      )}
                    </div>

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
                    ) : o.status === 'Awaiting Clarification' ||
                      o.aiVerification?.decisionStatus === 'clarification_requested' ? (
                      <div
                        className="queue-status"
                        style={{
                          background: '#fffbeb',
                          borderColor: '#fcd34d',
                          color: '#92400e',
                        }}
                      >
                        <strong>Quick Verification Needed</strong>
                        <p>
                          {o.aiVerification?.clarificationMessage ||
                            o.ownerNote ||
                            'The shop owner requested a quick verification of your order details so preparation can begin smoothly.'}
                        </p>
                        {clarifyingCustomerOrderId === o.id ? (
                          <div
                            style={{
                              marginTop: 10,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            {o.mode === 'Adult' ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                <input
                                  type="tel"
                                  value={customerClarifyPhoneDraft}
                                  onChange={(e) => setCustomerClarifyPhoneDraft(e.target.value)}
                                  placeholder="Updated phone number (optional)"
                                  maxLength={20}
                                  style={{ flex: '1 1 180px', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
                                />
                                <input
                                  type="text"
                                  value={customerClarifyAddressDraft}
                                  onChange={(e) => setCustomerClarifyAddressDraft(e.target.value)}
                                  placeholder="Updated delivery address (optional)"
                                  maxLength={180}
                                  style={{ flex: '2 1 220px', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
                                />
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                <input
                                  type="text"
                                  value={customerClarifyClassDraft}
                                  onChange={(e) => setCustomerClarifyClassDraft(e.target.value)}
                                  placeholder="Class (optional)"
                                  maxLength={20}
                                  style={{ flex: '1 1 120px', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
                                />
                                <input
                                  type="text"
                                  value={customerClarifySectionDraft}
                                  onChange={(e) => setCustomerClarifySectionDraft(e.target.value)}
                                  placeholder="Section (optional)"
                                  maxLength={20}
                                  style={{ flex: '1 1 120px', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
                                />
                              </div>
                            )}
                            <textarea
                              rows={2}
                              maxLength={400}
                              value={customerClarifyReplyDraft}
                              onChange={(e) => setCustomerClarifyReplyDraft(e.target.value)}
                              placeholder="Type your confirmation or corrected order details here…"
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
                            />
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="primary-btn"
                                disabled={savingCustomerClarifyId === o.id}
                                onClick={() => void handleCustomerSubmitClarification(o)}
                              >
                                {savingCustomerClarifyId === o.id ? 'Sending…' : 'Send Clarification'}
                              </button>
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => setClarifyingCustomerOrderId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="primary-btn"
                            style={{ marginTop: 8, padding: '7px 12px', fontSize: 12.5 }}
                            onClick={() => {
                              setClarifyingCustomerOrderId(o.id);
                              setCustomerClarifyReplyDraft(o.aiVerification?.customerClarificationReply || '');
                              setCustomerClarifyPhoneDraft(o.phone || '');
                              setCustomerClarifyAddressDraft(o.address || '');
                              setCustomerClarifyClassDraft(o.studentClass || '');
                              setCustomerClarifySectionDraft(o.section || '');
                            }}
                          >
                            Verify / Reply to Owner
                          </button>
                        )}
                      </div>
                    ) : o.status === 'Clarification Submitted' ? (
                      <div className="queue-status">
                        <strong>Clarification submitted</strong>
                        <p>Thank you! Your updated details have been sent to the shop owner for confirmation.</p>
                      </div>
                    ) : o.status === 'On Hold (AI Review)' ? (
                      <div className="queue-status">
                        <strong>Order saved · Quick verification in progress</strong>
                        <p>Your order has been received safely and is undergoing a quick check by the shop owner.</p>
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
                  title="Owner options (Product Questions, Scheduled Offers, Rescue Deals, Shop Sections, Payment QR, Manage Colours)"
                  aria-label="Owner options menu"
                >
                  <MoreVertical size={19} />
                  {pendingQuestionsCount > 0 && (
                    <span
                      className="blinking-green-dot"
                      style={{ top: '4px', right: '4px' }}
                      title={`${pendingQuestionsCount} pending customer question(s)`}
                    />
                  )}
                </button>
              </div>
            </div>

            <div className="stats-row">
              <div
                className="stat-card stat-card-earned"
                onClick={() => {
                  setMoneyInputAmount('');
                  setMoneyInputNote('');
                  setMoneyModalTab('add');
                  setIsMoneyModalOpen(true);
                }}
                style={{ cursor: 'pointer', position: 'relative' }}
                title="Click to add or subtract money from counter"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                  <span>Total Money Earned</span>
                  <span className="money-adjust-badge">Adjust ±</span>
                </div>
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

            {flaggedOrdersForOwner.length > 0 && (
              <div
                style={{
                  background: flaggedOrdersForOwner.some((o) => o.aiVerification?.riskLevel === 'HIGH')
                    ? '#fef2f2'
                    : '#fffbeb',
                  border: `1.5px solid ${
                    flaggedOrdersForOwner.some((o) => o.aiVerification?.riskLevel === 'HIGH')
                      ? '#fca5a5'
                      : '#fcd34d'
                  }`,
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldAlert
                    size={20}
                    style={{
                      color: flaggedOrdersForOwner.some((o) => o.aiVerification?.riskLevel === 'HIGH')
                        ? '#b91c1c'
                        : '#b45309',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: 13.5, color: '#1f2937' }}>
                      Playnix AI Order Guard Alert · {flaggedOrdersForOwner.length}{' '}
                      {flaggedOrdersForOwner.length === 1 ? 'order needs' : 'orders need'} verification
                    </strong>
                    <span style={{ fontSize: 12, color: '#4b5563' }}>
                      {flaggedOrdersForOwner[0].orderNumber || flaggedOrdersForOwner[0].id} (
                      {flaggedOrdersForOwner[0].name} — {flaggedOrdersForOwner[0].productName}):{' '}
                      {flaggedOrdersForOwner[0].aiVerification?.summaryReason}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="primary-btn"
                    style={{ padding: '7px 13px', fontSize: 12.5 }}
                    onClick={() => {
                      setOwnerTab('orders');
                      setOrderStatusFilter('Flagged');
                    }}
                  >
                    Review Flagged Orders ({flaggedOrdersForOwner.length})
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ padding: '7px 12px', fontSize: 12.5 }}
                    onClick={() => {
                      setOwnerTab('aiAssistant');
                      void loadOwnerAiData();
                    }}
                  >
                    Open AI Order Guard
                  </button>
                </div>
              </div>
            )}

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
                className={ownerTab === 'analytics' ? 'active' : ''}
                onClick={() => {
                  setOwnerTab('analytics');
                  void loadAnalyticsData();
                }}
              >
                <BarChart3 size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '5px' }} />
                Analytics
              </button>
              {(ownerTab === 'questions' || ownerTab === 'aiAssistant' || ownerTab === 'watchdog' || ownerTab === 'filamentSettings' || ownerTab === 'sections' || ownerTab === 'payment' || ownerTab === 'colours' || ownerTab === 'popularSearches' || ownerTab === 'scheduledOffers' || ownerTab === 'rescueDeals' || ownerTab === 'campaigns') && (
                <button
                  className="active panel-active-tab-indicator"
                  type="button"
                  onClick={() => setIsOwnerMenuOpen(true)}
                  title="Active section opened from Owner Menu (Tap to change)"
                >
                  {ownerTab === 'questions' && `❓ Product Questions (${ownerProductQuestions.length})`}
                  {ownerTab === 'aiAssistant' && `🤖 Playnix AI Assistant`}
                  {ownerTab === 'watchdog' && `🛡️ AI Watchdog (${watchdogMetrics.totalPendingAlerts} alerts)`}
                  {ownerTab === 'filamentSettings' && `⚖️ Filament Cost Settings`}
                  {ownerTab === 'sections' && '⚙️ Shop Sections'}
                  {ownerTab === 'payment' && '💳 Payment QR'}
                  {ownerTab === 'colours' && '🎨 Manage Colours'}
                  {ownerTab === 'popularSearches' && `🔎 Popular Searches (${popularSearches.length})`}
                  {ownerTab === 'campaigns' && `🎉 Festival Campaigns (${discountCampaigns.filter((c) => !c.deleted).length})`}
                  {ownerTab === 'scheduledOffers' && `🏷️ Scheduled Offers (${scheduledOffers.filter((o) => !o.deleted).length})`}
                  {ownerTab === 'rescueDeals' && `⚡ Rescue Deals (${rescueDeals.filter((d) => !d.claimed && !d.deleted).length})`}
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
                      step="any"
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                      placeholder="e.g. 150"
                      required
                    />
                  </label>

                  <OwnerProductPriceAdvisor
                    pin={ownerPin.trim() || DEFAULT_OWNER_PIN}
                    productName={productForm.name}
                    category={productForm.category}
                    description={productForm.description}
                    catalogProducts={products}
                    productImageFiles={productImages}
                    existingImageUrls={editExistingImages}
                    filamentCostPerGram={filamentCostPerGram}
                    currentSellingPrice={productForm.price}
                    learningRecords={aiOwnerLearningRecords}
                    onRejectAiResponse={openAiRejectionFeedback}
                    onOpenFilamentSettings={() => {
                      setOwnerTab('filamentSettings');
                      setFilamentCostFeedback(null);
                      if (filamentCostPerGram !== null) {
                        setFilamentCostInput(String(filamentCostPerGram));
                      }
                      window.scrollTo({ top: 320, behavior: 'smooth' });
                    }}
                    onApplyPrice={(suggestedPrice) =>
                      setProductForm((prev) => ({
                        ...prev,
                        price: String(suggestedPrice),
                      }))
                    }
                    onSetCategory={(suggestedCat) =>
                      setProductForm((prev) => ({
                        ...prev,
                        category: suggestedCat.slice(0, 50),
                      }))
                    }
                    onSetDescription={(descriptionText) =>
                      setProductForm((prev) => ({
                        ...prev,
                        description: descriptionText.slice(0, 250),
                      }))
                    }
                  />
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
                    <button
                      className={orderStatusFilter === 'Flagged' ? 'active' : ''}
                      onClick={() => setOrderStatusFilter('Flagged')}
                      style={
                        flaggedOrdersForOwner.length > 0 && orderStatusFilter !== 'Flagged'
                          ? { borderColor: '#f59e0b', color: '#92400e', fontWeight: 700 }
                          : undefined
                      }
                    >
                      AI Review ({flaggedOrdersForOwner.length})
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
                        Total Money Earned:
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <strong style={{ fontSize: '17px', color: '#273824', fontFamily: 'Manrope, sans-serif' }}>
                        {da(totalMoneyEarned)}
                      </strong>
                      <button
                        type="button"
                        className="money-adjust-badge"
                        style={{ border: '0', cursor: 'pointer', padding: '4px 9px' }}
                        onClick={() => {
                          setMoneyInputAmount('');
                          setMoneyInputNote('');
                          setMoneyModalTab('add');
                          setIsMoneyModalOpen(true);
                        }}
                        title="Add or subtract money from counter"
                      >
                        Adjust ±
                      </button>
                    </div>
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
                          id={`owner-order-card-${o.id}`}
                          className={`order-card ${getOrderStatusClass(o.status)} ${highlightedOwnerOrderId === o.id ? 'owner-order-highlighted' : ''}`}
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

                          {o.note?.trim() && (
                            <div className="owner-customer-note-display">
                              <span className="owner-note-tag">
                                <MessageSquare size={12} /> Note from customer
                              </span>
                              <p>{o.note}</p>
                            </div>
                          )}

                          <OrderVerificationCard
                            order={o}
                            inspecting={inspectingOrderId === o.id}
                            savingDecision={orderDecisionSavingId === o.id}
                            onApproveOrder={handleApproveOrder}
                            onRequestClarification={handleRequestOrderClarification}
                            onRejectOrder={handleRejectOrder}
                            onReinspectOrder={handleReinspectOrder}
                            onRejectAiAssessment={openAiRejectionFeedback}
                          />

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
                              <option>On Hold (AI Review)</option>
                              <option>Awaiting Clarification</option>
                              <option>Clarification Submitted</option>
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

            {/* OWNER PRODUCT QUESTIONS TAB */}
            {ownerTab === 'questions' && ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN && (
              <OwnerProductQuestionsManager
                questions={ownerProductQuestions}
                products={products}
                loading={questionsLoading}
                aiEnabled={aiState.enabled}
                onRefresh={loadOwnerProductQuestions}
                onSaveAnswer={handleSaveQuestionAnswer}
                onMarkStatus={handleMarkQuestionStatus}
                onDeleteQuestion={handleDeleteQuestion}
                onSuggestAiReply={handleSuggestAiReplyForQuestion}
                onTeachAiFact={handleTeachAiFromProductQuestion}
                onRejectAiResponse={openAiRejectionFeedback}
                onOpenAiAssistant={() => {
                  setOwnerTab('aiAssistant');
                  void loadOwnerAiData();
                  window.scrollTo({ top: 320, behavior: 'smooth' });
                }}
              />
            )}

            {/* PLAYNIX AI ASSISTANT TAB */}
            {ownerTab === 'aiAssistant' && ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN && (
              <OwnerPlaynixAiAssistant
                aiState={aiState}
                knowledgeEntries={aiKnowledge}
                trainingAnswers={aiTrainingAnswers}
                guidanceQuestions={aiGuidanceQuestions}
                guidanceLoading={aiGuidanceLoading}
                products={products}
                availableColours={availableColours}
                pendingQuestionsCount={pendingQuestionsCount}
                scanning={aiScanning}
                geminiStatus={aiGeminiStatus}
                scanFeedback={aiScanFeedback}
                onTriggerScan={triggerWebsiteAiScan}
                onToggleEnabled={handleToggleAiEnabled}
                onSaveTrainingAnswer={handleSaveTrainingAnswer}
                onFinishTraining={handleFinishTraining}
                onJumpTrainingStep={handleJumpTrainingStep}
                onSaveKnowledgeEntry={handleSaveAiKnowledgeEntry}
                onDeleteKnowledgeEntry={handleDeleteAiKnowledgeEntry}
                onSaveBehaviorSettings={handleSaveAiBehaviorSettings}
                onRequestAiGuidance={() => handleRequestAiGuidance(false)}
                onAnswerGuidanceQuestion={handleAnswerAiGuidanceQuestion}
                onDismissGuidanceQuestion={handleDismissAiGuidanceQuestion}
                onDeleteGuidanceQuestion={handleDeleteAiGuidanceQuestion}
                onTestAiQuestion={handleTestAiQuestion}
                onOpenProductQuestions={() => {
                  setOwnerTab('questions');
                  void loadOwnerProductQuestions();
                  window.scrollTo({ top: 320, behavior: 'smooth' });
                }}
                orders={ownerOrders}
                inspectingOrderId={inspectingOrderId}
                orderDecisionSavingId={orderDecisionSavingId}
                onApproveOrder={handleApproveOrder}
                onRequestOrderClarification={handleRequestOrderClarification}
                onRejectOrder={handleRejectOrder}
                onReinspectOrder={handleReinspectOrder}
                onOpenOrderInDashboard={(ord) => {
                  setOwnerTab('orders');
                  setOrderStatusFilter(isOrderFlaggedForOwner(ord) ? 'Flagged' : 'Pending');
                  setHighlightedOwnerOrderId(ord.id);
                  setTimeout(() => {
                    const el = document.getElementById(`owner-order-card-${ord.id}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 120);
                }}
                homepageProducts={homepageDisplayProducts.filter((p) => p.available !== false)}
                productAutoShuffle={productAutoShuffle}
                productShuffleOrder={productShuffleOrder}
                productShuffledAt={productShuffledAt}
                shuffleSaving={shuffleSaving}
                onShuffleAllProducts={handleShuffleAllProducts}
                onShuffleAgain={handleShuffleAgain}
                onToggleAutoShuffle={handleToggleAutoShuffle}
                onResetShuffleOrder={handleResetShuffleOrder}
                onRejectAiResponse={openAiRejectionFeedback}
              />
            )}

            {/* AI WATCHDOG DASHBOARD TAB */}
            {ownerTab === 'watchdog' && ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN && (
              <OwnerAiWatchdogDashboard
                alerts={watchdogAlerts}
                logs={watchdogLogs}
                metrics={watchdogMetrics}
                scanning={watchdogScanning}
                lastScanAt={watchdogLastScanAt}
                aiHealthSummary={watchdogAiHealthSummary}
                geminiStatus={aiGeminiStatus}
                onRunScan={runWatchdogScan}
                onUpdateAlertStatus={handleUpdateWatchdogAlertStatus}
                onInspectTarget={handleInspectWatchdogTarget}
                onRejectAiAlert={openAiRejectionFeedback}
              />
            )}

            {/* FILAMENT COST SETTINGS TAB */}
            {ownerTab === 'filamentSettings' && ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN && (
              <form
                className="panel-form add-form"
                onSubmit={(e) => void handleSaveFilamentCost(e)}
                style={{ maxWidth: '560px' }}
              >
                <span className="eyebrow">AI PRICE CALCULATOR SETTINGS</span>
                <h2>Filament Cost Settings</h2>
                <p>
                  Configure the cost of 1 gram of filament (in ₹). This saved rate is automatically used whenever the AI Filament Price Calculator calculates material cost on the Add a Toy page.
                </p>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: filamentCostPerGram ? '#eef4e2' : '#fffbeb',
                    border: `1px solid ${filamentCostPerGram ? '#bfd1a1' : '#fde68a'}`,
                    color: filamentCostPerGram ? '#1f3218' : '#92400e',
                    fontSize: '0.84rem',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong>Current 1g filament cost:</strong>{' '}
                    {filamentCostPerGram && filamentCostPerGram > 0
                      ? `₹${filamentCostPerGram} per gram`
                      : 'Not configured yet'}
                  </div>
                  <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                    Formula: Weight (g) × Cost / g
                  </span>
                </div>

                <label>
                  Cost of 1 gram of filament (₹)
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={filamentCostInput}
                    onChange={(e) => setFilamentCostInput(e.target.value)}
                    placeholder="Enter ₹ cost per gram (e.g. 89)"
                    required
                  />
                  <small>
                    Example: If 1g filament cost is ₹89 and a product uses 25g, material cost calculates as 25 × 89 = ₹2,225.
                  </small>
                </label>

                {filamentCostFeedback && (
                  <p className={filamentCostFeedback.isError ? 'error-msg' : 'success-msg'}>
                    {filamentCostFeedback.message}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={filamentCostSaving}
                  >
                    <Settings size={15} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                    {filamentCostSaving ? 'Saving…' : 'Save Filament Cost'}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setOwnerTab('products');
                      window.scrollTo({ top: 320, behavior: 'smooth' });
                    }}
                  >
                    Go to Add a Toy
                  </button>
                </div>
              </form>
            )}

            {/* OWNER ANALYTICS DASHBOARD TAB */}
            {ownerTab === 'analytics' && ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN && (
              <OwnerAnalyticsDashboard
                products={products}
                orders={ownerOrders}
                analyticsEvents={analyticsEvents}
                analyticsCustomers={analyticsCustomers}
                activeCartItems={allCartItems}
                loading={analyticsLoading}
                onRefresh={loadAnalyticsData}
                onViewFullOrder={handleViewFullOrderFromAnalytics}
                formatCurrency={da}
              />
            )}

            {/* EDIT POPULAR SEARCHES TAB */}
            {ownerTab === 'popularSearches' && (
              <OwnerPopularSearchesManager
                popularSearches={popularSearches}
                loading={loading}
                onRefresh={loadPopularSearches}
                onAddTerm={handleAddPopularSearch}
                onEditTerm={handleEditPopularSearch}
                onDeleteTerm={handleDeletePopularSearch}
                onReorderTerms={handleReorderPopularSearches}
              />
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setOwnerTab('products')}
                      title="Return to products"
                    >
                      ← Back to Products
                    </button>
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

            {/* FESTIVAL DISCOUNT CAMPAIGNS TAB: Owner Management of Festival & Storewide Promotions */}
            {(ownerTab === 'campaigns' || ownerTab === 'scheduledOffers') && (
              <div className="campaigns-manager-panel">
                <div className="campaigns-manager-header">
                  <div>
                    <span className="eyebrow festival-eyebrow">
                      <Sparkles size={13} /> FESTIVAL CAMPAIGNS & STOREWIDE OFFERS
                    </span>
                    <h3>✨ Festival Discount Campaigns</h3>
                    <p>
                      Schedule festival sales (Diwali, Christmas, New Year, etc.) with automatic percentage or flat discounts across all products, specific categories, or individual toys. Timezone is India Standard Time (IST). Pricing updates automatically and normal prices restore when campaigns expire without changing original toy catalog prices.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setOwnerTab('products')}
                      title="Return to products"
                    >
                      ← Back to Products
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        if (isAddingCampaign) {
                          setIsAddingCampaign(false);
                          setEditingCampaignId(null);
                        } else {
                          setIsAddingCampaign(true);
                          setEditingCampaignId(null);
                          setCampaignForm({
                            name: 'Diwali Dhamaka Sale',
                            description: 'Special festive celebration across our toy shelves! Limited time savings for all kids.',
                            bannerImageUrl: 'diwali',
                            discountType: 'percentage',
                            discountValue: '20',
                            targetScope: 'all',
                            targetCategories: [],
                            targetProductIds: [],
                            startAt: toDatetimeLocalString(new Date()),
                            endAt: toDatetimeLocalString(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
                            isDraft: false,
                            autoIncludeNewProducts: true,
                            allowConflictOverride: false,
                          });
                        }
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                    >
                      {isAddingCampaign ? '✕ Close Form' : '➕ Create Festival Campaign'}
                    </button>
                  </div>
                </div>

                {/* CREATE / EDIT CAMPAIGN FORM */}
                {isAddingCampaign && (
                  <form
                    className="panel-form add-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSaveDiscountCampaign(false);
                    }}
                  >
                    <span className="eyebrow">
                      {editingCampaignId ? 'EDIT FESTIVAL CAMPAIGN' : 'NEW FESTIVE PROMOTION'}
                    </span>
                    <h2>{editingCampaignId ? 'Edit Festival Campaign' : 'Create Festival Campaign'}</h2>
                    <p className="form-subtitle">
                      Set up celebration discounts for your customers. Original product catalog prices remain safely preserved at all times.
                    </p>

                    <label>
                      Campaign Name (e.g. Diwali Sale, Christmas Carnival)
                      <input
                        type="text"
                        value={campaignForm.name}
                        onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                        placeholder="e.g. Diwali Dhamaka Sale, Christmas Joy Sale"
                        maxLength={100}
                        required
                      />
                    </label>

                    <label>
                      Description / Banner Tagline
                      <textarea
                        value={campaignForm.description}
                        onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                        placeholder="e.g. Celebrate Diwali with 20% off all toys! Valid this week only."
                        rows={2}
                        maxLength={300}
                      />
                    </label>

                    {/* FESTIVAL BANNER PRESET SELECTOR */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                        Choose Festival Theme & Banner Background
                      </label>
                      <div className="campaign-preset-selector">
                        {FESTIVAL_BANNER_PRESETS.map((preset) => {
                          const isSelected = campaignForm.bannerImageUrl === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              className={`campaign-preset-chip ${isSelected ? 'active' : ''}`}
                              onClick={() => {
                                setCampaignForm({
                                  ...campaignForm,
                                  bannerImageUrl: preset.id,
                                  name: campaignForm.name && campaignForm.name !== 'Diwali Dhamaka Sale' ? campaignForm.name : `${preset.name} Special Sale`,
                                });
                              }}
                              style={{
                                background: preset.gradient,
                                color: '#ffffff',
                                border: isSelected ? '2px solid #ffffff' : '2px solid transparent',
                                boxShadow: isSelected ? '0 0 0 2px #d97706' : 'none',
                              }}
                            >
                              <span>{preset.tagline}</span>
                              <strong>{preset.name}</strong>
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: '10px' }}>
                        <small style={{ color: '#687263', display: 'block', marginBottom: '4px' }}>
                          Or provide a custom banner image URL (optional):
                        </small>
                        <input
                          type="text"
                          value={
                            FESTIVAL_BANNER_PRESETS.some((p) => p.id === campaignForm.bannerImageUrl)
                              ? ''
                              : campaignForm.bannerImageUrl
                          }
                          onChange={(e) => setCampaignForm({ ...campaignForm, bannerImageUrl: e.target.value })}
                          placeholder="https://example.com/festival-banner.jpg"
                        />
                      </div>
                    </div>

                    {/* DISCOUNT TYPE & VALUE */}
                    <div className="two-fields">
                      <label>
                        Discount Type
                        <select
                          value={campaignForm.discountType}
                          onChange={(e) => setCampaignForm({ ...campaignForm, discountType: e.target.value as CampaignDiscountType })}
                        >
                          <option value="percentage">Percentage Discount (% Off)</option>
                          <option value="fixed">Fixed Amount Discount (₹ Flat Off)</option>
                        </select>
                      </label>

                      <label>
                        {campaignForm.discountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount (₹)'}
                        <input
                          type="number"
                          value={campaignForm.discountValue}
                          onChange={(e) => setCampaignForm({ ...campaignForm, discountValue: e.target.value })}
                          placeholder={campaignForm.discountType === 'percentage' ? 'e.g. 20' : 'e.g. 50'}
                          min={1}
                          max={campaignForm.discountType === 'percentage' ? 90 : 10000}
                          required
                        />
                      </label>
                    </div>

                    {/* TARGET SCOPE */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                        Apply Discount To:
                      </label>
                      <div className="scope-options-group">
                        <label className="scope-radio-label">
                          <input
                            type="radio"
                            name="targetScope"
                            checked={campaignForm.targetScope === 'all'}
                            onChange={() => setCampaignForm({ ...campaignForm, targetScope: 'all' })}
                          />
                          <div>
                            <strong>🌐 All Products</strong>
                            <small>Entire store catalogue ({products.filter((p) => p.available !== false).length} toys)</small>
                          </div>
                        </label>

                        <label className="scope-radio-label">
                          <input
                            type="radio"
                            name="targetScope"
                            checked={campaignForm.targetScope === 'categories'}
                            onChange={() => setCampaignForm({ ...campaignForm, targetScope: 'categories' })}
                          />
                          <div>
                            <strong>📂 Selected Categories</strong>
                            <small>Apply to toys in specific categories only</small>
                          </div>
                        </label>

                        <label className="scope-radio-label">
                          <input
                            type="radio"
                            name="targetScope"
                            checked={campaignForm.targetScope === 'products'}
                            onChange={() => setCampaignForm({ ...campaignForm, targetScope: 'products' })}
                          />
                          <div>
                            <strong>🎯 Selected Toys</strong>
                            <small>Pick individual toys to receive this discount</small>
                          </div>
                        </label>
                      </div>

                      {/* OPTION A: ALL PRODUCTS TOGGLES */}
                      {campaignForm.targetScope === 'all' && (
                        <div style={{ marginTop: '10px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                            <input
                              type="checkbox"
                              checked={campaignForm.autoIncludeNewProducts !== false}
                              onChange={(e) => setCampaignForm({ ...campaignForm, autoIncludeNewProducts: e.target.checked })}
                            />
                            <span>Automatically include newly added products in this campaign</span>
                          </label>
                          <p style={{ margin: '4px 0 0 24px', fontSize: '11px', color: '#64748b' }}>
                            Any new toys added to the store catalog will automatically receive this campaign discount while it is active.
                          </p>
                        </div>
                      )}

                      {/* OPTION C: CATEGORIES PICKER */}
                      {campaignForm.targetScope === 'categories' && (
                        <div style={{ marginTop: '12px', padding: '14px', background: '#fcfbf7', border: '1px solid #eeece5', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#374151' }}>
                              Select eligible categories ({campaignForm.targetCategories.length} selected):
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                type="button"
                                className="secondary-btn"
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                                onClick={() => {
                                  const allCats = Array.from(new Set(products.map((p) => p.category || 'General toys')));
                                  setCampaignForm({ ...campaignForm, targetCategories: allCats });
                                }}
                              >
                                Select All
                              </button>
                              <button
                                type="button"
                                className="secondary-btn"
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                                onClick={() => setCampaignForm({ ...campaignForm, targetCategories: [] })}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                          <div className="category-checkboxes-grid">
                            {Array.from(new Set(products.map((p) => p.category || 'General toys'))).map((cat) => {
                              const checked = campaignForm.targetCategories.includes(cat);
                              const count = products.filter((p) => (p.category || 'General toys') === cat && p.available !== false).length;
                              return (
                                <label key={cat} className="category-checkbox-item">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...campaignForm.targetCategories, cat]
                                        : campaignForm.targetCategories.filter((c) => c !== cat);
                                      setCampaignForm({ ...campaignForm, targetCategories: next });
                                    }}
                                  />
                                  <span>
                                    {cat} <small style={{ color: '#64748b', fontWeight: 500 }}>({count})</small>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* OPTION B: SEARCHABLE PRODUCT PICKER */}
                      {campaignForm.targetScope === 'products' && (
                        <div className="product-picker-container" style={{ marginTop: '12px', padding: '14px', background: '#fcfbf7', border: '1px solid #eeece5', borderRadius: '8px' }}>
                          <div className="product-picker-search-bar">
                            <Search size={15} style={{ color: '#94a3b8' }} />
                            <input
                              type="text"
                              placeholder="Search toys by name or category..."
                              value={campaignProductSearch}
                              onChange={(e) => setCampaignProductSearch(e.target.value)}
                            />
                            {campaignProductSearch && (
                              <button
                                type="button"
                                onClick={() => setCampaignProductSearch('')}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                                aria-label="Clear search"
                              >
                                ✕
                              </button>
                            )}
                          </div>

                          {(() => {
                            const q = campaignProductSearch.trim().toLowerCase();
                            const filteredToys = products
                              .filter((p) => p.available !== false)
                              .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));

                            return (
                              <>
                                <div className="product-picker-toolbar">
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>
                                    Showing {filteredToys.length} of {products.filter((p) => p.available !== false).length} toys
                                    <span style={{ marginLeft: '6px', color: '#059669', fontWeight: 800 }}>
                                      ({campaignForm.targetProductIds.length} selected)
                                    </span>
                                  </span>

                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      className="secondary-btn"
                                      style={{ padding: '3px 8px', fontSize: '11px' }}
                                      onClick={() => {
                                        const visibleIds = filteredToys.map((p) => p.id);
                                        const combined = Array.from(new Set([...campaignForm.targetProductIds, ...visibleIds]));
                                        setCampaignForm({ ...campaignForm, targetProductIds: combined });
                                      }}
                                    >
                                      Select All Visible
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary-btn"
                                      style={{ padding: '3px 8px', fontSize: '11px' }}
                                      onClick={() => {
                                        const visibleIds = new Set(filteredToys.map((p) => p.id));
                                        setCampaignForm({
                                          ...campaignForm,
                                          targetProductIds: campaignForm.targetProductIds.filter((id) => !visibleIds.has(id)),
                                        });
                                      }}
                                    >
                                      Deselect Visible
                                    </button>
                                    {campaignForm.targetProductIds.length > 0 && (
                                      <button
                                        type="button"
                                        className="secondary-btn"
                                        style={{ padding: '3px 8px', fontSize: '11px', color: '#b91c1c' }}
                                        onClick={() => setCampaignForm({ ...campaignForm, targetProductIds: [] })}
                                      >
                                        Clear All
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {filteredToys.length === 0 ? (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                                      No toys match "{campaignProductSearch}"
                                    </div>
                                  ) : (
                                    filteredToys.map((p) => {
                                      const checked = campaignForm.targetProductIds.includes(p.id);
                                      const numVal = parseFloat(campaignForm.discountValue) || 0;
                                      const previewPrice = campaignForm.discountType === 'percentage'
                                        ? Math.max(1, Math.round(p.price * (1 - numVal / 100)))
                                        : Math.max(1, p.price - numVal);

                                      const conflict = detectedCampaignConflicts.find((c) => c.conflictingProductIds.includes(p.id));

                                      return (
                                        <label
                                          key={p.id}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            padding: '8px 12px',
                                            background: checked ? '#ecfdf5' : '#ffffff',
                                            border: checked ? '1.5px solid #10b981' : conflict ? '1px solid #fde68a' : '1px solid #e5e7eb',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                              const next = e.target.checked
                                                ? [...campaignForm.targetProductIds, p.id]
                                                : campaignForm.targetProductIds.filter((id) => id !== p.id);
                                              setCampaignForm({ ...campaignForm, targetProductIds: next });
                                            }}
                                          />
                                          <img
                                            src={(p.imageUrls && p.imageUrls[0]) || p.imageUrl || '/toys/toy-40ba4ba9-1.jpg'}
                                            alt=""
                                            style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }}
                                          />
                                          <div style={{ flex: 1, minWidth: 0, fontSize: '13px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {p.name}
                                              </strong>
                                              {p.category && (
                                                <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                                                  {p.category}
                                                </span>
                                              )}
                                              {conflict && (
                                                <span className="conflict-product-warning-badge" title={`Overlaps with ${conflict.campaignName}`}>
                                                  <AlertCircle size={10} /> In: {conflict.campaignName}
                                                </span>
                                              )}
                                            </div>
                                            <span style={{ fontSize: '11px', color: '#6b7280' }}>
                                              Regular: {da(p.price)}
                                              {checked && numVal > 0 && (
                                                <span style={{ color: '#059669', fontWeight: 700, marginLeft: '6px' }}>
                                                  → Sale: {da(previewPrice)}
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* DATES & TIMES */}
                    <div className="two-fields">
                      <label>
                        Campaign Start Date & Time (IST)
                        <input
                          type="datetime-local"
                          value={campaignForm.startAt}
                          onChange={(e) => setCampaignForm({ ...campaignForm, startAt: e.target.value })}
                          required
                        />
                        <small style={{ color: '#798273' }}>
                          When promotion automatically begins.
                        </small>
                      </label>

                      <label>
                        Campaign End Date & Time (IST)
                        <input
                          type="datetime-local"
                          value={campaignForm.endAt}
                          onChange={(e) => setCampaignForm({ ...campaignForm, endAt: e.target.value })}
                          required
                        />
                        <small style={{ color: '#798273' }}>
                          When promotion automatically expires.
                        </small>
                      </label>
                    </div>

                    {/* Validation warning */}
                    {campaignForm.startAt && campaignForm.endAt && new Date(campaignForm.endAt).getTime() <= new Date(campaignForm.startAt).getTime() && (
                      <div className="error-msg" style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={16} /> End date & time must be strictly after the start date & time.
                      </div>
                    )}

                    {/* CONFLICT DETECTION WARNING & RESOLUTION */}
                    {detectedCampaignConflicts.length > 0 && (
                      <div style={{
                        margin: '16px 0',
                        padding: '14px 16px',
                        background: '#fffbeb',
                        border: '1.5px solid #f59e0b',
                        borderRadius: '10px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>
                          <AlertTriangle size={18} />
                          <span>Campaign Schedule & Product Overlap Detected</span>
                        </div>
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#78350f', lineHeight: 1.5 }}>
                          {detectedCampaignConflicts.reduce((sum, c) => sum + c.conflictingProductIds.length, 0)} product(s) in this campaign are already included in another active or scheduled campaign during overlapping dates:
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                          {detectedCampaignConflicts.map((c) => (
                            <div key={c.campaignId} style={{ fontSize: '12px', background: '#fef3c7', padding: '6px 10px', borderRadius: '6px', color: '#78350f' }}>
                              <strong>"{c.campaignName}"</strong> ({formatInIST(c.startAt)} – {formatInIST(c.endAt)}):
                              <span style={{ marginLeft: '6px', color: '#92400e' }}>
                                {c.conflictingProductNames.slice(0, 3).join(', ')}{c.conflictingProductNames.length > 3 ? ` +${c.conflictingProductNames.length - 3} more` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed #fcd34d' }}>
                          {campaignForm.targetScope === 'products' && (
                            <button
                              type="button"
                              className="secondary-btn"
                              style={{ padding: '6px 12px', fontSize: '11px', background: '#ffffff', borderColor: '#d97706', color: '#92400e' }}
                              onClick={() => {
                                const allConflictingIds = new Set(detectedCampaignConflicts.flatMap((c) => c.conflictingProductIds));
                                setCampaignForm({
                                  ...campaignForm,
                                  targetProductIds: campaignForm.targetProductIds.filter((id) => !allConflictingIds.has(id)),
                                });
                              }}
                            >
                              Remove Overlapping Products ({detectedCampaignConflicts.reduce((sum, c) => sum + c.conflictingProductIds.length, 0)})
                            </button>
                          )}
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#78350f', cursor: 'pointer', margin: 0, fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={campaignForm.allowConflictOverride}
                              onChange={(e) => setCampaignForm({ ...campaignForm, allowConflictOverride: e.target.checked })}
                            />
                            <span>Allow Best Discount (Anti-Stacking): Apply single highest discount to customer</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => setCampaignPreviewModalOpen(true)}
                      >
                        <Sparkles size={14} /> Preview Storefront Banner
                      </button>

                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={campaignSaving}
                        onClick={() => void handleSaveDiscountCampaign(true)}
                      >
                        💾 Save as Draft
                      </button>

                      <button
                        type="submit"
                        className="primary-btn"
                        disabled={campaignSaving}
                      >
                        {campaignSaving
                          ? 'Saving…'
                          : editingCampaignId
                          ? 'Update Campaign'
                          : '🚀 Schedule / Launch Campaign'}
                      </button>

                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setIsAddingCampaign(false);
                          setEditingCampaignId(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* CAMPAIGN PREVIEW MODAL */}
                {campaignPreviewModalOpen && (
                  <div className="offer-preview-modal-overlay" onClick={() => setCampaignPreviewModalOpen(false)}>
                    <div className="offer-preview-modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span className="eyebrow" style={{ color: '#b45309', margin: 0 }}>
                          <Sparkles size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          LIVE STOREFRONT HERO PREVIEW
                        </span>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setCampaignPreviewModalOpen(false)}
                          aria-label="Close preview"
                        >
                          ✕
                        </button>
                      </div>

                      <p style={{ fontSize: '12px', color: '#687263', margin: '0 0 16px 0' }}>
                        This is how your promotional hero banner and discount showcase will appear to customers:
                      </p>

                      {(() => {
                        const preset = FESTIVAL_BANNER_PRESETS.find((p) => p.id === campaignForm.bannerImageUrl);
                        const isPreset = !!preset;
                        const backgroundStyle = isPreset
                          ? { background: preset.gradient }
                          : { backgroundImage: `url(${campaignForm.bannerImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' };

                        const discVal = parseFloat(campaignForm.discountValue) || 20;
                        const discLabel = campaignForm.discountType === 'percentage'
                          ? `${discVal}% OFF`
                          : `₹${discVal} FLAT OFF`;

                        return (
                          <div className="festival-campaign-showcase" style={{ margin: 0 }}>
                            <div className="festival-hero-banner" style={backgroundStyle}>
                              <div className="festival-hero-overlay" />
                              <div className="festival-hero-content">
                                <span className="festival-badge-pill">
                                  <Sparkles size={12} /> {preset?.tagline || 'SPECIAL FESTIVE PROMOTION'}
                                </span>
                                <h3 className="festival-hero-title">{campaignForm.name || 'Festival Discount'}</h3>
                                <p className="festival-hero-desc">
                                  {campaignForm.description || 'Celebrate with exclusive savings across our toy shelf!'}
                                </p>
                                <div className="festival-discount-highlight">
                                  <span>SPECIAL OFFER</span>
                                  <strong>{discLabel}</strong>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div style={{ marginTop: '20px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => setCampaignPreviewModalOpen(false)}
                        >
                          Close Preview
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* FILTER TABS (All Campaigns, Active, Scheduled, Drafts, Expired, Cancelled) */}
                <div className="offers-filter-tabs">
                  {(() => {
                    const allCount = discountCampaigns.filter((c) => !c.deleted).length;
                    const activeCount = discountCampaigns.filter((c) => !c.deleted && computeCampaignStatus(c, currentTime) === 'Active').length;
                    const scheduledCount = discountCampaigns.filter((c) => !c.deleted && computeCampaignStatus(c, currentTime) === 'Scheduled').length;
                    const draftCount = discountCampaigns.filter((c) => !c.deleted && computeCampaignStatus(c, currentTime) === 'Draft').length;
                    const expiredCount = discountCampaigns.filter((c) => !c.deleted && computeCampaignStatus(c, currentTime) === 'Expired').length;
                    const cancelledCount = discountCampaigns.filter((c) => !c.deleted && computeCampaignStatus(c, currentTime) === 'Cancelled').length;

                    return (
                      <>
                        <button
                          type="button"
                          className={`offers-filter-tab-btn ${campaignFilterTab === 'all' ? 'active' : ''}`}
                          onClick={() => setCampaignFilterTab('all')}
                        >
                          All Campaigns ({allCount})
                        </button>
                        <button
                          type="button"
                          className={`offers-filter-tab-btn ${campaignFilterTab === 'active' ? 'active' : ''}`}
                          onClick={() => setCampaignFilterTab('active')}
                        >
                          <Sparkles size={13} /> Active ({activeCount})
                        </button>
                        <button
                          type="button"
                          className={`offers-filter-tab-btn ${campaignFilterTab === 'scheduled' ? 'active' : ''}`}
                          onClick={() => setCampaignFilterTab('scheduled')}
                        >
                          <Calendar size={13} /> Scheduled ({scheduledCount})
                        </button>
                        <button
                          type="button"
                          className={`offers-filter-tab-btn ${campaignFilterTab === 'drafts' ? 'active' : ''}`}
                          onClick={() => setCampaignFilterTab('drafts')}
                        >
                          <FileText size={13} /> Drafts ({draftCount})
                        </button>
                        <button
                          type="button"
                          className={`offers-filter-tab-btn ${campaignFilterTab === 'expired' ? 'active' : ''}`}
                          onClick={() => setCampaignFilterTab('expired')}
                        >
                          <Clock size={13} /> Expired ({expiredCount})
                        </button>
                        <button
                          type="button"
                          className={`offers-filter-tab-btn ${campaignFilterTab === 'cancelled' ? 'active' : ''}`}
                          onClick={() => setCampaignFilterTab('cancelled')}
                        >
                          Cancelled ({cancelledCount})
                        </button>
                      </>
                    );
                  })()}
                </div>

                {/* CAMPAIGNS CARDS LIST */}
                {(() => {
                  const visibleCampaigns = discountCampaigns.filter((c) => {
                    if (c.deleted) return false;
                    const computed = computeCampaignStatus(c, currentTime);
                    if (campaignFilterTab === 'all') return true;
                    if (campaignFilterTab === 'active') return computed === 'Active';
                    if (campaignFilterTab === 'scheduled') return computed === 'Scheduled';
                    if (campaignFilterTab === 'drafts') return computed === 'Draft';
                    if (campaignFilterTab === 'expired') return computed === 'Expired';
                    if (campaignFilterTab === 'cancelled') return computed === 'Cancelled';
                    return true;
                  });

                  if (visibleCampaigns.length === 0) {
                    return (
                      <div className="empty-state compact" style={{ padding: '40px 20px', textAlign: 'center' }}>
                        <div className="empty-icon" style={{ fontSize: '36px', marginBottom: '10px' }}>🎉</div>
                        <h4>No campaigns in this section</h4>
                        <p style={{ margin: '6px 0 16px 0', color: '#798273', fontSize: '13px' }}>
                          {campaignFilterTab === 'all'
                            ? 'No festival campaigns created yet. Tap "Create Festival Campaign" to create your first promotion.'
                            : `There are currently no ${campaignFilterTab} campaigns.`}
                        </p>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => {
                            setCampaignFilterTab('all');
                            setIsAddingCampaign(true);
                          }}
                        >
                          + Create Festival Campaign
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="offers-cards-list">
                      {visibleCampaigns.map((camp) => {
                        const computedStatus = computeCampaignStatus(camp, currentTime);
                        const preset = FESTIVAL_BANNER_PRESETS.find((p) => p.id === camp.bannerImageUrl);
                        const countdown = formatTimeRemaining(camp.endAt, currentTime);

                        // Calculate product scope count
                        let matchingCount = 0;
                        if (camp.targetScope === 'all') {
                          matchingCount = products.filter((p) => p.available !== false).length;
                        } else if (camp.targetScope === 'categories') {
                          matchingCount = products.filter(
                            (p) => p.available !== false && camp.targetCategories?.includes(p.category || 'General toys')
                          ).length;
                        } else {
                          matchingCount = products.filter(
                            (p) => p.available !== false && camp.targetProductIds?.includes(p.id)
                          ).length;
                        }

                        return (
                          <div className="owner-campaign-card" key={camp.id}>
                            <div className="owner-campaign-banner-preview" style={{ background: preset?.gradient || '#374151' }}>
                              <div style={{ position: 'relative', zIndex: 1, padding: '12px', color: '#ffffff' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.9 }}>
                                  {preset?.tagline || 'FESTIVAL SALE'}
                                </span>
                                <h4 style={{ margin: '4px 0 2px 0', fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                                  {camp.name}
                                </h4>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 800, background: 'rgba(255,255,255,0.22)', padding: '2px 8px', borderRadius: '999px', marginTop: '4px' }}>
                                  <Tag size={11} /> {camp.discountType === 'percentage' ? `${camp.discountValue}% OFF` : `₹${camp.discountValue} FLAT OFF`}
                                </div>
                              </div>
                            </div>

                            <div style={{ padding: '16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                                <div>
                                  {computedStatus === 'Active' && (
                                    <span className="offer-status-badge active">
                                      <span className="blinking-green-dot-inline" /> LIVE NOW
                                    </span>
                                  )}
                                  {computedStatus === 'Scheduled' && (
                                    <span className="offer-status-badge scheduled">
                                      <Calendar size={12} /> SCHEDULED
                                    </span>
                                  )}
                                  {computedStatus === 'Draft' && (
                                    <span className="offer-status-badge draft">
                                      📝 DRAFT
                                    </span>
                                  )}
                                  {computedStatus === 'Expired' && (
                                    <span className="offer-status-badge expired">
                                      <Clock size={12} /> EXPIRED
                                    </span>
                                  )}
                                  {computedStatus === 'Cancelled' && (
                                    <span className="offer-status-badge cancelled">
                                      ✕ CANCELLED
                                    </span>
                                  )}
                                </div>

                                <span style={{ fontSize: '12px', color: '#526639', fontWeight: 700 }}>
                                  {camp.targetScope === 'all'
                                    ? `All toys (${matchingCount})`
                                    : camp.targetScope === 'categories'
                                    ? `${camp.targetCategories?.length || 0} categories (${matchingCount} toys)`
                                    : `${matchingCount} selected toys`}
                                </span>
                              </div>

                              {camp.description && (
                                <p style={{ fontSize: '13px', color: '#555d50', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                                  {camp.description}
                                </p>
                              )}

                              <div className="owner-offer-details-grid" style={{ marginBottom: '12px' }}>
                                <div>
                                  <b>Start (IST)</b>
                                  <span title={camp.startAt}>{formatInIST(camp.startAt)}</span>
                                </div>
                                <div>
                                  <b>End (IST)</b>
                                  <span title={camp.endAt}>{formatInIST(camp.endAt)}</span>
                                </div>
                                <div>
                                  <b>Campaign Orders</b>
                                  <span style={{ fontWeight: 700, color: '#15803d' }}>
                                    {camp.totalOrdersCount || 0} orders
                                  </span>
                                </div>
                                <div>
                                  <b>Revenue Generated</b>
                                  <span style={{ fontWeight: 700, color: '#15803d' }}>
                                    {da(camp.totalRevenue || 0)}
                                  </span>
                                </div>
                              </div>

                              {computedStatus === 'Active' && (
                                <div className="countdown-timer-box" style={{ borderRadius: '8px', marginBottom: '12px' }}>
                                  <span className="timer-label"><Clock size={12} /> Auto-expires in</span>
                                  <span className="timer-digits">{countdown.formatted}</span>
                                </div>
                              )}

                              <div className="owner-offer-actions">
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => startEditCampaign(camp)}
                                  title="Edit campaign"
                                  style={{ padding: '6px 12px', fontSize: '11px' }}
                                >
                                  <Pencil size={13} /> Edit
                                </button>

                                {!['Cancelled', 'Expired'].includes(computedStatus) && (
                                  <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => void handleCancelDiscountCampaign(camp.id)}
                                    title="Pause / Cancel campaign"
                                    style={{ padding: '6px 12px', fontSize: '11px', color: '#b91c1c' }}
                                  >
                                    Pause / Cancel
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="icon-btn danger"
                                  onClick={() => void handleDeleteDiscountCampaign(camp.id)}
                                  title="Delete campaign"
                                  aria-label="Delete campaign"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Gallery Modal Dialog */}
      {galleryProduct && (
        <div
          className="gallery-overlay"
          role="presentation"
          onClick={() => {
            setIsGalleryZoomOpen(false);
            setGalleryProduct(null);
          }}
        >
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
              onClick={() => {
                setIsGalleryZoomOpen(false);
                setGalleryProduct(null);
              }}
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
                    className={`gallery-viewer ${urls.length > 0 ? 'is-zoomable' : ''}`}
                    onTouchStart={(e) => {
                      galleryDidSwipeRef.current = false;
                      setTouchStartX(e.touches[0]?.clientX ?? null);
                    }}
                    onTouchEnd={(e) => {
                      if (touchStartX !== null && e.changedTouches[0]) {
                        const diff = e.changedTouches[0].clientX - touchStartX;
                        if (Math.abs(diff) > 45) {
                          galleryDidSwipeRef.current = true;
                          navigatePhoto(diff < 0 ? 1 : -1);
                        }
                      }
                      setTouchStartX(null);
                    }}
                    onClick={() => {
                      if (galleryDidSwipeRef.current) {
                        galleryDidSwipeRef.current = false;
                        return;
                      }
                      if (urls.length > 0) {
                        setIsGalleryZoomOpen(true);
                      }
                    }}
                  >
                    {urls.length ? (
                      <img
                        src={urls[galleryImageIndex] || urls[0]}
                        alt={`${galleryProduct.name}, photo ${galleryImageIndex + 1}`}
                        decoding="async"
                        fetchPriority="high"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="gallery-placeholder">🧸</div>
                    )}
                    {urls.length > 0 && (
                      <button
                        type="button"
                        className="product-detail-zoom-btn"
                        aria-label={`Open full-screen zoom for ${galleryProduct.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsGalleryZoomOpen(true);
                        }}
                      >
                        <Maximize2 size={14} />
                        <span>Zoom</span>
                      </button>
                    )}
                    {urls.length > 1 && (
                      <>
                        <button
                          className="gallery-arrow gallery-prev"
                          type="button"
                          aria-label="Previous photo"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigatePhoto(-1);
                          }}
                        >
                          <ChevronLeft size={25} />
                        </button>
                        <button
                          className="gallery-arrow gallery-next"
                          type="button"
                          aria-label="Next photo"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigatePhoto(1);
                          }}
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
                      <div className="gallery-footer-actions">
                        <button
                          type="button"
                          className="secondary-btn gallery-ask-btn"
                          onClick={() => setGalleryAskTrigger((c) => c + 1)}
                        >
                          <HelpCircle size={15} /> Ask a Question
                        </button>
                        <button
                          className="primary-btn"
                          type="button"
                          onClick={() => {
                            setSelectedProductForBuy(galleryProduct);
                            setOrderQuantity(1);
                            setIsGalleryZoomOpen(false);
                            setGalleryAskTrigger(0);
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
                    </div>
                    {urls.length > 1 && (
                      <p className="gallery-swipe-hint">Tap photo to zoom · Swipe left or right to see more</p>
                    )}

                    <ProductQuestionsSection
                      compact
                      product={galleryProduct}
                      customerId={customerId}
                      defaultCustomerName={guestProvidedName}
                      onCustomerNameProvided={associateCheckoutNameWithGuestCart}
                      externalOpenTrigger={galleryAskTrigger}
                    />
                  </div>

                  <FullScreenImageGallery
                    isOpen={isGalleryZoomOpen}
                    images={urls}
                    initialIndex={galleryImageIndex}
                    productName={galleryProduct.name}
                    onClose={() => setIsGalleryZoomOpen(false)}
                    onIndexChange={(idx) => setGalleryImageIndex(idx)}
                  />
                </>
              );
            })()}
          </section>
        </div>
      )}

      {/* OWNER MONEY COUNTER ADJUSTMENT MODAL */}
      {isMoneyModalOpen && (
        <div
          className="money-modal-overlay"
          role="presentation"
          onClick={() => setIsMoneyModalOpen(false)}
        >
          <section
            className="money-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Money Counter and Cashbox Options"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="money-modal-header">
              <div className="money-modal-title-wrap">
                <div className="money-modal-icon">
                  <IndianRupee size={22} />
                </div>
                <div>
                  <h2>Money Counter</h2>
                  <p>Add cash sales or subtract store expenses</p>
                </div>
              </div>
              <button
                type="button"
                className="money-modal-close"
                onClick={() => setIsMoneyModalOpen(false)}
                aria-label="Close money options"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="money-modal-body">
              {/* Hero Banner */}
              <div className="money-hero-banner">
                <div className="money-hero-top">
                  <span className="money-hero-label">Current Total Balance</span>
                  <span className="money-hero-amount">{da(totalMoneyEarned)}</span>
                </div>
                <div className="money-breakdown-row">
                  <span className="money-chip-info">
                    📦 Orders: <strong>{da(baseOrdersEarned)}</strong> ({ownerOrders.filter((o) => isOrderEarned(o)).length} fulfilled)
                  </span>
                  <span
                    className={`money-chip-info ${
                      manualMoneyAdjustment > 0
                        ? 'money-chip-positive'
                        : manualMoneyAdjustment < 0
                        ? 'money-chip-negative'
                        : ''
                    }`}
                  >
                    ⚖️ Adjustments:{' '}
                    <strong>
                      {manualMoneyAdjustment > 0
                        ? `+${da(manualMoneyAdjustment)}`
                        : manualMoneyAdjustment < 0
                        ? `-${da(Math.abs(manualMoneyAdjustment))}`
                        : '₹0'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Mode Toggle: Add vs Subtract */}
              <div className="money-tab-toggle">
                <button
                  type="button"
                  className={`money-tab-btn ${moneyModalTab === 'add' ? 'active-add' : ''}`}
                  onClick={() => {
                    setMoneyModalTab('add');
                    setErrorMessage('');
                  }}
                >
                  <Plus size={16} /> Add Money (+)
                </button>
                <button
                  type="button"
                  className={`money-tab-btn ${moneyModalTab === 'subtract' ? 'active-subtract' : ''}`}
                  onClick={() => {
                    setMoneyModalTab('subtract');
                    setErrorMessage('');
                  }}
                >
                  <Minus size={16} /> Subtract Money (−)
                </button>
              </div>

              {/* Quick Amount Chips */}
              <div className="money-input-group">
                <label>QUICK SELECT AMOUNT</label>
                <div className="money-quick-chips">
                  {moneyModalTab === 'add'
                    ? [10, 20, 50, 100, 200, 500].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className="money-quick-btn"
                          onClick={() => setMoneyInputAmount(String(amt))}
                        >
                          +₹{amt}
                        </button>
                      ))
                    : [10, 20, 50, 100, 200, 500].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className="money-quick-btn"
                          onClick={() => setMoneyInputAmount(String(amt))}
                        >
                          -₹{amt}
                        </button>
                      ))}
                </div>
              </div>

              {/* Amount Input */}
              <div className="money-input-group">
                <label htmlFor="money-amount-input">
                  {moneyModalTab === 'add' ? 'AMOUNT TO ADD (₹)' : 'AMOUNT TO SUBTRACT (₹)'}
                </label>
                <div className="money-amount-wrap">
                  <span className="money-amount-symbol">₹</span>
                  <input
                    id="money-amount-input"
                    type="number"
                    min="1"
                    step="any"
                    className="money-amount-input"
                    placeholder="Enter amount, e.g. 50"
                    value={moneyInputAmount}
                    onChange={(e) => setMoneyInputAmount(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {/* Note / Reason Input */}
              <div className="money-input-group">
                <label htmlFor="money-note-input">REASON / NOTE (OPTIONAL)</label>
                <input
                  id="money-note-input"
                  type="text"
                  maxLength={100}
                  className="money-note-input"
                  placeholder={
                    moneyModalTab === 'add'
                      ? 'e.g. Offline cash sale, tip, direct payment'
                      : 'e.g. Toy supplies, stock expense, refund, correction'
                  }
                  value={moneyInputNote}
                  onChange={(e) => setMoneyInputNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (moneyModalTab === 'add') {
                        void handleAddMoney();
                      } else {
                        void handleSubtractMoney();
                      }
                    }
                  }}
                />
              </div>

              {/* Action Button */}
              <button
                type="button"
                className="primary-btn full-btn"
                style={
                  moneyModalTab === 'subtract'
                    ? { background: '#8e2b20', color: '#ffffff' }
                    : { background: '#2e4419', color: '#ffffff' }
                }
                disabled={moneySaving || !moneyInputAmount || parseFloat(moneyInputAmount) <= 0}
                onClick={() => {
                  if (moneyModalTab === 'add') {
                    void handleAddMoney();
                  } else {
                    void handleSubtractMoney();
                  }
                }}
              >
                {moneySaving
                  ? 'Saving…'
                  : moneyModalTab === 'add'
                  ? `Add ${
                      moneyInputAmount && parseFloat(moneyInputAmount) > 0
                        ? da(moneyInputAmount)
                        : 'Money'
                    } to Counter`
                  : `Subtract ${
                      moneyInputAmount && parseFloat(moneyInputAmount) > 0
                        ? da(moneyInputAmount)
                        : 'Money'
                    } from Counter`}
              </button>

              {/* History / Audit Log of Manual Adjustments */}
              {moneyAdjustmentHistory.length > 0 && (
                <div className="money-history-wrap">
                  <div className="money-history-header">
                    <strong>Recent Adjustments ({moneyAdjustmentHistory.length})</strong>
                    <button
                      type="button"
                      className="money-history-reset-btn"
                      onClick={() => void handleResetAdjustments()}
                      disabled={moneySaving}
                    >
                      Reset adjustments
                    </button>
                  </div>
                  <div className="money-history-list">
                    {moneyAdjustmentHistory.map((item) => (
                      <div className="money-history-item" key={item.id}>
                        <div className="money-history-info">
                          <span className="money-history-note">
                            {item.note || (item.type === 'add' ? 'Cash added' : 'Money deducted')}
                          </span>
                          <span className="money-history-date">
                            {new Date(item.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="money-history-right">
                          <span
                            className={
                              item.type === 'add'
                                ? 'money-history-val-add'
                                : 'money-history-val-subtract'
                            }
                          >
                            {item.type === 'add' ? `+${da(item.amount)}` : `-${da(item.amount)}`}
                          </span>
                          <button
                            type="button"
                            className="money-history-del-btn"
                            title="Undo/delete this adjustment"
                            disabled={moneySaving}
                            onClick={() => void handleDeleteAdjustmentItem(item.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="money-modal-footer">
              <button
                type="button"
                className="secondary-btn"
                style={{ fontSize: '11px', padding: '8px 12px' }}
                onClick={() => {
                  setIsMoneyModalOpen(false);
                  setOwnerTab('orders');
                  setOrderStatusFilter('Completed');
                }}
              >
                View Fulfilled Orders →
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ padding: '8px 16px' }}
                onClick={() => setIsMoneyModalOpen(false)}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}

      {/* SHOPPING CART SLIDE-OVER DRAWER */}
      {isCartOpen && (
        <div
          className="cart-drawer-backdrop"
          role="presentation"
          onClick={() => setIsCartOpen(false)}
        >
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping Cart"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="cart-drawer-header">
              <div className="cart-drawer-title">
                <ShoppingCart size={22} style={{ color: '#273824' }} />
                <h2>Shopping Cart</h2>
              </div>
              <button
                type="button"
                className="cart-drawer-close"
                onClick={() => setIsCartOpen(false)}
                aria-label="Close cart drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="cart-drawer-body">
              {/* ---------------- PERMANENT SHOPPING CART SECTION ---------------- */}
              <section className="cart-active-section">
                <div className="cart-section-header">
                  <h3 className="cart-section-title">
                    <ShoppingBag size={17} style={{ color: '#273824' }} />
                    Your Cart
                  </h3>
                  <span className="cart-section-count">
                    {cartItems.reduce((acc, it) => acc + (it.quantity || 1), 0)} {cartItems.reduce((acc, it) => acc + (it.quantity || 1), 0) === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {cartItems.length === 0 ? (
                  <div className="empty-state compact" style={{ padding: '24px 16px', textAlign: 'center', background: '#ffffff', borderRadius: '12px', border: '1.5px dashed #e2e8f0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛒</div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#1f271e' }}>Your cart is empty</h4>
                    <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#6d7568' }}>
                      Browse toys and add them to your cart—your items stay saved even after you exit the site.
                    </p>
                    <button
                      type="button"
                      className="secondary-btn"
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                      onClick={() => {
                        setIsCartOpen(false);
                        setPage('home');
                        window.scrollTo({ top: 380, behavior: 'smooth' });
                      }}
                    >
                      Browse toy shelf →
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="cart-items-list">
                      {cartItems.map((item) => {
                        const prod = products.find((p) => p.id === item.productId);
                        const isUnavailable = !prod || prod.available === false;
                        const campaignDisc = prod ? calculateProductDiscount(prod, activeDiscountCampaigns) : { hasDiscount: false, discountedPrice: item.price, savingsPerUnit: 0, discountPercent: 0, discountLabel: '' };
                        const unitPrice = campaignDisc.hasDiscount ? campaignDisc.discountedPrice : (prod ? prod.price : item.price);
                        const originalUnit = prod ? prod.price : item.price;
                        const qty = item.quantity || 1;
                        const itemTotal = unitPrice * qty;

                        return (
                          <div className="cart-item-card" key={item.id}>
                            <img
                              src={item.productImageUrl || (prod?.imageUrls && prod.imageUrls[0]) || prod?.imageUrl || '/toys/toy-40ba4ba9-1.jpg'}
                              alt={item.productName}
                              className="cart-item-thumb"
                            />
                            <div className="cart-item-info">
                              <h4 className="cart-item-name">{item.productName}</h4>
                              {item.category && <div className="cart-item-category">{item.category}</div>}

                              {item.colour && (
                                <div className="cart-item-colour-pill">
                                  <ColourDot colour={item.colour} size={10} />
                                  <span>{item.colour}</span>
                                </div>
                              )}

                              <div className="cart-item-pricing">
                                <span className="cart-item-price">{da(itemTotal)}</span>
                                {campaignDisc.hasDiscount && (
                                  <>
                                    <span className="cart-item-original-price">{da(originalUnit * qty)}</span>
                                    <span style={{ fontSize: '10px', color: '#15803d', fontWeight: 800 }}>
                                      {campaignDisc.discountLabel}
                                    </span>
                                  </>
                                )}
                                {qty > 1 && (
                                  <span style={{ fontSize: '11px', color: '#6d7568' }}>({da(unitPrice)} each)</span>
                                )}
                              </div>

                              <div className="cart-item-stepper-row">
                                {/* Quantity Stepper */}
                                <div className="cart-qty-stepper">
                                  <button
                                    type="button"
                                    className="cart-qty-btn"
                                    onClick={() => void handleUpdateCartQty(item.id, qty - 1)}
                                    title="Decrease quantity"
                                    aria-label="Decrease quantity"
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span className="cart-qty-num">{qty}</span>
                                  <button
                                    type="button"
                                    className="cart-qty-btn"
                                    disabled={Boolean(item.isRescueDeal) || qty >= 5}
                                    onClick={() => void handleUpdateCartQty(item.id, qty + 1)}
                                    title="Increase quantity"
                                    aria-label="Increase quantity"
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>

                                {/* Cart Item Action Button: Remove */}
                                <div className="cart-item-actions">
                                  <button
                                    type="button"
                                    className="btn-remove-cart"
                                    onClick={() => void handleRemoveFromCart(item.id)}
                                    title="Remove from cart"
                                    aria-label={`Remove ${item.productName} from cart`}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Single Item Quick Order Link */}
                              <button
                                type="button"
                                className="secondary-btn"
                                style={{ width: '100%', marginTop: '8px', fontSize: '12px', padding: '6px', textAlign: 'center', background: '#fafaf8' }}
                                disabled={isUnavailable}
                                onClick={() => handleCheckoutCartItem(item)}
                              >
                                {isUnavailable ? 'Currently Unavailable' : 'Order This Toy →'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Active Cart Summary & Order Action */}
                    <div className="cart-summary-box">
                      <div className="cart-summary-line">
                        <span>Items ({cartItems.reduce((acc, it) => acc + (it.quantity || 1), 0)})</span>
                        <span>
                          {da(
                            cartItems.reduce((acc, it) => {
                              const prod = products.find((p) => p.id === it.productId);
                              const base = prod ? prod.price : it.price;
                              return acc + base * (it.quantity || 1);
                            }, 0)
                          )}
                        </span>
                      </div>

                      {(() => {
                        const totalSavings = cartItems.reduce((acc, it) => {
                          const prod = products.find((p) => p.id === it.productId);
                          if (!prod) return acc;
                          const campaignDisc = calculateProductDiscount(prod, activeDiscountCampaigns);
                          return acc + (campaignDisc.hasDiscount ? campaignDisc.savingsPerUnit * (it.quantity || 1) : 0);
                        }, 0);

                        if (totalSavings > 0) {
                          return (
                            <div className="cart-summary-line" style={{ color: '#15803d', fontWeight: 700 }}>
                              <span>Promotional Savings</span>
                              <span>- {da(totalSavings)}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      <div className="cart-summary-line total">
                        <span>Cart Total</span>
                        <strong style={{ color: '#15803d' }}>
                          {da(
                            cartItems.reduce((acc, it) => {
                              const prod = products.find((p) => p.id === it.productId);
                              const campaignDisc = prod ? calculateProductDiscount(prod, activeDiscountCampaigns) : { hasDiscount: false, discountedPrice: it.price };
                              const unitPrice = campaignDisc.hasDiscount ? campaignDisc.discountedPrice : (prod ? prod.price : it.price);
                              return acc + unitPrice * (it.quantity || 1);
                            }, 0)
                          )}
                        </strong>
                      </div>

                      <button
                        type="button"
                        className="primary-btn cart-checkout-btn"
                        onClick={() => {
                          if (cartItems.length > 0) {
                            handleCheckoutCartItem(cartItems[0]);
                          }
                        }}
                      >
                        Proceed to Checkout <ArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} />
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}

      {/* FLOATING CART BUTTON ON CUSTOMER PAGES */}
      {page !== 'owner' && !isCartOpen && (
        <button
          type="button"
          className={`cart-floating-trigger ${isCartBouncing ? 'is-cart-bouncing' : ''}`}
          onClick={() => setIsCartOpen(true)}
          title="Open Shopping Cart"
          aria-label="Open Shopping Cart"
        >
          <ShoppingCart size={18} className="cart-nav-icon" />
          <span>Cart</span>
          {cartItems.length > 0 && (
            <span key={`float-badge-${cartAnimKey}`} className="cart-floating-badge cart-badge-pop">
              {cartItems.reduce((acc, it) => acc + (it.quantity || 1), 0)}
            </span>
          )}
        </button>
      )}

      {/* CART TOAST NOTIFICATION BANNER */}
      {cartToastMessage && (
        <div className="cart-toast-banner" role="status">
          <Check size={16} className="cart-toast-check" />
          <span>{cartToastMessage}</span>
        </div>
      )}

      {/* PRIVATE OWNER AI REJECTION FEEDBACK POPUP */}
      {page === 'owner' && ownerPin.trim().toUpperCase() === DEFAULT_OWNER_PIN && (
        <AiRejectionFeedbackModal
          draft={pendingAiRejection}
          onSaveLearningRecord={handleCreateAiLearningRecord}
          onClose={() => setPendingAiRejection(null)}
        />
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
