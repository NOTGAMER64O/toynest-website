import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface AnimatedCategoryDropdownProps {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (category: string) => void;
}

export const AnimatedCategoryDropdown: React.FC<AnimatedCategoryDropdownProps> = ({
  id,
  label,
  value,
  options,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      const idx = options.indexOf(value);
      setHighlightedIdx(idx >= 0 ? idx : 0);
    }
  }, [isOpen, options, value]);

  const handleSelect = (opt: string) => {
    onChange(opt);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIdx((prev) => (prev + 1) % options.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIdx((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (isOpen && highlightedIdx >= 0 && highlightedIdx < options.length) {
        e.preventDefault();
        handleSelect(options[highlightedIdx]);
      }
    }
  };

  return (
    <div className="category-filter" ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <div className={`category-dropdown-wrap ${isOpen ? 'is-open' : ''}`}>
        <button
          id={id}
          type="button"
          className="category-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
        >
          <span className="category-dropdown-value">{value}</span>
          <ChevronDown
            size={16}
            className={`category-dropdown-chevron ${isOpen ? 'is-rotated' : ''}`}
            aria-hidden="true"
          />
        </button>

        {isOpen && (
          <ul
            className="category-dropdown-menu"
            role="listbox"
            aria-labelledby={id}
          >
            {options.map((opt, idx) => {
              const isSelected = opt === value;
              const isHighlighted = idx === highlightedIdx;
              return (
                <li
                  key={opt}
                  role="option"
                  aria-selected={isSelected}
                  className={`category-dropdown-option ${isSelected ? 'is-selected' : ''} ${
                    isHighlighted ? 'is-highlighted' : ''
                  }`}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  onClick={() => handleSelect(opt)}
                >
                  <span>{opt}</span>
                  {isSelected && <Check size={14} className="category-dropdown-check" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
