'use client';

import { useState, useRef, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  Upload,
  FileSpreadsheet,
  RefreshCcw,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ArrowRight,
  ArrowLeft,
  Eye,
  FileBarChart,
} from 'lucide-react';
import {
  useImportPreview,
  usePreviewRows,
  usePreviewSummary,
  useEditRow,
  useApplyImport,
  useDownloadCorrectedCsv,
  useDownloadTemplate,
  useAcceptRecommended,
  useSetRowAction,
  useIgnoreAllBlockers,
} from '../lib/useImportExport';
import type { PreviewSummary, PreviewRow } from '../lib/types';

type Step = 'upload' | 'review' | 'confirm' | 'done';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  category: 'Category',
  classification: 'Classification',
  item_type: 'Item Type',
  is_trackable: 'Trackable',
  description: 'Description',
  condition: 'Condition',
  quantity: 'Quantity',
  serial_number: 'Serial #',
  expiration_date: 'Expiry',
};

const STATUS_STYLES: Record<string, string> = {
  ready: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  error: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${STATUS_STYLES[status] || 'bg-muted/10 text-muted-foreground border-border'}`}
    >
      {status === 'ready' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'warning' && <AlertTriangle className="w-3 h-3" />}
      {status === 'error' && <XCircle className="w-3 h-3" />}
      {status === 'info' && <Info className="w-3 h-3" />}
      {status}
    </span>
  );
}

function PreviewModal({
  step,
  setStep,
  setPreviewId,
  summary,
  setSummary,
  page,
  setPage,
  perPage,
  filterStatus,
  setFilterStatus,
  selectedRow,
  setSelectedRow,
  editingCell,
  setEditingCell,
  rows,
  rowsLoading,
  refetchRows,
  editRowMutation,
  applyMutation,
  downloadCsvMutation,
  rowsMeta,
  acceptRecommendedMutation,
  setRowActionMutation,
  ignoreAllBlockersMutation,
  selectedGroupKey,
  setSelectedGroupKey,
}: {
  step: Step;
  setStep: (s: Step) => void;
  setPreviewId: (id: string | null) => void;
  summary: PreviewSummary | null;
  setSummary: Dispatch<SetStateAction<PreviewSummary | null>>;
  page: number;
  setPage: (p: number) => void;
  perPage: number;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  selectedRow: number | null;
  setSelectedRow: (r: number | null) => void;
  editingCell: { row: number; field: string } | null;
  setEditingCell: (c: { row: number; field: string } | null) => void;
  rows: PreviewRow[];
  rowsLoading: boolean;
  refetchRows: () => void;
  editRowMutation: ReturnType<typeof useEditRow>;
  applyMutation: ReturnType<typeof useApplyImport>;
  downloadCsvMutation: ReturnType<typeof useDownloadCorrectedCsv>;
  rowsMeta: { total: number; limit: number; offset: number } | null | undefined;
  acceptRecommendedMutation: ReturnType<typeof useAcceptRecommended>;
  setRowActionMutation: ReturnType<typeof useSetRowAction>;
  ignoreAllBlockersMutation: ReturnType<typeof useIgnoreAllBlockers>;
  selectedGroupKey: string | null;
  setSelectedGroupKey: (k: string | null) => void;
}) {
  const hasUnresolvedBlockers = (summary?.unresolved_blocker_count ?? 0) > 0;
  const handleClose = () => {
    setStep('upload');
    setPreviewId(null);
    setSummary(null);
    setPage(1);
    setFilterStatus('all');
    setSelectedRow(null);
  };

  const handleCellEdit = (rowNumber: number, field: string, value: string) => {
    editRowMutation.mutate(
      { rowNumber, updates: { [field]: value } },
      { onSuccess: () => refetchRows() },
    );
    setEditingCell(null);
  };

  const handleApply = () => {
    applyMutation.mutate(undefined, {
      onSuccess: (data) => {
        setSummary((prev) => (prev ? { ...prev, can_apply: false } : null));
        if (data.status === 'completed') setStep('done');
      },
    });
  };

  const handleRowAction = (rowNumber: number, action: string) => {
    setRowActionMutation.mutate(
      { rowNumber, action },
      { onSuccess: () => refetchRows() },
    );
  };

  const handleAcceptRecommended = () => {
    acceptRecommendedMutation.mutate(undefined, { onSuccess: () => refetchRows() });
  };

  const fileIssues = summary?.file_issues || [];
  const hasBlockingErrors = fileIssues.some((i) => i.severity === 'error') || !summary?.can_apply;

  const statusCounts = useMemo(() => {
    return {
      all: summary?.total_rows || 0,
      ready: summary?.ready_count || 0,
      warning: summary?.warning_count || 0,
      error: summary?.error_count || 0,
      info: summary?.info_count || 0,
    };
  }, [summary]);

  const selectedRowData = useMemo(() => {
    if (selectedRow === null) return null;
    return rows.find((r) => r.row_number === selectedRow) || null;
  }, [selectedRow, rows]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-[95vw] bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200">

        {/* Modal Header */}
        <div className="flex flex-row items-center gap-4 p-6 border-b border-border/50">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Eye className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold">
              Import Preview{summary ? ` — ${summary.filename}` : ''}
            </h3>
            <p className="text-xs text-muted-foreground">
              Review and fix issues before applying.{' '}
              {summary && `Mode: ${summary.mode}, Delimiter: '${summary.delimiter}'`}
            </p>
          </div>
          <button
            onClick={handleClose}
            type="button"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Close preview"
          >
            <XCircle className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Summary Strip */}
        <div className="border-b border-border/50 bg-muted/5 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'ready', 'warning', 'error', 'info'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); setPage(1); }}
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border capitalize transition-all ${
                  filterStatus === s
                    ? (s === 'error' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                      : s === 'warning' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : s === 'info' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      : s === 'ready' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-primary/10 text-primary border-primary/20')
                    : 'bg-card text-muted-foreground border-border/50 hover:bg-muted'
                }`}
              >
                {s === 'all' && <FileBarChart className="w-3 h-3" />}
                {s === 'ready' && <CheckCircle2 className="w-3 h-3" />}
                {s === 'warning' && <AlertTriangle className="w-3 h-3" />}
                {s === 'error' && <XCircle className="w-3 h-3" />}
                {s === 'info' && <Info className="w-3 h-3" />}
                {s.charAt(0).toUpperCase() + s.slice(1)}{' '}
                <span className="opacity-60">({statusCounts[s]})</span>
              </button>
            ))}
          </div>

          {/* Duplicate Group Cards */}
          {summary?.duplicate_groups && summary.duplicate_groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border/30">
              {summary.duplicate_groups.map((g) => (
                <button
                  key={g.key}
                  onClick={() => {
                    if (selectedGroupKey === g.key) {
                      setSelectedGroupKey(null);
                      if (g.requires_user_decision) setFilterStatus('needs_review');
                      else setFilterStatus('all');
                    } else {
                      setSelectedGroupKey(g.key);
                      setFilterStatus('all');
                    }
                    setPage(1);
                  }}
                  type="button"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                    selectedGroupKey === g.key
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : g.severity === 'error'
                        ? 'bg-rose-500/5 text-rose-600 border-rose-500/20 hover:bg-rose-500/10'
                        : g.severity === 'warning'
                          ? 'bg-amber-500/5 text-amber-600 border-amber-500/20 hover:bg-amber-500/10'
                          : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted'
                  }`}
                  title={g.label}
                >
                  {g.requires_user_decision && <AlertTriangle className="w-2.5 h-2.5" />}
                  {g.label.split(' · ')[0]} ({g.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* File-level issues */}
        {fileIssues.length > 0 && (
          <div className="px-6 py-3 border-b border-border/50 space-y-1 bg-muted/5">
            {fileIssues.map((issue, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                  issue.severity === 'error' ? 'bg-rose-500/5 text-rose-600' : 'bg-amber-500/5 text-amber-600'
                }`}
              >
                {issue.severity === 'error'
                  ? <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-2 text-xs font-bold border-b border-border/50">
          <span className={step === 'review' ? 'text-primary' : 'text-muted-foreground'}>1. Review</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <span className={`${step === 'confirm' || step === 'done' ? 'text-primary' : 'text-muted-foreground'} ${step === 'done' ? 'hidden' : ''}`}>
            2. Confirm
          </span>
          {step === 'done' && (
            <>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-emerald-500">Complete</span>
            </>
          )}
        </div>

        {/* Preview Table */}
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="p-3 pl-6 w-14">Row</th>
                <th className="p-3 w-20">Status</th>
                <th className="p-3 w-16">Action</th>
                {summary?.headers.map((h) => (
                  <th key={h} className="p-3 min-w-[100px]">{FIELD_LABELS[h] || h}</th>
                ))}
                <th className="p-3 pr-6 min-w-[200px]">Interpretation</th>
                <th className="p-3 pr-6 w-[100px]">Decide</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rowsLoading ? (
                <tr>
                  <td
                    colSpan={4 + (summary?.headers.length || 0) + 1}
                    className="p-12 text-center text-muted-foreground"
                  >
                    <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading preview...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + (summary?.headers.length || 0) + 1}
                    className="p-12 text-center text-muted-foreground italic"
                  >
                    No rows match the selected filter.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3 + (summary?.headers.length || 0) + 1} className="p-12 text-center text-muted-foreground italic">
                    No rows match the selected filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.row_number}
                    onClick={() => setSelectedRow(selectedRow === row.row_number ? null : row.row_number)}
                    className={`cursor-pointer transition-colors ${
                      selectedRow === row.row_number
                        ? 'bg-primary/5 ring-1 ring-primary/20'
                        : row.status === 'error' ? 'bg-rose-500/5 hover:bg-rose-500/10'
                        : row.status === 'warning' ? 'bg-amber-500/5 hover:bg-amber-500/10'
                        : row.status === 'info' ? 'bg-blue-500/5 hover:bg-blue-500/10'
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="p-3 pl-6 font-mono font-bold text-muted-foreground">{row.row_number}</td>
                    <td className="p-3"><StatusBadge status={row.status} /></td>
                    <td className="p-3 text-[10px] font-bold text-muted-foreground">
                      {row.action ? row.action.replace(/_/g, ' ') : '—'}
                    </td>
                    {summary?.headers.map((h) => (
                      <td
                        key={h}
                        className="p-3 font-mono text-[11px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (step === 'done') return;
                          setEditingCell({ row: row.row_number, field: h });
                        }}
                      >
                        {editingCell?.row === row.row_number && editingCell?.field === h ? (
                          <input
                            type="text"
                            className="w-full px-2 py-1 rounded border border-primary text-[11px] bg-background"
                            defaultValue={row.normalized_values[h] || ''}
                            onBlur={(e) => handleCellEdit(row.row_number, h, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCellEdit(row.row_number, h, e.currentTarget.value);
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={`block max-w-[150px] truncate ${
                              row.status === 'error' && row.issues.some((i) => i.field === h)
                                ? 'text-rose-500 line-through decoration-rose-400'
                                : row.status === 'warning' && row.issues.some((i) => i.field === h)
                                  ? 'text-amber-500'
                                  : ''
                            }`}
                          >
                            {row.normalized_values[h] || <span className="text-muted-foreground/30">—</span>}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="p-3 pr-6 text-[10px] text-muted-foreground leading-relaxed max-w-[250px]">
                      {row.stock_interpretation}
                    </td>
                    <td className="p-3 pr-6">
                      {row.requires_user_decision && step !== 'done' ? (
                        <div className="flex flex-col gap-1">
                          {row.duplicate_type === 'existing_serial' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRowAction(row.row_number, 'ignore'); }}
                                type="button"
                                className="px-2 py-0.5 rounded text-[9px] font-bold bg-muted hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border/50 transition-colors"
                              >
                                Keep existing
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRowAction(row.row_number, 'update_metadata'); }}
                                type="button"
                                className="px-2 py-0.5 rounded text-[9px] font-bold bg-muted hover:bg-amber-500/10 text-muted-foreground hover:text-amber-500 border border-border/50 transition-colors"
                              >
                                Update
                              </button>
                            </>
                          )}
                          {row.duplicate_type === 'existing_item' && row.duplicate_subtype === 'conflicting_change' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRowAction(row.row_number, 'ignore'); }}
                                type="button"
                                className="px-2 py-0.5 rounded text-[9px] font-bold bg-muted hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border/50 transition-colors"
                              >
                                Ignore
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRowAction(row.row_number, 'update_metadata'); }}
                                type="button"
                                className="px-2 py-0.5 rounded text-[9px] font-bold bg-muted hover:bg-amber-500/10 text-muted-foreground hover:text-amber-500 border border-border/50 transition-colors"
                              >
                                Override
                              </button>
                            </>
                          )}
                          {(row.duplicate_type === 'duplicate_in_file' || !row.duplicate_type) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRowAction(row.row_number, 'ignore'); }}
                              type="button"
                              className="px-2 py-0.5 rounded text-[9px] font-bold bg-muted hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border/50 transition-colors"
                            >
                              Ignore
                            </button>
                          )}
                        </div>
                      ) : row.selected_action ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          {row.selected_action.replace(/_/g, ' ')}
                        </span>
                      ) : row.duplicate_type && row.duplicate_type !== 'none' ? (
                        <span className="text-[9px] text-muted-foreground">—</span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Selected row detail */}
        {selectedRowData && (
          <div className="border-t border-border/50 bg-muted/5 px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Row {selectedRowData.row_number} Details
              </h4>
              <button onClick={() => setSelectedRow(null)} type="button" className="text-xs text-muted-foreground hover:text-foreground">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            {selectedRowData.issues.length === 0 ? (
              <p className="text-xs text-muted-foreground">No issues detected. Row is ready to import.</p>
            ) : (
              <div className="space-y-1.5">
                {selectedRowData.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                      issue.severity === 'error' ? 'bg-rose-500/5 text-rose-600'
                        : issue.severity === 'warning' ? 'bg-amber-500/5 text-amber-600'
                        : 'bg-blue-500/5 text-blue-600'
                    }`}
                  >
                    {issue.severity === 'error' && <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    {issue.severity === 'warning' && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    {issue.severity === 'info' && <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    <div><span className="font-bold">{issue.field}:</span> {issue.message}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 p-3 rounded-xl bg-background border border-border">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">What will happen</p>
              <p className="text-xs text-foreground">{selectedRowData.stock_interpretation}</p>
            </div>
          </div>
        )}

        {/* Pagination */}
        {rowsMeta && rowsMeta.total > perPage && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, rowsMeta.total)} of {rowsMeta.total}
            </span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg hover:bg-muted disabled:opacity-30">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold">Page {page}</span>
              <button disabled={page * perPage >= rowsMeta.total} onClick={() => setPage(page + 1)} className="p-2 rounded-lg hover:bg-muted disabled:opacity-30">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-border/50 flex items-center justify-between">
          {step === 'done' ? (
            <>
              <p className="text-xs text-muted-foreground">Import completed successfully.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadCsvMutation.mutate()}
                  disabled={downloadCsvMutation.isPending}
                  type="button"
                  className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-bold hover:bg-muted/80 transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadCsvMutation.isPending ? 'Downloading...' : 'Download Corrected CSV'}
                </button>
                <button onClick={handleClose} type="button" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90">
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadCsvMutation.mutate()}
                  disabled={downloadCsvMutation.isPending}
                  type="button"
                  className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-bold hover:bg-muted/80 transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3 h-3" />
                  {downloadCsvMutation.isPending ? 'Downloading...' : 'Download Corrected CSV'}
                </button>
                {summary && summary.auto_resolved_count > 0 && (
                  <button
                    onClick={handleAcceptRecommended}
                    disabled={acceptRecommendedMutation.isPending}
                    type="button"
                    className="px-3 py-1.5 bg-blue-500/10 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-500/20 transition-colors flex items-center gap-1.5 border border-blue-500/20"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Accept Recommended ({summary.auto_resolved_count})
                  </button>
                )}
                {hasUnresolvedBlockers && (
                  <button
                    onClick={() => ignoreAllBlockersMutation.mutate(undefined, { onSuccess: () => refetchRows() })}
                    disabled={ignoreAllBlockersMutation.isPending}
                    type="button"
                    className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-bold hover:bg-rose-500/10 hover:text-rose-500 transition-colors flex items-center gap-1.5"
                  >
                    <XCircle className="w-3 h-3" />
                    {ignoreAllBlockersMutation.isPending
                      ? 'Ignoring...'
                      : `Ignore All (${summary?.unresolved_blocker_count ?? 0})`}
                  </button>
                )}
              </div>
              <button
                onClick={handleApply}
                disabled={hasBlockingErrors || hasUnresolvedBlockers || applyMutation.isPending}
                type="button"
                className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  hasBlockingErrors || hasUnresolvedBlockers
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
                }`}
              >
                {hasUnresolvedBlockers ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {summary?.unresolved_blocker_count ?? 0} Decisions Needed
                  </>
                ) : applyMutation.isPending ? (
                  <>
                    <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Apply Import
                  </>
                )}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

export function ImportPreviewCard() {
  const [step, setStep] = useState<Step>('upload');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useImportPreview();
  const { data: rowsResponse, isLoading: rowsLoading, refetch: refetchRows } = usePreviewRows(previewId, page, perPage, filterStatus, selectedGroupKey);
  const { data: freshSummary } = usePreviewSummary(previewId);
  const effectiveSummary = freshSummary || summary;
  const editRowMutation = useEditRow(previewId);
  const applyMutation = useApplyImport(previewId);
  const downloadCsvMutation = useDownloadCorrectedCsv(previewId);
  const { downloadTemplate } = useDownloadTemplate();
  const acceptRecommendedMutation = useAcceptRecommended(previewId);
  const setRowActionMutation = useSetRowAction(previewId);
  const ignoreAllBlockersMutation = useIgnoreAllBlockers(previewId);

  const rows = rowsResponse?.data || [];
  const rowsMeta = rowsResponse?.meta;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    previewMutation.mutate(
      { file, mode: 'skip' },
      {
        onSuccess: (data) => {
          setSummary(data);
          setPreviewId(data.preview_id);
          setStep('review');
          setPage(1);
          setFilterStatus(data.unresolved_blocker_count > 0 ? 'needs_review' : data.error_count > 0 ? 'error' : 'all');
          setSelectedGroupKey(null);
          setSelectedRow(null);
        },
      },
    );
  };

  return (
    <>
      <div className="flex flex-col rounded-xl border bg-card text-card-foreground shadow">
        <div className="flex flex-row items-center gap-4 p-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Import Inventory Catalog</h3>
            <p className="text-xs text-muted-foreground">Upload CSV files to preview, fix issues, and bulk import inventory items.</p>
          </div>
        </div>
        <div className="flex-1 space-y-6 p-6 pt-0">
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-4 bg-muted/10 hover:bg-muted/20 transition-all cursor-pointer group ${previewMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileSelect} />
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:scale-110 transition-transform">
              {previewMutation.isPending ? <RefreshCcw className="w-8 h-8 animate-spin" /> : <FileSpreadsheet className="w-8 h-8" />}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">{previewMutation.isPending ? 'Analyzing...' : 'Click to upload CSV'}</p>
              <p className="text-xs text-muted-foreground mt-1">You will preview and fix issues before importing.</p>
            </div>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
              disabled={previewMutation.isPending}
              type="button"
            >
                {previewMutation.isPending ? 'Analyzing...' : 'Select File'}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Download CSV Template</p>
                <p className="text-xs text-muted-foreground">Standardized template for bulk imports.</p>
              </div>
            </div>
            <button onClick={downloadTemplate} type="button" className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90">
              Download
            </button>
          </div>
        </div>
      </div>

      {step !== 'upload' && (
        <PreviewModal
          step={step}
          setStep={setStep}
          setPreviewId={setPreviewId}
          summary={effectiveSummary}
          setSummary={setSummary}
          page={page}
          setPage={setPage}
          perPage={perPage}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          selectedRow={selectedRow}
          setSelectedRow={setSelectedRow}
          editingCell={editingCell}
          setEditingCell={setEditingCell}
          rows={rows}
          rowsLoading={rowsLoading}
          refetchRows={refetchRows}
          editRowMutation={editRowMutation}
          applyMutation={applyMutation}
          downloadCsvMutation={downloadCsvMutation}
          rowsMeta={rowsMeta}
          acceptRecommendedMutation={acceptRecommendedMutation}
          setRowActionMutation={setRowActionMutation}
          ignoreAllBlockersMutation={ignoreAllBlockersMutation}
          selectedGroupKey={selectedGroupKey}
          setSelectedGroupKey={setSelectedGroupKey}
        />
      )}
    </>
  );
}
