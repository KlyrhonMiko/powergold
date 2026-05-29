# system_init_data.py

SYSTEM_CONFIGS = [
    # Inventory Item Types
    {"system": "inventory", "key": "electronics", "value": "Electronics", "category": "inventory_item_type", "description": "Electronic devices and components"},
    {"system": "inventory", "key": "tools", "value": "Tools", "category": "inventory_item_type", "description": "Hand tools and power tools"},
    {"system": "inventory", "key": "furniture", "value": "Furniture", "category": "inventory_item_type", "description": "Furniture and fixtures"},
    {"system": "inventory", "key": "cleaning_supplies", "value": "Cleaning Supplies", "category": "inventory_item_type", "description": "Cleaning supplies and materials"},
    {"system": "inventory", "key": "disposables", "value": "Disposables", "category": "inventory_item_type", "description": "Disposable items for single use"},
    {"system": "inventory", "key": "chemicals", "value": "Chemicals", "category": "inventory_item_type", "description": "Chemical products and solutions"},
    {"system": "inventory", "key": "pharmaceuticals", "value": "Pharmaceuticals", "category": "inventory_item_type", "description": "Pharmaceutical products and medications"},

    # Inventory Classification
    {"system": "inventory", "key": "equipment", "value": "Equipment", "category": "inventory_classification", "description": "Durable equipment for repeated use"},
    {"system": "inventory", "key": "consumable", "value": "Consumable", "category": "inventory_classification", "description": "Consumable items that are used up"},
    {"system": "inventory", "key": "perishable", "value": "Perishable", "category": "inventory_classification", "description": "Perishable items with expiration dates"},

    # Inventory Item Status
    {"system": "inventory", "key": "healthy", "value": "Healthy", "category": "inventory_status", "description": "Item has healthy stock level"},
    {"system": "inventory", "key": "low_stock", "value": "Low Stock", "category": "inventory_status", "description": "Item stock is below threshold"},
    {"system": "inventory", "key": "out_of_stock", "value": "Out of Stock", "category": "inventory_status", "description": "Item has no available stock"},
    {"system": "inventory", "key": "near_expiry", "value": "Near Expiry", "category": "inventory_status", "description": "Perishable item has near-expiry stock"},

    # Inventory Item Condition
    {"system": "inventory", "key": "excellent", "value": "Excellent", "category": "inventory_condition", "description": "Item is in excellent condition"},
    {"system": "inventory", "key": "good", "value": "Good", "category": "inventory_condition", "description": "Item is in good condition"},
    {"system": "inventory", "key": "fair", "value": "Fair", "category": "inventory_condition", "description": "Item has minor wear"},
    {"system": "inventory", "key": "poor", "value": "Poor", "category": "inventory_condition", "description": "Item is in poor condition"},
    {"system": "inventory", "key": "unusable", "value": "Unusable", "category": "inventory_condition", "description": "Item is unusable"},

    # Inventory Categories
    {"system": "inventory", "key": "items_tools", "value": "ITEMS/TOOLS", "category": "inventory_category", "description": "General equipment and tools used for maintenance operations"},
    {"system": "inventory", "key": "declogging", "value": "DECLOGGING", "category": "inventory_category", "description": "Tools and materials used for declogging activities"},
    {"system": "inventory", "key": "cmp_pm_acu_pm", "value": "CMP PM / ACU PM", "category": "inventory_category", "description": "Preventive maintenance tools for CMP and ACU workflows"},
    {"system": "inventory", "key": "pm_set_electrical", "value": "PM SET (ELECTRICAL)", "category": "inventory_category", "description": "Electrical preventive maintenance tool sets"},
    {"system": "inventory", "key": "pm_of_accu_fcu", "value": "PM OF ACCU & FCU", "category": "inventory_category", "description": "Preventive maintenance assets for ACCU and FCU units"},
    {"system": "inventory", "key": "system_reprocess_replacement_compressor", "value": "SYSTEM REPROCESS & REPLACEMENT OF COMPRESSOR", "category": "inventory_category", "description": "Tools and consumables for system reprocess and compressor replacement"},
    {"system": "inventory", "key": "exhaust_pm", "value": "EXHAUST PM", "category": "inventory_category", "description": "Equipment used for exhaust preventive maintenance"},

    # Inventory Units Of Measure
    {"system": "inventory", "key": "pc", "value": "pc", "category": "inventory_unit_of_measure", "description": "Piece-based quantity"},
    {"system": "inventory", "key": "pack", "value": "pack", "category": "inventory_unit_of_measure", "description": "Pack-based quantity"},
    {"system": "inventory", "key": "roll", "value": "roll", "category": "inventory_unit_of_measure", "description": "Roll-based quantity"},
    {"system": "inventory", "key": "meter", "value": "meter", "category": "inventory_unit_of_measure", "description": "Meter-based quantity"},
    {"system": "inventory", "key": "can", "value": "can", "category": "inventory_unit_of_measure", "description": "Can-based quantity"},
    {"system": "inventory", "key": "sack", "value": "sack", "category": "inventory_unit_of_measure", "description": "Sack-based quantity"},
    {"system": "inventory", "key": "box", "value": "box", "category": "inventory_unit_of_measure", "description": "Box-based quantity"},
    {"system": "inventory", "key": "pair", "value": "pair", "category": "inventory_unit_of_measure", "description": "Pair-based quantity"},
    {"system": "inventory", "key": "tank", "value": "tank", "category": "inventory_unit_of_measure", "description": "Tank-based quantity"},
    {"system": "inventory", "key": "set", "value": "set", "category": "inventory_unit_of_measure", "description": "Set-based quantity"},
    {"system": "inventory", "key": "unit", "value": "unit", "category": "inventory_unit_of_measure", "description": "Generic unit-based quantity"},

    # Inventory Units Status
    {"system": "inventory", "key": "available", "value": "Available", "category": "inventory_units_status", "description": "Unit is available for borrowing"},
    {"system": "inventory", "key": "borrowed", "value": "Borrowed", "category": "inventory_units_status", "description": "Unit is currently borrowed"},
    {"system": "inventory", "key": "maintenance", "value": "Maintenance", "category": "inventory_units_status", "description": "Unit is under maintenance"},
    {"system": "inventory", "key": "retired", "value": "Retired", "category": "inventory_units_status", "description": "Unit has been retired from service"},
    {"system": "inventory", "key": "consumed", "value": "Consumed", "category": "inventory_units_status", "description": "Unit has been consumed"},
    {"system": "inventory", "key": "expired", "value": "Expired", "category": "inventory_units_status", "description": "Unit has expired"},
    {"system": "inventory", "key": "discarded", "value": "Discarded", "category": "inventory_units_status", "description": "Unit has been discarded"},

    # Inventory Units Condition
    {"system": "inventory", "key": "excellent", "value": "Excellent", "category": "inventory_units_condition", "description": "Unit is in excellent condition"},
    {"system": "inventory", "key": "good", "value": "Good", "category": "inventory_units_condition", "description": "Unit is in good condition"},
    {"system": "inventory", "key": "fair", "value": "Fair", "category": "inventory_units_condition", "description": "Unit is in fair condition with minor wear"},
    {"system": "inventory", "key": "poor", "value": "Poor", "category": "inventory_units_condition", "description": "Unit is in poor condition with damage"},
    {"system": "inventory", "key": "unusable", "value": "Unusable", "category": "inventory_units_condition", "description": "Unit is unusable"},

    # Inventory Movement Types
    {"system": "inventory", "key": "manual_adjustment", "value": "Manual Adjustment", "category": "inventory_movements_movement_type", "description": "Manual stock adjustment"},
    {"system": "inventory", "key": "borrow_release", "value": "Borrow Release", "category": "inventory_movements_movement_type", "description": "Unit released for borrowing"},
    {"system": "inventory", "key": "borrow_return", "value": "Borrow Return", "category": "inventory_movements_movement_type", "description": "Unit returned from borrowing"},
    {"system": "inventory", "key": "entrusted_assign", "value": "Entrusted Assignment", "category": "inventory_movements_movement_type", "description": "Unit assigned to an employee permanently"},
    {"system": "inventory", "key": "entrusted_revoke", "value": "Entrusted Revoke", "category": "inventory_movements_movement_type", "description": "Unit returned from entrusted assignment"},
    {"system": "inventory", "key": "procurement", "value": "Procurement", "category": "inventory_movements_movement_type", "description": "New unit procured"},
    {"system": "inventory", "key": "reversal", "value": "Reversal", "category": "inventory_movements_movement_type", "description": "Reversal of previous movement"},
    {"system": "inventory", "key": "maintenance", "value": "Maintenance", "category": "inventory_movements_movement_type", "description": "Unit is under maintenance"},
    {"system": "inventory", "key": "maintenance_return", "value": "Maintenance Return", "category": "inventory_movements_movement_type", "description": "Unit returned from maintenance"},
    {"system": "inventory", "key": "retirement", "value": "Retirement", "category": "inventory_movements_movement_type", "description": "Unit has been retired from service"},
    {"system": "inventory", "key": "consumption", "value": "Consumption", "category": "inventory_movements_movement_type", "description": "Unit has been consumed"},
    {"system": "inventory", "key": "expiration", "value": "Expiration", "category": "inventory_movements_movement_type", "description": "Unit has expired"},
    {"system": "inventory", "key": "discarded", "value": "Discarded", "category": "inventory_movements_movement_type", "description": "Unit has been discarded"},

    # Inventory Movement Reason Codes
    {"system": "inventory", "key": "manual_adjustment", "value": "Manual Adjustment", "category": "inventory_movements_reason_code", "description": "Manual stock adjustment"},
    {"system": "inventory", "key": "count_correction", "value": "Count Correction", "category": "inventory_movements_reason_code", "description": "Stock count correction"},

    # Inventory Threshold & Alert Settings
    {"system": "inventory", "key": "low_stock_threshold", "value": "20", "category": "inventory_threshold_alerts", "description": "Alert when stock falls below this % of total quantity"},
    {"system": "inventory", "key": "overstock_threshold", "value": "150", "category": "inventory_threshold_alerts", "description": "Alert when stock exceeds this % of total quantity"},
    {"system": "inventory", "key": "expiry_threshold", "value": "15", "category": "inventory_threshold_alerts", "description": "Alert when remaining shelf life is below this %"},
    {"system": "inventory", "key": "borrow_request_alert_duration", "value": "60", "category": "inventory_threshold_alerts", "description": "Duration for pending borrow request alerts"},
    {"system": "inventory", "key": "borrow_request_alert_unit", "value": "minutes", "category": "inventory_threshold_alerts", "description": "Time unit for borrow request alerts"},
    {"system": "inventory", "key": "notification_channels", "value": '["in-app", "email"]', "category": "inventory_threshold_alerts", "description": "Active channels for system notifications"},
    {"system": "inventory", "key": "alert_recipient_roles", "value": '["inventory_manager", "admin"]', "category": "inventory_threshold_alerts", "description": "Roles notified of inventory alerts"},
    {"system": "inventory", "key": "specific_recipients", "value": "[]", "category": "inventory_threshold_alerts", "description": "Specific individuals notified of inventory alerts"},
    {"system": "inventory", "key": "damage_writeoff", "value": "Damage / Write-off", "category": "inventory_movements_reason_code", "description": "Damaged stock write-off"},
    {"system": "inventory", "key": "loss_writeoff", "value": "Loss / Write-off", "category": "inventory_movements_reason_code", "description": "Lost stock write-off"},
    {"system": "inventory", "key": "procurement_correction", "value": "Procurement Correction", "category": "inventory_movements_reason_code", "description": "Procurement correction"},
    {"system": "inventory", "key": "return_correction", "value": "Return Correction", "category": "inventory_movements_reason_code", "description": "Borrow return correction"},
    {"system": "inventory", "key": "reversal_error", "value": "Reversal Error", "category": "inventory_movements_reason_code", "description": "Reversal due to incorrect ledger entry"},

    # Inventory Batch Status
    {"system": "inventory", "key": "healthy", "value": "11", "category": "inventory_batches_status", "description": "Stock level is healthy"},
    {"system": "inventory", "key": "low_stock", "value": "10", "category": "inventory_batches_status", "description": "Stock level is low (threshold)"},
    {"system": "inventory", "key": "out_of_stock", "value": "0", "category": "inventory_batches_status", "description": "Stock is depleted"},
    {"system": "inventory", "key": "near_expiry", "value": "7", "category": "inventory_batches_status", "description": "Batch is near expiration (days)"},
    {"system": "inventory", "key": "expired", "value": "0", "category": "inventory_batches_status", "description": "Batch has expired"},

    # Inventory Batch Condition
    {"system": "inventory", "key": "excellent", "value": "Excellent", "category": "inventory_batches_condition", "description": "Batch is in excellent condition"},
    {"system": "inventory", "key": "good", "value": "Good", "category": "inventory_batches_condition", "description": "Batch is in good condition"},
    {"system": "inventory", "key": "fair", "value": "Fair", "category": "inventory_batches_condition", "description": "Batch has minor issues"},
    {"system": "inventory", "key": "poor", "value": "Poor", "category": "inventory_batches_condition", "description": "Batch is in poor condition"},
    {"system": "inventory", "key": "unusable", "value": "Unusable", "category": "inventory_batches_condition", "description": "Batch is unusable"},

    # Weights
    {"system": "inventory", "key": "expired", "value": "100", "category": "inventory_units_status_weights", "description": "Weight for expired unit status"},
    {"system": "inventory", "key": "discarded", "value": "100", "category": "inventory_units_status_weights", "description": "Weight for discarded unit status"},
    {"system": "inventory", "key": "retired", "value": "100", "category": "inventory_units_status_weights", "description": "Weight for retired unit status"},
    {"system": "inventory", "key": "consumed", "value": "90", "category": "inventory_units_status_weights", "description": "Weight for consumed unit status"},
    {"system": "inventory", "key": "maintenance", "value": "80", "category": "inventory_units_status_weights", "description": "Weight for maintenance unit status"},
    {"system": "inventory", "key": "available", "value": "20", "category": "inventory_units_status_weights", "description": "Weight for available unit status"},
    {"system": "inventory", "key": "borrowed", "value": "20", "category": "inventory_units_status_weights", "description": "Weight for borrowed unit status"},

    {"system": "inventory", "key": "unusable", "value": "100", "category": "inventory_units_condition_weights", "description": "Weight for unusable unit condition"},
    {"system": "inventory", "key": "poor", "value": "80", "category": "inventory_units_condition_weights", "description": "Weight for poor unit condition"},
    {"system": "inventory", "key": "fair", "value": "30", "category": "inventory_units_condition_weights", "description": "Weight for fair unit condition"},
    {"system": "inventory", "key": "good", "value": "20", "category": "inventory_units_condition_weights", "description": "Weight for good unit condition"},
    {"system": "inventory", "key": "excellent", "value": "20", "category": "inventory_units_condition_weights", "description": "Weight for excellent unit condition"},

    {"system": "inventory", "key": "expired", "value": "100", "category": "inventory_batches_status_weights", "description": "Weight for expired batch status"},
    {"system": "inventory", "key": "near_expiry", "value": "60", "category": "inventory_batches_status_weights", "description": "Weight for near_expiry batch status"},
    {"system": "inventory", "key": "out_of_stock", "value": "50", "category": "inventory_batches_status_weights", "description": "Weight for out_of_stock batch status"},
    {"system": "inventory", "key": "low_stock", "value": "40", "category": "inventory_batches_status_weights", "description": "Weight for low_stock batch status"},
    {"system": "inventory", "key": "healthy", "value": "20", "category": "inventory_batches_status_weights", "description": "Weight for healthy batch status"},

    {"system": "inventory", "key": "unusable", "value": "100", "category": "inventory_batches_condition_weights", "description": "Weight for unusable batch condition"},
    {"system": "inventory", "key": "poor", "value": "80", "category": "inventory_batches_condition_weights", "description": "Weight for poor batch condition"},
    {"system": "inventory", "key": "fair", "value": "30", "category": "inventory_batches_condition_weights", "description": "Weight for fair batch condition"},
    {"system": "inventory", "key": "good", "value": "20", "category": "inventory_batches_condition_weights", "description": "Weight for good batch condition"},
    {"system": "inventory", "key": "excellent", "value": "20", "category": "inventory_batches_condition_weights", "description": "Weight for excellent batch condition"},

    # Borrow Request Workflow
    {"system": "borrower", "key": "pending", "value": "1", "category": "borrow_requests_status", "description": "Request awaiting approval"},
    {"system": "borrower", "key": "approved", "value": "2", "category": "borrow_requests_status", "description": "Request has been approved"},
    {"system": "borrower", "key": "released", "value": "3", "category": "borrow_requests_status", "description": "Items released to borrower"},
    {"system": "borrower", "key": "returned", "value": "4", "category": "borrow_requests_status", "description": "Items have been returned (terminal)"},
    {"system": "borrower", "key": "rejected", "value": "5", "category": "borrow_requests_status", "description": "Request rejected by approver (terminal)"},
    {"system": "borrower", "key": "closed", "value": "6", "category": "borrow_requests_status", "description": "Request administratively closed (terminal)"},
    {"system": "borrower", "key": "voided", "value": "7", "category": "borrow_requests_status", "description": "Request voided/cancelled after approval (terminal)"},

    {"system": "borrower", "key": "standard", "value": "Standard", "category": "borrow_requests_approval_channel", "description": "Standard approval workflow"},
    {"system": "borrower", "key": "emergency_bypass", "value": "Emergency Bypass", "category": "borrow_requests_approval_channel", "description": "Emergency bypass approval"},

    {"system": "borrower", "key": "inventory_manager", "value": "Inventory Manager", "category": "borrow_requests_request_channel", "description": "Request from inventory manager"},
    {"system": "borrower", "key": "borrower_portal", "value": "Borrower Portal", "category": "borrow_requests_request_channel", "description": "Request from borrower portal"},

    {"system": "borrower", "key": "created", "value": "Created", "category": "borrow_request_events_event_type", "description": "Request created"},
    {"system": "borrower", "key": "approved", "value": "Approved", "category": "borrow_request_events_event_type", "description": "Request approved"},
    {"system": "borrower", "key": "rejected", "value": "Rejected", "category": "borrow_request_events_event_type", "description": "Request rejected"},
    {"system": "borrower", "key": "voided", "value": "Voided", "category": "borrow_request_events_event_type", "description": "Request voided/cancelled"},
    {"system": "borrower", "key": "reopened", "value": "Reopened", "category": "borrow_request_events_event_type", "description": "Request reopened"},
    {"system": "borrower", "key": "released", "value": "Released", "category": "borrow_request_events_event_type", "description": "Items released"},
    {"system": "borrower", "key": "returned", "value": "Returned", "category": "borrow_request_events_event_type", "description": "Items returned"},
    {"system": "borrower", "key": "closed", "value": "Closed", "category": "borrow_request_events_event_type", "description": "Request closed"},
    {"system": "borrower", "key": "units_assigned", "value": "Units Assigned", "category": "borrow_request_events_event_type", "description": "Units assigned"},
    {"system": "borrower", "key": "unit_assignment_skipped", "value": "Unit Assignment Skipped", "category": "borrow_request_events_event_type", "description": "Unit assignment skipped"},

    # Participants
    {"system": "borrower", "key": "witness", "value": "Witness", "category": "borrow_participants_role_in_request", "description": "Witness to the borrow transaction"},
    {"system": "borrower", "key": "approver", "value": "Approver of the borrow request", "category": "borrow_participants_role_in_request", "description": "Approver of the borrow request"},
    {"system": "borrower", "key": "recipient", "value": "Recipient", "category": "borrow_participants_role_in_request", "description": "Recipient of borrowed items"},

    # User Management
    {"system": "admin", "key": "admin", "value": "ADMIN", "category": "users_role", "description": "Complete authority over user management, system configuration, and data overrides."},
    {"system": "admin", "key": "inventory_manager", "value": "IVTM", "category": "users_role", "description": "Owns inventory lifecycle, borrowing workflow approvals, stock controls, and inventory configuration management."},
    {"system": "admin", "key": "dispatch", "value": "DSPT", "category": "users_role", "description": "Operates release and return flow, validates units, and performs operational hand-offs."},
    {"system": "admin", "key": "borrower", "value": "BRWR", "category": "users_role", "description": "Uses the borrower portal to submit borrowing requests and track assigned inventory usage."},
    {"system": "admin", "key": "finance_manager", "value": "FINM", "category": "users_role", "description": "Monitors inventory performance, dashboard KPIs, and financial-impact configuration with read-heavy access."},
    {"system": "admin", "key": "accountant", "value": "ACCT", "category": "users_role", "description": "Reconciles inventory movements, reviews anomalies, and performs audit-ledger verification."},
    {"system": "admin", "key": "employee", "value": "EMPL", "category": "users_role", "description": "General staff with read access to inventory catalog and requested-items submission rights."},

    {"system": "admin", "key": "day", "value": "Day", "category": "users_shift_type", "description": "Day shift (typically 8am-5pm)"},
    {"system": "admin", "key": "night", "value": "Night", "category": "users_shift_type", "description": "Night shift (typically 5pm-2am)"},
    {"system": "admin", "key": "morning", "value": "Morning", "category": "users_shift_type", "description": "Morning shift (typically 6am-2pm)"},
    {"system": "admin", "key": "evening", "value": "Evening", "category": "users_shift_type", "description": "Evening shift (typically 2pm-10pm)"},

    # Security Settings (Auth Source of Truth)
    {"system": "admin", "key": "two_factor_enabled", "value": "true", "category": "security_settings", "description": "Enable or disable mandatory two-factor authentication policy."},
    {"system": "admin", "key": "two_factor_method", "value": "authenticator_app", "category": "security_settings", "description": "Two-factor method policy for the security settings page."},
    {"system": "admin", "key": "two_factor_enforce_for_roles", "value": '["admin", "inventory_manager", "finance_manager"]', "category": "security_settings", "description": "Roles that require authenticator-app two-factor verification."},
    {"system": "admin", "key": "two_factor_enforce_on", "value": "next_login", "category": "security_settings", "description": "When two-factor requirements are enforced for covered roles."},
    {"system": "admin", "key": "password_min_length", "value": "6", "category": "security_settings", "description": "Minimum required password length."},
    {"system": "admin", "key": "password_require_uppercase", "value": "false", "category": "security_settings", "description": "Require uppercase characters in passwords."},
    {"system": "admin", "key": "password_require_lowercase", "value": "false", "category": "security_settings", "description": "Require lowercase characters in passwords."},
    {"system": "admin", "key": "password_require_number", "value": "false", "category": "security_settings", "description": "Require numeric characters in passwords."},
    {"system": "admin", "key": "password_require_special", "value": "false", "category": "security_settings", "description": "Require special characters in passwords."},
    {"system": "admin", "key": "password_applies_when_role_not_in", "value": '["borrower", "dispatch"]', "category": "security_settings", "description": "Roles excluded from password rule enforcement."},
    {"system": "admin", "key": "session_inactive_minutes", "value": "30", "category": "security_settings", "description": "Session inactivity timeout duration in minutes."},
    {"system": "admin", "key": "session_warning_minutes", "value": "5", "category": "security_settings", "description": "Session timeout warning lead time in minutes."},
    {"system": "admin", "key": "secondary_password_rotation_interval_days", "value": "30", "category": "security_settings", "description": "How often secondary passwords rotate automatically in days."},

    # Shift Definitions (Auth Source of Truth)
    {"system": "admin", "key": "day", "value": '{"label":"Day","start":"08:00","end":"17:00","days":[1,2,3,4,5]}', "category": "users_shift_definition", "description": "Rich shift semantics used by the security settings page."},
    {"system": "admin", "key": "night", "value": '{"label":"Night","start":"17:00","end":"02:00","days":[1,2,3,4,5]}', "category": "users_shift_definition", "description": "Rich shift semantics used by the security settings page."},
    {"system": "admin", "key": "morning", "value": '{"label":"Morning","start":"06:00","end":"14:00","days":[1,2,3,4,5]}', "category": "users_shift_definition", "description": "Rich shift semantics used by the security settings page."},
    {"system": "admin", "key": "evening", "value": '{"label":"Evening","start":"14:00","end":"22:00","days":[1,2,3,4,5]}', "category": "users_shift_definition", "description": "Rich shift semantics used by the security settings page."},

    # Backup & Audit Taxonomies
    {"system": "admin", "key": "local", "value": "local", "category": "backup_runs_destination", "description": "Local filesystem destination"},
    {"system": "admin", "key": "s3", "value": "s3", "category": "backup_runs_destination", "description": "Amazon S3 bucket destination"},
    {"system": "admin", "key": "both", "value": "both", "category": "backup_runs_destination", "description": "Both local and S3 destinations"},

    {"system": "admin", "key": "pending", "value": "Pending", "category": "backup_runs_status", "description": "Backup run pending"},
    {"system": "admin", "key": "running", "value": "Running", "category": "backup_runs_status", "description": "Backup run in progress"},
    {"system": "admin", "key": "completed", "value": "Completed", "category": "backup_runs_status", "description": "Backup run completed successfully"},
    {"system": "admin", "key": "failed", "value": "Failed", "category": "backup_runs_status", "description": "Backup run failed"},

    {"system": "admin", "key": "local", "value": "Local", "category": "backup_artifacts_target_type", "description": "Local filesystem backup"},
    {"system": "admin", "key": "s3", "value": "S3", "category": "backup_artifacts_target_type", "description": "Amazon S3 bucket backup"},

    {"system": "admin", "key": "inventory", "value": "Inventory", "category": "audit_logs_entity_type", "description": "Inventory item entity"},
    {"system": "admin", "key": "inventory_unit", "value": "Inventory Unit", "category": "audit_logs_entity_type", "description": "Inventory unit entity"},
    {"system": "admin", "key": "inventory_movement", "value": "Inventory Movement", "category": "audit_logs_entity_type", "description": "Inventory movement entity"},
    {"system": "admin", "key": "borrow_request", "value": "Borrow Request", "category": "audit_logs_entity_type", "description": "Borrow request entity"},
    {"system": "admin", "key": "user", "value": "User", "category": "audit_logs_entity_type", "description": "User entity"},
    {"system": "admin", "key": "system_setting", "value": "System Setting", "category": "audit_logs_entity_type", "description": "System configuration entity"},
    {"system": "admin", "key": "audit_log", "value": "Audit Log", "category": "audit_logs_entity_type", "description": "System audit log entity"},

    {"system": "admin", "key": "create", "value": "Create", "category": "audit_logs_action", "description": "Entity created"},
    {"system": "admin", "key": "update", "value": "Update", "category": "audit_logs_action", "description": "Entity updated"},
    {"system": "admin", "key": "delete", "value": "Delete", "category": "audit_logs_action", "description": "Entity deleted"},
    {"system": "admin", "key": "approve", "value": "Approve", "category": "audit_logs_action", "description": "Request approved"},
    {"system": "admin", "key": "reject", "value": "Reject", "category": "audit_logs_action", "description": "Request rejected"},
    {"system": "admin", "key": "release", "value": "Release", "category": "audit_logs_action", "description": "Items released"},
    {"system": "admin", "key": "return", "value": "Return", "category": "audit_logs_action", "description": "Items returned"},
    {"system": "admin", "key": "assign", "value": "Assign", "category": "audit_logs_action", "description": "Units assigned"},
    {"system": "admin", "key": "adjust_stock", "value": "Adjust Stock", "category": "audit_logs_action", "description": "Stock adjustment"},
    {"system": "admin", "key": "transition", "value": "Transition", "category": "audit_logs_action", "description": "Status transition"},
    {"system": "admin", "key": "archived", "value": "Archived", "category": "audit_logs_action", "description": "Entity moved to archive"},
    {"system": "admin", "key": "unarchived", "value": "Unarchived", "category": "audit_logs_action", "description": "Entity restored from archive"},
    {"system": "admin", "key": "purged", "value": "Purged", "category": "audit_logs_action", "description": "Entity permanently deleted"},
    {"system": "admin", "key": "restored", "value": "Restored", "category": "audit_logs_action", "description": "Entity restored from soft-delete"},
    {"system": "admin", "key": "deleted", "value": "Deleted", "category": "audit_logs_action", "description": "Entity soft-deleted"},

    # General Settings
    {"system": "admin", "key": "timezone", "value": "Asia/Manila", "category": "general_settings", "description": "System-wide timezone"},
    {"system": "admin", "key": "date_format", "value": "MM/DD/YYYY", "category": "general_settings", "description": "System-wide date format"},
    {"system": "admin", "key": "time_format", "value": "12h", "category": "general_settings", "description": "System-wide time format"},
    {"system": "admin", "key": "language", "value": "en", "category": "general_settings", "description": "System-wide language"},

    # Operations & Data Retention
    {"system": "admin", "key": "backup_enabled", "value": "false", "category": "operations_settings", "description": "Enable automated local database backups"},
    {"system": "admin", "key": "backup_frequency", "value": "daily", "category": "operations_settings", "description": "Automated backup frequency (daily/weekly/monthly)"},
    {"system": "admin", "key": "backup_time", "value": "02:00", "category": "operations_settings", "description": "Daily trigger time for automated backups"},
    {"system": "admin", "key": "archive_audit_value", "value": "90", "category": "operations_settings", "description": "Archive audit logs older than (value)"},
    {"system": "admin", "key": "archive_audit_unit", "value": "d", "category": "operations_settings", "description": "Archive audit logs older than (unit: d/m/y)"},
    {"system": "admin", "key": "archive_borrow_value", "value": "1", "category": "operations_settings", "description": "Archive borrow records older than (value)"},
    {"system": "admin", "key": "archive_borrow_unit", "value": "y", "category": "operations_settings", "description": "Archive borrow records older than (unit: d/m/y)"},
    {"system": "admin", "key": "retention_auto_delete", "value": "true", "category": "operations_settings", "description": "Enable automatic permanent deletion of expired archives"},
    {"system": "admin", "key": "retention_value", "value": "7", "category": "operations_settings", "description": "Auto-delete archives older than (value)"},
    {"system": "admin", "key": "retention_unit", "value": "y", "category": "operations_settings", "description": "Auto-delete archives older than (unit: d/m/y)"},
    {"system": "admin", "key": "retention_exclusion", "value": "[]", "category": "operations_settings", "description": "JSON list of tags/keywords that exclude a record from auto-deletion"},
    {"system": "admin", "key": "maintenance_schedule_time", "value": "03:00", "category": "operations_settings", "description": "Daily trigger time for system maintenance (archiving/purging)"},
]

RBAC_ROLES = [
    {
        "role": "inventory_manager",
        "display_name": "Inventory Manager",
        "systems": ["inventory"],
        "permissions": [
             "auth:session:manage", "inventory:items:manage", "inventory:items:view", "inventory:units:manage",
             "inventory:units:view", "inventory:movements:manage", "inventory:movements:view",
               "inventory:borrow_requests:manage",
             "inventory:dashboard:view", "inventory:audit:view", "inventory:borrower_portal:access", "inventory:config:manage",
        ],
    },
    {
        "role": "dispatch",
        "display_name": "Dispatch",
        "systems": ["inventory"],
        "permissions": [
            "auth:session:manage", "inventory:items:view", "inventory:units:view", "inventory:units:manage",
            "inventory:borrow_requests:manage", "inventory:borrower_portal:access",
        ],
    },
    {
        "role": "borrower",
        "display_name": "Borrower",
        "systems": ["inventory"],
        "permissions": [
            "auth:session:manage", "inventory:borrower_portal:access", "inventory:items:view",
        ],
    },
    {
        "role": "employee",
        "display_name": "Employee",
        "systems": ["inventory"],
        "permissions": [
            "auth:session:manage", "inventory:items:view", "inventory:borrower_portal:access",
        ],
    },
    {
        "role": "accountant",
        "display_name": "Accountant",
        "systems": ["inventory"],
        "permissions": [
            "auth:session:manage", "inventory:items:view", "inventory:movements:view", "inventory:audit:view", "inventory:dashboard:view",
        ],
    },
    {
        "role": "finance_manager",
        "display_name": "Finance Manager",
        "systems": ["inventory"],
        "permissions": [
            "auth:session:manage", "inventory:items:view", "inventory:movements:view",
            "inventory:dashboard:view", "inventory:audit:view",
        ],
    },
]
