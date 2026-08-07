"""
Unit tests for the ShiftEngine and attendance calculations.
"""
from datetime import datetime, date, time
from app.services.shift_engine import ShiftEngine

def test_perfect_attendance(sample_shift):
    """Employee arrives exactly on time and leaves exactly on time."""
    first_in = datetime(2026, 5, 26, 9, 0)
    last_out = datetime(2026, 5, 26, 18, 0)
    
    work_minutes = ShiftEngine.calculate_total_work_minutes(first_in, last_out, sample_shift)
    # 9 hours - 1 hour break = 8 hours (480 mins)
    assert work_minutes == 480
    
    late = ShiftEngine.calculate_late_minutes(first_in, sample_shift)
    assert late == 0
    
    early = ShiftEngine.calculate_early_departure(last_out, sample_shift)
    assert early == 0
    
    status = ShiftEngine.determine_status(work_minutes, late, sample_shift)
    assert status == "present"

def test_late_arrival(sample_shift):
    """Employee arrives late beyond grace period."""
    # 9:20 AM (Grace is 15 mins)
    first_in = datetime(2026, 5, 26, 9, 20)
    last_out = datetime(2026, 5, 26, 18, 0)
    
    work_minutes = ShiftEngine.calculate_total_work_minutes(first_in, last_out, sample_shift)
    assert work_minutes == 460 # 480 - 20
    
    late = ShiftEngine.calculate_late_minutes(first_in, sample_shift)
    assert late == 20
    
    status = ShiftEngine.determine_status(work_minutes, late, sample_shift)
    assert status == "late"

def test_grace_period_arrival(sample_shift):
    """Employee arrives late but within grace period."""
    # 9:10 AM (Grace is 15 mins)
    first_in = datetime(2026, 5, 26, 9, 10)
    
    late = ShiftEngine.calculate_late_minutes(first_in, sample_shift)
    assert late == 0

def test_overtime(sample_shift):
    """Employee stays late enough to earn overtime."""
    first_in = datetime(2026, 5, 26, 9, 0)
    # 7:00 PM (1 hour extra)
    last_out = datetime(2026, 5, 26, 19, 0)
    
    work_minutes = ShiftEngine.calculate_total_work_minutes(first_in, last_out, sample_shift)
    assert work_minutes == 540 # 9 hours of work
    
    overtime = ShiftEngine.calculate_overtime(work_minutes, sample_shift)
    # Threshold is 30 mins, so they get 60 - 30 = 30 mins OT
    assert overtime == 30

def test_overnight_shift(sample_overnight_shift):
    """Overnight shift crossing midnight (10 PM to 6 AM)."""
    # 10:00 PM
    first_in = datetime(2026, 5, 26, 22, 0)
    # 6:00 AM next day
    last_out = datetime(2026, 5, 27, 6, 0)
    
    work_minutes = ShiftEngine.calculate_total_work_minutes(first_in, last_out, sample_overnight_shift)
    # 8 hours - 1 hour break = 7 hours (420 mins)
    assert work_minutes == 420
    
    late = ShiftEngine.calculate_late_minutes(first_in, sample_overnight_shift)
    assert late == 0
    
    early = ShiftEngine.calculate_early_departure(last_out, sample_overnight_shift)
    assert early == 0
