'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ActionConfirmTone = 'danger' | 'warning' | 'primary' | 'neutral';

const TONE_STYLES: Record<ActionConfirmTone, { icon: string; confirm: string }> = {
  danger: {
    icon: 'bg-rose-500/10 text-rose-600',
    confirm: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm',
  },
  warning: {
    icon: 'bg-amber-500/10 text-amber-600',
    confirm: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
  },
  primary: {
    icon: 'bg-primary/10 text-primary',
    confirm: 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm',
  },
  neutral: {
    icon: 'bg-slate-500/10 text-slate-600',
    confirm: 'bg-slate-700 hover:bg-slate-800 text-white shadow-sm',
  },
};

interface ActionConfirmModalProps {
  open: boolean;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  tone?: ActionConfirmTone;
  details?: ReactNode;
  noteLabel?: string;
  notePlaceholder?: string;
  noteValue?: string;
  onNoteChange?: (value: string) => void;
  confirming?: boolean;
  confirmDisabled?: boolean;
}

export function ActionConfirmModal({
  open,
  title,
  description,
  icon,
  confirmLabel,
  onCancel,
  onConfirm,
  cancelLabel = 'Cancel',
  tone = 'danger',
  details,
  noteLabel,
  notePlaceholder,
  noteValue = '',
  onNoteChange,
  confirming = false,
  confirmDisabled = false,
}: ActionConfirmModalProps) {
  if (!open) return null;

  const styles = TONE_STYLES[tone];
  const showNoteField = typeof onNoteChange === 'function';
  const noteFieldId = 'action-confirm-modal-note';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={confirming ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-confirm-modal-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 fade-in duration-200"
      >
        <div className="p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
              {icon}
            </div>
            <div className="min-w-0">
              <h3 id="action-confirm-modal-title" className="text-lg font-semibold font-heading">
                {title}
              </h3>
              <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</div>
            </div>
          </div>

          {details && (
            <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              {details}
            </div>
          )}

          {showNoteField && (
            <div className="space-y-1.5">
              <label htmlFor={noteFieldId} className="text-xs font-medium text-muted-foreground">
                {noteLabel ?? 'Notes (optional)'}
              </label>
              <textarea
                id={noteFieldId}
                autoFocus
                value={noteValue}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder={notePlaceholder ?? 'Add an optional note...'}
                className="h-24 w-full resize-none rounded-lg border border-border bg-muted/30 p-3 text-sm transition-all focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}

          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={confirming}
              className="h-10 flex-1 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-all hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming || confirmDisabled}
              className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${styles.confirm}`}
            >
              {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
