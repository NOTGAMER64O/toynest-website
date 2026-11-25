import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  HelpCircle,
  MessageSquareReply,
  RefreshCw,
  Search,
  Sparkles,
  ThumbsDown,
  Trash2,
  X,
} from 'lucide-react';
import {
  type AiSuggestedReplyResult,
  type PendingAiRejectionDraft,
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
  aiEnabled?: boolean;
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
  onSuggestAiReply?: (
    question: ProductQuestion,
    linkedProduct: Product | null
  ) => Promise<{
    success: boolean;
    geminiConfigured?: boolean;
    error?: string;
    suggestion?: AiSuggestedReplyResult;
  }>;
  onTeachAiFact?: (
    question: ProductQuestion,
    linkedProduct: Product | null,
    aiAskedQuestion: string,
    ownerAnswer: string
  ) => Promise<{
    success: boolean;
    error?: string;
    suggestion?: AiSuggestedReplyResult;
  }>;
  onRejectAiResponse?: (draft: PendingAiRejectionDraft) => void;
  onOpenAiAssistant?: () => void;
}

export const OwnerProductQuestionsManager: React.FC<OwnerProductQuestionsManagerProps> = ({
  questions,
  products,
  loading = false,
  aiEnabled = false,
  onRefresh,
  onSaveAnswer,
  onMarkStatus,
  onDeleteQuestion,
  onSuggestAiReply,
  onTeachAiFact,
  onRejectAiResponse,
  onOpenAiAssistant,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Answered'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string>('');
  const [modalSuccess, setModalSuccess] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>('');
  const [teachDraft, setTeachDraft] = useState<string>('');
  const [teachingAi, setTeachingAi] = useState<boolean>(false);
  const [aiSuggestionsByQId, setAiSuggestionsByQId] = useState<
    Record<string, AiSuggestedReplyResult>
  >({});
  const [aiDecisionByQId, setAiDecisionByQId] = useState<
    Record<string, 'pending_review' | 'approved' | 'edited' | 'rejected'>
  >({});
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedQuestionIdRef = useRef<string | null>(null);
  const replyDraftRef = useRef<string>('');
  const hasManualEditRef = useRef<boolean>(false);
  const autoDraftedIdsRef = useRef<Set<string>>(new Set());
  const inFlightIdsRef = useRef<Set<string>>(new Set());
  const questionsRef = useRef<ProductQuestion[]>(questions);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    selectedQuestionIdRef.current = selectedQuestionId;
  }, [selectedQuestionId]);

  useEffect(() => {
    replyDraftRef.current = replyDraft;
  }, [replyDraft]);

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

  const handleGenerateAiSuggestion = async (
    item: ProductQuestion,
    autoFillIfEmpty = true,
    isBackgroundPrefetch = false
  ) => {
    if (!onSuggestAiReply) return;
    if (inFlightIdsRef.current.has(item.id)) return;
    inFlightIdsRef.current.add(item.id);
    const liveProd = productLookup.get(item.productId) || null;
    const showActiveSpinner = !isBackgroundPrefetch || selectedQuestionIdRef.current === item.id;
    if (showActiveSpinner) {
      setAiError('');
      setModalSuccess('');
      setAiLoading(true);
    }
    try {
      const res = await onSuggestAiReply(item, liveProd);
      if (!res.success || !res.suggestion) {
        if (!isBackgroundPrefetch || selectedQuestionIdRef.current === item.id) {
          setAiError(
            res.error || 'Could not generate a suggested reply. You can still write a custom answer manually.'
          );
        }
        return;
      }
      setAiSuggestionsByQId((prev) => ({ ...prev, [item.id]: res.suggestion! }));

      const shouldAutoFill = autoFillIfEmpty && !(item.answer || '').trim();
      setAiDecisionByQId((prev) => ({
        ...prev,
        [item.id]: shouldAutoFill ? 'approved' : 'pending_review',
      }));

      const latestItem = questionsRef.current.find((q) => q.id === item.id) || item;
      const alreadyPublished = Boolean((latestItem.answer || '').trim());
      if (
        shouldAutoFill &&
        !alreadyPublished &&
        selectedQuestionIdRef.current === item.id &&
        (!hasManualEditRef.current || !replyDraftRef.current.trim())
      ) {
        replyDraftRef.current = res.suggestion.suggestedAnswer;
        setReplyDraft(res.suggestion.suggestedAnswer);
        setModalError('');
        setModalSuccess(
          'Auto-filled by Playnix AI — review or edit freely, then click "Send & Publish Answer".'
        );
      }
    } catch (err: any) {
      if (!isBackgroundPrefetch || selectedQuestionIdRef.current === item.id) {
        setAiError(err?.message || 'Playnix AI suggestion failed. You can still reply manually.');
      }
    } finally {
      inFlightIdsRef.current.delete(item.id);
      if (showActiveSpinner || selectedQuestionIdRef.current === item.id) {
        setAiLoading(false);
      }
    }
  };

  const openQuestionDetails = (item: ProductQuestion) => {
    selectedQuestionIdRef.current = item.id;
    hasManualEditRef.current = false;
    setSelectedQuestionId(item.id);
    setModalError('');
    setModalSuccess('');
    setAiError('');
    setTeachDraft('');
    setConfirmDeleteId(null);

    if (item.answer && item.answer.trim()) {
      replyDraftRef.current = item.answer;
      setReplyDraft(item.answer);
      return;
    }

    const cached = aiSuggestionsByQId[item.id];
    const prevDecision = aiDecisionByQId[item.id];
    if (cached && prevDecision !== 'rejected') {
      replyDraftRef.current = cached.suggestedAnswer;
      setReplyDraft(cached.suggestedAnswer);
      if (prevDecision !== 'edited') {
        setAiDecisionByQId((prev) => ({ ...prev, [item.id]: 'approved' }));
      }
      setModalSuccess(
        'Auto-filled by Playnix AI — review or edit freely, then click "Send & Publish Answer".'
      );
      return;
    }

    replyDraftRef.current = '';
    setReplyDraft('');
    if (aiEnabled && onSuggestAiReply) {
      setAiLoading(inFlightIdsRef.current.has(item.id));
      void handleGenerateAiSuggestion(item, true, false);
    }
  };

  // Automatically pre-fill AI suggested answers for pending customer questions in background
  useEffect(() => {
    if (!aiEnabled || !onSuggestAiReply) return;
    const pendingUnanswered = questions
      .filter(
        (q) =>
          q.status === 'Pending' &&
          !(q.answer || '').trim() &&
          !aiSuggestionsByQId[q.id] &&
          !autoDraftedIdsRef.current.has(q.id) &&
          !inFlightIdsRef.current.has(q.id)
      )
      .slice(0, 2);

    if (pendingUnanswered.length === 0) return;
    let cancelled = false;

    for (const q of pendingUnanswered) {
      autoDraftedIdsRef.current.add(q.id);
    }

    void (async () => {
      for (let i = 0; i < pendingUnanswered.length; i++) {
        if (cancelled) break;
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 700));
          if (cancelled) break;
        }
        await handleGenerateAiSuggestion(pendingUnanswered[i], true, true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, aiEnabled]);

  const handleApproveAiSuggestion = (item: ProductQuestion) => {
    const sug = aiSuggestionsByQId[item.id];
    if (!sug) return;
    hasManualEditRef.current = false;
    replyDraftRef.current = sug.suggestedAnswer;
    setReplyDraft(sug.suggestedAnswer);
    setAiDecisionByQId((prev) => ({ ...prev, [item.id]: 'approved' }));
    setModalError('');
    setModalSuccess(
      'AI suggestion approved and loaded into your reply box. Review it and click "Send & Publish Answer" to send manually.'
    );
  };

  const handleEditAiSuggestion = (item: ProductQuestion) => {
    const sug = aiSuggestionsByQId[item.id];
    if (!sug) return;
    hasManualEditRef.current = false;
    replyDraftRef.current = sug.suggestedAnswer;
    setReplyDraft(sug.suggestedAnswer);
    setAiDecisionByQId((prev) => ({ ...prev, [item.id]: 'edited' }));
    setModalError('');
    setModalSuccess('AI suggestion copied into the editor — customize freely before sending manually.');
    window.setTimeout(() => {
      replyTextareaRef.current?.focus();
    }, 30);
  };

  const handleRejectAiSuggestion = (item: ProductQuestion) => {
    const rejectedSuggestion = aiSuggestionsByQId[item.id];
    hasManualEditRef.current = false;
    replyDraftRef.current = '';
    setReplyDraft('');
    setAiDecisionByQId((prev) => ({ ...prev, [item.id]: 'rejected' }));
    setModalSuccess('AI suggestion cleared. Tell Playnix AI what was wrong so it learns.');
    if (onRejectAiResponse && rejectedSuggestion?.suggestedAnswer) {
      onRejectAiResponse({
        featureKey: 'product_question_reply',
        originalRequest: item.question,
        rejectedResponse: rejectedSuggestion.suggestedAnswer,
        productId: item.productId,
        productName: item.productName,
        dismissLabel: 'Skip Feedback',
      });
    }
    window.setTimeout(() => {
      replyTextareaRef.current?.focus();
    }, 30);
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
      setModalSuccess('Answer saved and visible only to the customer who asked!');
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
            Pending customer questions are automatically drafted &amp; pre-filled by Playnix AI for quick review — nothing is published until you click Send &amp; Publish Answer.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {onOpenAiAssistant && (
            <button
              type="button"
              className="secondary-btn"
              onClick={onOpenAiAssistant}
              title="Configure Playnix AI Assistant knowledge and training"
            >
              <Bot size={15} />
              {aiEnabled ? 'Playnix AI Active' : 'Playnix AI Paused'}
            </button>
          )}
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

                  {item.answer ? (
                    <div className="owner-question-reply-preview">
                      <strong>Owner reply:</strong> {item.answer}
                    </div>
                  ) : aiSuggestionsByQId[item.id] ? (
                    <div className="owner-question-reply-preview">
                      <strong>AI Draft Auto-Filled:</strong> {aiSuggestionsByQId[item.id].suggestedAnswer}
                    </div>
                  ) : null}

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

            {/* Playnix AI Assistant Suggested Answer Panel (Owner-only, manual approval always required) */}
            {onSuggestAiReply && (
              <div className="playnix-ai-q-assist-card">
                <div className="playnix-ai-q-assist-head">
                  <div className="playnix-ai-q-assist-title">
                    <Sparkles size={15} />
                    <strong>Playnix AI Assistant Draft</strong>
                    <span className="playnix-ai-manual-pill">Manual Approval Only</span>
                  </div>

                  {aiEnabled ? (
                    <button
                      type="button"
                      className="secondary-btn owner-q-action-btn"
                      disabled={aiLoading}
                      onClick={() => {
                        hasManualEditRef.current = false;
                        void handleGenerateAiSuggestion(selectedQuestion, true, false);
                      }}
                    >
                      <Bot size={14} className={aiLoading ? 'refresh-spinning' : ''} />
                      {aiLoading
                        ? 'Drafting Suggestion...'
                        : aiSuggestionsByQId[selectedQuestion.id]
                        ? 'Regenerate Suggestion'
                        : 'Suggest Answer with AI'}
                    </button>
                  ) : (
                    onOpenAiAssistant && (
                      <button
                        type="button"
                        className="secondary-btn owner-q-action-btn"
                        onClick={onOpenAiAssistant}
                      >
                        Activate Playnix AI
                      </button>
                    )
                  )}
                </div>

                {!aiEnabled && (
                  <p className="playnix-ai-q-muted">
                    Playnix AI suggestions are currently paused. Activate Playnix AI to generate verified draft answers, or write your custom reply below.
                  </p>
                )}

                {aiError && (() => {
                  let displayAiError = aiError;
                  if (aiError.trim().startsWith('{') || aiError.includes('"UNAVAILABLE"') || aiError.includes('"code":503')) {
                    displayAiError =
                      'Playnix AI is temporarily experiencing high demand. Please wait a few seconds and tap Retry — or type your answer manually below.';
                  }
                  return (
                    <div className="playnix-ai-alert warning mt-2">
                      <AlertTriangle size={16} />
                      <div className="flex-1">
                        <strong>Suggestion Unavailable</strong>
                        <p>{displayAiError}</p>
                        <button
                          type="button"
                          className="secondary-btn mt-1.5 px-2.5 py-1 text-xs"
                          disabled={aiLoading}
                          onClick={() => {
                            hasManualEditRef.current = false;
                            void handleGenerateAiSuggestion(selectedQuestion, true, false);
                          }}
                        >
                          {aiLoading ? 'Retrying...' : 'Retry AI Suggestion'}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const sug = aiSuggestionsByQId[selectedQuestion.id];
                  const decision = aiDecisionByQId[selectedQuestion.id];
                  if (!sug) return null;

                  if (decision === 'rejected') {
                    return (
                      <div className="playnix-ai-q-rejected">
                        <span>Suggestion dismissed. Write a custom answer below or click Regenerate Suggestion.</span>
                      </div>
                    );
                  }

                  return (
                    <div className="playnix-ai-suggestion-box" style={{ marginTop: 10 }}>
                      <div className="playnix-ai-suggestion-head">
                        <span className="playnix-ai-suggestion-title">
                          <Bot size={14} /> Suggested Answer Preview
                          {decision === 'approved' && ' · Approved into editor'}
                          {decision === 'edited' && ' · Loaded for editing'}
                        </span>
                        <span
                          className={`playnix-ai-grounding-badge status-${sug.groundingStatus}`}
                        >
                          {sug.groundingStatus === 'verified'
                            ? 'Verified Answer'
                            : sug.groundingStatus === 'partial'
                            ? 'Partially Covered'
                            : 'Missing Info Detected'}
                        </span>
                      </div>

                      <p className="playnix-ai-suggestion-body">{sug.suggestedAnswer}</p>

                      {sug.missingInfoNote && (
                        <div className="playnix-ai-missing-note">
                          <AlertTriangle size={14} />
                          <span>
                            <strong>Missing Information Notice:</strong> {sug.missingInfoNote}
                          </span>
                        </div>
                      )}

                      {(sug.ownerClarificationQuestion || sug.missingInfoNote) &&
                        sug.groundingStatus !== 'verified' &&
                        onTeachAiFact && (
                          <div className="playnix-ai-inline-teach">
                            <div className="playnix-ai-inline-teach-q">
                              <HelpCircle size={14} />
                              <span>
                                <strong>AI asks you:</strong>{' '}
                                {sug.ownerClarificationQuestion ||
                                  `Can you tell me the missing details for "${selectedQuestion.productName}" so I can answer this accurately?`}
                              </span>
                            </div>
                            <div className="playnix-ai-inline-teach-row">
                              <input
                                type="text"
                                value={teachDraft}
                                maxLength={500}
                                onChange={(e) => setTeachDraft(e.target.value)}
                                placeholder="Type answer to teach AI & update draft..."
                              />
                              <button
                                type="button"
                                className="primary-btn owner-q-action-btn"
                                disabled={teachingAi || !teachDraft.trim()}
                                onClick={async () => {
                                  const askedQ =
                                    sug.ownerClarificationQuestion ||
                                    sug.missingInfoNote ||
                                    `Missing info for ${selectedQuestion.productName}`;
                                  setTeachingAi(true);
                                  setAiError('');
                                  try {
                                    const liveProd =
                                      productLookup.get(selectedQuestion.productId) || null;
                                    const updated = await onTeachAiFact(
                                      selectedQuestion,
                                      liveProd,
                                      askedQ,
                                      teachDraft.trim()
                                    );
                                    setTeachDraft('');
                                    if (updated?.success && updated.suggestion) {
                                      setAiSuggestionsByQId((prev) => ({
                                        ...prev,
                                        [selectedQuestion.id]: updated.suggestion!,
                                      }));
                                      setAiDecisionByQId((prev) => ({
                                        ...prev,
                                        [selectedQuestion.id]: 'approved',
                                      }));
                                      hasManualEditRef.current = false;
                                      replyDraftRef.current = updated.suggestion.suggestedAnswer;
                                      setReplyDraft(updated.suggestion.suggestedAnswer);
                                      setModalSuccess(
                                        'Taught Playnix AI & refreshed your reply draft! Review and click "Send & Publish Answer".'
                                      );
                                    }
                                  } catch (err: any) {
                                    setAiError(err?.message || 'Could not save guidance to AI.');
                                  } finally {
                                    setTeachingAi(false);
                                  }
                                }}
                              >
                                {teachingAi ? 'Teaching AI...' : 'Teach AI & Re-Draft'}
                              </button>
                            </div>
                          </div>
                        )}

                      {sug.usedSources.length > 0 && (
                        <div className="playnix-ai-sources-line">
                          <HelpCircle size={13} />
                          <span>Verified sources used: {sug.usedSources.join(' · ')}</span>
                        </div>
                      )}

                      <div className="playnix-ai-suggestion-actions">
                        <button
                          type="button"
                          className="primary-btn owner-q-action-btn"
                          onClick={() => handleApproveAiSuggestion(selectedQuestion)}
                        >
                          <Check size={14} /> Approve Suggestion
                        </button>
                        <button
                          type="button"
                          className="secondary-btn owner-q-action-btn"
                          onClick={() => handleEditAiSuggestion(selectedQuestion)}
                        >
                          <Edit3 size={14} /> Edit Suggestion
                        </button>
                        <button
                          type="button"
                          className="secondary-btn owner-q-action-btn danger-text"
                          onClick={() => handleRejectAiSuggestion(selectedQuestion)}
                        >
                          <ThumbsDown size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Owner Reply Form (Always manual final submission) */}
            <form className="owner-q-reply-form" onSubmit={(e) => void handleSaveReply(e)}>
              <label htmlFor={`owner-reply-${selectedQuestion.id}`}>
                Final Answer to Send (visible only to the customer who asked — sent manually only)
              </label>
              <textarea
                ref={replyTextareaRef}
                id={`owner-reply-${selectedQuestion.id}`}
                rows={4}
                maxLength={2000}
                value={replyDraft}
                onChange={(e) => {
                  hasManualEditRef.current = true;
                  replyDraftRef.current = e.target.value;
                  setReplyDraft(e.target.value);
                }}
                placeholder={
                  aiLoading && !replyDraft
                    ? 'Playnix AI is auto-filling a suggested answer...'
                    : 'Write a custom answer or edit the Playnix AI draft...'
                }
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
                    ? 'Update Answer Manually'
                    : 'Send & Publish Answer'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
};
