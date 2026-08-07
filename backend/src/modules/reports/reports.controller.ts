import { Controller, Get, Post, Put, Delete, Query, Req, Body, Param, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../auth/guards/active-org.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS, Permission } from '../../shared/permissions.constants';
import { isBranchInScope } from '../../shared/scope.util';
import { UserHierarchyService } from '../platform/services/user-hierarchy.service';
import { AuthorizationService } from '../platform/services/authorization.service';
import { AuditLogService } from '../platform/services/audit-log.service';
import { AttendanceReportsService } from './services/attendance-reports.service';
import { HrReportsService } from './services/hr-reports.service';
import { PayrollReportsService } from './services/payroll-reports.service';
import { FinanceReportsService } from './services/finance-reports.service';
import { LeaveReportsService } from './services/leave-reports.service';
import { ShiftReportsService } from './services/shift-reports.service';
import { BiometricReportsService } from './services/biometric-reports.service';
import { BranchReportsService } from './services/branch-reports.service';
import { OperationalAnalyticsService } from './services/operational-analytics.service';
import { SavedReportsService } from './services/saved-reports.service';
import { PerformanceReportsService } from './services/performance-reports.service';
import { RecruitmentReportsService } from './services/recruitment-reports.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { SaveReportDto } from './dto/save-report.dto';
import { DatabaseService } from '../../shared/database.service';

// Maps an `export/csv` `report_type` (e.g. `payroll/audit`) to the
// permission required to export that category of report.
const REPORT_CATEGORY_PERMISSION: Record<string, Permission> = {
  attendance: PERMISSIONS.REPORTS_ATTENDANCE,
  shift: PERMISSIONS.REPORTS_ATTENDANCE,
  biometrics: PERMISSIONS.REPORTS_ATTENDANCE,
  payroll: PERMISSIONS.REPORTS_PAYROLL,
  performance: PERMISSIONS.PERFORMANCE_EXPORT,
};

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly attendance: AttendanceReportsService,
    private readonly hr: HrReportsService,
    private readonly payroll: PayrollReportsService,
    private readonly finance: FinanceReportsService,
    private readonly leave: LeaveReportsService,
    private readonly shift: ShiftReportsService,
    private readonly biometrics: BiometricReportsService,
    private readonly branch: BranchReportsService,
    private readonly analytics: OperationalAnalyticsService,
    private readonly saved: SavedReportsService,
    private readonly performance: PerformanceReportsService,
    private readonly recruitment: RecruitmentReportsService,
    private readonly db: DatabaseService,
    private readonly userHierarchyService: UserHierarchyService,
    private readonly authorizationService: AuthorizationService,
    private readonly auditLog: AuditLogService,
  ) {}

  private tid(req: any): string { const u = req.user ?? req; return u.tenantId ?? u.tenant_id; }
  private uid(req: any): string { const u = req.user ?? req; return u.sub ?? u.id; }

  private wrap(data: any) {
    return { success: true, data: data.data, meta: { total: data.total, page: data.page, limit: data.limit }, error: null };
  }

  private wrapList(data: any[]) {
    return { success: true, data, meta: { total: data.length }, error: null };
  }

  private async logExport(tenantId: string, userId: string, reportType: string, format: string, filters: any, rowCount: number) {
    await this.db.query(
      `INSERT INTO report_export_logs (tenant_id, user_id, report_type, export_format, filters_applied, row_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, userId, reportType, format, JSON.stringify(filters), rowCount],
    );
  }

  /**
   * Validates/derives `filter.branch_id` against the caller's branch
   * AccessScope (organization-scoped, branch-scoped where required):
   * - Global access (org_admin and above): no-op.
   * - Single-branch scope: defaults `filter.branch_id` when absent.
   * - Multi-branch scope (multi-branch branch_admin) with no `branch_id`:
   *   - `allowMultiBranch` -> returns the scoped branch ids for callers that
   *     can aggregate across branches (branch comparison reports).
   *   - otherwise -> requires an explicit, in-scope `branch_id`.
   * Throws `ForbiddenException` (and audit-logs a `scope_violation`) if an
   * out-of-scope `branch_id` is requested.
   */
  private async enforceBranchScope(req: any, filter: ReportFilterDto, allowMultiBranch = false): Promise<string[] | undefined> {
    const user = req.user;
    const tenantId = this.tid(req);
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    if (accessScope.isGlobalAccess) return undefined;

    if (filter.branch_id) {
      if (!isBranchInScope(accessScope, filter.branch_id)) {
        await this.auditLog.log({
          tenantId,
          userId: this.uid(req),
          entityType: 'authorization',
          entityId: filter.branch_id,
          action: 'scope_violation',
          newValues: { reason: 'report_branch_out_of_scope', actorBranchIds: accessScope.branchIds, requestedBranchId: filter.branch_id, path: req.originalUrl },
        });
        throw new ForbiddenException('You do not have access to this branch');
      }
      return undefined;
    }

    if (accessScope.branchIds.length === 0) {
      throw new ForbiddenException('No branch access configured for this account');
    }

    if (accessScope.branchIds.length === 1) {
      filter.branch_id = accessScope.branchIds[0];
      return undefined;
    }

    if (allowMultiBranch) return accessScope.branchIds;

    throw new BadRequestException('branch_id is required');
  }

  /** Same scope enforcement as `enforceBranchScope`, for routes taking `branch_id` as a bare query param instead of a `ReportFilterDto`. */
  private async resolveBranchIdParam(req: any, branchId?: string): Promise<string | undefined> {
    const user = req.user;
    const tenantId = this.tid(req);
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    if (accessScope.isGlobalAccess) return branchId;

    if (branchId) {
      if (!isBranchInScope(accessScope, branchId)) {
        await this.auditLog.log({
          tenantId,
          userId: this.uid(req),
          entityType: 'authorization',
          entityId: branchId,
          action: 'scope_violation',
          newValues: { reason: 'report_branch_out_of_scope', actorBranchIds: accessScope.branchIds, requestedBranchId: branchId, path: req.originalUrl },
        });
        throw new ForbiddenException('You do not have access to this branch');
      }
      return branchId;
    }

    if (accessScope.branchIds.length === 0) {
      throw new ForbiddenException('No branch access configured for this account');
    }

    return accessScope.branchIds[0];
  }

  /* ── Attendance ─────────────────────────────────────────────────────────── */

  @Get('attendance/daily-summary')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Daily attendance summary by branch/department' })
  async attendanceDailySummary(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getDailySummary(this.tid(req), filter));
  }

  @Get('attendance/late-arrivals')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Late arrivals with minutes and source' })
  async lateArrivals(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getLateArrivals(this.tid(req), filter));
  }

  @Get('attendance/overtime')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Overtime hours per employee' })
  async overtime(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getOvertime(this.tid(req), filter));
  }

  @Get('attendance/absenteeism')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Absenteeism percentage per employee' })
  async absenteeism(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getAbsenteeism(this.tid(req), filter));
  }

  @Get('attendance/source-analytics')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Attendance source breakdown (biometric, manual, etc.)' })
  async sourceAnalytics(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getSourceAnalytics(this.tid(req), filter));
  }

  @Get('attendance/corrections')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Attendance correction history' })
  async corrections(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getCorrectionHistory(this.tid(req), filter));
  }

  @Get('attendance/work-hours')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Total work hours and overtime per employee' })
  async workHours(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getEmployeeWorkHours(this.tid(req), filter));
  }

  @Get('attendance/monthly-matrix')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Monthly employee × day attendance matrix' })
  async monthlyMatrix(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getMonthlyMatrix(this.tid(req), filter));
  }

  @Get('attendance/punch-logs')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Full punch sequence log per attendance record' })
  async punchLogs(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getPunchLogs(this.tid(req), filter));
  }

  @Get('attendance/missed-punch')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Records with clock_in but no clock_out' })
  async missedPunch(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getMissedPunches(this.tid(req), filter));
  }

  @Get('attendance/shift-attendance')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Attendance grouped by shift' })
  async shiftAttendance(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getShiftAttendance(this.tid(req), filter));
  }

  @Get('attendance/overnight')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Overnight shift attendance records' })
  async overnightAttendance(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getOvernightAttendance(this.tid(req), filter));
  }

  @Get('attendance/regularization')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Attendance regularization (correction requests)' })
  async regularization(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getRegularizationReport(this.tid(req), filter));
  }

  @Get('attendance/verification-method')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Verification method breakdown (face/fingerprint/card)' })
  async verificationMethod(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getVerificationMethodReport(this.tid(req), filter));
  }

  @Get('attendance/break-durations')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Break duration breakdown per employee and break type' })
  async breakDurations(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getBreakDurationsReport(this.tid(req), filter));
  }

  @Get('attendance/break-violations')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Overdue break violations grouped per employee' })
  async breakViolations(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getBreakViolationsReport(this.tid(req), filter));
  }

  @Get('attendance/break-adjusted-hours')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Attendance hours adjusted for unpaid break minutes (informational)' })
  async breakAdjustedHours(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.attendance.getBreakAdjustedHoursReport(this.tid(req), filter));
  }

  /* ── Performance / Attendance Behaviour ────────────────────────────────── */

  @Get('performance/attendance-behaviour')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EXPORT)
  @ApiOperation({ summary: 'Per-employee attendance behaviour snapshot report' })
  async performanceAttendanceBehaviour(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.performance.getAttendanceBehaviourReport(this.tid(req), filter));
  }

  @Get('performance/department')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EXPORT)
  @ApiOperation({ summary: 'Department-level attendance behaviour rollup' })
  async performanceDepartment(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.performance.getDepartmentPerformanceReport(this.tid(req), filter));
  }

  @Get('performance/branch')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EXPORT)
  @ApiOperation({ summary: 'Branch-level attendance behaviour rollup' })
  async performanceBranch(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.performance.getBranchPerformanceReport(this.tid(req), filter));
  }

  @Get('performance/employee')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EXPORT)
  @ApiOperation({ summary: 'Per-employee KRA/KPI/Attendance/Overall performance report' })
  async performanceEmployee(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.performance.getEmployeePerformanceReport(this.tid(req), filter));
  }

  @Get('performance/review-cycle')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EXPORT)
  @ApiOperation({ summary: 'Review cycle rollup — review/snapshot counts and average scores' })
  async performanceReviewCycle(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.performance.getReviewCycleReport(this.tid(req), filter));
  }

  /* ── Recruitment ────────────────────────────────────────────────────────── */

  @Get('recruitment/recruiter-performance')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Vacancies handled/filled, applications reviewed, offers, and avg time-to-fill per recruiter' })
  async recruiterPerformance(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.recruitment.getRecruiterPerformance(this.tid(req), filter));
  }

  @Get('recruitment/source-performance')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Applications, shortlists, hires, and conversion rate by application source' })
  async sourcePerformance(@Req() req: any, @Query() filter: ReportFilterDto) {
    return this.wrap(await this.recruitment.getSourcePerformance(this.tid(req), filter));
  }

  @Get('recruitment/hiring-cost')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Campaign spend, hires, and cost-per-hire per recruitment campaign' })
  async hiringCost(@Req() req: any, @Query() filter: ReportFilterDto) {
    return this.wrap(await this.recruitment.getHiringCost(this.tid(req), filter));
  }

  @Get('recruitment/time-to-hire')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Average days from application to decision and to joining, by department/job' })
  async timeToHire(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.recruitment.getTimeToHire(this.tid(req), filter));
  }

  @Get('recruitment/offer-acceptance')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Offer sent/accepted/declined/withdrawn/expired counts and acceptance rate' })
  async offerAcceptance(@Req() req: any, @Query() filter: ReportFilterDto) {
    return this.wrap(await this.recruitment.getOfferAcceptance(this.tid(req), filter));
  }

  @Get('recruitment/joining-ratio')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Accepted offers vs. candidates who actually joined (converted to employee)' })
  async joiningRatio(@Req() req: any, @Query() filter: ReportFilterDto) {
    return this.wrap(await this.recruitment.getJoiningRatio(this.tid(req), filter));
  }

  @Get('recruitment/campaign-roi')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Campaign cost vs. hires (ROI view over the same hiring-cost data)' })
  async campaignRoi(@Req() req: any, @Query() filter: ReportFilterDto) {
    return this.wrap(await this.recruitment.getCampaignRoi(this.tid(req), filter));
  }

  /* ── HR ─────────────────────────────────────────────────────────────────── */

  @Get('hr/headcount')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Headcount by department and branch' })
  async headcount(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getHeadcountByDepartment(this.tid(req), filter));
  }

  @Get('hr/joining-trend')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Monthly joining trend' })
  async joiningTrend(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getJoiningTrend(this.tid(req), filter));
  }

  @Get('hr/resignation-trend')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Monthly resignation trend' })
  async resignationTrend(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getResignationTrend(this.tid(req), filter));
  }

  @Get('hr/leave-utilization')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Leave utilization per employee' })
  async leaveUtilization(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getLeaveUtilization(this.tid(req), filter));
  }

  @Get('hr/workforce-statistics')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Workforce statistics summary' })
  async workforceStatistics(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getWorkforceStatistics(this.tid(req), filter));
  }

  @Get('hr/employee-directory')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Active employee directory with all details' })
  async employeeDirectory(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getEmployeeDirectory(this.tid(req), filter));
  }

  @Get('hr/transfer-history')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Branch transfer history' })
  async transferHistory(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getTransferHistory(this.tid(req), filter));
  }

  @Get('hr/fine-deductions')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Employee fines and deductions' })
  async fineDeductions(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getFineDeductions(this.tid(req), filter));
  }

  @Get('hr/tenure-analysis')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Tenure bucket analysis by branch/department' })
  async tenureAnalysis(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getTenureAnalysis(this.tid(req), filter));
  }

  @Get('hr/department-demographics')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Gender, employment type, and tenure demographics by department' })
  async departmentDemographics(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getDepartmentDemographics(this.tid(req), filter));
  }

  @Get('hr/account-status')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Users with non-active account status (deactivated, locked, suspended, etc.)' })
  async accountStatus(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.hr.getAccountStatusReport(this.tid(req), filter));
  }

  /* ── Payroll ─────────────────────────────────────────────────────────────── */

  @Get('payroll/monthly-summary')
  @RequirePermission(PERMISSIONS.REPORTS_PAYROLL)
  @ApiOperation({ summary: 'Monthly payroll summary by branch/department' })
  async payrollMonthlySummary(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.payroll.getMonthlySummary(this.tid(req), filter));
  }

  @Get('payroll/payslip-detail')
  @RequirePermission(PERMISSIONS.REPORTS_PAYROLL)
  @ApiOperation({ summary: 'Individual payslip details with all components' })
  async payslipDetail(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.payroll.getPayslipDetail(this.tid(req), filter));
  }

  @Get('payroll/overtime-cost')
  @RequirePermission(PERMISSIONS.REPORTS_PAYROLL)
  @ApiOperation({ summary: 'Overtime cost by department and month' })
  async overtimeCost(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.payroll.getOvertimeCost(this.tid(req), filter));
  }

  @Get('payroll/deduction-analysis')
  @RequirePermission(PERMISSIONS.REPORTS_PAYROLL)
  @ApiOperation({ summary: 'Deduction % of gross by branch/month' })
  async deductionAnalysis(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.payroll.getDeductionAnalysis(this.tid(req), filter));
  }

  @Get('payroll/salary-sheet')
  @RequirePermission(PERMISSIONS.REPORTS_PAYROLL)
  @ApiOperation({ summary: 'Full salary register with all components' })
  async salarySheet(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.payroll.getSalarySheet(this.tid(req), filter));
  }

  @Get('payroll/audit')
  @RequirePermission(PERMISSIONS.REPORTS_PAYROLL)
  @ApiOperation({ summary: 'Payroll variance and audit trail' })
  async payrollAudit(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.payroll.getPayrollAudit(this.tid(req), filter));
  }

  @Get('payroll/fine-deductions')
  @RequirePermission(PERMISSIONS.REPORTS_PAYROLL)
  @ApiOperation({ summary: 'Fines deducted via payroll runs' })
  async payrollFineDeductions(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.payroll.getFineDeductionReport(this.tid(req), filter));
  }

  /* ── Finance ─────────────────────────────────────────────────────────────── */

  @Get('finance/expense-breakdown')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Expense breakdown by category and month' })
  async expenseBreakdown(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.finance.getExpenseBreakdown(this.tid(req), filter));
  }

  @Get('finance/invoice-aging')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Outstanding invoice aging buckets' })
  async invoiceAging(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.finance.getInvoiceAging(this.tid(req), filter));
  }

  @Get('finance/budget-vs-actual')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Budget vs actual spend with variance' })
  async budgetVsActual(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.finance.getBudgetVsActual(this.tid(req), filter));
  }

  @Get('finance/reimbursements')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Reimbursement status by employee' })
  async reimbursements(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.finance.getReimbursementStatus(this.tid(req), filter));
  }

  @Get('finance/payroll-cost-analysis')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Total payroll cost (gross + ot + pf) per branch/month' })
  async payrollCostAnalysis(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.finance.getPayrollCostAnalysis(this.tid(req), filter));
  }

  @Get('finance/branch-expense-summary')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Expense totals per branch per month' })
  async branchExpenseSummary(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.finance.getBranchExpenseSummary(this.tid(req), filter));
  }

  /* ── Leave ───────────────────────────────────────────────────────────────── */

  @Get('leave/balance')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Leave balance per employee per leave type' })
  async leaveBalance(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.leave.getLeaveBalance(this.tid(req), filter));
  }

  @Get('leave/utilization-by-type')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Leave utilization breakdown by type' })
  async leaveUtilizationByType(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.leave.getLeaveUtilizationByType(this.tid(req), filter));
  }

  @Get('leave/approval-status')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Leave requests with approval status' })
  async leaveApprovalStatus(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.leave.getLeaveApprovalStatus(this.tid(req), filter));
  }

  @Get('leave/calendar')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Approved leaves in a date range (for calendar view)' })
  async leaveCalendar(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.leave.getLeaveCalendar(this.tid(req), filter));
  }

  @Get('leave/department-analytics')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Leave analytics grouped by department' })
  async leaveDepartmentAnalytics(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.leave.getDepartmentLeaveAnalytics(this.tid(req), filter));
  }

  @Get('leave/branch-analytics')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Leave analytics grouped by branch' })
  async leaveBranchAnalytics(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.leave.getBranchLeaveAnalytics(this.tid(req), filter));
  }

  /* ── Shift ───────────────────────────────────────────────────────────────── */

  @Get('shift/allocation')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Active shift allocations per employee' })
  async shiftAllocation(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.shift.getShiftAllocation(this.tid(req), filter));
  }

  @Get('shift/coverage')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Scheduled vs actual shift coverage' })
  async shiftCoverage(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.shift.getShiftCoverage(this.tid(req), filter));
  }

  @Get('shift/changes')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Shift reassignment history' })
  async shiftChanges(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.shift.getShiftChanges(this.tid(req), filter));
  }

  @Get('shift/overtime-shifts')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Shifts with highest overtime accumulation' })
  async overtimeShifts(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.shift.getOvertimeShifts(this.tid(req), filter));
  }

  @Get('shift/overnight')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Overnight shift attendance summary' })
  async overnightShifts(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.shift.getOvernightShiftSummary(this.tid(req), filter));
  }

  /* ── Biometrics ──────────────────────────────────────────────────────────── */

  @Get('biometrics/device-activity')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Punch activity per device per day' })
  async deviceActivity(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.biometrics.getDeviceActivity(this.tid(req), filter));
  }

  @Get('biometrics/verification-breakdown')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Face/fingerprint/card % per branch' })
  async verificationBreakdown(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.biometrics.getVerificationBreakdown(this.tid(req), filter));
  }

  @Get('biometrics/device-registry')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'All registered biometric devices' })
  async deviceRegistry(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.biometrics.getDeviceRegistry(this.tid(req), filter));
  }

  @Get('biometrics/punch-timeline')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Chronological punch log for a branch/date range' })
  async punchTimeline(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.biometrics.getPunchTimeline(this.tid(req), filter));
  }

  @Get('biometrics/duplicate-punches')
  @RequirePermission(PERMISSIONS.REPORTS_ATTENDANCE)
  @ApiOperation({ summary: 'Records with high punch count (deduplication fired)' })
  async duplicatePunches(@Req() req: any, @Query() filter: ReportFilterDto) {
    await this.enforceBranchScope(req, filter);
    return this.wrap(await this.biometrics.getDuplicatePunches(this.tid(req), filter));
  }

  /* ── Branch Comparison ───────────────────────────────────────────────────── */

  @Get('branch/attendance-summary')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Attendance KPIs per branch' })
  async branchAttendanceSummary(@Req() req: any, @Query() filter: ReportFilterDto) {
    const branchIds = await this.enforceBranchScope(req, filter, true);
    return this.wrap(await this.branch.getAttendanceSummary(this.tid(req), filter, branchIds));
  }

  @Get('branch/payroll-summary')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Payroll cost per branch' })
  async branchPayrollSummary(@Req() req: any, @Query() filter: ReportFilterDto) {
    const branchIds = await this.enforceBranchScope(req, filter, true);
    return this.wrap(await this.branch.getPayrollSummary(this.tid(req), filter, branchIds));
  }

  @Get('branch/workforce-comparison')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Headcount and demographics across all branches' })
  async branchWorkforceComparison(@Req() req: any, @Query() filter: ReportFilterDto) {
    const branchIds = await this.enforceBranchScope(req, filter, true);
    return this.wrap(await this.branch.getWorkforceComparison(this.tid(req), filter, branchIds));
  }

  @Get('branch/overtime-comparison')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Overtime hours ranked by branch' })
  async branchOvertimeComparison(@Req() req: any, @Query() filter: ReportFilterDto) {
    const branchIds = await this.enforceBranchScope(req, filter, true);
    return this.wrap(await this.branch.getOvertimeComparison(this.tid(req), filter, branchIds));
  }

  @Get('branch/leave-comparison')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Leave utilization ranked by branch' })
  async branchLeaveComparison(@Req() req: any, @Query() filter: ReportFilterDto) {
    const branchIds = await this.enforceBranchScope(req, filter, true);
    return this.wrap(await this.branch.getLeaveComparison(this.tid(req), filter, branchIds));
  }

  @Get('branch/operational-kpis')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Composite operational KPI table across all branches' })
  async branchOperationalKpis(@Req() req: any, @Query() filter: ReportFilterDto) {
    const branchIds = await this.enforceBranchScope(req, filter, true);
    return this.wrap(await this.branch.getOperationalKpis(this.tid(req), filter, branchIds));
  }

  /* ── Operational Analytics Dashboard ─────────────────────────────────────── */

  @Get('analytics/snapshot')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Real-time operational snapshot (KPI dashboard data)' })
  async operationalSnapshot(@Req() req: any, @Query('branch_id') branchId?: string) {
    const scopedBranchId = await this.resolveBranchIdParam(req, branchId);
    const data = await this.analytics.getSnapshot(this.tid(req), scopedBranchId);
    return { success: true, data, error: null };
  }

  @Get('analytics/attendance-trend')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: '7/14/30-day attendance trend data for charts' })
  async attendanceTrend(
    @Req() req: any,
    @Query('branch_id') branchId?: string,
    @Query('days') days?: string,
  ) {
    const scopedBranchId = await this.resolveBranchIdParam(req, branchId);
    const data = await this.analytics.getAttendanceTrend(this.tid(req), scopedBranchId, days ? parseInt(days) : 30);
    return { success: true, data, error: null };
  }

  /* ── Saved Reports ───────────────────────────────────────────────────────── */

  @Get('saved')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'List saved report configurations' })
  async listSaved(@Req() req: any) {
    const data = await this.saved.list(this.tid(req), this.uid(req));
    return this.wrapList(data);
  }

  @Post('saved')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Save a report configuration' })
  async saveReport(@Req() req: any, @Body() dto: SaveReportDto) {
    const data = await this.saved.save(this.tid(req), this.uid(req), dto);
    return { success: true, data, error: null };
  }

  @Put('saved/:id')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Update a saved report configuration' })
  async updateSaved(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<SaveReportDto>) {
    const data = await this.saved.update(this.tid(req), this.uid(req), id, dto);
    return { success: true, data, error: null };
  }

  @Delete('saved/:id')
  @RequirePermission(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Delete a saved report configuration' })
  async deleteSaved(@Req() req: any, @Param('id') id: string) {
    const data = await this.saved.delete(this.tid(req), this.uid(req), id);
    return { success: true, data, error: null };
  }

  /* ── Export (CSV / log audit) ────────────────────────────────────────────── */

  @Post('export/csv')
  @RequirePermission(PERMISSIONS.REPORTS_EXPORT)
  @ApiOperation({ summary: 'Export any report as CSV data (logs to audit table)' })
  async exportCsv(@Req() req: any, @Body() body: { report_type: string; filters: ReportFilterDto; format?: string }) {
    const tenantId = this.tid(req);
    const userId = this.uid(req);
    const { report_type, filters, format = 'csv' } = body;

    // Per-category export permission (e.g. payroll exports require REPORTS_PAYROLL).
    const category = report_type.split('/')[0];
    const requiredPermission = REPORT_CATEGORY_PERMISSION[category] ?? PERMISSIONS.REPORTS_VIEW;
    const allowed = await this.authorizationService.can(req.user, requiredPermission);
    if (!allowed) {
      await this.auditLog.log({
        tenantId,
        userId,
        entityType: 'authorization',
        entityId: userId,
        action: 'permission_denied',
        newValues: { permission: requiredPermission, reportType: report_type, path: req.originalUrl, method: req.method },
      });
      throw new ForbiddenException('You do not have permission to export this report');
    }

    // Branch comparison reports may aggregate across all of a multi-branch
    // branch_admin's branches; everything else needs a single in-scope branch_id.
    const isBranchComparison = category === 'branch';
    const branchIds = await this.enforceBranchScope(req, filters, isBranchComparison);

    type Handler = () => Promise<any>;
    const serviceMap: Record<string, Handler> = {
      // Attendance
      'attendance/daily-summary':     () => this.attendance.getDailySummary(tenantId, { ...filters, limit: 500 }),
      'attendance/late-arrivals':     () => this.attendance.getLateArrivals(tenantId, { ...filters, limit: 500 }),
      'attendance/overtime':          () => this.attendance.getOvertime(tenantId, { ...filters, limit: 500 }),
      'attendance/absenteeism':       () => this.attendance.getAbsenteeism(tenantId, { ...filters, limit: 500 }),
      'attendance/source-analytics':  () => this.attendance.getSourceAnalytics(tenantId, filters),
      'attendance/corrections':       () => this.attendance.getCorrectionHistory(tenantId, { ...filters, limit: 500 }),
      'attendance/work-hours':        () => this.attendance.getEmployeeWorkHours(tenantId, { ...filters, limit: 500 }),
      'attendance/monthly-matrix':    () => this.attendance.getMonthlyMatrix(tenantId, { ...filters, limit: 500 }),
      'attendance/punch-logs':        () => this.attendance.getPunchLogs(tenantId, { ...filters, limit: 500 }),
      'attendance/missed-punch':      () => this.attendance.getMissedPunches(tenantId, { ...filters, limit: 500 }),
      'attendance/shift-attendance':  () => this.attendance.getShiftAttendance(tenantId, { ...filters, limit: 500 }),
      'attendance/overnight':         () => this.attendance.getOvernightAttendance(tenantId, { ...filters, limit: 500 }),
      'attendance/regularization':    () => this.attendance.getRegularizationReport(tenantId, { ...filters, limit: 500 }),
      'attendance/verification-method': () => this.attendance.getVerificationMethodReport(tenantId, filters),
      'attendance/break-durations':   () => this.attendance.getBreakDurationsReport(tenantId, { ...filters, limit: 500 }),
      'attendance/break-violations':  () => this.attendance.getBreakViolationsReport(tenantId, { ...filters, limit: 500 }),
      'attendance/break-adjusted-hours': () => this.attendance.getBreakAdjustedHoursReport(tenantId, { ...filters, limit: 500 }),
      // HR
      'hr/headcount':                 () => this.hr.getHeadcountByDepartment(tenantId, filters),
      'hr/joining-trend':             () => this.hr.getJoiningTrend(tenantId, filters),
      'hr/resignation-trend':         () => this.hr.getResignationTrend(tenantId, filters),
      'hr/leave-utilization':         () => this.hr.getLeaveUtilization(tenantId, { ...filters, limit: 500 }),
      'hr/workforce-statistics':      () => this.hr.getWorkforceStatistics(tenantId, filters),
      'hr/employee-directory':        () => this.hr.getEmployeeDirectory(tenantId, { ...filters, limit: 500 }),
      'hr/transfer-history':          () => this.hr.getTransferHistory(tenantId, { ...filters, limit: 500 }),
      'hr/fine-deductions':           () => this.hr.getFineDeductions(tenantId, { ...filters, limit: 500 }),
      'hr/tenure-analysis':           () => this.hr.getTenureAnalysis(tenantId, filters),
      'hr/department-demographics':   () => this.hr.getDepartmentDemographics(tenantId, filters),
      'hr/account-status':            () => this.hr.getAccountStatusReport(tenantId, { ...filters, limit: 500 }),
      // Payroll
      'payroll/monthly-summary':      () => this.payroll.getMonthlySummary(tenantId, { ...filters, limit: 500 }),
      'payroll/payslip-detail':       () => this.payroll.getPayslipDetail(tenantId, { ...filters, limit: 500 }),
      'payroll/overtime-cost':        () => this.payroll.getOvertimeCost(tenantId, { ...filters, limit: 500 }),
      'payroll/deduction-analysis':   () => this.payroll.getDeductionAnalysis(tenantId, { ...filters, limit: 500 }),
      'payroll/salary-sheet':         () => this.payroll.getSalarySheet(tenantId, { ...filters, limit: 500 }),
      'payroll/audit':                () => this.payroll.getPayrollAudit(tenantId, { ...filters, limit: 500 }),
      'payroll/fine-deductions':      () => this.payroll.getFineDeductionReport(tenantId, { ...filters, limit: 500 }),
      // Finance
      'finance/expense-breakdown':    () => this.finance.getExpenseBreakdown(tenantId, { ...filters, limit: 500 }),
      'finance/invoice-aging':        () => this.finance.getInvoiceAging(tenantId, { ...filters, limit: 500 }),
      'finance/budget-vs-actual':     () => this.finance.getBudgetVsActual(tenantId, { ...filters, limit: 500 }),
      'finance/reimbursements':       () => this.finance.getReimbursementStatus(tenantId, { ...filters, limit: 500 }),
      'finance/payroll-cost-analysis':() => this.finance.getPayrollCostAnalysis(tenantId, { ...filters, limit: 500 }),
      'finance/branch-expense-summary': () => this.finance.getBranchExpenseSummary(tenantId, { ...filters, limit: 500 }),
      // Leave
      'leave/balance':                () => this.leave.getLeaveBalance(tenantId, { ...filters, limit: 500 }),
      'leave/utilization-by-type':    () => this.leave.getLeaveUtilizationByType(tenantId, filters),
      'leave/approval-status':        () => this.leave.getLeaveApprovalStatus(tenantId, { ...filters, limit: 500 }),
      'leave/calendar':               () => this.leave.getLeaveCalendar(tenantId, { ...filters, limit: 500 }),
      'leave/department-analytics':   () => this.leave.getDepartmentLeaveAnalytics(tenantId, filters),
      'leave/branch-analytics':       () => this.leave.getBranchLeaveAnalytics(tenantId, filters),
      // Shift
      'shift/allocation':             () => this.shift.getShiftAllocation(tenantId, { ...filters, limit: 500 }),
      'shift/coverage':               () => this.shift.getShiftCoverage(tenantId, { ...filters, limit: 500 }),
      'shift/changes':                () => this.shift.getShiftChanges(tenantId, { ...filters, limit: 500 }),
      'shift/overtime-shifts':        () => this.shift.getOvertimeShifts(tenantId, { ...filters, limit: 500 }),
      'shift/overnight':              () => this.shift.getOvernightShiftSummary(tenantId, { ...filters, limit: 500 }),
      // Biometrics
      'biometrics/device-activity':   () => this.biometrics.getDeviceActivity(tenantId, { ...filters, limit: 500 }),
      'biometrics/verification-breakdown': () => this.biometrics.getVerificationBreakdown(tenantId, filters),
      'biometrics/device-registry':   () => this.biometrics.getDeviceRegistry(tenantId, { ...filters, limit: 500 }),
      'biometrics/punch-timeline':    () => this.biometrics.getPunchTimeline(tenantId, { ...filters, limit: 500 }),
      'biometrics/duplicate-punches': () => this.biometrics.getDuplicatePunches(tenantId, { ...filters, limit: 500 }),
      // Branch
      'branch/attendance-summary':    () => this.branch.getAttendanceSummary(tenantId, filters, branchIds),
      'branch/payroll-summary':       () => this.branch.getPayrollSummary(tenantId, filters, branchIds),
      'branch/workforce-comparison':  () => this.branch.getWorkforceComparison(tenantId, filters, branchIds),
      'branch/overtime-comparison':   () => this.branch.getOvertimeComparison(tenantId, filters, branchIds),
      'branch/leave-comparison':      () => this.branch.getLeaveComparison(tenantId, filters, branchIds),
      'branch/operational-kpis':      () => this.branch.getOperationalKpis(tenantId, filters, branchIds),
      // Performance / Attendance Behaviour
      'performance/attendance-behaviour': () => this.performance.getAttendanceBehaviourReport(tenantId, { ...filters, limit: 500 }),
      'performance/department':       () => this.performance.getDepartmentPerformanceReport(tenantId, { ...filters, limit: 500 }),
      'performance/branch':           () => this.performance.getBranchPerformanceReport(tenantId, { ...filters, limit: 500 }),
      'performance/employee':         () => this.performance.getEmployeePerformanceReport(tenantId, { ...filters, limit: 500 }),
      'performance/review-cycle':     () => this.performance.getReviewCycleReport(tenantId, { ...filters, limit: 500 }),
      // Recruitment
      'recruitment/recruiter-performance': () => this.recruitment.getRecruiterPerformance(tenantId, filters),
      'recruitment/source-performance':    () => this.recruitment.getSourcePerformance(tenantId, filters),
      'recruitment/hiring-cost':           () => this.recruitment.getHiringCost(tenantId, filters),
      'recruitment/time-to-hire':          () => this.recruitment.getTimeToHire(tenantId, filters),
      'recruitment/offer-acceptance':      () => this.recruitment.getOfferAcceptance(tenantId, filters),
      'recruitment/joining-ratio':         () => this.recruitment.getJoiningRatio(tenantId, filters),
      'recruitment/campaign-roi':          () => this.recruitment.getCampaignRoi(tenantId, filters),
    };

    const handler = serviceMap[report_type];
    if (!handler) return { success: false, data: null, meta: null, error: 'Unknown report type' };

    const result = await handler();
    await this.logExport(tenantId, userId, report_type, format, filters, result.total ?? result.data?.length ?? 0);

    return { success: true, data: result.data, meta: { total: result.total ?? result.data?.length }, error: null };
  }
}
