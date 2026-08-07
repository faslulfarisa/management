"""
pytest fixtures for the biometric service.
"""
import pytest
import uuid
from datetime import datetime, date, time
from app.models.shift_rule import ShiftRule
from app.models.attendance_log import AttendanceLog, PunchType, VerifyMethod
from app.models.employee import BiometricEmployee

@pytest.fixture
def mock_tenant_id():
    return uuid.uuid4()

@pytest.fixture
def mock_employee_id():
    return uuid.uuid4()

@pytest.fixture
def mock_device_id():
    return uuid.uuid4()

@pytest.fixture
def sample_shift(mock_tenant_id):
    """9 AM to 6 PM shift with 1 hour break."""
    return ShiftRule(
        id=uuid.uuid4(),
        tenant_id=mock_tenant_id,
        name="Standard Shift",
        code="STD",
        start_time=time(9, 0),
        end_time=time(18, 0),
        break_minutes=60,
        grace_period_in=15,
        grace_period_out=15,
        overtime_threshold_minutes=30,
        max_overtime_minutes=240,
        is_overnight=False
    )

@pytest.fixture
def sample_overnight_shift(mock_tenant_id):
    """10 PM to 6 AM shift."""
    return ShiftRule(
        id=uuid.uuid4(),
        tenant_id=mock_tenant_id,
        name="Night Shift",
        code="NS",
        start_time=time(22, 0),
        end_time=time(6, 0),
        break_minutes=60,
        grace_period_in=15,
        grace_period_out=15,
        overtime_threshold_minutes=30,
        max_overtime_minutes=240,
        is_overnight=True
    )
