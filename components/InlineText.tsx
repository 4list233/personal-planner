'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlannerStore } from '@/lib/store';

interface InlineTextProps {
  taskId: string;
  field: string;
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  /** Reject an empty value and put the old text back. */
  required?: boolean;
  /** Focus on mount, for the title of a task that was just started. */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Text that saves when you leave the field. While focused it ignores the store,
 * so a background refresh can't replace what is being typed.
 */
export default function InlineText({
  taskId,
  field,
  value,
  onCommit,
  ariaLabel,
  placeholder,
  multiline = false,
  rows = 3,
  required = false,
  autoFocus = false,
  className = '',
}: InlineTextProps) {
  const setEditing = usePlannerStore((state) => state.setEditing);
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const shared = {
    value: draft,
    'aria-label': ariaLabel,
    placeholder,
    autoFocus,
    className,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onFocus: () => {
      focused.current = true;
      setEditing({ taskId, field });
    },
    onBlur: () => {
      focused.current = false;
      setEditing(null);
      if (required && !draft.trim()) {
        setDraft(value);
        return;
      }
      if (draft !== value) onCommit(draft);
    },
  };

  if (multiline) return <textarea rows={rows} {...shared} />;
  return (
    <input
      type="text"
      {...shared}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
