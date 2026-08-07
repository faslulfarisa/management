import { Test, TestingModule } from '@nestjs/testing';
import { ShiftOverrideService } from './shift-override.service';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ShiftOverrideService', () => {
  let service: ShiftOverrideService;
  let db: { query: jest.Mock };
  let approvalEngine: { submit: jest.Mock; approveByEntity: jest.Mock; rejectByEntity: jest.Mock; cancel: jest.Mock };
  let auditLog: { log: jest.Mock };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    approvalEngine = {
      submit: jest.fn(),
      approveByEntity: jest.fn(),
      rejectByEntity: jest.fn(),
      cancel: jest.fn(),
    };
    auditLog = { log: jest.fn() };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftOverrideService,
        { provide: DatabaseService, useValue: db },
        { provide: ApprovalEngineService, useValue: approvalEngine },
        { provide: AuditLogService, useValue: auditLog },
        { provide: NotificationEmitterService, useValue: emitter },
      ],
    }).compile();

    service = module.get<ShiftOverrideService>(ShiftOverrideService);
  });

  describe('submitRequest', () => {
    const mockDto = {
      employee_id: 'emp-uuid',
      start_date: '2099-07-10',
      end_date: '2099-07-10',
      reason_category: 'Medical',
      detailed_reason: 'Sick leave test',
    };

    it('throws NotFoundException if employee does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // Employee lookup

      await expect(service.submitRequest('tenant-1', 'user-1', undefined, mockDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if overlapping override request exists', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'emp-uuid' }] }) // Employee lookup
        .mockResolvedValueOnce({ rows: [{ id: 'existing-request' }] }); // Overlap check

      await expect(service.submitRequest('tenant-1', 'user-1', undefined, mockDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if date is in the past', async () => {
      const pastDto = { ...mockDto, start_date: '2020-01-01', end_date: '2020-01-01' };
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'emp-uuid' }] }) // Employee lookup
        .mockResolvedValueOnce({ rows: [] }); // Overlap check

      await expect(service.submitRequest('tenant-1', 'user-1', undefined, pastDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('successfully inserts request and submits to approval engine', async () => {
      const mockRequest = { id: 'req-uuid', ...mockDto, status: 'pending' };
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'emp-uuid', branch_id: 'b-1', department_id: 'd-1', first_name: 'John', last_name: 'Doe' }] }) // Employee lookup
        .mockResolvedValueOnce({ rows: [] }) // Overlap check
        .mockResolvedValueOnce({ rows: [mockRequest] }); // Insert request

      const result = await service.submitRequest('tenant-1', 'user-1', undefined, mockDto);

      expect(result).toEqual(mockRequest);
      expect(db.query).toHaveBeenCalledTimes(3);
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          workflowType: 'shift_override',
          entityId: 'req-uuid',
          entityTable: 'shift_override_requests',
        }),
      );
    });

    it('uses the authenticated employee when employee_id is omitted', async () => {
      const { employee_id, ...selfServiceDto } = mockDto;
      const mockRequest = { id: 'req-uuid', employee_id: employee_id, ...selfServiceDto, status: 'pending' };
      db.query
        .mockResolvedValueOnce({ rows: [{ id: employee_id, branch_id: 'b-1', department_id: 'd-1', first_name: 'John', last_name: 'Doe' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockRequest] });

      const result = await service.submitRequest('tenant-1', 'user-1', employee_id, selfServiceDto);

      expect(result).toEqual(mockRequest);
      expect(db.query.mock.calls[0][1]).toEqual([employee_id, 'tenant-1']);
    });
  });

  describe('validateReplacementEmployee', () => {
    it('throws NotFoundException if replacement employee does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // Employee lookup

      await expect(service.validateReplacementEmployee('tenant-1', 'rep-uuid', '2026-07-10', '2026-07-10')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('detects availability conflicts and returns report', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'rep-uuid', first_name: 'Jane' }] }) // Employee lookup
        .mockResolvedValueOnce({ rows: [{ date: '2026-07-10', override_type: 'leave' }] }) // Overrides lookup
        .mockResolvedValueOnce({ rows: [{ date: '2026-07-10', shift_name: 'General' }] }); // Schedules lookup

      const result = await service.validateReplacementEmployee('tenant-1', 'rep-uuid', '2026-07-10', '2026-07-10');

      expect(result.available).toBe(false);
      expect(result.conflicts).toContain('Replacement employee is on leave on 2026-07-10');
      expect(result.conflicts).toContain("Replacement employee already scheduled for shift 'General' on 2026-07-10");
    });
  });

  describe('actionAndApprove', () => {
    const pendingRequest = {
      id: 'req-uuid',
      employee_id: 'emp-uuid',
      status: 'pending',
      start_date: '2099-07-10',
      end_date: '2099-07-10',
    };

    it('requires a replacement employee for replacement assignments', async () => {
      db.query.mockResolvedValueOnce({ rows: [pendingRequest] });

      await expect(service.actionAndApprove('req-uuid', 'tenant-1', 'approver-1', {
        action_type: 'assign_replacement',
        reason: 'Approved with replacement',
      })).rejects.toThrow(BadRequestException);
    });

    it('stores leave conversion metadata before approving', async () => {
      approvalEngine.approveByEntity.mockResolvedValue({ fullyApproved: true });
      db.query
        .mockResolvedValueOnce({ rows: [pendingRequest] })
        .mockResolvedValueOnce({ rows: [{ id: 'leave-type-uuid' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.actionAndApprove('req-uuid', 'tenant-1', 'approver-1', {
        action_type: 'convert_to_leave',
        reason: 'Approved as leave',
        metadata: { leave_type_id: 'leave-type-uuid' },
      });

      expect(db.query.mock.calls[2][1]).toContain(JSON.stringify({ leave_type_id: 'leave-type-uuid' }));
      expect(approvalEngine.approveByEntity).toHaveBeenCalledWith(
        'req-uuid',
        'shift_override_requests',
        'tenant-1',
        'approver-1',
        'Approved as leave',
        undefined,
      );
    });
  });
});
