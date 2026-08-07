import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformDataService } from '../services/platform-data.service';

@ApiTags('Platform Data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('platform/orgs')
export class PlatformDataController {
  constructor(private readonly platformDataService: PlatformDataService) {}

  private assertCanUsePlatformDashboard(user: any) {
    if (user?.isSuperAdmin) return;
    if ((user?.userType === 'org_admin' || user?.isOrgAdmin) && user?.tenantId) return;
    throw new ForbiddenException('Only super admins and organization admins can access platform dashboard data');
  }

  private assertCanAccessOrg(user: any, orgId: string) {
    this.assertCanUsePlatformDashboard(user);
    if (user.isSuperAdmin || user.tenantId === orgId) return;
    throw new ForbiddenException('You can only access your active organization');
  }

  @Get()
  @ApiOperation({ summary: 'Accessible orgs with summary stats' })
  async getAllOrgsStats(@Req() req: Request) {
    const user = (req as any).user;
    this.assertCanUsePlatformDashboard(user);
    const data = await this.platformDataService.getAllOrgsStats(user.isSuperAdmin ? undefined : [user.tenantId]);
    return { success: true, data, meta: null, error: null };
  }

  @Get(':orgId/stats')
  @ApiOperation({ summary: 'Single org aggregate stats' })
  async getOrgStats(@Req() req: Request, @Param('orgId') orgId: string) {
    this.assertCanAccessOrg((req as any).user, orgId);
    const data = await this.platformDataService.getOrgStats(orgId);
    return { success: true, data, meta: null, error: null };
  }

  @Get(':orgId/employees')
  @ApiOperation({ summary: 'Org employee list' })
  async getOrgEmployees(@Req() req: Request, @Param('orgId') orgId: string, @Query() filters: any) {
    this.assertCanAccessOrg((req as any).user, orgId);
    const result = await this.platformDataService.getOrgEmployees(orgId, filters);
    return { success: true, data: result.data, meta: result.meta, error: null };
  }

  @Get(':orgId/employees/:empId/attendance-status')
  @ApiOperation({ summary: "Live biometric attendance status for an employee" })
  async getOrgEmployeeAttendanceStatus(@Req() req: Request, @Param('orgId') orgId: string, @Param('empId') empId: string) {
    const user = (req as any).user;
    this.assertCanAccessOrg(user, orgId);
    const status = await this.platformDataService.getOrgEmployeeAttendanceStatus(orgId, empId, user.sub);
    return { success: true, data: status, meta: null, error: null };
  }

  @Patch(':orgId/employees/:empId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update an employee's status" })
  async updateOrgEmployeeStatus(
    @Req() req: Request,
    @Param('orgId') orgId: string,
    @Param('empId') empId: string,
    @Body() body: { status: string },
  ) {
    const user = (req as any).user;
    this.assertCanAccessOrg(user, orgId);
    const employee = await this.platformDataService.updateOrgEmployeeStatus(orgId, empId, body.status, user.sub);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Delete(':orgId/employees/:empId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete an employee from an org' })
  async deleteOrgEmployee(@Req() req: Request, @Param('orgId') orgId: string, @Param('empId') empId: string) {
    this.assertCanAccessOrg((req as any).user, orgId);
    await this.platformDataService.deleteOrgEmployee(orgId, empId);
    return { success: true, data: null, meta: null, error: null };
  }

  @Get(':orgId/attendance')
  @ApiOperation({ summary: 'Org attendance records' })
  async getOrgAttendance(@Req() req: Request, @Param('orgId') orgId: string, @Query() filters: any) {
    this.assertCanAccessOrg((req as any).user, orgId);
    const result = await this.platformDataService.getOrgAttendance(orgId, filters);
    return { success: true, data: result.data, meta: result.meta, error: null };
  }

  @Get(':orgId/attendance/summary')
  @ApiOperation({ summary: 'Org attendance status summary' })
  async getOrgAttendanceSummary(@Req() req: Request, @Param('orgId') orgId: string, @Query() filters: any) {
    this.assertCanAccessOrg((req as any).user, orgId);
    const data = await this.platformDataService.getOrgAttendanceSummary(orgId, filters);
    return { success: true, data, meta: null, error: null };
  }

  @Get(':orgId/attendance/requests')
  @ApiOperation({ summary: 'Org attendance requests' })
  async getOrgAttendanceRequests(@Req() req: Request, @Param('orgId') orgId: string, @Query() filters: any) {
    this.assertCanAccessOrg((req as any).user, orgId);
    const data = await this.platformDataService.getOrgAttendanceRequests(orgId, filters);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':orgId/attendance/requests/:requestId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve an org attendance request' })
  async approveOrgAttendanceRequest(@Req() req: Request, @Param('orgId') orgId: string, @Param('requestId') requestId: string) {
    const user = (req as any).user;
    this.assertCanAccessOrg(user, orgId);
    const data = await this.platformDataService.approveOrgAttendanceRequest(orgId, requestId, user.sub);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':orgId/attendance/requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an org attendance request' })
  async rejectOrgAttendanceRequest(
    @Req() req: Request,
    @Param('orgId') orgId: string,
    @Param('requestId') requestId: string,
    @Body() body: { reason?: string },
  ) {
    const user = (req as any).user;
    this.assertCanAccessOrg(user, orgId);
    const data = await this.platformDataService.rejectOrgAttendanceRequest(orgId, requestId, user.sub, body?.reason);
    return { success: true, data, meta: null, error: null };
  }

  @Get(':orgId/attendance/breaks/violations')
  @ApiOperation({ summary: 'Org break violations' })
  async getOrgBreakViolations(@Req() req: Request, @Param('orgId') orgId: string, @Query() filters: any) {
    this.assertCanAccessOrg((req as any).user, orgId);
    const data = await this.platformDataService.getOrgBreakViolations(orgId, filters);
    return { success: true, data, meta: null, error: null };
  }

  @Get(':orgId/departments')
  @ApiOperation({ summary: 'Org departments with headcount' })
  async getOrgDepartments(@Req() req: Request, @Param('orgId') orgId: string) {
    this.assertCanAccessOrg((req as any).user, orgId);
    const data = await this.platformDataService.getOrgDepartments(orgId);
    return { success: true, data, meta: null, error: null };
  }
}
