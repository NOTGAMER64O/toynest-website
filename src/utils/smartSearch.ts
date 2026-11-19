import type { Product } from '../defaultData';

export type PriceSortOrder = 'asc' | 'desc' | null;
export type RelativePriceIntent = 'low' | 'lowest' | 'high' | 'highest' | null;

export interface ParsedPriceConstraint {
  exactPrice?: number;
  minPrice?: number;
  exclusiveMin?: boolean;
  maxPrice?: number;
  exclusiveMax?: boolean;
  priceSort: PriceSortOrder;
  relativeIntent: RelativePriceIntent;
  hasExplicitNumericPrice: boolean;
  isPurePriceQuery: boolean;
  hadGenericStoreTerm: boolean;
  hasAmbiguousBareNumber: boolean;
  ambiguousBareNumber?: number;
  residualTerms: string[];
  matchedTermsSummary: string;
  priceDescription: string;
}

export interface SmartSearchMatch {
  product: Product;
  score: number;
  effectivePrice: number;
  matchBadge?: string;
}

export interface SmartSearchResult {
  matches: SmartSearchMatch[];
  products: Product[];
  parsed: ParsedPriceConstraint;
  priceEligibleCatalogCount: number;
  shouldCallAi: boolean;
  intentSummary: string;
  emptyReason: string;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'by',
  'from',
  'as',
  'is',
  'are',
  'be',
  'any',
  'some',
  'all',
  'me',
  'my',
  'i',
  'we',
  'you',
  'want',
  'need',
  'looking',
  'look',
  'search',
  'find',
  'show',
  'give',
  'get',
  'please',
  'pls',
  'buy',
  'order',
  'can',
  'have',
  'available',
  'good',
  'best',
  'nice',
  'cool',
  'top',
  'price',
  'priced',
  'cost',
  'costing',
  'rate',
  'worth',
  'rs',
  'rupee',
  'rupees',
  'inr',
  'only',
  'around',
  'range',
  'something',
  'anything',
]);

const GENERIC_STORE_NOUNS = new Set([
  'toy',
  'toys',
  'khilona',
  'khilone',
  'product',
  'products',
  'item',
  'items',
  'thing',
  'things',
  'stuff',
  'one',
  'ones',
]);

// Curated bidirectional synonym clusters tailored for Playnix Shop catalog & Indian shoppers
const SYNONYM_CLUSTERS: string[][] = [
  [
    'fidget',
    'fidgets',
    'spinner',
    'spinners',
    'infinity',
    'cube',
    'clicker',
    'popit',
    'sensory',
    'stress',
    'relief',
    'tactile',
    'gyro',
    'articulated',
  ],
  [
    'car',
    'cars',
    'vehicle',
    'vehicles',
    'racing',
    'race',
    'supercar',
    'gadi',
    'gaadi',
    'ferrari',
    'lamborghini',
    'lambo',
    'porsche',
    'nissan',
    'bmw',
    'bugatti',
    'mustang',
    'mclaren',
    'koenigsegg',
    'supra',
    'f1',
    'formula',
    'wheel',
    'wheels',
    'auto',
    'truck',
    'jeep',
    'diecast',
  ],
  [
    'model',
    'models',
    'kit',
    'miniature',
    'scale',
    'replica',
    'collectible',
  ],
  [
    'figure',
    'figures',
    'action',
    'figurine',
    'hero',
    'superhero',
    'character',
    'characters',
    'spiderman',
    'spider',
    'noir',
    'batman',
    'ironman',
    'marvel',
    'avenger',
    'dc',
    'statue',
    'collectible',
  ],
  [
    'decorative',
    'decor',
    'decoration',
    'decorations',
    'showpiece',
    'ornament',
    'desk',
    'organizer',
    'stand',
    'holder',
    'planter',
    'pot',
    'flower',
    'vase',
    'home',
    'garden',
    'shelf',
  ],
  [
    'educational',
    'learn',
    'learning',
    'study',
    'stem',
    'science',
    'puzzle',
    'puzzles',
    'brain',
    'logic',
    'math',
    'building',
    'blocks',
  ],
  [
    'ship',
    'boat',
    'battleship',
    'roman',
    'warship',
    'navy',
  ],
  [
    'plane',
    'jet',
    'aircraft',
    'airplane',
    'aeroplane',
    'fighter',
    'rocket',
    'space',
  ],
  [
    'dinosaur',
    'dino',
    'dragon',
    'animal',
    'animals',
    'creature',
    'pet',
  ],
];

const SYNONYM_LOOKUP = new Map<string, string[]>();
for (const cluster of SYNONYM_CLUSTERS) {
  for (const term of cluster) {
    const existing = SYNONYM_LOOKUP.get(term) || [];
    for (const peer of cluster) {
      if (peer !== term && !existing.includes(peer)) {
        existing.push(peer);
      }
    }
    SYNONYM_LOOKUP.set(term, existing);
  }
}

// Asymmetric domain expansions: searching "model" matches cars & figures too,
// without causing "car" to falsely match unrelated ship kits or superhero figures.
const ONE_WAY_SYNONYMS: Record<string, string[]> = {
  model: ['car', 'cars', 'figure', 'figures', 'figurine'],
  models: ['car', 'cars', 'figure', 'figures', 'figurine'],
};
for (const [key, extras] of Object.entries(ONE_WAY_SYNONYMS)) {
  const existing = SYNONYM_LOOKUP.get(key) || [];
  for (const extra of extras) {
    if (!existing.includes(extra)) existing.push(extra);
  }
  SYNONYM_LOOKUP.set(key, existing);
}

export function singularizeToken(token: string): string {
  const t = token.toLowerCase().trim();
  if (t.length <= 3) return t;
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith('boxes')) return t.slice(0, -2);
  if (t.endsWith('ches') || t.endsWith('shes') || t.endsWith('sses') || t.endsWith('xes')) {
    return t.slice(0, -2);
  }
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && t.length > 3) {
    return t.slice(0, -1);
  }
  return t;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;
  if (Math.abs(alen - blen) > 3) return Math.abs(alen - blen);

  let prev = new Array<number>(blen + 1);
  let curr = new Array<number>(blen + 1);
  for (let j = 0; j <= blen; j++) prev[j] = j;

  for (let i = 1; i <= alen; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= blen; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      // Damerau adjacent transposition check
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev[j - 2] ? prev[j - 2] + 1 : curr[j]);
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[blen];
}

function isFuzzyWordMatch(queryToken: string, targetWord: string): boolean {
  if (queryToken.length < 4 || targetWord.length < 3) return false;
  if (targetWord.startsWith(queryToken)) return true;

  const dist = levenshteinDistance(queryToken, targetWord);
  if (queryToken.length <= 5) {
    if (dist <= 1) return true;
    // Allow distance 2 for length 5 if first letter matches & target len >= 5 (e.g. "fijet" -> "fidget")
    if (queryToken.length === 5 && targetWord.length >= 5 && queryToken[0] === targetWord[0] && dist <= 2) {
      return true;
    }
    return false;
  }

  // Length >= 6: allow edit distance 1 anywhere, or distance 2 if same starting char
  if (dist <= 1) return true;
  if (dist <= 2 && queryToken[0] === targetWord[0]) return true;
  return false;
}

function tokenizeFieldText(text: string): string[] {
  if (!text) return [];
  const rawParts = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const tokens = new Set<string>();
  for (const part of rawParts) {
    tokens.add(part);
    const sing = singularizeToken(part);
    if (sing !== part) tokens.add(sing);
  }
  return Array.from(tokens);
}

/**
 * Parses natural-language price expressions, ranges, exact prices, relative price intents,
 * and remaining product search keywords cleanly and deterministically.
 */
export function parseSearchQuery(rawQuery: string): ParsedPriceConstraint {
  const original = rawQuery.trim();
  let working = original.toLowerCase();

  let exactPrice: number | undefined;
  let minPrice: number | undefined;
  let exclusiveMin = false;
  let maxPrice: number | undefined;
  let exclusiveMax = false;
  let priceSort: PriceSortOrder = null;
  let relativeIntent: RelativePriceIntent = null;
  let hasAmbiguousBareNumber = false;
  let ambiguousBareNumber: number | undefined;

  // Preserve scale notations like 1:24 or 1:64 from being parsed as prices
  working = working.replace(/\b1\s*:\s*\d+\b/g, (m) => m.replace(':', 'scale'));

  // 1. Standalone exact price query (e.g. "20", "₹20", "rs 20", "20 rs", "20 rupees")
  const standalonePriceMatch = working.match(
    /^\s*(?:priced?\s+at|price\s+(?:is|of)?|for|at)?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr|only)?\s*$/i
  );
  if (standalonePriceMatch) {
    const val = Number(standalonePriceMatch[1]);
    if (Number.isFinite(val) && val > 0) {
      exactPrice = val;
      working = '';
    }
  }

  // 2. Between X and Y / from X to Y / X to Y / X - Y
  if (exactPrice === undefined) {
    const betweenExplicitMatch = working.match(
      /\b(?:between|betwen|from)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr)?\s*(?:and|to|-|–|—)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr|only)?\b/i
    );
    const dashOrToRangeMatch =
      !betweenExplicitMatch &&
      working.match(
        /(?:^|\s)(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr)?\s*(?:to|-|–|—)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr|only)?(?:\s|$)/i
      );

    const rangeMatch = betweenExplicitMatch || dashOrToRangeMatch;
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        minPrice = Math.min(a, b);
        maxPrice = Math.max(a, b);
        exclusiveMin = false;
        exclusiveMax = false;
        working = working.replace(rangeMatch[0], ' ');
      }
    }
  }

  // 3. Upper bound ("under 50", "below 50", "less than 50", "upto 50", "within 50", "<= 50", "< 50")
  if (exactPrice === undefined) {
    const upperKeywordMatch = working.match(
      /\b(?:under|undre|below|belw|bellow|less\s+than|lesser\s+than|cheaper\s+than|lower\s+than|upto|up\s+to|within|max|maximum|not\s+more\s+than|at\s*most)\s*(?:of|than)?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr|only)?\b/i
    );
    const upperSymbolMatch =
      !upperKeywordMatch &&
      working.match(/(?:<=|<)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr)?/i);

    const upperMatch = upperKeywordMatch || upperSymbolMatch;
    if (upperMatch) {
      const val = Number(upperMatch[1]);
      if (Number.isFinite(val) && val > 0) {
        maxPrice = val;
        exclusiveMax = Boolean(upperSymbolMatch && upperSymbolMatch[0].trim().startsWith('<') && !upperSymbolMatch[0].includes('<='));
        working = working.replace(upperMatch[0], ' ');
      }
    }
  }

  // 4. Lower bound ("above 100", "over 100", "more than 100", "> 100" vs "at least 100", "min 100", ">= 100")
  if (exactPrice === undefined) {
    const strictLowerMatch = working.match(
      /\b(?:above|abov|over|more\s+than|greater\s+than|higher\s+than|costlier\s+than|pricier\s+than)\s*(?:of|than)?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr|only)?\b/i
    );
    const inclusiveLowerMatch =
      !strictLowerMatch &&
      working.match(
        /\b(?:at\s*least|atleast|min|minimum|starting\s+(?:at|from)?|from)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr|only)?\b/i
      );
    const plusOrSuffixLowerMatch =
      !strictLowerMatch &&
      !inclusiveLowerMatch &&
      working.match(
        /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:\+|\s+(?:and|or)\s+(?:above|more|up))\b/i
      );
    const lowerSymbolMatch =
      !strictLowerMatch &&
      !inclusiveLowerMatch &&
      !plusOrSuffixLowerMatch &&
      working.match(/(?:>=|>)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr)?/i);

    const lowerMatch = strictLowerMatch || inclusiveLowerMatch || plusOrSuffixLowerMatch || lowerSymbolMatch;
    if (lowerMatch) {
      const val = Number(lowerMatch[1]);
      if (Number.isFinite(val) && val >= 0) {
        minPrice = val;
        exclusiveMin = Boolean(
          strictLowerMatch ||
            (lowerSymbolMatch && lowerSymbolMatch[0].trim().startsWith('>') && !lowerSymbolMatch[0].includes('>=')) ||
            (plusOrSuffixLowerMatch && /\band\s+above\b/i.test(plusOrSuffixLowerMatch[0]))
        );
        working = working.replace(lowerMatch[0], ' ');
      }
    }
  }

  // 5. Currency-tagged or explicit price phrase inside multi-word query (e.g. "fidget ₹49", "car rs 79", "priced at 50")
  // Guard against age/quantity phrases like "for 7 year old" or "for 2 kids"
  if (exactPrice === undefined && minPrice === undefined && maxPrice === undefined) {
    const unitSafeWorking = working.replace(
      /\b\d+(?:\.\d+)?\s*(?:year|yr|yrs|years|month|months|yo|kid|kids|boy|boys|girl|girls|pcs|piece|pieces|pack|cm|mm|inch|inches)\b/gi,
      ' '
    );
    const taggedExact = unitSafeWorking.match(
      /(?:\b(?:priced?\s+at|price\s+(?:is|of)?|costing|exact(?:ly)?|equals?)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr|only)?\b|\b(?:for|at)\s*(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\b|(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|inr)\b)/i
    );
    if (taggedExact) {
      const rawNum = taggedExact[1] || taggedExact[2] || taggedExact[3] || taggedExact[4];
      const val = Number(rawNum);
      if (Number.isFinite(val) && val > 0) {
        exactPrice = val;
        working = working.replace(taggedExact[0], ' ');
      }
    }
  }

  // 6. Relative price phrases ("cheap", "affordable", "lowest price", "expensive", "highest price")
  const lowestRegex =
    /\b(?:lowest\s*price|cheapest|least\s*price|low\s*to\s*high|minimum\s*price|min\s*price)\b/i;
  const highestRegex =
    /\b(?:highest\s*price|most\s*expensive|costliest|priciest|high\s*to\s*low|maximum\s*price|max\s*price)\b/i;
  const lowRegex =
    /\b(?:cheap|cheep|cheaper|affordable|afordable|budget|budget[-\s]*friendly|pocket[-\s]*friendly|inexpensive|low\s*cost|low\s*price|economical|value\s+for\s+money)\b/i;
  const highRegex =
    /\b(?:expensive|costly|premium|luxury|high\s*price|high\s*end)\b/i;

  if (lowestRegex.test(working)) {
    relativeIntent = 'lowest';
    priceSort = 'asc';
    working = working.replace(lowestRegex, ' ');
  } else if (highestRegex.test(working)) {
    relativeIntent = 'highest';
    priceSort = 'desc';
    working = working.replace(highestRegex, ' ');
  } else if (lowRegex.test(working)) {
    relativeIntent = 'low';
    priceSort = 'asc';
    working = working.replace(lowRegex, ' ');
  } else if (highRegex.test(working)) {
    relativeIntent = 'high';
    priceSort = 'desc';
    working = working.replace(highRegex, ' ');
  }

  // Extract remaining meaningful tokens
  const cleanWords = working
    .replace(/₹/g, ' ')
    .split(/[^a-z0-9]+/i)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

  let hadGenericStoreTerm = false;
  const residualTerms: string[] = [];

  for (const w of cleanWords) {
    if (STOP_WORDS.has(w)) continue;
    if (GENERIC_STORE_NOUNS.has(w)) {
      hadGenericStoreTerm = true;
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(w) && exactPrice === undefined && minPrice === undefined && maxPrice === undefined) {
      // Bare number combined with words (e.g. "car 79" vs "porsche 911")
      const numVal = Number(w);
      if (Number.isFinite(numVal) && numVal > 0) {
        hasAmbiguousBareNumber = true;
        ambiguousBareNumber = numVal;
      }
    }
    if (!residualTerms.includes(w)) {
      residualTerms.push(w);
    }
  }

  const hasExplicitNumericPrice =
    exactPrice !== undefined || minPrice !== undefined || maxPrice !== undefined;

  const isPurePriceQuery =
    (hasExplicitNumericPrice || relativeIntent !== null) && residualTerms.length === 0;

  let priceDescription = '';
  if (exactPrice !== undefined) {
    priceDescription = `priced at ₹${exactPrice}`;
  } else if (minPrice !== undefined && maxPrice !== undefined) {
    priceDescription = `between ₹${minPrice} and ₹${maxPrice}`;
  } else if (maxPrice !== undefined) {
    priceDescription = exclusiveMax ? `strictly below ₹${maxPrice}` : `₹${maxPrice} or less`;
  } else if (minPrice !== undefined) {
    priceDescription = exclusiveMin ? `above ₹${minPrice}` : `₹${minPrice} or more`;
  } else if (relativeIntent === 'lowest') {
    priceDescription = 'sorted lowest price first';
  } else if (relativeIntent === 'low') {
    priceDescription = 'affordable / budget-friendly';
  } else if (relativeIntent === 'highest') {
    priceDescription = 'sorted highest price first';
  } else if (relativeIntent === 'high') {
    priceDescription = 'premium / higher-priced';
  }

  const matchedTermsSummary = residualTerms.join(' ');

  return {
    exactPrice,
    minPrice,
    exclusiveMin,
    maxPrice,
    exclusiveMax,
    priceSort,
    relativeIntent,
    hasExplicitNumericPrice,
    isPurePriceQuery,
    hadGenericStoreTerm,
    hasAmbiguousBareNumber,
    ambiguousBareNumber,
    residualTerms,
    matchedTermsSummary,
    priceDescription,
  };
}

export function doesPriceSatisfyConstraint(
  originalPrice: number,
  effectivePrice: number,
  constraint: Pick<
    ParsedPriceConstraint,
    'exactPrice' | 'minPrice' | 'exclusiveMin' | 'maxPrice' | 'exclusiveMax'
  >
): boolean {
  const eff = Number(effectivePrice);
  const orig = Number(originalPrice);
  if (!Number.isFinite(eff) && !Number.isFinite(orig)) return false;

  if (constraint.exactPrice !== undefined) {
    const target = constraint.exactPrice;
    return Math.abs(eff - target) < 0.01 || Math.abs(orig - target) < 0.01;
  }

  const priceToCheck = Number.isFinite(eff) ? eff : orig;

  if (constraint.minPrice !== undefined) {
    if (constraint.exclusiveMin) {
      if (!(priceToCheck > constraint.minPrice)) return false;
    } else {
      if (!(priceToCheck >= constraint.minPrice)) return false;
    }
  }

  if (constraint.maxPrice !== undefined) {
    if (constraint.exclusiveMax) {
      if (!(priceToCheck < constraint.maxPrice)) return false;
    } else {
      if (!(priceToCheck <= constraint.maxPrice)) return false;
    }
  }

  return true;
}

function getTokenSynonyms(token: string): string[] {
  const lower = token.toLowerCase();
  const singular = singularizeToken(lower);
  const list = new Set<string>();
  for (const candidate of [lower, singular]) {
    const found = SYNONYM_LOOKUP.get(candidate);
    if (found) {
      for (const s of found) list.add(s);
    }
  }
  return Array.from(list);
}

function scoreTokenAgainstProduct(
  token: string,
  product: Product,
  fields: {
    nameLower: string;
    categoryLower: string;
    descLower: string;
    highlightsLower: string;
    nameWords: string[];
    categoryWords: string[];
    highlightWords: string[];
    descWords: string[];
  }
): number {
  const singular = singularizeToken(token);
  const variants = singular !== token ? [token, singular] : [token];

  let bestScore = 0;

  // 1. Direct & partial word matches across name, category, highlights, description
  // Short tokens (<= 3 chars, like "car" or "pot") require whole-word match so "car" never matches "card" or "roman".
  const matchesField = (fieldLower: string, fieldWords: string[], v: string): 'exact' | 'prefix' | 'sub' | null => {
    if (fieldWords.includes(v)) return 'exact';
    if (v.length >= 3 && fieldWords.some((w) => w.startsWith(v))) {
      // For 3-char tokens like "car", avoid matching unrelated words like "card" -> allow prefix starting at len >= 4
      if (v.length >= 4) return 'prefix';
    }
    if (v.length >= 4 && fieldLower.includes(v)) return 'sub';
    return null;
  };

  for (const v of variants) {
    const nameHit = matchesField(fields.nameLower, fields.nameWords, v);
    if (nameHit === 'exact') bestScore = Math.max(bestScore, 40);
    else if (nameHit === 'prefix') bestScore = Math.max(bestScore, 30);
    else if (nameHit === 'sub') bestScore = Math.max(bestScore, 24);

    const catHit = matchesField(fields.categoryLower, fields.categoryWords, v);
    if (catHit === 'exact') bestScore = Math.max(bestScore, 34);
    else if (catHit === 'prefix') bestScore = Math.max(bestScore, 26);
    else if (catHit === 'sub') bestScore = Math.max(bestScore, 20);

    const hlHit = matchesField(fields.highlightsLower, fields.highlightWords, v);
    if (hlHit) bestScore = Math.max(bestScore, hlHit === 'exact' ? 24 : 18);

    const descHit = matchesField(fields.descLower, fields.descWords, v);
    if (descHit) bestScore = Math.max(bestScore, descHit === 'exact' ? 18 : 13);
  }

  if (bestScore > 0) return bestScore;

  // 2. Fuzzy typo matching across indexed words
  for (const v of variants) {
    if (fields.nameWords.some((w) => isFuzzyWordMatch(v, w))) {
      bestScore = Math.max(bestScore, 20);
    }
    if (fields.categoryWords.some((w) => isFuzzyWordMatch(v, w))) {
      bestScore = Math.max(bestScore, 18);
    }
    if (fields.highlightWords.some((w) => isFuzzyWordMatch(v, w))) {
      bestScore = Math.max(bestScore, 14);
    }
    if (fields.descWords.some((w) => isFuzzyWordMatch(v, w))) {
      bestScore = Math.max(bestScore, 10);
    }
  }

  if (bestScore > 0) return bestScore;

  // 3. Synonym & related product term matching
  const synonyms = getTokenSynonyms(token);
  if (synonyms.length > 0) {
    const combinedLower = `${fields.nameLower} ${fields.categoryLower} ${fields.highlightsLower} ${fields.descLower}`;
    for (const syn of synonyms) {
      if (syn.includes(' ')) {
        if (combinedLower.includes(syn)) {
          bestScore = Math.max(bestScore, 14);
        }
      } else {
        if (fields.categoryWords.includes(syn) || fields.categoryLower.includes(syn)) {
          bestScore = Math.max(bestScore, 16);
        } else if (fields.nameWords.includes(syn) || fields.nameLower.includes(syn)) {
          bestScore = Math.max(bestScore, 15);
        } else if (fields.highlightWords.includes(syn)) {
          bestScore = Math.max(bestScore, 12);
        } else if (fields.descWords.includes(syn)) {
          bestScore = Math.max(bestScore, 9);
        }
      }
    }
  }

  // Also check if category is Toys and Figures when query has "toy" / "figure"
  if (bestScore === 0 && singular === 'toy' && product.category) {
    return 5;
  }

  return bestScore;
}

/**
 * Runs fast, deterministic smart product search combining:
 * - Numerical price filters (exact, under, above, between)
 * - Relative price intents (cheap, affordable, lowest price, expensive, highest price)
 * - Partial & fuzzy spelling correction
 * - Curated toy-domain synonyms
 */
export function smartSearchProducts(
  products: Product[],
  rawQuery: string,
  getEffectivePrice?: (product: Product) => number
): SmartSearchResult {
  const availableProducts = products.filter((p) => p && p.available !== false);
  const cleanQuery = rawQuery.trim();
  const parsed = parseSearchQuery(cleanQuery);

  const resolvePrice = (p: Product) =>
    getEffectivePrice ? getEffectivePrice(p) : Number(p.price) || 0;

  if (!cleanQuery) {
    return {
      matches: [],
      products: [],
      parsed,
      priceEligibleCatalogCount: availableProducts.length,
      shouldCallAi: false,
      intentSummary: '',
      emptyReason: '',
    };
  }

  // Step 1: Deterministic price filtering across catalog
  const priceEligible = availableProducts.filter((product) => {
    const eff = resolvePrice(product);
    if (parsed.hasExplicitNumericPrice) {
      return doesPriceSatisfyConstraint(product.price, eff, parsed);
    }
    return true;
  });

  const fullResidualPhrase = parsed.residualTerms.join(' ');
  const scoredMatches: SmartSearchMatch[] = [];

  for (const product of priceEligible) {
    const effPrice = resolvePrice(product);
    const nameLower = (product.name || '').toLowerCase();
    const categoryLower = (product.category || '').toLowerCase();
    const descLower = (product.description || '').toLowerCase();
    const highlightsLower = Array.isArray(product.highlights)
      ? product.highlights.join(' ').toLowerCase()
      : '';

    // Case A: Pure price or generic store query ("20", "under 50", "between 20 and 50", "toys between 20 and 50", "cheap", "toys")
    if (parsed.residualTerms.length === 0) {
      let score = 50;
      if (parsed.exactPrice !== undefined) {
        // Exact effective price beats MRP-only match
        score += Math.abs(effPrice - parsed.exactPrice) < 0.01 ? 40 : 20;
      }
      if (parsed.hadGenericStoreTerm && categoryLower.includes('toy')) {
        score += 10;
      }
      scoredMatches.push({
        product,
        score,
        effectivePrice: effPrice,
        matchBadge: parsed.exactPrice !== undefined
          ? `Priced at ₹${effPrice}`
          : parsed.priceDescription
          ? `Fits ${parsed.priceDescription}`
          : undefined,
      });
      continue;
    }

    // Case B: Product text/fuzzy/synonym matching (plus optional ambiguous bare number handling)
    const fields = {
      nameLower,
      categoryLower,
      descLower,
      highlightsLower,
      nameWords: tokenizeFieldText(nameLower),
      categoryWords: tokenizeFieldText(categoryLower),
      highlightWords: tokenizeFieldText(highlightsLower),
      descWords: tokenizeFieldText(descLower),
    };

    let totalTokenScore = 0;
    let matchedAllTokens = true;
    let bareNumberMatchedAsPrice = false;

    for (const token of parsed.residualTerms) {
      let tokenScore = scoreTokenAgainstProduct(token, product, fields);

      // Handle queries like "car 79" where 79 could be either name token OR exact product price
      if (
        tokenScore === 0 &&
        parsed.hasAmbiguousBareNumber &&
        parsed.ambiguousBareNumber !== undefined &&
        token === String(parsed.ambiguousBareNumber)
      ) {
        const targetNum = parsed.ambiguousBareNumber;
        if (Math.abs(effPrice - targetNum) < 0.01 || Math.abs(product.price - targetNum) < 0.01) {
          tokenScore = 30;
          bareNumberMatchedAsPrice = true;
        }
      }

      if (tokenScore === 0) {
        matchedAllTokens = false;
        break;
      }
      totalTokenScore += tokenScore;
    }

    if (!matchedAllTokens) continue;

    // Bonus for full-phrase match & exact name/category starts
    let finalScore = totalTokenScore;
    if (fullResidualPhrase) {
      if (nameLower === fullResidualPhrase) finalScore += 140;
      else if (nameLower.startsWith(fullResidualPhrase)) finalScore += 80;
      else if (nameLower.includes(fullResidualPhrase)) finalScore += 55;

      if (categoryLower === fullResidualPhrase) finalScore += 60;
      else if (categoryLower.includes(fullResidualPhrase)) finalScore += 35;

      if (highlightsLower.includes(fullResidualPhrase)) finalScore += 20;
      if (descLower.includes(fullResidualPhrase)) finalScore += 15;
    }

    scoredMatches.push({
      product,
      score: finalScore,
      effectivePrice: effPrice,
      matchBadge: bareNumberMatchedAsPrice
        ? `Priced at ₹${effPrice}`
        : parsed.priceDescription
        ? `Fits ${parsed.priceDescription}`
        : undefined,
    });
  }

  // Step 2: Apply relative price band filtering & sorting ("cheap" / "affordable" / "expensive" / "lowest" / "highest")
  let finalMatches = scoredMatches;

  if (finalMatches.length > 0 && parsed.relativeIntent && !parsed.hasExplicitNumericPrice) {
    const prices = finalMatches.map((m) => m.effectivePrice).sort((a, b) => a - b);
    const minP = prices[0];
    const maxP = prices[prices.length - 1];

    if (parsed.relativeIntent === 'low' && finalMatches.length >= 4 && maxP > minP * 1.4) {
      // Keep the affordable/budget segment of matched products (up to 65th percentile or 2x cheapest)
      const p65 = prices[Math.min(prices.length - 1, Math.floor(prices.length * 0.65))];
      const budgetCap = Math.max(p65, minP * 1.75);
      const filteredLow = finalMatches.filter((m) => m.effectivePrice <= budgetCap);
      if (filteredLow.length > 0) {
        finalMatches = filteredLow;
      }
    } else if (parsed.relativeIntent === 'high' && finalMatches.length >= 4 && maxP > minP * 1.4) {
      // Keep the premium/higher-priced segment of matched products
      const p40 = prices[Math.floor(prices.length * 0.4)];
      const highFloor = Math.max(p40, maxP * 0.45);
      const filteredHigh = finalMatches.filter((m) => m.effectivePrice >= highFloor);
      if (filteredHigh.length > 0) {
        finalMatches = filteredHigh;
      }
    }
  }

  // Step 3: Sort matches deterministically
  finalMatches.sort((a, b) => {
    if (parsed.priceSort === 'asc') {
      if (a.effectivePrice !== b.effectivePrice) return a.effectivePrice - b.effectivePrice;
      if (b.score !== a.score) return b.score - a.score;
      return (a.product.name || '').localeCompare(b.product.name || '');
    }
    if (parsed.priceSort === 'desc') {
      if (b.effectivePrice !== a.effectivePrice) return b.effectivePrice - a.effectivePrice;
      if (b.score !== a.score) return b.score - a.score;
      return (a.product.name || '').localeCompare(b.product.name || '');
    }
    if (parsed.hasExplicitNumericPrice && parsed.residualTerms.length === 0) {
      // For pure "under 50" / "between 20 and 50" / "above 100", sort lowest price first cleanly
      if (a.effectivePrice !== b.effectivePrice) return a.effectivePrice - b.effectivePrice;
      return (a.product.name || '').localeCompare(b.product.name || '');
    }
    if (b.score !== a.score) return b.score - a.score;
    return (a.product.name || '').localeCompare(b.product.name || '');
  });

  // Step 4: Determine whether Gemini AI needs to be called
  // Rule: Never unnecessarily call Gemini for exact price searches or when deterministic smart search cleanly resolves the query!
  const isPriceAndGenericOnly =
    parsed.isPurePriceQuery ||
    (parsed.hadGenericStoreTerm && parsed.residualTerms.length === 0);

  const shouldCallAi =
    !isPriceAndGenericOnly &&
    priceEligible.length > 0 &&
    finalMatches.length === 0 &&
    cleanQuery.length >= 4 &&
    parsed.residualTerms.length > 0;

  // Build transparent customer-facing summary when smart parsing applied
  let intentSummary = '';
  if (parsed.hasExplicitNumericPrice || parsed.relativeIntent) {
    const subject =
      parsed.residualTerms.length > 0
        ? `"${parsed.matchedTermsSummary}" products`
        : parsed.hadGenericStoreTerm
        ? 'Toys'
        : 'Products';
    intentSummary = `${subject} ${parsed.priceDescription}`.trim();
  }

  let emptyReason = '';
  if (finalMatches.length === 0) {
    if (parsed.hasExplicitNumericPrice && priceEligible.length === 0) {
      emptyReason = `No available products are currently ${parsed.priceDescription}.`;
    } else if (parsed.hasExplicitNumericPrice && parsed.residualTerms.length > 0) {
      emptyReason = `No "${parsed.matchedTermsSummary}" products found ${parsed.priceDescription}.`;
    } else {
      emptyReason = `We couldn't find any products matching "${cleanQuery}".`;
    }
  }

  return {
    matches: finalMatches,
    products: finalMatches.map((m) => m.product),
    parsed,
    priceEligibleCatalogCount: priceEligible.length,
    shouldCallAi,
    intentSummary,
    emptyReason,
  };
}
