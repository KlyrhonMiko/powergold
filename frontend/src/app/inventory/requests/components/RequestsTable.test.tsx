import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RequestsTable } from './RequestsTable';
import type { BorrowRecord } from '../lib/types';

const baseProps = {
  loading: false,
  expandedIds: new Set<string>(),
  onToggleRow: vi.fn(),
  requestEvents: {},
  loadingEvents: {},
  assignmentsMap: {},
  loadingAssignments: {},
  statusFilter: 'ALL' as const,
  onClearStatusFilter: vi.fn(),
  onSetConfirmingAction: vi.fn(),
  onSetAssigningRequest: vi.fn(),
  onSetReturningRequest: vi.fn(),
  isFullyAssigned: vi.fn(() => false),
  onShowReceipt: vi.fn(),
};

function renderTable(record: BorrowRecord, isFullyAssigned = false) {
  return render(
    <RequestsTable
      {...baseProps}
      records={[record]}
      isFullyAssigned={vi.fn(() => isFullyAssigned)}
    />,
  );
}

describe('RequestsTable actions', () => {
  it('shows a void action for approved requests', () => {
    renderTable({
      request_id: 'REQ-001',
      borrower_name: 'Flow Tester',
      items: [
        {
          item_id: 'ITEM-001',
          name: 'Camera',
          qty_requested: 1,
          is_trackable: true,
        },
      ],
      status: 'approved',
      request_date: '2026-05-29T09:00:00+08:00',
    });

    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Void' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
  });

  it('shows close for released material-only requests', () => {
    renderTable(
      {
        request_id: 'REQ-002',
        borrower_name: 'Flow Tester',
        items: [
          {
            item_id: 'ITEM-002',
            name: 'Cable Roll',
            qty_requested: 5,
            is_trackable: false,
            unit_of_measure: 'roll',
          },
        ],
        status: 'released',
        request_date: '2026-05-29T10:00:00+08:00',
      },
      true,
    );

    expect(screen.getByRole('button', { name: 'Receipt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('renders voided requests as a visible terminal state', () => {
    renderTable({
      request_id: 'REQ-003',
      borrower_name: 'Flow Tester',
      items: [
        {
          item_id: 'ITEM-003',
          name: 'Tripod',
          qty_requested: 1,
          is_trackable: true,
        },
      ],
      status: 'voided',
      request_date: '2026-05-29T11:00:00+08:00',
    });

    expect(screen.getByText('voided')).toBeInTheDocument();
    expect(screen.getByText('Cancelled after approval')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument();
  });

  it('disables row actions while a request is processing', () => {
    render(
      <RequestsTable
        {...baseProps}
        records={[
          {
            request_id: 'REQ-004',
            borrower_name: 'Flow Tester',
            items: [
              {
                item_id: 'ITEM-004',
                name: 'Mixer',
                qty_requested: 1,
                is_trackable: true,
              },
            ],
            status: 'approved',
            request_date: '2026-05-29T12:00:00+08:00',
          },
        ]}
        isFullyAssigned={vi.fn(() => true)}
        processingRequestId="REQ-004"
        processingLabel="Releasing units..."
      />,
    );

    expect(screen.getByRole('button', { name: 'Reassign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Void' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Release' })).toBeDisabled();
    expect(screen.getByText('Releasing units...')).toBeInTheDocument();
  });
});
