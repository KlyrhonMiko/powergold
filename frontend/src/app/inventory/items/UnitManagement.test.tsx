import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const { mockGetConfigs, mockRemoveUnit, mockUseInventoryUnits } = vi.hoisted(() => ({
  mockGetConfigs: vi.fn(),
  mockRemoveUnit: vi.fn(),
  mockUseInventoryUnits: vi.fn(),
}));

vi.mock('@/components/ui/form-select', () => ({
  FormSelect: ({
    label,
    value,
    disabled,
  }: {
    label?: string;
    value: string;
    disabled?: boolean;
  }) => (
    <button type="button" aria-label={label} disabled={disabled}>
      {value}
    </button>
  ),
}));

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    placeholder,
    disabled,
  }: {
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <button type="button" aria-label={placeholder ?? 'Pick a date'} disabled={disabled}>
      DatePicker
    </button>
  ),
}));

vi.mock('./api', () => ({
  inventoryApi: {
    getConfigs: mockGetConfigs,
    removeUnit: mockRemoveUnit,
    retireUnit: vi.fn(),
    updateUnit: vi.fn(),
    createUnit: vi.fn(),
    createUnitsBatch: vi.fn(),
  },
}));

vi.mock('./lib/useItemQueries', () => ({
  useInventoryUnits: mockUseInventoryUnits,
}));

import { UnitFormModal, UnitManagement } from './UnitManagement';

describe('UnitFormModal', () => {
  it('opens a confirmation modal before removing a unit from the inventory UI', async () => {
    mockUseInventoryUnits.mockReturnValue({
      data: {
        data: [
          {
            unit_id: 'UNT-001',
            serial_number: 'SN-001',
            status: 'retired',
            condition: 'good',
            description: '',
            expiration_date: null,
          },
        ],
      },
      isLoading: false,
    });
    mockGetConfigs.mockImplementation((category: string) =>
      Promise.resolve({
        data: category === 'inventory_units_status'
          ? [
              { key: 'retired', value: 'Retired', category },
              { key: 'borrowed', value: 'Borrowed', category },
            ]
          : [{ key: 'good', value: 'Good', category }],
      }),
    );
    mockRemoveUnit.mockResolvedValue({});

    render(
      <QueryClientProvider client={new QueryClient()}>
        <UnitManagement itemId="ITEM-001" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTitle('Remove'));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Remove this unit?')).toBeInTheDocument();
    expect(within(dialog).getByText('SN-001')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Unit' }));

    await waitFor(() => {
      expect(mockRemoveUnit).toHaveBeenCalledWith('ITEM-001', 'UNT-001');
    });
  });

  it.each(['borrowed', 'entrusted'] as const)('freezes all editable fields for %s units', (status) => {
    render(
      <UnitFormModal
        itemId="ITEM-001"
        isBatch={false}
        unit={{
          unit_id: 'UNT-001',
          serial_number: 'SN-001',
          status,
          condition: 'good',
          description: '',
          expiration_date: '2026-05-29T00:00:00+08:00',
        }}
        statusConfigs={[
          { key: 'borrowed', value: 'Borrowed', category: 'inventory_units_status' },
          { key: 'entrusted', value: 'Entrusted', category: 'inventory_units_status' },
          { key: 'maintenance', value: 'Maintenance', category: 'inventory_units_status' },
        ]}
        conditionConfigs={[{ key: 'good', value: 'Good', category: 'inventory_units_condition' }]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Condition' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Status' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select date' })).toBeDisabled();
    expect(screen.getByPlaceholderText('Optional note about this unit...')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    expect(screen.getByText('This unit is frozen while it is borrowed or entrusted.')).toBeInTheDocument();
  });
});
