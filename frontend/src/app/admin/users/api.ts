import { api, buildQueryString } from '@/lib/api';

export interface User {
  user_id: string; // Display ID (e.g. USER-XXXXXX)
  username: string;
  email?: string | null;
  first_name: string;
  last_name: string;
  middle_name?: string;
  contact_number?: string;
  employee_id?: string;
  role: string;
  shift_type: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeneratedUserCredentials {
  one_time_login_password: string;
  secondary_password?: string | null;
}

export interface UserCreateResult {
  user: User;
  generated_credentials: GeneratedUserCredentials | null;
}

export interface UserSecondaryPasswordResult {
  user_id: string;
  secondary_password: string;
  rotated_at: string | null;
}

export interface UserLoginPasswordResetResult {
  user_id: string;
  generated_credentials: GeneratedUserCredentials;
  must_change_password: boolean;
}

export interface UserLoginPasswordResetRequest {
  secondary_password: string;
}

export interface UserCreate {
  username: string;
  email?: string;
  password?: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  contact_number?: string;
  employee_id?: string;
  role: string;
  shift_type: string;
}

export type UserUpdate = Partial<UserCreate> & {
  change_password?: boolean;
};

export interface UserListParams {
  page?: number;
  per_page?: number;
  search?: string;
  role?: string;
  shift_type?: string;
  is_active?: boolean;
}

export interface AuthConfig {
  id: string;
  key: string;
  value: string;
  category: string;
  description?: string;
}

export interface UserTwoFactorStatus {
  enabled: boolean;
  method: string;
  enrolled_at: string | null;
}

export interface UserTwoFactorEnrollmentInitiateResponse {
  method: string;
  secret: string;
  provisioning_uri: string;
}

export interface SecurityPasswordRules {
  min_length: number;
}

export interface SecuritySettingsSummary {
  password_rules: SecurityPasswordRules;
}

export interface EntrustedItem {
  assignment_id: string;
  unit_id: string;
  serial_number: string | null;
  item_name: string | null;
  item_category: string | null;
  assigned_to_user_id: string;
  assigned_to_name?: string;
  assigned_by_user_id: string | null;
  assigned_at: string;
  returned_by_user_id: string | null;
  returned_at: string | null;
  notes: string | null;
}

export interface EntrustedItemCreate {
  unit_id: string;
  user_id: string;
  notes?: string;
}

export interface EntrustedItemRevoke {
  notes?: string;
}

export interface UserImportHistoryErrorLogEntry {
  row?: number | string;
  error?: string;
  data?: Record<string, unknown>;
}

export interface UserImportHistoryItem {
  id: string;
  filename: string;
  actor_id: string;
  total_rows: number;
  success_count: number;
  error_count: number;
  status: string;
  created_at: string;
  error_log?: UserImportHistoryErrorLogEntry[];
  has_credentials_download?: boolean;
}

export interface UserImportRowIssue {
  field: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface UserImportPreviewRow {
  row_number: number;
  original_values: Record<string, string>;
  normalized_values: Record<string, string>;
  resolved_values: Record<string, string>;
  status: 'ready' | 'warning' | 'error' | 'info';
  issues: UserImportRowIssue[];
  action: string | null;
  stock_interpretation: string;
  duplicate_type: string | null;
  duplicate_subtype: string | null;
  recommended_action: string | null;
  selected_action: string | null;
  requires_user_decision: boolean;
  group_key: string | null;
  target_match_summary: string | null;
}

export interface UserImportDuplicateGroup {
  key: string;
  label: string;
  count: number;
  severity: string;
  recommended_action: string | null;
  requires_user_decision: boolean;
}

export interface UserImportPreviewSummary {
  preview_id: string;
  filename: string;
  mode: string;
  delimiter: string;
  encoding: string;
  bom_detected: boolean;
  file_size: number;
  total_rows: number;
  ready_count: number;
  warning_count: number;
  error_count: number;
  info_count: number;
  file_issues: UserImportRowIssue[];
  can_apply: boolean;
  headers: string[];
  duplicate_groups: UserImportDuplicateGroup[];
  auto_resolved_count: number;
  decision_required_count: number;
  unresolved_blocker_count: number;
}

export interface UserImportApplyResult {
  history_id: string;
  status: string;
  total: number;
  success: number;
  failed: number;
  has_credentials_download: boolean;
}

export const userApi = {
  list: (params: UserListParams = {}) =>
    api.get<User[]>(`/admin/users${buildQueryString(params as Record<string, unknown>)}`),

  get: (userId: string) =>
    api.get<User>(`/admin/users/${userId}`),

  register: (data: UserCreate) =>
    api.post<UserCreateResult>('/admin/users/register', data),

  update: (userId: string, data: UserUpdate) =>
    api.patch<User>(`/admin/users/${userId}`, data),

  delete: (userId: string) =>
    api.delete<User>(`/admin/users/${userId}`),

  restore: (userId: string) =>
    api.post<User>(`/admin/users/${userId}/restore`),

  resetTwoFactor: (userId: string) =>
    api.post<UserTwoFactorStatus>(`/admin/users/${userId}/2fa/reset`),

  getTwoFactorStatus: (userId: string) =>
    api.get<UserTwoFactorStatus>(`/admin/users/${userId}/2fa/status`),

  initiateTwoFactorEnrollment: (userId: string) =>
    api.post<UserTwoFactorEnrollmentInitiateResponse>(`/admin/users/${userId}/2fa/enroll/initiate`),

  verifyTwoFactorEnrollment: (userId: string, code: string) =>
    api.post<UserTwoFactorStatus>(`/admin/users/${userId}/2fa/enroll/verify`, { code }),

  getSecondaryPassword: (userId: string) =>
    api.get<UserSecondaryPasswordResult>(`/admin/users/${userId}/secondary-password`),

  resetLoginPassword: (userId: string, payload: UserLoginPasswordResetRequest) =>
    api.post<UserLoginPasswordResetResult>(`/admin/users/${userId}/reset-login-password`, payload),

  getConfigs: (category: string) =>
    api.get<AuthConfig[]>(`/auth/config?category=${category}`),

  getSecuritySettings: () =>
    api.get<SecuritySettingsSummary>('/admin/settings/security'),

  getAllEntrustedItems: (params: { page?: number; per_page?: number; search?: string, status?: string, category?: string, classification?: string } = {}) =>
    api.get<EntrustedItem[]>(`/admin/users/entrusted-items/all${buildQueryString(params as Record<string, unknown>)}`),

  getEntrustedItems: (userId: string) =>
    api.get<EntrustedItem[]>(`/admin/users/entrusted-items/${userId}`),

  getEntrustedCategories: () =>
    api.get<{ categories: string[], classifications: string[] }>('/admin/users/entrusted-items/categories'),

  assignEntrustedItem: (userId: string, data: EntrustedItemCreate) =>
    api.post<EntrustedItem>(`/admin/users/${userId}/entrusted-items`, data),

  revokeEntrustedItem: (userId: string, assignmentId: string, data: EntrustedItemRevoke) =>
    api.post<EntrustedItem>(`/admin/users/${userId}/entrusted-items/${assignmentId}/revoke`, data),

  exportEntrustedItems: (params: { format: string; search?: string, status?: string, category?: string, classification?: string }) =>
    api.getRaw(`/inventory/data/export/entrusted${buildQueryString(params as Record<string, unknown>)}`),

  getImportHistory: (page: number, perPage: number) =>
    api.get<UserImportHistoryItem[]>(`/admin/users/import/history?page=${page}&per_page=${perPage}`),

  previewImport: (file: File, mode: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<UserImportPreviewSummary>(`/admin/users/import/preview?mode=${mode}`, formData);
  },

  getImportPreview: (previewId: string) =>
    api.get<UserImportPreviewSummary>(`/admin/users/import/preview/${previewId}`),

  getImportPreviewRows: (previewId: string, page: number, perPage: number, filterStatus: string, groupKey?: string | null) =>
    api.get<UserImportPreviewRow[]>(
      `/admin/users/import/preview/${previewId}/rows?page=${page}&per_page=${perPage}&filter_status=${filterStatus}${groupKey ? `&group_key=${encodeURIComponent(groupKey)}` : ''}`
    ),

  updateImportPreviewRow: (previewId: string, rowNumber: number, updates: Record<string, string>) =>
    api.patch<UserImportPreviewRow>(`/admin/users/import/preview/${previewId}/rows/${rowNumber}`, { updates }),

  acceptRecommendedImportActions: (previewId: string) =>
    api.post<{ accepted: number }>(`/admin/users/import/preview/${previewId}/actions/accept-recommended`),

  setImportRowAction: (previewId: string, rowNumber: number, action: string) =>
    api.post<UserImportPreviewRow>(`/admin/users/import/preview/${previewId}/actions/row/${rowNumber}`, { action }),

  ignoreAllImportBlockers: (previewId: string) =>
    api.post<{ ignored: number }>(`/admin/users/import/preview/${previewId}/actions/ignore-all-blockers`),

  applyImportPreview: (previewId: string) =>
    api.post<UserImportApplyResult>(`/admin/users/import/preview/${previewId}/apply`),

  downloadImportTemplate: () =>
    api.getRaw('/admin/users/import/template'),

  downloadCorrectedImportCsv: (previewId: string) =>
    api.getRaw(`/admin/users/import/preview/${previewId}/download`),

  downloadImportCredentials: (previewId: string) =>
    api.getRaw(`/admin/users/import/preview/${previewId}/credentials`),

  downloadImportCredentialsFromHistory: (historyId: string) =>
    api.getRaw(`/admin/users/import/history/${historyId}/credentials`),
};
