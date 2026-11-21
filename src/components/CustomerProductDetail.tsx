import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  HelpCircle,
  Maximize2,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import {
  type Product,
  type ScheduledOffer,
  type DiscountCampaign,
  calculateProductDiscount,
  formatTimeRemaining,
} from '../defaultData';
import { FullScreenImageGallery } from './FullScreenImageGallery';
import { ProductQuestionsSection } from './ProductQuestionsSection';

interface CustomerProductDetailProps {
  product: Product;
  activeOffer?: ScheduledOffer;
  activeDiscountCampaigns: DiscountCampaign[];
  currentTime: number;
  onBack: () => void;
  onBuyNow: (product: Product, activeOffer?: ScheduledOffer) => void;
  onAddToCart: (product: Product, activeOffer?: ScheduledOffer) => void;
  formatCurrency: (val: number) => string;
  customerId: string;
  defaultCustomerName?: string;
  onCustomerNameProvided?: (name: string) => void;
}

export const CustomerProductDetail: React.FC<CustomerProductDetailProps> = ({
  product,
  activeOffer,
  activeDiscountCampaigns,
  currentTime,
  onBack,
  onBuyNow,
  onAddToCart,
  formatCurrency,
  customerId,
  defaultCustomerName = '',
  onCustomerNameProvided,
}) => {
  const [imageIndex, setImageIndex] = useState<number>(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isFullScreenOpen, setIsFullScreenOpen] = useState<boolean>(false);
  const [justAdded, setJustAdded] = useState<boolean>(false);
  const [askQuestionTrigger, setAskQuestionTrigger] = useState<number>(0);
  const didSwipeRef = useRef<boolean>(false);

  useEffect(() => {
    setImageIndex(0);
    setIsFullScreenOpen(false);
    setAskQuestionTrigger(0);
  }, [product.id]);

  const urls =
    product.imageUrls && product.imageUrls.length > 0
      ? product.imageUrls
      : product.imageUrl
      ? [product.imageUrl]
      : [];

  const navigatePhoto = (delta: number) => {
    if (urls.length > 1) {
      setImageIndex((prev) => (prev + delta + urls.length) % urls.length);
    }
  };

  const openFullScreen = () => {
    if (urls.length === 0) return;
    setIsFullScreenOpen(true);
  };

  const isAvailable = product.available !== false;
  const campaignDiscount = calculateProductDiscount(product, activeDiscountCampaigns);
  const matchedCampaign = campaignDiscount.campaignId
    ? activeDiscountCampaigns.find((c) => c.id === campaignDiscount.campaignId)
    : undefined;

  const hasDiscount = Boolean(activeOffer || campaignDiscount.isDiscounted);
  const effectivePrice = activeOffer
    ? activeOffer.discountedPrice
    : campaignDiscount.isDiscounted
    ? campaignDiscount.discountedPrice
    : product.price;
  const originalPrice = product.price;
  const savingsAmount = Math.max(0, originalPrice - effectivePrice);
  const discountPct =
    originalPrice > 0 ? Math.round((savingsAmount / originalPrice) * 100) : 0;

  return (
    <section className="form-page product-detail-page" aria-label={`${product.name} details`}>
      <div className="product-detail-nav-bar">
        <a
          href="/"
          className="back-link"
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              onBack();
            }
          }}
        >
          <ArrowLeft size={16} /> Back to shop
        </a>

        <nav className="product-detail-breadcrumb" aria-label="Breadcrumb">
          <a
            href="/"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                onBack();
              }
            }}
          >
            Home
          </a>
          <span aria-hidden="true">/</span>
          <span>{product.category || 'Toys'}</span>
          <span aria-hidden="true">/</span>
          <span className="breadcrumb-current">{product.name}</span>
        </nav>
      </div>

      <div className="product-detail-card">
        {/* Left: Product Image Showcase */}
        <div className="product-detail-media">
          <div
            className={`product-detail-viewer ${urls.length > 0 ? 'is-zoomable' : ''}`}
            onTouchStart={(e) => {
              didSwipeRef.current = false;
              setTouchStartX(e.touches[0]?.clientX ?? null);
            }}
            onTouchEnd={(e) => {
              if (touchStartX !== null && e.changedTouches[0]) {
                const diff = e.changedTouches[0].clientX - touchStartX;
                if (Math.abs(diff) > 45) {
                  didSwipeRef.current = true;
                  navigatePhoto(diff < 0 ? 1 : -1);
                }
              }
              setTouchStartX(null);
            }}
            onClick={() => {
              if (didSwipeRef.current) {
                didSwipeRef.current = false;
                return;
              }
              openFullScreen();
            }}
          >
            {urls.length > 0 ? (
              <img
                src={urls[imageIndex] || urls[0]}
                alt={`${product.name}, photo ${imageIndex + 1}`}
                decoding="async"
                fetchPriority="high"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="gallery-placeholder">🧸</div>
            )}

            {activeOffer ? (
              <span className="catalog-card-offer-badge">
                <Sparkles size={10} style={{ display: 'inline', marginRight: '3px' }} /> SPECIAL OFFER
              </span>
            ) : campaignDiscount.isDiscounted ? (
              <span className="catalog-festival-badge">
                <Sparkles size={10} /> {campaignDiscount.discountLabel}
              </span>
            ) : null}

            {urls.length > 0 && (
              <button
                type="button"
                className="product-detail-zoom-btn"
                aria-label={`Open full-screen zoom for ${product.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openFullScreen();
                }}
              >
                <Maximize2 size={14} />
                <span>Zoom</span>
              </button>
            )}

            {urls.length > 1 && (
              <>
                <button
                  className="gallery-arrow gallery-prev"
                  type="button"
                  aria-label="Previous photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigatePhoto(-1);
                  }}
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  className="gallery-arrow gallery-next"
                  type="button"
                  aria-label="Next photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigatePhoto(1);
                  }}
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}
          </div>

          {urls.length > 1 && (
            <div className="product-detail-thumbs" aria-label="Product photo thumbnails">
              {urls.map((url, idx) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  className={`product-detail-thumb-btn ${idx === imageIndex ? 'active' : ''}`}
                  onClick={() => setImageIndex(idx)}
                  aria-label={`View photo ${idx + 1}`}
                >
                  <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Product Info & Actions */}
        <div className="product-detail-info">
          <div className="product-detail-meta-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="product-category">{product.category || 'Other'}</span>
              <span
                className={`product-detail-availability ${
                  isAvailable ? 'is-in-stock' : 'is-out-of-stock'
                }`}
              >
                <span className="availability-dot" aria-hidden="true" />
                {isAvailable ? 'In Stock · Available' : 'Currently Unavailable'}
              </span>
            </div>
            {urls.length > 1 && (
              <span className="gallery-counter">
                PHOTO {imageIndex + 1} OF {urls.length}
              </span>
            )}
          </div>

          <h1 className="product-detail-title">{product.name}</h1>

          {activeOffer ? (
            <div className="catalog-offer-timer-strip" style={{ width: 'fit-content', marginBottom: '12px' }}>
              <Clock size={12} /> {activeOffer.title} · Ends in{' '}
              {formatTimeRemaining(activeOffer.endAt, currentTime).formatted}
            </div>
          ) : campaignDiscount.isDiscounted && matchedCampaign ? (
            <div
              className="catalog-offer-timer-strip"
              style={{
                width: 'fit-content',
                marginBottom: '12px',
                color: '#b45309',
                background: '#fef3c7',
              }}
            >
              <Clock size={12} /> {matchedCampaign.name}:{' '}
              {formatTimeRemaining(matchedCampaign.endAt, currentTime).formatted}
            </div>
          ) : null}

          <div className="product-detail-price-box">
            {hasDiscount ? (
              <div className="product-detail-discount-wrap">
                <div className="product-detail-price-line">
                  <strong className="product-detail-price discounted">
                    {formatCurrency(effectivePrice)}
                  </strong>
                  <span className="product-detail-original-price">
                    {formatCurrency(originalPrice)}
                  </span>
                </div>
                <span className="product-detail-savings-pill">
                  Save {formatCurrency(savingsAmount)} ({discountPct}% OFF)
                </span>
              </div>
            ) : (
              <strong className="product-detail-price">{formatCurrency(product.price)}</strong>
            )}
          </div>

          <div className="product-detail-description">
            <h3>About this toy</h3>
            <p>{product.description || 'A fun new friend for playtime.'}</p>

            <dl className="product-detail-specs">
              <div>
                <dt>Category</dt>
                <dd>{product.category || 'Other'}</dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>{isAvailable ? 'In Stock (Ready to order)' : 'Currently Unavailable'}</dd>
              </div>
              <div>
                <dt>Photos</dt>
                <dd>{urls.length > 0 ? `${urls.length} photo${urls.length === 1 ? '' : 's'}` : 'Preview ready'}</dd>
              </div>
            </dl>

            {Array.isArray(product.highlights) && product.highlights.length > 0 && (
              <div className="product-detail-highlights">
                <h4>Key Highlights</h4>
                <ul className="product-detail-highlights-list">
                  {product.highlights.map((bullet, idx) => (
                    <li key={idx}>
                      <Check size={14} className="product-detail-hl-check" aria-hidden="true" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {!isAvailable && (
            <p className="product-detail-unavailable-note">
              This toy is temporarily out of stock or paused by the shop owner. Check back soon or browse more toys in the shop.
            </p>
          )}

          <div className="product-detail-actions">
            <button
              type="button"
              className="primary-btn product-detail-buy-btn"
              disabled={!isAvailable}
              onClick={() => isAvailable && onBuyNow(product, activeOffer)}
            >
              <ShoppingBag size={17} />
              {!isAvailable ? 'Unavailable' : hasDiscount ? 'Grab Deal' : 'Buy now'}
            </button>
            <button
              type="button"
              className={`secondary-btn product-detail-cart-btn ${justAdded ? 'is-just-added' : ''}`}
              disabled={!isAvailable}
              onClick={() => {
                if (!isAvailable) return;
                onAddToCart(product, activeOffer);
                setJustAdded(true);
                window.setTimeout(() => setJustAdded(false), 1100);
              }}
            >
              {justAdded ? <Check size={17} /> : <ShoppingCart size={17} />}
              {justAdded ? 'Added!' : 'Add to cart'}
            </button>
            <button
              type="button"
              className="secondary-btn product-detail-ask-btn"
              onClick={() => setAskQuestionTrigger((c) => c + 1)}
            >
              <HelpCircle size={17} />
              Ask a Question
            </button>
          </div>
        </div>
      </div>

      <ProductQuestionsSection
        product={product}
        customerId={customerId}
        defaultCustomerName={defaultCustomerName}
        onCustomerNameProvided={onCustomerNameProvided}
        externalOpenTrigger={askQuestionTrigger}
      />

      <FullScreenImageGallery
        isOpen={isFullScreenOpen}
        images={urls}
        initialIndex={imageIndex}
        productName={product.name}
        onClose={() => setIsFullScreenOpen(false)}
        onIndexChange={(idx) => setImageIndex(idx)}
      />
    </section>
  );
};
