import { api, buildQueryString } from '@/lib/api';
import { buildApiRequestUrl } from '@/lib/apiPath';

export interface BorrowCatalogItem {
  item_id: string;
  name: string;
  category: string;
  total_qty: number;
  available_qty: number;
  condition: string;
  is_trackable: boolean;
  item_type?: string;
  classification?: string;
  unit_of_measure?: string | null;
  description?: string;
  status_condition?: string;
}

interface BorrowCatalogParams {
  page?: number;
  per_page?: number;
  search?: string;
  category?: string;
  item_type?: string;
  classification?: string;
  in_stock_only?: boolean;
}

interface CreateBatchBorrowPayload {
  items: {
    item_id: string;
    qty_requested: number;
  }[];
  notes: string;
  customer_name: string;
  location_name: string;
  return_at?: string;
}

interface BorrowerLoginPayload {
  username: string;
  password: string;
}

interface BorrowerTokenResponse {
  access_token: string;
  token_type: string;
}

export const posApi = {
  listCatalog: (params: BorrowCatalogParams = {}) =>
    api.get<BorrowCatalogItem[]>(
      `/inventory/borrower/catalog${buildQueryString(params as Record<string, unknown>)}`
    ),

  // Submit multi-item borrow request through public borrower flow
  createBatchBorrow: (data: CreateBatchBorrowPayload) =>
    api.post('/inventory/borrower/requests', data),

  borrowerLogin: async (credentials: BorrowerLoginPayload): Promise<BorrowerTokenResponse> => {
    const body = new FormData();
    body.append('username', credentials.username);
    body.append('password', credentials.password);

    const deviceId = await api.getDeviceId();
    const response = await fetch(buildApiRequestUrl('/auth/borrower/login'), {
      method: 'POST',
      body,
      headers: {
        'X-Device-ID': deviceId,
      },
    });

    const payload = await response.json().catch(() => ({} as Record<string, unknown>));

    if (!response.ok) {
      const message =
        (typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : null) ||
        (typeof payload === 'object' && payload && 'detail' in payload && typeof payload.detail === 'string'
          ? payload.detail
          : null) ||
        'Invalid borrower pin';
      throw new Error(message);
    }

    const data =
      typeof payload === 'object' && payload && 'data' in payload
        ? (payload.data as BorrowerTokenResponse)
        : (payload as BorrowerTokenResponse);

    if (!data?.access_token) {
      throw new Error('Invalid borrower login response');
    }

    return data;
  },

  revokeBorrowerSession: async (accessToken: string) => {
    try {
      await fetch(buildApiRequestUrl('/auth/logout'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        keepalive: true,
      });
    } catch {
      // Best-effort cleanup for temporary borrower verification sessions.
    }
  },
};
