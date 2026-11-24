import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  XCircle,
} from 'lucide-react';
import { type Order, type PendingAiRejectionDraft, formatInIST } from '../defaultData';

interface OrderVerificationCardProps {
  order: Order;
  compactSummary?: boolean;
  inspecting?: boolean;
  savingDecision?: boolean;
  onApproveOrder: (order: Order, ownerNote?: string) => Promise<void>;
  onRequestClarification: (order: Order, clarificationMessage: string) => Promise<void>;
  onRejectOrder: (order: Order, reason?: string) => Promise<void>;
  onReinspectOrder?: (order: Order) => Promise<void>;
  onRejectAiAssessment?: (draft: PendingAiRejectionDraft) => void;
  onJumpToOrder?: (order: Order) => void;
}

export const OrderVerificationCard: React.FC<OrderVerificationCardProps> = ({
  order,
  compactSummary = false,
  inspecting = false,
  savingDecision = false,
  onApproveOrder,
  onRequestClarification,
  onRejectOrder,
  onReinspectOrder,
  onRejectAiAssessment,
  onJumpToOrder,
}) => {
  const v = order.aiVerification;
  const isFlagged = Boolean(v && (v.riskLevel === 'HIGH' || v.riskLevel === 'MEDIUM' || v.decisionStatus === 'clarification_requested' || v.decisionStatus === 'rejected'));
  const [expanded, setExpanded] = useState<boolean>(
    compactSummary || (Boolean(v) && v?.decisionStatus !== 'auto_approved' && v?.decisionStatus !== 'approved')
  );
  const [activeAction, setActiveAction] = useState<'none' | 'clarify' | 'reject'>('none');
  const [clarifyDraft, setClarifyDraft] = useState<string>(
    () =>
      v?.clarificationMessage ||
      `Hi ${order.name || 'there'}, could you please verify your details for order ${order.orderNumber} so we can process it smoothly?`
  );
  const [rejectReasonDraft, setRejectReasonDraft] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  if (!v && !onReinspectOrder) return null;

  const riskLevel = v?.riskLevel || 'LOW';
  const decisionStatus = v?.decisionStatus || 'auto_approved';

  const palette =
    decisionStatus === 'rejected'
      ? { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', badgeBg: '#fee2e2', label: 'REJECTED BY OWNER' }
      : decisionStatus === 'approved'
      ? { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', badgeBg: '#dcfce7', label: 'OWNER APPROVED' }
      : decisionStatus === 'clarification_requested'
      ? { bg: '#fffbeb', border: '#fde68a', text: '#92400e', badgeBg: '#fef3c7', label: 'AWAITING CLARIFICATION' }
      : riskLevel === 'HIGH'
      ? { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', badgeBg: '#fee2e2', label: 'HIGH RISK · HELD FOR REVIEW' }
      : riskLevel === 'MEDIUM'
      ? { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', badgeBg: '#fef3c7', label: 'MEDIUM RISK · VERIFY' }
      : { bg: '#f4f6ec', border: '#dfe5cd', text: '#2f3d24', badgeBg: '#e4ebd3', label: 'LOW RISK · VERIFIED' };

  const handleSubmitClarify = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = clarifyDraft.trim();
    if (!msg) {
      setActionError('Please enter a polite message asking the customer to verify or correct their information.');
      return;
    }
    setActionError('');
    await onRequestClarification(order, msg);
    setActiveAction('none');
  };

  const handleConfirmReject = async () => {
    setActionError('');
    await onRejectOrder(
      order,
      rejectReasonDraft.trim() || 'Cancelled by owner after AI verification review.'
    );
    setActiveAction('none');
  };

  if (!v) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          borderRadius: 10,
          background: '#f8faf5',
          border: '1px dashed #cfd8bd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: '#55634a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} /> Not inspected yet by Playnix AI
        </span>
        {onReinspectOrder && (
          <button
            type="button"
            className="secondary-btn"
            style={{ padding: '5px 10px', fontSize: 12 }}
            disabled={inspecting}
            onClick={() => void onReinspectOrder(order)}
          >
            <RefreshCw size={12} className={inspecting ? 'refresh-spinning' : ''} />
            {inspecting ? 'Inspecting…' : 'Inspect with Playnix AI'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: compactSummary ? 0 : 12,
        borderRadius: 12,
        background: palette.bg,
        border: `1.5px solid ${palette.border}`,
        padding: '11px 13px',
        color: '#1f2937',
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.03em',
              padding: '3px 9px',
              borderRadius: 999,
              background: palette.badgeBg,
              color: palette.text,
            }}
          >
            {riskLevel === 'HIGH' ? (
              <ShieldAlert size={13} />
            ) : riskLevel === 'MEDIUM' ? (
              <AlertTriangle size={13} />
            ) : (
              <ShieldCheck size={13} />
            )}
            {palette.label}
          </span>

          <span style={{ fontSize: 11, fontWeight: 700, color: '#4b5563' }}>
            AI Confidence: <strong>{v.confidence}%</strong>
          </span>

          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(0,0,0,0.08)',
              color: palette.text,
            }}
          >
            Action: {v.recommendedAction}
          </span>

          {v.customerClarificationReply && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 6,
                background: '#dbeafe',
                color: '#1e40af',
              }}
            >
              Customer Replied
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {compactSummary && onJumpToOrder && (
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: '4px 9px', fontSize: 11 }}
              onClick={() => onJumpToOrder(order)}
            >
              Open Order →
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            style={{
              border: 'none',
              background: 'rgba(255,255,255,0.7)',
              borderRadius: 8,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 700,
              color: '#374151',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {expanded ? (
              <>
                Hide Details <ChevronUp size={13} />
              </>
            ) : (
              <>
                AI Report <ChevronDown size={13} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Compact Reason Preview even when collapsed if flagged */}
      {!expanded && isFlagged && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: palette.text, fontWeight: 600 }}>
          {v.summaryReason}
        </p>
      )}

      {/* Expanded Full Alert & Decision Controls */}
      {expanded && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {compactSummary && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px 14px',
                fontSize: 12,
                padding: '7px 10px',
                background: 'rgba(255,255,255,0.75)',
                borderRadius: 8,
              }}
            >
              <span>
                <strong>Order:</strong> {order.orderNumber || order.id}
              </span>
              <span>
                <strong>Customer:</strong> {order.name}
              </span>
              <span>
                <strong>Product:</strong> {order.productName} (Qty: {order.quantity || 1})
              </span>
            </div>
          )}

          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: '#1f2937' }}>
            <strong>Reason:</strong> {v.summaryReason}
          </p>

          {/* Suspicious Fields Breakdown */}
          {v.flaggedFields && v.flaggedFields.length > 0 && (
            <div
              style={{
                background: 'rgba(255,255,255,0.85)',
                borderRadius: 8,
                padding: '8px 10px',
                border: '1px solid rgba(0,0,0,0.08)',
              }}
            >
              <strong style={{ fontSize: 11.5, color: palette.text, display: 'block', marginBottom: 6 }}>
                Suspicious / Inconsistent Information Detected:
              </strong>
              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {v.flaggedFields.map((flag, idx) => (
                  <li key={idx} style={{ fontSize: 12, lineHeight: 1.4 }}>
                    <strong>{flag.field}:</strong>{' '}
                    <code
                      style={{
                        background: '#f3f4f6',
                        padding: '1px 5px',
                        borderRadius: 4,
                        fontSize: 11.5,
                        color: '#991b1b',
                      }}
                    >
                      {flag.suspiciousValue || '(empty)'}
                    </code>{' '}
                    — {flag.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Clarification Sent / Customer Reply */}
          {v.clarificationMessage && (
            <div
              style={{
                background: 'rgba(255,255,255,0.8)',
                borderRadius: 8,
                padding: '7px 10px',
                fontSize: 12,
                borderLeft: '3px solid #d97706',
              }}
            >
              <strong style={{ color: '#92400e' }}>Clarification Requested:</strong> {v.clarificationMessage}
            </div>
          )}

          {v.customerClarificationReply && (
            <div
              style={{
                background: '#eff6ff',
                borderRadius: 8,
                padding: '7px 10px',
                fontSize: 12,
                borderLeft: '3px solid #2563eb',
                color: '#1e3a8a',
              }}
            >
              <strong>Customer Reply ({v.customerClarifiedAt ? formatInIST(v.customerClarifiedAt) : 'Recent'}):</strong>{' '}
              {v.customerClarificationReply}
            </div>
          )}

          {/* Meta line */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#6b7280' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} />
              Inspected {v.inspectedAt ? formatInIST(v.inspectedAt) : 'just now'} ·{' '}
              {v.inspectedBy === 'gemini_ai' ? `Playnix Gemini AI (${v.modelUsed || 'gemini'})` : 'Smart Validation Rules'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              {onReinspectOrder && (
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: '4px 9px', fontSize: 11 }}
                  disabled={inspecting || savingDecision}
                  onClick={() => void onReinspectOrder(order)}
                >
                  <RefreshCw size={11} className={inspecting ? 'refresh-spinning' : ''} />
                  {inspecting ? 'Inspecting…' : 'Re-inspect with AI'}
                </button>
              )}
              {v && onRejectAiAssessment && (
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: '4px 9px', fontSize: 11, color: '#991b1b', borderColor: '#fecaca' }}
                  disabled={inspecting || savingDecision}
                  title="Reject Playnix AI's verdict and teach it why this assessment was wrong"
                  onClick={() =>
                    onRejectAiAssessment({
                      featureKey: 'order_verification',
                      originalRequest: [
                        `Order ${order.orderNumber || order.id} (${order.mode})`,
                        `Customer: ${order.name || 'Guest'}`,
                        `Product: ${order.productName} x${order.quantity || 1} (₹${order.price})`,
                        order.colour ? `Colour: ${order.colour}` : '',
                        order.note ? `Note: ${order.note}` : '',
                      ]
                        .filter(Boolean)
                        .join(' | '),
                      rejectedResponse: `[${v.riskLevel} RISK · ${v.confidence}%] Action: ${v.recommendedAction} — ${v.summaryReason}`,
                      productId: order.productId,
                      productName: order.productName,
                      dismissLabel: 'Cancel',
                    })
                  }
                >
                  <ThumbsDown size={11} /> Reject AI Verdict
                </button>
              )}
            </div>
          </div>

          {actionError && <p className="error-msg" style={{ margin: 0 }}>{actionError}</p>}

          {/* 3 Mandatory Owner Decision Controls */}
          {decisionStatus !== 'rejected' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
              <button
                type="button"
                className="primary-btn"
                style={{ padding: '7px 12px', fontSize: 12 }}
                disabled={savingDecision}
                onClick={() => void onApproveOrder(order)}
              >
                <CheckCircle2 size={14} /> Approve Order
              </button>

              <button
                type="button"
                className="secondary-btn"
                style={{ padding: '7px 12px', fontSize: 12 }}
                disabled={savingDecision}
                onClick={() => {
                  setActionError('');
                  setActiveAction((prev) => (prev === 'clarify' ? 'none' : 'clarify'));
                }}
              >
                <HelpCircle size={14} /> Request Clarification
              </button>

              <button
                type="button"
                className="secondary-btn"
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  color: '#b91c1c',
                  borderColor: '#fca5a5',
                }}
                disabled={savingDecision}
                onClick={() => {
                  setActionError('');
                  setActiveAction((prev) => (prev === 'reject' ? 'none' : 'reject'));
                }}
              >
                <XCircle size={14} /> Reject Order
              </button>
            </div>
          )}

          {/* Inline Request Clarification Composer */}
          {activeAction === 'clarify' && (
            <form
              onSubmit={handleSubmitClarify}
              style={{
                background: '#ffffff',
                borderRadius: 10,
                padding: 10,
                border: '1px solid #fcd34d',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <label style={{ fontSize: 12, fontWeight: 700, color: '#92400e', display: 'block' }}>
                <MessageSquare size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />
                Polite clarification message shown to customer in My Orders:
              </label>
              <textarea
                rows={2}
                maxLength={250}
                value={clarifyDraft}
                onChange={(e) => setClarifyDraft(e.target.value)}
                style={{ width: '100%', fontSize: 12.5, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="primary-btn" style={{ padding: '6px 12px', fontSize: 12 }} disabled={savingDecision}>
                  Send Clarification Request
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  onClick={() => setActiveAction('none')}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Inline Owner Confirmation before Rejecting Order (never auto-deletes) */}
          {activeAction === 'reject' && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: 10,
                padding: 10,
                border: '1.5px solid #f87171',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 12, color: '#991b1b' }}>
                Confirm Reject &amp; Cancel Order {order.orderNumber}
              </strong>
              <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>
                This marks the order as <strong>Cancelled</strong> and keeps a permanent record of the AI warning and your decision (orders are never deleted automatically).
              </p>
              <input
                type="text"
                placeholder="Optional reason for audit log (e.g. Invalid contact info & gibberish name)"
                value={rejectReasonDraft}
                onChange={(e) => setRejectReasonDraft(e.target.value)}
                maxLength={180}
                style={{ width: '100%', fontSize: 12, padding: 7, borderRadius: 8, border: '1px solid #d1d5db' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="primary-btn"
                  style={{ background: '#b91c1c', borderColor: '#b91c1c', padding: '6px 12px', fontSize: 12 }}
                  disabled={savingDecision}
                  onClick={() => void handleConfirmReject()}
                >
                  Confirm Reject &amp; Cancel Order
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  onClick={() => setActiveAction('none')}
                >
                  Keep Order
                </button>
              </div>
            </div>
          )}

          {/* Audit Trail */}
          {v.auditHistory && v.auditHistory.length > 0 && (
            <details style={{ fontSize: 11.5, color: '#4b5563' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
                Verification Audit Log ({v.auditHistory.length})
              </summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {v.auditHistory.map((entry, idx) => (
                  <li key={idx}>
                    <strong>{entry.actor}</strong> · {entry.action} ({entry.at ? formatInIST(entry.at) : ''})
                    {entry.note ? ` — ${entry.note}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
