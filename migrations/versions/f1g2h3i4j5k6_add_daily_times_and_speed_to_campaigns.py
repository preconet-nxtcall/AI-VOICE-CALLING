"""add daily times and speed to campaigns

Revision ID: f1g2h3i4j5k6
Revises: e1f2g3h4i5j6
Create Date: 2026-05-18 10:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1g2h3i4j5k6'
down_revision = 'e1f2g3h4i5j6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('campaigns', schema=None) as batch_op:
        batch_op.add_column(sa.Column('daily_start_time', sa.Time(), nullable=True))
        batch_op.add_column(sa.Column('daily_end_time', sa.Time(), nullable=True))
        batch_op.add_column(sa.Column('dialing_speed', sa.String(length=50), nullable=False, server_default='normal'))


def downgrade():
    with op.batch_alter_table('campaigns', schema=None) as batch_op:
        batch_op.drop_column('dialing_speed')
        batch_op.drop_column('daily_end_time')
        batch_op.drop_column('daily_start_time')
