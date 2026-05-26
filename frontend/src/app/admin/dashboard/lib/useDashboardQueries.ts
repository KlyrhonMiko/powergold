import { useQuery } from '@tanstack/react-query';
import { adminDashboardApi } from '../dashboard-api';

const STALE_TIME_DASHBOARD = 1000 * 60; // 1 minute

export function useAdminDashboardData() {
  return useQuery({
    queryKey: ['admin', 'dashboard', 'all'],
    queryFn: async () => (await adminDashboardApi.getOverview()).data,
    staleTime: STALE_TIME_DASHBOARD,
  });
}
