import { api, buildQueryString } from '@/lib/api';

export interface BorrowRequest {
  request_id: string;
  borrower_user_id?: string;
  borrower_name?: string;
  customer_name?: string;
  location_name?: string;
  items: Array<{
    item_id: string;
    name: string;
    qty_requested: number;
    classification?: string;
    item_type?: string;
    is_trackable?: boolean;
  }>;
  status: string;
  notes?: string;
  request_date: string;
  return_at?: string;
  approved_at?: string;
  released_at?: string;
  returned_at?: string;
  is_emergency?: boolean;
  request_channel?: string;
  closed_at?: string;
  closed_by_user_id?: string;
  close_reason?: string;
}

export interface BorrowRequestCreate {
  items: Array<{
    item_id: string;
    qty_requested: number;
  }>;
  notes?: string;
  return_at?: string;
  involved_people?: Record<string, unknown>[];
  is_emergency?: boolean;
}

export interface BorrowActionPayload {
  notes?: string;
}

export interface BorrowUnitReturn {
  unit_id: string;
  condition_on_return?: string;
  notes?: string;
}

export interface BorrowBatchReturn {
  borrow_batch_id: string;
  qty_returned: number;
}

export interface BorrowReturnPayload {
  notes?: string;
  unit_returns?: BorrowUnitReturn[];
  batch_returns?: BorrowBatchReturn[];
}

export interface BorrowBatchAssignment {
  batch_id: string;
  qty: number;
}

export interface BorrowBatchAssignPayload {
  assignments: BorrowBatchAssignment[];
  notes?: string;
  item_id: string;
}

export interface BorrowRequestEvent {
  event_id: string;
  event_type: string;
  actor_user_id?: string;
  actor_name?: string;
  note?: string;
  occurred_at: string;
}

export interface BorrowRequestEventGlobal extends BorrowRequestEvent {
  request_id: string;
}

export interface BorrowRequestUnit {
  borrow_unit_id: string;
  unit_id: string;
  serial_number?: string;
  assigned_at?: string;
  released_at?: string;
  returned_at?: string;
  condition_on_return?: string;
  return_notes?: string;
}

export interface BorrowUnitAssignPayload {
  unit_ids: string[];
  item_id?: string;
  notes?: string;
}

export interface BorrowListParams {
  page?: number;
  per_page?: number;
  status?: string;
  request_channel?: string;
  is_emergency?: boolean;
  borrower_id?: string;
  search?: string;
  returned_on_time?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface BorrowEventsParams {
  page?: number;
  per_page?: number;
  event_type?: string;
  request_id?: string;
  actor_name?: string;
  date_from?: string;
  date_to?: string;
}

export interface BorrowRequestBatch {
  borrow_batch_id: string;
  batch_id: string;
  item_id?: string;
  item_name?: string;
  qty_assigned: number;
  qty_returned?: number;
  qty_not_returned?: number;
  assigned_at?: string;
  released_at?: string;
  returned_at?: string;
}

export interface ReleaseReceiptItem {
  item_id: string;
  name: string;
  classification?: string;
  is_trackable?: boolean;
  qty_released: number;
  qty_returned?: number;
  qty_not_returned?: number;
  serial_numbers: string[];
  batch_details?: Array<{
    batch_id: string;
    qty_released: number;
    qty_returned: number;
    qty_not_returned: number;
  }>;
}

export interface ReleaseReceipt {
  request_id: string;
  transaction_ref: string;
  receipt_number: string;
  status: string;
  borrower_name?: string;
  borrower_user_id?: string;
  customer_name?: string;
  location_name?: string;
  released_at?: string;
  released_by_name?: string;
  expected_return_at?: string;
  returned_at?: string;
  returned_by_name?: string;
  is_emergency: boolean;
  approval_channel: string;
  notes?: string;
  items: ReleaseReceiptItem[];
  borrower_signature?: string;
}

export const borrowApi = {
  list: (params: BorrowListParams = {}) =>
    api.get<BorrowRequest[]>(`/inventory/borrowing/requests${buildQueryString(params as Record<string, unknown>)}`),

  create: (data: BorrowRequestCreate) => api.post<BorrowRequest>('/inventory/borrowing/requests', data),

  approve: (id: string, payload: BorrowActionPayload = {}) =>
    api.post<BorrowRequest>(`/inventory/borrowing/requests/${id}/approve`, payload),

  reject: (id: string, payload: BorrowActionPayload = {}) =>
    api.post<BorrowRequest>(`/inventory/borrowing/requests/${id}/reject`, payload),

  release: (id: string, payload: BorrowActionPayload = {}) =>
    api.post<BorrowRequest>(`/inventory/borrowing/requests/${id}/release`, payload),

  return: (id: string, payload: BorrowReturnPayload = {}) =>
    api.post<BorrowRequest>(`/inventory/borrowing/requests/${id}/return`, payload),

  reopen: (id: string, payload: BorrowActionPayload = {}) =>
    api.post<BorrowRequest>(`/inventory/borrowing/requests/${id}/reopen`, payload),


  close: (id: string, payload: BorrowActionPayload = {}) =>
    api.post<BorrowRequest>(`/inventory/borrowing/requests/${id}/close`, payload),

  getEvents: (id: string) =>
    api.get<BorrowRequestEvent[]>(`/inventory/borrowing/requests/${id}/events`),

  getAllEvents: (params: BorrowEventsParams = {}) =>
    api.get<BorrowRequestEventGlobal[]>(`/inventory/borrowing/events${buildQueryString(params as Record<string, unknown>)}`),

  assignUnits: (id: string, payload: BorrowUnitAssignPayload) =>
    api.patch<BorrowRequestUnit[]>(`/inventory/borrowing/requests/${id}/assign-units`, payload),

  assignBatches: (id: string, payload: BorrowBatchAssignPayload) =>
    api.patch<BorrowRequestBatch[]>(`/inventory/borrowing/requests/${id}/assign-batches`, payload),

  getAssignedUnits: (id: string) =>
    api.get<BorrowRequestUnit[]>(`/inventory/borrowing/requests/${id}/units`),

  getAssignedBatches: (id: string) =>
    api.get<BorrowRequestBatch[]>(`/inventory/borrowing/requests/${id}/batches`),

  getReleaseReceipt: (id: string) =>
    api.get<ReleaseReceipt>(`/inventory/borrowing/requests/${id}/release-receipt`),

  saveSignature: (id: string, signatureData: string) =>
    api.post<BorrowRequest>(`/inventory/borrowing/requests/${id}/signature`, { signature_data: signatureData }),
};
