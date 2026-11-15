import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type Product } from '../defaultData';

interface HeroToyShowcaseProps {
  products: Product[];
  isHomeVisible: boolean;
  onSelectProduct?: (product: Product) => void;
}

interface HeroShowcaseSlide {
  key: string;
  title: string;
  subtitle: string;
  type: 'teddy' | 'product';
  imageUrl?: string;
  product?: Product;
}

const FEATURED_KEYWORDS = [
  'lamborghini',
  'gtr',
  'nissan',
  'ferrari',
  'car',
  '3d',
  'spider',
  'mini',
  'battleship',
];

function getFeaturedScore(product: Product): number {
  const haystack = `${product.name} ${product.category} ${product.description}`.toLowerCase();
  for (let i = 0; i < FEATURED_KEYWORDS.length; i += 1) {
    if (haystack.includes(FEATURED_KEYWORDS[i])) {
      return i;
    }
  }
  return FEATURED_KEYWORDS.length + 1;
}

export const HeroToyShowcase: React.FC<HeroToyShowcaseProps> = ({
  products,
  isHomeVisible,
  onSelectProduct,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [exitingSlide, setExitingSlide] = useState<HeroShowcaseSlide | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [isInViewport, setIsInViewport] = useState<boolean>(true);
  const [isTabVisible, setIsTabVisible] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  // Build dynamic showcase queue: Teddy bear first, then real available Firebase products
  const slides = useMemo<HeroShowcaseSlide[]>(() => {
    const teddySlide: HeroShowcaseSlide = {
      key: 'hero-teddy-bear',
      title: 'Teddy Bear',
      subtitle: 'Classic Playtime Favourite',
      type: 'teddy',
    };

    const availableWithImages = (products || [])
      .filter((p) => {
        if (p.available === false) return false;
        const primary = (p.imageUrls && p.imageUrls[0]) || p.imageUrl || '';
        return Boolean(primary && !failedImages[primary]);
      })
      .sort((a, b) => {
        const scoreDiff = getFeaturedScore(a) - getFeaturedScore(b);
        if (scoreDiff !== 0) return scoreDiff;
        return a.name.localeCompare(b.name);
      });

    const seenIds = new Set<string>();
    const productSlides: HeroShowcaseSlide[] = [];

    for (const prod of availableWithImages) {
      if (seenIds.has(prod.id)) continue;
      seenIds.add(prod.id);
      const img = (prod.imageUrls && prod.imageUrls[0]) || prod.imageUrl;
      if (!img) continue;
      productSlides.push({
        key: `hero-prod-${prod.id}`,
        title: prod.name,
        subtitle: prod.category || 'Toy Shelf',
        type: 'product',
        imageUrl: img,
        product: prod,
      });
      if (productSlides.length >= 10) break;
    }

    return [teddySlide, ...productSlides];
  }, [products, failedImages]);

  // Listen to prefers-reduced-motion changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mq.matches);
    handleChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  // Pause rotation when browser tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      setIsTabVisible(document.visibilityState !== 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Pause rotation when hero section is scrolled offscreen
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInViewport(entry.isIntersecting);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Clamp index if product list shrinks
  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [slides.length, activeIndex]);

  // Clear exiting slide cleanly after CSS transition finishes
  useEffect(() => {
    if (!exitingSlide) return;
    const timer = window.setTimeout(() => {
      setExitingSlide(null);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [exitingSlide]);

  // Automatic rotation every 2.6 seconds
  const shouldRotate =
    isHomeVisible &&
    isInViewport &&
    isTabVisible &&
    !prefersReducedMotion &&
    slides.length > 1;

  useEffect(() => {
    if (!shouldRotate) return;
    const interval = window.setInterval(() => {
      setActiveIndex((prev) => {
        const currentSlide = slides[prev];
        if (currentSlide) {
          setExitingSlide(currentSlide);
        }
        return (prev + 1) % slides.length;
      });
    }, 2600);

    return () => window.clearInterval(interval);
  }, [shouldRotate, slides]);

  const activeSlide = slides[activeIndex] || slides[0];

  const renderSlideVisual = (slide: HeroShowcaseSlide, stateClass: 'is-entering' | 'is-exiting') => {
    if (slide.type === 'teddy') {
      return (
        <div
          key={`${slide.key}-${stateClass}`}
          className={`hero-showcase-slide ${stateClass}`}
          aria-hidden={stateClass === 'is-exiting'}
        >
          <div className="hero-toy-float-wrap">
            <div className="toy-emoji hero-teddy-emoji" role="img" aria-label="Teddy bear">
              🧸
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={`${slide.key}-${stateClass}`}
        className={`hero-showcase-slide ${stateClass}`}
        aria-hidden={stateClass === 'is-exiting'}
      >
        <div className="hero-toy-float-wrap">
          <div
            className={`hero-product-frame ${
              stateClass === 'is-entering' && onSelectProduct && slide.product ? 'is-clickable' : ''
            }`}
            onClick={() => {
              if (stateClass === 'is-entering' && onSelectProduct && slide.product) {
                onSelectProduct(slide.product);
              }
            }}
            title={
              stateClass === 'is-entering' && slide.product
                ? `View ${slide.product.name}`
                : undefined
            }
          >
            <img
              src={slide.imageUrl}
              alt={slide.title}
              className="hero-product-img"
              decoding="async"
              fetchPriority="high"
              onError={() => {
                if (slide.imageUrl) {
                  setFailedImages((prev) => ({ ...prev, [slide.imageUrl!]: true }));
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`hero-art ${!isInViewport || !isTabVisible || prefersReducedMotion ? 'is-motion-paused' : ''}`}
    >
      <div className="sun-shape" aria-hidden="true"></div>

      <div className="hero-showcase-stage" aria-live="off">
        {exitingSlide && exitingSlide.key !== activeSlide.key && renderSlideVisual(exitingSlide, 'is-exiting')}
        {renderSlideVisual(activeSlide, 'is-entering')}
      </div>

      <div className="floating-card card-one">
        🚀 <span>Ready for fun?</span>
      </div>
      <div className="floating-card card-two">
        ⭐ <span>Pick your favourite</span>
      </div>

      <div className="hero-caption">
        <span>{activeSlide.type === 'product' ? activeSlide.title.toUpperCase() : 'PLAY MORE. SMILE MORE.'}</span>
      </div>
    </div>
  );
};
