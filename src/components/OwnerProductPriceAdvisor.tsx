import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Image as ImageIcon,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Product } from '../defaultData';

interface OwnerProductPriceAdvisorProps {
  pin: string;
  productName: string;
  category: string;
  description: string;
  catalogProducts: Product[];
  productImageFiles: File[];
  existingImageUrls?: string[];
  filamentCostPerGram: number | null;
  currentSellingPrice: string;
  onOpenFilamentSettings: () => void;
  onApplyPrice: (price: number) => void;
  onSetCategory?: (categoryText: string) => void;
  onSetDescription?: (descriptionText: string) => void;
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

function formatInrAmount(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString('en-IN')
    : value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const OwnerProductPriceAdvisor: React.FC<OwnerProductPriceAdvisorProps> = ({
  pin,
  productName,
  category,
  description,
  catalogProducts,
  productImageFiles,
  existingImageUrls = [],
  filamentCostPerGram,
  currentSellingPrice,
  onOpenFilamentSettings,
  onApplyPrice,
  onSetCategory,
  onSetDescription,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastSearchedName, setLastSearchedName] = useState('');

  const [ready, setReady] = useState(false);
  const [imageReviewSummary, setImageReviewSummary] = useState('');
  const [reviewedPhotosCount, setReviewedPhotosCount] = useState(0);

  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>([]);
  const [categoryNeedsClarification, setCategoryNeedsClarification] = useState(false);
  const [categoryReasoning, setCategoryReasoning] = useState('');
  const [suggestedDesc, setSuggestedDesc] = useState('');

  const [filamentGramsInput, setFilamentGramsInput] = useState('');
  const [appliedPriceFeedback, setAppliedPriceFeedback] = useState(false);
  const [appliedCategoryFeedback, setAppliedCategoryFeedback] = useState(false);
  const [appliedDescFeedback, setAppliedDescFeedback] = useState(false);

  const trimmedName = productName.trim();
  const totalPhotosAttached = productImageFiles.length + existingImageUrls.length;
  const isNameChangedSinceSearch =
    Boolean(lastSearchedName) &&
    trimmedName.toLowerCase() !== lastSearchedName.toLowerCase();

  // Filament weight validation & live calculation (never uses hardcoded fallback rate)
  const hasConfiguredRate =
    typeof filamentCostPerGram === 'number' &&
    isFinite(filamentCostPerGram) &&
    filamentCostPerGram > 0;

  const trimmedGrams = filamentGramsInput.trim();
  const parsedGrams = trimmedGrams ? Number(trimmedGrams) : NaN;
  const isGramsEntered = trimmedGrams.length > 0;
  const isGramsValid = isGramsEntered && isFinite(parsedGrams) && parsedGrams > 0;
  const calculatedMaterialCost =
    hasConfiguredRate && isGramsValid
      ? Math.round(parsedGrams * filamentCostPerGram * 100) / 100
      : null;

  useEffect(() => {
    setAppliedPriceFeedback(false);
  }, [calculatedMaterialCost, filamentGramsInput, filamentCostPerGram]);

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
      .filter((p) => p && p.name)
      .slice(0, 10)
      .map((p) => ({
        name: p.name,
        category: p.category || 'Other',
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

  const runGenerateCategoryAndDescription = async () => {
    if (!trimmedName) {
      setOpen(true);
      setErrorMsg('Enter the Toy name first, then tap Re-check so AI can generate category & description.');
      return;
    }

    setOpen(true);
    setLoading(true);
    setErrorMsg('');
    setAppliedPriceFeedback(false);
    setAppliedCategoryFeedback(false);
    setAppliedDescFeedback(false);

    try {
      const base = await buildPayloadBase();
      const res = await fetch('/api/owner/ai/product-price-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...base,
          mode: 'estimate_final',
          answers: [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setLastSearchedName(trimmedName);
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

      const nextDesc = String(data.suggestedDescription || '').trim();
      setSuggestedDesc(nextDesc);

      if (nextCat && onSetCategory && !category.trim()) {
        onSetCategory(nextCat);
        setAppliedCategoryFeedback(true);
      }

      setReady(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not reach Playnix AI right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const trimmedCurrentSellingPrice = currentSellingPrice.trim();
  const hasManualPriceConflict =
    calculatedMaterialCost !== null &&
    trimmedCurrentSellingPrice.length > 0 &&
    Number(trimmedCurrentSellingPrice) !== calculatedMaterialCost;

  return (
    <div className="playnix-price-advisor-wrap">
      <div className="playnix-price-advisor-trigger-row">
        <button
          type="button"
          className="playnix-price-advisor-launch-btn"
          onClick={() => {
            if (!open || !ready || isNameChangedSinceSearch) {
              void runGenerateCategoryAndDescription();
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
                Generating Category &amp; Description
                {totalPhotosAttached > 0 ? ` (${totalPhotosAttached} Photo(s))` : ''}…
              </span>
            </>
          ) : (
            <>
              <Sparkles size={15} />
              <span>
                {open && ready && !isNameChangedSinceSearch
                  ? 'Hide AI Description, Category & Filament Calculator'
                  : 'Ask AI Price & Description (Name + Photos)'}
              </span>
            </>
          )}
        </button>
        <small className="playnix-price-advisor-hint">
          AI directly generates Category &amp; Description from your product name{totalPhotosAttached > 0 ? ` and ${totalPhotosAttached} photo(s)` : ''}, then only asks filament grams to calculate material cost.
        </small>
      </div>

      {open && (
        <div className="playnix-price-advisor-card">
          <div className="playnix-price-advisor-head">
            <div className="playnix-price-advisor-title">
              <Sparkles size={15} />
              <strong>Playnix AI Category, Description &amp; Filament Calculator</strong>
              <span className="playnix-price-web-tag">
                {hasConfiguredRate ? `₹${formatInrAmount(filamentCostPerGram!)}/g` : 'Rate Needed'}
              </span>
            </div>
            <button
              type="button"
              className="playnix-price-close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close AI listing assistant"
            >
              <X size={15} />
            </button>
          </div>

          {isNameChangedSinceSearch && ready && (
            <div className="playnix-price-stale-banner">
              <span>
                Toy name changed to <strong>{trimmedName || '(empty)'}</strong>.
              </span>
              <button
                type="button"
                onClick={() => void runGenerateCategoryAndDescription()}
                disabled={loading || !trimmedName}
              >
                Re-check Name &amp; Photos
              </button>
            </div>
          )}

          {errorMsg && <p className="error-msg playnix-price-error">{errorMsg}</p>}

          {loading && (
            <div className="playnix-price-loading-box">
              <RefreshCw size={18} className="refresh-spinning" />
              <div>
                <strong>
                  Generating category &amp; description for &quot;{trimmedName}&quot;
                  {totalPhotosAttached > 0 ? ` (${totalPhotosAttached} photo(s))` : ''}...
                </strong>
                <p>No extra questionnaire — generating category &amp; description directly.</p>
              </div>
            </div>
          )}

          {!loading && ready && (
            <div className="playnix-price-result-stage">
              {imageReviewSummary && (
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

              {/* 1. PRODUCT CATEGORY */}
              {onSetCategory && (suggestedCategory || categoryNeedsClarification) && (
                <div className="playnix-price-desc-helper">
                  {suggestedCategory ? (
                    <>
                      <div style={{ flex: '1 1 220px' }}>
                        <span>
                          <strong>1. Category:</strong> {suggestedCategory}
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
                      <strong>Category note:</strong>{' '}
                      {categoryReasoning || 'Please enter a category manually in the Category field below.'}
                    </span>
                  )}
                </div>
              )}

              {/* 2. PRODUCT DESCRIPTION */}
              {suggestedDesc && onSetDescription && (
                <div className="playnix-price-desc-helper">
                  <span style={{ flex: '1 1 240px' }}>
                    <strong>2. Description:</strong> {suggestedDesc}
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
                    {suggestedCategory && onSetCategory && (
                      <button
                        type="button"
                        className="primary-btn"
                        style={{ padding: '6px 11px', fontSize: '0.74rem' }}
                        onClick={() => {
                          onSetCategory(suggestedCategory);
                          onSetDescription(suggestedDesc);
                          setAppliedCategoryFeedback(true);
                          setAppliedDescFeedback(true);
                        }}
                      >
                        Apply Category &amp; Description
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 3. ONLY QUESTION: FILAMENT WEIGHT IN GRAMS & CALCULATION */}
              <div
                style={{
                  border: '1.5px solid #bfd1a1',
                  borderRadius: '11px',
                  padding: '12px',
                  background: '#f3f7eb',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="playnix-price-result-eyebrow">
                    3. FILAMENT COST CALCULATOR
                  </span>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{
                      padding: '4px 9px',
                      fontSize: '0.72rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                    onClick={onOpenFilamentSettings}
                  >
                    <Settings size={12} />
                    {hasConfiguredRate
                      ? `Rate: ₹${formatInrAmount(filamentCostPerGram!)}/g · Edit`
                      : 'Configure Filament Cost'}
                  </button>
                </div>

                {!hasConfiguredRate ? (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '9px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      color: '#92400e',
                      fontSize: '0.8rem',
                      display: 'grid',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <strong>Filament cost per gram is not set yet.</strong>
                        <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#78350f' }}>
                          Set your 1g filament cost in the three-dot menu under{' '}
                          <strong>Filament Cost Settings</strong> to calculate material cost automatically.
                        </p>
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="primary-btn"
                        style={{ padding: '7px 12px', fontSize: '0.76rem' }}
                        onClick={onOpenFilamentSettings}
                      >
                        <Settings size={13} /> Open Filament Cost Settings
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <label
                      style={{
                        display: 'grid',
                        gap: '6px',
                        margin: 0,
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#22331b',
                      }}
                    >
                      <span>How many grams of filament are required to print this product?</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          className="playnix-price-answer-input"
                          style={{ maxWidth: '180px', margin: 0 }}
                          value={filamentGramsInput}
                          onChange={(e) => setFilamentGramsInput(e.target.value)}
                          placeholder="e.g. 25"
                        />
                        <span style={{ fontSize: '0.78rem', color: '#4c5b43', fontWeight: 600 }}>
                          grams × ₹{formatInrAmount(filamentCostPerGram!)} / gram
                        </span>
                      </div>
                    </label>

                    {!isGramsEntered ? (
                      <p className="playnix-price-reasoning" style={{ fontSize: '0.76rem', color: '#4d5d44' }}>
                        Enter the filament weight in grams above to calculate the suggested material cost.
                      </p>
                    ) : !isGramsValid ? (
                      <p className="error-msg" style={{ margin: 0, fontSize: '0.76rem' }}>
                        Please enter a valid filament weight greater than 0 grams.
                      </p>
                    ) : (
                      calculatedMaterialCost !== null && (
                        <div className="playnix-price-result-hero" style={{ background: '#ffffff' }}>
                          <div>
                            <span className="playnix-price-result-eyebrow">
                              CALCULATED MATERIAL COST
                            </span>
                            <div className="playnix-price-result-amount">
                              ₹{formatInrAmount(calculatedMaterialCost)}
                            </div>
                            <span className="playnix-price-result-range">
                              {parsedGrams}g × ₹{formatInrAmount(filamentCostPerGram!)}/g = ₹
                              {formatInrAmount(calculatedMaterialCost)}
                            </span>
                            {hasManualPriceConflict && (
                              <span
                                className="playnix-price-result-range"
                                style={{ color: '#4a5a42', marginTop: 4 }}
                              >
                                Current selling price in form: ₹{trimmedCurrentSellingPrice}. Click Apply only if you want to replace it, or edit the Price field directly.
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`playnix-price-apply-btn ${appliedPriceFeedback ? 'is-applied' : ''}`}
                            onClick={() => {
                              onApplyPrice(calculatedMaterialCost);
                              setAppliedPriceFeedback(true);
                            }}
                          >
                            {appliedPriceFeedback ? (
                              <>
                                <Check size={15} /> Applied ₹{formatInrAmount(calculatedMaterialCost)}
                              </>
                            ) : (
                              <>Use ₹{formatInrAmount(calculatedMaterialCost)} as Price</>
                            )}
                          </button>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>

              <div className="playnix-price-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void runGenerateCategoryAndDescription()}
                >
                  <RefreshCw size={14} /> Re-check Name &amp; Photos
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
