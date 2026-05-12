"""Add scripts model and campaign scheduling fields

Revision ID: c1d2e3f4a5b6
Revises: b8c3d4e5f6g7
Create Date: 2026-05-11 18:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "c1d2e3f4a5b6"
down_revision = "b8c3d4e5f6g7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scripts_user_id"), "scripts", ["user_id"], unique=False)

    with op.batch_alter_table("campaigns", schema=None) as batch_op:
        batch_op.add_column(sa.Column("script_id", postgresql.UUID(as_uuid=True), nullable=True))
        batch_op.add_column(sa.Column("schedule_start_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("schedule_end_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("retry_attempts", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(
            sa.Column("retry_interval_seconds", sa.Integer(), nullable=False, server_default="300")
        )
        batch_op.create_foreign_key(
            "fk_campaigns_script_id_scripts", "scripts", ["script_id"], ["id"], ondelete="SET NULL"
        )

    with op.batch_alter_table("call_logs", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")))
        batch_op.add_column(sa.Column("is_forwarded", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table("call_logs", schema=None) as batch_op:
        batch_op.drop_column("is_forwarded")
        batch_op.drop_column("tags")

    with op.batch_alter_table("campaigns", schema=None) as batch_op:
        batch_op.drop_constraint("fk_campaigns_script_id_scripts", type_="foreignkey")
        batch_op.drop_column("retry_interval_seconds")
        batch_op.drop_column("retry_attempts")
        batch_op.drop_column("schedule_end_at")
        batch_op.drop_column("schedule_start_at")
        batch_op.drop_column("script_id")

    op.drop_index(op.f("ix_scripts_user_id"), table_name="scripts")
    op.drop_table("scripts")
