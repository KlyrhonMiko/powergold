import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const { mockGetConfigs, mockCloseBatch, mockUseInventoryBatches } = vi.hoisted(() => ({
  mockGetConfigs: vi.fn(),
  mockCloseBatch: vi.fn(),
  mockUseInventoryBatches: vi.fn(),
}));

vi.mock('./api', () => ({
  inventoryApi: {
    getConfigs: mockGetConfigs,
    closeBatch: mockCloseBatch,
    createBatch: vi.fn(),
    updateBatch: vi.fn(),
    adjustStock: vi.fn(),
  },
}));

vi.mock('./lib/useItemQueries', () => ({
  useInventoryBatches: mockUseInventoryBatches,
}));

import { BatchManagement } from './BatchManagement';

describe('BatchManagement', () => {
  it('opens a confirmation modal before closing an empty batch', async () => {
    mockUseInventoryBatches.mockReturnValue({
      data: {
        data: [
          {
            batch_id: 'BAT-001',
            inventory_uuid: 'inv-1',
            total_qty: 12,
            available_qty: 0,
            expiration_date: null,
            status: 'out_of_stock',
            received_at: '2026-05-29T00:00:00+08:00',
            description: 'Warehouse reserve',
          },
        ],
      },
      isLoading: false,
    });
    mockGetConfigs.mockResolvedValue({ data: [] });
    mockCloseBatch.mockResolvedValue({});

    render(
      <QueryClientProvider client={new QueryClient()}>
        <BatchManagement itemId="ITEM-001" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTitle('Close Batch'));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Close this batch?')).toBeInTheDocument();
    expect(within(dialog).getByText('BAT-001')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Batch' }));

    await waitFor(() => {
      expect(mockCloseBatch).toHaveBeenCalledWith('ITEM-001', 'BAT-001');
    });
  });
});
