import type {
  Order,
  OrderAiVerification,
  OrderRiskLevel,
  Product,
} from '../defaultData';

export interface RuleInspectionOutput {
  verification: OrderAiVerification;
  needsAiContextCheck: boolean;
  triggers: string[];
}

const JUNK_PLACEHOLDERS = new Set([
  'test',
  'testing',
  'fake',
  'spam',
  'asdf',
  'asdfg',
  'asdfgh',
  'qwerty',
  'qwert',
  'zxcv',
  'zxcvb',
  'xyz',
  'abc',
  'abcd',
  'none',
  'nil',
  'null',
  'na',
  'n/a',
  'idk',
  'nothing',
  'nobody',
  'anonymous',
  'anon',
  'demo',
  'sample',
  'whatever',
  'blah',
  'lol',
  'lmao',
  'bruh',
]);

const KEYBOARD_RUNS = [
  'qwerty',
  'qwert',
  'werty',
  'asdfg',
  'sdfgh',
  'dfghj',
  'fghjk',
  'ghjkl',
  'zxcvb',
  'xcvbn',
  'poiuy',
  'oiuyt',
  'lkjhg',
  'kjhgf',
  'mnbvc',
  'qazws',
  'wsxed',
  'edcrf',
];

const SEQUENTIAL_PHONES = new Set([
  '1234567890',
  '0123456789',
  '9876543210',
  '0987654321',
  '1234512345',
  '1122334455',
  '9988776655',
  '1212121212',
]);

function looksLikeKeyboardSmash(raw: string): { isSmash: boolean; isAmbiguous: boolean; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { isSmash: false, isAmbiguous: false, reason: '' };
  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, '');

  if (JUNK_PLACEHOLDERS.has(lower) || JUNK_PLACEHOLDERS.has(compact)) {
    return { isSmash: true, isAmbiguous: false, reason: 'Contains placeholder or test text' };
  }

  // Repeated identical characters (4+ times in a row, e.g. "aaaaa", "jjjj")
  if (/(.)\1{3,}/.test(lower)) {
    return { isSmash: true, isAmbiguous: false, reason: 'Contains repeated identical characters' };
  }

  // Classic keyboard row sequences
  for (const run of KEYBOARD_RUNS) {
    if (compact.includes(run)) {
      return { isSmash: true, isAmbiguous: false, reason: 'Matches keyboard row key-mashing pattern' };
    }
  }

  const tokens = lower.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const letters = tok.replace(/[^a-z]/g, '');
    if (letters.length < 5) continue;

    const vowels = (letters.match(/[aeiou]/g) || []).length;
    const vowelRatio = vowels / letters.length;

    // Very low vowel ratio on >= 6-char alpha token (almost certainly random consonant mashing)
    if (letters.length >= 6 && vowelRatio < 0.16) {
      return {
        isSmash: true,
        isAmbiguous: false,
        reason: 'Unreadable random consonant sequence with almost no vowels',
      };
    }

    // 5+ consecutive consonants excluding common phonetic clusters
    const cleanedClusters = letters.replace(/(ksh|ch|sh|th|ph|gh|kh|dh|bh|ng|nd|nt|st|tr|pr|kr)/g, 'a');
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(cleanedClusters)) {
      return {
        isSmash: true,
        isAmbiguous: true,
        reason: 'Unusual unpronounceable consonant cluster (keyboard smash)',
      };
    }

    // Long unspaced token (>= 14 chars) with repeating 3-char trigrams (e.g. "dafuststidtsgigsigs")
    if (letters.length >= 14) {
      const trigrams = new Map<string, number>();
      let maxTri = 0;
      for (let i = 0; i <= letters.length - 3; i++) {
        const tri = letters.slice(i, i + 3);
        const count = (trigrams.get(tri) || 0) + 1;
        trigrams.set(tri, count);
        if (count > maxTri) maxTri = count;
      }
      if (maxTri >= 2) {
        return {
          isSmash: true,
          isAmbiguous: true,
          reason: 'Long unspaced random-looking string with repeating patterns',
        };
      }
      // Very long single-word name (> 16 chars) should be context-checked politely by AI
      if (letters.length >= 17) {
        return {
          isSmash: false,
          isAmbiguous: true,
          reason: 'Unusually long single-word input',
        };
      }
    }
  }

  return { isSmash: false, isAmbiguous: false, reason: '' };
}

function isSimpleValidPhone(rawPhone: string): { valid: boolean; severity: 'ok' | 'medium' | 'high'; reason: string } {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) {
    return { valid: false, severity: 'high', reason: 'Phone number length is incomplete or invalid' };
  }

  const local10 = digits.length >= 10 ? digits.slice(-10) : digits;
  // All identical digits (e.g. 9999999999, 0000000000)
  if (/^(\d)\1{6,}$/.test(digits) || /^(\d)\1{9}$/.test(local10)) {
    return { valid: false, severity: 'high', reason: 'All digits in phone number are identical (likely fake)' };
  }

  if (SEQUENTIAL_PHONES.has(local10) || SEQUENTIAL_PHONES.has(digits)) {
    return { valid: false, severity: 'high', reason: 'Sequential dummy phone number pattern detected' };
  }

  // Indian 10-digit numbers normally begin with 6, 7, 8, or 9
  if (local10.length === 10 && /^[0-5]/.test(local10)) {
    return {
      valid: false,
      severity: 'medium',
      reason: '10-digit phone number does not start with a standard mobile prefix (6–9)',
    };
  }

  return { valid: true, severity: 'ok', reason: '' };
}

function detectCategoryProductContradiction(product?: Product | null): string | null {
  if (!product) return null;
  const cat = (product.category || '').toLowerCase();
  const desc = `${product.name || ''} ${product.description || ''}`.toLowerCase();

  if (
    cat.includes('fidget') &&
    /\b(calculator|textbook|mathematics\s*tool|scientific\s*instrument|kitchen|appliance)\b/i.test(desc)
  ) {
    return `Selected category "${product.category}" appears inconsistent with product description ("${(product.description || '').slice(0, 80)}")`;
  }
  if (
    cat.includes('car') &&
    /\b(planter|flower\s*pot|calculator|dollhouse|kitchen\s*set)\b/i.test(desc)
  ) {
    return `Selected category "${product.category}" appears inconsistent with product description`;
  }
  return null;
}

/**
 * Tier-1 deterministic inspection of an order.
 * Fast, privacy-respecting, never judges ethnic names/spelling,
 * and avoids unnecessary Gemini calls for clearly valid routine orders.
 */
export function runDeterministicOrderInspection(
  order: Order,
  linkedProduct: Product | null | undefined,
  recentOrders: Order[] = []
): RuleInspectionOutput {
  const flaggedFields: OrderAiVerification['flaggedFields'] = [];
  const triggers: string[] = [];
  let needsAiContextCheck = false;
  let highScore = 0;
  let medScore = 0;

  // 1. Inspect Customer Name
  const name = (order.name || '').trim();
  const nameAlphaLen = name.replace(/[^a-z]/gi, '').length;
  if (!name || nameAlphaLen < 2) {
    flaggedFields.push({
      field: 'Customer Name',
      suspiciousValue: name || '(Empty)',
      reason: 'Customer name is missing or contains too few letters.',
      severity: 'critical',
    });
    highScore += 2;
    triggers.push('invalid_name');
  } else {
    const nameSmash = looksLikeKeyboardSmash(name);
    if (nameSmash.isSmash) {
      flaggedFields.push({
        field: 'Customer Name',
        suspiciousValue: name,
        reason: nameSmash.reason,
        severity: 'critical',
      });
      highScore += 2;
      needsAiContextCheck = needsAiContextCheck || nameSmash.isAmbiguous;
      triggers.push('gibberish_name');
    } else if (nameSmash.isAmbiguous) {
      flaggedFields.push({
        field: 'Customer Name',
        suspiciousValue: name,
        reason: 'Name pattern needs quick AI context verification.',
        severity: 'info',
      });
      medScore += 1;
      needsAiContextCheck = true;
      triggers.push('ambiguous_name');
    }
  }

  // 2. Inspect Contact & Address / School Info based on Mode
  if (order.mode === 'Adult') {
    const phoneCheck = isSimpleValidPhone(order.phone || '');
    if (!phoneCheck.valid) {
      flaggedFields.push({
        field: 'Contact Phone',
        suspiciousValue: order.phone || '(Empty)',
        reason: phoneCheck.reason,
        severity: phoneCheck.severity === 'high' ? 'critical' : 'warning',
      });
      if (phoneCheck.severity === 'high') highScore += 2;
      else medScore += 1;
      triggers.push('suspicious_phone');
    }

    const addr = (order.address || '').trim();
    const addrWords = addr.split(/\s+/).filter((w) => w.replace(/[^a-z0-9]/gi, '').length > 0);
    const addrSmash = looksLikeKeyboardSmash(addr);

    if (!addr || addr.length < 5) {
      flaggedFields.push({
        field: 'Delivery Address',
        suspiciousValue: addr || '(Empty)',
        reason: 'Delivery address is missing or too short to deliver.',
        severity: 'critical',
      });
      highScore += 2;
      triggers.push('empty_address');
    } else if (addrSmash.isSmash) {
      flaggedFields.push({
        field: 'Delivery Address',
        suspiciousValue: addr,
        reason: `Address appears meaningless or typed randomly (${addrSmash.reason}).`,
        severity: 'critical',
      });
      highScore += 2;
      needsAiContextCheck = needsAiContextCheck || addrSmash.isAmbiguous;
      triggers.push('gibberish_address');
    } else if (addrWords.length < 2 && addr.length < 15) {
      flaggedFields.push({
        field: 'Delivery Address',
        suspiciousValue: addr,
        reason: 'Delivery address may be incomplete (only one word provided).',
        severity: 'warning',
      });
      medScore += 1;
      needsAiContextCheck = true;
      triggers.push('short_address');
    }
  } else {
    // Child / BCS Student order
    const cls = (order.studentClass || '').trim();
    const sec = (order.section || '').trim();
    const secSmash = looksLikeKeyboardSmash(sec);
    if (!cls || !sec) {
      flaggedFields.push({
        field: 'Class / Section',
        suspiciousValue: `Class: ${cls || 'Missing'}, Section: ${sec || 'Missing'}`,
        reason: 'School class or section information is incomplete.',
        severity: 'critical',
      });
      highScore += 2;
      triggers.push('missing_class_section');
    } else if (secSmash.isSmash || /^[^a-z0-9]+$/i.test(sec)) {
      flaggedFields.push({
        field: 'Section',
        suspiciousValue: sec,
        reason: `Section value ("${sec}") looks unusual or random.`,
        severity: 'warning',
      });
      medScore += 1;
      triggers.push('unusual_section');
    }
  }

  // 3. Inspect Quantity (or unusually large quantity mentioned in note)
  const qty = Number(order.quantity || 1);
  if (qty > 10) {
    flaggedFields.push({
      field: 'Quantity',
      suspiciousValue: String(qty),
      reason: `Unusually high quantity (${qty}) — verify stock and customer intent before processing.`,
      severity: 'warning',
    });
    medScore += 1;
    needsAiContextCheck = true;
    triggers.push('high_quantity');
  } else if (qty >= 5) {
    flaggedFields.push({
      field: 'Quantity',
      suspiciousValue: `${qty} items`,
      reason: 'Maximum single-order quantity (5) requested — confirm bulk availability if needed.',
      severity: 'info',
    });
  }

  // Check if customer note requests unusually high quantity like "send 100"
  const note = (order.note || '').trim();
  if (note) {
    const bulkInNote = note.match(
      /\b(?:qty|quantity|pieces|pcs|units|send|want|need|order)\s*(?:of|:)?\s*(\d{2,4})\b|\b(\d{2,4})\s*(?:pieces|pcs|units|toys|items|copies)\b/i
    );
    const bulkNum = Number(bulkInNote?.[1] || bulkInNote?.[2] || 0);
    if (bulkNum >= 10) {
      flaggedFields.push({
        field: 'Special Instructions (Quantity)',
        suspiciousValue: note,
        reason: `Customer note mentions ${bulkNum} units while order quantity is ${qty} — needs owner confirmation (do not auto-reject).`,
        severity: 'warning',
      });
      medScore += 1;
      needsAiContextCheck = true;
      triggers.push('note_bulk_quantity');
    }

    const noteSmash = looksLikeKeyboardSmash(note);
    if (noteSmash.isSmash) {
      flaggedFields.push({
        field: 'Special Instructions',
        suspiciousValue: note,
        reason: `Special instructions appear nonsensical (${noteSmash.reason}).`,
        severity: 'warning',
      });
      medScore += 1;
      needsAiContextCheck = true;
      triggers.push('gibberish_note');
    } else if (
      /\b(cancel\s+this|fake\s+order|do\s+not\s+send|don'?t\s+deliver|wrong\s+product|send\s+iphone|send\s+laptop|different\s+toy|calculator\s+only)\b/i.test(
        note
      )
    ) {
      flaggedFields.push({
        field: 'Special Instructions',
        suspiciousValue: note,
        reason: 'Special instructions may contradict the ordered product or delivery intent.',
        severity: 'warning',
      });
      medScore += 1;
      needsAiContextCheck = true;
      triggers.push('contradictory_note');
    } else if (note.length >= 6) {
      // Non-trivial special request (e.g., "Make the dragon blue instead of red")
      // Send to AI context check so legitimate customization is clearly recognized and accepted!
      needsAiContextCheck = true;
      triggers.push('has_custom_note');
    }
  }

  // 4. Product Category vs Description Consistency Check
  const catMismatch = detectCategoryProductContradiction(linkedProduct);
  if (catMismatch) {
    flaggedFields.push({
      field: 'Product Category / Info',
      suspiciousValue: `${linkedProduct?.category || ''} · ${linkedProduct?.name || order.productName}`,
      reason: catMismatch,
      severity: 'warning',
    });
    medScore += 1;
    needsAiContextCheck = true;
    triggers.push('category_description_mismatch');
  }

  // 5. Repeated / Rapid Spam Order Pattern Check
  const nowMs = new Date(order.createdAt || Date.now()).getTime();
  const cleanPhone = (order.phone || '').replace(/\D/g, '').slice(-10);
  const cleanNameLower = name.toLowerCase();
  let sameCustomerRecentCount = 0;
  let identicalItemRecentCount = 0;

  for (const prev of recentOrders) {
    if (!prev || prev.id === order.id) continue;
    const prevMs = new Date(prev.createdAt || 0).getTime();
    const diffMinutes = Math.abs(nowMs - prevMs) / 60000;
    if (isNaN(diffMinutes) || diffMinutes > 10) continue;

    const sameCustomerId = Boolean(order.customerId && prev.customerId === order.customerId);
    const samePhone = Boolean(cleanPhone && cleanPhone.length >= 7 && (prev.phone || '').replace(/\D/g, '').endsWith(cleanPhone));
    const sameName = Boolean(cleanNameLower.length >= 3 && (prev.name || '').trim().toLowerCase() === cleanNameLower);

    if (sameCustomerId || samePhone || sameName) {
      sameCustomerRecentCount++;
      if (prev.productId === order.productId && diffMinutes <= 3) {
        identicalItemRecentCount++;
      }
    }
  }

  if (identicalItemRecentCount >= 1) {
    flaggedFields.push({
      field: 'Order Pattern',
      suspiciousValue: `${identicalItemRecentCount + 1} identical orders within 3 min`,
      reason: 'Duplicate or repeated order of the exact same item detected in a short period.',
      severity: 'critical',
    });
    highScore += 2;
    triggers.push('duplicate_order_burst');
  } else if (sameCustomerRecentCount >= 3) {
    flaggedFields.push({
      field: 'Order Pattern',
      suspiciousValue: `${sameCustomerRecentCount + 1} orders within 10 min`,
      reason: 'Multiple rapid orders detected from the same customer.',
      severity: 'warning',
    });
    medScore += 1;
    needsAiContextCheck = true;
    triggers.push('rapid_order_pattern');
  }

  // Compute Risk Level
  let riskLevel: OrderRiskLevel = 'LOW';
  if (highScore >= 2 || (highScore >= 1 && medScore >= 1)) {
    riskLevel = 'HIGH';
  } else if (medScore >= 1 || highScore >= 1) {
    riskLevel = 'MEDIUM';
  }

  const nowIso = new Date().toISOString();
  const confidence =
    riskLevel === 'HIGH'
      ? Math.min(97, 80 + highScore * 6)
      : riskLevel === 'MEDIUM'
      ? 72
      : 94;

  const recommendedAction: OrderAiVerification['recommendedAction'] =
    riskLevel === 'HIGH'
      ? 'Hold & Review'
      : riskLevel === 'MEDIUM'
      ? 'Verify Details'
      : 'Approve';

  const summaryReason =
    flaggedFields.length > 0
      ? flaggedFields.map((f) => f.reason).slice(0, 2).join(' ')
      : 'All submitted customer, contact, delivery, and product details appear consistent and normal.';

  const verification: OrderAiVerification = {
    riskLevel,
    decisionStatus: riskLevel === 'LOW' ? 'auto_approved' : 'pending_review',
    confidence,
    recommendedAction,
    summaryReason,
    flaggedFields,
    inspectedBy: 'rules',
    inspectedAt: nowIso,
    auditHistory: [
      {
        action: 'inspected',
        actor: 'Playnix AI',
        riskLevel,
        note: summaryReason,
        at: nowIso,
      },
    ],
  };

  return {
    verification,
    needsAiContextCheck,
    triggers,
  };
}
