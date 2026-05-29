'use client';

import { Search, X } from 'lucide-react';
import type { StatusTab } from '../lib/types';
import { STATUS_TABS } from '../lib/types';

const TAB_LABELS: Record<string, string> = {
  ALL: 'All',
  pending: 'Pending',
  approved: 'Approved',
  released: 'Released',
  returned: 'Returned',
  rejected: 'Rejected',
  voided: 'Voided',
};

export function RequestsToolbar({
  searchInput,
  onSearchInputChange,
  statusFilter,
  onStatusFilterChange,
}: {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  statusFilter: StatusTab;
  onStatusFilterChange: (v: StatusTab) => void;
}) {
  return (
    <div className="px-5 py-3 border-b border-border flex items-center gap-3">
      <div className="relative w-80 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search borrower, client, location..."
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          className="w-full h-9 pl-9 pr-8 rounded-lg bg-muted/40 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all text-sm placeholder:text-muted-foreground/60"
        />
        {searchInput && (
          <button
            onClick={() => onSearchInputChange('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            type="button"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
        {STATUS_TABS.map((s) => {
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => onStatusFilterChange(s)}
              className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              type="button"
            >
              {TAB_LABELS[s] || s.replace(/_/g, ' ')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
