"""initial_schema

Revision ID: 001
Revises: 
Create Date: 2026-05-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create Enums
    sa.Enum('IN', 'OUT', 'BOTH', name='device_type_enum').create(op.get_bind())
    sa.Enum('PULL', 'PUSH', name='connection_mode_enum').create(op.get_bind())
    sa.Enum('online', 'offline', 'error', name='device_status_enum').create(op.get_bind())
    sa.Enum('IN', 'OUT', 'UNKNOWN', name='punch_type_enum').create(op.get_bind())
    sa.Enum('fingerprint', 'face', 'card', 'password', 'other', name='verify_method_enum').create(op.get_bind())
    sa.Enum('present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'week_off', name='attendance_status_enum').create(op.get_bind())
    sa.Enum('auto', 'manual', 'retry', name='sync_type_enum').create(op.get_bind())
    sa.Enum('success', 'failed', 'partial', 'in_progress', name='sync_status_enum').create(op.get_bind())

    # 2. Create Tables
    op.create_table('biometric_devices',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('serial_number', sa.String(length=100), nullable=False),
    sa.Column('ip_address', sa.String(length=45), nullable=False),
    sa.Column('port', sa.Integer(), server_default=sa.text('4370'), nullable=False),
    sa.Column('model', sa.String(length=50), nullable=True),
    sa.Column('firmware_version', sa.String(length=50), nullable=True),
    sa.Column('location', sa.String(length=200), nullable=True),
    sa.Column('branch_id', postgresql.UUID(as_uuid=True), nullable=True),
    sa.Column('device_type', postgresql.ENUM('IN', 'OUT', 'BOTH', name='device_type_enum', create_type=False), server_default=sa.text("'BOTH'"), nullable=False),
    sa.Column('connection_mode', postgresql.ENUM('PULL', 'PUSH', name='connection_mode_enum', create_type=False), server_default=sa.text("'PULL'"), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('status', postgresql.ENUM('online', 'offline', 'error', name='device_status_enum', create_type=False), server_default=sa.text("'offline'"), nullable=False),
    sa.Column('last_heartbeat_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_biometric_devices_branch_id'), 'biometric_devices', ['branch_id'], unique=False)
    op.create_index(op.f('ix_biometric_devices_serial_number'), 'biometric_devices', ['serial_number'], unique=True)
    op.create_index(op.f('ix_biometric_devices_tenant_id'), 'biometric_devices', ['tenant_id'], unique=False)

    op.create_table('biometric_employees',
    sa.Column('hms_employee_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('employee_code', sa.String(length=50), nullable=False),
    sa.Column('device_user_id', sa.Integer(), nullable=True),
    sa.Column('full_name', sa.String(length=200), nullable=False),
    sa.Column('fingerprint_registered', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('face_registered', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('card_number', sa.String(length=50), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('devices', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_biometric_employees_employee_code'), 'biometric_employees', ['employee_code'], unique=False)
    op.create_index(op.f('ix_biometric_employees_hms_employee_id'), 'biometric_employees', ['hms_employee_id'], unique=False)
    op.create_index(op.f('ix_biometric_employees_tenant_id'), 'biometric_employees', ['tenant_id'], unique=False)

    op.create_table('shift_rules',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('start_time', sa.Time(), nullable=False),
    sa.Column('end_time', sa.Time(), nullable=False),
    sa.Column('is_overnight', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('break_minutes', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('grace_period_in', sa.Integer(), server_default=sa.text('15'), nullable=False),
    sa.Column('grace_period_out', sa.Integer(), server_default=sa.text('15'), nullable=False),
    sa.Column('overtime_threshold_minutes', sa.Integer(), server_default=sa.text('30'), nullable=False),
    sa.Column('max_overtime_minutes', sa.Integer(), server_default=sa.text('240'), nullable=False),
    sa.Column('half_day_threshold_minutes', sa.Integer(), server_default=sa.text('240'), nullable=False),
    sa.Column('min_work_hours', sa.Numeric(precision=4, scale=2), server_default=sa.text('8.0'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'code', name='uq_shift_rule_code')
    )
    op.create_index(op.f('ix_shift_rules_tenant_id'), 'shift_rules', ['tenant_id'], unique=False)

    op.create_table('attendance_logs',
    sa.Column('device_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('punch_time', sa.DateTime(timezone=True), nullable=False),
    sa.Column('punch_type', postgresql.ENUM('IN', 'OUT', 'UNKNOWN', name='punch_type_enum', create_type=False), server_default=sa.text("'UNKNOWN'"), nullable=False),
    sa.Column('verify_method', postgresql.ENUM('fingerprint', 'face', 'card', 'password', 'other', name='verify_method_enum', create_type=False), server_default=sa.text("'other'"), nullable=False),
    sa.Column('raw_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('is_processed', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('sync_batch_id', postgresql.UUID(as_uuid=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.ForeignKeyConstraint(['device_id'], ['biometric_devices.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['employee_id'], ['biometric_employees.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'device_id', 'employee_id', 'punch_time', name='uq_attendance_log_punch')
    )
    op.create_index(op.f('ix_attendance_logs_device_id'), 'attendance_logs', ['device_id'], unique=False)
    op.create_index(op.f('ix_attendance_logs_employee_id'), 'attendance_logs', ['employee_id'], unique=False)
    op.create_index(op.f('ix_attendance_logs_is_processed'), 'attendance_logs', ['is_processed'], unique=False)
    op.create_index(op.f('ix_attendance_logs_punch_time'), 'attendance_logs', ['punch_time'], unique=False)
    op.create_index(op.f('ix_attendance_logs_sync_batch_id'), 'attendance_logs', ['sync_batch_id'], unique=False)
    op.create_index(op.f('ix_attendance_logs_tenant_id'), 'attendance_logs', ['tenant_id'], unique=False)

    op.create_table('attendance_sessions',
    sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('shift_rule_id', postgresql.UUID(as_uuid=True), nullable=True),
    sa.Column('first_in', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_out', sa.DateTime(timezone=True), nullable=True),
    sa.Column('total_work_minutes', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('overtime_minutes', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('late_minutes', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('early_departure_minutes', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('status', postgresql.ENUM('present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'week_off', name='attendance_status_enum', create_type=False), server_default=sa.text("'absent'"), nullable=False),
    sa.Column('is_overnight', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('punch_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('punch_sequence', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('remarks', sa.Text(), nullable=True),
    sa.Column('synced_to_hms', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.ForeignKeyConstraint(['employee_id'], ['biometric_employees.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['shift_rule_id'], ['shift_rules.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'employee_id', 'date', name='uq_attendance_session_day')
    )
    op.create_index(op.f('ix_attendance_sessions_date'), 'attendance_sessions', ['date'], unique=False)
    op.create_index(op.f('ix_attendance_sessions_employee_id'), 'attendance_sessions', ['employee_id'], unique=False)
    op.create_index(op.f('ix_attendance_sessions_synced_to_hms'), 'attendance_sessions', ['synced_to_hms'], unique=False)
    op.create_index(op.f('ix_attendance_sessions_tenant_id'), 'attendance_sessions', ['tenant_id'], unique=False)

    op.create_table('device_sync_logs',
    sa.Column('device_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('sync_type', postgresql.ENUM('auto', 'manual', 'retry', name='sync_type_enum', create_type=False), nullable=False),
    sa.Column('status', postgresql.ENUM('success', 'failed', 'partial', 'in_progress', name='sync_status_enum', create_type=False), nullable=False),
    sa.Column('records_fetched', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('records_new', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('records_duplicate', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('retry_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.ForeignKeyConstraint(['device_id'], ['biometric_devices.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_device_sync_logs_device_id'), 'device_sync_logs', ['device_id'], unique=False)
    op.create_index(op.f('ix_device_sync_logs_tenant_id'), 'device_sync_logs', ['tenant_id'], unique=False)


def downgrade() -> None:
    op.drop_table('device_sync_logs')
    op.drop_table('attendance_sessions')
    op.drop_table('attendance_logs')
    op.drop_table('shift_rules')
    op.drop_table('biometric_employees')
    op.drop_table('biometric_devices')
    
    sa.Enum(name='sync_status_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='sync_type_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='attendance_status_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='verify_method_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='punch_type_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='device_status_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='connection_mode_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='device_type_enum').drop(op.get_bind(), checkfirst=True)
