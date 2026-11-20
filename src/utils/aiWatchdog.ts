import {
  type Order,
  type Product,
  type RescueDeal,
  type ScheduledOffer,
  type DiscountCampaign,
  type ProductQuestion,
  type WatchdogAlert,
  type WatchdogAlertCategory,
  type WatchdogAlertSeverity,
  type WatchdogActivityLog,
  computeOfferStatus,
  computeCampaignStatus,
  calculateProductDiscount,
} from '../defaultData';
import type { CapturedWebsiteError } from './websiteErrorMonitor';
import { runDeterministicOrderInspection } from './orderVerification';

export interface WatchdogMetrics {
  ordersChecked: number;
  suspiciousOrders: number;
  productListingIssues: number;
  priceAnomalies: number;
  websiteErrors: number;
  criticalAlerts: number;
  totalPendingAlerts: number;
}

export interface WatchdogAuditInput {
  orders: Order[];
  products: Product[];
  rescueDeals: RescueDeal[];
  scheduledOffers: ScheduledOffer[];
  discountCampaigns: DiscountCampaign[];
  productQuestions: ProductQuestion[];
  websiteErrors: CapturedWebsiteError[];
  adultPublished: boolean;
  childPublished: boolean;
  geminiStatus?: {
    checked: boolean;
    geminiConfigured: boolean;
    backendError?: string;
  };
  existingAlerts: WatchdogAlert[];
  availableColours?: string[];
  nowMs?: number;
}

export interface WatchdogFindingCandidate {
  id: string;
  title: string;
  explanation: string;
  recommendedAction: string;
  category: WatchdogAlertCategory;
  severity: WatchdogAlertSeverity;
  targetType?: WatchdogAlert['targetType'];
  targetId?: string;
  targetLabel?: string;
  detectedBy: 'rules' | 'gemini_ai';
}

export function sanitizeWatchdogDocId(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 124);
  return cleaned || `wd_${Date.now().toString(36)}`;
}

function getMedianPrice(values: number[]): number | null {
  const valid = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function isOrderClosedOrApproved(order: Order): boolean {
  const status = String(order.status || '').trim().toLowerCase();
  if (['completed', 'delivered', 'collected', 'cancelled'].includes(status)) return true;
  if (order.aiVerification?.decisionStatus === 'approved' || order.aiVerification?.decisionStatus === 'rejected') {
    return true;
  }
  return false;
}

export function isSuspiciousOrderForWatchdog(order: Order): boolean {
  if (!order) return false;
  const status = String(order.status || '').trim();
  const v = order.aiVerification;
  if (v?.decisionStatus === 'rejected') return false;
  if (v?.decisionStatus === 'approved') return false;
  if (
    v?.riskLevel === 'HIGH' ||
    v?.riskLevel === 'MEDIUM' ||
    v?.decisionStatus === 'pending_review' ||
    v?.decisionStatus === 'clarification_requested'
  ) {
    return true;
  }
  if (
    status === 'On Hold (AI Review)' ||
    status === 'Awaiting Clarification' ||
    status === 'Clarification Submitted'
  ) {
    return true;
  }
  return false;
}

/**
 * Deterministic real-database audit across Orders, Products, Pricing & Website health.
 * Never fabricates alerts or statistics; every alert points to an actual database entity or real captured error.
 */
export function collectDeterministicWatchdogFindings(
  input: WatchdogAuditInput
): {
  candidates: WatchdogFindingCandidate[];
  suspiciousOrderIds: Set<string>;
} {
  const nowMs = input.nowMs ?? Date.now();
  const candidates: WatchdogFindingCandidate[] = [];
  const seenIds = new Set<string>();
  const suspiciousOrderIds = new Set<string>();

  const pushCandidate = (c: WatchdogFindingCandidate) => {
    const safeId = sanitizeWatchdogDocId(c.id);
    if (seenIds.has(safeId)) return;
    seenIds.add(safeId);
    candidates.push({
      ...c,
      id: safeId,
      title: c.title.trim().slice(0, 180),
      explanation: c.explanation.trim().slice(0, 750),
      recommendedAction: c.recommendedAction.trim().slice(0, 360),
      ...(c.targetId ? { targetId: String(c.targetId).slice(0, 128) } : {}),
      ...(c.targetLabel ? { targetLabel: String(c.targetLabel).trim().slice(0, 180) } : {}),
    });
  };

  const productMap = new Map<string, Product>();
  input.products.forEach((p) => {
    if (p?.id) productMap.set(p.id, p);
  });

  // =========================================================================
  // 1. ORDERS MONITORING (Real Suspicious Orders, Price Mismatches, Missing Fields)
  // =========================================================================
  for (const order of input.orders) {
    if (!order || !order.id) continue;
    const closed = isOrderClosedOrApproved(order);
    const label = order.orderNumber ? `Order ${order.orderNumber}` : `Order ${order.id.slice(0, 8)}`;

    // 1A. Already flagged by Playnix AI Order Verification (HIGH/MEDIUM unreviewed or on hold)
    if (isSuspiciousOrderForWatchdog(order)) {
      suspiciousOrderIds.add(order.id);
      const risk = order.aiVerification?.riskLevel || 'MEDIUM';
      const firstFlag = order.aiVerification?.flaggedFields?.[0];
      pushCandidate({
        id: `wd_order_ai_${order.id}`,
        title: `${risk} Risk Order: ${label} (${order.name || 'Customer'})`,
        explanation:
          order.aiVerification?.summaryReason ||
          firstFlag?.reason ||
          `Order for "${order.productName}" is held or awaiting verification (${order.status}).`,
        recommendedAction:
          order.aiVerification?.recommendedAction === 'Hold & Review'
            ? 'Inspect customer details in Orders → AI Review and Approve, Request Clarification, or Reject.'
            : 'Verify customer details in Orders → AI Review before dispatching.',
        category: 'orders',
        severity: risk === 'HIGH' ? 'critical' : 'warning',
        targetType: 'order',
        targetId: order.id,
        targetLabel: `${label} · ${order.productName}`,
        detectedBy: 'rules',
      });
    } else if (!closed && !order.aiVerification) {
      // 1B. Legacy or offline order that was never inspected by Order Verification yet
      const matchedProduct = order.productId ? productMap.get(order.productId) : undefined;
      const inspection = runDeterministicOrderInspection(
        order,
        matchedProduct,
        input.orders.filter((o) => o.id !== order.id)
      );
      if (inspection.verification.riskLevel !== 'LOW') {
        suspiciousOrderIds.add(order.id);
        pushCandidate({
          id: `wd_order_scan_${order.id}`,
          title: `Unverified Order Flagged (${inspection.verification.riskLevel}): ${label}`,
          explanation: inspection.verification.summaryReason,
          recommendedAction:
            'Open this order in the Orders tab and verify customer name, contact info, and delivery details.',
          category: 'orders',
          severity: inspection.verification.riskLevel === 'HIGH' ? 'critical' : 'warning',
          targetType: 'order',
          targetId: order.id,
          targetLabel: `${label} · ${order.name || 'Customer'}`,
          detectedBy: 'rules',
        });
      }
    }

    // 1C. Order Pricing Integrity Check (Standard product orders with unexpected zero/negative/mismatched total)
    const statusLower = String(order.status || '').trim().toLowerCase();
    if (statusLower !== 'cancelled') {
      const qty = Math.max(1, Number(order.quantity) || 1);
      const totalPaid = Number(order.price) || 0;
      if (totalPaid <= 0) {
        suspiciousOrderIds.add(order.id);
        pushCandidate({
          id: `wd_price_zero_order_${order.id}`,
          title: `Zero/Invalid Total Price on ${label}`,
          explanation: `${label} for "${order.productName}" (qty ${qty}) recorded a price of ₹${totalPaid}.`,
          recommendedAction: 'Check order payment and item pricing before confirming or fulfilling.',
          category: 'pricing',
          severity: 'critical',
          targetType: 'order',
          targetId: order.id,
          targetLabel: `${label} · ₹${totalPaid}`,
          detectedBy: 'rules',
        });
      } else if (!order.isRescueDeal && !order.isScheduledOffer && !order.isCampaignDiscount && !order.campaignId && order.productId) {
        const catalogProd = productMap.get(order.productId);
        if (catalogProd && catalogProd.price > 0) {
          const expectedTotal = catalogProd.price * qty;
          // Flag only major mismatch (> 45% under catalog total when no discount was applied at checkout)
          if (expectedTotal >= 30 && totalPaid < expectedTotal * 0.55) {
            pushCandidate({
              id: `wd_price_mismatch_order_${order.id}`,
              title: `Order Price Mismatch on ${label}`,
              explanation: `Recorded ₹${totalPaid} for ${qty}x "${catalogProd.name}" without a discount record, whereas current catalog price totals ₹${expectedTotal}.`,
              recommendedAction: 'Confirm whether product price changed after order placement or verify UPI payment amount.',
              category: 'pricing',
              severity: 'warning',
              targetType: 'order',
              targetId: order.id,
              targetLabel: `${label} · Paid ₹${totalPaid} vs ₹${expectedTotal}`,
              detectedBy: 'rules',
            });
          }
        }
      }
    }
  }

  // =========================================================================
  // 2. PRODUCT LISTING QUALITY & CONSISTENCY CHECKS
  // =========================================================================
  const normalizedNameGroups = new Map<string, Product[]>();
  const liveProductsByCategory = new Map<string, Product[]>();

  for (const p of input.products) {
    if (!p || !p.id) continue;
    const isLive = p.available !== false;
    const nameClean = String(p.name || '').trim();
    const normName = nameClean.toLowerCase().replace(/\s+/g, ' ');
    if (normName) {
      const grp = normalizedNameGroups.get(normName) || [];
      grp.push(p);
      normalizedNameGroups.set(normName, grp);
    }

    if (isLive) {
      const catKey = String(p.category || 'Other').trim().toLowerCase();
      const catList = liveProductsByCategory.get(catKey) || [];
      catList.push(p);
      liveProductsByCategory.set(catKey, catList);
    }

    // 2A. Invalid or zero product price
    if (!Number.isFinite(p.price) || p.price <= 0) {
      pushCandidate({
        id: `wd_price_prod_zero_${p.id}`,
        title: `Invalid Product Price: "${nameClean || p.id}"`,
        explanation: `Product "${nameClean || p.id}" currently has a price of ₹${p.price || 0}. Live products must have a positive ₹ price.`,
        recommendedAction: 'Edit this product and set a valid price above ₹0.',
        category: 'pricing',
        severity: 'critical',
        targetType: 'product',
        targetId: p.id,
        targetLabel: nameClean || p.id,
        detectedBy: 'rules',
      });
    }

    // 2B. Missing/broken image on live product
    const hasValidImage =
      (Array.isArray(p.imageUrls) && p.imageUrls.some((u) => typeof u === 'string' && u.trim().length > 4)) ||
      (typeof p.imageUrl === 'string' && p.imageUrl.trim().length > 4);
    if (isLive && !hasValidImage) {
      pushCandidate({
        id: `wd_prod_noimg_${p.id}`,
        title: `Missing Product Photo: "${nameClean}"`,
        explanation: `Live product "${nameClean}" has no valid product image URL, which leaves shoppers without photos.`,
        recommendedAction: 'Edit this product and upload at least one clear product photo.',
        category: 'products',
        severity: 'warning',
        targetType: 'product',
        targetId: p.id,
        targetLabel: nameClean,
        detectedBy: 'rules',
      });
    }

    // 2C. Missing or ultra-short description on live product
    const desc = String(p.description || '').trim();
    const hasHighlights = Array.isArray(p.highlights) && p.highlights.length > 0;
    if (isLive && desc.length < 8 && !hasHighlights) {
      pushCandidate({
        id: `wd_prod_nodesc_${p.id}`,
        title: `Incomplete Listing Details: "${nameClean}"`,
        explanation: `Live product "${nameClean}" has no description or highlight bullet points, which hurts buyer trust and customer search accuracy.`,
        recommendedAction: 'Open this product to add a short description or generate AI photo highlights.',
        category: 'products',
        severity: 'info',
        targetType: 'product',
        targetId: p.id,
        targetLabel: nameClean,
        detectedBy: 'rules',
      });
    }

    // 2D. Product category contradiction check (e.g., fidget product categorized as Educational)
    const catLower = String(p.category || '').trim().toLowerCase();
    const combinedText = `${nameClean} ${desc}`.toLowerCase();
    if (
      catLower === 'educational' &&
      /\b(fidget|infinity\s*cube|spinner|clicker|pop[\s-]*it|sensory|stress[\s-]*relief)\b/i.test(combinedText)
    ) {
      pushCandidate({
        id: `wd_prod_catmismatch_${p.id}`,
        title: `Category Mismatch: "${nameClean}"`,
        explanation: `"${nameClean}" appears to be a fidget/sensory toy but is currently listed under "${p.category}".`,
        recommendedAction: 'Update the product category to "Fidget" so customers find it under the right filter.',
        category: 'products',
        severity: 'warning',
        targetType: 'product',
        targetId: p.id,
        targetLabel: `${nameClean} (${p.category})`,
        detectedBy: 'rules',
      });
    }
  }

  // 2E. Duplicate live product names
  for (const [normName, list] of normalizedNameGroups.entries()) {
    const liveMatches = list.filter((p) => p.available !== false);
    if (liveMatches.length > 1) {
      const first = liveMatches[0];
      pushCandidate({
        id: `wd_prod_dup_${normName.slice(0, 48)}`,
        title: `Duplicate Live Product Listing: "${first.name}"`,
        explanation: `${liveMatches.length} live products share the exact name "${first.name}". Duplicate listings can confuse shoppers and split analytics.`,
        recommendedAction: 'Review the duplicate listings in Products and move duplicates to Drafts or rename them.',
        category: 'products',
        severity: 'warning',
        targetType: 'product',
        targetId: first.id,
        targetLabel: `${liveMatches.length} listings named "${first.name}"`,
        detectedBy: 'rules',
      });
    }
  }

  // =========================================================================
  // 3. PRICING ANOMALIES (Category Outliers, Rescue Deals, Offers, Campaigns)
  // =========================================================================
  // 3A. Category price outliers (requires at least 3 live items in same category to establish real median)
  for (const [catKey, catProducts] of liveProductsByCategory.entries()) {
    if (catProducts.length < 3) continue;
    const median = getMedianPrice(catProducts.map((p) => p.price));
    if (!median || median <= 0) continue;

    for (const p of catProducts) {
      if (p.price >= median * 3.5 && p.price - median >= 150) {
        pushCandidate({
          id: `wd_price_high_${p.id}`,
          title: `Unusually High Price vs Category: "${p.name}"`,
          explanation: `"${p.name}" is priced at ₹${p.price}, which is ${(p.price / median).toFixed(1)}x the "${p.category}" median price (₹${Math.round(median)}).`,
          recommendedAction: 'Double-check whether an extra zero was accidentally typed in the product price.',
          category: 'pricing',
          severity: 'warning',
          targetType: 'product',
          targetId: p.id,
          targetLabel: `${p.name} · ₹${p.price}`,
          detectedBy: 'rules',
        });
      } else if (p.price > 0 && p.price <= median * 0.25 && median - p.price >= 40) {
        pushCandidate({
          id: `wd_price_low_${p.id}`,
          title: `Unusually Low Price vs Category: "${p.name}"`,
          explanation: `"${p.name}" is priced at ₹${p.price}, far below the "${p.category}" median of ₹${Math.round(median)}.`,
          recommendedAction: 'Confirm this low price is intentional and not missing a digit.',
          category: 'pricing',
          severity: 'warning',
          targetType: 'product',
          targetId: p.id,
          targetLabel: `${p.name} · ₹${p.price}`,
          detectedBy: 'rules',
        });
      }
    }
  }

  // 3B. Rescue Deals price & reference integrity
  for (const deal of input.rescueDeals) {
    if (!deal || deal.deleted || deal.claimed) continue;
    if (deal.dealPrice <= 0 || deal.originalPrice <= 0) {
      pushCandidate({
        id: `wd_price_deal_zero_${deal.id}`,
        title: `Invalid Rescue Deal Price: "${deal.title}"`,
        explanation: `Rescue Deal "${deal.title}" has dealPrice ₹${deal.dealPrice} / originalPrice ₹${deal.originalPrice}.`,
        recommendedAction: 'Check and fix pricing in Rescue Deals Manager.',
        category: 'pricing',
        severity: 'critical',
        targetType: 'deal',
        targetId: deal.id,
        targetLabel: deal.title,
        detectedBy: 'rules',
      });
    } else if (deal.dealPrice >= deal.originalPrice) {
      pushCandidate({
        id: `wd_price_deal_markup_${deal.id}`,
        title: `Rescue Deal Not Discounted: "${deal.title}"`,
        explanation: `Deal price (₹${deal.dealPrice}) is equal to or higher than original price (₹${deal.originalPrice}).`,
        recommendedAction: 'Lower the rescue deal price or adjust the original price in Rescue Deals Manager.',
        category: 'pricing',
        severity: 'warning',
        targetType: 'deal',
        targetId: deal.id,
        targetLabel: `${deal.title} (₹${deal.dealPrice} vs ₹${deal.originalPrice})`,
        detectedBy: 'rules',
      });
    }
  }

  // 3C. Scheduled Offers price, dates & product integrity
  for (const offer of input.scheduledOffers) {
    if (!offer || offer.deleted || offer.cancelled) continue;
    const computedStatus = computeOfferStatus(offer, nowMs);
    if (computedStatus === 'Expired' || computedStatus === 'Completed') continue;

    const startMs = new Date(offer.startAt).getTime();
    const endMs = new Date(offer.endAt).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && endMs <= startMs) {
      pushCandidate({
        id: `wd_offer_dates_${offer.id}`,
        title: `Invalid Offer Schedule Window: "${offer.title || offer.productName}"`,
        explanation: `Scheduled offer end time is earlier than or equal to its start time, so it cannot run properly.`,
        recommendedAction: 'Edit the Scheduled Offer and set an end time after the start time.',
        category: 'pricing',
        severity: 'warning',
        targetType: 'offer',
        targetId: offer.id,
        targetLabel: offer.title || offer.productName,
        detectedBy: 'rules',
      });
    }

    if (offer.discountedPrice <= 0 || offer.discountedPrice >= offer.originalPrice) {
      pushCandidate({
        id: `wd_price_offer_${offer.id}`,
        title: `Scheduled Offer Price Anomaly: "${offer.title || offer.productName}"`,
        explanation: `Offer sets price to ₹${offer.discountedPrice} against original ₹${offer.originalPrice}.`,
        recommendedAction: 'Adjust the offer price in Scheduled Offers so shoppers receive a valid discount above ₹0.',
        category: 'pricing',
        severity: 'critical',
        targetType: 'offer',
        targetId: offer.id,
        targetLabel: offer.productName,
        detectedBy: 'rules',
      });
    }

    if (offer.productId && !productMap.has(offer.productId)) {
      pushCandidate({
        id: `wd_prod_offer_orphan_${offer.id}`,
        title: `Scheduled Offer Points to Deleted Product: "${offer.productName}"`,
        explanation: `Scheduled offer "${offer.title || offer.productName}" references product ID "${offer.productId}", which no longer exists in the catalog.`,
        recommendedAction: 'Cancel or update this offer in Scheduled Offers.',
        category: 'products',
        severity: 'warning',
        targetType: 'offer',
        targetId: offer.id,
        targetLabel: offer.productName,
        detectedBy: 'rules',
      });
    }
  }

  // 3D. Discount Campaigns extreme discount & active price floor check
  const activeCampaigns = input.discountCampaigns.filter(
    (c) => !c.deleted && !c.cancelled && computeCampaignStatus(c, nowMs) === 'Active'
  );

  for (const camp of input.discountCampaigns) {
    if (!camp || camp.deleted || camp.cancelled) continue;
    const status = computeCampaignStatus(camp, nowMs);
    if (status === 'Expired') continue;

    if (camp.discountType === 'percentage' && camp.discountValue >= 80) {
      pushCandidate({
        id: `wd_price_camp_extreme_${camp.id}`,
        title: `Extreme ${camp.discountValue}% Discount Campaign: "${camp.name}"`,
        explanation: `Campaign "${camp.name}" applies an unusually steep ${camp.discountValue}% discount (${status}).`,
        recommendedAction: 'Review the discount percentage in Festival Campaigns to ensure margins are protected.',
        category: 'pricing',
        severity: 'critical',
        targetType: 'campaign',
        targetId: camp.id,
        targetLabel: `${camp.name} (${camp.discountValue}% OFF)`,
        detectedBy: 'rules',
      });
    } else if (camp.discountValue <= 0) {
      pushCandidate({
        id: `wd_price_camp_zero_${camp.id}`,
        title: `Zero Discount Campaign: "${camp.name}"`,
        explanation: `Campaign "${camp.name}" currently has a discount value of ₹0 / 0%.`,
        recommendedAction: 'Update or cancel this campaign in Festival Campaigns.',
        category: 'pricing',
        severity: 'warning',
        targetType: 'campaign',
        targetId: camp.id,
        targetLabel: camp.name,
        detectedBy: 'rules',
      });
    }
  }

  // Check if active campaigns crush a live product to ₹1 floor
  if (activeCampaigns.length > 0) {
    for (const p of input.products) {
      if (p.available === false || p.price <= 5) continue;
      const dInfo = calculateProductDiscount(p, activeCampaigns);
      if (dInfo.isDiscounted && dInfo.discountedPrice <= 1) {
        pushCandidate({
          id: `wd_price_floor_${p.id}`,
          title: `Discount Drops "${p.name}" to ₹1 Floor`,
          explanation: `Active campaign "${dInfo.campaignName || 'Sale'}" reduces "${p.name}" from ₹${p.price} all the way down to the ₹1 minimum floor.`,
          recommendedAction: 'Review campaign flat-₹ amount or exclude lower-priced products from that campaign.',
          category: 'pricing',
          severity: 'critical',
          targetType: 'campaign',
          targetId: dInfo.campaignId,
          targetLabel: `${p.name} (₹${p.price} -> ₹${dInfo.discountedPrice})`,
          detectedBy: 'rules',
        });
      }
    }
  }

  // =========================================================================
  // 4. WEBSITE HEALTH & RUNTIME / API / STOREFRONT ERRORS
  // =========================================================================
  // 4A. Both storefront sections hidden (Draft)
  if (!input.adultPublished && !input.childPublished) {
    pushCandidate({
      id: 'wd_web_sections_hidden',
      title: 'Both Adult & Child Storefront Sections Are Hidden',
      explanation:
        'Both customer sections are currently saved as Drafts, so visitors see an empty storefront and cannot browse or place orders.',
      recommendedAction: 'Open Shop Sections in the Owner Menu and publish at least one section.',
      category: 'website',
      severity: 'critical',
      targetType: 'website',
      targetId: 'sections',
      targetLabel: 'Shop Sections Settings',
      detectedBy: 'rules',
    });
  }

  // 4B. Zero live products available for shoppers
  const liveCount = input.products.filter((p) => p && p.available !== false).length;
  if (liveCount === 0) {
    pushCandidate({
      id: 'wd_web_no_live_products',
      title: 'No Live Products Visible on Storefront',
      explanation:
        'Every product in the catalog is currently in Draft/unavailable status, so customers have 0 toys available to buy.',
      recommendedAction: 'Publish at least one toy from Drafts or add a new product.',
      category: 'website',
      severity: 'critical',
      targetType: 'product',
      targetId: 'products',
      targetLabel: 'Storefront Catalog',
      detectedBy: 'rules',
    });
  }

  // 4C. Gemini AI backend status issue (if checked and failing / unconfigured)
  if (input.geminiStatus?.checked) {
    if (input.geminiStatus.backendError) {
      pushCandidate({
        id: 'wd_web_gemini_backend_err',
        title: 'Backend AI Endpoint Error Detected',
        explanation: `Playnix AI server status check returned: ${input.geminiStatus.backendError}`,
        recommendedAction: 'Verify the Node API server and GEMINI_API_KEY configuration in Settings > Secrets.',
        category: 'website',
        severity: 'warning',
        targetType: 'website',
        targetId: 'aiAssistant',
        targetLabel: 'Backend AI Service',
        detectedBy: 'rules',
      });
    } else if (!input.geminiStatus.geminiConfigured) {
      pushCandidate({
        id: 'wd_web_gemini_not_configured',
        title: 'Gemini API Key Not Configured on Server',
        explanation:
          'Playnix AI smart features (AI Watchdog deep audit, smart search, and order verification) are running on deterministic rules only because GEMINI_API_KEY is missing.',
        recommendedAction: 'Add GEMINI_API_KEY in Settings > Secrets to enable full Gemini AI monitoring.',
        category: 'website',
        severity: 'warning',
        targetType: 'website',
        targetId: 'aiAssistant',
        targetLabel: 'Gemini API Configuration',
        detectedBy: 'rules',
      });
    }
  }

  // 4D. Real captured runtime / promise / API errors from websiteErrorMonitor
  for (const err of input.websiteErrors) {
    if (!err || !err.id || !err.message) continue;
    const isApiOrRuntime = err.source === 'runtime' || err.source === 'api';
    pushCandidate({
      id: `wd_web_err_${err.id}`,
      title: `${err.source.toUpperCase()} Error${err.count > 1 ? ` (×${err.count})` : ''}: ${err.message.slice(0, 80)}`,
      explanation: `${err.message}${err.context ? ` (Context: ${err.context})` : ''}. Last occurred at ${new Date(err.at).toLocaleTimeString('en-IN')}.`,
      recommendedAction:
        err.source === 'api'
          ? 'Check backend server logs or network connectivity, then re-test the failing action.'
          : 'Inspect browser console details for this runtime exception and verify affected page.',
      category: 'website',
      severity: isApiOrRuntime && err.count >= 2 ? 'critical' : 'warning',
      targetType: 'website',
      targetId: err.id,
      targetLabel: err.context || err.source,
      detectedBy: 'rules',
    });
  }

  // 4E. Long-pending customer product questions (> 48h unanswered)
  const unansweredOld = input.productQuestions.filter((q) => {
    if (!q || q.status !== 'Pending') return false;
    const ageMs = nowMs - new Date(q.createdAt || 0).getTime();
    return Number.isFinite(ageMs) && ageMs > 48 * 3600 * 1000;
  });
  if (unansweredOld.length > 0) {
    pushCandidate({
      id: 'wd_web_old_questions',
      title: `${unansweredOld.length} Customer Question${unansweredOld.length > 1 ? 's' : ''} Waiting Over 48 Hours`,
      explanation: `Unanswered customer questions on products (starting with "${unansweredOld[0].productName}") have waited more than 2 days for a reply.`,
      recommendedAction: 'Open Product Questions in the Owner Menu to reply (or use Playnix AI to draft answers).',
      category: 'website',
      severity: 'info',
      targetType: 'website',
      targetId: 'questions',
      targetLabel: `${unansweredOld.length} pending Q&A`,
      detectedBy: 'rules',
    });
  }

  return { candidates, suspiciousOrderIds };
}

/**
 * Reconciles fresh audit candidates against persisted Watchdog alerts:
 * - Preserves Owner decisions (`Ignored` stays `Ignored`, `Resolved` stays `Resolved`).
 * - Creates `Pending` alerts for genuinely new issues + logs `detected`.
 * - Auto-resolves previously `Pending` deterministic rule alerts whose underlying issue is now fixed + logs `auto_resolved`.
 */
export function reconcileWatchdogAudit(
  input: WatchdogAuditInput,
  extraGeminiCandidates: WatchdogFindingCandidate[] = [],
  options: { allowAutoResolveRules?: boolean } = { allowAutoResolveRules: true }
): {
  nextAlerts: WatchdogAlert[];
  changedAlerts: WatchdogAlert[];
  newLogs: WatchdogActivityLog[];
  metrics: WatchdogMetrics;
} {
  const nowIso = new Date().toISOString();
  const { candidates: ruleCandidates, suspiciousOrderIds } =
    collectDeterministicWatchdogFindings(input);

  const allCandidatesMap = new Map<string, WatchdogFindingCandidate>();
  for (const c of ruleCandidates) {
    allCandidatesMap.set(c.id, c);
  }
  for (const g of extraGeminiCandidates) {
    const safeId = sanitizeWatchdogDocId(g.id);
    if (!allCandidatesMap.has(safeId)) {
      allCandidatesMap.set(safeId, { ...g, id: safeId });
    }
  }

  const existingMap = new Map<string, WatchdogAlert>();
  for (const a of input.existingAlerts) {
    if (a?.id) existingMap.set(a.id, a);
  }

  const changedAlerts: WatchdogAlert[] = [];
  const newLogs: WatchdogActivityLog[] = [];
  const nextMap = new Map<string, WatchdogAlert>(existingMap);

  const createLog = (partial: Omit<WatchdogActivityLog, 'id' | 'at'>): WatchdogActivityLog => ({
    id: sanitizeWatchdogDocId(
      `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    ),
    at: nowIso,
    ...partial,
  });

  for (const c of allCandidatesMap.values()) {
    const existing = existingMap.get(c.id);
    if (!existing) {
      const created: WatchdogAlert = {
        id: c.id,
        title: c.title,
        explanation: c.explanation,
        recommendedAction: c.recommendedAction,
        category: c.category,
        severity: c.severity,
        status: 'Pending',
        targetType: c.targetType,
        targetId: c.targetId,
        targetLabel: c.targetLabel,
        detectedBy: c.detectedBy,
        detectedAt: nowIso,
        updatedAt: nowIso,
      };
      nextMap.set(c.id, created);
      changedAlerts.push(created);
      newLogs.push(
        createLog({
          alertId: created.id,
          alertTitle: created.title,
          category: created.category,
          action: 'detected',
          actor: c.detectedBy === 'gemini_ai' ? 'Gemini AI' : 'AI Watchdog',
          details: `${c.severity.toUpperCase()} issue detected: ${c.title}`,
          severity: c.severity,
        })
      );
    } else if (existing.status === 'Pending') {
      // Refresh explanation/severity cleanly if underlying real data changed while still Pending
      if (
        existing.explanation !== c.explanation ||
        existing.severity !== c.severity ||
        existing.title !== c.title
      ) {
        const updated: WatchdogAlert = {
          ...existing,
          title: c.title,
          explanation: c.explanation,
          recommendedAction: c.recommendedAction,
          severity: c.severity,
          targetLabel: c.targetLabel || existing.targetLabel,
          updatedAt: nowIso,
        };
        nextMap.set(c.id, updated);
        changedAlerts.push(updated);
      }
    }
    // Note: If existing.status is 'Ignored' or 'Resolved', preserve owner's decision!
  }

  // Auto-resolve Pending deterministic rule alerts when their condition no longer exists in DB
  if (options.allowAutoResolveRules !== false) {
    for (const [id, existing] of existingMap.entries()) {
      if (
        existing.status === 'Pending' &&
        existing.detectedBy === 'rules' &&
        !allCandidatesMap.has(id)
      ) {
        const autoResolved: WatchdogAlert = {
          ...existing,
          status: 'Resolved',
          resolvedAt: nowIso,
          updatedAt: nowIso,
          ownerNote: existing.ownerNote || 'Automatically resolved after underlying data was fixed.',
        };
        nextMap.set(id, autoResolved);
        changedAlerts.push(autoResolved);
        newLogs.push(
          createLog({
            alertId: existing.id,
            alertTitle: existing.title,
            category: existing.category,
            action: 'auto_resolved',
            actor: 'AI Watchdog',
            details: `Issue no longer present in store data and marked Resolved: ${existing.title}`,
            severity: 'info',
          })
        );
      }
    }
  }

  const nextAlerts = Array.from(nextMap.values()).sort(
    (a, b) => new Date(b.updatedAt || b.detectedAt || 0).getTime() - new Date(a.updatedAt || a.detectedAt || 0).getTime()
  );

  const metrics = computeWatchdogMetrics({
    orders: input.orders,
    alerts: nextAlerts,
    websiteErrors: input.websiteErrors,
    suspiciousOrderIds,
  });

  return {
    nextAlerts,
    changedAlerts,
    newLogs,
    metrics,
  };
}

export function computeWatchdogMetrics(params: {
  orders: Order[];
  alerts: WatchdogAlert[];
  websiteErrors?: CapturedWebsiteError[];
  suspiciousOrderIds?: Set<string>;
}): WatchdogMetrics {
  const pendingAlerts = params.alerts.filter((a) => a.status === 'Pending');

  // Suspicious orders count combines real unreviewed flagged orders + pending Watchdog order alerts
  const susIds = new Set<string>(params.suspiciousOrderIds || []);
  for (const ord of params.orders) {
    if (ord?.id && isSuspiciousOrderForWatchdog(ord)) {
      susIds.add(ord.id);
    }
  }
  for (const al of pendingAlerts) {
    if (al.category === 'orders' && al.targetType === 'order' && al.targetId) {
      susIds.add(al.targetId);
    }
  }

  const productListingIssues = pendingAlerts.filter((a) => a.category === 'products').length;
  const priceAnomalies = pendingAlerts.filter((a) => a.category === 'pricing').length;

  // Website errors count: real Pending website alerts OR active un-cleared captured runtime errors
  const pendingWebsiteAlerts = pendingAlerts.filter((a) => a.category === 'website').length;
  const criticalAlerts = pendingAlerts.filter((a) => a.severity === 'critical').length;

  return {
    ordersChecked: params.orders.length,
    suspiciousOrders: Math.max(
      susIds.size,
      pendingAlerts.filter((a) => a.category === 'orders').length
    ),
    productListingIssues,
    priceAnomalies,
    websiteErrors: pendingWebsiteAlerts,
    criticalAlerts,
    totalPendingAlerts: pendingAlerts.length,
  };
}
