import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { userApi } from '../api';

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

async function downloadResponseAsFile(response: Response, fallbackName: string) {
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;

  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = fallbackName;
  if (contentDisposition) {
    const matches = /filename="?([^";]+)"?/.exec(contentDisposition);
    if (matches?.[1]) filename = matches[1];
  }

  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export function useUserImportHistory(page: number, perPage: number) {
  return useQuery({
    queryKey: ['admin', 'users', 'import', 'history', page, perPage],
    queryFn: () => userApi.getImportHistory(page, perPage),
  });
}

export function useUserImportPreview() {
  return useMutation({
    mutationFn: ({ file, mode }: { file: File; mode: string }) => userApi.previewImport(file, mode).then((response) => response.data),
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Preview failed'));
    },
  });
}

export function useUserPreviewSummary(previewId: string | null) {
  return useQuery({
    queryKey: ['admin', 'users', 'import', 'preview', previewId, 'summary'],
    queryFn: () => userApi.getImportPreview(previewId as string).then((response) => response.data),
    enabled: Boolean(previewId),
  });
}

export function useUserPreviewRows(
  previewId: string | null,
  page: number,
  perPage: number,
  filterStatus: string,
  groupKey: string | null = null,
) {
  return useQuery({
    queryKey: ['admin', 'users', 'import', 'preview', previewId, 'rows', page, perPage, filterStatus, groupKey],
    queryFn: () => userApi.getImportPreviewRows(previewId as string, page, perPage, filterStatus, groupKey),
    enabled: Boolean(previewId),
  });
}

export function useEditUserImportRow(previewId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rowNumber, updates }: { rowNumber: number; updates: Record<string, string> }) =>
      userApi.updateImportPreviewRow(previewId as string, rowNumber, updates).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'import', 'preview', previewId] });
    },
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Failed to update row'));
    },
  });
}

export function useAcceptUserImportRecommended(previewId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => userApi.acceptRecommendedImportActions(previewId as string).then((response) => response.data),
    onSuccess: (data) => {
      toast.success(`${data.accepted} recommended actions accepted.`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'import', 'preview', previewId] });
    },
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Failed to accept recommended actions'));
    },
  });
}

export function useSetUserImportRowAction(previewId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rowNumber, action }: { rowNumber: number; action: string }) =>
      userApi.setImportRowAction(previewId as string, rowNumber, action).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'import', 'preview', previewId] });
    },
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Failed to set row action'));
    },
  });
}

export function useIgnoreAllUserImportBlockers(previewId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => userApi.ignoreAllImportBlockers(previewId as string).then((response) => response.data),
    onSuccess: (data) => {
      toast.success(`${data.ignored} row(s) ignored.`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'import', 'preview', previewId] });
    },
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Failed to ignore blockers'));
    },
  });
}

export function useApplyUserImport(previewId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => userApi.applyImportPreview(previewId as string).then((response) => response.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'import', 'history'] });

      if (data.status === 'completed') {
        toast.success(`Import completed: ${data.success} rows imported successfully.`);
      } else if (data.status === 'failed') {
        toast.error(`Import failed: ${data.failed} rows failed.`);
      } else {
        toast.warning(`Import finished with mixed results: ${data.success} success, ${data.failed} failed.`);
      }
    },
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Import failed'));
    },
  });
}

export function useDownloadUserImportTemplate() {
  return {
    downloadTemplate: async () => {
      try {
        const response = await userApi.downloadImportTemplate();
        await downloadResponseAsFile(response, 'user_import_template.csv');
      } catch (error: unknown) {
        toast.error(resolveErrorMessage(error, 'Download failed'));
      }
    },
  };
}

export function useDownloadCorrectedUserImportCsv(previewId: string | null) {
  return useMutation({
    mutationFn: async () => {
      const response = await userApi.downloadCorrectedImportCsv(previewId as string);
      await downloadResponseAsFile(response, 'corrected_user_import.csv');
    },
    onSuccess: () => {
      toast.success('Corrected CSV downloaded.');
    },
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Download failed'));
    },
  });
}

export function useDownloadUserImportCredentials(previewId: string | null) {
  return useMutation({
    mutationFn: async () => {
      const response = await userApi.downloadImportCredentials(previewId as string);
      await downloadResponseAsFile(response, 'user_import_credentials.csv');
    },
    onSuccess: () => {
      toast.success('Generated credentials downloaded.');
    },
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Credential download failed'));
    },
  });
}

export function useDownloadUserImportCredentialsFromHistory() {
  return useMutation({
    mutationFn: async (historyId: string) => {
      const response = await userApi.downloadImportCredentialsFromHistory(historyId);
      await downloadResponseAsFile(response, `user_import_credentials_${historyId}.csv`);
    },
    onSuccess: () => {
      toast.success('Generated credentials downloaded.');
    },
    onError: (error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Credential download failed'));
    },
  });
}
