'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Plus, Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { userApi, EntrustedItem } from '../api';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ActionConfirmModal } from '@/components/ui/ActionConfirmModal';

interface EntrustedItemsProps {
    userId: string;
}

export function EntrustedItems({ userId }: EntrustedItemsProps) {
    const [items, setItems] = useState<EntrustedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [assigning, setAssigning] = useState(false);
    const [newUnitId, setNewUnitId] = useState('');
    const [revoking, setRevoking] = useState<string | null>(null);
    const [revokeTarget, setRevokeTarget] = useState<EntrustedItem | null>(null);
    const [revokeNotes, setRevokeNotes] = useState('');

    const fetchItems = useCallback(async () => {
        try {
            const res = await userApi.getEntrustedItems(userId);
            setItems(res.data);
        } catch {
            toast.error('Failed to load entrusted items');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void fetchItems();
    }, [fetchItems]);

    const handleAssign = async () => {
        if (!newUnitId.trim()) return;
        setAssigning(true);
        try {
            await userApi.assignEntrustedItem(userId, {
                unit_id: newUnitId.trim(),
                user_id: userId,
            });
            toast.success('Item assigned successfully');
            setNewUnitId('');
            await fetchItems();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Failed to assign item');
        } finally {
            setAssigning(false);
        }
    };

    const handleRevoke = async () => {
        if (!revokeTarget) return;

        setRevoking(revokeTarget.assignment_id);
        try {
            const trimmedNotes = revokeNotes.trim();
            await userApi.revokeEntrustedItem(userId, revokeTarget.assignment_id, { notes: trimmedNotes || undefined });
            toast.success('Item revoked successfully');
            setRevokeTarget(null);
            setRevokeNotes('');
            await fetchItems();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Failed to revoke item');
        } finally {
            setRevoking(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-500" />
                    Entrusted Equipment
                </h3>
            </div>

            <div className="p-5 rounded-xl border border-border/60 bg-muted/20 space-y-4">
                {/* Assign Section (No form tag to avoid nesting) */}
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">
                            Assign Inventory Unit
                        </label>
                        <input
                            required
                            value={newUnitId}
                            onChange={(e) => setNewUnitId(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleAssign();
                                }
                            }}
                            className="w-full h-11 px-4 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-muted-foreground/40"
                            placeholder="e.g. UNIT-XXXXXX"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleAssign()}
                        disabled={assigning || !newUnitId.trim()}
                        className="h-11 px-6 rounded-lg bg-emerald-500 text-white text-sm font-bold shadow-lg hover:bg-emerald-600 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 transition-all flex items-center gap-2"
                    >
                        {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Assign
                    </button>
                </div>

                {/* List */}
                <div className="mt-6">
                    {loading ? (
                        <div className="py-8 flex justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground bg-background rounded-lg border border-dashed border-border/60">
                            No entrusted items currently assigned.
                        </div>
                    ) : (
                        <div className="divide-y divide-border/40 border border-border/60 rounded-lg bg-background overflow-hidden max-h-[300px] overflow-y-auto">
                            {items.map((item) => (
                                <div key={item.assignment_id} className={cn("p-4 flex items-center justify-between gap-4 transition-colors hover:bg-muted/30", item.returned_at ? "opacity-60 grayscale" : "")}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-sm text-foreground truncate">
                                                {item.item_name || 'Unknown Item'}
                                            </span>
                                            {item.returned_at && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">
                                                    Returned
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span>Unit: <span className="font-mono text-foreground/80">{item.unit_id}</span></span>
                                            {item.serial_number && (
                                                <span>SN: <span className="font-mono text-foreground/80">{item.serial_number}</span></span>
                                            )}
                                            <span>Assigned: {format(new Date(item.assigned_at), 'MMM d, yyyy h:mm a')}</span>
                                        </div>
                                    </div>
                                    {!item.returned_at && (
                                        <button
                                            onClick={() => {
                                                setRevokeTarget(item);
                                                setRevokeNotes('');
                                            }}
                                            disabled={revoking === item.assignment_id}
                                            className="px-3 py-1.5 rounded-lg border border-red-500/20 text-red-600 bg-red-500/5 hover:bg-red-500/10 text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
                                        >
                                            {revoking === item.assignment_id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <RefreshCcw className="w-3.5 h-3.5" />
                                            )}
                                            Revoke
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <ActionConfirmModal
                open={revokeTarget !== null}
                title="Revoke this entrusted item?"
                description="This will mark the entrusted assignment as returned and release the unit from the employee dashboard."
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
                            Unit: <span className="font-mono text-foreground">{revokeTarget.serial_number || revokeTarget.unit_id}</span>
                        </p>
                        <p>
                            Item: <span className="font-semibold text-foreground">{revokeTarget.item_name || 'Unknown Item'}</span>
                        </p>
                    </div>
                ) : null}
            />
        </div>
    );
}
