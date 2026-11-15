import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, ChevronRight, Sparkles, Tag, ArrowUpRight } from 'lucide-react';
import {
  type Product,
  type ScheduledOffer,
  type DiscountCampaign,
  calculateProductDiscount,
} from '../defaultData';
import { filterAndRankProducts } from '../firebase';

interface CustomerSearchBarProps {
  products: Product[];
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
          <mark key={idx} className="search-match-highlight">
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

  // Instant case-insensitive search across name, category, and keywords/description
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return filterAndRankProducts(availableProducts, query);
  }, [availableProducts, query]);

  // Dynamic category & keyword suggestions extracted from actual Firebase products
  const suggestions = useMemo(() => {
    const categoriesMap = new Map<string, number>();
    const keywordScores = new Map<string, number>();
    const stopWords = new Set([
      'with',
      'from',
      'that',
      'this',
      'your',
      'for',
      'and',
      'the',
      'card',
      'play',
      'new',
      'fun',
      'other',
    ]);

    for (const prod of availableProducts) {
      const cat = (prod.category || '').trim();
      if (cat) {
        categoriesMap.set(cat, (categoriesMap.get(cat) || 0) + 1);
      }
      const words = `${prod.name || ''} ${prod.description || ''}`
        .replace(/[^a-zA-Z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !stopWords.has(w.toLowerCase()));

      for (const word of words) {
        const lower = word.toLowerCase();
        if (!keywordScores.has(lower)) {
          keywordScores.set(lower, 1);
        } else {
          keywordScores.set(lower, (keywordScores.get(lower) || 0) + 1);
        }
      }
    }

    const categories = Array.from(categoriesMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
      .slice(0, 6);

    const popularTerms: string[] = [];
    const seenTerms = new Set(categories.map((c) => c.toLowerCase()));

    // Add concise product name prefixes / distinctive names from actual products
    for (const prod of availableProducts) {
      const cleanName = (prod.name || '').split('|')[0].trim();
      const shortPhrase = cleanName.split(/\s+/).slice(0, 2).join(' ');
      if (shortPhrase && !seenTerms.has(shortPhrase.toLowerCase())) {
        popularTerms.push(shortPhrase);
        seenTerms.add(shortPhrase.toLowerCase());
      }
      if (popularTerms.length >= 5) break;
    }

    // Add high-frequency keyword tokens if room remains
    const topWords = Array.from(keywordScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

    for (const word of topWords) {
      if (!seenTerms.has(word.toLowerCase())) {
        popularTerms.push(word);
        seenTerms.add(word.toLowerCase());
      }
      if (popularTerms.length >= 8) break;
    }

    return { categories, popularTerms };
  }, [availableProducts]);

  // Autocomplete suggestion chips matching current partial input
  const matchingSuggestionChips = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const pool = [...suggestions.categories, ...suggestions.popularTerms];
    const unique = new Map<string, string>();
    for (const item of pool) {
      const lower = item.toLowerCase();
      if (lower.includes(q) && lower !== q && !unique.has(lower)) {
        unique.set(lower, item);
      }
    }
    return Array.from(unique.values()).slice(0, 4);
  }, [query, suggestions]);

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

  const handleSelectSuggestion = (term: string) => {
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
    <section className="customer-search-section" aria-label="Search Playnix products">
      <div className="customer-search-container" ref={containerRef}>
        <div className={`customer-search-input-box ${isOpen ? 'is-focused' : ''}`}>
          <Search size={18} className="customer-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className="customer-search-input"
            placeholder="Search products..."
            aria-label="Search products"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            value={query}
            onFocus={() => {
              setIsOpen(true);
              onEnsureCloudProducts?.();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {isSyncingCloud && (
            <span className="customer-search-sync-tag" aria-live="polite">
              Syncing…
            </span>
          )}
          {query && (
            <button
              type="button"
              className="customer-search-clear-btn"
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

        {/* Instant Search Results & Suggestions Dropdown */}
        {isOpen && (
          <div className="customer-search-dropdown" role="listbox" aria-label="Search results and suggestions">
            {trimmedQuery === '' ? (
              <div className="search-suggestions-panel">
                {suggestions.categories.length > 0 && (
                  <div className="search-suggestion-group">
                    <span className="search-suggestion-label">
                      <Tag size={12} /> Browse by category
                    </span>
                    <div className="search-suggestion-chips">
                      {suggestions.categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className="search-suggestion-chip"
                          onClick={() => handleSelectSuggestion(cat)}
                        >
                          <Search size={12} /> {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {suggestions.popularTerms.length > 0 && (
                  <div className="search-suggestion-group">
                    <span className="search-suggestion-label">
                      <Sparkles size={12} /> Popular search suggestions
                    </span>
                    <div className="search-suggestion-chips">
                      {suggestions.popularTerms.map((term) => (
                        <button
                          key={term}
                          type="button"
                          className="search-suggestion-chip subtle"
                          onClick={() => handleSelectSuggestion(term)}
                        >
                          {term} <ArrowUpRight size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {matchingSuggestionChips.length > 0 && (
                  <div className="search-inline-suggestions">
                    <span>Suggestions:</span>
                    {matchingSuggestionChips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="search-inline-chip"
                        onClick={() => handleSelectSuggestion(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.length > 0 ? (
                  <>
                    <div className="search-results-meta">
                      <span>
                        Showing {searchResults.length}{' '}
                        {searchResults.length === 1 ? 'product' : 'products'} for{' '}
                        <strong>"{trimmedQuery}"</strong>
                      </span>
                      <span className="search-results-hint">Tap to open details</span>
                    </div>

                    <div className="search-results-list">
                      {searchResults.map((product, index) => {
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
                        const isHighlighted = index === highlightedIndex;

                        return (
                          <button
                            key={product.id}
                            type="button"
                            role="option"
                            aria-selected={isHighlighted}
                            className={`search-result-item ${isHighlighted ? 'is-highlighted' : ''}`}
                            onClick={() => handleChooseProduct(product)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                          >
                            <div className="search-result-thumb">
                              {firstImg ? (
                                <img src={firstImg} alt={product.name} loading="lazy" />
                              ) : (
                                <span>🧸</span>
                              )}
                            </div>

                            <div className="search-result-info">
                              <div className="search-result-title-row">
                                <span className="search-result-name">
                                  <HighlightMatch text={product.name} query={trimmedQuery} />
                                </span>
                                <span className="search-result-category">
                                  <HighlightMatch
                                    text={product.category || 'Other'}
                                    query={trimmedQuery}
                                  />
                                </span>
                              </div>
                              {product.description && (
                                <p className="search-result-desc">
                                  <HighlightMatch text={product.description} query={trimmedQuery} />
                                </p>
                              )}
                            </div>

                            <div className="search-result-price-col">
                              {hasDiscount ? (
                                <>
                                  <span className="search-result-price discounted">
                                    {formatCurrency(effectivePrice)}
                                  </span>
                                  <span className="search-result-old-price">
                                    {formatCurrency(product.price)}
                                  </span>
                                </>
                              ) : (
                                <span className="search-result-price">
                                  {formatCurrency(product.price)}
                                </span>
                              )}
                              <ChevronRight size={16} className="search-result-arrow" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="search-empty-state" role="status">
                    <div className="search-empty-icon">🔍</div>
                    <h4>No products found</h4>
                    <p>
                      No products matched <strong>"{trimmedQuery}"</strong>. Try another name,
                      category, or keyword.
                    </p>

                    {(suggestions.categories.length > 0 || suggestions.popularTerms.length > 0) && (
                      <div className="search-empty-suggestions">
                        <span>Try searching for:</span>
                        <div className="search-suggestion-chips center">
                          {[...suggestions.categories, ...suggestions.popularTerms]
                            .slice(0, 5)
                            .map((term) => (
                              <button
                                key={term}
                                type="button"
                                className="search-suggestion-chip"
                                onClick={() => handleSelectSuggestion(term)}
                              >
                                {term}
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
    </section>
  );
};
