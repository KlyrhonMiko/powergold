'use client';

import { useState, useCallback } from 'react';
import { inventoryApi, InventoryBatch, StockAdjustmentPayload } from './api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useInventoryBatches } from './lib/useItemQueries';
import { format as formatDateFns } from 'date-fns';
import { X, Plus, Edit2, Loader2, Layers, History as HistoryIcon, TrendingUp, TrendingDown, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/date-picker';
import { FormSelect } from '@/components/ui/form-select';
import { ActionConfirmModal } from '@/components/ui/ActionConfirmModal';
import { parseSystemDate } from '@/lib/utils';
import { formatQuantity, parseQuantityInput } from '@/lib/inventoryQuantity';

interface BatchManagementProps {
  itemId: string;
  onClose: () => void;
}

export function BatchManagement({ itemId, onClose }: BatchManagementProps) {
  const queryClient = useQueryClient();

  const [isAdding, setIsAdding] = useState(false);
  const [editingBatch, setEditingBatch] = useState<InventoryBatch | null>(null);
  const [isAdjusting, setIsAdjusting] = useState<InventoryBatch | null>(null);
  const [isReduction, setIsReduction] = useState(false);
  const [closingBatch, setClosingBatch] = useState<InventoryBatch | null>(null);
  const [isClosingBatch, setIsClosingBatch] = useState(false);

  const [formData, setFormData] = useState({
    expiration_date: undefined as Date | undefined,
    description: '',
  });

  const [adjustData, setAdjustData] = useState<StockAdjustmentPayload>({
    qty_change: 0,
    movement_type: 'procurement',
    reason_code: '',
    note: '',
  });

  const { data: batchesResponse, isLoading: batchesLoading } = useInventoryBatches(itemId, {});
  const batches = batchesResponse?.data || [];

  const { data: configs } = useQuery({
    queryKey: ['inventory', 'configs', 'movements'],
    queryFn: async () => {
      const [moveRes, reasonRes] = await Promise.all([
        inventoryApi.getConfigs('inventory_movements_movement_type'),
        inventoryApi.getConfigs('inventory_movements_reason_code'),
      ]);
      return { movementTypes: moveRes.data, reasonCodes: reasonRes.data };
    },
    staleTime: Infinity,
  });

  const movementTypes = configs?.movementTypes || [];
  const reasonCodes = configs?.reasonCodes || [];

  const invalidateBatches = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items', itemId, 'batches'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] }); // Main list
  };

  const resetForms = useCallback(() => {
    setIsAdding(false);
    setEditingBatch(null);
    setIsAdjusting(null);
    setIsReduction(false);
    setFormData({ expiration_date: undefined, description: '' });
    setAdjustData({
      qty_change: 0,
      movement_type: 'procurement',
      reason_code: '',
      note: '',
    });
  }, []);

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        expiration_date: formData.expiration_date ? formatDateFns(formData.expiration_date, 'yyyy-MM-dd') : undefined,
        description: formData.description || undefined,
      };

      if (editingBatch) {
        await inventoryApi.updateBatch(itemId, editingBatch.batch_id, payload);
        toast.success('Batch metadata updated');
      } else {
        await inventoryApi.createBatch(itemId, payload);
        toast.success('New batch created');
      }
      resetForms();
      invalidateBatches();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Action failed';
      toast.error(message);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdjusting) return;

    try {
      const trimmedNote = adjustData.note.trim();
      if (trimmedNote.length < 5) {
        toast.error('Adjustment note must be at least 5 characters.');
        return;
      }

      const absoluteQty = Math.abs(adjustData.qty_change);
      if (!Number.isFinite(absoluteQty) || absoluteQty <= 0) {
        toast.error('Quantity must be greater than 0.');
        return;
      }

      const finalQty = isReduction ? -Math.abs(adjustData.qty_change) : Math.abs(adjustData.qty_change);

      await inventoryApi.adjustStock(itemId, {
        ...adjustData,
        qty_change: finalQty,
        batch_id: isAdjusting.batch_id,
        note: trimmedNote,
        reason_code: adjustData.reason_code?.trim() || undefined,
        reference_id: adjustData.reference_id?.trim() || undefined,
        reference_type: adjustData.reference_type?.trim() || undefined,
      });
      toast.success('Stock adjusted successfully');
      resetForms();
      invalidateBatches();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Adjustment failed';
      toast.error(message);
    }
  };

  const openNewBatch = () => {
    resetForms();
    setIsAdding(true);
  };

  const openEdit = (batch: InventoryBatch) => {
    resetForms();
    setEditingBatch(batch);

    const parsedDate = batch.expiration_date ? parseSystemDate(batch.expiration_date) : undefined;
    const dateVal = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;

    setFormData({
      expiration_date: dateVal,
      description: batch.description || '',
    });
    setIsAdding(true);
  };

  const openAdjust = (batch: InventoryBatch) => {
    resetForms();
    setIsAdjusting(batch);
  };

  const handleCloseBatch = async () => {
    if (!closingBatch) return;

    setIsClosingBatch(true);
    try {
      await inventoryApi.closeBatch(itemId, closingBatch.batch_id);
      toast.success('Batch closed');
      setClosingBatch(null);
      invalidateBatches();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to close batch';
      toast.error(message);
    } finally {
      setIsClosingBatch(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div>
            <h2 className="text-xl font-bold font-heading">Batch Management</h2>
            <p className="text-sm text-muted-foreground">Manage groups and expiration for untrackable stock.</p>
          </div>
          <button onClick={onClose} aria-label="Close batch management" className="p-2 text-muted-foreground hover:bg-secondary rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {!isAdding && !isAdjusting && (
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={openNewBatch}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> New Batch
              </button>
            </div>
          )}

          {isAdding && (
            <form onSubmit={handleCreateOrUpdate} className="mb-8 p-6 bg-muted/30 rounded-2xl border border-border/50 space-y-4">
              <h3 className="font-bold text-sm uppercase text-primary/80">{editingBatch ? 'Edit Batch Metadata' : 'Create New Batch'}</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Expiration Date</label>
                  <DatePicker
                    date={formData.expiration_date}
                    onChange={(date) => setFormData({ ...formData, expiration_date: date })}
                    placeholder="Select expiration"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm"
                    placeholder="Batch description..."
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetForms} className="px-4 py-2 text-sm font-semibold hover:bg-muted rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg">
                  {editingBatch ? 'Save Changes' : 'Create Batch'}
                </button>
              </div>
            </form>
          )}

          {isAdjusting && (
            <form onSubmit={handleAdjustStock} className="mb-8 p-6 bg-primary/5 rounded-2xl border border-primary/20 space-y-4">
              <h3 className="font-bold text-sm uppercase text-primary/80">Inventory Adjustment: {isAdjusting.batch_id}</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Action</label>
                  <div className="flex bg-background border border-border rounded-lg p-1 h-10">
                    <button
                      type="button"
                      onClick={() => setIsReduction(false)}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-md text-xs font-bold transition-colors ${!isReduction ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" /> IN
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsReduction(true)}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-md text-xs font-bold transition-colors ${isReduction ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      <TrendingDown className="w-3.5 h-3.5" /> OUT
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Quantity</label>
                  <input
                    required
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={adjustData.qty_change === 0 ? '' : Math.abs(adjustData.qty_change)}
                    onChange={(e) => setAdjustData({ ...adjustData, qty_change: parseQuantityInput(e.target.value) || 0 })}
                    className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm"
                    placeholder="Enter amount"
                  />
                </div>
                <div className="space-y-1">
                  <FormSelect
                    label="Type"
                    value={adjustData.movement_type}
                    onChange={(v) => setAdjustData({ ...adjustData, movement_type: v })}
                    options={movementTypes.map(m => ({ label: m.value, key: m.key }))}
                    placeholder="Select Type"
                  />
                </div>
                <div className="space-y-1">
                  <FormSelect
                    label="Reason"
                    value={adjustData.reason_code || ''}
                    onChange={(v) => setAdjustData({ ...adjustData, reason_code: v })}
                    options={reasonCodes.map(r => ({ label: r.value, key: r.key }))}
                    placeholder="Select Reason"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Adjustment Note</label>
                <textarea
                  required
                  minLength={5}
                  value={adjustData.note}
                  onChange={(e) => setAdjustData({ ...adjustData, note: e.target.value })}
                  className="w-full h-20 p-3 rounded-lg bg-background border border-border text-sm resize-none"
                  placeholder="Reason for this change..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetForms} className="px-4 py-2 text-sm font-semibold hover:bg-muted rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg flex items-center gap-2">
                  Submit Adjustment
                </button>
              </div>
            </form>
          )}

          <div className="max-h-[350px] overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-background/95 backdrop-blur z-10 text-xs font-bold uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3 pl-4">Batch ID</th>
                  <th className="p-3">Available / Total</th>
                  <th className="p-3">Expires</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {batchesLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
                ) : batches.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No batches created for this item.</td></tr>
                ) : batches.map((batch) => (
                  <tr key={batch.batch_id} className="hover:bg-muted/30 group">
                    <td className="p-3 pl-4 text-sm font-mono font-semibold">
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-primary/80" />
                        <div>
                          <div>{batch.batch_id}</div>
                          {batch.description && <div className="text-[10px] text-muted-foreground/70 font-sans font-normal truncate max-w-[120px]">{batch.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-sm">
                      <span className="font-bold text-foreground">{formatQuantity(batch.available_qty)}</span>
                      <span className="text-muted-foreground"> / {formatQuantity(batch.total_qty)}</span>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {batch.expiration_date ? parseSystemDate(batch.expiration_date).toLocaleDateString() : 'No expiry'}
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${batch.status === 'healthy' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                        batch.status === 'low_stock' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                          batch.status === 'out_of_stock' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                            batch.status === 'near_expiry' ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' :
                              batch.status === 'expired' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                                'bg-primary/10 border-primary/20 text-primary'
                        }`}>
                        {batch.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-right pr-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openAdjust(batch)} aria-label={`Adjust stock for batch ${batch.batch_id}`} title="Adjust Stock" className="p-1.5 hover:bg-primary/10 text-primary/80 rounded-lg">
                          <HistoryIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(batch)} aria-label={`Edit metadata for batch ${batch.batch_id}`} title="Edit Metadata" className="p-1.5 hover:bg-secondary text-muted-foreground rounded-lg">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setClosingBatch(batch)}
                          aria-label={`Close batch ${batch.batch_id}`}
                          title={batch.available_qty === 0 ? 'Close Batch' : 'Only empty batches can be closed'}
                          className="p-1.5 hover:bg-secondary text-muted-foreground rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={batch.available_qty !== 0}
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ActionConfirmModal
        open={closingBatch !== null}
        title="Close this batch?"
        description="This will hide the batch from inventory screens while keeping it in the database for history and audit purposes."
        icon={<Archive className="h-5 w-5" />}
        confirmLabel="Close Batch"
        tone="neutral"
        confirming={isClosingBatch}
        onCancel={() => {
          if (!isClosingBatch) setClosingBatch(null);
        }}
        onConfirm={() => void handleCloseBatch()}
        details={closingBatch ? (
          <div className="space-y-1">
            <p>
              Batch <span className="font-mono text-foreground">{closingBatch.batch_id}</span>
            </p>
            <p>
              Available quantity: <span className="font-semibold text-foreground">{formatQuantity(closingBatch.available_qty)}</span>
            </p>
            <p>
              Total quantity: <span className="font-semibold text-foreground">{formatQuantity(closingBatch.total_qty)}</span>
            </p>
          </div>
        ) : null}
      />
    </div>
  );
}
