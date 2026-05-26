import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserImportSection } from './UserImportSection';
import type { UserImportPreviewSummary } from '../api';

const mocks = vi.hoisted(() => ({
  previewMutate: vi.fn(),
  applyMutate: vi.fn(),
  downloadTemplate: vi.fn(),
  downloadCorrected: vi.fn(),
  downloadCredentials: vi.fn(),
  downloadCredentialsFromHistory: vi.fn(),
  acceptRecommended: vi.fn(),
  setRowAction: vi.fn(),
  ignoreAll: vi.fn(),
  editRow: vi.fn(),
  refetchRows: vi.fn(),
}));

vi.mock('../lib/useUserImport', () => ({
  useUserImportHistory: () => ({
    data: {
      data: [
        {
          id: 'history-1',
          filename: 'users.csv',
          actor_id: 'actor-1',
          total_rows: 2,
          success_count: 1,
          error_count: 1,
          status: 'partial_success',
          created_at: '05/26/2026 10:00 AM',
          error_log: [{ row: 2, error: 'Email conflict', data: { email: 'duplicate@example.com' } }],
        },
      ],
      meta: { total: 1, limit: 5, offset: 0 },
    },
    isLoading: false,
  }),
  useUserImportPreview: () => ({
    mutate: mocks.previewMutate,
    isPending: false,
  }),
  useUserPreviewSummary: () => ({
    data: null,
    isLoading: false,
  }),
  useUserPreviewRows: () => ({
    data: { data: [], meta: null },
    isLoading: false,
    refetch: mocks.refetchRows,
  }),
  useEditUserImportRow: () => ({
    mutate: mocks.editRow,
    isPending: false,
  }),
  useApplyUserImport: () => ({
    mutate: mocks.applyMutate,
    isPending: false,
  }),
  useDownloadCorrectedUserImportCsv: () => ({
    mutate: mocks.downloadCorrected,
    isPending: false,
  }),
  useDownloadUserImportCredentials: () => ({
    mutate: mocks.downloadCredentials,
    isPending: false,
  }),
  useDownloadUserImportCredentialsFromHistory: () => ({
    mutate: mocks.downloadCredentialsFromHistory,
    isPending: false,
  }),
  useDownloadUserImportTemplate: () => ({
    downloadTemplate: mocks.downloadTemplate,
  }),
  useAcceptUserImportRecommended: () => ({
    mutate: mocks.acceptRecommended,
    isPending: false,
  }),
  useSetUserImportRowAction: () => ({
    mutate: mocks.setRowAction,
    isPending: false,
  }),
  useIgnoreAllUserImportBlockers: () => ({
    mutate: mocks.ignoreAll,
    isPending: false,
  }),
}));

describe('UserImportSection', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('renders import and history cards', () => {
    render(<UserImportSection />);

    expect(screen.getByText('Import Users')).toBeInTheDocument();
    expect(screen.getByText('Import History')).toBeInTheDocument();
    expect(screen.getByText('users.csv')).toBeInTheDocument();
  });

  it('triggers preview when a CSV file is selected', async () => {
    mocks.previewMutate.mockImplementation((_payload, options?: { onSuccess?: (data: UserImportPreviewSummary) => void }) => {
      options?.onSuccess?.({
        preview_id: 'preview-1',
        filename: 'users.csv',
        mode: 'skip',
        delimiter: ',',
        encoding: 'utf-8',
        bom_detected: false,
        file_size: 100,
        total_rows: 1,
        ready_count: 1,
        warning_count: 0,
        error_count: 0,
        info_count: 0,
        file_issues: [],
        can_apply: true,
        headers: ['employee_id', 'first_name'],
        duplicate_groups: [],
        auto_resolved_count: 0,
        decision_required_count: 0,
        unresolved_blocker_count: 0,
      });
    });

    const { container } = render(<UserImportSection />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['employee_id,first_name\nEMP-1,Alex'], 'users.csv', { type: 'text/csv' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.previewMutate).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/Import Preview/)).toBeInTheDocument();
  });

  it('opens the import error report from history', () => {
    render(<UserImportSection />);

    fireEvent.click(screen.getByRole('button', { name: 'View Errors' }));

    expect(screen.getByText('Import Error Report')).toBeInTheDocument();
    expect(screen.getByText('Email conflict')).toBeInTheDocument();
  });
});
