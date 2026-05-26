'use client';

import { useAdminDashboardData } from './lib/useDashboardQueries';

import { DashboardHeader } from './components/DashboardHeader';
import { AdminStatsGrid } from './components/AdminStatsGrid';
import { ActivityHeatmap } from './components/ActivityHeatmap';
import { UserDistributionPanel } from './components/UserDistributionPanel';
import { SystemRegistryPanel } from './components/SystemRegistryPanel';

export default function AdminDashboard() {
  // Queries
  const { data, isLoading: loading } = useAdminDashboardData();

  const stats = data?.stats || null;
  const activity = data?.activity || [];
  const userInsights = data?.users || null;
  const registry = data?.registry || [];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <DashboardHeader />

      <AdminStatsGrid stats={stats} loading={loading} />

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ActivityHeatmap activity={activity} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <UserDistributionPanel insights={userInsights} loading={loading} />
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <div className="p-6 rounded-2xl bg-card border border-border">
            <h3 className="text-lg font-bold font-heading mb-2">Platform Announcements</h3>
            <div className="space-y-3 mt-4">
              <div className="p-4 rounded-xl bg-background border border-border/50 text-sm">
                System Audit Logs are now available under the &quot;Admin Audit Logs&quot; section.
              </div>
              <div className="p-4 rounded-xl bg-background border border-border/50 text-sm">
                Authentication and Platform settings can be managed in &quot;Admin Settings&quot;.
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-3">
          <SystemRegistryPanel registry={registry} loading={loading} />
        </div>
      </div>
    </div>
  );
}
