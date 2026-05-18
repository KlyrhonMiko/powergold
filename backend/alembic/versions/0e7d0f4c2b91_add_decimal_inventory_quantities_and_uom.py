"""Add decimal inventory quantities and item-level unit of measure.

Revision ID: 0e7d0f4c2b91
Revises: 8a2b7f14c9d1
Create Date: 2026-05-18 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0e7d0f4c2b91"
down_revision = "8a2b7f14c9d1"
branch_labels = None
depends_on = None


NUMERIC_TYPE = sa.Numeric(18, 3)


def upgrade() -> None:
    op.add_column("inventory", sa.Column("unit_of_measure", sa.String(length=50), nullable=True))

    op.alter_column(
        "inventory",
        "total_qty",
        existing_type=sa.Integer(),
        type_=NUMERIC_TYPE,
        existing_nullable=False,
        postgresql_using="total_qty::numeric(18,3)",
    )
    op.alter_column(
        "inventory",
        "available_qty",
        existing_type=sa.Integer(),
        type_=NUMERIC_TYPE,
        existing_nullable=False,
        postgresql_using="available_qty::numeric(18,3)",
    )
    op.alter_column(
        "inventory_batches",
        "total_qty",
        existing_type=sa.Integer(),
        type_=NUMERIC_TYPE,
        existing_nullable=False,
        postgresql_using="total_qty::numeric(18,3)",
    )
    op.alter_column(
        "inventory_batches",
        "available_qty",
        existing_type=sa.Integer(),
        type_=NUMERIC_TYPE,
        existing_nullable=False,
        postgresql_using="available_qty::numeric(18,3)",
    )
    op.alter_column(
        "inventory_movements",
        "qty_change",
        existing_type=sa.Integer(),
        type_=NUMERIC_TYPE,
        existing_nullable=False,
        postgresql_using="qty_change::numeric(18,3)",
    )
    op.alter_column(
        "borrow_request_items",
        "qty_requested",
        existing_type=sa.Integer(),
        type_=NUMERIC_TYPE,
        existing_nullable=False,
        postgresql_using="qty_requested::numeric(18,3)",
    )
    op.alter_column(
        "borrow_request_batches",
        "qty_assigned",
        existing_type=sa.Integer(),
        type_=NUMERIC_TYPE,
        existing_nullable=False,
        postgresql_using="qty_assigned::numeric(18,3)",
    )


def downgrade() -> None:
    op.alter_column(
        "borrow_request_batches",
        "qty_assigned",
        existing_type=NUMERIC_TYPE,
        type_=sa.Integer(),
        existing_nullable=False,
        postgresql_using="qty_assigned::integer",
    )
    op.alter_column(
        "borrow_request_items",
        "qty_requested",
        existing_type=NUMERIC_TYPE,
        type_=sa.Integer(),
        existing_nullable=False,
        postgresql_using="qty_requested::integer",
    )
    op.alter_column(
        "inventory_movements",
        "qty_change",
        existing_type=NUMERIC_TYPE,
        type_=sa.Integer(),
        existing_nullable=False,
        postgresql_using="qty_change::integer",
    )
    op.alter_column(
        "inventory_batches",
        "available_qty",
        existing_type=NUMERIC_TYPE,
        type_=sa.Integer(),
        existing_nullable=False,
        postgresql_using="available_qty::integer",
    )
    op.alter_column(
        "inventory_batches",
        "total_qty",
        existing_type=NUMERIC_TYPE,
        type_=sa.Integer(),
        existing_nullable=False,
        postgresql_using="total_qty::integer",
    )
    op.alter_column(
        "inventory",
        "available_qty",
        existing_type=NUMERIC_TYPE,
        type_=sa.Integer(),
        existing_nullable=False,
        postgresql_using="available_qty::integer",
    )
    op.alter_column(
        "inventory",
        "total_qty",
        existing_type=NUMERIC_TYPE,
        type_=sa.Integer(),
        existing_nullable=False,
        postgresql_using="total_qty::integer",
    )
    op.drop_column("inventory", "unit_of_measure")
