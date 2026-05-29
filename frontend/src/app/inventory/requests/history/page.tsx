'use client';

import { useState, useEffect } from 'react';
import { History, Search, Loader2, AlertCircle, User, Calendar as CalendarIcon, Tag, Info } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { format as formatDateFns, parseISO } from 'date-fns';
import { BorrowRequestEventGlobal } from '../api';
import { useGlobalBorrowEvents } from '../lib/useRequestQueries';
import { Pagination } from '@/components/ui/Pagination';
import Link from 'next/link';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function RequestHistoryPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [requestIdFilter, setRequestIdFilter] = useState('');
  const [actorNameFilter, setActorNameFilter] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const debouncedRequestId = useDebounce(requestIdFilter, 400);
  const debouncedActorName = useDebounce(actorNameFilter, 400);

  const { data: eventsResponse, isLoading: loading, error: queryError, refetch } = useGlobalBorrowEvents({
    page,
    per_page: perPage,
    event_type: eventTypeFilter || undefined,
    request_id: debouncedRequestId || undefined,
    actor_name: debouncedActorName || undefined,
    date_from: dateFrom ? formatDateFns(dateFrom, 'yyyy-MM-dd') : undefined,
    date_to: dateTo ? formatDateFns(dateTo, 'yyyy-MM-dd') : undefined,
  });

  const events = (eventsResponse?.data as BorrowRequestEventGlobal[]) || [];
  const meta = eventsResponse?.meta || null;
  const error = queryError ? (queryError as Error).message : null;

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [eventTypeFilter, debouncedRequestId, debouncedActorName, dateFrom, dateTo, perPage]);

  const getEventBadgeClass = (type: string) => {
    switch (type.toLowerCase()) {
      case 'created': return 'bg-primary/10 text-primary border-primary/20';
      case 'approved': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'rejected': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'voided': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'released': return 'bg-primary/10 text-primary border-primary/20 font-bold';

      case 'returned': return 'bg-primary/10 text-primary border-primary/20';
      case 'closed': return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
      default: return 'bg-muted/30 text-muted-foreground border-border/50';
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold font-heading mb-2">Request Activity Log</h1>
          <p className="text-muted-foreground text-lg">Detailed history of all borrow request state transitions and actions.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-2xl border border-primary/20 text-sm font-bold">
          <Info className="w-4 h-4" />
          <span>Tracking all borrow request life cycles</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md">
        <div className="p-6 border-b border-border bg-background/50 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px] relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={requestIdFilter}
                onChange={(e) => setRequestIdFilter(e.target.value)}
                placeholder="Search by Request ID..."
                className="w-full h-11 pl-11 pr-4 rounded-xl bg-input/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm font-medium"
              />
            </div>

            <div className="w-full sm:w-auto relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={actorNameFilter}
                onChange={(e) => setActorNameFilter(e.target.value)}
                placeholder="Actor Name..."
                className="w-full sm:w-48 h-11 pl-11 pr-4 rounded-xl bg-input/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm font-medium"
              />
            </div>

            <div className="w-full sm:w-auto flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                className="h-11 px-4 rounded-xl bg-input/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm font-medium pr-8"
              >
                <option value="">All Types</option>
                <option value="created">Created</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="voided">Voided</option>
                <option value="released">Released</option>
                <option value="returned">Returned</option>
                <option value="reopened">Reopened</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <DatePicker
                    date={dateFrom}
                    onChange={setDateFrom}
                    placeholder="From Date"
                  />
                  <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider">to</span>
                  <DatePicker
                    date={dateTo}
                    onChange={setDateTo}
                    placeholder="To Date"
                  />
                </div>
              </div>

              {(requestIdFilter || actorNameFilter || eventTypeFilter || dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setRequestIdFilter('');
                    setActorNameFilter('');
                    setEventTypeFilter('');
                    setDateFrom(undefined);
                    setDateTo(undefined);
                  }}
                  className="text-xs font-bold text-rose-500 hover:text-rose-400 transition-colors uppercase tracking-widest px-2 py-1 rounded-lg hover:bg-rose-500/10"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="text-xs text-muted-foreground font-medium">
              Page {page} of {meta ? Math.ceil(meta.total / meta.limit) : 1} • {meta?.total || 0} Total Events
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground bg-background/30 font-semibold font-heading">
                <th className="p-4 pl-6">Timestamp</th>
                <th className="p-4">Request & Event ID</th>
                <th className="p-4">Action Type</th>
                <th className="p-4">Actor</th>
                <th className="p-4 pr-6">Notes / Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium animate-pulse text-lg">Fetching activity history...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-rose-500">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-bold">{error}</p>
                    <button onClick={() => refetch()} className="mt-4 px-6 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-bold hover:bg-rose-500/20 transition-all">
                      Try Again
                    </button>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6 opacity-40">
                      <History className="w-8 h-8" />
                    </div>
                    <p className="text-xl font-bold font-heading mb-1">No Activity Found</p>
                    <p className="text-sm">Try adjusting your filters or check back later.</p>
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.event_id} className="hover:bg-muted/30 transition-colors group">
                    <td className="p-4 pl-6">
                      <div className="flex flex-col whitespace-nowrap">
                        <span className="text-sm font-medium text-foreground">{event.occurred_at.split(' - ')[0]}</span>
                        <span className="text-xs text-muted-foreground">{event.occurred_at.split(' - ')[1]}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <Link
                          href={`/inventory/requests?search=${event.request_id}`}
                          className="text-sm font-bold text-primary font-mono tracking-tighter hover:text-primary/80 transition-colors"
                        >
                          {event.request_id}
                        </Link>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{event.event_id}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-sm ${getEventBadgeClass(event.event_type)}`}>
                        {event.event_type.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] text-primary border border-primary/20 font-bold">
                          {event.actor_name?.split(', ')[0]?.substring(0, 1) || 'S'}
                          {event.actor_name?.split(', ')[1]?.substring(0, 1) || ''}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground tracking-tight leading-none mb-1">{event.actor_name || 'System'}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{event.actor_user_id || 'SYSTEM-LV'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 pr-6">
                      <span className="text-sm text-muted-foreground font-medium line-clamp-2 max-w-xs italic">
                        {event.note || '---'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta && Math.ceil(meta.total / meta.limit) > 1 && (
          <Pagination
            meta={meta}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
