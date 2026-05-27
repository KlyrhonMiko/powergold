from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from utils.logging import get_logger

# Default: Manila is GMT+8
DEFAULT_TZ = ZoneInfo("Asia/Manila")
MANILA_TZ = DEFAULT_TZ # Alias for existing system services

# Shared state for the application (Display only)
CURRENT_DISPLAY_TZ = DEFAULT_TZ
CURRENT_DATE_FORMAT = "%m/%d/%Y"
CURRENT_TIME_FORMAT = "%I:%M:%S %p"
logger = get_logger("utils.time")


@dataclass(frozen=True)
class NormalizedTimeWindow:
    date_from: datetime | None
    date_to: datetime | None

def get_now_manila() -> datetime:
    """
    Returns the current datetime in the baseline Manila timezone (GMT+8).
    Always use this for internal system timestamps to ensure DB consistency.
    """
    return datetime.now(DEFAULT_TZ)


def normalize_datetime_to_manila(value: datetime | None) -> datetime | None:
    """Normalize incoming datetimes into timezone-aware Manila datetimes."""
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=DEFAULT_TZ)

    return value.astimezone(DEFAULT_TZ)


def _start_of_day(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=DEFAULT_TZ)


def _end_of_day(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 23, 59, 59, 999999, tzinfo=DEFAULT_TZ)


def normalize_time_window(
    timeline_mode: str | None,
    anchor_date: date | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> NormalizedTimeWindow:
    """
    Resolve canonical report windows in Manila time.

    Explicit date_from/date_to values take precedence to keep backward compatibility.
    """
    normalized_from = normalize_datetime_to_manila(date_from)
    normalized_to = normalize_datetime_to_manila(date_to)
    mode_value = getattr(timeline_mode, "value", timeline_mode)

    if mode_value == "rolling_7_day":
        mode_value = "weekly"

    if mode_value and mode_value not in {"daily", "weekly", "monthly", "yearly"}:
        raise ValueError(f"Unsupported timeline_mode: {mode_value}")

    if (
        normalized_to is not None
        and normalized_to.hour == 0
        and normalized_to.minute == 0
        and normalized_to.second == 0
        and normalized_to.microsecond == 0
    ):
        normalized_to = _end_of_day(normalized_to.date())

    if normalized_from is not None or normalized_to is not None:
        return NormalizedTimeWindow(date_from=normalized_from, date_to=normalized_to)

    if not mode_value:
        return NormalizedTimeWindow(date_from=None, date_to=None)

    base_day = anchor_date or get_now_manila().date()

    if mode_value == "daily":
        return NormalizedTimeWindow(
            date_from=_start_of_day(base_day),
            date_to=_end_of_day(base_day),
        )

    if mode_value == "weekly":
        start_day = base_day
        return NormalizedTimeWindow(
            date_from=_start_of_day(start_day),
            date_to=_end_of_day(start_day + timedelta(days=6)),
        )

    if mode_value == "monthly":
        last_day = monthrange(base_day.year, base_day.month)[1]
        return NormalizedTimeWindow(
            date_from=datetime(base_day.year, base_day.month, 1, tzinfo=DEFAULT_TZ),
            date_to=datetime(
                base_day.year,
                base_day.month,
                last_day,
                23,
                59,
                59,
                999999,
                tzinfo=DEFAULT_TZ,
            ),
        )

    if mode_value == "yearly":
        return NormalizedTimeWindow(
            date_from=datetime(base_day.year, 1, 1, tzinfo=DEFAULT_TZ),
            date_to=datetime(base_day.year, 12, 31, 23, 59, 59, 999999, tzinfo=DEFAULT_TZ),
        )

    return NormalizedTimeWindow(date_from=None, date_to=None)

def update_system_timezone(tz_name: str) -> bool:
    """Updates the internal display timezone singleton."""
    global CURRENT_DISPLAY_TZ
    try:
        CURRENT_DISPLAY_TZ = ZoneInfo(tz_name)
        logger.info("Display timezone updated to %s", tz_name)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        CURRENT_DISPLAY_TZ = DEFAULT_TZ
        logger.warning("Invalid timezone '%s'; falling back to Asia/Manila", tz_name)
        return False

def update_system_format(date_format: str, time_format: str):
    """Updates the internal formatting patterns."""
    global CURRENT_DATE_FORMAT, CURRENT_TIME_FORMAT
    
    # Mapping for Date Formats
    date_map = {
        "MM/DD/YYYY": "%m/%d/%Y",
        "DD/MM/YYYY": "%d/%m/%Y",
        "YYYY-MM-DD": "%Y-%m-%d"
    }
    CURRENT_DATE_FORMAT = date_map.get(date_format, "%m/%d/%Y")
    
    # Mapping for Time Formats
    if time_format == "24h":
        CURRENT_TIME_FORMAT = "%H:%M:%S"
    else:
        CURRENT_TIME_FORMAT = "%I:%M:%S %p"

def format_datetime(dt: Optional[datetime]) -> str:
    """Formats a datetime object based on current system localization settings."""
    if not dt:
        return ""
    
    # Core Translation Logic:
    # 1. If naive, assume it's Manila time (the storage baseline)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=DEFAULT_TZ)
    
    # 2. Convert to the current display timezone
    dt = dt.astimezone(CURRENT_DISPLAY_TZ)
    
    pattern = f"{CURRENT_DATE_FORMAT} - {CURRENT_TIME_FORMAT}"
    return dt.strftime(pattern)
