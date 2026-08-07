import inspect

from app.api import attendance, shifts
from app.utils import punch_forwarder


def test_attendance_api_does_not_import_python_attendance_engine():
    source = inspect.getsource(attendance)

    assert "AttendanceEngine" not in source
    assert "process_employee_day" not in source
    assert "process_unprocessed_punches" not in source


def test_shift_api_is_deprecated_not_authoritative():
    source = inspect.getsource(shifts)

    assert "Shift rules are managed by NestJS HRMS" in source
    assert "ShiftRule(" not in source


def test_forwarder_targets_nestjs_unified_biometrics_endpoint():
    source = inspect.getsource(punch_forwarder)

    assert "/v1/biometrics/punch" in source
    assert "signed_headers" in source
    assert "overtime" not in source.lower()
    assert "late" not in source.lower()
