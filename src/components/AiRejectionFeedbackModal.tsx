import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Lock,
  ThumbsDown,
  X,
} from 'lucide-react';
import {
  AI_REJECTION_QUICK_REASONS,
  type AiLearningFeatureKey,
  type PendingAiRejectionDraft,
  getAiLearningFeatureName,
} from '../defaultData';

interface AiRejectionFeedbackModalProps {
  draft: PendingAiRejectionDraft | null;
  onSaveLearningRecord: (input: {
    featureKey: AiLearningFeatureKey;
    featureName?: string;
    originalRequest: string;
    rejectedResponse: string;
    ownerCorrection: string;
    productId?: string;
    productName?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export const AiRejectionFeedbackModal: React.FC<AiRejectionFeedbackModalProps> = ({
  draft,
  onSaveLearningRecord,
  onClose,
}) => {
  const [correctionText, setCorrectionText] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showFullContext, setShowFullContext] = useState<boolean>(false);

  useEffect(() => {
    if (draft) {
      setCorrectionText('');
      setErrorMsg('');
      setSaving(false);
      setShowFullContext(false);
    }
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        void handleDismissOnly();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  if (!draft) return null;

  const featureName = draft.featureName || getAiLearningFeatureName(draft.featureKey);

  const handleAppendQuickReason = (reason: string) => {
    setErrorMsg('');
    setCorrectionText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `${reason}: `;
      if (trimmed.toLowerCase().includes(reason.toLowerCase())) return prev;
      return `${trimmed}\n${reason}: `;
    });
  };

  const handleDismissOnly = async () => {
    if (saving) return;
    try {
      if (draft.onComplete) {
        await draft.onComplete(false);
      }
    } finally {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCorrection = correctionText.trim();
    if (!cleanCorrection) {
      setErrorMsg('Please tell Playnix AI what was wrong or how it should answer next time.');
      return;
    }

    setErrorMsg('');
    setSaving(true);
    try {
      await onSaveLearningRecord({
        featureKey: draft.featureKey,
        featureName,
        originalRequest: draft.originalRequest,
        rejectedResponse: draft.rejectedResponse,
        ownerCorrection: cleanCorrection,
        productId: draft.productId,
        productName: draft.productName,
      });

      if (draft.onComplete) {
        await draft.onComplete(true);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save this correction right now. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="playnix-learning-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playnix-learning-modal-title"
      onClick={() => void handleDismissOnly()}
    >
      <div
        className="playnix-learning-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="playnix-learning-modal-head">
          <div className="playnix-learning-modal-title-wrap">
            <span className="playnix-learning-modal-icon">
              <ThumbsDown size={17} />
            </span>
            <div>
              <div className="playnix-learning-modal-badges">
                <span className="playnix-ai-source-badge owner">{featureName}</span>
                {draft.productName && (
                  <span className="playnix-ai-prod-tag">{draft.productName}</span>
                )}
              </div>
              <h3 id="playnix-learning-modal-title">What was wrong with this AI response?</h3>
            </div>
          </div>

          <button
            type="button"
            className="playnix-learning-modal-close"
            onClick={() => void handleDismissOnly()}
            aria-label="Close feedback popup"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        <p className="playnix-learning-modal-sub">
          Your correction is saved privately for Playnix AI so it avoids repeating this mistake in future responses.
        </p>

        <div className="playnix-learning-context-box">
          <div className="playnix-learning-context-head">
            <span>
              <BookOpenCheck size={13} /> Rejected AI Exchange
            </span>
            <button
              type="button"
              className="playnix-learning-toggle-btn"
              onClick={() => setShowFullContext((prev) => !prev)}
            >
              {showFullContext ? 'Compact view' : 'Show full details'}
            </button>
          </div>
          <div className="playnix-learning-context-row">
            <strong>Original request:</strong>
            <p className={showFullContext ? 'expanded' : ''}>{draft.originalRequest}</p>
          </div>
          <div className="playnix-learning-context-row rejected">
            <strong>Rejected AI response:</strong>
            <p className={showFullContext ? 'expanded' : ''}>{draft.rejectedResponse}</p>
          </div>
        </div>

        <div className="playnix-learning-quick-chips">
          <span>Quick reasons:</span>
          <div className="playnix-learning-chip-list">
            {AI_REJECTION_QUICK_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className="playnix-learning-quick-chip"
                onClick={() => handleAppendQuickReason(reason)}
              >
                + {reason}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="playnix-learning-form">
          <label htmlFor="playnix-owner-correction-input">
            What was wrong / how should Playnix AI respond instead?
          </label>
          <textarea
            id="playnix-owner-correction-input"
            rows={3}
            maxLength={2000}
            value={correctionText}
            onChange={(e) => {
              setCorrectionText(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder='e.g. "Infinity Cube is always a Fidget toy, never Educational. Keep replies short and never guess dimensions not listed."'
            autoFocus
            required
          />
          <div className="playnix-learning-char-row">
            <span className="playnix-learning-privacy-pill">
              <Lock size={12} /> Private owner correction — never shown to customers
            </span>
            <span>{correctionText.length}/2000</span>
          </div>

          {errorMsg && (
            <div className="playnix-ai-alert warning" style={{ marginTop: 4 }}>
              <AlertTriangle size={16} />
              <div>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          <div className="playnix-learning-modal-actions">
            <button
              type="button"
              className="secondary-btn"
              disabled={saving}
              onClick={() => void handleDismissOnly()}
            >
              {draft.dismissLabel || 'Skip Without Saving'}
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={saving || !correctionText.trim()}
            >
              <CheckCircle2 size={15} />
              {saving ? 'Saving...' : 'Save & Teach AI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
