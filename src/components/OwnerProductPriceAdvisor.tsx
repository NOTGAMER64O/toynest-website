import React, { useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { Product } from '../defaultData';

export interface PriceAdvisorQuestion {
  id: string;
  question: string;
  reason?: string;
  placeholder?: string;
  quickOptions: string[];
}

export interface PriceAdvisorWebSource {
  title: string;
  uri: string;
}

interface OwnerProductPriceAdvisorProps {
  pin: string;
  productName: string;
  category: string;
  description: string;
  catalogProducts: Product[];
  productImageFiles: File[];
  existingImageUrls?: string[];
  onApplyPrice: (price: number) => void;
  onSetCategory?: (categoryText: string) => void;
  onSetDescription?: (descriptionText: string) => void;
  onSetHighlights?: (highlights: string[]) => void;
}

async function fileToSmallJpegDataUrl(file: File, maxDim = 340): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.62));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = typeof reader.result === 'string' ? reader.result : '';
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });
}

export const OwnerProductPriceAdvisor: React.FC<OwnerProductPriceAdvisorProps> = ({
  pin,
  productName,
  category,
  description,
  catalogProducts,
  productImageFiles,
  existingImageUrls = [],
  onApplyPrice,
  onSetCategory,
  onSetDescription,
  onSetHighlights,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastSearchedName, setLastSearchedName] = useState('');

  const [stage, setStage] = useState<'idle' | 'questions' | 'price_ready'>('idle');
  const [imageReviewSummary, setImageReviewSummary] = useState('');
  const [reviewedPhotosCount, setReviewedPhotosCount] = useState(0);
  const [marketFindings, setMarketFindings] = useState('');
  const [preliminaryRange, setPreliminaryRange] = useState<{ min: number; max: number } | null>(null);
  const [questions, setQuestions] = useState<PriceAdvisorQuestion[]>([]);
  const [answersMap, setAnswersMap] = useState<Record<string, string>>({});

  const [recommendedPrice, setRecommendedPrice] = useState<number | null>(null);
  const [priceRange, setPriceRange] = useState<{ min: number; max: number } | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [sizeAndSpecSummary, setSizeAndSpecSummary] = useState('');
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>([]);
  const [categoryNeedsClarification, setCategoryNeedsClarification] = useState(false);
  const [categoryReasoning, setCategoryReasoning] = useState('');
  const [suggestedDesc, setSuggestedDesc] = useState('');
  const [suggestedHighlights, setSuggestedHighlights] = useState<string[]>([]);
  const [webSources, setWebSources] = useState<PriceAdvisorWebSource[]>([]);
  const [webSearchUsed, setWebSearchUsed] = useState(true);
  const [webSearchNote, setWebSearchNote] = useState('');
  const [appliedPriceFeedback, setAppliedPriceFeedback] = useState(false);
  const [appliedCategoryFeedback, setAppliedCategoryFeedback] = useState(false);
  const [appliedDescFeedback, setAppliedDescFeedback] = useState(false);
  const [appliedHighlightsFeedback, setAppliedHighlightsFeedback] = useState(false);

  const trimmedName = productName.trim();
  const totalPhotosAttached = productImageFiles.length + existingImageUrls.length;
  const isNameChangedSinceSearch =
    Boolean(lastSearchedName) &&
    trimmedName.toLowerCase() !== lastSearchedName.toLowerCase();

  useEffect(() => {
    setAppliedPriceFeedback(false);
  }, [recommendedPrice]);

  const buildPayloadBase = async () => {
    const imageDataUrls: string[] = [];

    for (const url of existingImageUrls.slice(0, 5)) {
      if (url && url.startsWith('data:image/') && url.length < 400_000) {
        imageDataUrls.push(url);
      }
    }

    const remainingSlots = Math.max(0, 5 - imageDataUrls.length);
    if (remainingSlots > 0 && productImageFiles.length > 0) {
      const encoded = await Promise.all(
        productImageFiles.slice(0, remainingSlots).map((f) => fileToSmallJpegDataUrl(f))
      );
      for (const item of encoded) {
        if (item) imageDataUrls.push(item);
      }
    }

    const existingCategories = Array.from(
      new Set(
        catalogProducts
          .map((p) => (p?.category || '').trim())
          .filter((c) => c.length > 0)
      )
    );

    const catalogSample = catalogProducts
      .filter((p) => p && p.name && p.price > 0)
      .slice(0, 10)
      .map((p) => ({
        name: p.name,
        category: p.category || 'Other',
        price: Number(p.price) || 0,
      }));

    return {
      pin,
      productName: trimmedName,
      category: category.trim(),
      description: description.trim(),
      existingCategories,
      catalogSample,
      imageDataUrls,
    };
  };

  const runInitialSearchAndQuestions = async () => {
    if (!trimmedName) {
      setOpen(true);
      setErrorMsg('Enter the Toy name first, then tap Re-check so AI can review the name & photos.');
      return;
    }

    setOpen(true);
    setLoading(true);
    setErrorMsg('');
    setAppliedPriceFeedback(false);
    setAppliedCategoryFeedback(false);
    setAppliedDescFeedback(false);
    setAppliedHighlightsFeedback(false);

    try {
      const base = await buildPayloadBase();
      const res = await fetch('/api/owner/ai/product-price-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...base,
          mode: 'ask_or_estimate',
          answers: [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setLastSearchedName(trimmedName);
      setWebSources(Array.isArray(data.webSources) ? data.webSources : []);
      setWebSearchUsed(data.webSearchUsed !== false);
      setWebSearchNote(data.webSearchNote || '');
      setImageReviewSummary(data.imageReviewSummary || '');
      setReviewedPhotosCount(Number(data.reviewedPhotosCount) || 0);

      const needsCatClarify = Boolean(data.categoryNeedsClarification);
      const nextCat = needsCatClarify ? '' : String(data.suggestedCategory || '').trim();
      const nextSecondary: string[] =
        !needsCatClarify && Array.isArray(data.secondaryCategories)
          ? data.secondaryCategories.map((c: any) => String(c || '').trim()).filter(Boolean).slice(0, 2)
          : [];

      setCategoryNeedsClarification(needsCatClarify);
      setSuggestedCategory(nextCat);
      setSecondaryCategories(nextSecondary);
      setCategoryReasoning(String(data.categoryReasoning || '').trim());

      if (nextCat && onSetCategory && !category.trim()) {
        onSetCategory(nextCat);
        setAppliedCategoryFeedback(true);
      }

      if (data.stage === 'questions' && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
        setAnswersMap({});
        setMarketFindings(data.marketFindings || '');
        setPreliminaryRange(data.preliminaryRangeINR || null);
        setRecommendedPrice(null);
        setSuggestedHighlights([]);
        setStage('questions');
      } else {
        setRecommendedPrice(Number(data.recommendedPriceINR) || null);
        setPriceRange(data.priceRangeINR || null);
        setReasoning(data.reasoning || '');
        setSizeAndSpecSummary(data.sizeAndSpecSummary || '');
        setSuggestedDesc(data.suggestedDescription || data.suggestedDescriptionSnippet || '');
        setSuggestedHighlights(Array.isArray(data.highlights) ? data.highlights : []);
        setStage('price_ready');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not reach AI web search right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const runCalculatePriceFromAnswers = async (skipAnswers = false) => {
    if (!trimmedName) {
      setErrorMsg('Please enter the Toy name first.');
      return;
    }

    const formattedAnswers = skipAnswers
      ? []
      : questions
          .map((q) => ({
            id: q.id,
            question: q.question,
            answer: (answersMap[q.id] || '').trim(),
          }))
          .filter((a) => a.answer.length > 0);

    if (!skipAnswers && formattedAnswers.length === 0) {
      setErrorMsg('Please select or type an answer to at least one question (especially size).');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setAppliedPriceFeedback(false);
    setAppliedCategoryFeedback(false);
    setAppliedDescFeedback(false);
    setAppliedHighlightsFeedback(false);

    try {
      const base = await buildPayloadBase();
      const res = await fetch('/api/owner/ai/product-price-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...base,
          mode: 'estimate_final',
          answers: formattedAnswers,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setLastSearchedName(trimmedName);
      setWebSearchUsed(data.webSearchUsed !== false);
      setWebSearchNote(data.webSearchNote || '');
      if (data.imageReviewSummary) setImageReviewSummary(data.imageReviewSummary);
      if (typeof data.reviewedPhotosCount === 'number') {
        setReviewedPhotosCount(data.reviewedPhotosCount);
      }
      const needsCatClarify = Boolean(data.categoryNeedsClarification);
      const nextCat = needsCatClarify ? '' : String(data.suggestedCategory || '').trim();
      const nextSecondary: string[] =
        !needsCatClarify && Array.isArray(data.secondaryCategories)
          ? data.secondaryCategories.map((c: any) => String(c || '').trim()).filter(Boolean).slice(0, 2)
          : [];

      setCategoryNeedsClarification(needsCatClarify && !nextCat);
      setSuggestedCategory(nextCat);
      setSecondaryCategories(nextSecondary);
      if (data.categoryReasoning) {
        setCategoryReasoning(String(data.categoryReasoning).trim());
      }
      if (nextCat && onSetCategory && !category.trim()) {
        onSetCategory(nextCat);
        setAppliedCategoryFeedback(true);
      }
      setRecommendedPrice(Number(data.recommendedPriceINR) || null);
      setPriceRange(data.priceRangeINR || null);
      setReasoning(data.reasoning || '');
      setSizeAndSpecSummary(data.sizeAndSpecSummary || '');
      setSuggestedDesc(data.suggestedDescription || data.suggestedDescriptionSnippet || '');
      setSuggestedHighlights(Array.isArray(data.highlights) ? data.highlights : []);
      if (Array.isArray(data.webSources) && data.webSources.length > 0) {
        setWebSources(data.webSources);
      }
      setStage('price_ready');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not calculate price right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const answeredCount = questions.filter((q) => (answersMap[q.id] || '').trim().length > 0).length;

  return (
    <div className="playnix-price-advisor-wrap">
      <div className="playnix-price-advisor-trigger-row">
        <button
          type="button"
          className="playnix-price-advisor-launch-btn"
          onClick={() => {
            if (!open || stage === 'idle' || isNameChangedSinceSearch) {
              void runInitialSearchAndQuestions();
            } else {
              setOpen(false);
            }
          }}
          disabled={loading}
        >
          {loading ? (
            <>
              <RefreshCw size={15} className="refresh-spinning" />
              <span>
                Reviewing Name{totalPhotosAttached > 0 ? ` & ${totalPhotosAttached} Photo(s)` : ''}…
              </span>
            </>
          ) : (
            <>
              <Globe size={15} />
              <span>
                {open && stage !== 'idle' && !isNameChangedSinceSearch
                  ? 'Hide AI Price & Description'
                  : 'Ask AI Price & Description (Name + Photos)'}
              </span>
            </>
          )}
        </button>
        <small className="playnix-price-advisor-hint">
          AI reviews your toy name{totalPhotosAttached > 0 ? ` and ${totalPhotosAttached} attached photo(s)` : ''}, checks prices, asks size details, and suggests both ₹ price &amp; description.
        </small>
      </div>

      {open && (
        <div className="playnix-price-advisor-card">
          <div className="playnix-price-advisor-head">
            <div className="playnix-price-advisor-title">
              <Sparkles size={15} />
              <strong>AI Product &amp; Price Advisor</strong>
              <span className="playnix-price-web-tag">
                {webSearchUsed ? 'Live Internet' : 'AI Market Estimate'}
              </span>
            </div>
            <button
              type="button"
              className="playnix-price-close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close AI price advisor"
            >
              <X size={15} />
            </button>
          </div>

          {isNameChangedSinceSearch && stage !== 'idle' && (
            <div className="playnix-price-stale-banner">
              <span>
                Toy name changed to <strong>{trimmedName || '(empty)'}</strong>.
              </span>
              <button
                type="button"
                onClick={() => void runInitialSearchAndQuestions()}
                disabled={loading || !trimmedName}
              >
                Re-check Name &amp; Photos
              </button>
            </div>
          )}

          {webSearchNote && stage !== 'idle' && !loading && (
            <div className="playnix-price-stale-banner" style={{ background: '#f5f7ef', borderColor: '#d5dec3', color: '#45543c' }}>
              <span>{webSearchNote}</span>
            </div>
          )}

          {errorMsg && <p className="error-msg playnix-price-error">{errorMsg}</p>}

          {loading && (
            <div className="playnix-price-loading-box">
              <RefreshCw size={18} className="refresh-spinning" />
              <div>
                <strong>
                  {stage === 'questions'
                    ? `Calculating ₹ price & description for "${trimmedName}"...`
                    : `Reviewing "${trimmedName}"${totalPhotosAttached > 0 ? ` + ${totalPhotosAttached} photo(s)` : ''}...`}
                </strong>
                <p>
                  {stage === 'questions'
                    ? 'Matching online prices and drafting customer description from your answers.'
                    : 'Inspecting toy details and preparing quick size/material questions.'}
                </p>
              </div>
            </div>
          )}

          {!loading && imageReviewSummary && stage !== 'idle' && (
            <div className="playnix-price-spec-pill" style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <ImageIcon size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>
                  Reviewed Name{reviewedPhotosCount > 0 ? ` + ${reviewedPhotosCount} Photo(s)` : ''}:
                </strong>{' '}
                {imageReviewSummary}
              </span>
            </div>
          )}

          {!loading && stage !== 'idle' && onSetCategory && (suggestedCategory || categoryNeedsClarification) && (
            <div className="playnix-price-desc-helper" style={{ marginBottom: 8 }}>
              {suggestedCategory ? (
                <>
                  <div style={{ flex: '1 1 220px' }}>
                    <span>
                      <strong>Primary category:</strong> {suggestedCategory}
                    </span>
                    {secondaryCategories.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                        <small style={{ color: '#5c6b52', fontWeight: 700 }}>Secondary:</small>
                        {secondaryCategories.map((secCat) => {
                          const isSelected = category.trim().toLowerCase() === secCat.toLowerCase();
                          return (
                            <button
                              key={secCat}
                              type="button"
                              className={`playnix-price-chip ${isSelected ? 'is-selected' : ''}`}
                              style={{ padding: '2px 9px', fontSize: '0.72rem' }}
                              onClick={() => {
                                onSetCategory(secCat);
                                setAppliedCategoryFeedback(true);
                              }}
                              title={`Use "${secCat}" as Category`}
                            >
                              {isSelected ? `✓ ${secCat}` : secCat}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {categoryReasoning && (
                      <small style={{ display: 'block', color: '#5c6b52', marginTop: 4 }}>
                        {categoryReasoning}
                      </small>
                    )}
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      onSetCategory(suggestedCategory);
                      setAppliedCategoryFeedback(true);
                    }}
                  >
                    {appliedCategoryFeedback || category.trim().toLowerCase() === suggestedCategory.toLowerCase()
                      ? `✓ Category: ${suggestedCategory}`
                      : `Use Category "${suggestedCategory}"`}
                  </button>
                </>
              ) : (
                <span>
                  <strong>Category clarification needed:</strong>{' '}
                  {categoryReasoning ||
                    'Product details are too general to classify reliably — please answer the usage question below instead of guessing.'}
                </span>
              )}
            </div>
          )}

          {/* STAGE 1: CLARIFYING QUESTIONS (SIZE, MATERIAL, ETC.) */}
          {!loading && stage === 'questions' && questions.length > 0 && (
            <div className="playnix-price-questions-stage">
              {(marketFindings || preliminaryRange) && (
                <div className="playnix-price-market-summary">
                  {preliminaryRange && (
                    <div className="playnix-price-prelim-badge">
                      Initial Web Range: ₹{preliminaryRange.min.toLocaleString('en-IN')} – ₹
                      {preliminaryRange.max.toLocaleString('en-IN')}
                    </div>
                  )}
                  {marketFindings && <p>{marketFindings}</p>}
                </div>
              )}

              <p className="playnix-price-step-label">
                Answer these quick details so AI can suggest the exact price &amp; description ({answeredCount}/
                {questions.length} filled):
              </p>

              <div className="playnix-price-question-list">
                {questions.map((q, idx) => {
                  const currentVal = answersMap[q.id] || '';
                  return (
                    <div key={q.id} className="playnix-price-question-item">
                      <label className="playnix-price-q-title">
                        <span>
                          {idx + 1}. {q.question}
                        </span>
                        {q.reason && <small>{q.reason}</small>}
                      </label>

                      {q.quickOptions.length > 0 && (
                        <div className="playnix-price-quick-chips">
                          {q.quickOptions.map((opt) => {
                            const selected = currentVal.toLowerCase() === opt.toLowerCase();
                            return (
                              <button
                                key={opt}
                                type="button"
                                className={`playnix-price-chip ${selected ? 'is-selected' : ''}`}
                                onClick={() =>
                                  setAnswersMap((prev) => ({
                                    ...prev,
                                    [q.id]: selected ? '' : opt,
                                  }))
                                }
                              >
                                {selected && <Check size={12} />}
                                <span>{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <input
                        type="text"
                        className="playnix-price-answer-input"
                        value={currentVal}
                        onChange={(e) =>
                          setAnswersMap((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        placeholder={q.placeholder || 'Or type custom size / detail...'}
                        maxLength={200}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="playnix-price-actions">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={answeredCount === 0 || loading}
                  onClick={() => void runCalculatePriceFromAnswers(false)}
                >
                  <Sparkles size={15} /> Get Price &amp; Description
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={loading}
                  onClick={() => void runCalculatePriceFromAnswers(true)}
                >
                  Skip &amp; Estimate
                </button>
              </div>
            </div>
          )}

          {/* STAGE 2: RECOMMENDED PRICE & DESCRIPTION RESULT */}
          {!loading && stage === 'price_ready' && recommendedPrice !== null && (
            <div className="playnix-price-result-stage">
              <div className="playnix-price-result-hero">
                <div>
                  <span className="playnix-price-result-eyebrow">RECOMMENDED SELLING PRICE</span>
                  <div className="playnix-price-result-amount">
                    ₹{recommendedPrice.toLocaleString('en-IN')}
                  </div>
                  {priceRange && (
                    <span className="playnix-price-result-range">
                      Typical online market range: ₹{priceRange.min.toLocaleString('en-IN')} – ₹
                      {priceRange.max.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={`playnix-price-apply-btn ${appliedPriceFeedback ? 'is-applied' : ''}`}
                  onClick={() => {
                    onApplyPrice(recommendedPrice);
                    setAppliedPriceFeedback(true);
                  }}
                >
                  {appliedPriceFeedback ? (
                    <>
                      <Check size={15} /> Applied ₹{recommendedPrice}
                    </>
                  ) : (
                    <>Use ₹{recommendedPrice} as Price</>
                  )}
                </button>
              </div>

              {sizeAndSpecSummary && (
                <div className="playnix-price-spec-pill">{sizeAndSpecSummary}</div>
              )}

              {reasoning && <p className="playnix-price-reasoning">{reasoning}</p>}

              {suggestedDesc && onSetDescription && (
                <div className="playnix-price-desc-helper">
                  <span>
                    <strong>Suggested description:</strong> {suggestedDesc}
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        onSetDescription(suggestedDesc);
                        setAppliedDescFeedback(true);
                      }}
                    >
                      {appliedDescFeedback ? '✓ Description Filled' : 'Use This Description'}
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      style={{ padding: '6px 11px', fontSize: '0.74rem' }}
                      onClick={() => {
                        onApplyPrice(recommendedPrice);
                        onSetDescription(suggestedDesc);
                        setAppliedPriceFeedback(true);
                        setAppliedDescFeedback(true);
                        if (suggestedCategory && onSetCategory) {
                          onSetCategory(suggestedCategory);
                          setAppliedCategoryFeedback(true);
                        }
                        if (suggestedHighlights.length > 0 && onSetHighlights) {
                          onSetHighlights(suggestedHighlights);
                          setAppliedHighlightsFeedback(true);
                        }
                      }}
                    >
                      {suggestedHighlights.length > 0 && onSetHighlights
                        ? 'Apply All (Price, Category, Description & Highlights)'
                        : 'Apply Price, Category & Description'}
                    </button>
                  </div>
                </div>
              )}

              {suggestedHighlights.length > 0 && onSetHighlights && (
                <div className="playnix-price-desc-helper">
                  <div style={{ width: '100%' }}>
                    <strong>Suggested Key Highlights (from Photos &amp; Name):</strong>
                    <ul className="playnix-price-highlights-preview">
                      {suggestedHighlights.map((hl, idx) => (
                        <li key={idx}>{hl}</li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      onSetHighlights(suggestedHighlights);
                      setAppliedHighlightsFeedback(true);
                    }}
                  >
                    {appliedHighlightsFeedback ? '✓ Highlights Filled' : 'Use These Highlights'}
                  </button>
                </div>
              )}

              <div className="playnix-price-actions">
                {questions.length > 0 && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setErrorMsg('');
                      setStage('questions');
                    }}
                  >
                    <SlidersHorizontal size={14} /> Change Size / Answers
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void runInitialSearchAndQuestions()}
                >
                  <RefreshCw size={14} /> Re-check Name &amp; Photos
                </button>
              </div>
            </div>
          )}

          {/* GOOGLE SEARCH GROUNDING SOURCES */}
          {!loading && webSources.length > 0 && (
            <div className="playnix-price-sources">
              <span>Internet sources checked:</span>
              <div className="playnix-price-sources-list">
                {webSources.map((src, i) => (
                  <a
                    key={`${src.uri}-${i}`}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="playnix-price-source-link"
                  >
                    <span>{src.title}</span>
                    <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
