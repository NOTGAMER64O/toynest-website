import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface FullScreenImageGalleryProps {
  isOpen: boolean;
  images: string[];
  initialIndex: number;
  productName: string;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

type GestureMode = 'none' | 'swipe' | 'pan' | 'pinch';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const FullScreenImageGallery: React.FC<FullScreenImageGalleryProps> = ({
  isOpen,
  images,
  initialIndex,
  productName,
  onClose,
  onIndexChange,
}) => {
  const safeLength = images.length;
  const normalizedInitial =
    safeLength > 0 ? clamp(initialIndex, 0, safeLength - 1) : 0;

  const [activeIndex, setActiveIndex] = useState<number>(normalizedInitial);
  const [scale, setScale] = useState<number>(1);
  const [translate, setTranslate] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [swipeOffsetX, setSwipeOffsetX] = useState<number>(0);
  const [animateTransform, setAnimateTransform] = useState<boolean>(true);
  const [isMouseDragging, setIsMouseDragging] = useState<boolean>(false);
  const [loadedSrcs, setLoadedSrcs] = useState<Record<string, boolean>>({});
  const [failedSrcs, setFailedSrcs] = useState<Record<string, boolean>>({});

  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Mutable live view state to prevent stale closures during 60fps gestures
  const viewRef = useRef<{ scale: number; x: number; y: number }>({
    scale: 1,
    x: 0,
    y: 0,
  });
  const gestureRef = useRef<{
    mode: GestureMode;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    startTime: number;
    startDist: number;
    startMidX: number;
    startMidY: number;
    startScale: number;
    didDrag: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    startTime: 0,
    startDist: 1,
    startMidX: 0,
    startMidY: 0,
    startScale: 1,
    didDrag: false,
  });
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });
  const lastTouchEndTimeRef = useRef<number>(0);

  const updateView = useCallback(
    (nextScale: number, nextX: number, nextY: number, animate: boolean) => {
      viewRef.current = { scale: nextScale, x: nextX, y: nextY };
      setAnimateTransform(animate);
      setScale(nextScale);
      setTranslate({ x: nextX, y: nextY });
    },
    []
  );

  // Compute accurate pan bounds from the stage rect and image natural dimensions
  const clampTranslation = useCallback(
    (tx: number, ty: number, targetScale: number) => {
      if (targetScale <= 1.01) return { x: 0, y: 0 };

      const stage = stageRef.current;
      if (!stage) return { x: 0, y: 0 };

      const rect = stage.getBoundingClientRect();
      const stageW = rect.width;
      const stageH = rect.height;

      const img = imgRef.current;
      let baseW = stageW;
      let baseH = stageH;

      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const fitRatio = Math.min(
          stageW / img.naturalWidth,
          stageH / img.naturalHeight
        );
        baseW = img.naturalWidth * fitRatio;
        baseH = img.naturalHeight * fitRatio;
      }

      const maxX = Math.max(0, (baseW * targetScale - stageW) / 2);
      const maxY = Math.max(0, (baseH * targetScale - stageH) / 2);

      return {
        x: clamp(tx, -maxX, maxX),
        y: clamp(ty, -maxY, maxY),
      };
    },
    []
  );

  const zoomAtPoint = useCallback(
    (
      targetScaleRaw: number,
      clientX?: number,
      clientY?: number,
      animate = true
    ) => {
      const targetScale = clamp(targetScaleRaw, MIN_SCALE, MAX_SCALE);
      if (targetScale <= 1.02) {
        updateView(1, 0, 0, animate);
        return;
      }

      const stage = stageRef.current;
      const prev = viewRef.current;

      if (!stage || clientX === undefined || clientY === undefined) {
        const clamped = clampTranslation(prev.x, prev.y, targetScale);
        updateView(targetScale, clamped.x, clamped.y, animate);
        return;
      }

      const rect = stage.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const fx = clientX - cx;
      const fy = clientY - cy;
      const ratio = targetScale / Math.max(prev.scale, 0.01);

      const rawX = fx - (fx - prev.x) * ratio;
      const rawY = fy - (fy - prev.y) * ratio;
      const clamped = clampTranslation(rawX, rawY, targetScale);

      updateView(targetScale, clamped.x, clamped.y, animate);
    },
    [clampTranslation, updateView]
  );

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (safeLength <= 0) return;
      const wrapped = ((nextIndex % safeLength) + safeLength) % safeLength;
      setActiveIndex(wrapped);
      setSwipeOffsetX(0);
      updateView(1, 0, 0, false);
      onIndexChange?.(wrapped);
    },
    [safeLength, onIndexChange, updateView]
  );

  // Sync active index and reset zoom when opened
  useEffect(() => {
    if (isOpen) {
      const startIdx = safeLength > 0 ? clamp(initialIndex, 0, safeLength - 1) : 0;
      setActiveIndex(startIdx);
      setSwipeOffsetX(0);
      updateView(1, 0, 0, false);
    }
  }, [isOpen, initialIndex, safeLength, updateView]);

  // Preload adjacent gallery images in full resolution for instant transitions
  useEffect(() => {
    if (!isOpen || safeLength <= 1) return;
    const prevIdx = (activeIndex - 1 + safeLength) % safeLength;
    const nextIdx = (activeIndex + 1) % safeLength;
    const toPreload = [images[nextIdx], images[prevIdx]].filter(Boolean);

    toPreload.forEach((src) => {
      const img = new window.Image();
      img.decoding = 'async';
      img.src = src;
    });
  }, [isOpen, activeIndex, images, safeLength]);

  // Mark already-cached images as loaded immediately
  useEffect(() => {
    if (!isOpen || safeLength === 0) return;
    const src = images[activeIndex] || images[0];
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0 && !loadedSrcs[src]) {
      setLoadedSrcs((prev) => ({ ...prev, [src]: true }));
    }
  }, [isOpen, activeIndex, images, safeLength, loadedSrcs]);

  // Scroll active thumbnail into view cleanly
  useEffect(() => {
    if (!isOpen) return;
    const activeThumb = thumbRefs.current[activeIndex];
    if (activeThumb) {
      activeThumb.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [isOpen, activeIndex]);

  // Lock background page scroll cleanly on Android, iOS, and desktop while open
  useEffect(() => {
    if (!isOpen) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [isOpen]);

  // Non-passive touchmove blocker on backdrop/stage so mobile browsers never scroll behind
  useEffect(() => {
    if (!isOpen) return;
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const preventScroll = (e: TouchEvent) => {
      e.preventDefault();
    };

    stageEl.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      stageEl.removeEventListener('touchmove', preventScroll);
    };
  }, [isOpen]);

  // Non-passive wheel zoom on desktop trackpads & mice
  useEffect(() => {
    if (!isOpen) return;
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const prevScale = viewRef.current.scale;
      const factor = 1 - e.deltaY * 0.0022;
      const nextScale = clamp(prevScale * factor, MIN_SCALE, MAX_SCALE);
      zoomAtPoint(nextScale, e.clientX, e.clientY, false);
    };

    stageEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      stageEl.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, zoomAtPoint]);

  // Keyboard shortcuts (Escape, Arrows, +, -, 0)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && safeLength > 1) {
        e.preventDefault();
        goToSlide(activeIndex - 1);
      } else if (e.key === 'ArrowRight' && safeLength > 1) {
        e.preventDefault();
        goToSlide(activeIndex + 1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomAtPoint(viewRef.current.scale + 0.6, undefined, undefined, true);
      } else if (e.key === '-') {
        e.preventDefault();
        zoomAtPoint(viewRef.current.scale - 0.6, undefined, undefined, true);
      } else if (e.key === '0') {
        e.preventDefault();
        updateView(1, 0, 0, true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, activeIndex, safeLength, goToSlide, onClose, zoomAtPoint, updateView]);

  // Mouse pan dragging when zoomed in on desktop
  useEffect(() => {
    if (!isMouseDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const g = gestureRef.current;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.hypot(dx, dy) > 4) {
        g.didDrag = true;
      }
      const clamped = clampTranslation(
        g.originX + dx,
        g.originY + dy,
        viewRef.current.scale
      );
      updateView(viewRef.current.scale, clamped.x, clamped.y, false);
    };

    const handleMouseUp = () => {
      setIsMouseDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMouseDragging, clampTranslation, updateView]);

  if (!isOpen || safeLength === 0) return null;

  const currentSrc = images[activeIndex] || images[0];
  const isCurrentLoaded = Boolean(loadedSrcs[currentSrc]);
  const isCurrentFailed = Boolean(failedSrcs[currentSrc]);
  const isZoomed = scale > 1.04;

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touches = e.touches;
    const g = gestureRef.current;

    if (touches.length === 2) {
      const t1 = touches[0];
      const t2 = touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      g.mode = 'pinch';
      g.didDrag = true;
      g.startDist = Math.max(dist, 1);
      g.startMidX = midX;
      g.startMidY = midY;
      g.startScale = viewRef.current.scale;
      g.originX = viewRef.current.x;
      g.originY = viewRef.current.y;
      setSwipeOffsetX(0);
      return;
    }

    if (touches.length === 1) {
      const t = touches[0];
      g.didDrag = false;
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.originX = viewRef.current.x;
      g.originY = viewRef.current.y;
      g.startTime = performance.now();
      g.mode = viewRef.current.scale > 1.04 ? 'pan' : 'swipe';
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touches = e.touches;
    const g = gestureRef.current;

    if (touches.length === 2) {
      const t1 = touches[0];
      const t2 = touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      if (g.mode !== 'pinch') {
        g.mode = 'pinch';
        g.startDist = Math.max(dist, 1);
        g.startMidX = midX;
        g.startMidY = midY;
        g.startScale = viewRef.current.scale;
        g.originX = viewRef.current.x;
        g.originY = viewRef.current.y;
        return;
      }

      const ratio = dist / g.startDist;
      const nextScale = clamp(g.startScale * ratio, 0.85, MAX_SCALE);

      const stage = stageRef.current;
      if (stage) {
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const fx0 = g.startMidX - cx;
        const fy0 = g.startMidY - cy;
        const fx1 = midX - cx;
        const fy1 = midY - cy;
        const k = nextScale / Math.max(g.startScale, 0.01);

        const rawX = fx1 - (fx0 - g.originX) * k;
        const rawY = fy1 - (fy0 - g.originY) * k;
        const clamped =
          nextScale > 1
            ? clampTranslation(rawX, rawY, nextScale)
            : { x: 0, y: 0 };

        updateView(nextScale, clamped.x, clamped.y, false);
      }
      return;
    }

    if (touches.length === 1) {
      const t = touches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      if (Math.hypot(dx, dy) > 6) {
        g.didDrag = true;
      }

      if (g.mode === 'pan') {
        const clamped = clampTranslation(
          g.originX + dx,
          g.originY + dy,
          viewRef.current.scale
        );
        updateView(viewRef.current.scale, clamped.x, clamped.y, false);
      } else if (g.mode === 'swipe' && safeLength > 1) {
        if (Math.abs(dx) > Math.abs(dy) * 0.85) {
          setAnimateTransform(false);
          setSwipeOffsetX(dx);
        }
      }
    }
  };

  const handleStageTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    const now = performance.now();
    lastTouchEndTimeRef.current = now;

    // Seamless transition from 2-finger pinch back to 1-finger pan while zoomed in
    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (viewRef.current.scale > 1.04) {
        g.mode = 'pan';
        g.startX = t.clientX;
        g.startY = t.clientY;
        g.originX = viewRef.current.x;
        g.originY = viewRef.current.y;
      } else {
        g.mode = 'none';
        updateView(1, 0, 0, true);
      }
      return;
    }

    if (e.touches.length === 0) {
      if (g.mode === 'pinch') {
        if (viewRef.current.scale < 1.04) {
          updateView(1, 0, 0, true);
        } else {
          const clamped = clampTranslation(
            viewRef.current.x,
            viewRef.current.y,
            viewRef.current.scale
          );
          updateView(viewRef.current.scale, clamped.x, clamped.y, true);
        }
        g.mode = 'none';
        return;
      }

      const changed = e.changedTouches[0];

      // Handle swipe between photos when at 1x zoom
      if (g.mode === 'swipe' && changed) {
        const dx = changed.clientX - g.startX;
        const dy = changed.clientY - g.startY;
        const dt = Math.max(now - g.startTime, 1);
        const velocity = Math.abs(dx) / dt;

        const shouldSwitchSlide =
          safeLength > 1 &&
          Math.abs(dx) > Math.abs(dy) &&
          (Math.abs(dx) > 52 || (Math.abs(dx) > 22 && velocity > 0.35));

        if (shouldSwitchSlide) {
          goToSlide(dx < 0 ? activeIndex + 1 : activeIndex - 1);
          g.mode = 'none';
          return;
        }
        setAnimateTransform(true);
        setSwipeOffsetX(0);
      }

      // Double-tap to zoom in/out centered on tap point
      if (!g.didDrag && changed) {
        const dtTap = now - lastTapRef.current.time;
        const distTap = Math.hypot(
          changed.clientX - lastTapRef.current.x,
          changed.clientY - lastTapRef.current.y
        );

        if (dtTap > 0 && dtTap < 300 && distTap < 30) {
          lastTapRef.current = { time: 0, x: 0, y: 0 };
          if (viewRef.current.scale > 1.05) {
            updateView(1, 0, 0, true);
          } else {
            zoomAtPoint(DOUBLE_TAP_SCALE, changed.clientX, changed.clientY, true);
          }
        } else {
          lastTapRef.current = {
            time: now,
            x: changed.clientX,
            y: changed.clientY,
          };
        }
      }

      g.mode = 'none';
    }
  };

  const handleStageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore synthetic double-click immediately after touch interactions
    if (performance.now() - lastTouchEndTimeRef.current < 550) {
      return;
    }
    e.stopPropagation();
    if (viewRef.current.scale > 1.05) {
      updateView(1, 0, 0, true);
    } else {
      zoomAtPoint(DOUBLE_TAP_SCALE, e.clientX, e.clientY, true);
    }
  };

  const handleImageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || viewRef.current.scale <= 1.04) return;
    e.preventDefault();
    e.stopPropagation();
    const g = gestureRef.current;
    g.didDrag = false;
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.originX = viewRef.current.x;
    g.originY = viewRef.current.y;
    setAnimateTransform(false);
    setIsMouseDragging(true);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close on intentional click directly on empty stage background while unzoomed
    if (
      e.target === stageRef.current &&
      !gestureRef.current.didDrag &&
      viewRef.current.scale <= 1.04
    ) {
      onClose();
    }
    gestureRef.current.didDrag = false;
  };

  const transformString =
    scale <= 1.01
      ? `translate3d(${swipeOffsetX}px, 0px, 0px) scale(1)`
      : `translate3d(${translate.x}px, ${translate.y}px, 0px) scale(${scale})`;

  const galleryMarkup = (
    <div
      ref={overlayRef}
      className="fs-gallery-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} full-screen photo gallery`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Toolbar */}
      <header className="fs-gallery-topbar">
        <div className="fs-gallery-meta">
          <span className="fs-gallery-counter" aria-live="polite">
            {activeIndex + 1}/{safeLength}
          </span>
          <span className="fs-gallery-title">{productName}</span>
        </div>

        <div className="fs-gallery-controls">
          <button
            type="button"
            className="fs-gallery-tool-btn"
            aria-label="Zoom out"
            title="Zoom out (-)"
            disabled={scale <= 1.02}
            onClick={() => zoomAtPoint(scale - 0.65, undefined, undefined, true)}
          >
            <ZoomOut size={18} />
          </button>

          <button
            type="button"
            className="fs-gallery-zoom-readout"
            aria-label="Reset zoom"
            title="Reset zoom (0)"
            disabled={!isZoomed}
            onClick={() => updateView(1, 0, 0, true)}
          >
            {isZoomed ? (
              <>
                <RotateCcw size={13} /> {Math.round(scale * 100)}%
              </>
            ) : (
              '100%'
            )}
          </button>

          <button
            type="button"
            className="fs-gallery-tool-btn"
            aria-label="Zoom in"
            title="Zoom in (+)"
            disabled={scale >= MAX_SCALE - 0.02}
            onClick={() => zoomAtPoint(scale + 0.65, undefined, undefined, true)}
          >
            <ZoomIn size={18} />
          </button>

          <button
            type="button"
            className="fs-gallery-close-btn"
            aria-label="Close full-screen gallery"
            title="Close (Esc)"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
      </header>

      {/* Main Interactive Zoom & Swipe Stage */}
      <div
        ref={stageRef}
        className={`fs-gallery-stage ${
          isZoomed
            ? isMouseDragging
              ? 'is-grabbing'
              : 'is-zoomed'
            : 'is-unzoomed'
        }`}
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageTouchEnd}
        onTouchCancel={handleStageTouchEnd}
        onDoubleClick={handleStageDoubleClick}
        onMouseDown={handleImageMouseDown}
        onClick={handleBackdropClick}
      >
        {!isCurrentLoaded && !isCurrentFailed && (
          <div className="fs-gallery-spinner" aria-label="Loading image" />
        )}

        {isCurrentFailed ? (
          <div className="fs-gallery-fallback">
            <span>🧸</span>
            <p>Unable to load this photo</p>
          </div>
        ) : (
          <div
            className={`fs-gallery-transform-layer ${
              animateTransform ? 'is-animated' : ''
            }`}
            style={{ transform: transformString }}
          >
            <img
              ref={imgRef}
              key={`${currentSrc}-${activeIndex}`}
              src={currentSrc}
              alt={`${productName}, photo ${activeIndex + 1} of ${safeLength}`}
              className="fs-gallery-image"
              draggable={false}
              decoding="async"
              fetchPriority="high"
              referrerPolicy="no-referrer"
              onLoad={() =>
                setLoadedSrcs((prev) =>
                  prev[currentSrc] ? prev : { ...prev, [currentSrc]: true }
                )
              }
              onError={() =>
                setFailedSrcs((prev) =>
                  prev[currentSrc] ? prev : { ...prev, [currentSrc]: true }
                )
              }
            />
          </div>
        )}

        {/* Next / Previous Navigation Arrows */}
        {safeLength > 1 && (
          <>
            <button
              type="button"
              className="fs-gallery-arrow fs-gallery-prev"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                goToSlide(activeIndex - 1);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              className="fs-gallery-arrow fs-gallery-next"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                goToSlide(activeIndex + 1);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <ChevronRight size={26} />
            </button>
          </>
        )}

        {!isZoomed && (
          <div className="fs-gallery-hint" aria-hidden="true">
            Pinch or double-tap to zoom{safeLength > 1 ? ' · Swipe or use arrows' : ''}
          </div>
        )}
      </div>

      {/* Bottom Thumbnail Preview Strip */}
      {safeLength > 1 && (
        <footer className="fs-gallery-footer">
          <div
            className="fs-gallery-thumbs-strip"
            role="tablist"
            aria-label="Product photo thumbnails"
          >
            {images.map((url, idx) => (
              <button
                key={`${url}-${idx}`}
                ref={(el) => {
                  thumbRefs.current[idx] = el;
                }}
                type="button"
                role="tab"
                aria-selected={idx === activeIndex}
                aria-label={`View photo ${idx + 1} of ${safeLength}`}
                className={`fs-gallery-thumb-btn ${
                  idx === activeIndex ? 'is-active' : ''
                }`}
                onClick={() => goToSlide(idx)}
              >
                <img src={url} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );

  return createPortal(galleryMarkup, document.body);
};
