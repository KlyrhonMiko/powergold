import { describe, expect, it } from 'vitest';

import {
  MAX_BORROW_REQUEST_UNIQUE_ITEMS,
  MAX_BORROW_REQUEST_UNIQUE_ITEMS_MESSAGE,
} from './requestLimits';
import { validateBorrowSubmission } from './validation';

describe('validateBorrowSubmission', () => {
  it('rejects requests with more than fifty unique items', () => {
    const cart = Array.from({ length: MAX_BORROW_REQUEST_UNIQUE_ITEMS + 1 }, (_, index) => ({
      item_id: `ITEM-${index + 1}`,
      name: `Item ${index + 1}`,
      category: 'tools',
      total_qty: 999,
      available_qty: 999,
      condition: 'good',
      is_trackable: true,
      cartQty: 1,
    }));

    const result = validateBorrowSubmission({
      cart,
      employeeId: 'EMP-001',
      employeePin: '123456',
      customerName: 'Client',
      locationName: 'Warehouse',
      dueDate: '2099-01-01T00:00:00.000Z',
    });

    expect(result).toBe(MAX_BORROW_REQUEST_UNIQUE_ITEMS_MESSAGE);
  });
});
