import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  MessageSquareReply,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  type Product,
  type ProductQuestion,
  type ProductQuestionStatus,
  formatGuestCustomerLabel,
  formatInIST,
} from '../defaultData';

interface OwnerProductQuestionsManagerProps {
  questions: ProductQuestion[];
  products: Product[];
  loading?: boolean;
  onRefresh: () => void | Promise<void>;
  onSaveAnswer: (
    questionId: string,
    answer: string,
    status: ProductQuestionStatus
  ) => Promise<void>;
  onMarkStatus: (
    questionId: string,
    status: ProductQuestionStatus
  ) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
}

export const OwnerProductQuestionsManager: React.FC<OwnerProductQuestionsManagerProps> = ({
  questions,
  products,
  loading = false,
  onRefresh,
  onSaveAnswer,
  onMarkStatus,
  onDeleteQuestion,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Answered'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string>('');
  const [modalSuccess, setModalSuccess] = useState<string>('');

  const productLookup = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(p.id, p);
    }
    return map;
  }, [products]);

  const pendingCount = useMemo(
    () => questions.filter((q) => q.status === 'Pending').length,
    [questions]
  );
  const answeredCount = useMemo(
    () => questions.filter((q) => q.status === 'Answered').length,
    [questions]
  );

  const filteredQuestions = useMemo(() => {
    const qLower = searchQuery.trim().toLowerCase();
    return questions.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!qLower) return true;
      const guestLabel = formatGuestCustomerLabel(item.customerId).toLowerCase();
      return (
        item.productName.toLowerCase().includes(qLower) ||
        item.productId.toLowerCase().includes(qLower) ||
        (item.customerName || '').toLowerCase().includes(qLower) ||
        guestLabel.includes(qLower) ||
        item.customerId.toLowerCase().includes(qLower) ||
        item.question.toLowerCase().includes(qLower) ||
        (item.answer || '').toLowerCase().includes(qLower)
      );
    });
  }, [questions, statusFilter, searchQuery]);

  const selectedQuestion = useMemo(
    () => (selectedQuestionId ? questions.find((q) => q.id === selectedQuestionId) || null : null),
    [selectedQuestionId, questions]
  );

  const resolveProductImage = (item: ProductQuestion) => {
    const liveProd = productLookup.get(item.productId);
    if (liveProd) {
      if (liveProd.imageUrls && liveProd.imageUrls.length > 0 && liveProd.imageUrls[0]) {
        return liveProd.imageUrls[0];
      }
      if (liveProd.imageUrl) return liveProd.imageUrl;
    }
    return item.productImageUrl || '/toys/toy-40ba4ba9-1.jpg';
  };

  const formatAskerDisplay = (item: ProductQuestion) => {
    const guestLabel = formatGuestCustomerLabel(item.customerId);
    const cleanName = item.customerName?.trim();
    if (cleanName) {
      return `${cleanName} · ${guestLabel}`;
    }
    return guestLabel;
  };

  const openQuestionDetails = (item: ProductQuestion) => {
    setSelectedQuestionId(item.id);
    setReplyDraft(item.answer || '');
    setModalError('');
    setModalSuccess('');
    setConfirmDeleteId(null);
  };

  const handleSaveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestion) return;
    const cleanReply = replyDraft.trim();
    if (!cleanReply) {
      setModalError('Please enter your answer before saving.');
      return;
    }
    setModalError('');
    setModalSuccess('');
    setSavingId(selectedQuestion.id);
    try {
      await onSaveAnswer(selectedQuestion.id, cleanReply, 'Answered');
      setModalSuccess('Answer saved and published on the product page!');
    } catch (err: any) {
      setModalError(err?.message || 'Could not save answer. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleStatus = async (item: ProductQuestion) => {
    const nextStatus: ProductQuestionStatus =
      item.status === 'Answered' ? 'Pending' : 'Answered';
    setModalError('');
    setModalSuccess('');
    setSavingId(item.id);
    try {
      await onMarkStatus(item.id, nextStatus);
      setModalSuccess(
        nextStatus === 'Answered'
          ? 'Marked as Answered.'
          : 'Moved back to Pending.'
      );
    } catch (err: any) {
      setModalError(err?.message || 'Could not update status.');
    } finally {
      setSavingId(null);
    }
  };

  const handleConfirmDelete = async (questionId: string) => {
    setModalError('');
    setSavingId(questionId);
    try {
      await onDeleteQuestion(questionId);
      setConfirmDeleteId(null);
      if (selectedQuestionId === questionId) {
        setSelectedQuestionId(null);
      }
    } catch (err: any) {
      setModalError(err?.message || 'Could not delete question.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="owner-questions-panel" aria-label="Product Questions management">
      <div className="manage-title">
        <div>
          <span className="eyebrow">CUSTOMER Q&amp;A</span>
          <h2>Product Questions</h2>
          <p className="owner-questions-subtitle">
            Click any question to view the linked product details, reply on the product page, mark answered, or remove it.
          </p>
        </div>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => void onRefresh()}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'refresh-spinning' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary & Filters */}
      <div className="owner-questions-toolbar">
        <div className="owner-questions-filter-pills">
          <button
            type="button"
            className={`owner-q-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({questions.length})
          </button>
          <button
            type="button"
            className={`owner-q-filter-btn ${statusFilter === 'Pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('Pending')}
          >
            <Clock size={13} /> Pending ({pendingCount})
          </button>
          <button
            type="button"
            className={`owner-q-filter-btn ${statusFilter === 'Answered' ? 'active' : ''}`}
            onClick={() => setStatusFilter('Answered')}
          >
            <CheckCircle2 size={13} /> Answered ({answeredCount})
          </button>
        </div>

        <div className="owner-questions-search-wrap">
          <Search size={15} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product, ID, customer, or question..."
            aria-label="Search product questions"
          />
        </div>
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <div className="empty-state compact">
          <div className="empty-icon">
            <HelpCircle size={32} />
          </div>
          <h3>
            {questions.length === 0
              ? 'No product questions yet'
              : 'No matching questions'}
          </h3>
          <p>
            {questions.length === 0
              ? 'When customers ask a question on any product page, it will appear here with the exact linked product.'
              : 'Try clearing the search bar or switching the status filter.'}
          </p>
        </div>
      ) : (
        <div className="owner-questions-grid">
          {filteredQuestions.map((item) => {
            const thumb = resolveProductImage(item);
            const isAnswered = item.status === 'Answered';
            return (
              <article
                key={item.id}
                className={`owner-question-card ${isAnswered ? 'is-answered' : 'is-pending'} ${
                  selectedQuestionId === item.id ? 'is-selected' : ''
                }`}
              >
                <div
                  className="owner-question-card-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => openQuestionDetails(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openQuestionDetails(item);
                    }
                  }}
                >
                  <div className="owner-question-product-row">
                    <img
                      src={thumb}
                      alt={item.productName}
                      className="owner-question-thumb"
                      referrerPolicy="no-referrer"
                    />
                    <div className="owner-question-product-meta">
                      <div className="owner-question-status-line">
                        <span
                          className={`owner-question-status-badge ${
                            isAnswered ? 'answered' : 'pending'
                          }`}
                        >
                          {isAnswered ? (
                            <>
                              <CheckCircle2 size={12} /> Answered
                            </>
                          ) : (
                            <>
                              <Clock size={12} /> Pending
                            </>
                          )}
                        </span>
                        <span className="owner-question-product-id">
                          ID: {item.productId}
                        </span>
                      </div>
                      <h4>{item.productName}</h4>
                      <span className="owner-question-customer">
                        From: <strong>{formatAskerDisplay(item)}</strong>
                      </span>
                    </div>
                  </div>

                  <p className="owner-question-text">{item.question}</p>

                  {item.answer && (
                    <div className="owner-question-reply-preview">
                      <strong>Owner reply:</strong> {item.answer}
                    </div>
                  )}

                  <div className="owner-question-date">
                    Submitted {formatInIST(item.createdAt)}
                  </div>
                </div>

                <div className="owner-question-card-actions">
                  <button
                    type="button"
                    className="secondary-btn owner-q-action-btn"
                    onClick={() => openQuestionDetails(item)}
                  >
                    <MessageSquareReply size={14} />
                    {item.answer ? 'View / Edit Reply' : 'Reply & Details'}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn owner-q-action-btn"
                    disabled={savingId === item.id}
                    onClick={() => void handleToggleStatus(item)}
                  >
                    <CheckCircle2 size={14} />
                    {isAnswered ? 'Mark Pending' : 'Mark Answered'}
                  </button>
                  {confirmDeleteId === item.id ? (
                    <div className="owner-q-delete-confirm">
                      <button
                        type="button"
                        className="danger-btn owner-q-action-btn"
                        disabled={savingId === item.id}
                        onClick={() => void handleConfirmDelete(item.id)}
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        className="secondary-btn owner-q-action-btn"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="secondary-btn owner-q-action-btn danger-text"
                      aria-label={`Delete question from ${formatAskerDisplay(item)}`}
                      onClick={() => setConfirmDeleteId(item.id)}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Question Details & Reply Modal */}
      {selectedQuestion && (
        <div
          className="owner-q-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedQuestionId(null)}
        >
          <section
            className="owner-q-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Question details for ${selectedQuestion.productName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="owner-q-modal-header">
              <div>
                <span className="eyebrow">QUESTION DETAILS</span>
                <h3>Linked Product &amp; Reply</h3>
              </div>
              <button
                type="button"
                className="gallery-close"
                style={{ position: 'static' }}
                aria-label="Close question details"
                onClick={() => setSelectedQuestionId(null)}
              >
                <X size={19} />
              </button>
            </div>

            {/* Linked Product Card */}
            {(() => {
              const liveProd = productLookup.get(selectedQuestion.productId);
              const imgUrl = resolveProductImage(selectedQuestion);
              return (
                <div className="owner-q-linked-product">
                  <img src={imgUrl} alt={selectedQuestion.productName} referrerPolicy="no-referrer" />
                  <div className="owner-q-linked-info">
                    <span className="owner-q-linked-label">BELONGS TO PRODUCT</span>
                    <strong>{liveProd?.name || selectedQuestion.productName}</strong>
                    <div className="owner-q-linked-sub">
                      <span>Product ID: {selectedQuestion.productId}</span>
                      {liveProd ? (
                        <>
                          <span>· Category: {liveProd.category || 'Other'}</span>
                          <span>· ₹{Number(liveProd.price).toLocaleString('en-IN')}</span>
                          {liveProd.available === false && <span>· (Currently Draft)</span>}
                        </>
                      ) : (
                        <span>· (Product removed from live catalog)</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Customer & Question Details */}
            <div className="owner-q-detail-box">
              <div className="owner-q-detail-meta">
                <div>
                  <span className="owner-q-detail-label">Customer</span>
                  <strong>{formatAskerDisplay(selectedQuestion)}</strong>
                </div>
                <div>
                  <span className="owner-q-detail-label">Submitted</span>
                  <strong>{formatInIST(selectedQuestion.createdAt)}</strong>
                </div>
                <div>
                  <span className="owner-q-detail-label">Status</span>
                  <span
                    className={`owner-question-status-badge ${
                      selectedQuestion.status === 'Answered' ? 'answered' : 'pending'
                    }`}
                  >
                    {selectedQuestion.status}
                  </span>
                </div>
              </div>
              <div className="owner-q-detail-question">
                <span className="owner-q-detail-label">Customer Question</span>
                <p>{selectedQuestion.question}</p>
              </div>
            </div>

            {/* Owner Reply Form */}
            <form className="owner-q-reply-form" onSubmit={(e) => void handleSaveReply(e)}>
              <label htmlFor={`owner-reply-${selectedQuestion.id}`}>
                Your Answer (visible on the product page)
              </label>
              <textarea
                id={`owner-reply-${selectedQuestion.id}`}
                rows={4}
                maxLength={2000}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="Write a helpful answer for this customer and future shoppers..."
              />

              {modalError && <p className="error-msg" style={{ margin: '0' }}>{modalError}</p>}
              {modalSuccess && <p className="success-msg" style={{ margin: '0' }}>{modalSuccess}</p>}

              <div className="owner-q-modal-actions">
                <div className="owner-q-modal-left-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={savingId === selectedQuestion.id}
                    onClick={() => void handleToggleStatus(selectedQuestion)}
                  >
                    <CheckCircle2 size={15} />
                    {selectedQuestion.status === 'Answered'
                      ? 'Mark as Pending'
                      : 'Mark as Answered'}
                  </button>
                  {confirmDeleteId === selectedQuestion.id ? (
                    <button
                      type="button"
                      className="danger-btn"
                      disabled={savingId === selectedQuestion.id}
                      onClick={() => void handleConfirmDelete(selectedQuestion.id)}
                    >
                      <Trash2 size={15} /> Confirm Delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-btn danger-text"
                      onClick={() => setConfirmDeleteId(selectedQuestion.id)}
                    >
                      <Trash2 size={15} /> Delete
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="primary-btn"
                  disabled={savingId === selectedQuestion.id}
                >
                  <MessageSquareReply size={15} />
                  {savingId === selectedQuestion.id
                    ? 'Saving...'
                    : selectedQuestion.answer
                    ? 'Update Answer'
                    : 'Save & Publish Answer'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
};
