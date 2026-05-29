"""
Configuration Settings Seeding Script for Phase 5.5

This script populates the system_settings table with all configurable enums,
statuses, and conditions based on the Phase 5.5 implementation plan.

Features:
- Uses initialization service to pre-create bootstrap admin user if needed (idempotent)
- Uses REST API endpoints for all configuration creation (idempotent)
- Logs all requests/responses
- Requires DATABASE_URL to be set for direct DB access

Run from the backend directory after `alembic upgrade head`:
    python data/seed_configuration.py

The script seeds the following domains:
    - Inventory (items, units, movements)
    - Borrow requests (workflow, events, channels)
    - Requested items
    - Users (roles, shift types)
    - Backup lifecycle
    - Audit events

Usage in CI/CD:
    1. alembic upgrade head
    2. python data/seed_configuration.py
    3. python .tests/seed_test_data.py (optional, for test data)
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any

import requests
from sqlmodel import Session, select
from sqlalchemy import create_engine

# Import settings and models from the backend
sys.path.insert(0, str(Path(__file__).parent.parent))
from core.config import settings
from core.initialization_service import InitializationService, resolve_bootstrap_admin_credentials
from data.system_init_data import SYSTEM_CONFIGS
from systems.admin.models.user import User

BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")

# ANSI colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"

pass_count = 0
fail_count = 0
skip_count = 0

LOG_DIR = Path(__file__).resolve().parent / "logs"
RUN_TS = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
LOG_FILE = LOG_DIR / f"seed_config_{RUN_TS}.jsonl"
_response_meta: dict[int, dict[str, Any]] = {}


def _truncate(value: Any, limit: int = 1200) -> Any:
    if isinstance(value, str):
        return value if len(value) <= limit else value[:limit] + "...<truncated>"
    return value


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def _log_event(event: str, payload: dict[str, Any]) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **{k: _json_safe(v) for k, v in payload.items()},
    }
    with LOG_FILE.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(record, ensure_ascii=True) + "\n")


def _extract_body_preview(resp: requests.Response) -> Any:
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type.lower():
        try:
            return _truncate(resp.json())
        except Exception:
            return _truncate(resp.text)
    return _truncate(resp.text)


_ORIG_REQUEST_METHODS: dict[str, Any] = {
    "get": requests.get,
    "post": requests.post,
    "patch": requests.patch,
}


def _logged_request(method: str, url: str, **kwargs: Any) -> requests.Response:
    started = perf_counter()
    req_payload = {
        "method": method.upper(),
        "url": url,
        "params": kwargs.get("params"),
        "json": kwargs.get("json"),
    }
    try:
        response = _ORIG_REQUEST_METHODS[method](url, **kwargs)
    except Exception as exc:
        elapsed_ms = round((perf_counter() - started) * 1000, 2)
        _log_event(
            "http_transport_error",
            {
                **req_payload,
                "elapsed_ms": elapsed_ms,
                "error": str(exc),
            },
        )
        raise

    elapsed_ms = round((perf_counter() - started) * 1000, 2)
    _response_meta[id(response)] = {
        "method": method.upper(),
        "url": url,
        "elapsed_ms": elapsed_ms,
    }
    _log_event(
        "http_response",
        {
            **req_payload,
            "status_code": response.status_code,
            "elapsed_ms": elapsed_ms,
            "response_preview": _extract_body_preview(response),
        },
    )
    return response


def _install_request_logging() -> None:
    def _wrap(method: str):
        def _wrapped(url: str, **kwargs: Any) -> requests.Response:
            return _logged_request(method, url, **kwargs)

        return _wrapped

    for method in _ORIG_REQUEST_METHODS:
        setattr(requests, method, _wrap(method))


def _initialize_logging() -> None:
    _log_event(
        "run_start",
        {
            "base_url": BASE_URL,
            "log_file": str(LOG_FILE),
            "purpose": "Seed Phase 5.5 system configuration",
        },
    )
    print(f"{CYAN}Logging request trace to:{RESET} {LOG_FILE}")


_install_request_logging()
_initialize_logging()


def section(title: str) -> None:
    _log_event("section_start", {"title": title})
    print(f"\n{BOLD}{CYAN}── {title} {'─' * max(1, 60 - len(title))}{RESET}")


def check(label: str, resp: requests.Response, expected: int | set[int]) -> bool:
    global pass_count, fail_count
    
    if isinstance(expected, int):
        ok = resp.status_code == expected
        expected_label = str(expected)
    else:
        ok = resp.status_code in expected
        expected_label = "/".join(str(x) for x in sorted(expected))
    
    symbol = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
    status_color = GREEN if ok else RED
    
    if isinstance(expected, int):
        print(f"  {symbol}  {label:<70} {status_color}{resp.status_code}{RESET}")
    else:
        print(f"  {symbol}  {label:<70} {status_color}{resp.status_code}{RESET} (expected {expected_label})")

    if not ok:
        fail_count += 1
        detail: Any = None
        try:
            body = resp.json()
            detail = body.get("message") or body.get("detail") or body
            print(f"     {YELLOW}↳ {detail}{RESET}")
        except Exception:
            detail = resp.text[:200]
            print(f"     {YELLOW}↳ {resp.text[:200]}{RESET}")
    else:
        pass_count += 1

    req_meta = _response_meta.get(id(resp), {})
    _log_event(
        "assertion",
        {
            "label": label,
            "expected": expected_label,
            "actual": resp.status_code,
            "ok": ok,
            **req_meta,
        },
    )

    return ok


def data(resp: requests.Response) -> Any:
    try:
        parsed = resp.json()
    except Exception:
        return {}
    if isinstance(parsed, dict):
        return parsed.get("data", parsed)
    return parsed


def login(username: str, password: str, label: str) -> tuple[dict[str, str] | None, requests.Response]:
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": username, "password": password},
    )
    check(label, response, 200)
    if response.status_code != 200:
        return None, response
    token = response.json().get("access_token")
    if not token:
        return None, response
    return {"Authorization": f"Bearer {token}"}, response


# ══════════════════════════════════════════════════════════════════════════════
# DATABASE INITIALIZATION — Pre-create bootstrap admin user if needed
# ══════════════════════════════════════════════════════════════════════════════

def _get_db_engine():
    """Get SQLAlchemy engine from settings."""
    if not settings.DATABASE_URL:
        print(f"{RED}ERROR: DATABASE_URL is not set. Cannot proceed.{RESET}")
        sys.exit(1)
    return create_engine(settings.DATABASE_URL)


def ensure_admin_exists() -> None:
    """Pre-create bootstrap admin user directly in database if it doesn't exist (idempotent)."""
    global pass_count, fail_count
    
    section("DATABASE INIT — Ensure bootstrap admin user exists")
    
    try:
        engine = _get_db_engine()
        
        with Session(engine) as db_session:
            # Check if bootstrap admin already exists.
            existing = db_session.exec(
                select(User).where(User.user_id == "ADMIN-001", User.is_deleted.is_(False))
            ).first()
            
            if existing:
                print(f"  {GREEN}✓{RESET}  bootstrap admin already exists             {GREEN}ok{RESET}")
                _log_event("admin_check", {"status": "already_exists", "user_id": str(existing.id)})
                pass_count += 1
                return

            init_service = InitializationService()
            init_service.ensure_admin_user(db_session)
            db_session.commit()

            admin_user = db_session.exec(
                select(User).where(User.user_id == "ADMIN-001", User.is_deleted.is_(False))
            ).first()
            if not admin_user:
                raise RuntimeError("Bootstrap admin was not created during initialization.")

            db_session.refresh(admin_user)

            print(f"  {GREEN}✓{RESET}  bootstrap admin created                  {GREEN}created{RESET}")
            _log_event("admin_created", {
                "user_id": str(admin_user.id),
                "username": admin_user.username,
                "email": admin_user.email,
                "role": admin_user.role,
            })
            pass_count += 1
            
    except Exception as e:
        fail_count += 1
        print(f"  {RED}✗{RESET}  bootstrap admin creation               {RED}failed{RESET}")
        print(f"     {YELLOW}↳ {str(e)[:200]}{RESET}")
        _log_event("admin_creation_error", {
            "error": str(e),
            "error_type": type(e).__name__,
        })
        raise


def bootstrap_admin() -> dict[str, str]:
    """Login as bootstrap admin and return auth headers."""
    section("BOOTSTRAP — Admin Authentication (API)")

    bootstrap_username, bootstrap_password = resolve_bootstrap_admin_credentials()
    
    # Retry login up to 3 times (in case API is starting)
    max_retries = 3
    for attempt in range(max_retries):
        admin_headers, resp = login(
            bootstrap_username,
            bootstrap_password,
            f"POST /api/auth/login ({bootstrap_username})",
        )
        if admin_headers:
            return admin_headers
        
        if attempt < max_retries - 1:
            print(f"  {YELLOW}Retry {attempt + 1}/{max_retries}...{RESET}")
            import time
            time.sleep(2)
    
    print(f"\n{RED}Cannot authenticate as bootstrap admin. Aborting.{RESET}")
    _log_event("admin_auth_failed", {"attempts": max_retries})
    sys.exit(1)


def create_setting(
    headers: dict[str, str],
    system: str,
    key: str,
    value: str,
    category: str,
    description: str,
    endpoint: str = "/api/admin/config",
    label: str | None = None,
) -> bool:
    """Create a configuration setting via REST API."""
    label = label or f"POST {endpoint} (system={system}, key={key}, category={category})"
    
    payload = {
        "system": system,
        "key": key,
        "value": value,
        "category": category,
        "description": description,
    }
    
    # Ensure trailing slash for consistency if needed, but our routers usually don't care or use specific paths
    url = f"{BASE_URL}{endpoint}"
    if not url.endswith("/"):
        url += "/"
        
    response = requests.post(
        url,
        headers=headers,
        json=payload,
    )
    
    # Accept both 201 (created) and 400 (duplicate) gracefully
    expected = {201, 400}
    ok = check(label, response, expected)
    
    if response.status_code == 400:
        # Likely duplicate; this is OK in idempotent re-runs
        try:
            detail = response.json().get("detail", "")
            if "already exists" in detail:
                print(f"     {YELLOW}(duplicate, skipping){RESET}")
                return True
        except Exception:
            pass
    
    return ok


def seed_inventory_configurations(headers: dict[str, str]) -> None:
    """Seed inventory-related configurations."""
    section("INVENTORY CONFIGURATIONS")

    def _category_entries(category: str) -> list[tuple[str, str, str]]:
        return [
            (entry["key"], entry["value"], entry["description"])
            for entry in SYSTEM_CONFIGS
            if entry["system"] == "inventory" and entry["category"] == category
        ]
    
    # inventory_item_type (specific product categories)
    print(f"\n  {CYAN}Category: inventory_item_type{RESET}")
    item_types = _category_entries("inventory_item_type")
    for key, value, desc in item_types:
        create_setting(
            headers,
            system="inventory",
            key=key,
            value=value,
            category="inventory_item_type",
            description=desc,
            endpoint="/api/inventory/config/inventory",
        )
    
    # inventory_classification (handling and usage classification)
    print(f"\n  {CYAN}Category: inventory_classification{RESET}")
    classifications = _category_entries("inventory_classification")
    for key, value, desc in classifications:
        create_setting(
            headers,
            system="inventory",
            key=key,
            value=value,
            category="inventory_classification",
            description=desc,
            endpoint="/api/inventory/config/inventory",
        )

    # inventory_status (item-level health state)
    print(f"\n  {CYAN}Category: inventory_status{RESET}")
    statuses = _category_entries("inventory_status")
    for key, value, desc in statuses:
        create_setting(
            headers,
            system="inventory",
            key=key,
            value=value,
            category="inventory_status",
            description=desc,
            endpoint="/api/inventory/config/inventory",
        )

    # inventory_condition (item-level aggregate condition)
    print(f"\n  {CYAN}Category: inventory_condition{RESET}")
    conditions = _category_entries("inventory_condition")
    for key, value, desc in conditions:
        create_setting(
            headers,
            system="inventory",
            key=key,
            value=value,
            category="inventory_condition",
            description=desc,
            endpoint="/api/inventory/config/inventory",
        )

    # inventory_category (business grouping used by item create payloads)
    print(f"\n  {CYAN}Category: inventory_category{RESET}")
    categories = _category_entries("inventory_category")
    for key, value, desc in categories:
        create_setting(
            headers,
            system="inventory",
            key=key,
            value=value,
            category="inventory_category",
            description=desc,
            endpoint="/api/inventory/config/inventory",
        )


def seed_inventory_unit_configurations(headers: dict[str, str]) -> None:
    """Seed inventory unit status and condition configurations."""
    section("INVENTORY UNITS CONFIGURATIONS")
    
    # inventory_units_status
    print(f"\n  {CYAN}Category: inventory_units_status{RESET}")
    statuses = [
        ("available", "Available", "Unit is available for borrowing"),
        ("borrowed", "Borrowed", "Unit is currently borrowed"),
        ("maintenance", "Maintenance", "Unit is under maintenance"),
        ("retired", "Retired", "Unit has been retired from service"),
        ("consumed", "Consumed", "Unit has been consumed"),
        ("expired", "Expired", "Unit has expired"),
        ("discarded", "Discarded", "Unit has been discarded"),
    ]
    for key, value, desc in statuses:
        create_setting(headers, system="inventory", key=key, value=value, category="inventory_units_status", description=desc, endpoint="/api/inventory/config/inventory")
    
    # inventory_units_condition
    print(f"\n  {CYAN}Category: inventory_units_condition{RESET}")
    conditions = [
        ("excellent", "Excellent", "Unit is in excellent condition"),
        ("good", "Good", "Unit is in good condition"),
        ("fair", "Fair", "Unit is in fair condition with minor wear"),
        ("poor", "Poor", "Unit is in poor condition with damage"),
        ("unusable", "Unusable", "Unit is unusable"),
    ]
    for key, value, desc in conditions:
        create_setting(headers, system="inventory", key=key, value=value, category="inventory_units_condition", description=desc, endpoint="/api/inventory/config/inventory")


def seed_inventory_movement_configurations(headers: dict[str, str]) -> None:
    """Seed inventory movement type configurations."""
    section("INVENTORY MOVEMENTS CONFIGURATIONS")
    
    print(f"\n  {CYAN}Category: inventory_movements_movement_type{RESET}")
    movements = [
        ("manual_adjustment", "Manual Adjustment", "Manual stock adjustment"),
        ("borrow_release", "Borrow Release", "Unit released for borrowing"),
        ("borrow_return", "Borrow Return", "Unit returned from borrowing"),
        ("procurement", "Procurement", "New unit procured"),
        ("reversal", "Reversal", "Reversal of previous movement"),
        ("maintenance", "Maintenance", "Unit is under maintenance"),
        ("maintenance_return", "Maintenance Return", "Unit returned from maintenance"),
        ("retirement", "Retirement", "Unit has been retired from service"),
        ("consumption", "Consumption", "Unit has been consumed"),
        ("expiration", "Expiration", "Unit has expired"),
        ("discarded", "Discarded", "Unit has been discarded"),
    ]

    for key, value, desc in movements:
        create_setting(
            headers,
            system="inventory",
            key=key,
            value=value,
            category="inventory_movements_movement_type",
            description=desc,
            endpoint="/api/inventory/config/inventory",
        )

    print(f"\n  {CYAN}Category: inventory_movements_reason_code{RESET}")
    movement_reasons = [
        ("manual_adjustment", "Manual Adjustment", "Manual stock adjustment"),
        ("count_correction", "Count Correction", "Stock count correction"),
        ("damage_writeoff", "Damage / Write-off", "Damaged stock write-off"),
        ("loss_writeoff", "Loss / Write-off", "Lost stock write-off"),
        ("procurement_correction", "Procurement Correction", "Procurement correction"),
        ("return_correction", "Return Correction", "Borrow return correction"),
        ("reversal_error", "Reversal Error", "Reversal due to incorrect ledger entry"),
    ]
    for key, value, desc in movement_reasons:
        create_setting(
            headers,
            system="inventory",
            key=key,
            value=value,
            category="inventory_movements_reason_code",
            description=desc,
            endpoint="/api/inventory/config/inventory",
        )


def seed_inventory_batch_configurations(headers: dict[str, str]) -> None:
    """Seed inventory batch status and condition configurations."""
    section("INVENTORY BATCHES CONFIGURATIONS")
    
    # inventory_batches_status (Threshold-based)
    print(f"\n  {CYAN}Category: inventory_batches_status{RESET}")
    statuses = [
        ("healthy", "11", "Stock level is healthy"),
        ("low_stock", "10", "Stock level is low (threshold)"),
        ("out_of_stock", "0", "Stock is depleted"),
        ("near_expiry", "7", "Batch is near expiration (days)"),
        ("expired", "0", "Batch has expired"),
    ]
    for key, value, desc in statuses:
        create_setting(headers, system="inventory", key=key, value=value, category="inventory_batches_status", description=desc, endpoint="/api/inventory/config/inventory")
    
    # inventory_batches_condition
    print(f"\n  {CYAN}Category: inventory_batches_condition{RESET}")
    conditions = [
        ("excellent", "Excellent", "Batch is in excellent condition"),
        ("good", "Good", "Batch is in good condition"),
        ("fair", "Fair", "Batch has minor issues"),
        ("poor", "Poor", "Batch is in poor condition"),
        ("unusable", "Unusable", "Batch is unusable"),
    ]
    for key, value, desc in conditions:
        create_setting(headers, system="inventory", key=key, value=value, category="inventory_batches_condition", description=desc, endpoint="/api/inventory/config/inventory")


def seed_inventory_weight_configurations(headers: dict[str, str]) -> None:
    """Seed inventory status and condition weights."""
    section("INVENTORY WEIGHT CONFIGURATIONS")
    
    # inventory_units_status_weights
    print(f"\n  {CYAN}Category: inventory_units_status_weights{RESET}")
    unit_status_weights = [
        ("expired", "100", "Weight for expired unit status"),
        ("discarded", "100", "Weight for discarded unit status"),
        ("retired", "100", "Weight for retired unit status"),
        ("consumed", "90", "Weight for consumed unit status"),
        ("maintenance", "80", "Weight for maintenance unit status"),
        ("available", "20", "Weight for available unit status"),
        ("borrowed", "20", "Weight for borrowed unit status"),
    ]
    for key, value, desc in unit_status_weights:
        create_setting(headers, system="inventory", key=key, value=value, category="inventory_units_status_weights", description=desc, endpoint="/api/inventory/config/inventory")

    # inventory_units_condition_weights
    print(f"\n  {CYAN}Category: inventory_units_condition_weights{RESET}")
    unit_condition_weights = [
        ("unusable", "100", "Weight for unusable unit condition"),
        ("poor", "80", "Weight for poor unit condition"),
        ("fair", "30", "Weight for fair unit condition"),
        ("good", "20", "Weight for good unit condition"),
        ("excellent", "20", "Weight for excellent unit condition"),
    ]
    for key, value, desc in unit_condition_weights:
        create_setting(headers, system="inventory", key=key, value=value, category="inventory_units_condition_weights", description=desc, endpoint="/api/inventory/config/inventory")

    # inventory_batches_status_weights
    print(f"\n  {CYAN}Category: inventory_batches_status_weights{RESET}")
    batch_status_weights = [
        ("expired", "100", "Weight for expired batch status"),
        ("near_expiry", "60", "Weight for near_expiry batch status"),
        ("out_of_stock", "50", "Weight for out_of_stock batch status"),
        ("low_stock", "40", "Weight for low_stock batch status"),
        ("healthy", "20", "Weight for healthy batch status"),
    ]
    for key, value, desc in batch_status_weights:
        create_setting(headers, system="inventory", key=key, value=value, category="inventory_batches_status_weights", description=desc, endpoint="/api/inventory/config/inventory")

    # inventory_batches_condition_weights
    print(f"\n  {CYAN}Category: inventory_batches_condition_weights{RESET}")
    batch_condition_weights = [
        ("unusable", "100", "Weight for unusable batch condition"),
        ("poor", "80", "Weight for poor batch condition"),
        ("fair", "30", "Weight for fair batch condition"),
        ("good", "20", "Weight for good batch condition"),
        ("excellent", "20", "Weight for excellent batch condition"),
    ]
    for key, value, desc in batch_condition_weights:
        create_setting(headers, system="inventory", key=key, value=value, category="inventory_batches_condition_weights", description=desc, endpoint="/api/inventory/config/inventory")


def seed_borrow_request_configurations(headers: dict[str, str]) -> None:
    """Seed borrow request workflow, channels, and events."""
    section("BORROW REQUEST CONFIGURATIONS")
    
    # borrow_requests_status (workflow stages)
    print(f"\n  {CYAN}Category: borrow_requests_status{RESET}")
    statuses = [
        ("pending",            "1", "Request awaiting approval"),
        ("approved",           "2", "Request has been approved"),
        ("released",           "3", "Items released to borrower"),
        ("returned",           "4", "Items have been returned (terminal)"),
        ("rejected",           "5", "Request rejected by approver (terminal)"),
        ("closed",             "6", "Request administratively closed (terminal)"),
        ("voided",             "7", "Request voided/cancelled after approval (terminal)"),
    ]
    for key, value, desc in statuses:
        create_setting(headers, system="borrower", key=key, value=value, category="borrow_requests_status", description=desc, endpoint="/api/inventory/config/borrower")
    
    # borrow_requests_approval_channel
    print(f"\n  {CYAN}Category: borrow_requests_approval_channel{RESET}")
    channels = [
        ("standard", "Standard", "Standard approval workflow"),
        ("emergency_bypass", "Emergency Bypass", "Emergency bypass approval"),
    ]
    for key, value, desc in channels:
        create_setting(
            headers,
            system="borrower",
            key=key,
            value=value,
            category="borrow_requests_approval_channel",
            description=desc,
            endpoint="/api/inventory/config/borrower",
        )
    
    # borrow_requests_request_channel
    print(f"\n  {CYAN}Category: borrow_requests_request_channel{RESET}")
    request_channels = [
        ("inventory_manager", "Inventory Manager", "Request from inventory manager"),
        ("borrower_portal", "Borrower Portal", "Request from borrower portal"),
    ]
    for key, value, desc in request_channels:
        create_setting(
            headers,
            system="borrower",
            key=key,
            value=value,
            category="borrow_requests_request_channel",
            description=desc,
            endpoint="/api/inventory/config/borrower",
        )
    
    # borrow_request_events_event_type
    print(f"\n  {CYAN}Category: borrow_request_events_event_type{RESET}")
    events = [
        ("created", "Created", "Request created"),
        ("approved", "Approved", "Request approved"),
        ("rejected", "Rejected", "Request rejected"),
        ("voided", "Voided", "Request voided/cancelled"),
        ("reopened", "Reopened", "Request reopened"),
        ("released", "Released", "Items released"),
        ("returned", "Returned", "Items returned"),
        ("closed", "Closed", "Request closed"),
        ("units_assigned", "Units Assigned", "Units assigned"),
        ("unit_assignment_skipped", "Unit Assignment Skipped", "Unit assignment skipped"),
    ]
    for key, value, desc in events:
        create_setting(
            headers,
            system="borrower",
            key=key,
            value=value,
            category="borrow_request_events_event_type",
            description=desc,
            endpoint="/api/inventory/config/borrower",
        )


def seed_borrow_participant_configurations(headers: dict[str, str]) -> None:
    """Seed borrow participant role configurations."""
    section("BORROW PARTICIPANT CONFIGURATIONS")
    
    print(f"\n  {CYAN}Category: borrow_participants_role_in_request{RESET}")
    roles = [
        ("witness", "Witness", "Witness to the borrow transaction"),
        ("approver", "Approver of the borrow request", "Approver of the borrow request"),
        ("recipient", "Recipient", "Recipient of borrowed items"),
    ]
    for key, value, desc in roles:
        create_setting(
            headers,
            system="borrower",
            key=key,
            value=value,
            category="borrow_participants_role_in_request",
            description=desc,
            endpoint="/api/inventory/config/borrower",
        )


def seed_user_configurations(headers: dict[str, str]) -> None:
    """Seed user role and shift type configurations."""
    section("USER CONFIGURATIONS")
    
    # users_role (RBAC roles)
    print(f"\n  {CYAN}Category: users_role{RESET}")
    roles = [
        ("admin", "ADMIN", "Complete authority over user management, system configuration, and data overrides."),
        ("inventory_manager", "IVTM", "Owns inventory lifecycle, borrowing workflow approvals, stock controls, and inventory configuration management."),
        ("dispatch", "DSPT", "Operates release and return flow, validates units, and performs operational hand-offs."),
        ("borrower", "BRWR", "Uses the borrower portal to submit borrowing requests and track assigned inventory usage."),
        ("finance_manager", "FINM", "Monitors inventory performance, dashboard KPIs, and financial-impact configuration with read-heavy access."),
        ("accountant", "ACCT", "Reconciles inventory movements, reviews anomalies, and performs audit-ledger verification."),
        ("employee", "EMPL", "General staff with read access to inventory catalog and requested-items submission rights."),
    ]
    for key, value, desc in roles:
        create_setting(headers, system="admin", key=key, value=value, category="users_role", description=desc, endpoint="/api/auth/config")

    # users_shift_type
    print(f"\n  {CYAN}Category: users_shift_type{RESET}")
    shifts = [
        ("day", "Day", "Day shift (typically 8am-5pm)"),
        ("night", "Night", "Night shift (typically 5pm-2am)"),
        ("morning", "Morning", "Morning shift (typically 6am-2pm)"),
        ("evening", "Evening", "Evening shift (typically 2pm-10pm)"),
    ]
    for key, value, desc in shifts:
        create_setting(headers, system="admin", key=key, value=value, category="users_shift_type", description=desc, endpoint="/api/auth/config")


def seed_rbac_role_permissions(headers: dict[str, str]) -> None:
    """Seed dynamic RBAC role permissions."""
    section("RBAC ROLE PERMISSIONS")
    
    # We use your NEW /api/admin/roles/permissions endpoint!
    url = f"{BASE_URL}/api/admin/roles/permissions"
    
    roles_payloads = [
        {
            "role": "inventory_manager",
            "display_name": "Inventory Manager",
            "systems": ["inventory"],
            "permissions": [
                "auth:session:manage",
                "inventory:items:manage",
                "inventory:items:view",
                "inventory:units:manage",
                "inventory:units:view",
                "inventory:movements:manage",
                "inventory:movements:view",
                "inventory:borrow_requests:manage",
                "inventory:dashboard:view",
                "inventory:audit:view",
                "inventory:borrower_portal:access",
                "inventory:config:manage",
            ],
        },
        {
            "role": "dispatch",
            "display_name": "Dispatch",
            "systems": ["inventory"],
            "permissions": [
                "auth:session:manage",
                "inventory:items:view",
                "inventory:units:view",
                "inventory:units:manage",
                "inventory:borrow_requests:manage",
                "inventory:borrower_portal:access",
            ],
        },
        {
            "role": "borrower",
            "display_name": "Borrower",
            "systems": ["inventory"],
            "permissions": [
                "auth:session:manage",
                "inventory:borrower_portal:access",
                "inventory:items:view", 
            ],
        },
        {
            "role": "employee",
            "display_name": "Employee",
            "systems": ["inventory"],
            "permissions": [
                "auth:session:manage",
                "inventory:items:view",
                "inventory:borrower_portal:access",
            ],
        },
        {
            "role": "accountant",
            "display_name": "Accountant",
            "systems": ["inventory"],
            "permissions": [
                "auth:session:manage",
                "inventory:items:view",
                "inventory:movements:view",
                "inventory:audit:view",
                "inventory:dashboard:view",
            ],
        },
        {
            "role": "finance_manager",
            "display_name": "Finance Manager",
            "systems": ["inventory"],
            "permissions": [
                "auth:session:manage",
                "inventory:items:view",
                "inventory:movements:view",
                "inventory:dashboard:view",
                "inventory:audit:view",
            ],
        },
    ]

    for payload in roles_payloads:
        label = f"POST /api/admin/roles/permissions (role={payload['role']})"
        response = requests.post(url, headers=headers, json=payload)
        check(label, response, 200)


def seed_backup_configurations(headers: dict[str, str]) -> None:
    """Seed backup lifecycle configurations."""
    section("BACKUP CONFIGURATIONS")

    print(f"\n  {CYAN}Category: backup_runs_destination{RESET}")
    destinations = [
        ("local", "local", "Local filesystem destination"),
        ("s3", "s3", "Amazon S3 bucket destination"),
        ("both", "both", "Both local and S3 destinations"),
    ]
    for key, value, desc in destinations:
        create_setting(headers, system="admin", key=key, value=value, category="backup_runs_destination", description=desc)
    
    # backup_runs_status
    print(f"\n  {CYAN}Category: backup_runs_status{RESET}")
    statuses = [
        ("pending", "Pending", "Backup run pending"),
        ("running", "Running", "Backup run in progress"),
        ("completed", "Completed", "Backup run completed successfully"),
        ("failed", "Failed", "Backup run failed"),
    ]
    for key, value, desc in statuses:
        create_setting(headers, system="admin", key=key, value=value, category="backup_runs_status", description=desc)
    
    # backup_artifacts_target_type
    print(f"\n  {CYAN}Category: backup_artifacts_target_type{RESET}")
    targets = [
        ("local", "Local", "Local filesystem backup"),
        ("s3", "S3", "Amazon S3 bucket backup"),
    ]
    for key, value, desc in targets:
        create_setting(headers, system="admin", key=key, value=value, category="backup_artifacts_target_type", description=desc)


def seed_audit_configurations(headers: dict[str, str]) -> None:
    """Seed audit log entity and action configurations (optional taxonomy)."""
    section("AUDIT LOG CONFIGURATIONS")
    
    # audit_logs_entity_type
    print(f"\n  {CYAN}Category: audit_logs_entity_type{RESET}")
    entities = [
        ("inventory", "Inventory", "Inventory item entity"),
        ("inventory_unit", "Inventory Unit", "Inventory unit entity"),
        ("inventory_movement", "Inventory Movement", "Inventory movement entity"),
        ("borrow_request", "Borrow Request", "Borrow request entity"),
        ("user", "User", "User entity"),
        ("system_setting", "System Setting", "System configuration entity"),
        ("audit_log", "Audit Log", "System audit log entity"),
    ]
    for key, value, desc in entities:
        create_setting(headers, system="admin", key=key, value=value, category="audit_logs_entity_type", description=desc)
    
    # audit_logs_action
    print(f"\n  {CYAN}Category: audit_logs_action{RESET}")
    actions = [
        ("create", "Create", "Entity created"),
        ("update", "Update", "Entity updated"),
        ("delete", "Delete", "Entity deleted"),
        ("approve", "Approve", "Request approved"),
        ("reject", "Reject", "Request rejected"),
        ("release", "Release", "Items released"),
        ("return", "Return", "Items returned"),
        ("assign", "Assign", "Units assigned"),
        ("adjust_stock", "Adjust Stock", "Stock adjustment"),
        ("transition", "Transition", "Status transition"),
        ("archived", "Archived", "Entity moved to archive"),
        ("unarchived", "Unarchived", "Entity restored from archive"),
        ("purged", "Purged", "Entity permanently deleted"),
        ("restored", "Restored", "Entity restored from soft-delete"),
        ("deleted", "Deleted", "Entity soft-deleted"),
    ]
    for key, value, desc in actions:
        create_setting(headers, system="admin", key=key, value=value, category="audit_logs_action", description=desc)


def seed_inventory_alert_settings(headers: dict[str, str]) -> None:
    """Seed inventory threshold and alert policy configurations."""
    section("INVENTORY ALERT SETTINGS")
    
    # inventory_threshold_alerts
    print(f"\n  {CYAN}Category: inventory_threshold_alerts{RESET}")
    alerts = [
        ("low_stock_threshold", "20", "Alert when stock falls below this % of total quantity"),
        ("overstock_threshold", "150", "Alert when stock exceeds this % of total quantity"),
        ("expiry_threshold", "15", "Alert when remaining shelf life is below this %"),
        ("borrow_request_alert_duration", "60", "Duration for pending borrow request alerts"),
        ("borrow_request_alert_unit", "minutes", "Time unit for borrow request alerts"),
        ("notification_channels", '["in-app", "email", "sms"]', "Active channels for system notifications"),
        {"key": "alert_recipient_roles", "value": '["inventory_manager", "admin"]', "description": "Roles notified of inventory alerts"},
        {"key": "specific_recipients", "value": "[]", "description": "Specific individuals notified of inventory alerts"}
    ]
    for item in alerts:
        if isinstance(item, dict):
            create_setting(headers, system="inventory", key=item["key"], value=item["value"], category="inventory_threshold_alerts", description=item["description"], endpoint="/api/inventory/config/inventory")
        else:
            key, value, desc = item
            create_setting(headers, system="inventory", key=key, value=value, category="inventory_threshold_alerts", description=desc, endpoint="/api/inventory/config/inventory")


def seed_general_settings(headers: dict[str, str]) -> None:
    """Seed general system settings (Localization and Feature Flags) via API."""
    section("GENERAL SETTINGS CONFIGURATIONS")
    
    settings = [
        ("timezone", "Asia/Manila", "System default timezone"),
        ("date_format", "MM/DD/YYYY", "System-wide date display format"),
        ("time_format", "12h", "System-wide time display format"),
        ("language", "en", "System default language"),
    ]
    
    for key, value, desc in settings:
        create_setting(
            headers,
            system="admin",
            key=key,
            value=value,
            category="general_settings",
            description=desc,
        )


def seed_operations_configurations(headers: dict[str, str]) -> None:
    """Seed operations and data retention configurations."""
    section("OPERATIONS & DATA RETENTION CONFIGURATIONS")

    print(f"\n  {CYAN}Category: operations_settings{RESET}")
    ops_settings = [
        ("archive_audit_value", "90", "Archive audit logs older than (value)"),
        ("archive_audit_unit", "d", "Archive audit logs older than (unit: d/m/y)"),
        ("archive_borrow_value", "1", "Archive borrow records older than (value)"),
        ("archive_borrow_unit", "y", "Archive borrow records older than (unit: d/m/y)"),
        ("retention_auto_delete", "true", "Enable automatic permanent deletion of expired archives"),
        ("retention_value", "7", "Auto-delete archives older than (value)"),
        ("retention_unit", "y", "Auto-delete archives older than (unit: d/m/y)"),
        ("retention_exclusion", "[]", "JSON list of tags/keywords that exclude a record from auto-deletion"),
        ("maintenance_schedule_time", "03:00", "Daily trigger time for system maintenance (archiving/purging)"),
    ]
    for key, value, desc in ops_settings:
        create_setting(
            headers,
            system="admin",
            key=key,
            value=value,
            category="operations_settings",
            description=desc,
        )


def print_summary() -> int:
    """Print execution summary."""
    total = pass_count + fail_count
    success_rate = (pass_count / total * 100) if total > 0 else 0
    
    section("SUMMARY")
    print(f"\n  {GREEN}✓ Passed:{RESET}  {pass_count}")
    print(f"  {RED}✗ Failed:{RESET}  {fail_count}")
    print(f"  {YELLOW}⊘ Skipped:{RESET} {skip_count}")
    print(f"  Success Rate: {success_rate:.1f}%\n")
    
    if fail_count == 0:
        print(f"{GREEN}All configuration settings seeded successfully!{RESET}\n")
    else:
        print(f"{RED}Some configuration settings failed. Check logs for details.{RESET}\n")
        return 1
    
    return 0


def main() -> int:
    """Main entry point."""
    try:
        # Step 1: Ensure bootstrap admin exists in database (idempotent)
        ensure_admin_exists()
        
        # Step 2: Authenticate and get API headers
        admin_headers = bootstrap_admin()
        
        # Step 3: Seed all configuration categories via API
        seed_inventory_configurations(admin_headers)
        seed_inventory_unit_configurations(admin_headers)
        seed_inventory_batch_configurations(admin_headers)
        seed_inventory_weight_configurations(admin_headers)
        seed_inventory_movement_configurations(admin_headers)
        seed_borrow_request_configurations(admin_headers)
        seed_borrow_participant_configurations(admin_headers)
        seed_rbac_role_permissions(admin_headers)
        seed_user_configurations(admin_headers)
        seed_inventory_alert_settings(admin_headers)
        seed_backup_configurations(admin_headers)
        seed_audit_configurations(admin_headers)
        seed_general_settings(admin_headers)
        seed_operations_configurations(admin_headers)
        
        # Step 4: Print summary and return exit code
        return print_summary()
    
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Script interrupted by user.{RESET}")
        return 1
    except Exception as e:
        print(f"\n{RED}Unexpected error: {e}{RESET}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
