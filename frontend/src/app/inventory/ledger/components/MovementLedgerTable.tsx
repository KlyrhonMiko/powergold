'use client';

import { Fragment } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import type { Anomaly, LedgerMovement } from '../lib/types';
import { formatQuantity } from '@/lib/inventoryQuantity';

export type MovementLedgerTab = 'ledger' | 'anomalies';

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  procurement: 'Procurement',
  manual_adjustment: 'Adjustment',
  borrow_release: 'Release',
  borrow_return: 'Return',
  damage: 'Damage / Loss',
  reversal: 'Correction',
};

function getMovementLabel(type?: string) {
  return type ? MOVEMENT_TYPE_LABELS[type] || type.replace(/_/g, ' ') : '—';
}

type LedgerTableRow = LedgerMovement | Anomaly;

function isAnomalyRow(row: LedgerTableRow): row is Anomaly {
  return 'anomaly_type' in row;
}

function getRowItemId(row: LedgerTableRow): string {
  return isAnomalyRow(row) ? row.item_id : row.item_id || '';
}

function getRowItemName(row: LedgerTableRow): string {
  return isAnomalyRow(row) ? row.item_name : row.item_name || 'Unknown item';
}

function getRowInventoryOrItemId(row: LedgerTableRow): string {
  if (isAnomalyRow(row)) return row.item_id;
  return row.inventory_id || row.item_id || '';
}

function getRowQty(row: LedgerTableRow): number {
  return isAnomalyRow(row) ? row.details?.delta ?? 0 : row.qty_change ?? 0;
}

function getRowPrimaryMessage(row: LedgerTableRow): string {
  if (isAnomalyRow(row)) return row.message;
  return row.note || row.message || getMovementLabel(row.movement_type);
}

function getRowTimestamp(row: LedgerTableRow): string {
  return isAnomalyRow(row) ? row.detected_at : row.occurred_at || '';
}

function getRowActor(row: LedgerTableRow): string {
  if (isAnomalyRow(row)) return 'System';
  return row.actor_name || row.user_id || 'System';
}

export function MovementLedgerTable({
  activeTab,
  loading,
  movements,
  anomalies,
  expandedAnomalyId,
  onToggleAnomalyExpand,
  onOpenReversalModal,
}: {
  activeTab: MovementLedgerTab;
  loading: boolean;
  movements: LedgerMovement[];
  anomalies: Anomaly[];
  expandedAnomalyId: string | null;
  onToggleAnomalyExpand: (id: string) => void;
  onOpenReversalModal: (movement: LedgerMovement) => void;
}) {
  const rows = activeTab === 'ledger' ? movements : anomalies;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading movements...</p>
      </div>
    );
  }

  if (activeTab === 'ledger' && movements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">No movements yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          When equipment is received, released, or returned, it will appear here.
        </p>
      </div>
    );
  }

  if (activeTab === 'anomalies' && anomalies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">All good</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          No issues detected. Ledger matches actual stock.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Equipment</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quantity</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[180px]">Details</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Who</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right w-[100px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((move, idx) => {
            const anomalyKey =
              activeTab === 'anomalies'
                ? `${(move as Anomaly).item_id}-${(move as Anomaly).anomaly_type}`
                : null;
            const isExpanded =
              activeTab === 'anomalies' && anomalyKey ? expandedAnomalyId === anomalyKey : false;
            const rowKey =
              (move as LedgerMovement).movement_id || anomalyKey || `${getRowItemId(move)}-${isAnomalyRow(move) ? move.anomaly_type : 'movement'}`;

            const qty = getRowQty(move);
            const isIn = qty > 0;
            const isReversed = isAnomalyRow(move) ? false : !!move.is_reversed;

            return (
              <Fragment key={rowKey}>
                <tr
                  onClick={() =>
                    activeTab === 'anomalies' && anomalyKey && onToggleAnomalyExpand(anomalyKey)
                  }
                  className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${activeTab === 'anomalies' ? 'cursor-pointer' : ''
                    } ${idx % 2 === 0 ? '' : 'bg-muted/10'} ${isExpanded ? 'bg-muted/30' : ''}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Package className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {getRowItemName(move)}
                        </p>
                        <p className="text-[11px] text-muted-foreground/60 font-mono mt-0.5">
                          {getRowInventoryOrItemId(move)}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isReversed
                            ? 'bg-muted text-muted-foreground'
                            : isIn
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}
                      >
                        {isIn ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {activeTab === 'anomalies' ? 'Balance mismatch' : getMovementLabel(isAnomalyRow(move) ? undefined : move.movement_type)}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    <span
                      className={`text-sm font-semibold tabular-nums ${isReversed
                          ? 'text-muted-foreground line-through'
                          : isIn
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                    >
                      {qty > 0 ? '+' : ''}
                      {formatQuantity(qty)}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <p className="text-sm text-foreground truncate max-w-[220px]">
                      {isReversed
                        ? `[Voided] ${getRowPrimaryMessage(move)}`
                        : getRowPrimaryMessage(move)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {getRowTimestamp(move)}
                    </p>
                    {!isAnomalyRow(move) && move.reference_id && (
                      <span className="inline-block mt-1 text-[11px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        Ref ({move.reference_type || 'external_reference'}): {move.reference_id}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 hidden sm:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {getRowActor(move)}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    {activeTab === 'ledger' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        {isReversed && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                            Voided
                          </span>
                        )}
                        {!isAnomalyRow(move) && move.movement_type === 'reversal' && !isReversed && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                            Correction
                          </span>
                        )}
                        {!isReversed && !isAnomalyRow(move) && move.movement_type !== 'reversal' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenReversalModal(move);
                            }}
                            className="p-2 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                            title="Reverse movement"
                            type="button"
                          >
                            <Undo2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md ${(move as Anomaly).severity === 'high'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}
                        >
                          {(move as Anomaly).severity}
                        </span>
                        <span className="text-muted-foreground">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>

                {activeTab === 'anomalies' && isExpanded && (
                  <tr className="bg-muted/20 border-b border-border/50">
                    <td colSpan={6} className="p-0">
                      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-background border border-border">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <BarChart3 className="w-4 h-4 text-primary" />
                            Ledger balance
                          </p>
                          <p className="text-xl font-semibold text-foreground">
                            {(move as Anomaly).details?.ledger_balance}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-background border border-border">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Activity className="w-4 h-4 text-emerald-500" />
                            Actual balance
                          </p>
                          <p className="text-xl font-semibold text-foreground">
                            {(move as Anomaly).details?.actual_balance}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-background border border-border">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Difference
                          </p>
                          <p
                            className={`text-xl font-semibold ${(move as Anomaly).details?.delta < 0 ? 'text-rose-600' : 'text-amber-600'
                              }`}
                          >
                            {(move as Anomaly).details?.delta > 0 ? '+' : ''}
                            {(move as Anomaly).details?.delta}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-background border border-border">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <RefreshCw className="w-4 h-4 text-primary" />
                            Transactions
                          </p>
                          <p className="text-xl font-semibold text-foreground">
                            {(move as Anomaly).details?.movement_count}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
