import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  X,
  ChevronRight,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import {
  type Product,
  type ScheduledOffer,
  type DiscountCampaign,
  type PopularSearchItem,
  calculateProductDiscount,
} from '../defaultData';
import { filterAndRankProducts } from '../firebase';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableProducts = useMemo(
    () => products.filter((p) => p && p.available !== false),
    [products]
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

  // Instant case-insensitive search across name, category, and keywords/description
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return filterAndRankProducts(availableProducts, query);
  }, [availableProducts, query]);

  // Live search suggestions generated dynamically while typing (matching Firebase popular searches + live product categories/names)
  const liveSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const seen = new Set<string>();
    const list: Array<{ label: string; kind: 'popular' | 'category' | 'product' }> = [];

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
  }, [query, sortedPopularSearches, availableProducts, searchResults]);

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
      if (searchResults.length > 0) {
        e.preventDefault();
        const target =
          highlightedIndex >= 0 && highlightedIndex < searchResults.length
            ? searchResults[highlightedIndex]
            : searchResults[0];
        handleChooseProduct(target);
      }
    }
  };

  const trimmedQuery = query.trim();

  return (
    <div className="catalog-search-wrap" ref={containerRef}>
      <div className={`catalog-search-bar ${isOpen ? 'is-focused' : ''}`}>
        <Search size={19} className="catalog-search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          className="catalog-search-input"
          placeholder="Search toys, cars, models..."
          aria-label="Search toys, cars, models"
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
        {query && (
          <button
            type="button"
            className="catalog-search-clear-btn"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
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
          aria-label="Popular searches and live product results"
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
                  Start typing to search toys by name, category, or keywords…
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Live Search Suggestions Bar while typing */}
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
                                <HighlightMatch text={product.name} query={trimmedQuery} />
                              </span>
                              <span className="catalog-search-result-cat">
                                <HighlightMatch
                                  text={product.category || 'Other'}
                                  query={trimmedQuery}
                                />
                              </span>
                            </div>
                            {product.description && (
                              <p className="catalog-search-result-desc">
                                <HighlightMatch text={product.description} query={trimmedQuery} />
                              </p>
                            )}
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
              ) : (
                <div className="catalog-search-empty" role="status">
                  <div className="catalog-search-empty-icon">🔍</div>
                  <h4>No products found</h4>
                  <p>
                    We couldn&apos;t find any toys matching{' '}
                    <strong>&ldquo;{trimmedQuery}&rdquo;</strong>.
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
