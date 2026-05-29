'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Package,
    Plus,
    Loader2,
    RefreshCcw,
    Search,
    UserCircle,
    History,
    Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { userApi, EntrustedItem } from '../users/api';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { AssignEntrustedItemModal } from './AssignEntrustedItemModal';
import { Pagination } from '@/components/ui/Pagination';
import { ActionConfirmModal } from '@/components/ui/ActionConfirmModal';
import type { PaginationMeta } from '@/lib/api';

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return 'Failed to revoke item';
}

export default function EntrustedItemsPage() {
    const [items, setItems] = useState<EntrustedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState<PaginationMeta | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [revokeTarget, setRevokeTarget] = useState<EntrustedItem | null>(null);
    const [revokeNotes, setRevokeNotes] = useState('');

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await userApi.getAllEntrustedItems({
                page,
                per_page: 20,
                search: debouncedSearchQuery || undefined,
                status: statusFilter || undefined,
            });
            setItems(res.data || []);
            setMeta(res.meta || null);
        } catch {
            toast.error('Failed to load entrusted items');
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearchQuery, statusFilter]);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500);

        return () => clearTimeout(handler);
    }, [searchQuery]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearchQuery, statusFilter]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);


    const handleRevoke = async () => {
        if (!revokeTarget) return;

        setRevoking(revokeTarget.assignment_id);
        try {
            const trimmedNotes = revokeNotes.trim();
            await userApi.revokeEntrustedItem(revokeTarget.assigned_to_user_id, revokeTarget.assignment_id, {
                notes: trimmedNotes || undefined,
            });
            toast.success('Item revoked successfully');
            setRevokeTarget(null);
            setRevokeNotes('');
            fetchItems();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
        } finally {
            setRevoking(null);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const response = await userApi.exportEntrustedItems({
                format: 'xlsx',
                search: debouncedSearchQuery || undefined,
                status: statusFilter || undefined,
            });
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;

            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'entrusted_items_export.xlsx';
            if (contentDisposition) {
                const matches = /filename="?([^";]+)"?/.exec(contentDisposition);
                if (matches && matches[1]) filename = matches[1];
            }

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
            toast.success('Export downloaded successfully');
        } catch {
            toast.error('Failed to export entrusted items');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Package className="w-8 h-8 text-emerald-500" />
                        Entrusted Equipment
                    </h1>
                    <p className="text-muted-foreground text-sm max-w-lg">
                        Manage and track items assigned to employees. View current assignments and revoke items when they are returned.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="h-12 px-6 rounded-xl border border-border bg-background text-foreground text-sm font-bold shadow-sm hover:bg-muted hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        Export Excel
                    </button>
                    <button
                        onClick={() => setIsAssignModalOpen(true)}
                        className="h-12 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                        <Plus className="w-5 h-5" />
                        Entrust New Item
                    </button>
                </div>
            </div>

            {/* Table / List */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/5 flex flex-col md:flex-row md:items-center gap-6">
                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <input
                            type="text"
                            placeholder="Search by employee or unit id..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 pl-10 pr-4 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-muted-foreground/40"
                        />
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Filter by:</span>

                        <div className="flex bg-muted/50 rounded-lg border border-border p-1">
                            {([
                                { key: '', label: 'All' },
                                { key: 'active', label: 'Active' },
                                { key: 'returned', label: 'Returned' }
                            ] as const).map((s) => (
                                <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => setStatusFilter(s.key)}
                                    className={cn(
                                        "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                        statusFilter === s.key
                                            ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        {(searchQuery || statusFilter) && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setDebouncedSearchQuery('');
                                    setStatusFilter('');
                                }}
                                className="h-9 px-3 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="py-24 flex flex-col items-center justify-center">
                            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                            <p className="text-sm font-medium text-muted-foreground">Syncing entrusted inventory...</p>
                        </div>
                    ) : (items?.length || 0) === 0 ? (
                        <div className="py-24 flex flex-col items-center justify-center text-center px-4">
                            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
                                <History className="w-8 h-8 text-muted-foreground/40" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">No items currently entrusted</h3>
                            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                All equipment is currently available or accounted for in the main inventory.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/60">
                            {/* Column labels */}
                            <div className="hidden md:grid md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_90px_130px_130px_90px_minmax(0,1fr)_100px] gap-4 px-6 py-3 text-xs font-medium text-muted-foreground bg-muted/20">
                                <span>Assignment ID</span>
                                <span>Employee</span>
                                <span>Item Details</span>
                                <span>Unit ID</span>
                                <span>Assigned Date</span>
                                <span>Returned Date</span>
                                <span>Status</span>
                                <span>Notes</span>
                                <span className="text-right">Actions</span>
                            </div>

                            {items.map((item) => (
                                <div
                                    key={item.assignment_id}
                                    className={cn("group px-6 py-4 hover:bg-muted/20 transition-colors", item.returned_at ? "opacity-60" : "")}
                                >
                                    {/* Desktop layout */}
                                    <div className="hidden md:grid md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_90px_130px_130px_90px_minmax(0,1fr)_100px] gap-4 items-center">
                                        {/* Assignment ID */}
                                        <span className="font-mono text-xs text-muted-foreground truncate">
                                            {item.assignment_id}
                                        </span>

                                        {/* Employee */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
                                                <UserCircle className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">
                                                    {item.assigned_to_name || 'Unknown User'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Item Details */}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {item.item_name || 'N/A'}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                {item.item_category || 'General'}
                                            </p>
                                        </div>

                                        {/* Unit ID */}
                                        <span className="text-sm font-mono text-muted-foreground truncate">
                                            {item.serial_number || item.unit_id}
                                        </span>

                                        {/* Assigned Date */}
                                        <span className="text-sm text-muted-foreground">
                                            {item.assigned_at && isValid(new Date(item.assigned_at))
                                                ? format(new Date(item.assigned_at), 'MMM d, yyyy')
                                                : '—'}
                                        </span>

                                        {/* Returned Date */}
                                        <span className="text-sm text-muted-foreground">
                                            {item.returned_at && isValid(new Date(item.returned_at))
                                                ? format(new Date(item.returned_at), 'MMM d, yyyy')
                                                : '—'}
                                        </span>

                                        {/* Status */}
                                        {item.returned_at ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground w-fit">
                                                Returned
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 w-fit">
                                                Assigned
                                            </span>
                                        )}

                                        {/* Notes */}
                                        <span className="text-xs text-muted-foreground truncate" title={item.notes || ''}>
                                            {item.notes || '—'}
                                        </span>

                                        {/* Actions */}
                                        <div className="flex items-center justify-end">
                                            {!item.returned_at && (
                                                <button
                                                    onClick={() => {
                                                        setRevokeTarget(item);
                                                        setRevokeNotes('');
                                                    }}
                                                    disabled={revoking === item.assignment_id}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                                                >
                                                    {revoking === item.assignment_id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <RefreshCcw className="w-4 h-4" />
                                                    )}
                                                    <span className="hidden lg:inline">Revoke</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Mobile card layout */}
                                    <div className="md:hidden space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
                                                    <UserCircle className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">
                                                        {item.assigned_to_name || 'Unknown User'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{item.item_name} · {item.serial_number || item.unit_id}</p>
                                                </div>
                                            </div>
                                            {item.returned_at ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                                    Returned
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">
                                                    Assigned
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground pl-[52px]">
                                            <span className="font-mono text-xs">{item.assignment_id}</span>
                                            <span>{item.assigned_at && isValid(new Date(item.assigned_at)) ? format(new Date(item.assigned_at), 'MMM d, yyyy') : '—'}</span>
                                        </div>
                                        {!item.returned_at && (
                                            <div className="flex flex-wrap items-center gap-2 pl-[52px]">
                                                <button
                                                    onClick={() => {
                                                        setRevokeTarget(item);
                                                        setRevokeNotes('');
                                                    }}
                                                    disabled={revoking === item.assignment_id}
                                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-500 bg-red-500/10 rounded-lg transition-colors hover:bg-red-500/20 shrink-0"
                                                >
                                                    {revoking === item.assignment_id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <RefreshCcw className="w-4 h-4" />
                                                    )}
                                                    Revoke
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {meta && (
                    <Pagination
                        meta={meta}
                        onPageChange={setPage}
                    />
                )}
            </div>

            {isAssignModalOpen && (
                <AssignEntrustedItemModal
                    onClose={() => setIsAssignModalOpen(false)}
                    onSuccess={() => {
                        setIsAssignModalOpen(false);
                        fetchItems();
                    }}
                />
            )}

            <ActionConfirmModal
                open={revokeTarget !== null}
                title="Revoke this entrusted item?"
                description="This will mark the entrusted assignment as returned and release the unit from the active entrusted list."
                icon={<RefreshCcw className="h-5 w-5" />}
                confirmLabel="Revoke Item"
                tone="warning"
                confirming={revokeTarget ? revoking === revokeTarget.assignment_id : false}
                onCancel={() => {
                    if (!revoking) {
                        setRevokeTarget(null);
                        setRevokeNotes('');
                    }
                }}
                onConfirm={() => void handleRevoke()}
                noteLabel="Revocation note (optional)"
                notePlaceholder="Add an optional return or revocation note..."
                noteValue={revokeNotes}
                onNoteChange={setRevokeNotes}
                details={revokeTarget ? (
                    <div className="space-y-1">
                        <p>
                            Assignment: <span className="font-mono text-foreground">{revokeTarget.assignment_id}</span>
                        </p>
                        <p>
                            Employee: <span className="font-semibold text-foreground">{revokeTarget.assigned_to_name || 'Unknown User'}</span>
                        </p>
                        <p>
                            Unit: <span className="font-mono text-foreground">{revokeTarget.serial_number || revokeTarget.unit_id}</span>
                        </p>
                    </div>
                ) : null}
            />
        </div>
    );
}
