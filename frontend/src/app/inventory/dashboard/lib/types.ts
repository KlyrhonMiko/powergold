export interface DashboardStats {
  total_equipment: number;
  items_borrowed: number;
  active_users: number;
  low_stock_items: number;
  
  active_requests: number;
  overdue_returns: number;
  expiring_items: number;
  emergency_requests: number;
  compliance_followup: number;
  
  items_in_maintenance: number;
  items_with_poor_condition: number;
}

export interface MetricCount {
  label: string;
  count: number;
}

export interface InventoryHealth {
  item_statuses: MetricCount[];
  item_conditions: MetricCount[];
  unit_statuses: MetricCount[];
  unit_conditions: MetricCount[];
  batch_statuses: MetricCount[];
  batch_conditions: MetricCount[];
}

export interface BorrowingTrend {
  date: string;
  count: number;
}

export interface RecentTransactionItem {
  item_id: string;
  name: string;
  qty_requested: number;
  classification?: string;
  item_type?: string;
  unit_of_measure?: string | null;
}

export interface RecentTransaction {
  request_id: string;
  transaction_ref: string;
  borrower_user_id?: string;
  borrower_name?: string;
  customer_name?: string;
  location_name?: string;
  items: RecentTransactionItem[];
  status: string;
  request_date: string;
  is_emergency: boolean;
}

export interface LowStockItem {
  item_id: string;
  name: string;
  category: string | null;
  unit_of_measure?: string | null;
  available_qty: number;
  total_qty: number;
}

export interface PendingCounts {
  [status: string]: number;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
}

export interface InventoryDashboardOverview {
  stats: DashboardStats;
  recent: RecentTransaction[];
  low_stock: LowStockItem[];
  pending_counts: PendingCounts;
  inventory_breakdown: CategoryBreakdown[];
  health: InventoryHealth;
  trends: BorrowingTrend[];
}
