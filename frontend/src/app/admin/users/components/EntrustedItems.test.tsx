import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockGetEntrustedItems, mockAssignEntrustedItem, mockRevokeEntrustedItem } = vi.hoisted(() => ({
  mockGetEntrustedItems: vi.fn(),
  mockAssignEntrustedItem: vi.fn(),
  mockRevokeEntrustedItem: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../api', () => ({
  userApi: {
    getEntrustedItems: mockGetEntrustedItems,
    assignEntrustedItem: mockAssignEntrustedItem,
    revokeEntrustedItem: mockRevokeEntrustedItem,
  },
}));

import { EntrustedItems } from './EntrustedItems';

describe('EntrustedItems', () => {
  it('opens a revocation modal and submits the typed note', async () => {
    mockGetEntrustedItems.mockResolvedValue({
      data: [
        {
          assignment_id: 'ENT-001',
          unit_id: 'UNT-001',
          serial_number: 'SN-001',
          item_name: 'Camera Body',
          item_category: 'Electronics',
          assigned_to_user_id: 'USER-001',
          assigned_at: '2026-05-29T10:00:00+08:00',
          assigned_by_user_id: 'USER-ADMIN',
          returned_by_user_id: null,
          returned_at: null,
          notes: null,
        },
      ],
    });
    mockAssignEntrustedItem.mockResolvedValue({});
    mockRevokeEntrustedItem.mockResolvedValue({});

    render(<EntrustedItems userId="USER-001" />);

    expect(await screen.findByText('Camera Body')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Revoke this entrusted item?')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText('Add an optional return or revocation note...'), {
      target: { value: 'Returned and checked by admin' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke Item' }));

    await waitFor(() => {
      expect(mockRevokeEntrustedItem).toHaveBeenCalledWith('USER-001', 'ENT-001', {
        notes: 'Returned and checked by admin',
      });
    });
  });
});
