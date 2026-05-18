import type { RecentTransaction } from '../lib/types';
import Link from 'next/link';
import { ArrowRight, Clock, Inbox, AlertCircle } from 'lucide-react';
import { parseSystemDate } from '@/lib/utils';
import { formatQuantity, formatQuantityWithUnit } from '@/lib/inventoryQuantity';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  approved: { label: 'Approved', className: 'bg-primary/10 text-primary' },
  released: { label: 'Released', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  returned: { label: 'Returned', className: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-600 dark:bg-gray-500/10 dark:text-gray-400' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${config.className}`}>
      {config.label}
    </span>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = parseSystemDate(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function summarizeItems(items: RecentTransaction['items']): string {
  if (!items.length) return 'No items';
  const first = items[0];
  const name = first.name || first.item_id;
  const qty = first.qty_requested;
  const formattedQty = first.classification === 'equipment'
    ? formatQuantity(qty)
    : formatQuantityWithUnit(qty, first.unit_of_measure);
  const label = !first.unit_of_measure && qty === 1 ? name : `${formattedQty} ${name}`;
  if (items.length === 1) return label;
  return `${label} +${items.length - 1} more`;
}

export function RecentTransactionsPanel({
  recent,
  loading,
}: {
  recent: RecentTransaction[];
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-card border border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <h2 className="text-base font-semibold font-heading">Recent Activity</h2>
        <Link
          href="/inventory/requests"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="px-5 pb-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
              <div className="h-5 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 px-5">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Inbox className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No recent activity</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Transactions will appear here as they happen.
          </p>
        </div>
      ) : (
        <div className="px-2 pb-2">
          {recent.map((item) => (
            <div
              key={item.request_id}
              className="flex items-center gap-4 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-muted/60">
                <span className="text-sm font-bold text-muted-foreground">
                  {(item.borrower_name ?? item.borrower_user_id ?? '?')[0].toUpperCase()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.borrower_name ?? item.borrower_user_id ?? 'Unknown'}
                  </p>
                  {item.is_emergency && (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {summarizeItems(item.items)}
                </p>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-1">
                <StatusBadge status={item.status} />
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeDate(item.request_date)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
