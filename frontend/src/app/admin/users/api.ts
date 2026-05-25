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
};
