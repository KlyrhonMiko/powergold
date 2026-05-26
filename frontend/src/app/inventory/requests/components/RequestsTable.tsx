'use client';

import { Fragment, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  PackageOpen,
  AlertTriangle,
  XCircle,
  Archive,
} from 'lucide-react';
import { parseSystemDate } from '@/lib/utils';
import type { BorrowRecord, BorrowAction, StatusTab } from '../lib/types';
import type { BorrowRequestBatch, BorrowRequestEvent, BorrowRequestUnit } from '../api';
import { formatQuantity, formatQuantityWithUnit, sumQuantities } from '@/lib/inventoryQuantity';

function StatusBadge({ status, closeReason }: { status: string; closeReason?: string }) {
  const config: Record<string, { bg: string; text: string; icon: ReactNode }> = {
    pending: { bg: 'bg-primary/5 border-primary/20', text: 'text-primary font-bold', icon: <Clock className="w-3 h-3" /> },

    approved: { bg: 'bg-primary/10 border-primary/20', text: 'text-primary', icon: <CheckCircle2 className="w-3 h-3" /> },
    released: { bg: 'bg-primary/5 border-primary/10', text: 'text-primary/80', icon: <PackageOpen className="w-3 h-3" /> },
    returned: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: <CheckCircle2 className="w-3 h-3" /> },
    rejected: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', icon: <XCircle className="w-3 h-3" /> },
    closed: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', icon: <Archive className="w-3 h-3" /> },
  };

  const c = config[status] ?? config.pending;
  const label = status === 'closed'
    ? `Closed${closeReason ? ` · ${closeReason}` : ''}`
    : status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border capitalize ${c.bg} ${c.text}`}>
      {c.icon}
      {label}
    </span>
  );
}

function ActionButton({
  label,
  variant = 'default',
  onClick,
}: {
  label: string;
  variant?: 'default' | 'success' | 'danger' | 'secondary';
  onClick: () => void;
}) {
  const styles = {
    default: 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/20',
    success: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20',
    danger: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border-rose-500/20',
    secondary: 'bg-muted text-muted-foreground hover:bg-muted/80 border-border',
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border ${styles[variant]}`}
      type="button"
    >
      {label}
    </button>
  );
}

function formatDate(dateStr: string) {
  try {
    const d = parseSystemDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return dateStr;
  }
}

function formatEventDate(dateStr: string) {
  try {
    const d = parseSystemDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return dateStr;
  }
}

function renderDueDate(dateStr?: string, status?: string) {
  if (!dateStr) {
    return <span className="text-xs text-muted-foreground">Not set</span>;
  }

  try {
    const dueDate = parseSystemDate(dateStr);
    if (isNaN(dueDate.getTime())) {
      return <span className="text-xs text-muted-foreground">{dateStr}</span>;
    }

    const isResolved = status === 'returned' || status === 'closed' || status === 'rejected';
    const isOverdue = !isResolved && dueDate.getTime() < Date.now();

    return (
      <div className="flex flex-col whitespace-nowrap">
        <span className={`text-xs font-medium ${isOverdue ? 'text-rose-600' : 'text-foreground'}`}>
          {formatDate(dateStr)}
        </span>
        {isOverdue && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">Overdue</span>
        )}
      </div>
    );
  } catch {
    return <span className="text-xs text-muted-foreground">{dateStr}</span>;
  }
}

function ExpandedDetails({
  record,
  requestEvents,
  loadingEvents,
  assignmentsMap,
  loadingAssignments,
}: {
  record: BorrowRecord;
  requestEvents: Record<string, BorrowRequestEvent[]>;
  loadingEvents: Record<string, boolean>;
  assignmentsMap: Record<string, { units: BorrowRequestUnit[]; batches: BorrowRequestBatch[] }>;
  loadingAssignments: Record<string, boolean>;
}) {
  const events = requestEvents[record.request_id];
  const isLoading = loadingEvents[record.request_id];
  const assignments = assignmentsMap[record.request_id];
  const isLoadingAssignments = loadingAssignments[record.request_id];
  const hasAssignmentDetails = !!assignments && (assignments.units.length > 0 || assignments.batches.length > 0);
  const itemMetaById = new Map(
    record.items.map((item) => [item.item_id, { unitOfMeasure: item.unit_of_measure }]),
  );

  return (
    <tr className="border-b border-border/30">
      <td className="p-0" colSpan={8}>
        <div className="px-6 py-5 pl-14 bg-muted/20 animate-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-6xl">
            {/* Items table */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <PackageOpen className="w-3.5 h-3.5" />
                Requested Items
              </h4>
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/40">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Classification</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {record.items.map((item, idx) => (
                      <tr key={`${record.request_id}-${item.item_id}-${idx}`} className="hover:bg-muted/10">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-foreground">{item.name}</div>
                          <div className="text-muted-foreground font-mono text-[10px] mt-0.5">{item.item_id}</div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground capitalize">
                          {item.classification || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                          {formatQuantityWithUnit(item.qty_requested, item.is_trackable ? undefined : item.unit_of_measure)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <PackageOpen className="w-3.5 h-3.5" />
                Return Details
              </h4>

              {isLoadingAssignments ? (
                <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Loading return details...</span>
                </div>
              ) : hasAssignmentDetails ? (
                <div className="space-y-4">
                  {assignments.units.length > 0 && (
                    <div className="rounded-lg border border-border/60 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/40 border-b border-border/40">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Unit</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Return Condition</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Returned</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {assignments.units.map((unit) => (
                            <tr key={unit.borrow_unit_id} className="hover:bg-muted/10">
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-foreground font-mono">{unit.unit_id}</div>
                                <div className="text-muted-foreground text-[10px] mt-0.5">
                                  {unit.serial_number || 'No serial'}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground capitalize">
                                {unit.condition_on_return?.replace(/_/g, ' ') || 'No change'}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                                {unit.returned_at ? 'Yes' : 'No'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {assignments.batches.length > 0 && (
                    <div className="rounded-lg border border-border/60 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/40 border-b border-border/40">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Batch</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Assigned</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Returned</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Not Returned</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {assignments.batches.map((batch) => {
                            const itemMeta = batch.item_id ? itemMetaById.get(batch.item_id) : undefined;
                            const unitOfMeasure = batch.unit_of_measure ?? itemMeta?.unitOfMeasure;

                            return (
                              <tr key={batch.borrow_batch_id} className="hover:bg-muted/10">
                                <td className="px-3 py-2.5">
                                  <div className="font-medium text-foreground font-mono">{batch.batch_id}</div>
                                  <div className="text-muted-foreground text-[10px] mt-0.5">
                                    {[batch.item_id, batch.item_name].filter(Boolean).join(' · ') || 'Untrackable item'}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                                  {formatQuantityWithUnit(batch.qty_assigned, unitOfMeasure)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                                  {formatQuantityWithUnit(batch.qty_returned ?? 0, unitOfMeasure)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-amber-700">
                                  {formatQuantityWithUnit(batch.qty_not_returned ?? batch.qty_assigned, unitOfMeasure)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
                  No assignment or return details recorded.
                </div>
              )}
            </div>

            {/* Timeline */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Activity Timeline
              </h4>

              {isLoading ? (
                <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Loading history...</span>
                </div>
              ) : events && events.length > 0 ? (
                <div className="relative pl-5 space-y-4">
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                  {events.map((event, idx) => (
                    <div key={event.event_id} className="relative">
                      <div
                        className={`absolute -left-5 top-1 w-3.5 h-3.5 rounded-full border-2 border-card z-10 ${idx === 0 ? 'bg-primary' : 'bg-primary/20'
                          }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-foreground capitalize">
                            {event.event_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatEventDate(event.occurred_at)}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          by {event.actor_name || event.actor_user_id || 'System'}
                        </div>
                        {event.note && (
                          <p className="text-[11px] text-muted-foreground/80 mt-1 italic bg-muted/30 px-2 py-1 rounded">
                            {event.note}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
                  No history events recorded.
                </div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function RequestsTable({
  records,
  loading,
  expandedIds,
  onToggleRow,
  requestEvents,
  loadingEvents,
  assignmentsMap,
  loadingAssignments,
  statusFilter,
  onClearStatusFilter,
  onSetConfirmingAction,
  onSetAssigningRequest,
  onSetReturningRequest,
  isFullyAssigned,
  onShowReceipt,
}: {
  records: BorrowRecord[];
  loading: boolean;
  expandedIds: Set<string>;
  onToggleRow: (requestId: string) => void;
  requestEvents: Record<string, BorrowRequestEvent[]>;
  loadingEvents: Record<string, boolean>;
  assignmentsMap: Record<string, { units: BorrowRequestUnit[]; batches: BorrowRequestBatch[] }>;
  loadingAssignments: Record<string, boolean>;
  statusFilter: StatusTab;
  onClearStatusFilter: () => void;
  onSetConfirmingAction: (args: { action: BorrowAction; requestId: string; actionLabel: string }) => void;
  onSetAssigningRequest: (record: BorrowRecord) => void;
  onSetReturningRequest: (record: BorrowRecord) => void;
  isFullyAssigned: (record: BorrowRecord) => boolean;
  onShowReceipt: (requestId: string) => void;
}) {
  const renderActions = (record: BorrowRecord) => {
    const actions: ReactNode[] = [];

    if (record.status === 'pending') {
      actions.push(
        <ActionButton key="approve" label="Approve" variant="success" onClick={() => onSetConfirmingAction({ action: 'approve', requestId: record.request_id, actionLabel: 'Approve' })} />,
        <ActionButton key="reject" label="Reject" variant="danger" onClick={() => onSetConfirmingAction({ action: 'reject', requestId: record.request_id, actionLabel: 'Reject' })} />,
      );
    }

    if (record.status === 'approved') {
      actions.push(
        <ActionButton key="assign" label={isFullyAssigned(record) ? 'Reassign' : 'Assign'} onClick={() => onSetAssigningRequest(record)} />,
      );
      if (isFullyAssigned(record)) {
        actions.push(
          <ActionButton key="release" label="Release" variant="success" onClick={() => onSetConfirmingAction({ action: 'release', requestId: record.request_id, actionLabel: 'Release' })} />,
        );
      }

    }

    if (record.status === 'released') {
      actions.push(
        <ActionButton key="receipt" label="Receipt" variant="default" onClick={() => onShowReceipt(record.request_id)} />,
        <ActionButton key="return" label="Return" variant="success" onClick={() => onSetReturningRequest(record)} />,
      );
      if (record.items.every((it) => !it.is_trackable)) {
        actions.push(
          <ActionButton key="close" label="Close" variant="secondary" onClick={() => onSetConfirmingAction({ action: 'close', requestId: record.request_id, actionLabel: 'Close' })} />,
        );
      }
    }

    if (record.status === 'returned') {
      actions.push(
        <ActionButton key="receipt" label="Receipt" variant="default" onClick={() => onShowReceipt(record.request_id)} />,
        <ActionButton key="close" label="Close" variant="secondary" onClick={() => onSetConfirmingAction({ action: 'close', requestId: record.request_id, actionLabel: 'Close' })} />,
      );
    }

    if (record.status === 'rejected') {
      actions.push(
        <ActionButton key="reopen" label="Reopen" onClick={() => onSetConfirmingAction({ action: 'reopen', requestId: record.request_id, actionLabel: 'Reopen' })} />,
        <ActionButton key="close" label="Close" variant="secondary" onClick={() => onSetConfirmingAction({ action: 'close', requestId: record.request_id, actionLabel: 'Close' })} />,
      );
    }

    if (record.status === 'closed') {
      actions.push(
        <ActionButton key="receipt" label="Receipt" variant="default" onClick={() => onShowReceipt(record.request_id)} />,
      );
      return (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {actions}
          <span className="text-[11px] text-muted-foreground ml-1.5">
            {record.closed_at ? `Closed ${formatDate(record.closed_at).split(',')[0]}` : 'Finalized'}
          </span>
        </div>
      );
    }

    return <div className="flex items-center gap-1.5 flex-wrap justify-end">{actions}</div>;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-left">
        <colgroup>
          <col className="w-8" />
          <col className="w-24" />
          <col className="w-[38%]" />
          <col className="w-[16%]" />
          <col className="w-20" />
          <col className="w-28" />
          <col className="w-32" />
          <col className="w-36" />
          <col className="w-56" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <th className="py-3 pl-5 w-8" />
            <th className="py-3 px-4">Request ID</th>
            <th className="py-3 px-4">Item & Borrower</th>
            <th className="py-3 px-4">Client / Location</th>
            <th className="py-3 px-4 text-center">Qty</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Due Date</th>
            <th className="py-3 px-4">Requested</th>
            <th className="py-3 px-4 pr-5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={9} className="py-16 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm">Loading requests...</p>
                </div>
              </td>
            </tr>
          ) : records.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-16 text-center">
                <div className="flex flex-col items-center gap-2">
                  <PackageOpen className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">No requests found</p>
                  {statusFilter !== 'ALL' && (
                    <button
                      onClick={onClearStatusFilter}
                      className="text-xs text-primary hover:underline mt-1"
                      type="button"
                    >
                      Clear filter to show all
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ) : records.map((record) => {
            const isExpanded = expandedIds.has(record.request_id);
            const totalQty = sumQuantities(record.items.map((item) => item.qty_requested));

            return (
              <Fragment key={record.request_id}>
                <tr
                  onClick={() => onToggleRow(record.request_id)}
                  className={`border-b border-border/40 transition-colors cursor-pointer group ${isExpanded ? 'bg-muted/10' : 'hover:bg-muted/20'
                    }`}
                >
                  <td className="py-3.5 pl-5 w-8">
                    <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />
                      }
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-primary font-medium">{record.request_id}</span>
                      {record.is_emergency && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 uppercase tracking-wider">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Urgent
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {record.items.map((item) => item.name || item.item_id).join(', ') || 'No Items'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {record.borrower_name ?? record.borrower_user_id ?? 'Unknown user'}
                        {record.borrower_name && record.borrower_user_id && (
                          <span className="text-muted-foreground/60"> ({record.borrower_user_id})</span>
                        )}
                      </p>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 min-w-0">
                    <div className="min-w-0">
                      {record.customer_name ? (
                        <p className="text-sm text-foreground truncate">{record.customer_name}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground/50">—</p>
                      )}
                      {record.location_name && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{record.location_name}</p>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 rounded-md bg-muted/50 text-xs font-semibold text-foreground">
                      {formatQuantity(totalQty)}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <StatusBadge status={record.status} closeReason={record.close_reason} />
                  </td>

                  <td className="py-3.5 px-4">
                    {renderDueDate(record.return_at, record.status)}
                  </td>

                  <td className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(record.request_date)}
                  </td>

                  <td className="py-3.5 px-4 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                    {renderActions(record)}
                  </td>
                </tr>

                {isExpanded && (
                  <ExpandedDetails
                    record={record}
                    requestEvents={requestEvents}
                    loadingEvents={loadingEvents}
                    assignmentsMap={assignmentsMap}
                    loadingAssignments={loadingAssignments}
                  />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
