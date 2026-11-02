export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  imageUrl: string;
  imageUrls: string[];
  available: boolean;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  mode: 'Child' | 'Adult';
  productId: string;
  productName: string;
  productImageUrl: string;
  price: number;
  quantity?: number;
  unitPrice?: number;
  name: string;
  studentClass: string;
  section: string;
  phone: string;
  address: string;
  note: string;
  status: string;
  createdAt: string;
  paymentRecipientName?: string;
  paymentRecipientClass?: string;
  paymentRecipientSection?: string;
  ownerNote?: string;
  queuePosition?: number | null;
  peopleAhead?: number;
  colour?: string;
  customerDeleted?: boolean;
  isRescueDeal?: boolean;
  rescueDealId?: string;
  rescueCondition?: string;
  isScheduledOffer?: boolean;
  scheduledOfferId?: string;
  isCampaignDiscount?: boolean;
  campaignId?: string;
  campaignName?: string;
  originalPrice?: number;
  discountSaved?: number;
}

export interface Suggestion {
  id: string;
  suggestion: string;
  createdAt: string;
}

export interface RescueDeal {
  id: string;
  productId?: string;
  title: string;
  originalPrice: number;
  dealPrice: number;
  condition: string;
  description: string;
  imageUrl: string;
  imageUrls?: string[];
  colour?: string;
  claimed: boolean;
  status: 'available' | 'claimed';
  claimedAt?: string;
  claimedByOrder?: string;
  claimedByCustomer?: string;
  deleted?: boolean;
  createdAt: string;
}

export interface ScheduledOffer {
  id: string;
  productId: string;
  productName: string;
  productImageUrl?: string;
  productCategory?: string;
  title: string;
  originalPrice: number;
  discountedPrice: number;
  startAt: string; // ISO 8601 string
  endAt: string;   // ISO 8601 string
  status: 'Scheduled' | 'Active' | 'Expired' | 'Cancelled' | 'Draft' | 'Completed';
  isDraft?: boolean;
  cancelled?: boolean;
  claimed?: boolean;
  claimedAt?: string;
  claimedByOrder?: string;
  claimedByCustomer?: string;
  deleted?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export type OfferComputedStatus = 'Scheduled' | 'Active' | 'Expired' | 'Cancelled' | 'Draft' | 'Completed';

/**
 * Computes offer status dynamically based on current timestamp (default Date.now()).
 * Ensures offers activate and expire automatically without dashboard dependency.
 */
export function computeOfferStatus(
  offer: ScheduledOffer,
  nowMs: number = Date.now()
): OfferComputedStatus {
  if (offer.deleted) return 'Cancelled';
  if (offer.isDraft) return 'Draft';
  if (offer.cancelled || offer.status === 'Cancelled') return 'Cancelled';
  if (offer.claimed || offer.status === 'Completed') return 'Completed';

  const startMs = new Date(offer.startAt).getTime();
  const endMs = new Date(offer.endAt).getTime();

  if (isNaN(startMs) || isNaN(endMs)) return 'Scheduled';
  if (nowMs < startMs) return 'Scheduled';
  if (nowMs >= startMs && nowMs <= endMs) return 'Active';
  return 'Expired';
}

/**
 * Formats date/time in India Standard Time (Asia/Kolkata).
 */
export function formatInIST(dateStrOrMs: string | number): string {
  try {
    const d = new Date(dateStrOrMs);
    if (isNaN(d.getTime())) return String(dateStrOrMs);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' IST';
  } catch {
    return String(dateStrOrMs);
  }
}

/**
 * Returns formatted countdown remaining until endAt in Asia/Kolkata context.
 */
export function formatTimeRemaining(endAt: string, nowMs: number = Date.now()): {
  formatted: string;
  isExpired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const endMs = new Date(endAt).getTime();
  const diff = endMs - nowMs;
  if (diff <= 0 || isNaN(diff)) {
    return { formatted: '00h 00m 00s', isExpired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let formatted = '';
  if (days > 0) {
    formatted = `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  } else {
    formatted = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return { formatted, isExpired: false, days, hours, minutes, seconds };
}

/* =========================================================================
   FESTIVAL-WIDE DISCOUNT CAMPAIGN SYSTEM
   ========================================================================= */

export type CampaignDiscountType = 'percentage' | 'fixed';
export type CampaignTargetScope = 'all' | 'categories' | 'products';
export type CampaignStatus = 'Scheduled' | 'Active' | 'Expired' | 'Cancelled' | 'Draft';

export interface DiscountCampaign {
  id: string;
  name: string;                         // e.g. "Diwali Dhamaka Sale", "Christmas Joy Fest"
  description: string;                  // Short promotional description
  bannerImageUrl: string;               // Preset ID or custom image URL
  discountType: CampaignDiscountType;   // 'percentage' (%) or 'fixed' (₹)
  discountValue: number;                // e.g. 20 (20%) or 50 (₹50)
  targetScope: CampaignTargetScope;     // 'all' | 'categories' | 'products'
  targetCategories?: string[];          // List of category names when targetScope === 'categories'
  targetProductIds?: string[];          // List of product IDs when targetScope === 'products'
  startAt: string;                      // ISO 8601 string
  endAt: string;                        // ISO 8601 string
  status: CampaignStatus;
  isDraft?: boolean;
  cancelled?: boolean;
  deleted?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  autoIncludeNewProducts?: boolean;     // For targetScope === 'all', automatically include new products
  allowConflictOverride?: boolean;      // Owner acknowledged non-stacking overlap
  totalOrdersCount?: number;            // Orders placed under this campaign
  totalRevenue?: number;                // Sales revenue generated
}

export interface CampaignConflict {
  conflictingCampaignId: string;
  conflictingCampaignName: string;
  campaignId?: string;
  campaignName?: string;
  conflictingCampaignStatus: CampaignStatus;
  startAt: string;
  endAt: string;
  conflictingProductIds: string[];
  conflictingProductNames: string[];
}

/**
 * Returns any products that this campaign targets based on its targetScope,
 * targetCategories, targetProductIds, and all products in the catalogue.
 */
export function getCampaignTargetProductIds(
  campaign: {
    targetScope: CampaignTargetScope;
    targetCategories?: string[];
    targetProductIds?: string[];
    autoIncludeNewProducts?: boolean;
  },
  products: Product[]
): string[] {
  const eligibleProducts = products.filter((p) => p.available !== false);
  if (campaign.targetScope === 'all') {
    return eligibleProducts.map((p) => p.id);
  }
  if (campaign.targetScope === 'categories') {
    const cats = new Set(campaign.targetCategories || []);
    return eligibleProducts
      .filter((p) => cats.has(p.category || 'General toys') || cats.has(p.category || 'Other'))
      .map((p) => p.id);
  }
  if (campaign.targetScope === 'products') {
    const ids = new Set(campaign.targetProductIds || []);
    return eligibleProducts.filter((p) => ids.has(p.id)).map((p) => p.id);
  }
  return [];
}

/**
 * Detects whether candidate campaign dates overlap with an existing campaign's dates.
 */
export function doCampaignDatesOverlap(
  start1: string | number,
  end1: string | number,
  start2: string | number,
  end2: string | number
): boolean {
  const s1 = new Date(start1).getTime();
  const e1 = new Date(end1).getTime();
  const s2 = new Date(start2).getTime();
  const e2 = new Date(end2).getTime();

  if (isNaN(s1) || isNaN(e1) || isNaN(s2) || isNaN(e2)) return false;
  return s1 < e2 && e1 > s2;
}

/**
 * Detects conflicts between a candidate campaign and all other existing campaigns.
 * Only compares against Active or Scheduled campaigns (excluding cancelled, expired, drafts, and self).
 */
export function detectCampaignConflicts(
  candidate: {
    id?: string;
    targetScope: CampaignTargetScope;
    targetCategories?: string[];
    targetProductIds?: string[];
    startAt: string;
    endAt: string;
  },
  existingCampaigns: DiscountCampaign[],
  products: Product[],
  nowMs: number = Date.now()
): CampaignConflict[] {
  const candidateProductIds = new Set(getCampaignTargetProductIds(candidate, products));
  if (candidateProductIds.size === 0) return [];

  const conflicts: CampaignConflict[] = [];

  for (const other of existingCampaigns) {
    if (other.deleted || other.cancelled || other.isDraft) continue;
    if (candidate.id && other.id === candidate.id) continue;

    const status = computeCampaignStatus(other, nowMs);
    if (status !== 'Active' && status !== 'Scheduled') continue;

    // Check timeframe overlap
    if (!doCampaignDatesOverlap(candidate.startAt, candidate.endAt, other.startAt, other.endAt)) {
      continue;
    }

    // Check product overlap
    const otherProductIds = getCampaignTargetProductIds(other, products);
    const overlappingIds = otherProductIds.filter((id) => candidateProductIds.has(id));

    if (overlappingIds.length > 0) {
      const conflictingProductNames = overlappingIds
        .map((id) => products.find((p) => p.id === id)?.name || id)
        .slice(0, 10);

      conflicts.push({
        conflictingCampaignId: other.id,
        conflictingCampaignName: other.name,
        campaignId: other.id,
        campaignName: other.name,
        conflictingCampaignStatus: status,
        startAt: other.startAt,
        endAt: other.endAt,
        conflictingProductIds: overlappingIds,
        conflictingProductNames,
      });
    }
  }

  return conflicts;
}

export interface FestivalBannerPreset {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  tagline: string;
  imageUrl: string;
  gradient: string;
  accentColor: string;
}

export const FESTIVAL_BANNER_PRESETS: FestivalBannerPreset[] = [
  {
    id: 'diwali',
    name: 'Diwali Dhamaka Sale',
    subtitle: 'Festival of lights, happiness & exclusive toy surprises!',
    badge: '🪔 DIWALI DHAMAKA',
    tagline: '🪔 DIWALI DHAMAKA SALE',
    imageUrl: 'https://images.unsplash.com/photo-1576405748404-b4da79bc429e?auto=format&fit=crop&w=1200&q=80',
    gradient: 'linear-gradient(135deg, #78350f 0%, #b45309 45%, #f59e0b 100%)',
    accentColor: '#f59e0b',
  },
  {
    id: 'christmas',
    name: 'Christmas Joy Fest',
    subtitle: 'Santa\'s secret toy workshop delivered straight to you!',
    badge: '🎄 CHRISTMAS SALE',
    tagline: '🎄 CHRISTMAS JOY FEST',
    imageUrl: 'https://images.unsplash.com/photo-1543258103-a62bd96b300b?auto=format&fit=crop&w=1200&q=80',
    gradient: 'linear-gradient(135deg, #14532d 0%, #16a34a 50%, #991b1b 100%)',
    accentColor: '#ef4444',
  },
  {
    id: 'newyear',
    name: 'New Year Toy Bonanza',
    subtitle: 'Celebrate the New Year with joyous discounts on every shelf!',
    badge: '✨ NEW YEAR BASH',
    tagline: '✨ NEW YEAR BONANZA',
    imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    gradient: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 50%, #7c3aed 100%)',
    accentColor: '#8b5cf6',
  },
  {
    id: 'carnival',
    name: 'Mega Playnix Carnival',
    subtitle: 'Step right up! Special limited-time playtime festival!',
    badge: '🎪 MEGA CARNIVAL',
    tagline: '🎪 PLAYNIX CARNIVAL',
    imageUrl: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80',
    gradient: 'linear-gradient(135deg, #831843 0%, #db2777 50%, #f59e0b 100%)',
    accentColor: '#ec4899',
  },
  {
    id: 'holi',
    name: 'Holi Colors of Joy',
    subtitle: 'Splash vibrant fun into every playroom with festive deals!',
    badge: '🎨 HOLI SPECIAL',
    tagline: '🎨 HOLI COLORS OF JOY',
    imageUrl: 'https://images.unsplash.com/photo-1520697830682-bbb6e85e2b0b?auto=format&fit=crop&w=1200&q=80',
    gradient: 'linear-gradient(135deg, #065f46 0%, #0d9488 50%, #0284c7 100%)',
    accentColor: '#06b6d4',
  },
  {
    id: 'weekend',
    name: 'Super Weekend Saver',
    subtitle: 'Grab top trending toys at unbeatable weekend promotional prices!',
    badge: '⚡ FLASH SALE',
    tagline: '⚡ FLASH SALE EVENT',
    imageUrl: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1200&q=80',
    gradient: 'linear-gradient(135deg, #312e81 0%, #4f46e5 50%, #06b6d4 100%)',
    accentColor: '#6366f1',
  },
];

/**
 * Computes campaign status dynamically based on current timestamp (default Date.now()).
 * Ensures campaigns activate and expire automatically without dashboard dependency.
 */
export function computeCampaignStatus(
  campaign: DiscountCampaign,
  nowMs: number = Date.now()
): CampaignStatus {
  if (campaign.deleted) return 'Cancelled';
  if (campaign.isDraft) return 'Draft';
  if (campaign.cancelled || campaign.status === 'Cancelled') return 'Cancelled';

  const startMs = new Date(campaign.startAt).getTime();
  const endMs = new Date(campaign.endAt).getTime();

  if (isNaN(startMs) || isNaN(endMs)) return 'Scheduled';
  if (nowMs < startMs) return 'Scheduled';
  if (nowMs >= startMs && nowMs <= endMs) return 'Active';
  return 'Expired';
}

export interface ProductDiscountInfo {
  isDiscounted: boolean;
  hasDiscount: boolean;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  savingsPerUnit: number;
  discountPercent: number;
  discountType?: CampaignDiscountType;
  discountValue?: number;
  campaignId?: string;
  campaignName?: string;
  discountLabel?: string;
}

/**
 * Calculates the active promotional discount for a product.
 * Selects the best/highest discount if multiple campaigns apply (no unfair stacking),
 * guarantees prices never drop below ₹1, and never alters original product data.
 */
export function calculateProductDiscount(
  product: Product,
  activeCampaigns: DiscountCampaign[]
): ProductDiscountInfo {
  const originalPrice = product.price || 0;
  if (!activeCampaigns || activeCampaigns.length === 0 || originalPrice <= 0) {
    return {
      isDiscounted: false,
      hasDiscount: false,
      originalPrice,
      discountedPrice: originalPrice,
      discountAmount: 0,
      savingsPerUnit: 0,
      discountPercent: 0,
    };
  }

  let bestDiscountAmount = 0;
  let bestCampaign: DiscountCampaign | null = null;
  let bestDiscountedPrice = originalPrice;

  for (const campaign of activeCampaigns) {
    if (campaign.isDraft || campaign.cancelled || campaign.deleted) continue;

    let isEligible = false;
    if (campaign.targetScope === 'all') {
      isEligible = true;
    } else if (campaign.targetScope === 'categories') {
      if (campaign.targetCategories && campaign.targetCategories.includes(product.category)) {
        isEligible = true;
      }
    } else if (campaign.targetScope === 'products') {
      if (campaign.targetProductIds && campaign.targetProductIds.includes(product.id)) {
        isEligible = true;
      }
    }

    if (!isEligible) continue;

    let discount = 0;
    if (campaign.discountType === 'percentage') {
      discount = Math.round((originalPrice * campaign.discountValue) / 100);
    } else {
      discount = Math.round(campaign.discountValue);
    }

    // Never drop below 1 rupee
    discount = Math.min(originalPrice - 1, Math.max(0, discount));
    const finalPrice = originalPrice - discount;

    if (discount > bestDiscountAmount) {
      bestDiscountAmount = discount;
      bestCampaign = campaign;
      bestDiscountedPrice = finalPrice;
    }
  }

  if (bestDiscountAmount > 0 && bestCampaign) {
    const discountPercent = Math.round((bestDiscountAmount / originalPrice) * 100);
    const discountLabel =
      bestCampaign.discountType === 'percentage'
        ? `${bestCampaign.discountValue}% OFF`
        : `₹${bestCampaign.discountValue} OFF`;

    return {
      isDiscounted: true,
      hasDiscount: true,
      originalPrice,
      discountedPrice: bestDiscountedPrice,
      discountAmount: bestDiscountAmount,
      savingsPerUnit: bestDiscountAmount,
      discountPercent,
      discountType: bestCampaign.discountType,
      discountValue: bestCampaign.discountValue,
      campaignId: bestCampaign.id,
      campaignName: bestCampaign.name,
      discountLabel,
    };
  }

  return {
    isDiscounted: false,
    hasDiscount: false,
    originalPrice,
    discountedPrice: originalPrice,
    discountAmount: 0,
    savingsPerUnit: 0,
    discountPercent: 0,
  };
}

export function getStoredDiscountCampaigns(): DiscountCampaign[] {
  try {
    const raw = localStorage.getItem('toynest_discount_campaigns');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveStoredDiscountCampaigns(campaigns: DiscountCampaign[]) {
  try {
    localStorage.setItem('toynest_discount_campaigns', JSON.stringify(campaigns));
  } catch {}
}

export interface MoneyAdjustmentItem {
  id: string;
  type: 'add' | 'subtract';
  amount: number;
  note?: string;
  createdAt: string;
}

export const DEFAULT_OWNER_PIN = 'ANAND1904';

export const DEFAULT_RESCUE_DEALS: RescueDeal[] = [
  {
    id: "deal_spider_noir_special",
    productId: "78291ec9-cf52-4df8-ab72-7d4c0ab2d082",
    title: "Spider-Noir Sitting on Ledge Figure (Open Box Special)",
    originalPrice: 79,
    dealPrice: 49,
    condition: "Open Box - Single piece only",
    description: "Display showcase unit in pristine mint condition. Box opened for inspection. Only 1 available at this special rescue price!",
    imageUrl: "/toys/toy-78291ec9-1.jpg",
    imageUrls: ["/toys/toy-78291ec9-1.jpg", "/toys/toy-78291ec9-2.jpg"],
    colour: "Black",
    claimed: false,
    status: "available",
    createdAt: "2026-10-20T10:00:00.000Z"
  },
  {
    id: "deal_roman_battleship_clearance",
    productId: "8b48e410-debe-4755-a99b-8915fcb5b939",
    title: "Roman Battleship Kit Card (Clearance Deal)",
    originalPrice: 69,
    dealPrice: 39,
    condition: "Last unit - special clearance",
    description: "Complete unbuilt kit card. Packaging has slight transit crease, contents 100% brand new and pristine.",
    imageUrl: "/toys/toy-8b48e410-1.jpg",
    imageUrls: ["/toys/toy-8b48e410-1.jpg", "/toys/toy-8b48e410-2.jpg"],
    colour: "Grey",
    claimed: false,
    status: "available",
    createdAt: "2026-10-20T10:05:00.000Z"
  }
];

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: "40ba4ba9-6434-4a5b-837a-c7a582847205",
    name: "Ferrari F40 & Competizion kit card",
    price: 79,
    category: "Cars",
    available: true,
    createdAt: "2026-10-17T13:01:36.978Z",
    description: "",
    imageUrl: "/toys/toy-40ba4ba9-1.jpg",
    imageUrls: [
      "/toys/toy-40ba4ba9-1.jpg",
      "/toys/toy-40ba4ba9-2.jpg",
      "/toys/toy-40ba4ba9-3.jpg",
      "/toys/toy-40ba4ba9-4.jpg"
    ]
  },
  {
    id: "78291ec9-cf52-4df8-ab72-7d4c0ab2d082",
    name: "Spider-Noir Sitting on Ledge Figure | Spiderman",
    price: 79,
    category: "Action figure",
    available: true,
    createdAt: "2026-10-19T05:43:34.974Z",
    description: "",
    imageUrl: "/toys/toy-78291ec9-1.jpg",
    imageUrls: [
      "/toys/toy-78291ec9-1.jpg",
      "/toys/toy-78291ec9-2.jpg",
      "/toys/toy-78291ec9-3.jpg"
    ]
  },
  {
    id: "7db6d4d5-075a-4953-9ed7-2aa46422f116",
    name: "Mini flower pot",
    price: 49,
    category: "Decorative",
    available: true,
    createdAt: "2026-10-17T03:52:43.766Z",
    description: "",
    imageUrl: "/toys/toy-7db6d4d5-1.jpg",
    imageUrls: [
      "/toys/toy-7db6d4d5-1.jpg",
      "/toys/toy-7db6d4d5-2.jpg"
    ]
  },
  {
    id: "8b48e410-debe-4755-a99b-8915fcb5b939",
    name: "Roman Battleship Kit Card",
    price: 69,
    category: "Decorative",
    available: true,
    createdAt: "2026-10-17T04:02:40.407Z",
    description: "",
    imageUrl: "/toys/toy-8b48e410-1.jpg",
    imageUrls: [
      "/toys/toy-8b48e410-1.jpg",
      "/toys/toy-8b48e410-2.jpg",
      "/toys/toy-8b48e410-3.jpg",
      "/toys/toy-8b48e410-4.jpg"
    ]
  },
  {
    id: "94189799-9004-4f29-ba0c-64fc8400619d",
    name: "Nissan 370z Kit Card",
    price: 79,
    category: "Cars",
    available: true,
    createdAt: "2026-10-17T04:04:14.938Z",
    description: "",
    imageUrl: "/toys/toy-94189799-1.jpg",
    imageUrls: [
      "/toys/toy-94189799-1.jpg",
      "/toys/toy-94189799-2.jpg",
      "/toys/toy-94189799-3.jpg",
      "/toys/toy-94189799-4.jpg"
    ]
  },
  {
    id: "f0acb428-9f95-4bab-94a5-6b57d2415b25",
    name: "Nissan GTR R34 Kit Card",
    price: 79,
    category: "Cars",
    available: true,
    createdAt: "2026-10-17T04:05:47.738Z",
    description: "",
    imageUrl: "/toys/toy-f0acb428-1.jpg",
    imageUrls: [
      "/toys/toy-f0acb428-1.jpg",
      "/toys/toy-f0acb428-2.jpg",
      "/toys/toy-f0acb428-3.jpg",
      "/toys/toy-f0acb428-4.jpg"
    ]
  }
];

export function getStoredDeletedRescueDealIds(): string[] {
  try {
    const raw = localStorage.getItem('toynest_deleted_rescue_deal_ids');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveStoredDeletedRescueDealIds(ids: string[]): void {
  try {
    localStorage.setItem('toynest_deleted_rescue_deal_ids', JSON.stringify(ids));
  } catch {}
}

export function markRescueDealDeletedLocally(dealId: string): void {
  const current = getStoredDeletedRescueDealIds();
  if (!current.includes(dealId)) {
    saveStoredDeletedRescueDealIds([...current, dealId]);
  }
}

export function getStoredMoneyAdjustment(): number {
  try {
    const raw = localStorage.getItem('toynest_manual_money_adjustment');
    if (raw !== null && raw !== '') {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && isFinite(parsed)) return parsed;
    }
  } catch {}
  return 0;
}

export function saveStoredMoneyAdjustment(val: number): void {
  try {
    localStorage.setItem('toynest_manual_money_adjustment', String(val));
  } catch {}
}

export function getStoredMoneyAdjustmentHistory(): MoneyAdjustmentItem[] {
  try {
    const raw = localStorage.getItem('toynest_money_adjustment_history');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveStoredMoneyAdjustmentHistory(list: MoneyAdjustmentItem[]): void {
  try {
    localStorage.setItem('toynest_money_adjustment_history', JSON.stringify(list));
  } catch {}
}
