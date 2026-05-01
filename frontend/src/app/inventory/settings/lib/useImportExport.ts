import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

export interface ImportHistoryErrorLogEntry {
  row?: number | string;
  error?: string;
  data?: Record<string, unknown>;
}

interface ImportMutationResult {
  status: string;
  success_count?: number;
  error_count?: number;
  success?: number;
  failed?: number;
}

export interface ImportHistoryItem {
  id: string;
  filename: string;
  actor_id: string;
  total_rows: number;
  success_count: number;
  error_count: number;
  status: string;
  created_at: string;
  error_log?: ImportHistoryErrorLogEntry[];
}

export interface ExportBorrower {
  user_id: string;
  first_name: string;
  last_name: string;
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export type ExportEndpointType = 'catalog' | 'audit' | 'requests' | 'movements';

export const EXPORT_ENDPOINT_MAP: Record<ExportEndpointType, string> = {
  catalog: '/inventory/data/export/catalog',
  audit: '/inventory/data/export/audit-logs',
  requests: '/inventory/data/export/ledger/requests',
  movements: '/inventory/data/export/ledger/movements',
};

export type ReportTimelineMode = 'daily' | 'rolling_7_day' | 'monthly' | 'yearly';
export type ReportTimelineSelection = ReportTimelineMode | '';

export const REPORT_TIMELINE_MODE_OPTIONS: Array<{ key: ReportTimelineMode; label: string }> = [
  { key: 'daily', label: 'Daily (Current Date)' },
  { key: 'rolling_7_day', label: 'Rolling 7 Day' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export type ExportQueryValue = string | number | boolean | Date | null | undefined;

export interface ReportExportFilterContract {
  report_version?: 'v1' | 'v2';
  timeline_mode?: ReportTimelineSelection;
  anchor_date?: string | Date;
  date_from?: string | Date;
  date_to?: string | Date;
  serial_number?: string;
  borrower_id?: string;
  include_receipt_rendered?: boolean;
  include_deleted?: boolean;
  include_archived?: boolean;
}

export interface ExportEndpointInput extends ReportExportFilterContract {
  format?: string;
  status?: string;
  movement_type?: string;
  item_id?: string;
  from_date?: string | Date;
  to_date?: string | Date;
  search?: string;
  [key: string]: ExportQueryValue;
}

export interface BorrowHistoryExportFormValues extends ReportExportFilterContract {
  format: string;
  status?: string;
}

export interface MovementExportFormValues extends ReportExportFilterContract {
  format: string;
  item_id: string;
}

export function isRolling7DayTimelineMode(timelineMode?: ReportTimelineSelection): boolean {
  return timelineMode === 'rolling_7_day';
}

function normalizeTimelineMode(value?: ReportTimelineSelection): ReportTimelineMode | undefined {
  return value || undefined;
}

function normalizeSelectAll(value?: string): string | undefined {
  if (!value || value === 'all') {
    return undefined;
  }
  return value;
}

function normalizeOptionalText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function composeBorrowHistoryExportParams(params: BorrowHistoryExportFormValues): ExportEndpointInput {
  const timelineMode = normalizeTimelineMode(params.timeline_mode);

  return {
    format: params.format,
    status: normalizeSelectAll(params.status),
    ...(timelineMode ? { timeline_mode: timelineMode } : {}),
    ...(isRolling7DayTimelineMode(timelineMode) ? { anchor_date: params.anchor_date } : {}),
    borrower_id: normalizeOptionalText(params.borrower_id),
    include_deleted: params.include_deleted,
    include_archived: params.include_archived,
  };
}

export function composeMovementExportParams(params: MovementExportFormValues): ExportEndpointInput {
  const timelineMode = normalizeTimelineMode(params.timeline_mode);

  return {
    format: params.format,
    item_id: params.item_id.trim(),
    ...(timelineMode ? { timeline_mode: timelineMode } : {}),
    ...(isRolling7DayTimelineMode(timelineMode) ? { anchor_date: params.anchor_date } : {}),
    serial_number: normalizeOptionalText(params.serial_number),
    include_deleted: params.include_deleted,
    include_archived: params.include_archived,
  };
}

function toLocalDateQueryString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function serializeExportQueryValue(value: ExportQueryValue): string {
  if (value instanceof Date) {
    return toLocalDateQueryString(value);
  }
  return String(value);
}

export function buildExportDownloadPath(type: ExportEndpointType, params: ExportEndpointInput): string {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== null && val !== undefined && val !== '') {
      queryParams.append(key, serializeExportQueryValue(val));
    }
  });

  const endpoint = EXPORT_ENDPOINT_MAP[type];
  if (!endpoint) {
    throw new Error('Unsupported export type');
  }

  const query = queryParams.toString();
  return `${endpoint}${query ? `?${query}` : ''}`;
}

export function buildImportTemplateDownloadPath(): string {
  return '/inventory/data/import/template';
}

export function useImportHistory(page: number, perPage: number) {
  return useQuery({
    queryKey: ['inventory', 'import', 'history', page, perPage],
    queryFn: async () => {
      const response = await api.get<ImportHistoryItem[]>(`/inventory/data/import/history?page=${page}&per_page=${perPage}`);
      return response;
    },
  });
}

export function useExportBorrowers() {
  return useQuery({
    queryKey: ['inventory', 'export', 'borrowers'],
    queryFn: async () => {
      try {
        const response = await api.get<ExportBorrower[]>('/inventory/data/borrowers');
        return response.data;
      } catch (error) {
        logger.error('Failed to fetch borrowers for export filter', { error });
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useImportInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, mode }: { file: File; mode: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<ImportMutationResult>(`/inventory/data/import?mode=${mode}`, formData);
      return response.data;
    },
    onSuccess: (data: ImportMutationResult) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'import', 'history'] });
      // Also invalidate items as they might have been updated/added
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });

      const successCount = data.success_count ?? data.success ?? 0;
      const errorCount = data.error_count ?? data.failed ?? 0;
      
      if (data.status === 'completed') {
        toast.success('Import completed successfully');
      } else if (data.status === 'partial_success') {
        toast.warning(`Imported with some errors (${successCount} success, ${errorCount} failed)`);
      } else if (data.status === 'failed') {
        toast.error('Import failed completely. Check history for details.');
      } else {
        toast.success('Import process initiated');
      }
    },
    onError: (err: unknown) => {
      toast.error(resolveErrorMessage(err, 'Import failed'));
    }
  });
}

export function useExportData() {
  return {
    exportData: async (type: ExportEndpointType, params: ExportEndpointInput) => {
      const url = buildExportDownloadPath(type, params);
      
      try {
        const response = await api.getRaw(url);

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `${type}_export.${params.format || 'csv'}`;
        if (contentDisposition) {
            const matches = /filename="?([^";]+)"?/.exec(contentDisposition);
            if (matches && matches[1]) filename = matches[1];
        }
        
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
        toast.success('File downloaded successfully');
      } catch (err: unknown) {
        toast.error(resolveErrorMessage(err, 'Export failed'));
      }
    }
  };
}

export function useDownloadTemplate() {
  return {
    downloadTemplate: async () => {
      const url = buildImportTemplateDownloadPath();
      try {
        const response = await api.getRaw(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', 'inventory_import_template.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } catch (err: unknown) {
        toast.error(resolveErrorMessage(err, 'Download failed'));
      }
    }
  }
}
