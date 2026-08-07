import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { DatabaseService } from '../../../shared/database.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { AttendanceBehaviourConfigService } from '../services/attendance-behaviour-config.service';
import { AttendanceBehaviourEngineService } from '../services/attendance-behaviour-engine.service';
import { PerformanceService } from '../services/performance.service';
import { resolvePerformanceScope, PerformanceScope } from '../utils/performance-scope.util';

/**
 * Attendance Behaviour Performance Engine endpoints — configuration, manual
 * (re)calculation, snapshot/summary reads, and attendance-score override.
 * Row-level visibility (self / team / branch / org) is resolved per-request
 * rather than relying on permission grants alone, since `employee` and
 * `manager`-tier users share the same baseline PERFORMANCE_BEHAVIOUR_VIEW
 * permission — see RBAC matrix in docs/PERFORMANCE_ATTENDANCE_ENGINE_REPORT.md.
 */
@ApiTags('Performance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('performance')
export class AttendancePerformanceController {
  constructor(
    private readonly db: DatabaseService,
    private readonly userHierarchyService: UserHierarchyService,
    private readonly configService: AttendanceBehaviourConfigService,
    private readonly engine: AttendanceBehaviourEngineService,
    private readonly performanceService: PerformanceService,
  ) {}

  @Get('attendance-behaviour/config')
  @RequirePermission(PERMISSIONS.PERFORMANCE_BEHAVIOUR_CONFIGURE)
  @ApiOperation({ summary: 'Get the tenant attendance behaviour scoring configuration' })
  async getConfig(@Req() req: any) {
    const tenantId = this._tenantId(req);
    const config = await this.configService.getConfig(tenantId);
    return { success: true, data: config, error: null };
  }

  @Put('attendance-behaviour/config')
  @RequirePermission(PERMISSIONS.PERFORMANCE_BEHAVIOUR_CONFIGURE)
  @ApiOperation({ summary: 'Update weightages, penalties, thresholds, and rating buckets' })
  async updateConfig(@Req() req: any, @Body() data: any) {
    const tenantId = this._tenantId(req);
    const config = await this.configService.updateConfig(tenantId, req.user.sub, data);
    return { success: true, data: config, error: null };
  }

  @Post('cycles/:id/calculate-attendance')
  @RequirePermission(PERMISSIONS.PERFORMANCE_BEHAVIOUR_RECALCULATE)
  @ApiOperation({ summary: 'Generate attendance behaviour snapshots for every employee in a cycle' })
  async calculateAttendance(@Req() req: any, @Param('id') cycleId: string) {
    const tenantId = this._tenantId(req);
    const result = await this.engine.generateForCycle(tenantId, cycleId, req.user.sub);
    return { success: true, data: result, error: null };
  }

  @Post('cycles/:id/recalculate-attendance')
  @RequirePermission(PERMISSIONS.PERFORMANCE_BEHAVIOUR_RECALCULATE)
  @ApiOperation({ summary: 'Recalculate attendance behaviour snapshots for a still-open cycle' })
  async recalculateAttendance(@Req() req: any, @Param('id') cycleId: string) {
    const tenantId = this._tenantId(req);
    const result = await this.engine.recalculateForCycle(tenantId, cycleId, req.user.sub);
    return { success: true, data: result, error: null };
  }

  @Get('attendance-behaviour/snapshots')
  @RequirePermission(PERMISSIONS.PERFORMANCE_BEHAVIOUR_VIEW)
  @ApiOperation({ summary: 'List attendance behaviour snapshots, scoped to the caller (self/team/branch/org)' })
  async getSnapshots(@Req() req: any, @Query() query: any) {
    const tenantId = this._tenantId(req);
    const scope = await this._resolveScope(req, tenantId);
    if ((scope.mode === 'self' || scope.mode === 'team') && !scope.employeeIds?.length) {
      return { success: true, data: [], error: null };
    }

    const params: any[] = [tenantId];
    let where = 's.tenant_id = $1';
    let idx = 2;
    if (query.cycle_id) { where += ` AND s.cycle_id = $${idx++}`; params.push(query.cycle_id); }
    if (scope.mode === 'self' || scope.mode === 'team') {
      where += ` AND s.employee_id = ANY($${idx++}::uuid[])`; params.push(scope.employeeIds);
    } else if (scope.mode === 'branch' && scope.branchIds?.length) {
      where += ` AND e.branch_id = ANY($${idx++}::uuid[])`; params.push(scope.branchIds);
    }
    if (query.employee_id) { where += ` AND s.employee_id = $${idx++}`; params.push(query.employee_id); }

    const { rows } = await this.db.query(
      `SELECT s.*, e.first_name, e.last_name, e.employee_code, e.branch_id, e.department_id
       FROM attendance_performance_snapshots s
       JOIN employees e ON s.employee_id = e.id
       WHERE ${where} ORDER BY e.first_name, e.last_name`,
      params,
    );
    return { success: true, data: rows, error: null };
  }

  @Get('attendance-behaviour/summary')
  @RequirePermission(PERMISSIONS.PERFORMANCE_BEHAVIOUR_VIEW)
  @ApiOperation({ summary: 'Org/branch/team attendance behaviour analytics for one review cycle' })
  async getSummary(@Req() req: any, @Query('cycle_id') cycleId: string) {
    const tenantId = this._tenantId(req);
    const scope = await this._resolveScope(req, tenantId);
    const { where, params } = this._scopedWhere(tenantId, cycleId, scope);
    if ((scope.mode === 'self' || scope.mode === 'team') && !scope.employeeIds?.length) {
      return { success: true, data: this._emptySummary(), error: null };
    }

    const [avgRes, topRes, attentionRes] = await Promise.all([
      this.db.query(
        `SELECT AVG(s.behaviour_score) AS avg_score, AVG(s.attendance_percentage) AS avg_attendance_pct,
                AVG(s.attendance_compliance_percentage) AS avg_compliance_pct, COUNT(*)::int AS total
         FROM attendance_performance_snapshots s JOIN employees e ON s.employee_id = e.id WHERE ${where}`,
        params,
      ),
      this.db.query(
        `SELECT e.id, e.first_name, e.last_name, s.behaviour_score, s.behaviour_rating
         FROM attendance_performance_snapshots s JOIN employees e ON s.employee_id = e.id
         WHERE ${where} ORDER BY s.behaviour_score DESC LIMIT 10`,
        params,
      ),
      this.db.query(
        `SELECT e.id, e.first_name, e.last_name, s.behaviour_score, s.behaviour_rating, s.unapproved_absence_days, s.late_count
         FROM attendance_performance_snapshots s JOIN employees e ON s.employee_id = e.id
         WHERE ${where} ORDER BY s.behaviour_score ASC LIMIT 10`,
        params,
      ),
    ]);

    let departmentRanking: any[] = [];
    let branchRanking: any[] = [];
    let mostImproved: any[] = [];
    if (scope.mode === 'org' || scope.mode === 'branch') {
      const [deptRes, branchRes, improvedRes] = await Promise.all([
        this.db.query(
          `SELECT d.id, d.name, AVG(s.behaviour_score) AS avg_score, COUNT(*)::int AS employee_count
           FROM attendance_performance_snapshots s JOIN employees e ON s.employee_id = e.id
           LEFT JOIN departments d ON e.department_id = d.id
           WHERE ${where} GROUP BY d.id, d.name ORDER BY avg_score DESC`,
          params,
        ),
        this.db.query(
          `SELECT b.id, b.name, AVG(s.behaviour_score) AS avg_score, COUNT(*)::int AS employee_count
           FROM attendance_performance_snapshots s JOIN employees e ON s.employee_id = e.id
           LEFT JOIN branches b ON e.branch_id = b.id
           WHERE ${where} GROUP BY b.id, b.name ORDER BY avg_score DESC`,
          params,
        ),
        this.db.query(
          `SELECT e.id, e.first_name, e.last_name, s.behaviour_score AS current_score, prev.behaviour_score AS previous_score,
                  (s.behaviour_score - prev.behaviour_score) AS improvement
           FROM attendance_performance_snapshots s
           JOIN employees e ON s.employee_id = e.id
           JOIN review_cycles rc ON s.cycle_id = rc.id
           JOIN LATERAL (
             SELECT s2.behaviour_score FROM attendance_performance_snapshots s2
             JOIN review_cycles rc2 ON s2.cycle_id = rc2.id
             WHERE s2.tenant_id = s.tenant_id AND s2.employee_id = s.employee_id AND rc2.start_date < rc.start_date
             ORDER BY rc2.start_date DESC LIMIT 1
           ) prev ON true
           WHERE ${where}
           ORDER BY improvement DESC LIMIT 10`,
          params,
        ),
      ]);
      departmentRanking = deptRes.rows;
      branchRanking = branchRes.rows;
      mostImproved = improvedRes.rows;
    }

    const agg = avgRes.rows[0] ?? {};
    return {
      success: true,
      data: {
        averageScore: parseFloat(agg.avg_score ?? 0),
        averageAttendancePct: parseFloat(agg.avg_attendance_pct ?? 0),
        averageCompliancePct: parseFloat(agg.avg_compliance_pct ?? 0),
        totalEmployees: agg.total ?? 0,
        topPerformers: topRes.rows,
        needsAttention: attentionRes.rows,
        departmentRanking, branchRanking, mostImproved,
      },
      error: null,
    };
  }

  @Get('timeline')
  @RequirePermission(PERMISSIONS.PERFORMANCE_VIEW)
  @ApiOperation({ summary: 'Chronological performance + attendance events for one employee/cycle' })
  async getTimeline(@Req() req: any, @Query('employee_id') employeeId: string, @Query('cycle_id') cycleId: string) {
    const tenantId = this._tenantId(req);
    const scope = await this._resolveScope(req, tenantId);
    if ((scope.mode === 'self' || scope.mode === 'team') && !scope.employeeIds?.includes(employeeId)) {
      return { success: true, data: [], error: null };
    }
    const timeline = await this.performanceService.getPerformanceTimeline(tenantId, employeeId, cycleId);
    return { success: true, data: timeline, error: null };
  }

  @Post('reviews/:id/override-attendance-score')
  @RequirePermission(PERMISSIONS.PERFORMANCE_BEHAVIOUR_OVERRIDE)
  @ApiOperation({ summary: 'Manager override of the attendance component on a review (requires a reason, fully audited)' })
  async overrideAttendanceScore(@Req() req: any, @Param('id') reviewId: string, @Body() body: { score: number; reason: string }) {
    const tenantId = this._tenantId(req);
    const review = await this.performanceService.overrideAttendanceScore(tenantId, reviewId, req.user.sub, body.score, body.reason);
    return { success: true, data: review, error: null };
  }

  // ── Scope resolution ─────────────────────────────────────────────────────

  private _tenantId(req: any): string {
    return req.user.tenantId || req.user.tenant_id;
  }

  private async _resolveScope(req: any, tenantId: string): Promise<PerformanceScope> {
    return resolvePerformanceScope(this.db, this.userHierarchyService, req.user, tenantId);
  }

  private _scopedWhere(tenantId: string, cycleId: string, scope: PerformanceScope): { where: string; params: any[] } {
    const params: any[] = [tenantId, cycleId];
    let where = 's.tenant_id = $1 AND s.cycle_id = $2';
    let idx = 3;
    if (scope.mode === 'self' || scope.mode === 'team') {
      where += ` AND s.employee_id = ANY($${idx++}::uuid[])`;
      params.push(scope.employeeIds ?? []);
    } else if (scope.mode === 'branch' && scope.branchIds?.length) {
      where += ` AND e.branch_id = ANY($${idx++}::uuid[])`;
      params.push(scope.branchIds);
    }
    return { where, params };
  }

  private _emptySummary() {
    return {
      averageScore: 0, averageAttendancePct: 0, averageCompliancePct: 0, totalEmployees: 0,
      topPerformers: [], needsAttention: [], departmentRanking: [], branchRanking: [], mostImproved: [],
    };
  }
}
