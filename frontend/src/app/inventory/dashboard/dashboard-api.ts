import { api } from '@/lib/api';

import type {
  InventoryDashboardOverview,
  DashboardStats,
  RecentTransaction,
  LowStockItem,
  PendingCounts,
  CategoryBreakdown,
  InventoryHealth,
  BorrowingTrend,
} from './lib/types';

export type {
  InventoryDashboardOverview,
  DashboardStats,
  RecentTransaction,
  LowStockItem,
  PendingCounts,
  CategoryBreakdown,
  InventoryHealth,
  BorrowingTrend,
} from './lib/types';

export const dashboardApi = {
  getOverview: () => api.get<InventoryDashboardOverview>('/inventory/dashboard/overview'),
  getStats: () => api.get<DashboardStats>('/inventory/dashboard/stats'),
  getRecent: () => api.get<RecentTransaction[]>('/inventory/dashboard/recent'),
  getLowStock: () => api.get<LowStockItem[]>('/inventory/dashboard/low-stock'),
  getPendingCounts: () => api.get<PendingCounts>('/inventory/dashboard/pending-counts'),
  getInventoryBreakdown: () => api.get<CategoryBreakdown[]>('/inventory/dashboard/inventory-breakdown'),
  getHealth: () => api.get<InventoryHealth>('/inventory/dashboard/health'),
  getTrends: () => api.get<BorrowingTrend[]>('/inventory/dashboard/trends'),
};
