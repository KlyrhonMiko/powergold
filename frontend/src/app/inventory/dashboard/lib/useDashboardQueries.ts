import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../dashboard-api';

const STALE_TIME = 1000 * 60 * 5; // 5 minutes

export function useDashboardData() {
  const overviewQuery = useQuery({
    queryKey: ['inventory', 'dashboard', 'overview'],
    queryFn: async () => (await dashboardApi.getOverview()).data,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  return {
    stats: overviewQuery.data?.stats ?? null,
    recent: overviewQuery.data?.recent ?? [],
    lowStock: overviewQuery.data?.low_stock ?? [],
    pendingCounts: overviewQuery.data?.pending_counts ?? {},
    breakdown: overviewQuery.data?.inventory_breakdown ?? [],
    health: overviewQuery.data?.health ?? null,
    trends: overviewQuery.data?.trends ?? [],
    isLoading: overviewQuery.isLoading,
    isError: overviewQuery.isError,
  };
}
