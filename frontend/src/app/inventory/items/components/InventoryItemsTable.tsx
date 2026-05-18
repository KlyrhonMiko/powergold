'use client';

import { Edit2, History as HistoryIcon, Layers, Loader2, MoreHorizontal, Package, Boxes, Trash2, QrCode } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import type { InventoryItem } from '../api';
import { formatQuantity } from '@/lib/inventoryQuantity';

function conditionStyle(condition?: string) {
  switch (condition?.toLowerCase()) {
    case 'good':
    case 'excellent':
    case 'healthy':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'damaged':
      return 'bg-primary/10 text-primary border-primary/20 font-bold';

    default:
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
  }
}

function statusStyle(status?: string) {
  switch (status?.toUpperCase()) {
    case 'AVAILABLE':
    case 'EXCELLENT':
    case 'HEALTHY':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'LOW_STOCK':
      return 'bg-primary/10 text-primary font-bold';

    default:
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400';
  }
}

function formatStatus(status?: string) {
  if (!status) return '';
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function QuantityBar({ available, total }: { available: number; total: number }) {
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  const barColor = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-primary' : 'bg-rose-500';


  return (
    <div className="flex items-center gap-3 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm tabular-nums font-medium whitespace-nowrap">
        <span className="text-foreground">{formatQuantity(available)}</span>
        <span className="text-muted-foreground">/{formatQuantity(total)}</span>
      </span>
    </div>
  );
}

function ActionMenu({
  item,
  onOpenHistory,
  onOpenUnitManagement,
  onOpenBatchManagement,
  onOpenEdit,
  onOpenQrCode,
  onDelete,
}: {
  item: InventoryItem;
  onOpenHistory: (itemId: string) => void;
  onOpenUnitManagement: (itemId: string) => void;
  onOpenBatchManagement: (itemId: string) => void;
  onOpenEdit: (item: InventoryItem) => void;
  onOpenQrCode: (item: InventoryItem) => void;
  onDelete: (itemId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const menuItems = [
    { label: 'View History', icon: HistoryIcon, onClick: () => onOpenHistory(item.item_id) },
    { label: 'View QR', icon: QrCode, onClick: () => onOpenQrCode(item) },
    { label: 'Edit', icon: Edit2, onClick: () => onOpenEdit(item) },
  ];

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          title="More actions"
          className={`p-2 rounded-lg transition-colors ${open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={4} className="w-48 p-1">
          {menuItems.map((mi) => (
            <button
              key={mi.label}
              onClick={() => {
                mi.onClick();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-foreground hover:bg-muted transition-colors"
              type="button"
            >
              <mi.icon className="w-4 h-4 text-muted-foreground" />
              {mi.label}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            onClick={() => {
              onDelete(item.item_id);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"
            type="button"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function InventoryItemsTable({
  items,
  loading,
  categories,
  onOpenHistory,
  onOpenUnitManagement,
  onOpenBatchManagement,
  onOpenEdit,
  onOpenQrCode,
  onDelete,
}: {
  items: InventoryItem[];
  loading: boolean;
  categories: { key: string; value: string }[];
  onOpenHistory: (itemId: string) => void;
  onOpenUnitManagement: (itemId: string) => void;
  onOpenBatchManagement: (itemId: string) => void;
  onOpenEdit: (item: InventoryItem) => void;
  onOpenQrCode: (item: InventoryItem) => void;
  onDelete: (itemId: string) => void;
}) {
  const categoryLabels = Object.fromEntries(categories.map((category) => [category.key, category.value]));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading inventory...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">No items found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Try adjusting your search or filters, or add new items to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item Name</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Classification</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Condition</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Availability</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right w-[100px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={item.item_id}
              className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center text-primary shrink-0">
                    {item.is_trackable ? <Package className="w-4.5 h-4.5" /> : <Boxes className="w-4.5 h-4.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[220px] mt-0.5">{item.description}</p>
                    )}
                    {!item.is_trackable && item.unit_of_measure && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-wide">{item.unit_of_measure}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-sm text-muted-foreground capitalize">{categoryLabels[item.category] || item.category}</span>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-sm text-muted-foreground capitalize">{item.classification}</span>
              </td>
              <td className="px-4 py-3.5">
                <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border capitalize ${conditionStyle(item.condition)}`}>
                  {item.condition}
                </span>
              </td>
              <td className="px-4 py-3.5 hidden sm:table-cell">
                <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${statusStyle(item.status_condition)}`}>
                  {formatStatus(item.status_condition)}
                </span>
              </td>
              <td className="px-4 py-3.5">
                <QuantityBar available={item.available_qty} total={item.total_qty} />
              </td>
              <td className="px-4 py-3.5 text-right whitespace-nowrap">
                <div className="flex items-center justify-end gap-1">
                  {item.is_trackable ? (
                    <button
                      onClick={() => onOpenUnitManagement(item.item_id)}
                      className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                      title="Manage Units"
                    >
                      <Boxes className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onOpenBatchManagement(item.item_id)}
                      className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                      title="Manage Batches"
                    >
                      <Layers className="w-5 h-5" />
                    </button>
                  )}
                  <ActionMenu
                    item={item}
                    onOpenHistory={onOpenHistory}
                    onOpenUnitManagement={onOpenUnitManagement}
                    onOpenBatchManagement={onOpenBatchManagement}
                    onOpenEdit={onOpenEdit}
                    onOpenQrCode={onOpenQrCode}
                    onDelete={onDelete}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
