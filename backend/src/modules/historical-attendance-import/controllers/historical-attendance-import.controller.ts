import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { HistoricalAttendanceImportGuard } from '../guards/historical-attendance-import.guard';
import { HistoricalAttendanceImportService } from '../services/historical-attendance-import.service';
import { HistoricalAttendanceEmployeeMappingService } from '../services/historical-attendance-employee-mapping.service';
import { HistoricalAttendanceValidationService } from '../services/historical-attendance-validation.service';
import { HistoricalAttendanceReconciliationService } from '../services/historical-attendance-reconciliation.service';
import { HistoricalAttendanceRebuildService } from '../services/historical-attendance-rebuild.service';
import { HistoricalAttendanceDependencyRebuildService } from '../services/historical-attendance-dependency-rebuild.service';
import { HistoricalAttendanceRollbackService } from '../services/historical-attendance-rollback.service';
import { HistoricalAttendanceConnectorService } from '../services/historical-attendance-connector.service';
import { HistoricalAttendanceImportExecutionService } from '../services/historical-attendance-import-execution.service';
import {
  AddStagingRowsDto,
  AutoMatchBatchDto,
  ConnectorConfigTestDto,
  ConnectorReadDto,
  CommitAttendanceRebuildDto,
  CreateAttendanceRebuildSummaryDto,
  CreateImportBatchDto,
  CreateImportMappingDto,
  CreateImportSourceDto,
  EmployeeSearchQueryDto,
  ImportLifecycleActionDto,
  ImportPreviewQueryDto,
  ImportListQueryDto,
  ManualEmployeeMappingDto,
  MappingDecisionDto,
  ReconcileAttendancePreviewDto,
  RollbackImportCommitDto,
  UpdateImportBatchStatusDto,
  UpdateImportSourceDto,
} from '../dto/historical-attendance-import.dto';

@ApiTags('Historical Attendance Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, HistoricalAttendanceImportGuard)
@Controller('historical-attendance-import')
export class HistoricalAttendanceImportController {
  constructor(
    private readonly service: HistoricalAttendanceImportService,
    private readonly mappingService: HistoricalAttendanceEmployeeMappingService,
    private readonly validationService: HistoricalAttendanceValidationService,
    private readonly reconciliationService: HistoricalAttendanceReconciliationService,
    private readonly rebuildService: HistoricalAttendanceRebuildService,
    private readonly dependencyRebuildService: HistoricalAttendanceDependencyRebuildService,
    private readonly rollbackService: HistoricalAttendanceRollbackService,
    private readonly connectorService: HistoricalAttendanceConnectorService,
    private readonly executionService: HistoricalAttendanceImportExecutionService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Historical attendance import dashboard summary' })
  async dashboard(@Req() req: any) {
    return { success: true, data: await this.service.getDashboard(this.tenantId(req)), error: null };
  }

  @Get('sources')
  @ApiOperation({ summary: 'List historical attendance import sources' })
  async listSources(@Req() req: any) {
    return { success: true, data: await this.service.listSources(this.tenantId(req)), error: null };
  }

  @Get('connectors')
  @ApiOperation({ summary: 'List production historical attendance import connectors and capabilities' })
  async listConnectors() {
    return { success: true, data: this.connectorService.listConnectors(), error: null };
  }

  @Post('sources')
  @ApiOperation({ summary: 'Create a historical attendance import source' })
  async createSource(@Req() req: any, @Body() body: CreateImportSourceDto) {
    return { success: true, data: await this.service.createSource(this.tenantId(req), this.actor(req), body), error: null };
  }

  @Patch('sources/:id')
  @ApiOperation({ summary: 'Update a historical attendance import source' })
  async updateSource(@Req() req: any, @Param('id') id: string, @Body() body: UpdateImportSourceDto) {
    return { success: true, data: await this.service.updateSource(this.tenantId(req), this.actor(req), id, body), error: null };
  }

  @Post('sources/:id/connectors/validate')
  @ApiOperation({ summary: 'Validate connector configuration for a historical attendance import source' })
  async validateConnector(@Req() req: any, @Param('id') id: string, @Body() body: ConnectorConfigTestDto) {
    return { success: true, data: await this.connectorService.validateSource(this.tenantId(req), id, body), error: null };
  }

  @Post('sources/:id/connectors/test')
  @ApiOperation({ summary: 'Test connector credentials and connectivity for a historical attendance import source' })
  async testConnectorCredentials(@Req() req: any, @Param('id') id: string, @Body() body: ConnectorConfigTestDto) {
    return { success: true, data: await this.connectorService.testCredentials(this.tenantId(req), id, body), error: null };
  }

  @Post('sources/:id/connectors/preview')
  @ApiOperation({ summary: 'Preview normalized-source records before staging an import batch' })
  async previewConnector(@Req() req: any, @Param('id') id: string, @Body() body: ConnectorReadDto) {
    return { success: true, data: await this.connectorService.preview(this.tenantId(req), id, body), error: null };
  }

  @Get('batches')
  @ApiOperation({ summary: 'List historical attendance import batches' })
  async listBatches(@Req() req: any, @Query() query: ImportListQueryDto) {
    return { success: true, ...(await this.service.listBatches(this.tenantId(req), query)), error: null };
  }

  @Get('history')
  @ApiOperation({ summary: 'Organization import history with rollback state and warnings/errors' })
  async listImportHistory(@Req() req: any, @Query() query: ImportListQueryDto) {
    return { success: true, ...(await this.service.listImportHistory(this.tenantId(req), query)), error: null };
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Historical attendance import analytics and statistics' })
  async analytics(@Req() req: any) {
    return { success: true, data: await this.executionService.getAnalytics(this.tenantId(req)), error: null };
  }

  @Get('monitoring')
  @ApiOperation({ summary: 'Historical attendance import queue and execution monitoring' })
  async monitoring(@Req() req: any) {
    return { success: true, data: await this.executionService.getMonitoring(this.tenantId(req)), error: null };
  }

  @Get('production-validation')
  @ApiOperation({ summary: 'Final production readiness validation for historical attendance import framework' })
  async productionValidation(@Req() req: any) {
    return { success: true, data: await this.executionService.getProductionValidation(this.tenantId(req)), error: null };
  }

  @Post('batches')
  @ApiOperation({ summary: 'Create a historical attendance import batch' })
  async createBatch(@Req() req: any, @Body() body: CreateImportBatchDto) {
    return { success: true, data: await this.service.createBatch(this.tenantId(req), this.actor(req), body), error: null };
  }

  @Get('batches/:id/execution')
  @ApiOperation({ summary: 'Get latest background execution status for an import batch' })
  async getExecution(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.executionService.getExecutionStatus(this.tenantId(req), id), error: null };
  }

  @Get('batches/:id')
  @ApiOperation({ summary: 'Get historical attendance import batch details' })
  async getBatch(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.service.getBatch(this.tenantId(req), id), error: null };
  }

  @Patch('batches/:id/status')
  @ApiOperation({ summary: 'Update historical attendance import batch status' })
  async updateBatchStatus(@Req() req: any, @Param('id') id: string, @Body() body: UpdateImportBatchStatusDto) {
    return { success: true, data: await this.service.updateBatchStatus(this.tenantId(req), this.actor(req), id, body), error: null };
  }

  @Post('batches/:id/pause')
  @ApiOperation({ summary: 'Pause an active historical attendance import batch' })
  async pauseBatch(@Req() req: any, @Param('id') id: string, @Body() body: ImportLifecycleActionDto) {
    return { success: true, data: await this.service.pauseBatch(this.tenantId(req), this.actor(req), id, body), error: null };
  }

  @Post('batches/:id/resume')
  @ApiOperation({ summary: 'Resume a paused historical attendance import batch' })
  async resumeBatch(@Req() req: any, @Param('id') id: string, @Body() body: ImportLifecycleActionDto) {
    const tenantId = this.tenantId(req);
    const actor = this.actor(req);
    const batch = await this.service.resumeBatch(tenantId, actor, id, body);
    await this.executionService.resumeLatestImport(tenantId, actor, id);
    return { success: true, data: batch, error: null };
  }

  @Post('batches/:id/cancel')
  @ApiOperation({ summary: 'Cancel a historical attendance import batch before commit' })
  async cancelBatch(@Req() req: any, @Param('id') id: string, @Body() body: ImportLifecycleActionDto) {
    return { success: true, data: await this.service.cancelBatch(this.tenantId(req), this.actor(req), id, body), error: null };
  }

  @Post('batches/:id/retry')
  @ApiOperation({ summary: 'Retry a failed, cancelled, or paused historical attendance import batch' })
  async retryBatch(@Req() req: any, @Param('id') id: string, @Body() body: ImportLifecycleActionDto) {
    const tenantId = this.tenantId(req);
    const actor = this.actor(req);
    const batch = await this.service.retryBatch(tenantId, actor, id, body);
    await this.executionService.resumeLatestImport(tenantId, actor, id);
    return { success: true, data: batch, error: null };
  }

  @Post('batches/:id/rollback')
  @ApiOperation({ summary: 'Rollback a committed historical attendance import batch' })
  async rollbackBatch(@Req() req: any, @Param('id') id: string, @Body() body: RollbackImportCommitDto) {
    return {
      success: true,
      data: await this.rollbackService.rollbackBatch(this.tenantId(req), this.actor(req), id, body?.reason),
      error: null,
    };
  }

  @Post('batches/:id/staging-rows')
  @ApiOperation({ summary: 'Normalize raw punch rows into historical staging' })
  async addStagingRows(@Req() req: any, @Param('id') id: string, @Body() body: AddStagingRowsDto) {
    return { success: true, data: await this.service.addStagingRows(this.tenantId(req), this.actor(req), id, body), error: null };
  }

  @Post('batches/:id/connectors/import-chunk')
  @ApiOperation({ summary: 'Import one connector chunk into historical attendance staging' })
  async importConnectorChunk(@Req() req: any, @Param('id') id: string, @Body() body: ConnectorReadDto) {
    return {
      success: true,
      data: await this.connectorService.importChunk(this.tenantId(req), this.actor(req), id, body),
      error: null,
    };
  }

  @Post('batches/:id/connectors/import')
  @ApiOperation({ summary: 'Import connector chunks into historical attendance staging with resume cursor support' })
  async importConnector(@Req() req: any, @Param('id') id: string, @Body() body: ConnectorReadDto) {
    return {
      success: true,
      data: await this.connectorService.importAll(this.tenantId(req), this.actor(req), id, body),
      error: null,
    };
  }

  @Post('batches/:id/connectors/enqueue')
  @ApiOperation({ summary: 'Queue a connector import for background chunked execution' })
  async enqueueConnectorImport(@Req() req: any, @Param('id') id: string, @Body() body: ConnectorReadDto) {
    return {
      success: true,
      data: await this.executionService.enqueueImport(this.tenantId(req), this.actor(req), id, body),
      error: null,
    };
  }

  @Get('batches/:id/staging-rows')
  @ApiOperation({ summary: 'List normalized staging rows for a historical import batch' })
  async listStagingRows(@Req() req: any, @Param('id') id: string, @Query() query: ImportListQueryDto) {
    return { success: true, data: await this.service.listStagingRows(this.tenantId(req), id, query), error: null };
  }

  @Post('batches/:id/mapping/auto-match')
  @ApiOperation({ summary: 'Automatically match staged historical punches to employees with confidence scoring' })
  async autoMatchBatch(@Req() req: any, @Param('id') id: string, @Body() body: AutoMatchBatchDto) {
    return { success: true, data: await this.mappingService.autoMatchBatch(this.tenantId(req), this.actor(req), id, body), error: null };
  }

  @Get('batches/:id/mapping/unknown-users')
  @ApiOperation({ summary: 'List unresolved historical source users for mapping wizard review' })
  async listUnknownUsers(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.mappingService.listUnknownUsers(this.tenantId(req), id), error: null };
  }

  @Post('batches/:id/mapping/manual')
  @ApiOperation({ summary: 'Resolve a historical source user through manual employee mapping' })
  async createManualMapping(@Req() req: any, @Param('id') id: string, @Body() body: ManualEmployeeMappingDto) {
    return { success: true, data: await this.mappingService.createManualMapping(this.tenantId(req), this.actor(req), id, body), error: null };
  }

  @Post('employee-mappings/:id/approve')
  @ApiOperation({ summary: 'Approve a pending historical employee mapping' })
  async approveMapping(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.mappingService.approveMapping(this.tenantId(req), this.actor(req), id), error: null };
  }

  @Post('employee-mappings/:id/reject')
  @ApiOperation({ summary: 'Reject a pending historical employee mapping' })
  async rejectMapping(@Req() req: any, @Param('id') id: string, @Body() body: MappingDecisionDto) {
    return { success: true, data: await this.mappingService.rejectMapping(this.tenantId(req), this.actor(req), id, body), error: null };
  }

  @Get('employees/search')
  @ApiOperation({ summary: 'Search employees for manual historical import mapping' })
  async searchEmployees(@Req() req: any, @Query() query: EmployeeSearchQueryDto) {
    return { success: true, data: await this.mappingService.searchEmployees(this.tenantId(req), query), error: null };
  }

  @Post('batches/:id/validate')
  @ApiOperation({ summary: 'Validate mapped historical attendance staging rows without touching production attendance' })
  async validateBatch(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.validationService.validateBatch(this.tenantId(req), this.actor(req), id), error: null };
  }

  @Post('batches/:id/reconcile')
  @ApiOperation({ summary: 'Generate read-only attendance reconciliation preview from validated staging rows' })
  async reconcileBatch(@Req() req: any, @Param('id') id: string, @Body() body: ReconcileAttendancePreviewDto) {
    return {
      success: true,
      data: await this.reconciliationService.reconcileBatch(this.tenantId(req), this.actor(req), id, body),
      error: null,
    };
  }

  @Post('batches/:id/rebuild/summary')
  @ApiOperation({ summary: 'Summarize production attendance rebuild impact before committing imports' })
  async createRebuildSummary(@Req() req: any, @Param('id') id: string, @Body() body: CreateAttendanceRebuildSummaryDto) {
    return {
      success: true,
      data: await this.rebuildService.createSummary(this.tenantId(req), this.actor(req), id, body),
      error: null,
    };
  }

  @Post('batches/:id/rebuild/commit')
  @ApiOperation({ summary: 'Commit accepted historical punches into production attendance using a prior summary run' })
  async commitRebuild(@Req() req: any, @Param('id') id: string, @Body() body: CommitAttendanceRebuildDto) {
    return {
      success: true,
      data: await this.rebuildService.commit(this.tenantId(req), this.actor(req), id, body),
      error: null,
    };
  }

  @Get('batches/:id/dependencies/progress')
  @ApiOperation({ summary: 'Get latest downstream dependency rebuild progress for a historical attendance batch' })
  async getDependencyProgress(@Req() req: any, @Param('id') id: string) {
    return {
      success: true,
      data: await this.dependencyRebuildService.getLatestForBatch(this.tenantId(req), id),
      error: null,
    };
  }

  @Get('batches/:id/preview')
  @ApiOperation({ summary: 'Preview historical import validation and reconciliation buckets without importing attendance' })
  async getPreview(@Req() req: any, @Param('id') id: string, @Query() query: ImportPreviewQueryDto) {
    return { success: true, data: await this.reconciliationService.getAttendancePreview(this.tenantId(req), id, query), error: null };
  }

  @Get('logs')
  @ApiOperation({ summary: 'List historical attendance import logs' })
  async listLogs(@Req() req: any) {
    return { success: true, data: await this.service.listLogs(this.tenantId(req)), error: null };
  }

  @Get('batches/:id/logs')
  @ApiOperation({ summary: 'List logs for a historical attendance import batch' })
  async listBatchLogs(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.service.listLogs(this.tenantId(req), id), error: null };
  }

  @Get('mappings')
  @ApiOperation({ summary: 'List source field mappings for historical attendance import' })
  async listMappings(@Req() req: any) {
    return { success: true, data: await this.service.listMappings(this.tenantId(req)), error: null };
  }

  @Post('mappings')
  @ApiOperation({ summary: 'Create a source field mapping for historical attendance import' })
  async createMapping(@Req() req: any, @Body() body: CreateImportMappingDto) {
    return { success: true, data: await this.service.createMapping(this.tenantId(req), this.actor(req), body), error: null };
  }

  private tenantId(req: any) {
    return req.user.tenantId || req.user.tenant_id;
  }

  private actor(req: any) {
    return { sub: req.user.sub };
  }
}
