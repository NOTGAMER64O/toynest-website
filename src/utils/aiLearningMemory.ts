import {
  type AiLearningFeatureKey,
  type AiOwnerLearningRecord,
  getAiLearningFeatureName,
} from '../defaultData';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'when', 'where',
  'which', 'would', 'could', 'should', 'about', 'into', 'your', 'you', 'are',
  'was', 'were', 'have', 'has', 'had', 'not', 'but', 'all', 'can', 'will',
  'its', 'how', 'why', 'who', 'any', 'our', 'out', 'too', 'very', 'just',
  'please', 'playnix', 'shop', 'product', 'item', 'toy', 'order', 'customer',
]);

export function tokenizeLearningText(text: string): string[] {
  const clean = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const tokens = clean
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return Array.from(new Set(tokens));
}

export function extractLearningKeywords(
  originalRequest: string,
  ownerCorrection: string,
  productName?: string
): string[] {
  const combined = `${productName || ''} ${originalRequest || ''} ${ownerCorrection || ''}`;
  return tokenizeLearningText(combined).slice(0, 20);
}

function getFeatureAffinityScore(
  recordFeature: AiLearningFeatureKey,
  targetFeature: AiLearningFeatureKey
): number {
  if (recordFeature === targetFeature) return 42;
  // Product Q&A reply drafting and Test Question sandbox share the same grounded Q&A prompt
  if (
    (recordFeature === 'product_question_reply' && targetFeature === 'test_question') ||
    (recordFeature === 'test_question' && targetFeature === 'product_question_reply')
  ) {
    return 36;
  }
  if (recordFeature === 'general') return 28;
  // Secondary relevance: category/product specs corrections help Q&A & Watchdog on product taxonomy
  if (
    (recordFeature === 'product_price_advisor' && targetFeature === 'ai_watchdog') ||
    (recordFeature === 'ai_watchdog' && targetFeature === 'product_price_advisor')
  ) {
    return 14;
  }
  return 0;
}

export interface LearningRetrievalQuery {
  featureKey: AiLearningFeatureKey;
  requestText?: string;
  productId?: string;
  productName?: string;
  maxResults?: number;
}

export function retrieveRelevantOwnerLearningRecords(
  records: AiOwnerLearningRecord[],
  query: LearningRetrievalQuery
): AiOwnerLearningRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];

  const maxResults = Math.max(1, Math.min(12, query.maxResults ?? 8));
  const queryTokens = new Set(
    tokenizeLearningText(`${query.requestText || ''} ${query.productName || ''}`)
  );
  const normTargetProdId = String(query.productId || '').trim();
  const normTargetProdName = String(query.productName || '').trim().toLowerCase();

  const scored = records
    .filter((rec) => rec && rec.ownerCorrection && rec.ownerCorrection.trim().length > 0)
    .map((rec) => {
      let score = getFeatureAffinityScore(rec.featureKey, query.featureKey);

      const recProdId = String(rec.productId || '').trim();
      const recProdName = String(rec.productName || '').trim().toLowerCase();

      if (normTargetProdId && recProdId && normTargetProdId === recProdId) {
        score += 48;
      } else if (normTargetProdName && recProdName && (recProdName === normTargetProdName || normTargetProdName.includes(recProdName) || recProdName.includes(normTargetProdName))) {
        score += 32;
      }

      if (queryTokens.size > 0) {
        const recTokens = new Set([
          ...(Array.isArray(rec.keywords) ? rec.keywords.map((k) => String(k).toLowerCase()) : []),
          ...tokenizeLearningText(`${rec.originalRequest} ${rec.ownerCorrection} ${rec.rejectedResponse}`),
        ]);
        let overlapCount = 0;
        queryTokens.forEach((tok) => {
          if (recTokens.has(tok)) overlapCount += 1;
        });
        score += Math.min(36, overlapCount * 9);
      }

      // Skip totally unrelated records from different AI subsystems unless product-matched or token-matched
      if (score <= 0) {
        return null;
      }

      const updatedMs = new Date(rec.updatedAt || rec.createdAt || 0).getTime() || 0;
      return { rec, score, updatedMs };
    })
    .filter((item): item is { rec: AiOwnerLearningRecord; score: number; updatedMs: number } => item !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.updatedMs - a.updatedMs;
    });

  return scored.slice(0, maxResults).map((item) => item.rec);
}

export interface CompactLearningPromptRecord {
  id: string;
  featureKey: AiLearningFeatureKey;
  featureName: string;
  originalRequest: string;
  rejectedResponse: string;
  ownerCorrection: string;
  productName?: string;
}

export function buildCompactLearningPayload(
  records: AiOwnerLearningRecord[],
  query: LearningRetrievalQuery
): CompactLearningPromptRecord[] {
  const relevant = retrieveRelevantOwnerLearningRecords(records, query);
  return relevant.map((r) => ({
    id: r.id,
    featureKey: r.featureKey,
    featureName: r.featureName || getAiLearningFeatureName(r.featureKey),
    originalRequest: String(r.originalRequest || '').slice(0, 600),
    rejectedResponse: String(r.rejectedResponse || '').slice(0, 600),
    ownerCorrection: String(r.ownerCorrection || '').slice(0, 1200),
    ...(r.productName ? { productName: String(r.productName).slice(0, 120) } : {}),
  }));
}
