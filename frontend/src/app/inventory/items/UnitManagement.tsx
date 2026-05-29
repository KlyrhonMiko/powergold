'use client';

import { useState, useEffect, useCallback } from 'react';
import { inventoryApi, ConfigRead, InventoryUnit } from './api';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryUnits } from './lib/useItemQueries';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  Search,
  Package,
  ChevronDown,
  Check,
  Cpu,
  Hash,
  QrCode,
  Printer,
  Square,
  CheckSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { FilterSelect } from '@/components/ui/filter-select';
import { FormSelect } from '@/components/ui/form-select';
import { cn, parseSystemDate } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { QrCodeModal } from '@/components/ui/QrCodeModal';
import { ActionConfirmModal } from '@/components/ui/ActionConfirmModal';
import { QRCodeSVG } from 'qrcode.react';
import { renderToString } from 'react-dom/server';
import { DatePicker } from '@/components/ui/date-picker';
import { parseISO, format as formatDateFns } from 'date-fns';

interface UnitManagementProps {
  itemId: string;
  onClose: () => void;
}



const STATUS_COLORS: Record<string, string> = {
  available: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  borrowed: 'bg-primary/10 text-primary',
  maintenance: 'bg-primary/10 text-primary font-bold',
  consumed: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  expired: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  discarded: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  retired: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

const REMOVABLE_UNIT_STATUSES = new Set(['maintenance', 'retired', 'consumed', 'expired', 'discarded']);

export function UnitManagement({ itemId, onClose }: UnitManagementProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isBatch, setIsBatch] = useState(false);
  const [editingUnit, setEditingUnit] = useState<InventoryUnit | null>(null);
  const [qrCodeUnit, setQrCodeUnit] = useState<InventoryUnit | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [removingUnit, setRemovingUnit] = useState<InventoryUnit | null>(null);
  const [isRemovingUnit, setIsRemovingUnit] = useState(false);

  const queryClient = useQueryClient();

  const [statusConfigs, setStatusConfigs] = useState<ConfigRead[]>([]);
  const [conditionConfigs, setConditionConfigs] = useState<ConfigRead[]>([]);

  const [searchSerial, setSearchSerial] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCondition, setFilterCondition] = useState('');

  const { data: unitsResponse, isLoading: unitsLoading } = useInventoryUnits(itemId, {
    serial_number: searchSerial || undefined,
    status: filterStatus || undefined,
    condition: filterCondition || undefined,
  });

  const units = unitsResponse?.data || [];

  const fetchConfigs = useCallback(async () => {
    try {
      const [statusRes, conditionRes] = await Promise.all([
        inventoryApi.getConfigs('inventory_units_status'),
        inventoryApi.getConfigs('inventory_units_condition'),
      ]);
      setStatusConfigs(statusRes.data);
      setConditionConfigs(conditionRes.data);
    } catch (err) {
      logger.error('Failed to fetch inventory unit configs', { error: err });
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items', itemId, 'units'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] }); // Main list
  };



  const openAddForm = (batch: boolean) => {
    setIsAdding(true);
    setIsBatch(batch);
    setEditingUnit(null);
  };

  const startEdit = (unit: InventoryUnit) => {
    setEditingUnit(unit);
    setIsAdding(true);
    setIsBatch(false);
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingUnit(null);
  };



  const handleRetire = async (unitId: string) => {
    if (!confirm('Are you sure you want to retire this unit?')) return;
    try {
      await inventoryApi.retireUnit(itemId, unitId);
      toast.success('Unit retired');
      invalidateQueries();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retire unit';
      toast.error(message);
    }
  };

  const handleRemove = async () => {
    if (!removingUnit) return;

    setIsRemovingUnit(true);
    try {
      await inventoryApi.removeUnit(itemId, removingUnit.unit_id);
      toast.success('Unit removed');
      setRemovingUnit(null);
      invalidateQueries();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove unit';
      toast.error(message);
    } finally {
      setIsRemovingUnit(false);
    }
  };

  const handleBatchPrint = () => {
    const unitsToPrint = selectedUnitIds.size > 0
      ? units.filter(u => selectedUnitIds.has(u.unit_id))
      : units;

    if (unitsToPrint.length === 0) {
      toast.error('No units to print');
      return;
    }

    const printWindow = window.open('', '', 'width=800,height=800');
    if (!printWindow) {
      toast.error('Pop-up blocked. Please allow pop-ups for this site.');
      return;
    }

    const htmlContent = renderToString(
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '30px', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
        {unitsToPrint.map((unit) => {
          const val = JSON.stringify({ type: 'unit', id: unit.unit_id, itemId: itemId });
          return (
            <div key={unit.unit_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', breakInside: 'avoid' }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', fontWeight: 'bold' }}>Unit: {unit.serial_number}</h3>
              <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#64748b' }}>Condition: {unit.condition}</p>
              <QRCodeSVG value={val} size={150} level="M" />
            </div>
          );
        })}
      </div>
    );

    printWindow.document.write(`
      <html>
        <head>
          <title>Batch Print QR Codes</title>
          <style>
            @page { margin: 1cm; }
            body { margin: 0; background: white; }
          </style>
        </head>
        <body>
          <h2 style="font-family: system-ui, sans-serif; padding-left: 20px;">Equipment QR Labels</h2>
          ${htmlContent}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      // Keep it open if user cancels, or close? For batch, maybe close after print returns
    };
  };



  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh] bg-black/40 backdrop-blur-sm transition-all duration-300 overflow-y-auto",
        isAdding ? "gap-6 lg:flex-row flex-col" : "gap-0"
      )}
      onClick={onClose}
    >
      {isAdding && (
        <UnitFormModal
          itemId={itemId}
          isBatch={isBatch}
          unit={editingUnit}
          statusConfigs={statusConfigs}
          conditionConfigs={conditionConfigs}
          onClose={closeForm}
          onSuccess={() => {
            closeForm();
            invalidateQueries();
          }}
        />
      )}
      <div
        className={cn(
          "w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] transition-all duration-300",
          isAdding && "scale-[0.98] opacity-90 lg:scale-100 lg:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Cpu className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold font-heading">Manage Units</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Track serial numbers, condition, and availability</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close unit management"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                placeholder="Search by serial number..."
                value={searchSerial}
                onChange={(e) => setSearchSerial(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/50 border border-border text-sm focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
            </div>
            <FilterSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={statusConfigs.map((c) => ({ key: c.key, label: c.value }))}
              placeholder="All Status"
            />
            <FilterSelect
              value={filterCondition}
              onChange={setFilterCondition}
              options={conditionConfigs.map((c) => ({ key: c.key, label: c.value }))}
              placeholder="All Conditions"
            />
          </div>
        </div>

        {/* Add / Batch buttons */}
        {!isAdding && (
          <div className="px-5 pt-4 pb-1 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAddForm(false)}
                className="h-9 px-3.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl flex items-center gap-1.5 hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Unit
              </button>
              <button
                onClick={() => openAddForm(true)}
                className="h-9 px-3.5 bg-muted text-foreground text-sm font-medium rounded-xl flex items-center gap-1.5 hover:bg-muted/80 transition-colors"
              >
                <Package className="w-4 h-4" />
                Batch Add
              </button>
            </div>
            {units.length > 0 && (
              <button
                onClick={handleBatchPrint}
                className="h-9 px-3.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-sm font-semibold rounded-xl flex items-center gap-1.5 hover:bg-indigo-500/20 transition-colors"
                title={selectedUnitIds.size > 0 ? `Print ${selectedUnitIds.size} selected labels` : "Print labels for all visible units"}
              >
                <Printer className="w-4 h-4" />
                {selectedUnitIds.size > 0 ? `Print (${selectedUnitIds.size})` : 'Print QRs'}
              </button>
            )}
          </div>
        )}



        {/* Unit List */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-muted/10 relative p-5">
          {unitsLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm font-medium text-muted-foreground">Loading units...</p>
              </div>
            </div>
          ) : units.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <Hash className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No units found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchSerial || filterStatus || filterCondition
                  ? 'Try adjusting your filters'
                  : 'Add your first unit to start tracking'}
              </p>
              {!isAdding && !searchSerial && !filterStatus && !filterCondition && (
                <button
                  onClick={() => openAddForm(false)}
                  className="mt-4 h-9 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-xl flex items-center gap-1.5 hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add First Unit
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-muted/40">
                  <tr className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-2.5 w-10">
                      <button
                        onClick={() => {
                          if (selectedUnitIds.size === units.length && units.length > 0) {
                            setSelectedUnitIds(new Set());
                          } else {
                            setSelectedUnitIds(new Set(units.map(u => u.unit_id)));
                          }
                        }}
                        className="p-1 hover:text-primary transition-colors"
                      >
                        {selectedUnitIds.size === units.length && units.length > 0 ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-2.5">Serial No.</th>
                    <th className="px-4 py-2.5">Condition</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {units.map((unit) => (
                    <tr
                      key={unit.unit_id}
                      className={cn(
                        'group hover:bg-muted/30 transition-colors',
                        (editingUnit?.unit_id === unit.unit_id || selectedUnitIds.has(unit.unit_id)) && 'bg-primary/5'
                      )}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            const newSelected = new Set(selectedUnitIds);
                            if (newSelected.has(unit.unit_id)) {
                              newSelected.delete(unit.unit_id);
                            } else {
                              newSelected.add(unit.unit_id);
                            }
                            setSelectedUnitIds(newSelected);
                          }}
                          className={cn(
                            'p-1 transition-colors',
                            selectedUnitIds.has(unit.unit_id) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {selectedUnitIds.has(unit.unit_id) ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono font-semibold">{unit.serial_number}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm capitalize">
                          {conditionConfigs.find((c) => c.key === unit.condition)?.value ||
                            unit.condition?.replace('_', ' ') ||
                            'Good'}
                        </span>
                        {unit.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">
                            {unit.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full',
                            STATUS_COLORS[unit.status] || 'bg-muted text-muted-foreground'
                          )}
                        >
                          {statusConfigs.find((c) => c.key === unit.status)?.value || unit.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-0.5 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setQrCodeUnit(unit)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="View QR"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => startEdit(unit)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRetire(unit.unit_id)}
                            className="p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Retire"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {REMOVABLE_UNIT_STATUSES.has(unit.status) && (
                            <button
                              onClick={() => setRemovingUnit(unit)}
                              className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>



      {qrCodeUnit && (
        <QrCodeModal
          value={JSON.stringify({ type: 'unit', id: qrCodeUnit.unit_id, itemId: itemId })}
          title={`Unit: ${qrCodeUnit.serial_number}`}
          subtitle={`Condition: ${qrCodeUnit.condition}`}
          onClose={() => setQrCodeUnit(null)}
        />
      )}

      <ActionConfirmModal
        open={removingUnit !== null}
        title="Remove this unit?"
        description="This will hide the unit from inventory screens while keeping it in the database for history and traceability."
        icon={<Trash2 className="h-5 w-5" />}
        confirmLabel="Remove Unit"
        tone="danger"
        confirming={isRemovingUnit}
        onCancel={() => {
          if (!isRemovingUnit) setRemovingUnit(null);
        }}
        onConfirm={() => void handleRemove()}
        details={removingUnit ? (
          <div className="space-y-1">
            <p>
              Unit ID: <span className="font-mono text-foreground">{removingUnit.unit_id}</span>
            </p>
            <p>
              Serial: <span className="font-mono text-foreground">{removingUnit.serial_number}</span>
            </p>
            <p>
              Current status: <span className="font-semibold capitalize text-foreground">{removingUnit.status.replace('_', ' ')}</span>
            </p>
          </div>
        ) : null}
      />
    </div>
  );
}

interface UnitFormModalProps {
  itemId: string;
  isBatch: boolean;
  unit: InventoryUnit | null;
  statusConfigs: ConfigRead[];
  conditionConfigs: ConfigRead[];
  onClose: () => void;
  onSuccess: () => void;
}

export function UnitFormModal({
  itemId,
  isBatch,
  unit,
  statusConfigs,
  conditionConfigs,
  onClose,
  onSuccess,
}: UnitFormModalProps) {
  const isUnitEditLocked = Boolean(unit && (unit.status === 'entrusted' || unit.status === 'borrowed'));
  const [formData, setFormData] = useState({
    serial_number: '',
    expiration_date: undefined as Date | undefined,
    condition: 'good',
    description: '',
    status: 'available',
  });
  const [batchCount, setBatchCount] = useState(1);

  useEffect(() => {
    if (unit) {
      setFormData({
        serial_number: unit.serial_number || '',
        expiration_date: unit.expiration_date ? parseISO(unit.expiration_date) : undefined,
        condition: unit.condition || 'good',
        description: unit.description || '',
        status: unit.status || 'available',
      });
    } else {
      setFormData({
        serial_number: '',
        expiration_date: undefined,
        condition: conditionConfigs[0]?.key || 'good',
        description: '',
        status: statusConfigs[0]?.key || 'available',
      });
    }
  }, [unit, statusConfigs, conditionConfigs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnitEditLocked) return;
    try {
      const expirationDateStr = formData.expiration_date ? formatDateFns(formData.expiration_date, 'yyyy-MM-dd') : undefined;

      if (unit) {
        await inventoryApi.updateUnit(itemId, unit.unit_id, {
          status: formData.status,
          condition: formData.condition,
          expiration_date: expirationDateStr,
          description: formData.description || undefined,
        });
        toast.success('Unit updated');
      } else if (isBatch) {
        const batch = Array.from({ length: batchCount }).map((_, i) => ({
          serial_number: `${formData.serial_number}-${i + 1}`,
          expiration_date: expirationDateStr,
          description: formData.description || undefined,
          condition: formData.condition,
        }));
        await inventoryApi.createUnitsBatch(itemId, batch);
        toast.success(`${batchCount} units created`);
      } else {
        await inventoryApi.createUnit(itemId, {
          serial_number: formData.serial_number,
          condition: formData.condition,
          expiration_date: expirationDateStr,
          description: formData.description || undefined,
        });
        toast.success('Unit created');
      }
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save unit';
      toast.error(message);
    }
  };

  const formTitle = unit
    ? 'Edit Unit'
    : isBatch
      ? 'Batch Add Units'
      : 'Add Unit';

  return (
    <div
      className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-left-4 zoom-in-95 duration-300 flex flex-col max-h-[85vh]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h3 className="text-lg font-bold font-heading">{formTitle}</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto min-h-0">
        <div className="grid grid-cols-2 gap-4">
          <div className={cn('space-y-1.5', !isBatch && !unit && 'col-span-2')}>
            <label className="block text-sm font-medium text-foreground">
              {isBatch ? 'Serial Prefix' : 'Serial Number'} <span className="text-rose-500">*</span>
            </label>
            <input
              required
              disabled={!!unit}
              type="text"
              value={formData.serial_number}
              onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
              className="w-full h-11 px-3.5 rounded-xl bg-muted/50 border border-border text-sm font-medium focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all disabled:opacity-50"
              placeholder={isBatch ? 'e.g. SN-2024' : 'e.g. SN-001'}
            />
          </div>
          {isBatch && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                Quantity <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="number"
                min="1"
                max="100"
                value={batchCount}
                onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
                className="w-full h-11 px-3.5 rounded-xl bg-muted/50 border border-border text-sm font-medium focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <FormSelect
              label="Condition"
              value={formData.condition}
              onChange={(v) => setFormData({ ...formData, condition: v })}
              options={conditionConfigs.map((c) => ({
                key: c.key,
                label: c.value,
              }))}
              placeholder="Select condition"
              disabled={isUnitEditLocked}
            />
            {isUnitEditLocked && (
              <p className="text-xs text-muted-foreground">
                This unit is frozen while it is borrowed or entrusted.
              </p>
            )}
          </div>
          {unit ? (
            <div className="space-y-1.5">
              <FormSelect
                label="Status"
                value={formData.status}
                onChange={(v) => setFormData({ ...formData, status: v })}
                options={statusConfigs.map((c) => ({
                  key: c.key,
                  label: c.value,
                }))}
                placeholder="Select status"
                disabled={isUnitEditLocked}
              />
              {isUnitEditLocked && (
                <p className="text-xs text-muted-foreground">
                  Status is locked while this unit is currently borrowed or entrusted.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Expiration Date</label>
              <DatePicker
                date={formData.expiration_date}
                onChange={(date) => setFormData({ ...formData, expiration_date: date })}
                placeholder="Select date"
                disabled={isUnitEditLocked}
              />
            </div>
          )}
        </div>

        {unit && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Expiration Date</label>
            <DatePicker
              date={formData.expiration_date}
              onChange={(date) => setFormData({ ...formData, expiration_date: date })}
              placeholder="Select date"
              disabled={isUnitEditLocked}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Note</label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            disabled={isUnitEditLocked}
            className="w-full h-11 px-3.5 rounded-xl bg-muted/50 border border-border text-sm font-medium focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Optional note about this unit..."
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl text-sm font-semibold bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isUnitEditLocked}
            className="flex-1 h-11 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {unit ? 'Save Changes' : isBatch ? `Create ${batchCount} Units` : 'Create Unit'}
          </button>
        </div>
      </form>
    </div>
  );
}
