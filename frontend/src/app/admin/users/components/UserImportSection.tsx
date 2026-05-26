'use client';

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  FileBarChart,
  FileSpreadsheet,
  History,
  Info,
  RefreshCcw,
  Upload,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAcceptUserImportRecommended,
  useApplyUserImport,
  useDownloadCorrectedUserImportCsv,
  useDownloadUserImportCredentialsFromHistory,
  useDownloadUserImportTemplate,
  useEditUserImportRow,
  useIgnoreAllUserImportBlockers,
  useSetUserImportRowAction,
  useUserImportHistory,
  useUserImportPreview,
  useUserPreviewRows,
  useUserPreviewSummary,
} from '../lib/useUserImport';
import type {
  UserImportApplyResult,
  UserImportHistoryErrorLogEntry,
  UserImportHistoryItem,
  UserImportPreviewRow,
  UserImportPreviewSummary,
} from '../api';

type Step = 'upload' | 'review' | 'done';

const FIELD_LABELS: Record<string, string> = {
  employee_id: 'Employee ID',
  first_name: 'First Name',
  last_name: 'Last Name',
  middle_name: 'Middle Name',
  email: 'Email',
  contact_number: 'Contact #',
  role: 'Role',
  shift_type: 'Shift',
};

const STATUS_STYLES: Record<string, string> = {
  ready: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  error: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${STATUS_STYLES[status] || 'bg-muted/10 text-muted-foreground border-border'}`}>
      {status === 'ready' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'warning' && <AlertTriangle className="w-3 h-3" />}
      {status === 'error' && <XCircle className="w-3 h-3" />}
      {status === 'info' && <Info className="w-3 h-3" />}
      {status}
    </span>
  );
}

function UserImportPreviewModal({
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
  downloadCredentialsFromHistoryMutation,
  completedHistoryId,
  completedHasCredentialsDownload,
  setCompletedHistoryId,
  setCompletedHasCredentialsDownload,
  rowsMeta,
  acceptRecommendedMutation,
  setRowActionMutation,
  ignoreAllBlockersMutation,
  selectedGroupKey,
  setSelectedGroupKey,
}: {
  step: Step;
  setStep: (step: Step) => void;
  setPreviewId: (previewId: string | null) => void;
  summary: UserImportPreviewSummary | null;
  setSummary: Dispatch<SetStateAction<UserImportPreviewSummary | null>>;
  page: number;
  setPage: (page: number) => void;
  perPage: number;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  selectedRow: number | null;
  setSelectedRow: (row: number | null) => void;
  editingCell: { row: number; field: string } | null;
  setEditingCell: (cell: { row: number; field: string } | null) => void;
  rows: UserImportPreviewRow[];
  rowsLoading: boolean;
  refetchRows: () => void;
  editRowMutation: ReturnType<typeof useEditUserImportRow>;
  applyMutation: ReturnType<typeof useApplyUserImport>;
  downloadCsvMutation: ReturnType<typeof useDownloadCorrectedUserImportCsv>;
  downloadCredentialsFromHistoryMutation: ReturnType<typeof useDownloadUserImportCredentialsFromHistory>;
  completedHistoryId: string | null;
  completedHasCredentialsDownload: boolean;
  setCompletedHistoryId: (historyId: string | null) => void;
  setCompletedHasCredentialsDownload: (value: boolean) => void;
  rowsMeta: { total: number; limit: number; offset: number } | null | undefined;
  acceptRecommendedMutation: ReturnType<typeof useAcceptUserImportRecommended>;
  setRowActionMutation: ReturnType<typeof useSetUserImportRowAction>;
  ignoreAllBlockersMutation: ReturnType<typeof useIgnoreAllUserImportBlockers>;
  selectedGroupKey: string | null;
  setSelectedGroupKey: (key: string | null) => void;
}) {
  const handleClose = () => {
    setStep('upload');
    setPreviewId(null);
    setSummary(null);
    setPage(1);
    setFilterStatus('all');
    setSelectedRow(null);
    setSelectedGroupKey(null);
    setCompletedHistoryId(null);
    setCompletedHasCredentialsDownload(false);
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
      onSuccess: (data: UserImportApplyResult) => {
        setSummary((prev) => (prev ? { ...prev, can_apply: false } : null));
        setCompletedHistoryId(data.history_id);
        setCompletedHasCredentialsDownload(data.has_credentials_download);
        if (data.status === 'completed' || data.status === 'partial_success') {
          setStep('done');
        }
      },
    });
  };

  const statusCounts = useMemo(() => ({
    all: summary?.total_rows || 0,
    ready: summary?.ready_count || 0,
    warning: summary?.warning_count || 0,
    error: summary?.error_count || 0,
    info: summary?.info_count || 0,
  }), [summary]);

  const selectedRowData = useMemo(() => {
    if (selectedRow === null) return null;
    return rows.find((row) => row.row_number === selectedRow) || null;
  }, [rows, selectedRow]);

  const hasBlockingErrors = Boolean(summary?.file_issues.some((issue) => issue.severity === 'error')) || !summary?.can_apply;
  const hasUnresolvedBlockers = (summary?.unresolved_blocker_count ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-[95vw] bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200">
        <div className="flex flex-row items-center gap-4 p-6 border-b border-border/50">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Eye className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold">
              Import Preview{summary ? ` — ${summary.filename}` : ''}
            </h3>
            <p className="text-xs text-muted-foreground">
              Review and fix issues before applying. {summary && `Delimiter: '${summary.delimiter}'`}
            </p>
          </div>
          <button onClick={handleClose} type="button" className="p-2 rounded-lg hover:bg-muted transition-colors" title="Close preview">
            <XCircle className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="border-b border-border/50 bg-muted/5 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'ready', 'warning', 'error', 'info'] as const).map((status) => (
              <button
                key={status}
                onClick={() => { setFilterStatus(status); setPage(1); }}
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border capitalize transition-all ${
                  filterStatus === status
                    ? (status === 'error' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                      : status === 'warning' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : status === 'info' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      : status === 'ready' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-primary/10 text-primary border-primary/20')
                    : 'bg-card text-muted-foreground border-border/50 hover:bg-muted'
                }`}
              >
                {status === 'all' && <FileBarChart className="w-3 h-3" />}
                {status === 'ready' && <CheckCircle2 className="w-3 h-3" />}
                {status === 'warning' && <AlertTriangle className="w-3 h-3" />}
                {status === 'error' && <XCircle className="w-3 h-3" />}
                {status === 'info' && <Info className="w-3 h-3" />}
                {status} <span className="opacity-60">({statusCounts[status]})</span>
              </button>
            ))}
          </div>

          {summary?.duplicate_groups && summary.duplicate_groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border/30">
              {summary.duplicate_groups.map((group) => (
                <button
                  key={group.key}
                  onClick={() => {
                    if (selectedGroupKey === group.key) {
                      setSelectedGroupKey(null);
                      setFilterStatus(group.requires_user_decision ? 'needs_review' : 'all');
                    } else {
                      setSelectedGroupKey(group.key);
                      setFilterStatus('all');
                    }
                    setPage(1);
                  }}
                  type="button"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                    selectedGroupKey === group.key
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : group.severity === 'error'
                        ? 'bg-rose-500/5 text-rose-600 border-rose-500/20 hover:bg-rose-500/10'
                        : group.severity === 'warning'
                          ? 'bg-amber-500/5 text-amber-600 border-amber-500/20 hover:bg-amber-500/10'
                          : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted'
                  }`}
                >
                  {group.requires_user_decision && <AlertTriangle className="w-2.5 h-2.5" />}
                  {group.label} ({group.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {summary?.file_issues && summary.file_issues.length > 0 && (
          <div className="px-6 py-3 border-b border-border/50 space-y-1 bg-muted/5">
            {summary.file_issues.map((issue, index) => (
              <div
                key={`${issue.code}-${index}`}
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

        <div className="flex items-center gap-2 px-6 py-2 text-xs font-bold border-b border-border/50">
          <span className={step === 'review' ? 'text-primary' : 'text-muted-foreground'}>1. Review</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <span className={step === 'done' ? 'text-emerald-500' : 'text-muted-foreground'}>2. Complete</span>
        </div>

        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="p-3 pl-6 w-14">Row</th>
                <th className="p-3 w-20">Status</th>
                <th className="p-3 w-16">Action</th>
                {summary?.headers.map((header) => (
                  <th key={header} className="p-3 min-w-[100px]">{FIELD_LABELS[header] || header}</th>
                ))}
                <th className="p-3 pr-6 min-w-[240px]">Interpretation</th>
                <th className="p-3 pr-6 w-[140px]">Decide</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rowsLoading ? (
                <tr>
                  <td colSpan={4 + (summary?.headers.length || 0) + 2} className="p-12 text-center text-muted-foreground">
                    <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading preview...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4 + (summary?.headers.length || 0) + 2} className="p-12 text-center text-muted-foreground italic">
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
                    {summary?.headers.map((header) => (
                      <td
                        key={`${row.row_number}-${header}`}
                        className="p-3 font-mono text-[11px]"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (step === 'done') return;
                          setEditingCell({ row: row.row_number, field: header });
                        }}
                      >
                        {editingCell?.row === row.row_number && editingCell?.field === header ? (
                          <input
                            type="text"
                            className="w-full px-2 py-1 rounded border border-primary text-[11px] bg-background"
                            defaultValue={row.resolved_values[header] || ''}
                            onBlur={(event) => handleCellEdit(row.row_number, header, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') handleCellEdit(row.row_number, header, event.currentTarget.value);
                              if (event.key === 'Escape') setEditingCell(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className={`block max-w-[180px] truncate ${
                            row.issues.some((issue) => issue.field === header && issue.severity === 'error')
                              ? 'text-rose-500'
                              : row.issues.some((issue) => issue.field === header && issue.severity === 'warning')
                                ? 'text-amber-500'
                                : ''
                          }`}>
                            {row.resolved_values[header] || <span className="text-muted-foreground/30">—</span>}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="p-3 pr-6 text-[10px] text-muted-foreground leading-relaxed max-w-[240px]">
                      {row.stock_interpretation}
                      {row.target_match_summary ? (
                        <span className="block mt-1 text-foreground/70">Target: {row.target_match_summary}</span>
                      ) : null}
                    </td>
                    <td className="p-3 pr-6">
                      {row.requires_user_decision && step !== 'done' ? (
                        <div className="flex flex-col gap-1">
                          {row.duplicate_subtype === 'soft_deleted' ? (
                            <>
                              <button
                                onClick={(event) => { event.stopPropagation(); setRowActionMutation.mutate({ rowNumber: row.row_number, action: 'restore_and_update' }, { onSuccess: () => refetchRows() }); }}
                                type="button"
                                className="px-2 py-0.5 rounded text-[9px] font-bold bg-muted hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600 border border-border/50 transition-colors"
                              >
                                Restore & update
                              </button>
                              <button
                                onClick={(event) => { event.stopPropagation(); setRowActionMutation.mutate({ rowNumber: row.row_number, action: 'ignore' }, { onSuccess: () => refetchRows() }); }}
                                type="button"
                                className="px-2 py-0.5 rounded text-[9px] font-bold bg-muted hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border/50 transition-colors"
                              >
                                Ignore
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(event) => { event.stopPropagation(); setRowActionMutation.mutate({ rowNumber: row.row_number, action: 'ignore' }, { onSuccess: () => refetchRows() }); }}
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
                      ) : row.recommended_action === 'update_metadata' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                          Update
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
                {selectedRowData.issues.map((issue, index) => (
                  <div
                    key={`${issue.code}-${index}`}
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

        <div className="p-4 border-t border-border/50 flex items-center justify-between">
          {step === 'done' ? (
            <>
              <p className="text-xs text-muted-foreground">
                {completedHasCredentialsDownload
                  ? 'Import finished. You can download the corrected CSV and generated credentials.'
                  : 'Import finished. No new credentials were generated for this import, so only the corrected CSV is available.'}
              </p>
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
                <button
                  onClick={() => {
                    if (completedHistoryId && completedHasCredentialsDownload) {
                      downloadCredentialsFromHistoryMutation.mutate(completedHistoryId);
                    }
                  }}
                  disabled={!completedHistoryId || !completedHasCredentialsDownload || downloadCredentialsFromHistoryMutation.isPending}
                  type="button"
                  className="px-4 py-2 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-colors flex items-center gap-1.5 border border-primary/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadCredentialsFromHistoryMutation.isPending ? 'Downloading...' : 'Download Credentials'}
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
                    onClick={() => acceptRecommendedMutation.mutate(undefined, { onSuccess: () => refetchRows() })}
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
                    {ignoreAllBlockersMutation.isPending ? 'Ignoring...' : `Ignore All (${summary?.unresolved_blocker_count ?? 0})`}
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

function UserImportPreviewCard() {
  const [step, setStep] = useState<Step>('upload');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserImportPreviewSummary | null>(null);
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const [completedHistoryId, setCompletedHistoryId] = useState<string | null>(null);
  const [completedHasCredentialsDownload, setCompletedHasCredentialsDownload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useUserImportPreview();
  const { data: rowsResponse, isLoading: rowsLoading, refetch: refetchRows } = useUserPreviewRows(previewId, page, perPage, filterStatus, selectedGroupKey);
  const { data: freshSummary } = useUserPreviewSummary(previewId);
  const effectiveSummary = freshSummary || summary;
  const editRowMutation = useEditUserImportRow(previewId);
  const applyMutation = useApplyUserImport(previewId);
  const downloadCsvMutation = useDownloadCorrectedUserImportCsv(previewId);
  const downloadCredentialsFromHistoryMutation = useDownloadUserImportCredentialsFromHistory();
  const { downloadTemplate } = useDownloadUserImportTemplate();
  const acceptRecommendedMutation = useAcceptUserImportRecommended(previewId);
  const setRowActionMutation = useSetUserImportRowAction(previewId);
  const ignoreAllBlockersMutation = useIgnoreAllUserImportBlockers(previewId);

  const rows = rowsResponse?.data || [];
  const rowsMeta = rowsResponse?.meta;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    previewMutation.mutate(
      { file, mode: 'skip' },
      {
        onSuccess: (data) => {
          setSummary(data);
          setPreviewId(data.preview_id);
          setCompletedHistoryId(null);
          setCompletedHasCredentialsDownload(false);
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
            <h3 className="text-lg font-bold">Import Users</h3>
            <p className="text-xs text-muted-foreground">Upload CSV files to preview, fix issues, and bulk import user accounts.</p>
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
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors" disabled={previewMutation.isPending} type="button">
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
                <p className="text-xs text-muted-foreground">Standardized template for bulk user imports.</p>
              </div>
            </div>
            <button onClick={downloadTemplate} type="button" className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90">
              Download
            </button>
          </div>
        </div>
      </div>

      {step !== 'upload' && (
        <UserImportPreviewModal
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
          refetchRows={() => { void refetchRows(); }}
          editRowMutation={editRowMutation}
          applyMutation={applyMutation}
          downloadCsvMutation={downloadCsvMutation}
          downloadCredentialsFromHistoryMutation={downloadCredentialsFromHistoryMutation}
          completedHistoryId={completedHistoryId}
          completedHasCredentialsDownload={completedHasCredentialsDownload}
          setCompletedHistoryId={setCompletedHistoryId}
          setCompletedHasCredentialsDownload={setCompletedHasCredentialsDownload}
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

export function UserImportSection() {
  const [page, setPage] = useState(1);
  const perPage = 5;
  const [selectedHistory, setSelectedHistory] = useState<UserImportHistoryItem | null>(null);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const { data: historyResponse, isLoading: historyLoading } = useUserImportHistory(page, perPage);
  const downloadCredentialsFromHistoryMutation = useDownloadUserImportCredentialsFromHistory();

  const importHistory = historyResponse?.data || [];
  const meta = historyResponse?.meta;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <UserImportPreviewCard />

      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <History className="w-6 h-6" />
          </div>
          <div>
            <CardTitle>Import History</CardTitle>
            <CardDescription>Review and track the status of recent user imports.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/50 text-muted-foreground bg-muted/5 font-semibold">
                <tr>
                  <th className="p-4 pl-6">Date</th>
                  <th className="p-4">File Name</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {historyLoading ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-muted-foreground">
                      <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading history...
                    </td>
                  </tr>
                ) : importHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-4 pl-6 text-muted-foreground font-mono">{item.created_at}</td>
                    <td className="p-4 font-semibold">{item.filename}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border capitalize ${item.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : item.status === 'failed'
                          ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                          : 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                        }`}>
                        {item.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {item.has_credentials_download && (
                          <button
                            onClick={() => downloadCredentialsFromHistoryMutation.mutate(item.id)}
                            className="text-xs text-primary hover:underline font-bold"
                          >
                            Download Credentials
                          </button>
                        )}
                        {(item.status === 'failed' || item.status === 'partial_success' || item.error_count > 0) && (
                          <button
                            onClick={() => {
                              setSelectedHistory(item);
                              setIsErrorModalOpen(true);
                            }}
                            className="text-xs text-rose-500 hover:underline font-bold"
                          >
                            View Errors
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!historyLoading && importHistory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-muted-foreground italic">No import history found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        <CardFooter className="p-6 border-t border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg hover:bg-muted disabled:opacity-30">
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>
            <span className="text-xs font-bold">Page {page}</span>
            <button disabled={!meta || page * perPage >= meta.total} onClick={() => setPage(page + 1)} className="p-2 rounded-lg hover:bg-muted disabled:opacity-30">
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </CardFooter>
      </Card>

      {isErrorModalOpen && selectedHistory && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between bg-rose-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-rose-600">Import Error Report</h3>
                  <p className="text-xs text-muted-foreground">Detailed logs for <span className="font-bold text-foreground">{selectedHistory.filename}</span></p>
                </div>
              </div>
              <button onClick={() => setIsErrorModalOpen(false)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-border">
              <div className="p-6 bg-rose-500/5 border-b border-rose-500/10 mb-2">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-2xl bg-background border border-border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Rows</p>
                    <p className="text-xl font-bold">{selectedHistory.total_rows}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-background border border-emerald-500/20">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Success</p>
                    <p className="text-xl font-bold text-emerald-600">{selectedHistory.success_count}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-background border border-rose-500/20">
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Failed</p>
                    <p className="text-xl font-bold text-rose-600">{selectedHistory.error_count}</p>
                  </div>
                </div>
              </div>

              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="p-4 pl-6 w-20">Row</th>
                    <th className="p-4 w-1/3">Error Message</th>
                    <th className="p-4 pr-6">Offending Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {Array.isArray(selectedHistory.error_log) && selectedHistory.error_log.map((error: UserImportHistoryErrorLogEntry, index: number) => (
                    <tr key={index} className="hover:bg-muted/30 transition-colors align-top">
                      <td className="p-4 pl-6 font-mono font-bold text-rose-500">{error.row ?? '-'}</td>
                      <td className="p-4 text-sm font-medium text-foreground leading-relaxed">
                        {error.error ?? 'Unknown error'}
                      </td>
                      <td className="p-4 pr-6">
                        <div className="p-3 rounded-xl bg-muted/30 font-mono text-[10px] text-muted-foreground break-all max-h-32 overflow-y-auto">
                          {error.data ? JSON.stringify(error.data, null, 2) : 'N/A'}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!selectedHistory.error_log || selectedHistory.error_log.length === 0) && (
                    <tr>
                      <td colSpan={3} className="p-20 text-center text-muted-foreground italic">
                        No detailed error logs found for this import.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t border-border bg-muted/5 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground italic">Only successfully applied rows were imported.</p>
              <button onClick={() => setIsErrorModalOpen(false)} className="px-8 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-500/20 hover:scale-105 active:scale-95 transition-all">
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
