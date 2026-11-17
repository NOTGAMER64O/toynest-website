import React, { useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  Globe,
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
  firstProductImageFile: File | null;
  firstExistingImageUrl?: string | null;
  onApplyPrice: (price: number) => void;
  onAppendDescription?: (snippet: string) => void;
}

async function fileToSmallJpegDataUrl(file: File, maxDim = 380): Promise<string | null> {
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
            resolve(canvas.toDataURL('image/jpeg', 0.65));
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
  firstProductImageFile,
  firstExistingImageUrl,
  onApplyPrice,
  onAppendDescription,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastSearchedName, setLastSearchedName] = useState('');

  const [stage, setStage] = useState<'idle' | 'questions' | 'price_ready'>('idle');
  const [marketFindings, setMarketFindings] = useState('');
  const [preliminaryRange, setPreliminaryRange] = useState<{ min: number; max: number } | null>(null);
  const [questions, setQuestions] = useState<PriceAdvisorQuestion[]>([]);
  const [answersMap, setAnswersMap] = useState<Record<string, string>>({});

  const [recommendedPrice, setRecommendedPrice] = useState<number | null>(null);
  const [priceRange, setPriceRange] = useState<{ min: number; max: number } | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [sizeAndSpecSummary, setSizeAndSpecSummary] = useState('');
  const [suggestedDesc, setSuggestedDesc] = useState('');
  const [webSources, setWebSources] = useState<PriceAdvisorWebSource[]>([]);
  const [webSearchUsed, setWebSearchUsed] = useState(true);
  const [webSearchNote, setWebSearchNote] = useState('');
  const [appliedPriceFeedback, setAppliedPriceFeedback] = useState(false);
  const [appliedDescFeedback, setAppliedDescFeedback] = useState(false);

  // If the user clears the form or switches toy completely after a completed estimate, show subtle stale hint
  const trimmedName = productName.trim();
  const isNameChangedSinceSearch =
    Boolean(lastSearchedName) &&
    trimmedName.toLowerCase() !== lastSearchedName.toLowerCase();

  useEffect(() => {
    setAppliedPriceFeedback(false);
  }, [recommendedPrice]);

  const buildPayloadBase = async () => {
    let imageDataUrl: string | undefined;
    if (firstProductImageFile) {
      const tiny = await fileToSmallJpegDataUrl(firstProductImageFile);
      if (tiny) imageDataUrl = tiny;
    } else if (
      firstExistingImageUrl &&
      firstExistingImageUrl.startsWith('data:image/') &&
      firstExistingImageUrl.length < 400_000
    ) {
      imageDataUrl = firstExistingImageUrl;
    }

    const catalogSample = catalogProducts
      .filter((p) => p && p.name && p.price > 0)
      .slice(0, 12)
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
      catalogSample,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    };
  };

  const runInitialSearchAndQuestions = async () => {
    if (!trimmedName) {
      setOpen(true);
      setErrorMsg('Enter the Toy name first, then tap Re-check so AI can search market prices online.');
      return;
    }

    setOpen(true);
    setLoading(true);
    setErrorMsg('');
    setAppliedPriceFeedback(false);
    setAppliedDescFeedback(false);

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

      if (data.stage === 'questions' && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
        setAnswersMap({});
        setMarketFindings(data.marketFindings || '');
        setPreliminaryRange(data.preliminaryRangeINR || null);
        setRecommendedPrice(null);
        setStage('questions');
      } else {
        setRecommendedPrice(Number(data.recommendedPriceINR) || null);
        setPriceRange(data.priceRangeINR || null);
        setReasoning(data.reasoning || '');
        setSizeAndSpecSummary(data.sizeAndSpecSummary || '');
        setSuggestedDesc(data.suggestedDescriptionSnippet || '');
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
    setAppliedDescFeedback(false);

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
      setRecommendedPrice(Number(data.recommendedPriceINR) || null);
      setPriceRange(data.priceRangeINR || null);
      setReasoning(data.reasoning || '');
      setSizeAndSpecSummary(data.sizeAndSpecSummary || '');
      setSuggestedDesc(data.suggestedDescriptionSnippet || '');
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
              <span>Searching Internet &amp; Checking Size…</span>
            </>
          ) : (
            <>
              <Globe size={15} />
              <span>
                {open && stage !== 'idle' && !isNameChangedSinceSearch
                  ? 'Hide AI Price Advisor'
                  : 'Ask AI Price (Web Search)'}
              </span>
            </>
          )}
        </button>
        <small className="playnix-price-advisor-hint">
          AI searches online prices, asks about size &amp; material, and suggests your ₹ price.
        </small>
      </div>

      {open && (
        <div className="playnix-price-advisor-card">
          <div className="playnix-price-advisor-head">
            <div className="playnix-price-advisor-title">
              <Sparkles size={15} />
              <strong>AI Web Price Advisor</strong>
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
                Re-search for new toy
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
                    ? `Calculating ₹ price for "${trimmedName}" based on your answers...`
                    : `Searching live Indian market prices for "${trimmedName}"...`}
                </strong>
                <p>
                  {stage === 'questions'
                    ? 'Comparing online listings matching your exact size and specs.'
                    : 'Preparing key questions (size, scale, material) to pinpoint the exact price.'}
                </p>
              </div>
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
                Answer these quick details so AI can tell you the exact price ({answeredCount}/
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
                  <Sparkles size={15} /> Get Exact ₹ Price
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

          {/* STAGE 2: RECOMMENDED PRICE RESULT */}
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

              {suggestedDesc && onAppendDescription && (
                <div className="playnix-price-desc-helper">
                  <span>
                    <strong>Suggested spec note:</strong> {suggestedDesc}
                  </span>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      onAppendDescription(suggestedDesc);
                      setAppliedDescFeedback(true);
                    }}
                  >
                    {appliedDescFeedback ? '✓ Added to Description' : '+ Add to Description'}
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
                  <RefreshCw size={14} /> Re-search Web
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
