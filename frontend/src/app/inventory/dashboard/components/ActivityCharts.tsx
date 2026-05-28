import { useState } from 'react';
import { InventoryHealth, BorrowingTrend } from '../lib/types';
import { Activity, ShieldCheck } from 'lucide-react';
import { FormSelect } from '@/components/ui/form-select';

export function InventoryHealthPanel({ health, loading }: { health: InventoryHealth | null, loading: boolean }) {
  const [activeTab, setActiveTab] = useState<keyof InventoryHealth>('item_statuses');

  const tabs: { id: keyof InventoryHealth; label: string }[] = [
    { id: 'item_statuses', label: 'Item Status' },
    { id: 'item_conditions', label: 'Item Condition' },
    { id: 'unit_statuses', label: 'Unit Status' },
    { id: 'unit_conditions', label: 'Unit Condition' },
    { id: 'batch_statuses', label: 'Batch Status' },
    { id: 'batch_conditions', label: 'Batch Condition' },
  ];

  const statusOrder: Record<string, number> = {
    healthy: 0,
    low_stock: 1,
    out_of_stock: 2,
  };

  const currentData = health
    ? [...health[activeTab]].sort((left, right) => {
        const leftRank = statusOrder[left.label.toLowerCase()] ?? 99;
        const rightRank = statusOrder[right.label.toLowerCase()] ?? 99;
        return leftRank - rightRank;
      })
    : [];
  const totalCount = currentData.reduce((acc, curr) => acc + curr.count, 0);

  const getHealthBarColor = (label: string) => {
    const normalized = label.toLowerCase();

    if (['available', 'healthy', 'good', 'excellent'].includes(normalized)) {
      return 'bg-emerald-500';
    }

    if (normalized === 'low_stock') {
      return 'bg-yellow-500';
    }

    if (normalized === 'out_of_stock') {
      return 'bg-rose-500';
    }

    if (normalized === 'borrowed') {
      return 'bg-primary';
    }

    if (['maintenance', 'fair', 'near_expiry'].includes(normalized)) {
      return 'bg-amber-500';
    }

    return 'bg-rose-500';
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <h3 className="font-semibold text-sm">Inventory Health</h3>
        </div>
        <FormSelect
          value={activeTab}
          onChange={(v: string) => setActiveTab(v as keyof InventoryHealth)}
          options={tabs.map(tab => ({ label: tab.label, key: tab.id }))}
          placeholder="View..."
          className="h-7 px-2"
          triggerClassName="h-7 text-[10px]"
        />
      </div>
      <div className="p-4 flex-1">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
          </div>
        ) : currentData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
            No data available for this view
          </div>
        ) : (
          <div className="space-y-4">
            {currentData.map((item) => (
              <div key={item.label} className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="capitalize">{item.label.replace('_', ' ')}</span>
                  <span>{item.count}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${getHealthBarColor(item.label)}`}
                    style={{ width: `${Math.min(100, (item.count / Math.max(1, totalCount)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BorrowingTrendsPanel({ trends, loading }: { trends: BorrowingTrend[], loading: boolean }) {
  const maxCount = Math.max(...trends.map(t => t.count), 1);

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-sm">Borrowing Activity (30 Days)</h3>
      </div>
      <div className="p-4 flex-1 min-h-[160px] flex items-end gap-1 px-6">
        {loading ? (
          <div className="w-full h-full bg-muted animate-pulse rounded" />
        ) : trends.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs italic">
            No recent activity recorded
          </div>
        ) : (
          trends.map((day) => (
            <div
              key={day.date}
              className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-t-sm transition-all group relative cursor-help"
              style={{ height: `${(day.count / maxCount) * 100}%`, minHeight: '4px' }}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-sm">
                <span className="font-bold">{day.count}</span> requests on {new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
