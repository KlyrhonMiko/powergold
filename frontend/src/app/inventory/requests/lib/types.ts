export interface BorrowRecord {
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
  closed_at?: string;
  closed_by_user_id?: string;
  close_reason?: string;
}

export type BorrowAction =
  | 'approve'
  | 'reject'
  | 'release'
  | 'return'
  | 'reopen'
  | 'close';

export const STATUS_TABS = [
  'ALL',
  'pending',
  'approved',
  'released',
  'returned',
  'rejected',
] as const;

export type StatusTab = (typeof STATUS_TABS)[number];

export const DEFAULT_PER_PAGE = 10;
