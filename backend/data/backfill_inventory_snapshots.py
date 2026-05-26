"""Backfill inventory quantity and status snapshots from units and batches.

Usage:
    python data/backfill_inventory_snapshots.py [--analyze]
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.config import settings
from core.database import engine
from systems.inventory.services.inventory_service import InventoryService
from utils.logging import get_logger, setup_logging


ANALYZE_TABLES = (
    "inventory",
    "inventory_units",
    "inventory_batches",
    "borrow_requests",
    "borrow_request_items",
    "borrow_request_units",
    "borrow_request_batches",
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Run ANALYZE on the main inventory and borrowing tables after the snapshot sync.",
    )
    args = parser.parse_args()

    setup_logging(
        log_level=settings.LOG_LEVEL,
        log_dir=settings.LOG_DIR,
        log_file_enabled=settings.LOG_FILE_ENABLED,
    )
    logger = get_logger("inventory_snapshot_backfill")
    inventory_service = InventoryService()

    with Session(engine) as session:
        synced_count = inventory_service.sync_all_quantities(session)
        session.commit()
        logger.info("Inventory snapshot sync complete for %s items", synced_count)

        if args.analyze and not str(settings.DATABASE_URL).startswith("sqlite"):
            for table_name in ANALYZE_TABLES:
                session.exec(text(f"ANALYZE {table_name}"))
            session.commit()
            logger.info("ANALYZE completed for %s tables", len(ANALYZE_TABLES))


if __name__ == "__main__":
    main()
