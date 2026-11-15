import React, { useEffect, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';

export interface OrderCelebrationData {
  orderNumber: string;
  productName: string;
  totalPrice: number;
  quantity: number;
}

interface OrderSuccessCelebrationProps {
  celebration: OrderCelebrationData;
  formatCurrency: (val: number) => string;
  onDismiss: () => void;
}

const CONFETTI_PIECES = [
  { left: '6%', color: '#718d43', delay: '0ms', duration: '2400ms', drift: '-18px', rotate: '210deg' },
  { left: '12%', color: '#f59e0b', delay: '80ms', duration: '2700ms', drift: '22px', rotate: '-190deg' },
  { left: '18%', color: '#273824', delay: '140ms', duration: '2500ms', drift: '-14px', rotate: '260deg' },
  { left: '25%', color: '#16a34a', delay: '40ms', duration: '2800ms', drift: '28px', rotate: '310deg' },
  { left: '32%', color: '#fbbf24', delay: '180ms', duration: '2400ms', drift: '-24px', rotate: '-240deg' },
  { left: '39%', color: '#89a95b', delay: '60ms', duration: '2650ms', drift: '16px', rotate: '180deg' },
  { left: '46%', color: '#ef4444', delay: '120ms', duration: '2550ms', drift: '-20px', rotate: '-280deg' },
  { left: '53%', color: '#718d43', delay: '20ms', duration: '2750ms', drift: '24px', rotate: '220deg' },
  { left: '60%', color: '#f59e0b', delay: '160ms', duration: '2450ms', drift: '-16px', rotate: '300deg' },
  { left: '67%', color: '#3b82f6', delay: '90ms', duration: '2600ms', drift: '18px', rotate: '-210deg' },
  { left: '74%', color: '#89a95b', delay: '30ms', duration: '2850ms', drift: '-22px', rotate: '250deg' },
  { left: '81%', color: '#fbbf24', delay: '150ms', duration: '2500ms', drift: '20px', rotate: '-260deg' },
  { left: '88%', color: '#16a34a', delay: '70ms', duration: '2700ms', drift: '-15px', rotate: '195deg' },
  { left: '94%', color: '#273824', delay: '110ms', duration: '2600ms', drift: '14px', rotate: '-230deg' },
];

export const OrderSuccessCelebration: React.FC<OrderSuccessCelebrationProps> = ({
  celebration,
  formatCurrency,
  onDismiss,
}) => {
  const [showConfetti, setShowConfetti] = useState<boolean>(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  useEffect(() => {
    setShowConfetti(true);
    const timer = window.setTimeout(() => {
      setShowConfetti(false);
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [celebration.orderNumber]);

  return (
    <div className="order-success-celebration" role="status" aria-live="polite">
      {showConfetti && !prefersReducedMotion && (
        <div className="order-confetti-layer" aria-hidden="true">
          {CONFETTI_PIECES.map((piece, idx) => (
            <span
              key={idx}
              className="order-confetti-piece"
              style={
                {
                  left: piece.left,
                  backgroundColor: piece.color,
                  animationDelay: piece.delay,
                  animationDuration: piece.duration,
                  '--confetti-drift': piece.drift,
                  '--confetti-rotate': piece.rotate,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div className="order-success-content">
        <div className="order-success-check-wrap" aria-hidden="true">
          <span className="order-success-ring" />
          <span className="order-success-check-circle">
            <Check size={24} strokeWidth={3} />
          </span>
        </div>

        <div className="order-success-copy">
          <div className="order-success-eyebrow">
            <Sparkles size={13} /> ORDER CONFIRMED IN FIREBASE
          </div>
          <h2>Yay! Your order #{celebration.orderNumber} is placed!</h2>
          <p>
            <strong>{celebration.productName}</strong>
            {celebration.quantity > 1 ? ` (×${celebration.quantity})` : ''} ·{' '}
            <span>{formatCurrency(celebration.totalPrice)}</span>
          </p>
        </div>

        <button
          type="button"
          className="order-success-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss order confirmation"
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
