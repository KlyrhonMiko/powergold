'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Undo2, AlertCircle, ChevronDown, Check } from 'lucide-react';
import { borrowApi, BorrowBatchReturn, BorrowRequest, BorrowRequestBatch, BorrowRequestUnit, BorrowUnitReturn } from './api';
import { inventoryApi, ConfigRead } from '../items/api';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { formatQuantityWithUnit, parseQuantityInput, quantizeQuantity } from '@/lib/inventoryQuantity';

interface ReturnModalProps {
  request: BorrowRequest;
  onClose: () => void;
  onSuccess: () => void;
  onProcessingChange?: (isProcessing: boolean) => void;
}

interface UnitReturnState {
  unit_id: string;
  serial_number?: string;
  condition_on_return: string;
  notes: string;
}

interface BatchReturnState {
  borrow_batch_id: string;
  batch_id: string;
  item_id?: string;
  item_name?: string;
  unit_of_measure?: string | null;
  qty_assigned: number;
  qty_returned: number;
}

export function ReturnModal({
  request,
  onClose,
  onSuccess,
  onProcessingChange,
}: ReturnModalProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignedUnits, setAssignedUnits] = useState<BorrowRequestUnit[]>([]);
  const [conditions, setConditions] = useState<ConfigRead[]>([]);
  const [unitReturns, setUnitReturns] = useState<UnitReturnState[]>([]);
  const [batchReturns, setBatchReturns] = useState<BatchReturnState[]>([]);
  const [globalNotes, setGlobalNotes] = useState('');
  const [globalCondition, setGlobalCondition] = useState('');
  const [globalConditionOpen, setGlobalConditionOpen] = useState(false);
  const [openConditionUnit, setOpenConditionUnit] = useState<string | null>(null);
  const isBusy = loading || submitting;

  const hasTrackableItems = request.items.some((item) => !!item.is_trackable);

  const conditionStyle = (condition: string) => {
    if (!condition) return 'bg-muted/40 border-border text-muted-foreground';
    if (condition === 'good' || condition === 'excellent') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500';
    if (condition === 'fair') return 'bg-primary/10 border-primary/30 text-primary font-bold';

    return 'bg-rose-500/10 border-rose-500/30 text-rose-500';
  };

  const conditionLabel = (key: string) => {
    if (!key) return 'No change';
    return conditions.find(c => c.key === key)?.value || key;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [unitsRes, batchesRes, conditionsRes] = await Promise.all([
          borrowApi.getAssignedUnits(request.request_id),
          borrowApi.getAssignedBatches(request.request_id),
          inventoryApi.getConfigs('inventory_units_condition'),
        ]);

        const units = (unitsRes.data as BorrowRequestUnit[]).filter(u => !u.returned_at);
        const batches = (batchesRes.data as BorrowRequestBatch[]).filter(batch => !batch.returned_at);
        setAssignedUnits(units);
        setConditions(conditionsRes.data as ConfigRead[]);

        setUnitReturns(units.map(u => ({
          unit_id: u.unit_id,
          serial_number: u.serial_number,
          condition_on_return: '',
          notes: '',
        })));
        setBatchReturns(batches.map(batch => ({
          borrow_batch_id: batch.borrow_batch_id,
          batch_id: batch.batch_id,
          item_id: batch.item_id,
          item_name: batch.item_name,
          unit_of_measure: batch.unit_of_measure ?? request.items.find((item) => item.item_id === batch.item_id)?.unit_of_measure,
          qty_assigned: batch.qty_assigned,
          qty_returned: batch.qty_not_returned ?? batch.qty_assigned,
        })));
      } catch (err) {
        logger.error('Failed to load return modal data', { error: err, requestId: request.request_id });
        toast.error('Failed to load return details');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [request.items, request.request_id]);

  const updateUnitReturn = (unitId: string, field: 'condition_on_return' | 'notes', value: string) => {
    setUnitReturns(prev => prev.map(u =>
      u.unit_id === unitId ? { ...u, [field]: value } : u
    ));
  };

  const updateBatchReturn = (borrowBatchId: string, value: number) => {
    setBatchReturns(prev => prev.map(batch =>
      batch.borrow_batch_id === borrowBatchId
        ? { ...batch, qty_returned: quantizeQuantity(Math.max(0, Math.min(batch.qty_assigned, value))) }
        : batch
    ));
  };

  const applyGlobalCondition = () => {
    if (!globalCondition) return;
    setUnitReturns(prev => prev.map(u => ({ ...u, condition_on_return: globalCondition })));
    toast.success(`Set all units to "${globalCondition}"`);
  };


  const handleReturn = async () => {
    setSubmitting(true);
    onProcessingChange?.(true);
    try {
      const unit_returns: BorrowUnitReturn[] = unitReturns.map(u => ({
        unit_id: u.unit_id,
        condition_on_return: u.condition_on_return || undefined,
        notes: u.notes || undefined,
      }));
      const batch_returns: BorrowBatchReturn[] = batchReturns.map(batch => ({
        borrow_batch_id: batch.borrow_batch_id,
        qty_returned: batch.qty_returned,
      }));

      const hasUnitData = unit_returns.some(u => u.condition_on_return || u.notes);
      await borrowApi.return(request.request_id, {
        notes: globalNotes || undefined,
        unit_returns: hasUnitData ? unit_returns : undefined,
        batch_returns: batch_returns.length > 0 ? batch_returns : undefined,
      });

      toast.success('Items returned successfully');
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to return items';
      toast.error(message);
    } finally {
      setSubmitting(false);
      onProcessingChange?.(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-500">
              <Undo2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-heading uppercase tracking-tight">Return Items</h2>
              <p className="text-sm text-muted-foreground font-medium">
                Request: <span className="text-primary font-mono">{request.request_id}</span>
              </p>
            </div>
          </div>
          <button disabled={isBusy} onClick={onClose} aria-label="Close return modal" className="p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50 disabled:grayscale rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              <p className="text-xs text-muted-foreground mt-2 font-medium">Loading assigned units...</p>
            </div>
          ) : (
            <>
              {hasTrackableItems && assignedUnits.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Unit Conditions</h3>
                    {assignedUnits.length > 1 && conditions.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Set all:</span>
                        <Popover open={globalConditionOpen} onOpenChange={setGlobalConditionOpen}>
                        <PopoverTrigger
                            disabled={isBusy}
                            type="button"
                            className={cn(
                              "relative h-8 pl-3 pr-7 rounded-lg border text-xs font-bold text-left focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all cursor-pointer",
                              conditionStyle(globalCondition)
                            )}
                          >
                            <span className="block truncate">{conditionLabel(globalCondition) || 'Select...'}</span>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
                          </PopoverTrigger>
                          <PopoverContent align="end" sideOffset={4} className="w-44 p-1 max-h-60 overflow-y-auto">
                            {conditions.map(c => (
                              <button
                                key={c.key}
                                type="button"
                                onClick={() => {
                                  setGlobalCondition(c.key);
                                  setGlobalConditionOpen(false);
                                }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left",
                                  globalCondition === c.key
                                    ? "bg-primary/10 text-primary font-bold"
                                    : "hover:bg-muted text-foreground"
                                )}
                              >
                                <Check className={cn("w-3.5 h-3.5 shrink-0", globalCondition === c.key ? "opacity-100" : "opacity-0")} />
                                {c.value}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                        <button
                          disabled={isBusy || !globalCondition}
                          onClick={applyGlobalCondition}
                          className="h-8 px-3 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 disabled:opacity-50 transition-colors uppercase tracking-wider"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {unitReturns.map((unitReturn) => (
                      <div
                        key={unitReturn.unit_id}
                        className="p-4 rounded-2xl border border-border bg-background/50 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-bold font-mono text-foreground">{unitReturn.unit_id}</span>
                            {unitReturn.serial_number && (
                              <span className="ml-2 text-xs text-muted-foreground font-medium">
                                SN: {unitReturn.serial_number}
                              </span>
                            )}
                          </div>
                          {conditions.length > 0 ? (
                            <Popover
                              open={openConditionUnit === unitReturn.unit_id}
                              onOpenChange={(open) => setOpenConditionUnit(open ? unitReturn.unit_id : null)}
                            >
                              <PopoverTrigger
                                disabled={isBusy}
                                type="button"
                                className={cn(
                                  "relative h-9 pl-3 pr-8 rounded-xl border text-xs font-bold text-left focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all cursor-pointer min-w-[120px]",
                                  conditionStyle(unitReturn.condition_on_return)
                                )}
                              >
                                <span className="block truncate">{conditionLabel(unitReturn.condition_on_return)}</span>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
                              </PopoverTrigger>
                              <PopoverContent align="end" sideOffset={4} className="w-44 p-1 max-h-60 overflow-y-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateUnitReturn(unitReturn.unit_id, 'condition_on_return', '');
                                    setOpenConditionUnit(null);
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left",
                                    !unitReturn.condition_on_return
                                      ? "bg-primary/10 text-primary font-bold"
                                      : "hover:bg-muted text-muted-foreground"
                                  )}
                                >
                                  <Check className={cn("w-3.5 h-3.5 shrink-0", !unitReturn.condition_on_return ? "opacity-100" : "opacity-0")} />
                                  No change
                                </button>
                                {conditions.map(c => (
                                  <button
                                    key={c.key}
                                    type="button"
                                    onClick={() => {
                                      updateUnitReturn(unitReturn.unit_id, 'condition_on_return', c.key);
                                      setOpenConditionUnit(null);
                                    }}
                                    className={cn(
                                      "w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left",
                                      unitReturn.condition_on_return === c.key
                                        ? "bg-primary/10 text-primary font-bold"
                                        : "hover:bg-muted text-foreground"
                                    )}
                                  >
                                    <Check className={cn("w-3.5 h-3.5 shrink-0", unitReturn.condition_on_return === c.key ? "opacity-100" : "opacity-0")} />
                                    {c.value}
                                  </button>
                                ))}
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <input
                              type="text"
                              value={unitReturn.condition_on_return}
                              disabled={isBusy}
                              onChange={(e) => updateUnitReturn(unitReturn.unit_id, 'condition_on_return', e.target.value)}
                              placeholder="Condition (optional)"
                              className="h-9 w-36 px-3 rounded-xl bg-input/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 transition-all text-xs font-medium"
                            />
                          )}
                        </div>
                        <input
                          type="text"
                          value={unitReturn.notes}
                          disabled={isBusy}
                          onChange={(e) => updateUnitReturn(unitReturn.unit_id, 'notes', e.target.value)}
                          placeholder="Notes for this unit (optional)..."
                          className="w-full h-9 px-3 rounded-xl bg-input/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 transition-all text-xs font-medium"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!hasTrackableItems && (
                <div className="p-4 bg-muted/20 rounded-2xl border border-dashed border-border/50 text-center">
                  <p className="text-sm text-muted-foreground font-medium">
                    This request contains non-trackable items. Set how many units came back from each released batch. Any remaining quantity will be treated as not returned when this request is completed.
                  </p>
                </div>
              )}

              {batchReturns.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Batch Return Quantities</h3>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                      Enter the quantity returned for each released untrackable batch.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {batchReturns.map((batchReturn) => {
                      const qtyNotReturned = quantizeQuantity(Math.max(batchReturn.qty_assigned - batchReturn.qty_returned, 0));

                      return (
                        <div
                          key={batchReturn.borrow_batch_id}
                          className="p-4 rounded-2xl border border-border bg-background/50 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold font-mono text-foreground">{batchReturn.batch_id}</span>
                                {batchReturn.item_id && (
                                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded uppercase tracking-wider">
                                    {batchReturn.item_id}
                                  </span>
                                )}
                              </div>
                              {batchReturn.item_name && (
                                <p className="text-xs text-muted-foreground font-medium mt-1">{batchReturn.item_name}</p>
                              )}
                            </div>
                            <div className="text-right text-xs font-medium text-muted-foreground">
                              <p>Assigned: <span className="text-foreground font-bold">{formatQuantityWithUnit(batchReturn.qty_assigned, batchReturn.unit_of_measure)}</span></p>
                              <p>Not returned: <span className="text-foreground font-bold">{formatQuantityWithUnit(qtyNotReturned, batchReturn.unit_of_measure)}</span></p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                              Returned Qty
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={batchReturn.qty_assigned}
                              step="0.001"
                              value={batchReturn.qty_returned}
                              disabled={isBusy}
                              onChange={(e) => updateBatchReturn(batchReturn.borrow_batch_id, parseQuantityInput(e.target.value, 0))}
                              className="h-10 w-28 px-3 rounded-xl bg-input/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 transition-all text-sm font-bold"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => updateBatchReturn(batchReturn.borrow_batch_id, batchReturn.qty_assigned)}
                              className="h-10 px-3 rounded-xl border border-border text-xs font-bold hover:bg-muted/50 disabled:opacity-50 disabled:grayscale transition-colors uppercase tracking-wider"
                            >
                              Full
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => updateBatchReturn(batchReturn.borrow_batch_id, 0)}
                              className="h-10 px-3 rounded-xl border border-border text-xs font-bold hover:bg-muted/50 disabled:opacity-50 disabled:grayscale transition-colors uppercase tracking-wider"
                            >
                              Zero
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!hasTrackableItems && batchReturns.length === 0 && (
                <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 flex items-center gap-3 text-primary text-sm font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>No released batch assignments found for this request.</p>
                </div>
              )}

              {hasTrackableItems && assignedUnits.length === 0 && (
                <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 flex items-center gap-3 text-primary text-sm font-bold">

                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>No unreturned units found for this request.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-border/50 bg-background/50 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Return Notes (Optional)</label>
            <textarea
              value={globalNotes}
              disabled={isBusy}
              onChange={(e) => setGlobalNotes(e.target.value)}
              placeholder="General notes about this return..."
              className="w-full h-20 p-3 rounded-xl bg-input/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 transition-all text-sm font-medium resize-none shadow-inner"
            />
          </div>

          <div className="flex gap-3">
            <button
              disabled={isBusy}
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl border border-border font-bold text-sm hover:bg-muted/50 disabled:opacity-50 disabled:grayscale transition-all uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              disabled={submitting || loading}
              onClick={handleReturn}
              className="flex-1 h-12 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Return'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
