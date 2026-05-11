export interface SystemSetting {
  key: string;
  value: string;
  category: string;
  description: string | null;
  crucial: boolean;
}

export interface SystemSettingCreate {
  key: string;
  value: string;
  category?: string;
  description?: string;
}

export interface SettingsListParams {
  page?: number;
  per_page?: number;
  key?: string;
  category?: string;
}

export type SystemSettingFormData = SystemSettingCreate & {
  category: string;
  description: string;
};

// import preview types

export interface RowIssue {
  field: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface PreviewRow {
  row_number: number;
  original_values: Record<string, string>;
  normalized_values: Record<string, string>;
  resolved_values: Record<string, string>;
  status: 'ready' | 'warning' | 'error' | 'info';
  issues: RowIssue[];
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

export interface DuplicateGroup {
  key: string;
  label: string;
  count: number;
  severity: string;
  recommended_action: string | null;
  requires_user_decision: boolean;
}

export interface PreviewSummary {
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
  file_issues: RowIssue[];
  can_apply: boolean;
  headers: string[];
  duplicate_groups: DuplicateGroup[];
  auto_resolved_count: number;
  decision_required_count: number;
  unresolved_blocker_count: number;
}

export interface ApplyResult {
  history_id: string;
  status: string;
  total: number;
  success: number;
  failed: number;
}

