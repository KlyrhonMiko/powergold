import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportExportSettings } from './ImportExportSettings';

const mockExportData = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation(() => new Promise(() => {})),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@/app/inventory/items/lib/useItemQueries', () => ({
  useInventoryItems: () => ({
    data: {
      data: [
        { item_id: 'ITEM-001', name: 'Tracked Camera', is_trackable: true },
        { item_id: 'ITEM-002', name: 'Handheld Scanner', is_trackable: true },
        { item_id: 'ITEM-003', name: 'Cleaning Solvent', is_trackable: false },
      ],
    },
  }),
  useInventoryUnits: (itemId: string | undefined) => ({
    data: {
      data: itemId
        ? itemId === 'ITEM-001'
          ? [
              { unit_id: 'UNIT-001', serial_number: 'SN-001', status: 'available', condition: 'excellent' },
              { unit_id: 'UNIT-002', serial_number: 'SN-002', status: 'borrowed', condition: 'good' },
            ]
          : [
              { unit_id: 'UNIT-101', serial_number: 'SN-101', status: 'available', condition: 'excellent' },
            ]
        : [],
    },
    isLoading: false,
  }),
}));

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ date, onChange, placeholder }: { date?: Date; onChange?: (date: Date | undefined) => void; placeholder?: string }) => (
    <button
      type="button"
      onClick={() => onChange?.(new Date(2026, 3, 13))}
    >
      {date ? 'Apr 13, 2026' : placeholder ?? 'Pick a date'}
    </button>
  ),
}));

vi.mock('../lib/useImportExport', async () => {
  const actual = await vi.importActual<typeof import('../lib/useImportExport')>('../lib/useImportExport');
  return {
    ...actual,
    useImportHistory: () => ({
      data: {
        data: [],
        meta: { total: 0, limit: 5, offset: 0 },
      },
      isLoading: false,
    }),
    useImportPreview: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    usePreviewSummary: () => ({
      data: null,
      isLoading: false,
    }),
    usePreviewRows: () => ({
      data: { data: [], meta: null },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useEditRow: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useApplyImport: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useDownloadCorrectedCsv: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useAcceptRecommended: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useSetGroupAction: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useSetRowAction: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useResetActions: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useIgnoreAllBlockers: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useExportData: () => ({
      exportData: mockExportData,
    }),
    useExportBorrowers: () => ({
      data: [],
    }),
    useDownloadTemplate: () => ({
      downloadTemplate: vi.fn(),
    }),
  };
});

describe('ImportExportSettings', () => {
  beforeEach(() => {
    mockExportData.mockReset();
  });

  it('keeps borrower export unbounded by default when timeline mode is not selected', () => {
    render(<ImportExportSettings />);

    const borrowCard = screen.getByText('Borrow Request History').closest('div');
    expect(borrowCard).toBeTruthy();

    const borrowerSection = borrowCard as HTMLElement;

    const exportHistoryButton = within(borrowerSection).getByRole('button', { name: 'Export Borrow Request History' });

    expect(exportHistoryButton).toBeEnabled();
    expect(within(borrowerSection).getByText('Specific Borrower (Optional)')).toBeInTheDocument();
    expect(within(borrowerSection).getByRole('button', { name: 'All Borrowers' })).toBeInTheDocument();
    expect(within(borrowerSection).queryByText('Serial Number')).not.toBeInTheDocument();
    expect(within(borrowerSection).queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(exportHistoryButton);

    expect(mockExportData).toHaveBeenCalledTimes(1);
    expect(mockExportData).toHaveBeenCalledWith('requests', expect.any(Object));

    const call = mockExportData.mock.calls[0];
    const exportParams = call[1] as Record<string, unknown>;
    expect(exportParams.timeline_mode).toBeUndefined();
    expect(exportParams.anchor_date).toBeUndefined();
    expect(exportParams.serial_number).toBeUndefined();
  });

  it('keeps equipment serial selection disabled until an item is chosen', () => {
    render(<ImportExportSettings />);

    const movementCard = screen.getByText('Equipment History').closest('div');
    expect(movementCard).toBeTruthy();

    const section = movementCard as HTMLElement;

    const serialField = within(section).getByRole('button', { name: 'Select an item first' });
    expect(serialField).toBeDisabled();

    fireEvent.click(within(section).getByRole('button', { name: 'Select equipment...' }));
    expect(screen.queryByRole('button', { name: /Cleaning Solvent/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tracked Camera/ }));

    const enabledSerialField = within(section).getByRole('button', { name: 'All Serials' });
    expect(enabledSerialField).toBeEnabled();

    fireEvent.click(enabledSerialField);
    expect(screen.getByRole('button', { name: /SN-001/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SN-002/ })).toBeInTheDocument();

    fireEvent.click(within(section).getByRole('button', { name: /Tracked Camera/ }));
    fireEvent.click(screen.getByRole('button', { name: /Handheld Scanner/ }));

    expect(within(section).getByRole('button', { name: 'All Serials' })).toBeEnabled();
    expect(within(section).queryByRole('button', { name: 'SN-001' })).not.toBeInTheDocument();

    fireEvent.click(within(section).getByRole('button', { name: 'All Serials' }));
    expect(screen.getByRole('button', { name: /SN-101/ })).toBeInTheDocument();
  });

  it('exports equipment history only when equipment item is selected', () => {
    render(<ImportExportSettings />);

    const movementCard = screen.getByText('Equipment History').closest('div');
    expect(movementCard).toBeTruthy();

    const section = movementCard as HTMLElement;
    expect(within(section).getByText('Specific Equipment')).toBeInTheDocument();
    expect(within(section).getByText('*')).toBeInTheDocument();

    const exportButton = within(section).getByRole('button', { name: 'Export Equipment History' });
    expect(exportButton).toBeDisabled();

    fireEvent.click(within(section).getByRole('button', { name: 'Select equipment...' }));
    fireEvent.click(screen.getByRole('button', { name: /Tracked Camera/ }));

    expect(exportButton).toBeEnabled();

    fireEvent.click(exportButton);

    const exportParams = mockExportData.mock.calls[0][1] as Record<string, unknown>;
    expect(exportParams.item_id).toBe('ITEM-001');
  });

  it('requires anchor date for rolling 7 day borrower export mode', () => {
    render(<ImportExportSettings />);

    const borrowerCard = screen.getByText('Borrow Request History').closest('div');
    expect(borrowerCard).toBeTruthy();

    const borrowerSection = borrowerCard as HTMLElement;
    const exportHistoryButton = within(borrowerSection).getByRole('button', { name: 'Export Borrow Request History' });

    fireEvent.click(within(borrowerSection).getByRole('button', { name: 'Select timeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rolling 7 Day' }));

    expect(within(borrowerSection).getByText('Anchor Date')).toBeInTheDocument();
    expect(exportHistoryButton).toBeDisabled();

    fireEvent.click(within(borrowerSection).getByRole('button', { name: 'Required for rolling 7 day' }));
    expect(exportHistoryButton).toBeEnabled();
  });

  it('requires anchor date for rolling 7 day movement export mode', () => {
    render(<ImportExportSettings />);

    const movementCard = screen.getByText('Equipment History').closest('div');
    expect(movementCard).toBeTruthy();

    const movementSection = movementCard as HTMLElement;
    const exportMovementsButton = within(movementSection).getByRole('button', { name: 'Export Equipment History' });

    fireEvent.click(within(movementSection).getByRole('button', { name: 'Select equipment...' }));
    fireEvent.click(screen.getByRole('button', { name: /Tracked Camera/ }));

    fireEvent.click(within(movementSection).getByRole('button', { name: 'Select timeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rolling 7 Day' }));

    expect(within(movementSection).getByText('Anchor Date')).toBeInTheDocument();
    expect(exportMovementsButton).toBeDisabled();

    fireEvent.click(within(movementSection).getByRole('button', { name: 'Required for rolling 7 day' }));

    expect(exportMovementsButton).toBeEnabled();
  });

  it('renders export data cards with history sections at the top and no scheduled exports block', () => {
    render(<ImportExportSettings />);

    expect(screen.getByText('Borrow Request History')).toBeInTheDocument();
    expect(screen.getByText('Equipment History')).toBeInTheDocument();
    expect(screen.getByText('Inventory Catalog (Full State)')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled Exports')).not.toBeInTheDocument();
  });
});
