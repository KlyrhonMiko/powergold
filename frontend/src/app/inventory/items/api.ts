import { api, buildQueryString } from '@/lib/api';

export interface PublicActiveBorrow {
  borrower_name: string;
  customer_name?: string;
  location_name?: string;
  released_at?: string;
  return_at?: string;
}

export interface PublicBorrowHistory {
  borrower_name: string;
  returned_at: string;
  location_name?: string;
}

export interface InventoryItem {
  id: string;
  item_id: string;
  name: string;
  category: string;
  total_qty: number;
  available_qty: number;
  condition: string;
  status_condition?: string;
  item_type?: string;
  classification?: string;
  unit_of_measure?: string | null;
  is_trackable?: boolean;
  description?: string;
  active_borrows?: PublicActiveBorrow[];
  borrow_history?: PublicBorrowHistory[];
}

export interface InventoryItemCreate {
  name: string;
  category?: string;
  item_type?: string;
  classification?: string;
  unit_of_measure?: string;
  is_trackable?: boolean;
  description?: string;
}

export type InventoryItemUpdate = Partial<InventoryItemCreate>;

export interface InventoryListParams {
  page?: number;
  per_page?: number;
  search?: string;
  category?: string;
  item_type?: string;
  classification?: string;
  is_trackable?: boolean;
  include_deleted?: boolean;
}

export interface ConfigRead {
  key: string;
  value: string;
  category: string;
  description?: string;
  crucial?: boolean;
}

export interface InventoryBatch {
  batch_id: string;
  inventory_uuid: string;
  total_qty: number;
  available_qty: number;
  expiration_date: string | null;
  status: string;
  received_at: string;
  description?: string;
  inventory_id?: string;
}

export interface InventoryBatchCreate {
  expiration_date?: string;
  status?: string;
  description?: string;
}

export interface InventoryBatchUpdate {
  expiration_date?: string;
  status?: string;
  description?: string;
}

export interface InventoryUnit {
  unit_id: string;
  serial_number: string;
  status: string;
  condition: string;
  expiration_date?: string | null;
  description?: string;
  active_borrow?: PublicActiveBorrow;
  borrow_history?: PublicBorrowHistory[];
}

export interface InventoryUnitListParams {
  page?: number;
  per_page?: number;
  status?: string;
  condition?: string;
  serial_number?: string;
  expiring_before?: string;
  include_expired?: boolean;
  search?: string;
}

export interface InventoryUnitCreate {
  serial_number: string;
  expiration_date?: string;
  condition?: string;
  description?: string;
}

export interface InventoryUnitUpdate {
  status?: string;
  condition?: string;
  expiration_date?: string;
  description?: string;
}

export interface InventoryMovement {
  movement_id: string;
  qty_change: number;
  movement_type: string;
  occurred_at: string;
  note?: string;
  reference_id?: string;
  reference_type?: string;
  borrower_name?: string;
  customer_name?: string;
  location_name?: string;
}

export type InventoryMovementSummary = Record<string, unknown>;

export interface StockAdjustmentPayload {
  qty_change: number;
  movement_type: string;
  reason_code?: string;
  reference_id?: string;
  reference_type?: string;
  batch_id?: string;
  note: string;
}

export const inventoryApi = {
  getConfigs: (category: string) =>
    api.get<ConfigRead[]>(`/inventory/config/inventory?category=${category}&per_page=100`),

  list: (params: InventoryListParams = {}) =>
    api.get<InventoryItem[]>(`/inventory/items${buildQueryString(params as Record<string, unknown>)}`),

  get: (id: string) => api.get<InventoryItem>(`/inventory/items/${id}`),
  getPublic: (id: string) => api.get<InventoryItem>(`/inventory/public/items/${id}`),

  create: (data: InventoryItemCreate) => api.post<InventoryItem>('/inventory/items', data),

  update: (id: string, data: InventoryItemUpdate) =>
    api.patch<InventoryItem>(`/inventory/items/${id}`, data),

  delete: (id: string) => api.delete<InventoryItem>(`/inventory/items/${id}`),

  restore: (id: string) => api.post<InventoryItem>(`/inventory/items/${id}/restore`, {}),

  // Units
  listUnits: (itemId: string, params: InventoryUnitListParams = {}) =>
    api.get<InventoryUnit[]>(`/inventory/items/${itemId}/units${buildQueryString(params as Record<string, unknown>)}`),

  listPublicUnits: (itemId: string, params: InventoryUnitListParams = {}) =>
    api.get<InventoryUnit[]>(`/inventory/public/items/${itemId}/units${buildQueryString(params as Record<string, unknown>)}`),

  createUnit: (itemId: string, data: InventoryUnitCreate) =>
    api.post<InventoryUnit>(`/inventory/items/${itemId}/units`, data),

  createUnitsBatch: (itemId: string, units: InventoryUnitCreate[]) =>
    api.post<InventoryUnit[]>(`/inventory/items/${itemId}/units/batch`, { units }),

  updateUnit: (itemId: string, unitId: string, data: InventoryUnitUpdate) =>
    api.patch<InventoryUnit>(`/inventory/items/${itemId}/units/${unitId}`, data),

  retireUnit: (itemId: string, unitId: string) =>
    api.delete<InventoryUnit>(`/inventory/items/${itemId}/units/${unitId}`),

  // Batches
  listBatches: (itemId: string, params: { page?: number; per_page?: number; status?: string; include_expired?: boolean } = {}) =>
    api.get<InventoryBatch[]>(`/inventory/items/${itemId}/batches${buildQueryString(params as Record<string, unknown>)}`),

  createBatch: (itemId: string, data: InventoryBatchCreate) =>
    api.post<InventoryBatch>(`/inventory/items/${itemId}/batches`, data),

  updateBatch: (itemId: string, batchId: string, data: InventoryBatchUpdate) =>
    api.patch<InventoryBatch>(`/inventory/items/${itemId}/batches/${batchId}`, data),

  adjustStock: (itemId: string, data: StockAdjustmentPayload) =>
    api.post<InventoryItem>(`/inventory/items/${itemId}/adjust-stock`, data),

  // Movements
  getHistory: (itemId: string, params: { page?: number; per_page?: number; movement_type?: string } = {}) =>
    api.get<InventoryMovement[]>(`/inventory/items/${itemId}/movement-history${buildQueryString(params as Record<string, unknown>)}`),

  getSummary: (itemId: string) =>
    api.get<InventoryMovementSummary>(`/inventory/items/${itemId}/movements/summary`),

  reconcile: (itemId: string) =>
    api.post<InventoryMovementSummary>(`/inventory/items/${itemId}/movements/reconcile`, {}),
};
