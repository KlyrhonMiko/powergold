import type { LowStockItem } from '../lib/types';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, PackageCheck } from 'lucide-react';
import { formatQuantityWithUnit } from '@/lib/inventoryQuantity';

function StockBar({
  available,
  total,
  unitOfMeasure,
}: {
  available: number;
  total: number;
  unitOfMeasure?: string | null;
}) {
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  const color =
    pct === 0
      ? 'bg-red-500'
      : pct <= 20
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
        {formatQuantityWithUnit(available, unitOfMeasure)}/{formatQuantityWithUnit(total, unitOfMeasure)}
      </span>
    </div>
  );
}

export function LowStockPanel({
  items,
  loading,
}: {
  items: LowStockItem[];
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-card border border-border flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <h2 className="text-base font-semibold font-heading">Low Stock Alerts</h2>
        <Link
          href="/inventory/items"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="px-5 pb-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="h-3.5 w-28 bg-muted rounded" />
              <div className="h-1.5 w-full bg-muted rounded-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-5">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-2">
            <PackageCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Stock levels healthy</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">All items above threshold.</p>
        </div>
      ) : (
        <div className="px-5 pb-5 space-y-4">
          {items.map((item) => (
            <div key={item.item_id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {item.available_qty === 0 && (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                </div>
                {item.category && (
                  <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{item.category}</span>
                )}
              </div>
              <StockBar
                available={item.available_qty}
                total={item.total_qty}
                unitOfMeasure={item.unit_of_measure}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
