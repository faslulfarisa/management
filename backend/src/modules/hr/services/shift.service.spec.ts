import { ShiftService } from './shift.service';

describe('ShiftService - today shift resolution', () => {
  let db: { query: jest.Mock };
  let templateService: { getResolved: jest.Mock };
  let service: ShiftService;

  let overrideRows: any[] = [];
  let scheduleRows: any[] = [];
  let assignmentRows: any[] = [];

  beforeEach(() => {
    overrideRows = [];
    scheduleRows = [];
    assignmentRows = [];

    db = {
      query: jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('shift_overrides')) return { rows: overrideRows };
        if (sql.includes('shift_schedules')) return { rows: scheduleRows };
        if (sql.includes('shift_assignments')) return { rows: assignmentRows };
        return { rows: [] };
      })
    };
    templateService = { getResolved: jest.fn() };
    service = new ShiftService(db as any, templateService as any);
    service['getLocalDate'] = jest.fn().mockReturnValue('2026-06-29');
  });

  it('returns a day-specific schedule before checking assignments or templates', async () => {
    const schedule = {
      shift_name: 'Rostered Morning',
      shift_code: 'MRN',
      start_time: '07:00:00',
      end_time: '15:00:00',
      break_minutes: 30,
      grace_period_minutes: 10,
    };
    scheduleRows = [schedule];

    await expect(service.getTodayShiftForEmployee('tenant-1', 'emp-1')).resolves.toBe(schedule);

    expect(db.query).toHaveBeenCalled();
    expect(templateService.getResolved).not.toHaveBeenCalled();
  });

  it('falls back to the employee resolved shift template when no roster or assignment exists', async () => {
    templateService.getResolved.mockResolvedValueOnce({
      id: 'template-1',
      name: 'Front Desk Shift Policy',
      config: {
        shift_name: 'Front Desk Morning',
        shift_code: 'FDM',
        shift_start_time: '08:00',
        shift_end_time: '16:30',
        break_enabled: true,
        break_duration_minutes: 45,
        grace_period_minutes: 20,
      },
    });

    const result = await service.getTodayShiftForEmployee('tenant-1', 'emp-1');

    expect(result).toEqual(expect.objectContaining({
      shift_name: 'Front Desk Morning',
      shift_code: 'FDM',
      start_time: '08:00:00',
      end_time: '16:30:00',
      break_minutes: 45,
      grace_period_minutes: 20,
      source: 'template',
    }));
    expect(templateService.getResolved).toHaveBeenCalledWith(
      'tenant-1',
      'shift_management',
      'employee',
      'emp-1',
    );
  });

  it('uses default shift presets for older shift templates without explicit times', async () => {
    templateService.getResolved.mockResolvedValueOnce({
      id: 'template-1',
      name: 'Standard Shift Policy',
      config: {
        default_shift: 'general',
      },
    });

    const result = await service.getTodayShiftForEmployee('tenant-1', 'emp-1');

    expect(result).toEqual(expect.objectContaining({
      shift_name: 'Standard Shift Policy',
      shift_code: 'GEN',
      start_time: '09:00:00',
      end_time: '18:00:00',
      grace_period_minutes: 15,
      source: 'template',
    }));
  });

  it('returns null for a resolved shift template on a configured weekly off', async () => {
    service['getLocalDate'] = jest.fn().mockReturnValue('2026-07-05');
    templateService.getResolved.mockResolvedValueOnce({
      id: 'template-1',
      name: 'Standard Shift Policy',
      config: {
        default_shift: 'general',
        weekly_off_pattern: 'fixed',
      },
    });

    await expect(service.getTodayShiftForEmployee('tenant-1', 'emp-1')).resolves.toBeNull();
  });
});
