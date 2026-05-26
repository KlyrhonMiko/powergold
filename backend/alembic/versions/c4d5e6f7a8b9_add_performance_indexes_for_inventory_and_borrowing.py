"""add performance indexes for inventory and borrowing

Revision ID: c4d5e6f7a8b9
Revises: b1c2d3e4f5a6
Create Date: 2026-05-26 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_inventory_list_filters",
        "inventory",
        ["is_deleted", "is_archived", "is_trackable", "name"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_units_item_status_active",
        "inventory_units",
        ["inventory_uuid", "is_deleted", "status"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_units_item_serial_active",
        "inventory_units",
        ["inventory_uuid", "is_deleted", "serial_number"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_batches_item_received_active",
        "inventory_batches",
        ["inventory_uuid", "is_deleted", "received_at"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_batches_item_available_active",
        "inventory_batches",
        ["inventory_uuid", "is_deleted", "available_qty"],
        unique=False,
    )
    op.create_index(
        "ix_borrow_requests_list_filters",
        "borrow_requests",
        ["is_deleted", "is_archived", "status", "request_date"],
        unique=False,
    )
    op.create_index(
        "ix_borrow_requests_borrower_recent",
        "borrow_requests",
        ["borrower_uuid", "is_deleted", "request_date"],
        unique=False,
    )
    op.create_index(
        "ix_borrow_request_items_request_created",
        "borrow_request_items",
        ["borrow_uuid", "is_deleted", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_borrow_request_items_item_active",
        "borrow_request_items",
        ["item_uuid", "is_deleted"],
        unique=False,
    )
    op.create_index(
        "ix_borrow_request_units_request_created",
        "borrow_request_units",
        ["borrow_uuid", "is_deleted", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_borrow_request_units_unit_active",
        "borrow_request_units",
        ["unit_uuid", "is_deleted"],
        unique=False,
    )
    op.create_index(
        "ix_borrow_request_batches_request_created",
        "borrow_request_batches",
        ["borrow_uuid", "is_deleted", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_borrow_request_batches_batch_active",
        "borrow_request_batches",
        ["batch_uuid", "is_deleted"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_borrow_request_batches_batch_active", table_name="borrow_request_batches")
    op.drop_index("ix_borrow_request_batches_request_created", table_name="borrow_request_batches")
    op.drop_index("ix_borrow_request_units_unit_active", table_name="borrow_request_units")
    op.drop_index("ix_borrow_request_units_request_created", table_name="borrow_request_units")
    op.drop_index("ix_borrow_request_items_item_active", table_name="borrow_request_items")
    op.drop_index("ix_borrow_request_items_request_created", table_name="borrow_request_items")
    op.drop_index("ix_borrow_requests_borrower_recent", table_name="borrow_requests")
    op.drop_index("ix_borrow_requests_list_filters", table_name="borrow_requests")
    op.drop_index("ix_inventory_batches_item_available_active", table_name="inventory_batches")
    op.drop_index("ix_inventory_batches_item_received_active", table_name="inventory_batches")
    op.drop_index("ix_inventory_units_item_serial_active", table_name="inventory_units")
    op.drop_index("ix_inventory_units_item_status_active", table_name="inventory_units")
    op.drop_index("ix_inventory_list_filters", table_name="inventory")
