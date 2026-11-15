import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, HelpCircle, MessageCircle, Send, Sparkles } from 'lucide-react';
import {
  type Product,
  type ProductQuestion,
  formatInIST,
  getGuestShortCode,
} from '../defaultData';
import {
  submitProductQuestionToCloud,
  subscribeToProductQuestionsByProduct,
} from '../firebase';

interface ProductQuestionsSectionProps {
  product: Product;
  customerId: string;
  defaultCustomerName?: string;
  onCustomerNameProvided?: (name: string) => void;
  compact?: boolean;
  externalOpenTrigger?: number;
}

export const ProductQuestionsSection: React.FC<ProductQuestionsSectionProps> = ({
  product,
  customerId,
  defaultCustomerName = '',
  onCustomerNameProvided,
  compact = false,
  externalOpenTrigger = 0,
}) => {
  const [questions, setQuestions] = useState<ProductQuestion[]>([]);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>(defaultCustomerName);
  const [questionText, setQuestionText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const sectionRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const attachedProductImage = useMemo(() => {
    if (product.imageUrls && product.imageUrls.length > 0 && product.imageUrls[0]) {
      return product.imageUrls[0];
    }
    return product.imageUrl || '/toys/toy-40ba4ba9-1.jpg';
  }, [product]);

  // Reset form feedback when switching products
  useEffect(() => {
    setSubmitError('');
    setSubmitSuccess('');
    setQuestionText('');
    setIsFormOpen(false);
  }, [product.id]);

  // Sync optional name default if customer already entered a name
  useEffect(() => {
    if (defaultCustomerName && !customerName.trim()) {
      setCustomerName(defaultCustomerName);
    }
  }, [defaultCustomerName]);

  // Allow top "Ask a Question" button on product detail page to open & scroll to the form
  useEffect(() => {
    if (externalOpenTrigger > 0) {
      setIsFormOpen(true);
      setSubmitError('');
      window.setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        textareaRef.current?.focus();
      }, 90);
    }
  }, [externalOpenTrigger]);

  // Real-time Firebase listener scoped strictly to this product ID
  useEffect(() => {
    if (!product.id) return;
    setQuestions([]);
    const unsubscribe = subscribeToProductQuestionsByProduct(product.id, (list) => {
      setQuestions(list);
    });
    return () => unsubscribe();
  }, [product.id]);

  // Show all owner-answered Q&As for this product, plus this customer's own pending questions
  const visibleQuestions = useMemo(() => {
    return questions.filter(
      (q) =>
        q.productId === product.id &&
        ((q.status === 'Answered' && Boolean(q.answer?.trim())) || q.customerId === customerId)
    );
  }, [questions, product.id, customerId]);

  const answeredCount = useMemo(
    () =>
      questions.filter(
        (q) => q.productId === product.id && q.status === 'Answered' && Boolean(q.answer?.trim())
      ).length,
    [questions, product.id]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    const cleanQuestion = questionText.trim();
    if (!cleanQuestion) {
      setSubmitError('Please write your question before submitting.');
      return;
    }

    const cleanName = customerName.trim().slice(0, 100);
    const activeCustomerId = customerId || 'cust_guest';
    const guestCode = getGuestShortCode(activeCustomerId);
    const nowIso = new Date().toISOString();
    const newQuestion: ProductQuestion = {
      id: `pq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      productId: product.id,
      productName: product.name,
      productImageUrl: attachedProductImage,
      customerId: activeCustomerId,
      guestCode,
      customerName: cleanName,
      question: cleanQuestion.slice(0, 1000),
      answer: '',
      status: 'Pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setSubmitting(true);
    try {
      await submitProductQuestionToCloud(newQuestion);
      if (cleanName && onCustomerNameProvided) {
        onCustomerNameProvided(cleanName);
      }
      setQuestionText('');
      setIsFormOpen(false);
      setSubmitSuccess(
        'Your question has been submitted! Once the shop owner replies, the answer will appear right here.'
      );
    } catch (err: any) {
      console.warn('Could not submit product question:', err);
      setSubmitError('Could not send your question right now. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      className={`product-qa-section ${compact ? 'is-compact' : ''}`}
      aria-label={`Questions and answers for ${product.name}`}
    >
      <div className="product-qa-header">
        <div className="product-qa-title-group">
          <div className="product-qa-icon-badge" aria-hidden="true">
            <HelpCircle size={17} />
          </div>
          <div>
            <h3>Product Q&amp;A</h3>
            <p>
              {answeredCount > 0
                ? `${answeredCount} ${answeredCount === 1 ? 'answer' : 'answers'} from the owner`
                : 'Have a question about size, colours, or playtime?'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={`secondary-btn product-qa-ask-btn ${isFormOpen ? 'is-active' : ''}`}
          onClick={() => {
            setIsFormOpen((prev) => !prev);
            setSubmitError('');
            setSubmitSuccess('');
          }}
        >
          <MessageCircle size={15} />
          {isFormOpen ? 'Close form' : 'Ask a Question'}
        </button>
      </div>

      {submitSuccess && (
        <div className="product-qa-confirmation" role="status">
          <CheckCircle2 size={17} />
          <span>{submitSuccess}</span>
        </div>
      )}

      {isFormOpen && (
        <form className="product-qa-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="product-qa-attached-product">
            <img
              src={attachedProductImage}
              alt={product.name}
              referrerPolicy="no-referrer"
            />
            <div className="product-qa-attached-meta">
              <span className="product-qa-attached-label">ASKING ABOUT THIS PRODUCT</span>
              <strong>{product.name}</strong>
              <span className="product-qa-attached-id">ID: {product.id}</span>
            </div>
          </div>

          <div className="product-qa-field">
            <label htmlFor={`qa-name-${product.id}-${compact ? 'c' : 'd'}`}>
              Your name <span>(Optional)</span>
            </label>
            <input
              id={`qa-name-${product.id}-${compact ? 'c' : 'd'}`}
              type="text"
              value={customerName}
              maxLength={100}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter your name or leave blank"
            />
          </div>

          <div className="product-qa-field">
            <label htmlFor={`qa-question-${product.id}-${compact ? 'c' : 'd'}`}>
              Your question *
            </label>
            <textarea
              ref={textareaRef}
              id={`qa-question-${product.id}-${compact ? 'c' : 'd'}`}
              rows={compact ? 2 : 3}
              maxLength={1000}
              required
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder={`Ask about ${product.name} (size, material, colour options, delivery...)`}
            />
            <span className="product-qa-char-count">{questionText.length}/1000</span>
          </div>

          {submitError && (
            <p className="error-msg" style={{ margin: '0' }}>
              {submitError}
            </p>
          )}

          <div className="product-qa-form-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setIsFormOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={submitting}>
              <Send size={14} />
              {submitting ? 'Sending...' : 'Submit Question'}
            </button>
          </div>
        </form>
      )}

      {visibleQuestions.length > 0 ? (
        <div className="product-qa-list">
          {visibleQuestions.map((q) => {
            const isAnswered = q.status === 'Answered' && Boolean(q.answer?.trim());
            const askerDisplay = q.customerName?.trim()
              ? q.customerName.trim()
              : q.customerId === customerId
              ? 'You (Guest)'
              : 'Customer';

            return (
              <article
                className={`product-qa-item ${isAnswered ? 'is-answered' : 'is-pending'}`}
                key={q.id}
              >
                <div className="product-qa-q-row">
                  <span className="product-qa-badge q">Q</span>
                  <div className="product-qa-q-content">
                    <p className="product-qa-q-text">{q.question}</p>
                    <div className="product-qa-q-meta">
                      <span>Asked by {askerDisplay}</span>
                      <span>·</span>
                      <span>{formatInIST(q.createdAt)}</span>
                      {!isAnswered && (
                        <span className="product-qa-pending-tag">Pending Owner Reply</span>
                      )}
                    </div>
                  </div>
                </div>

                {isAnswered && q.answer && (
                  <div className="product-qa-a-row">
                    <span className="product-qa-badge a">A</span>
                    <div className="product-qa-a-content">
                      <div className="product-qa-owner-label">
                        <Sparkles size={12} />
                        <span>Playnix Shop Owner</span>
                        {q.answeredAt && (
                          <span className="product-qa-a-date">
                            · {formatInIST(q.answeredAt)}
                          </span>
                        )}
                      </div>
                      <p className="product-qa-a-text">{q.answer}</p>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        !isFormOpen && (
          <div className="product-qa-empty">
            No answered questions for this product yet. Be the first to ask!
          </div>
        )
      )}
    </section>
  );
};
