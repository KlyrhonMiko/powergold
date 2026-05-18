'use client';

import { useState, useEffect, useCallback } from 'react';
import { inventoryApi, InventoryMovement } from './api';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatQuantity } from '@/lib/inventoryQuantity';

interface ItemHistoryProps {
  itemId: string;
  onClose: () => void;
}

export function ItemHistory({ itemId, onClose }: ItemHistoryProps) {
  const [history, setHistory] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const historyRes = await inventoryApi.getHistory(itemId);
      setHistory(historyRes.data);
    } catch {
      toast.error('Failed to load item activity');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div>
            <h2 className="text-xl font-bold font-heading">Movement Ledger & Health</h2>
            <p className="text-sm text-muted-foreground">Historical equipment movement and reconciliation status.</p>
          </div>
          <button onClick={onClose} aria-label="Close item history" className="p-2 text-muted-foreground hover:bg-secondary rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 h-[600px] overflow-y-auto">
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border/50" />
            <div className="space-y-6">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No movement records found for this item.</div>
              ) : history.map((move) => (
                <div key={move.movement_id} className="relative pl-10">
                  <div className={`absolute left-2.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-background z-10 ${move.qty_change > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`} />
                  <div className="p-4 rounded-2xl bg-background border border-border/50 hover:border-border transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${move.qty_change > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {move.qty_change > 0 ? '+' : ''}{formatQuantity(move.qty_change)} change
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-secondary border border-border uppercase font-bold tracking-tighter">
                          {move.movement_type.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">{move.occurred_at}</span>
                    </div>
                    <p className="text-sm text-foreground mb-1">{move.note || `Movement entry for ${move.movement_type}.`}</p>
                    {(move.borrower_name || move.customer_name || move.location_name) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-muted-foreground">
                        {move.borrower_name && <span><span className="font-medium text-foreground/80">Borrowed by:</span> {move.borrower_name}</span>}
                        {move.customer_name && <span><span className="font-medium text-foreground/80">Client:</span> {move.customer_name}</span>}
                        {move.location_name && <span><span className="font-medium text-foreground/80">Location:</span> {move.location_name}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                      <span>ID: {move.movement_id}</span>
                      {move.reference_id && <span>REF: {move.reference_id}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
