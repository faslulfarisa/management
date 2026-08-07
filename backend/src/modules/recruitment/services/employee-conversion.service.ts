import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { EmployeeService } from '../../hr/services/employee.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { ConvertToEmployeeDto } from '../dto/employee-conversion.dto';

/**
 * Maps candidate + accepted offer + vacancy + preboarding data into the
 * shape EmployeeService.create() expects, then calls it directly — no
 * employee-creation logic is duplicated here.
 */
@Injectable()
export class EmployeeConversionService {
  constructor(
    private db: DatabaseService,
    private employeeService: EmployeeService,
    private auditLog: AuditLogService,
    private notifications: NotificationEmitterService,
  ) {}

  private async gatherConversionData(applicationId: string, tenantId: string) {
    const { rows: appRows } = await this.db.query(
      `SELECT a.*, c.first_name, c.last_name, c.email AS candidate_email, c.phone AS candidate_phone
       FROM applications a JOIN candidates c ON c.id = a.candidate_id
       WHERE a.id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
      [applicationId, tenantId],
    );
    if (!appRows.length) throw new NotFoundException('Application not found');
    const application = appRows[0];

    let vacancy: any = null;
    if (application.vacancy_id) {
      const { rows } = await this.db.query(
        `SELECT v.*, b.name AS branch_name, d.name AS department_name, p.name AS position_name, et.name AS employment_type_name
         FROM vacancies v
         LEFT JOIN branches b ON b.id = v.branch_id
         LEFT JOIN departments d ON d.id = v.department_id
         LEFT JOIN positions p ON p.id = v.position_id
         LEFT JOIN employment_types et ON et.id = v.employment_type_id
         WHERE v.id = $1`,
        [application.vacancy_id],
      );
      vacancy = rows[0] ?? null;
    }

    const { rows: offerRows } = await this.db.query(
      `SELECT * FROM offers WHERE application_id = $1 AND tenant_id = $2 AND status = 'accepted' ORDER BY responded_at DESC LIMIT 1`,
      [applicationId, tenantId],
    );
    const offer = offerRows[0] ?? null;

    const { rows: preboardingRows } = await this.db.query(
      'SELECT * FROM preboarding_checklists WHERE application_id = $1 AND tenant_id = $2',
      [applicationId, tenantId],
    );
    const preboarding = preboardingRows[0] ?? null;

    return { application, vacancy, offer, preboarding };
  }

  async getPreview(applicationId: string, tenantId: string) {
    const { application, vacancy, offer, preboarding } = await this.gatherConversionData(applicationId, tenantId);
    const bankDetails = preboarding?.bank_details ?? {};
    const emergencyContact = preboarding?.emergency_contact ?? {};

    return {
      already_converted: !!application.converted_employee_id,
      employee_id: application.converted_employee_id,
      application_status: application.status,
      prefill: {
        first_name: application.first_name,
        last_name: application.last_name,
        personal_email: application.candidate_email,
        personal_phone: application.candidate_phone,
        branch_id: vacancy?.branch_id ?? null,
        branch_name: vacancy?.branch_name ?? null,
        department_id: vacancy?.department_id ?? null,
        department_name: vacancy?.department_name ?? null,
        position_id: vacancy?.position_id ?? null,
        position_name: vacancy?.position_name ?? null,
        designation: offer?.designation ?? null,
        employment_type_id: offer?.employment_type_id ?? vacancy?.employment_type_id ?? null,
        employment_type_name: vacancy?.employment_type_name ?? null,
        reporting_manager_id: vacancy?.reporting_manager_id ?? null,
        date_of_joining: preboarding?.joining_date ?? offer?.joining_date ?? null,
        bank_name: bankDetails.bank_name ?? null,
        bank_account_number: bankDetails.bank_account_number ?? null,
        ifsc_code: bankDetails.ifsc_code ?? null,
        account_type: bankDetails.account_type ?? null,
        upi_id: bankDetails.upi_id ?? null,
        emergency_contact: emergencyContact,
      },
    };
  }

  async convert(applicationId: string, tenantId: string, actorId: string, overrides: ConvertToEmployeeDto) {
    const { application, vacancy, offer, preboarding } = await this.gatherConversionData(applicationId, tenantId);

    if (application.converted_employee_id) {
      throw new BadRequestException('This application has already been converted to an employee');
    }
    if (application.status !== 'hired') {
      throw new BadRequestException(`Cannot convert an application with status '${application.status}' — it must be 'hired' first`);
    }

    const dateOfJoining = overrides.date_of_joining ?? preboarding?.joining_date ?? offer?.joining_date;
    if (!dateOfJoining) {
      throw new BadRequestException('A date of joining is required to convert this candidate to an employee');
    }

    const bankDetails = preboarding?.bank_details ?? {};
    const emergencyContact = preboarding?.emergency_contact ?? {};

    const data = {
      employee_code: overrides.employee_code,
      first_name: overrides.first_name ?? application.first_name,
      last_name: overrides.last_name ?? application.last_name,
      personal_email: overrides.personal_email ?? application.candidate_email,
      personal_phone: overrides.personal_phone ?? application.candidate_phone,
      branch_id: overrides.branch_id ?? vacancy?.branch_id ?? null,
      department_id: overrides.department_id ?? vacancy?.department_id ?? null,
      designation_id: overrides.designation_id ?? null,
      position_id: overrides.position_id ?? vacancy?.position_id ?? null,
      employment_type_id: overrides.employment_type_id ?? offer?.employment_type_id ?? vacancy?.employment_type_id ?? null,
      reporting_manager_id: overrides.reporting_manager_id ?? vacancy?.reporting_manager_id ?? null,
      date_of_joining: dateOfJoining,
      probation_end_date: overrides.probation_end_date ?? null,
      bank_name: overrides.bank_name ?? bankDetails.bank_name ?? null,
      bank_account_number: overrides.bank_account_number ?? bankDetails.bank_account_number ?? null,
      ifsc_code: overrides.ifsc_code ?? bankDetails.ifsc_code ?? null,
      account_type: overrides.account_type ?? bankDetails.account_type ?? null,
      upi_id: overrides.upi_id ?? bankDetails.upi_id ?? null,
      emergency_contact: overrides.emergency_contact ?? emergencyContact,
      enable_login: overrides.enable_login,
      login_email: overrides.login_email,
      login_password: overrides.login_password,
      login_role: overrides.login_role,
    };

    const employee = await this.employeeService.create(tenantId, actorId, data);

    await this.db.query(
      'UPDATE applications SET converted_employee_id = $1, converted_at = now(), updated_at = now() WHERE id = $2 AND tenant_id = $3',
      [employee.id, applicationId, tenantId],
    );

    await this.auditLog.log({
      tenantId, userId: actorId, entityType: 'application', entityId: applicationId,
      action: 'converted_to_employee', newValues: { employee_id: employee.id, employee_code: employee.employee_code },
    });

    if (vacancy) {
      const userIds = (await Promise.all(
        [vacancy.recruiter_id, vacancy.hiring_manager_id].map((empId: string | null) => this.resolveUserIdForEmployee(tenantId, empId)),
      )).filter((id): id is string => !!id && id !== actorId);
      if (userIds.length) {
        await this.notifications.emit(tenantId, {
          userIds, title: 'Candidate converted to employee',
          message: `${application.first_name} ${application.last_name} has been converted to employee ${employee.employee_code}.`,
          type: 'success', sourceModule: 'recruitment', entityType: 'employee', entityId: employee.id,
          actionUrl: `/dashboard/hr/employees/${employee.id}`,
        });
      }
    }

    return employee;
  }

  private async resolveUserIdForEmployee(tenantId: string, employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const { rows } = await this.db.query('SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL LIMIT 1', [tenantId, employeeId]);
    return rows[0]?.id ?? null;
  }
}
