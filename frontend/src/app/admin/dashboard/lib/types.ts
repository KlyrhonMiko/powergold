export interface AdminStats {
  total_users: number;
  active_sessions: number;
  audit_log_count_24h: number;
  last_backup_time: string | null;
  last_backup_status: string | null;
}

export interface ActivityPoint {
  hour: number;
  count: number;
}

export interface RoleDistribution {
  role: string;
  count: number;
}

export interface UserTrend {
  date: string;
  count: number;
}

export interface UserInsights {
  distribution: RoleDistribution[];
  trends: UserTrend[];
}

export interface SystemRegistry {
  entity: string;
  count: number;
}

export interface AdminDashboardOverview {
  stats: AdminStats;
  activity: ActivityPoint[];
  users: UserInsights;
  registry: SystemRegistry[];
}
