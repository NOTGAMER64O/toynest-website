import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  ChevronRight,
  TrendingUp,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  type Product,
  type ScheduledOffer,
  type DiscountCampaign,
  type PopularSearchItem,
  calculateProductDiscount,
} from '../defaultData';
import { filterAndRankProducts } from '../firebase';
import {
  smartSearchProducts,
  doesPriceSatisfyConstraint,
} from '../utils/smartSearch';

interface CustomerSearchBarProps {
  products: Product[];
  popularSearches: PopularSearchItem[];
  activeOffersByProductId: Map<string, ScheduledOffer>;
  activeDiscountCampaigns: DiscountCampaign[];
  isSyncingCloud?: boolean;
  onEnsureCloudProducts?: () => void;
  onSelectProduct: (product: Product) => void;
  formatCurrency: (val: number) => string;
}

interface AiSearchState {
  query: string;
  understoodIntent: string;
  matches: Array<{ id: string; reason: string }>;
  suggestedRefinements: string[];
  error?: string;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const cleanQuery = query.trim();
  if (!cleanQuery || !text) return <>{text}</>;

  const tokens = Array.from(
    new Set(
      cleanQuery
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  ).sort((a, b) => b.length - a.length);

  if (tokens.length === 0) return <>{text}</>;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'ig');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, idx) => {
        const isMatch = tokens.some((t) => part.toLowerCase() === t.toLowerCase());
        return isMatch ? (
          <mark key={idx} className="catalog-search-highlight">
            {part}
          </mark>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        );
      })}
    </>
  );
}

export const CustomerSearchBar: React.FC<CustomerSearchBarProps> = ({
  products,
  popularSearches,
  activeOffersByProductId,
  activeDiscountCampaigns,
  isSyncingCloud = false,
  onEnsureCloudProducts,
  onSelectProduct,
  formatCurrency,
}) => {
  const [query, setQuery] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AiSearchState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiCacheRef = useRef<Map<string, AiSearchState>>(new Map());
  const aiAbortRef = useRef<AbortController | null>(null);

  const availableProducts = useMemo(
    () => products.filter((p) => p && p.available !== false),
    [products]
  );

  const getProductEffectivePrice = useCallback(
    (product: Product): number => {
      const activeOffer = activeOffersByProductId.get(product.id);
      if (activeOffer) return Number(activeOffer.discountedPrice) || product.price;
      const campaignDisc = calculateProductDiscount(product, activeDiscountCampaigns);
      if (campaignDisc.isDiscounted) return Number(campaignDisc.discountedPrice) || product.price;
      return Number(product.price) || 0;
    },
    [activeOffersByProductId, activeDiscountCampaigns]
  );

  // Sorted popular searches loaded dynamically from Firebase
  const sortedPopularSearches = useMemo(
    () =>
      [...popularSearches]
        .filter((item) => item && item.term && item.term.trim().length > 0)
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }),
    [popularSearches]
  );

  // Fast deterministic smart search: numerical price filters, relative price sorting, fuzzy spelling, and domain synonyms
  const smartSearch = useMemo(() => {
    if (!query.trim()) {
      return smartSearchProducts(availableProducts, '', getProductEffectivePrice);
    }
    return smartSearchProducts(availableProducts, query, getProductEffectivePrice);
  }, [availableProducts, query, getProductEffectivePrice]);

  const keywordSearchResults = useMemo(() => {
    if (!query.trim()) return [];
    if (smartSearch.products.length > 0) return smartSearch.products;
    // If an explicit price filter yielded 0 matches, NEVER fall back to loose keyword results
    if (smartSearch.parsed.hasExplicitNumericPrice) return [];
    return filterAndRankProducts(availableProducts, query);
  }, [availableProducts, query, smartSearch]);

  const catalogSignature = useMemo(
    () => `${availableProducts.length}:${availableProducts.map((p) => p.id).slice(0, 10).join(',')}`,
    [availableProducts]
  );

  const triggerAiSearch = useCallback(
    async (rawQuery: string) => {
      const clean = rawQuery.trim();
      if (clean.length < 2 || availableProducts.length === 0) {
        setAiResult(null);
        setAiLoading(false);
        return;
      }

      // Skip Gemini completely when an explicit numerical price query has 0 matching products in the catalog
      const localEval = smartSearchProducts(availableProducts, clean, getProductEffectivePrice);
      if (localEval.parsed.hasExplicitNumericPrice && localEval.priceEligibleCatalogCount === 0) {
        if (aiAbortRef.current) aiAbortRef.current.abort();
        setAiResult({
          query: clean,
          understoodIntent: localEval.emptyReason,
          matches: [],
          suggestedRefinements: [],
        });
        setAiLoading(false);
        return;
      }

      // Avoid burning Gemini calls when deterministic pure-price search already resolved cleanly
      if (localEval.parsed.isPurePriceQuery) {
        if (aiAbortRef.current) aiAbortRef.current.abort();
        setAiResult(null);
        setAiLoading(false);
        return;
      }

      const cacheKey = `${catalogSignature}::${clean.toLowerCase()}`;
      const cached = aiCacheRef.current.get(cacheKey);
      if (cached) {
        setAiResult(cached);
        setAiLoading(false);
        return;
      }

      if (aiAbortRef.current) {
        aiAbortRef.current.abort();
      }
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setAiLoading(true);

      try {
        const compactCatalog = availableProducts.slice(0, 120).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category || 'Other',
          price: p.price,
          effectivePrice: getProductEffectivePrice(p),
          description: p.description || '',
          highlights: Array.isArray(p.highlights) ? p.highlights : [],
        }));

        const res = await fetch('/api/customer/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            query: clean,
            products: compactCatalog,
          }),
        });
        const data = await res.json();
        if (controller.signal.aborted) return;

        if (!data?.success) {
          setAiResult({
            query: clean,
            understoodIntent: '',
            matches: [],
            suggestedRefinements: [],
            error: data?.error || '',
          });
          return;
        }

        const nextState: AiSearchState = {
          query: clean,
          understoodIntent: String(data.understoodIntent || '').trim(),
          matches: Array.isArray(data.matchedProducts) ? data.matchedProducts : [],
          suggestedRefinements: Array.isArray(data.suggestedRefinements)
            ? data.suggestedRefinements
            : [],
        };
        aiCacheRef.current.set(cacheKey, nextState);
        setAiResult(nextState);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setAiResult(null);
      } finally {
        if (!controller.signal.aborted) {
          setAiLoading(false);
        }
      }
    },
    [availableProducts, getProductEffectivePrice, catalogSignature]
  );

  // Only invoke Gemini AI for descriptive / natural-language queries that deterministic search cannot already answer cleanly
  useEffect(() => {
    const clean = query.trim();
    if (!clean) {
      if (aiAbortRef.current) aiAbortRef.current.abort();
      setAiResult(null);
      setAiLoading(false);
      return;
    }

    const cacheKey = `${catalogSignature}::${clean.toLowerCase()}`;
    const cached = aiCacheRef.current.get(cacheKey);
    if (cached) {
      setAiResult(cached);
      setAiLoading(false);
      return;
    }

    if (!isOpen || !smartSearch.shouldCallAi) {
      if (aiAbortRef.current) aiAbortRef.current.abort();
      setAiResult((prev) => (prev && prev.query.toLowerCase() === clean.toLowerCase() ? prev : null));
      setAiLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void triggerAiSearch(clean);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [query, isOpen, smartSearch.shouldCallAi, catalogSignature, triggerAiSearch]);

  useEffect(() => {
    return () => {
      if (aiAbortRef.current) aiAbortRef.current.abort();
    };
  }, []);

  // Merge AI matches + deterministic smart matches, always enforcing numerical price rules strictly
  const activeAiResult = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!aiResult || aiResult.query.toLowerCase() !== clean) return null;
    return aiResult;
  }, [aiResult, query]);

  const aiReasonMap = useMemo(() => {
    const map = new Map<string, string>();
    if (activeAiResult?.matches) {
      for (const m of activeAiResult.matches) {
        if (m.id && m.reason) map.set(m.id, m.reason);
      }
    }
    return map;
  }, [activeAiResult]);

  const localBadgeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of smartSearch.matches) {
      if (m.product?.id && m.matchBadge) {
        map.set(m.product.id, m.matchBadge);
      }
    }
    return map;
  }, [smartSearch.matches]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const byId = new Map(availableProducts.map((p) => [p.id, p]));
    const merged: Product[] = [];
    const seen = new Set<string>();

    const passesNumericalPrice = (prod: Product): boolean => {
      if (!smartSearch.parsed.hasExplicitNumericPrice) return true;
      return doesPriceSatisfyConstraint(
        prod.price,
        getProductEffectivePrice(prod),
        smartSearch.parsed
      );
    };

    // Prioritize deterministic smart matches when found cleanly; augment with price-verified AI matches if any
    for (const prod of keywordSearchResults) {
      if (passesNumericalPrice(prod) && !seen.has(prod.id)) {
        seen.add(prod.id);
        merged.push(prod);
      }
    }

    if (activeAiResult && activeAiResult.matches.length > 0) {
      for (const m of activeAiResult.matches) {
        const prod = byId.get(m.id);
        if (prod && passesNumericalPrice(prod) && !seen.has(prod.id)) {
          seen.add(prod.id);
          merged.push(prod);
        }
      }
    }

    if (smartSearch.parsed.priceSort === 'asc') {
      merged.sort((a, b) => getProductEffectivePrice(a) - getProductEffectivePrice(b));
    } else if (smartSearch.parsed.priceSort === 'desc') {
      merged.sort((a, b) => getProductEffectivePrice(b) - getProductEffectivePrice(a));
    }

    return merged;
  }, [query, availableProducts, keywordSearchResults, activeAiResult, smartSearch.parsed, getProductEffectivePrice]);

  // Live search suggestions generated dynamically while typing
  const liveSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const seen = new Set<string>();
    const list: Array<{ label: string; kind: 'popular' | 'category' | 'product' | 'ai' }> = [];

    if (activeAiResult?.suggestedRefinements) {
      for (const ref of activeAiResult.suggestedRefinements) {
        const lower = ref.trim().toLowerCase();
        if (lower && lower !== q && !seen.has(lower)) {
          seen.add(lower);
          list.push({ label: ref.trim(), kind: 'ai' });
        }
      }
    }

    for (const pop of sortedPopularSearches) {
      const lower = pop.term.trim().toLowerCase();
      if (lower.includes(q) && lower !== q && !seen.has(lower)) {
        seen.add(lower);
        list.push({ label: pop.term.trim(), kind: 'popular' });
      }
    }

    for (const prod of availableProducts) {
      const cat = (prod.category || '').trim();
      if (cat && cat.toLowerCase().includes(q) && cat.toLowerCase() !== q && !seen.has(cat.toLowerCase())) {
        seen.add(cat.toLowerCase());
        list.push({ label: cat, kind: 'category' });
      }
    }

    for (const prod of searchResults.slice(0, 4)) {
      const cleanName = (prod.name || '').split('|')[0].trim();
      if (cleanName && cleanName.toLowerCase() !== q && !seen.has(cleanName.toLowerCase())) {
        seen.add(cleanName.toLowerCase());
        list.push({ label: cleanName, kind: 'product' });
      }
    }

    return list.slice(0, 5);
  }, [query, activeAiResult, sortedPopularSearches, availableProducts, searchResults]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  const handleApplyTerm = (term: string) => {
    setQuery(term);
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleChooseProduct = (product: Product) => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    onSelectProduct(product);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        const target =
          highlightedIndex >= 0 && highlightedIndex < searchResults.length
            ? searchResults[highlightedIndex]
            : searchResults[0];
        handleChooseProduct(target);
      } else if (query.trim().length >= 2) {
        void triggerAiSearch(query);
      }
    }
  };

  const trimmedQuery = query.trim();
  const highlightQuery = smartSearch.parsed.residualTerms.join(' ');
  const activeBannerText =
    activeAiResult?.understoodIntent || smartSearch.intentSummary;

  return (
    <div className="catalog-search-wrap" ref={containerRef}>
      <div className={`catalog-search-bar ${isOpen ? 'is-focused' : ''}`}>
        <Search size={19} className="catalog-search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          className="catalog-search-input"
          placeholder="Search toys or describe what you want (e.g. gift under ₹500)..."
          aria-label="Search toys or ask AI what you want"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={query}
          onFocus={() => {
            setIsOpen(true);
            onEnsureCloudProducts?.();
          }}
          onClick={() => {
            if (!isOpen) setIsOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {isSyncingCloud && (
          <span className="catalog-search-sync-badge" aria-live="polite">
            Syncing…
          </span>
        )}
        {trimmedQuery.length >= 2 && (
          <button
            type="button"
            className="catalog-ai-ask-btn"
            onClick={() => {
              setIsOpen(true);
              void triggerAiSearch(query);
            }}
            disabled={aiLoading}
            title="Let Playnix AI understand your request and match toys"
          >
            {aiLoading ? (
              <RefreshCw size={13} className="refresh-spinning" />
            ) : (
              <Sparkles size={13} />
            )}
            <span>{aiLoading ? 'Thinking…' : 'AI Match'}</span>
          </button>
        )}
        {query && (
          <button
            type="button"
            className="catalog-search-clear-btn"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setAiResult(null);
              setIsOpen(true);
              inputRef.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className="catalog-search-dropdown"
          role="listbox"
          aria-label="Popular searches and smart AI product results"
        >
          {trimmedQuery === '' ? (
            <div className="catalog-search-popular-panel">
              {sortedPopularSearches.length > 0 ? (
                <>
                  <div className="catalog-search-panel-label">
                    <TrendingUp size={13} /> Popular Searches
                  </div>
                  <div className="catalog-popular-chips">
                    {sortedPopularSearches.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="catalog-popular-chip"
                        onClick={() => handleApplyTerm(item.term)}
                      >
                        <Search size={12} />
                        <span>{item.term}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="catalog-search-idle-hint">
                  Try typing a toy name or ask what you need — like &ldquo;birthday gift under ₹500&rdquo; or &ldquo;car for kids&rdquo;.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* AI / Smart Search Understanding Status Strip */}
              {(aiLoading || Boolean(activeBannerText)) && (
                <div className="catalog-ai-search-banner" aria-live="polite">
                  <Sparkles size={14} className={aiLoading ? 'refresh-spinning' : ''} />
                  {aiLoading ? (
                    <span>Playnix AI is understanding what you&apos;re looking for…</span>
                  ) : (
                    <span>
                      <strong>{activeAiResult?.understoodIntent ? 'AI Understood:' : 'Smart Search:'}</strong>{' '}
                      {activeBannerText}
                    </span>
                  )}
                </div>
              )}

              {/* Live Search & AI Refinement Suggestions */}
              {liveSuggestions.length > 0 && (
                <div className="catalog-live-suggestions">
                  <span className="catalog-live-suggestions-title">
                    <Sparkles size={12} /> Suggestions
                  </span>
                  <div className="catalog-live-suggestion-pills">
                    {liveSuggestions.map((s) => (
                      <button
                        key={`${s.kind}-${s.label}`}
                        type="button"
                        className="catalog-live-suggestion-pill"
                        onClick={() => handleApplyTerm(s.label)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Matching Products */}
              {searchResults.length > 0 ? (
                <>
                  <div className="catalog-search-results-header">
                    <span>
                      {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} for{' '}
                      <strong>&ldquo;{trimmedQuery}&rdquo;</strong>
                    </span>
                    <span className="catalog-search-tap-hint">Tap to open product page</span>
                  </div>

                  <div className="catalog-search-results-list">
                    {searchResults.map((product, idx) => {
                      const firstImg =
                        (product.imageUrls && product.imageUrls[0]) || product.imageUrl;
                      const activeOffer = activeOffersByProductId.get(product.id);
                      const campaignDiscount = calculateProductDiscount(
                        product,
                        activeDiscountCampaigns
                      );
                      const hasDiscount = Boolean(activeOffer || campaignDiscount.isDiscounted);
                      const effectivePrice = activeOffer
                        ? activeOffer.discountedPrice
                        : campaignDiscount.isDiscounted
                        ? campaignDiscount.discountedPrice
                        : product.price;
                      const isHighlighted = idx === highlightedIndex;
                      const aiReason = aiReasonMap.get(product.id);
                      const localBadge = localBadgeMap.get(product.id);

                      return (
                        <button
                          key={product.id}
                          type="button"
                          role="option"
                          aria-selected={isHighlighted}
                          className={`catalog-search-result-row ${
                            isHighlighted ? 'is-highlighted' : ''
                          }`}
                          onClick={() => handleChooseProduct(product)}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                        >
                          <div className="catalog-search-result-thumb">
                            {firstImg ? (
                              <img src={firstImg} alt={product.name} loading="lazy" />
                            ) : (
                              <span>🧸</span>
                            )}
                          </div>

                          <div className="catalog-search-result-body">
                            <div className="catalog-search-result-top">
                              <span className="catalog-search-result-name">
                                <HighlightMatch text={product.name} query={highlightQuery} />
                              </span>
                              <span className="catalog-search-result-cat">
                                <HighlightMatch
                                  text={product.category || 'Other'}
                                  query={highlightQuery}
                                />
                              </span>
                            </div>
                            {aiReason ? (
                              <p className="catalog-ai-match-reason">
                                <Sparkles size={11} /> {aiReason}
                              </p>
                            ) : product.description ? (
                              <p className="catalog-search-result-desc">
                                <HighlightMatch text={product.description} query={highlightQuery} />
                              </p>
                            ) : localBadge ? (
                              <p className="catalog-ai-match-reason">
                                <Sparkles size={11} /> {localBadge}
                              </p>
                            ) : null}
                          </div>

                          <div className="catalog-search-result-price-wrap">
                            {hasDiscount ? (
                              <>
                                <span className="catalog-search-result-price discounted">
                                  {formatCurrency(effectivePrice)}
                                </span>
                                <span className="catalog-search-result-old-price">
                                  {formatCurrency(product.price)}
                                </span>
                              </>
                            ) : (
                              <span className="catalog-search-result-price">
                                {formatCurrency(product.price)}
                              </span>
                            )}
                            <ChevronRight size={16} className="catalog-search-result-chevron" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : aiLoading ? (
                <div className="catalog-search-empty" role="status">
                  <div className="catalog-search-empty-icon">✨</div>
                  <h4>Finding matching toys…</h4>
                  <p>
                    Playnix AI is checking our shelf for{' '}
                    <strong>&ldquo;{trimmedQuery}&rdquo;</strong>.
                  </p>
                </div>
              ) : (
                <div className="catalog-search-empty" role="status">
                  <div className="catalog-search-empty-icon">🔍</div>
                  <h4>No products found</h4>
                  <p>
                    {smartSearch.emptyReason || (
                      <>
                        We couldn&apos;t find any toys matching{' '}
                        <strong>&ldquo;{trimmedQuery}&rdquo;</strong>.
                      </>
                    )}
                  </p>

                  {sortedPopularSearches.length > 0 && (
                    <div className="catalog-search-empty-popular">
                      <span>Try a popular search:</span>
                      <div className="catalog-popular-chips center">
                        {sortedPopularSearches.slice(0, 6).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="catalog-popular-chip"
                            onClick={() => handleApplyTerm(item.term)}
                          >
                            {item.term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ marginTop: '12px', padding: '8px 14px', fontSize: '12px' }}
                    onClick={() => {
                      setQuery('');
                      setAiResult(null);
                      inputRef.current?.focus();
                    }}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
