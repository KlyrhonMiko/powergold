'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Info, Layers, Sparkles } from 'lucide-react';
import { parseSystemDate } from '@/lib/utils';
import { borrowApi, BorrowRequest } from './api';
import { toast } from 'sonner';
import {
  areQuantitiesEqual,
  formatQuantity,
  formatQuantityWithUnit,
  parseQuantityInput,
  quantizeQuantity,
  sumQuantities,
} from '@/lib/inventoryQuantity';

interface UnitSelectionModalProps {
  request: BorrowRequest;
  onClose: () => void;
  onSuccess: () => void;
  onProcessingChange?: (isProcessing: boolean) => void;
}

interface BatchAvailability {
  batch_id: string;
  available_qty: number;
  expiration_date?: string;
}

interface ItemAssignmentData {
  itemId: string;
  name: string;
  qtyRequested: number;
  unitOfMeasure?: string | null;
  isTrackable: boolean;
  // For trackable
  availableUnits: {
    unit_id: string;
    serial_number: string;
    condition: string;
  }[];
  selectedUnitIds: string[];
  // For untrackable
  availableBatches: BatchAvailability[];
  selectedBatches: { batch_id: string; qty: number }[];

  loading: boolean;
  error: string | null;
}

export function UnitSelectionModal({
  request,
  onClose,
  onSuccess,
  onProcessingChange,
}: UnitSelectionModalProps) {
  const [itemsData, setItemsData] = useState<ItemAssignmentData[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const isBusy = loadingOptions || submitting;

  const fetchAssignmentOptions = useCallback(async (allItems: ItemAssignmentData[]) => {
    setLoadingOptions(true);
    try {
      const res = await borrowApi.getAssignmentOptions(request.request_id);
      const optionMap = new Map(res.data.items.map((item) => [item.item_id, item]));
      setItemsData(
        allItems.map((item) => {
          const option = optionMap.get(item.itemId);
          if (!option) {
            return {
              ...item,
              loading: false,
              error: 'No assignment options found for this request item',
            };
          }
          return {
            ...item,
            availableUnits: option.available_units.map((unit) => ({
              unit_id: unit.unit_id,
              serial_number: unit.serial_number ?? '',
              condition: unit.condition ?? 'good',
            })),
            availableBatches: option.available_batches.map((batch) => ({
              batch_id: batch.batch_id,
              available_qty: batch.available_qty,
              expiration_date: batch.expiration_date ?? undefined,
            })),
            loading: false,
            error: null,
          };
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch assignment options';
      setItemsData(
        allItems.map((item) => ({
          ...item,
          loading: false,
          error: message,
        })),
      );
    } finally {
      setLoadingOptions(false);
    }
  }, [request.request_id]);

  // Initialize all items in the request
  useEffect(() => {
    const allItems = request.items.map(item => ({
      itemId: item.item_id,
      name: item.name,
      qtyRequested: item.qty_requested,
      unitOfMeasure: item.unit_of_measure,
      isTrackable: !!item.is_trackable,
      availableUnits: [],
      selectedUnitIds: [],
      availableBatches: [],
      selectedBatches: [],
      loading: true,
      error: null,
    }));
    setItemsData(allItems);

    void fetchAssignmentOptions(allItems);
  }, [fetchAssignmentOptions, request]);

  const toggleUnitSelection = (itemId: string, unitId: string) => {
    setItemsData(prev => prev.map(item => {
      if (item.itemId !== itemId) return item;

      const isSelected = item.selectedUnitIds.includes(unitId);
      if (!isSelected && item.selectedUnitIds.length >= item.qtyRequested) {
        toast.error(`Already selected ${formatQuantity(item.qtyRequested)} units for ${item.name}`);
        return item;
      }

      const nextSelection = isSelected
        ? item.selectedUnitIds.filter(id => id !== unitId)
        : [...item.selectedUnitIds, unitId];

      return { ...item, selectedUnitIds: nextSelection };
    }));
  };

  const handleBatchQtyChange = (itemId: string, batchId: string, qty: number) => {
    setItemsData(prev => prev.map(item => {
      if (item.itemId !== itemId) return item;

      const batch = item.availableBatches.find(b => b.batch_id === batchId);
      if (!batch) return item;

      // Ensure qty doesn't exceed available or requested (requested is more of a validation later)
      const sanitizedQty = quantizeQuantity(Math.max(0, Math.min(qty, batch.available_qty)));

      const otherAssignmentsTotal = sumQuantities(
        item.selectedBatches
          .filter((selectedBatch) => selectedBatch.batch_id !== batchId)
          .map((selectedBatch) => selectedBatch.qty),
      );

      if (otherAssignmentsTotal + sanitizedQty > item.qtyRequested) {
        const allowedQty = quantizeQuantity(Math.max(0, item.qtyRequested - otherAssignmentsTotal));
        toast.error(
          `Cannot exceed requested quantity (${formatQuantityWithUnit(item.qtyRequested, item.unitOfMeasure)}) for ${item.name}`,
        );

        const nextBatches = item.selectedBatches.filter(b => b.batch_id !== batchId);
        if (allowedQty > 0) nextBatches.push({ batch_id: batchId, qty: allowedQty });
        return { ...item, selectedBatches: nextBatches };
      }

      const nextBatches = item.selectedBatches.filter(b => b.batch_id !== batchId);
      if (sanitizedQty > 0) {
        nextBatches.push({ batch_id: batchId, qty: sanitizedQty });
      }

      return { ...item, selectedBatches: nextBatches };
    }));
  };

  const autoAssignTrackable = (itemId: string) => {
    setItemsData(prev => prev.map(item => {
      if (item.itemId !== itemId || !item.isTrackable) return item;
      const autoSelected = item.availableUnits
        .slice(0, item.qtyRequested)
        .map(u => u.unit_id);
      return { ...item, selectedUnitIds: autoSelected };
    }));
  };

  const autoAssignUntrackable = (itemId: string) => {
    setItemsData(prev => prev.map(item => {
      if (item.itemId !== itemId || item.isTrackable) return item;
      let remaining = item.qtyRequested;
      const batches: { batch_id: string; qty: number }[] = [];
      for (const batch of item.availableBatches) {
        if (remaining <= 0) break;
        const take = quantizeQuantity(Math.min(remaining, batch.available_qty));
        batches.push({ batch_id: batch.batch_id, qty: take });
        remaining = quantizeQuantity(remaining - take);
      }
      return { ...item, selectedBatches: batches };
    }));
  };

  const autoAssignAll = () => {
    itemsData.forEach(item => {
      if (item.isTrackable) {
        autoAssignTrackable(item.itemId);
      } else {
        autoAssignUntrackable(item.itemId);
      }
    });
  };

  const handleAssign = async () => {
    // Validate all items have enough units/qty selected
    for (const item of itemsData) {
      if (item.isTrackable) {
        if (item.selectedUnitIds.length < item.qtyRequested) {
          toast.error(`Please select ${formatQuantity(item.qtyRequested)} units for ${item.name}`);
          return;
        }
      } else {
        const total = sumQuantities(item.selectedBatches.map((batch) => batch.qty));
        if (total < item.qtyRequested) {
          toast.error(
            `Please assign ${formatQuantityWithUnit(item.qtyRequested, item.unitOfMeasure)} for ${item.name}`,
          );
          return;
        }
      }
    }

    setSubmitting(true);
    onProcessingChange?.(true);
    try {
      await borrowApi.assignInventory(request.request_id, {
        items: itemsData.map((item) => ({
          item_id: item.itemId,
          unit_ids: item.isTrackable ? item.selectedUnitIds : [],
          batch_assignments: item.isTrackable
            ? []
            : item.selectedBatches.map((batch) => ({
              batch_id: batch.batch_id,
              qty: batch.qty,
            })),
        })),
        notes: notes || undefined,
      });
      toast.success('Inventory assigned successfully');
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign inventory';
      toast.error(message);
    } finally {
      setSubmitting(false);
      onProcessingChange?.(false);
    }
  };

  const getPercentageSelected = (item: ItemAssignmentData) => {
    if (item.isTrackable) {
      return (item.selectedUnitIds.length / item.qtyRequested) * 100;
    }
    const totalSelected = sumQuantities(item.selectedBatches.map((batch) => batch.qty));
    return (totalSelected / item.qtyRequested) * 100;
  };

  const isValid = itemsData.length > 0 && itemsData.every(item => {
    if (item.isTrackable) {
      return item.selectedUnitIds.length === item.qtyRequested;
    }
    const total = sumQuantities(item.selectedBatches.map((batch) => batch.qty));
    return areQuantitiesEqual(total, item.qtyRequested);
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div>
            <h2 className="text-xl font-bold font-heading uppercase tracking-tight">Assign Inventory</h2>
            <p className="text-sm text-muted-foreground font-medium">Request ID: <span className="text-primary font-mono">{request.request_id}</span></p>
          </div>
          <div className="flex items-center gap-2">
            {itemsData.length > 0 && (
              <button
                disabled={isBusy}
                onClick={autoAssignAll}
                className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 disabled:opacity-50 disabled:grayscale transition-colors uppercase tracking-wider"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Auto Assign All
              </button>
            )}
            <button disabled={isBusy} onClick={onClose} aria-label="Close assignment modal" className="p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50 disabled:grayscale rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {itemsData.length === 0 ? (
            <div className="text-center py-12">
              <Info className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground font-medium">No items in this request.</p>
            </div>
          ) : itemsData.map((item) => (
            <div key={item.itemId} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    {item.name}
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{item.itemId}</span>
                    {item.isTrackable ? (
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Trackable</span>
                    ) : (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Untrackable</span>

                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium">
                    Requested: <span className="text-foreground">{formatQuantityWithUnit(item.qtyRequested, item.unitOfMeasure)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!item.loading && !item.error && getPercentageSelected(item) < 100 && (
                    <button
                      disabled={isBusy}
                      onClick={() => item.isTrackable ? autoAssignTrackable(item.itemId) : autoAssignUntrackable(item.itemId)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 disabled:opacity-50 disabled:grayscale transition-colors uppercase tracking-wider"
                    >
                      <Sparkles className="w-3 h-3" />
                      Auto
                    </button>
                  )}
                  <div className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${getPercentageSelected(item) === 100
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : 'bg-primary/10 text-primary border-primary/20 font-bold'

                    }`}>
                    {item.isTrackable
                      ? `${item.selectedUnitIds.length} / ${formatQuantity(item.qtyRequested)} Selected`
                      : `${formatQuantityWithUnit(sumQuantities(item.selectedBatches.map((batch) => batch.qty)), item.unitOfMeasure)} / ${formatQuantityWithUnit(item.qtyRequested, item.unitOfMeasure)} Allocated`
                    }
                  </div>
                </div>
              </div>

              {item.loading ? (
                <div className="p-8 text-center bg-muted/20 rounded-2xl border border-dashed border-border/50">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  <p className="text-xs text-muted-foreground mt-2 font-medium">Fetching {item.isTrackable ? 'units' : 'batches'}...</p>
                </div>
              ) : item.error ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <p>{item.error}</p>
                </div>
              ) : item.isTrackable ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {item.availableUnits.length === 0 ? (
                    <div className="col-span-full p-6 text-center bg-muted/10 rounded-2xl border border-dashed border-border/50">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">No available units found.</p>
                    </div>
                  ) : item.availableUnits.map((unit) => {
                    const isSelected = item.selectedUnitIds.includes(unit.unit_id);
                    const conditionColor = unit.condition === 'good' || unit.condition === 'excellent'
                      ? 'text-emerald-500 bg-emerald-500/10'
                      : unit.condition === 'fair'
                        ? 'text-amber-500 bg-amber-500/10'
                        : 'text-rose-500 bg-rose-500/10';
                    return (
                      <button
                        key={unit.unit_id}
                        disabled={isBusy}
                        onClick={() => toggleUnitSelection(item.itemId, unit.unit_id)}
                        className={`p-4 rounded-2xl border transition-all text-left flex flex-col gap-1.5 group disabled:opacity-60 disabled:grayscale ${isSelected
                          ? 'bg-primary/10 border-primary shadow-sm'
                          : 'hover:bg-background/50 border-border group-hover:border-primary/50'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-mono font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                            {unit.serial_number}
                          </span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-primary animate-in zoom-in-50 duration-200" />}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${conditionColor}`}>
                            {unit.condition}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {item.availableBatches.length === 0 ? (
                    <div className="p-6 text-center bg-muted/10 rounded-2xl border border-dashed border-border/50">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">No available batches found.</p>
                    </div>
                  ) : item.availableBatches.map((batch) => {
                    const selected = item.selectedBatches.find(b => b.batch_id === batch.batch_id);
                    const qty = selected?.qty || 0;
                    return (
                      <div
                        key={batch.batch_id}
                        className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${qty > 0 ? 'bg-primary/10 border-primary' : 'bg-card border-border'
                          }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-xl ${qty > 0 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            <Layers className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold font-mono">{batch.batch_id}</span>
                              {batch.expiration_date && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${parseSystemDate(batch.expiration_date) < new Date() ? 'bg-rose-500 text-rose-50' : 'bg-amber-500/10 text-amber-500'
                                  }`}>
                                  Exp: {parseSystemDate(batch.expiration_date).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-medium">
                              Available: <span className="text-foreground">{formatQuantityWithUnit(batch.available_qty, item.unitOfMeasure)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            disabled={isBusy}
                            onClick={() => handleBatchQtyChange(item.itemId, batch.batch_id, qty - 0.001)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary hover:bg-muted disabled:opacity-50 disabled:grayscale font-bold transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={qty}
                            disabled={isBusy}
                            min={0}
                            step="0.001"
                            onChange={(e) => handleBatchQtyChange(item.itemId, batch.batch_id, parseQuantityInput(e.target.value, 0))}
                            className="w-16 h-8 text-center bg-transparent border-b-2 border-primary/50 focus:border-primary disabled:opacity-50 outline-none text-sm font-bold"
                          />
                          <button
                            disabled={isBusy}
                            onClick={() => handleBatchQtyChange(item.itemId, batch.batch_id, qty + 0.001)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary hover:bg-muted disabled:opacity-50 disabled:grayscale font-bold transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-border/50 bg-background/50 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Assignment Notes (Optional)</label>
            <textarea
              value={notes}
              disabled={isBusy}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add some context to this assignment..."
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
              disabled={!isValid || submitting}
              onClick={handleAssign}
              className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Assignment'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
