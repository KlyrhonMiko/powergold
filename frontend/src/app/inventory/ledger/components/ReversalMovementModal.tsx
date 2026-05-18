'use client';

import { Loader2, Undo2, X, FileText, AlertCircle } from 'lucide-react';
import type { LedgerMovement } from '../lib/types';
import { formatQuantity } from '@/lib/inventoryQuantity';

export function ReversalMovementModal({
  open,
  selectedMovement,
  reasonCodes,
  reversalReasonCode,
  onReversalReasonCodeChange,
  reversalReason,
  onReversalReasonChange,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  selectedMovement: LedgerMovement | null;
  reasonCodes: string[];
  reversalReasonCode: string;
  onReversalReasonCodeChange: (v: string) => void;
  reversalReason: string;
  onReversalReasonChange: (v: string) => void;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
}) {
  if (!open || !selectedMovement) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reversal-modal-title"
    >
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-border">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <Undo2 className="w-6 h-6" aria-hidden />
            </div>
            <div>
              <h2 id="reversal-modal-title" className="text-lg font-semibold text-foreground">
                Reverse transaction
              </h2>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">
                {selectedMovement.movement_id}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            type="button"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 sm:p-6 space-y-6">
          <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Original transaction</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Equipment</p>
                <p className="text-sm font-medium truncate">{selectedMovement.item_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quantity</p>
                <p
                  className={`text-sm font-semibold ${
                    selectedMovement.qty_change > 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {selectedMovement.qty_change > 0 ? '+' : ''}
                  {formatQuantity(selectedMovement.qty_change)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="text-sm">{selectedMovement.occurred_at}</p>
              </div>
              {selectedMovement.note && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Note</p>
                  <p className="text-sm italic">&quot;{selectedMovement.note}&quot;</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="reversal-reason-code"
                className="flex items-center gap-2 text-sm font-medium text-foreground mb-2"
              >
                <AlertCircle className="w-4 h-4 text-amber-500" aria-hidden />
                Reason type
              </label>
              <select
                id="reversal-reason-code"
                required
                value={reversalReasonCode}
                onChange={(e) => onReversalReasonCodeChange(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                {reasonCodes.map((code) => (
                  <option key={code} value={code}>
                    {code.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="reversal-reason"
                className="flex items-center gap-2 text-sm font-medium text-foreground mb-2"
              >
                <FileText className="w-4 h-4 text-primary" aria-hidden />
                Explain why you are reversing this
              </label>
              <textarea
                id="reversal-reason"
                required
                value={reversalReason}
                onChange={(e) => onReversalReasonChange(e.target.value)}
                placeholder="e.g. Wrong quantity entered, duplicate entry..."
                className="w-full min-h-[100px] p-4 rounded-lg border border-border bg-background text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              />
              <p className="text-sm text-muted-foreground mt-1.5">
                This will create a counter-transaction and update the stock balance.
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-12 px-4 rounded-lg font-medium bg-muted hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reversalReason}
              className="flex-1 h-12 px-4 rounded-lg font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
              ) : (
                <>
                  <Undo2 className="w-4 h-4" aria-hidden />
                  Reverse transaction
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
