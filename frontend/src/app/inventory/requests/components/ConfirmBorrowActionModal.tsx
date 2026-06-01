'use client';

import type { BorrowAction } from '../lib/types';
import {
  CheckCircle2,
  XCircle,
  PackageOpen,
  Undo2,
  Archive,
  RotateCcw,
  Ban,
  Loader2,
} from 'lucide-react';
import type { ReactNode } from 'react';

const ACTION_CONFIG: Record<string, { icon: ReactNode; color: string; btnClass: string }> = {
  approve: {
    icon: <CheckCircle2 className="w-5 h-5" />,
    color: 'text-emerald-600 bg-emerald-50',
    btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  },
  reject: {
    icon: <XCircle className="w-5 h-5" />,
    color: 'text-rose-600 bg-rose-50',
    btnClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm',
  },
  void: {
    icon: <Ban className="w-5 h-5" />,
    color: 'text-rose-700 bg-rose-50',
    btnClass: 'bg-rose-700 hover:bg-rose-800 text-white shadow-sm',
  },
  release: {
    icon: <PackageOpen className="w-5 h-5" />,
    color: 'text-primary bg-primary/10',
    btnClass: 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm',
  },
  return: {
    icon: <Undo2 className="w-5 h-5" />,
    color: 'text-emerald-600 bg-emerald-50',
    btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  },
  reopen: {
    icon: <RotateCcw className="w-5 h-5" />,
    color: 'text-primary bg-primary/10',
    btnClass: 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm',
  },
  close: {
    icon: <Archive className="w-5 h-5" />,
    color: 'text-slate-600 bg-slate-100',
    btnClass: 'bg-slate-700 hover:bg-slate-800 text-white shadow-sm',
  },
};

export function ConfirmBorrowActionModal({
  confirmingAction,
  actionNotes,
  isProcessing = false,
  processingLabel,
  onActionNotesChange,
  onCancel,
  onConfirm,
}: {
  confirmingAction: { action: BorrowAction; requestId: string; actionLabel: string } | null;
  actionNotes: string;
  isProcessing?: boolean;
  processingLabel?: string;
  onActionNotesChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirmingAction) return null;

  const config = ACTION_CONFIG[confirmingAction.action] ?? ACTION_CONFIG.approve;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={isProcessing ? undefined : onCancel}
      />
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl relative z-10 animate-in zoom-in-95 fade-in duration-200">
        <div className="p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.color}`}>
              {config.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold font-heading">
                {confirmingAction.actionLabel} Request
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                This will {confirmingAction.actionLabel.toLowerCase()} request{' '}
                <span className="font-mono text-xs text-primary">{confirmingAction.requestId}</span>.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <textarea
              autoFocus
              value={actionNotes}
              disabled={isProcessing}
              onChange={(e) => onActionNotesChange(e.target.value)}
              placeholder={`Add a note for this ${confirmingAction.actionLabel.toLowerCase()}...`}
              className="w-full h-24 p-3 rounded-lg bg-muted/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 disabled:opacity-60 transition-all text-sm resize-none"
            />
          </div>

          <div className="flex gap-2.5 mt-5">
            <button
              disabled={isProcessing}
              onClick={onCancel}
              className="flex-1 h-10 rounded-lg border border-border font-medium text-sm hover:bg-muted/50 disabled:opacity-50 disabled:grayscale transition-all text-muted-foreground"
              type="button"
            >
              Cancel
            </button>
            <button
              disabled={isProcessing}
              onClick={onConfirm}
              className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:grayscale ${config.btnClass}`}
              type="button"
            >
              {isProcessing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {processingLabel || `${confirmingAction.actionLabel}...`}
                </span>
              ) : (
                confirmingAction.actionLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
