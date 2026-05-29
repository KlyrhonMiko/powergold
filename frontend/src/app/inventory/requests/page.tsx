'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { borrowApi, BorrowRequestEvent, BorrowRequest } from './api';
import { useBorrowRequests, useBorrowMutations } from './lib/useRequestQueries';
import { Pagination } from '@/components/ui/Pagination';
import { UnitSelectionModal } from './UnitSelectionModal';
import { ReturnModal } from './ReturnModal';
import { toast } from 'sonner';
import type { StatusTab, BorrowRecord, BorrowAction } from './lib/types';
import type { BorrowRequestBatch, BorrowRequestUnit } from './api';
import { DEFAULT_PER_PAGE } from './lib/types';
import { useDebounce } from './lib/useDebounce';
import { RequestsHeader } from './components/RequestsHeader';
import { RequestsToolbar } from './components/RequestsToolbar';
import { RequestsTable } from './components/RequestsTable';
import { ConfirmBorrowActionModal } from './components/ConfirmBorrowActionModal';
import { ReleaseReceiptModal } from './components/ReleaseReceiptModal';
import { useInventoryWebSocket } from '@/hooks/useInventoryWebSocket';
import { logger } from '@/lib/logger';
import { areQuantitiesEqual, sumQuantities } from '@/lib/inventoryQuantity';

const ACTION_SUCCESS_LABELS: Record<BorrowAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  void: 'voided',
  release: 'released',
  return: 'returned',
  reopen: 'reopened',
  close: 'closed',
};

export default function BorrowsPage() {
  useInventoryWebSocket();

  const [requestEvents, setRequestEvents] = useState<Record<string, BorrowRequestEvent[]>>({});
  const [loadingEvents, setLoadingEvents] = useState<Record<string, boolean>>({});
  const [loadingAssignments, setLoadingAssignments] = useState<Record<string, boolean>>({});

  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusTab>('ALL');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmingAction, setConfirmingAction] = useState<{
    action: BorrowAction;
    requestId: string;
    actionLabel: string;
  } | null>(null);
  const [assigningRequest, setAssigningRequest] = useState<BorrowRecord | null>(null);
  const [returningRequest, setReturningRequest] = useState<BorrowRecord | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, { units: BorrowRequestUnit[]; batches: BorrowRequestBatch[] }>>({});
  const [receiptRequestId, setReceiptRequestId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchInput, 400);

  const { data: requestsResponse, isLoading: requestsLoading, error: requestsError } = useBorrowRequests({
    page,
    per_page: perPage,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    search: debouncedSearch || undefined,
  });

  const records = useMemo(
    () => (requestsResponse?.data as unknown as BorrowRecord[]) || [],
    [requestsResponse?.data]
  );
  const meta = requestsResponse?.meta || null;
  const error = requestsError ? (requestsError as Error).message : null;

  const { executeAction, invalidateList } = useBorrowMutations();

  const fetchRequestEvents = useCallback(async (requestId: string, force = false) => {
    if (!force && requestEvents[requestId]) return;
    setLoadingEvents(prev => ({ ...prev, [requestId]: true }));
    try {
      const res = await borrowApi.getEvents(requestId);
      setRequestEvents(prev => ({ ...prev, [requestId]: res.data as BorrowRequestEvent[] }));
    } catch (err) {
      logger.error('Failed to fetch borrow request events', { error: err, requestId });
    } finally {
      setLoadingEvents(prev => ({ ...prev, [requestId]: false }));
    }
  }, [requestEvents]);

  const fetchAssignments = useCallback(async (requestId: string) => {
    setLoadingAssignments(prev => ({ ...prev, [requestId]: true }));
    try {
      const [units, batches] = await Promise.all([
        borrowApi.getAssignedUnits(requestId),
        borrowApi.getAssignedBatches(requestId)
      ]);
      setAssignmentsMap(prev => ({
        ...prev,
        [requestId]: { units: units.data, batches: batches.data }
      }));
    } catch (err) {
      logger.error('Failed to fetch borrow request assignments', { error: err, requestId });
    } finally {
      setLoadingAssignments(prev => ({ ...prev, [requestId]: false }));
    }
  }, []);

  const isFullyAssigned = useCallback((record: BorrowRecord) => {
    const assignments = assignmentsMap[record.request_id];
    if (!assignments) return false;

    const totalRequested = sumQuantities(record.items.map((item) => item.qty_requested));
    const totalAssignedUnits = assignments.units.length;
    const totalAssignedBatches = sumQuantities(
      assignments.batches.map((batch: BorrowRequestBatch) => batch.qty_assigned),
    );

    return areQuantitiesEqual(totalAssignedUnits + totalAssignedBatches, totalRequested)
      || (totalAssignedUnits + totalAssignedBatches) > totalRequested;
  }, [assignmentsMap]);

  useEffect(() => {
    records.forEach(record => {
      if (record.status === 'approved' && !assignmentsMap[record.request_id]) {
        fetchAssignments(record.request_id);
      }
    });
  }, [records, fetchAssignments, assignmentsMap]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, perPage]);

  // Remove manual initial fetchRecords hook

  const handleAction = async (action: BorrowAction, requestId: string, notes?: string) => {
    try {
      await executeAction.mutateAsync({ action, id: requestId, payload: { notes } });
      toast.success(`Request ${ACTION_SUCCESS_LABELS[action]} successfully`);

      if (expandedIds.has(requestId)) {
        void fetchRequestEvents(requestId, true);
      }
      setConfirmingAction(null);
      setActionNotes('');

      if (action === 'release') {
        setReceiptRequestId(requestId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to ${action} request`;
      toast.error(msg);
    }
  };

  const toggleRow = (requestId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
        void fetchRequestEvents(requestId);
        void fetchAssignments(requestId);
      }
      return next;
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      <RequestsHeader meta={meta} statusFilter={statusFilter} />

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2.5 animate-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <RequestsToolbar
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />

        <RequestsTable
          records={records}
          loading={requestsLoading}
          expandedIds={expandedIds}
          onToggleRow={toggleRow}
          requestEvents={requestEvents}
          loadingEvents={loadingEvents}
          assignmentsMap={assignmentsMap}
          loadingAssignments={loadingAssignments}
          statusFilter={statusFilter}
          onClearStatusFilter={() => setStatusFilter('ALL')}
          onSetConfirmingAction={(args) => setConfirmingAction(args)}
          onSetAssigningRequest={(record) => setAssigningRequest(record)}
          onSetReturningRequest={(record) => setReturningRequest(record)}
          isFullyAssigned={isFullyAssigned}
          onShowReceipt={(requestId) => setReceiptRequestId(requestId)}
        />

        {meta && (
          <Pagination meta={meta} onPageChange={setPage} />
        )}
      </div>

      <ConfirmBorrowActionModal
        confirmingAction={confirmingAction}
        actionNotes={actionNotes}
        onActionNotesChange={setActionNotes}
        onCancel={() => setConfirmingAction(null)}
        onConfirm={() => {
          if (!confirmingAction) return;
          void handleAction(confirmingAction.action, confirmingAction.requestId, actionNotes);
        }}
      />

      {assigningRequest && (
        <UnitSelectionModal
          request={assigningRequest as unknown as BorrowRequest}
          onClose={() => setAssigningRequest(null)}
          onSuccess={() => {
            const requestId = assigningRequest.request_id;
            setAssigningRequest(null);
            invalidateList();
            fetchAssignments(requestId);
            void fetchRequestEvents(requestId, true);
          }}
        />
      )}

      {returningRequest && (
        <ReturnModal
          request={returningRequest as unknown as BorrowRequest}
          onClose={() => setReturningRequest(null)}
          onSuccess={() => {
            const requestId = returningRequest.request_id;
            setReturningRequest(null);
            invalidateList();
            if (expandedIds.has(requestId)) {
              void fetchRequestEvents(requestId, true);
              void fetchAssignments(requestId);
            }
          }}
        />
      )}

      {receiptRequestId && (
        <ReleaseReceiptModal
          requestId={receiptRequestId}
          onClose={() => setReceiptRequestId(null)}
        />
      )}
    </div>
  );
}
