import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { type PopularSearchItem } from '../defaultData';

interface OwnerPopularSearchesManagerProps {
  popularSearches: PopularSearchItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onAddTerm: (term: string) => Promise<void>;
  onEditTerm: (item: PopularSearchItem, newTerm: string) => Promise<void>;
  onDeleteTerm: (id: string) => Promise<void>;
  onReorderTerms: (orderedItems: PopularSearchItem[]) => Promise<void>;
}

export const OwnerPopularSearchesManager: React.FC<OwnerPopularSearchesManagerProps> = ({
  popularSearches,
  loading,
  onRefresh,
  onAddTerm,
  onEditTerm,
  onDeleteTerm,
  onReorderTerms,
}) => {
  const [newTermInput, setNewTermInput] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string>('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const sortedItems = [...popularSearches].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTermInput.trim();
    if (!trimmed) return;
    await onAddTerm(trimmed);
    setNewTermInput('');
  };

  const handleMove = async (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= sortedItems.length) return;
    const next = [...sortedItems];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    await onReorderTerms(next);
  };

  const handleDropReorder = async (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...sortedItems];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setDragIndex(null);
    setDragOverIndex(null);
    await onReorderTerms(next);
  };

  return (
    <div className="panel-form add-form popular-searches-manager">
      <span className="eyebrow">CUSTOMER SEARCH EXPERIENCE</span>
      <h2>Edit Popular Searches</h2>
      <p>
        Add, edit, delete, and reorder the popular search chips shown to customers when they tap the search bar. All changes sync live with Firebase.
      </p>

      {/* Add New Popular Search Form */}
      <form className="popular-search-add-form" onSubmit={(e) => void handleSubmitAdd(e)}>
        <label style={{ flex: 1, minWidth: '220px', margin: 0 }}>
          New popular search keyword
          <input
            type="text"
            value={newTermInput}
            onChange={(e) => setNewTermInput(e.target.value)}
            placeholder="e.g. Ferrari, Action figure, Kit Card"
            maxLength={100}
            autoFocus
          />
        </label>
        <button
          type="submit"
          className="primary-btn"
          disabled={loading || !newTermInput.trim()}
          style={{ height: '46px', whiteSpace: 'nowrap' }}
        >
          <Plus size={16} />
          {loading ? 'Saving…' : 'Add search'}
        </button>
      </form>

      {/* Live Customer Preview */}
      <div className="popular-search-preview-box">
        <div className="popular-search-preview-label">
          <TrendingUp size={13} /> Customer Preview (what customers see on tap)
        </div>
        {sortedItems.length === 0 ? (
          <span className="popular-search-preview-empty">
            No popular searches configured yet. Customers will only see live typing suggestions until you add terms here.
          </span>
        ) : (
          <div className="catalog-popular-chips">
            {sortedItems.map((item) => (
              <span key={item.id} className="catalog-popular-chip preview-only">
                <Search size={12} /> {item.term}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Manage & Reorder List */}
      <div className="popular-search-list-section">
        <div className="popular-search-list-header">
          <h3>Configured Popular Searches ({sortedItems.length})</h3>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => void onRefresh()}
            disabled={loading}
            style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'refresh-spinning' : ''} />
            Refresh
          </button>
        </div>

        {sortedItems.length === 0 ? (
          <div
            className="empty-state compact"
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '10px',
              border: '1px dashed #d1d5db',
            }}
          >
            <div className="empty-icon" style={{ fontSize: '32px', marginBottom: '8px' }}>
              🔎
            </div>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 600 }}>
              No popular searches yet
            </h4>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
              Add your first popular search above to help customers discover trending toys and categories with one tap!
            </p>
          </div>
        ) : (
          <div className="popular-search-items-list">
            {sortedItems.map((item, idx) => {
              const isEditing = editingId === item.id;
              const isDragTarget = dragOverIndex === idx && dragIndex !== idx;

              return (
                <div
                  key={item.id}
                  className={`popular-search-row ${isDragTarget ? 'is-drag-over' : ''}`}
                  draggable={!isEditing && !loading}
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverIndex !== idx) setDragOverIndex(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === idx) setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void handleDropReorder(idx);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                >
                  <div className="popular-search-row-left">
                    <span
                      className="popular-search-drag-handle"
                      title="Drag to reorder"
                      aria-hidden="true"
                    >
                      <GripVertical size={16} />
                    </span>
                    <span className="popular-search-order-badge">#{idx + 1}</span>

                    {isEditing ? (
                      <form
                        className="popular-search-inline-edit"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = editingDraft.trim();
                          if (!trimmed) return;
                          void onEditTerm(item, trimmed).then(() => {
                            setEditingId(null);
                            setEditingDraft('');
                          });
                        }}
                      >
                        <input
                          type="text"
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                          maxLength={100}
                          autoFocus
                          aria-label="Edit popular search term"
                        />
                        <button
                          type="submit"
                          className="icon-btn"
                          style={{ background: '#e2edc7', color: '#29392b' }}
                          disabled={loading || !editingDraft.trim()}
                          title="Save changes"
                          aria-label="Save changes"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => {
                            setEditingId(null);
                            setEditingDraft('');
                          }}
                          title="Cancel editing"
                          aria-label="Cancel editing"
                        >
                          <X size={15} />
                        </button>
                      </form>
                    ) : (
                      <span className="popular-search-term-text">{item.term}</span>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="popular-search-row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={loading || idx === 0}
                        onClick={() => void handleMove(idx, -1)}
                        title="Move up"
                        aria-label={`Move ${item.term} up`}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={loading || idx === sortedItems.length - 1}
                        onClick={() => void handleMove(idx, 1)}
                        title="Move down"
                        aria-label={`Move ${item.term} down`}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={loading}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingDraft(item.term);
                        }}
                        title={`Edit ${item.term}`}
                        aria-label={`Edit ${item.term}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        disabled={loading}
                        onClick={() => void onDeleteTerm(item.id)}
                        title={`Delete ${item.term}`}
                        aria-label={`Delete ${item.term}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
