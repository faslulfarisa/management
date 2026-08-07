import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
  forwardRef,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../auth/guards/active-org.guard';
import { AuthorizationService } from '../platform/services/authorization.service';
import { UserHierarchyService } from '../platform/services/user-hierarchy.service';
import { AuditLogService } from '../platform/services/audit-log.service';
import { ConfirmImportDto, CreateImportPreviewDto, RemapImportDto } from './dto/import.dto';
import { ImportRegistryService } from './import-registry.service';
import { ImportService } from './import.service';

@ApiTags('Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('import')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly registryService: ImportRegistryService,
    @Inject(forwardRef(() => AuthorizationService))
    private readonly authorizationService: AuthorizationService,
    @Inject(forwardRef(() => UserHierarchyService))
    private readonly userHierarchyService: UserHierarchyService,
    @Inject(forwardRef(() => AuditLogService))
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('registry')
  @ApiOperation({ summary: 'List all registered import modules' })
  async listModules() {
    return { success: true, data: this.registryService.listModules(), error: null };
  }

  @Get('registry/:module')
  @ApiOperation({ summary: 'Get import field definitions for a module' })
  async getModuleConfig(@Param('module') module: string) {
    const config = this.registryService.getPublicConfig(module);
    if (!config) {
      throw new BadRequestException(`Unknown import module: ${module}`);
    }
    return { success: true, data: config, error: null };
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateImportPreviewDto })
  @ApiOperation({ summary: 'Upload, parse, map, validate, and preview an import file without writing data' })
  async preview(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateImportPreviewDto,
  ) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const requestedConfig = dto.module ? this.registryService.get(dto.module) : undefined;
    if (dto.module && !requestedConfig) {
      throw new BadRequestException(`Unknown import module: ${dto.module}`);
    }
    if (requestedConfig) {
      await this.assertAllowed(user, requestedConfig.permission);
    }

    const session = await this.importService.createPreview({
      file,
      requestedModule: dto.module,
      tenantId,
      user,
      accessScope,
      isSensitiveAllowed: this.isSensitiveAllowed(user),
    });

    const config = this.registryService.get(session.module);
    if (config) {
      await this.assertAllowed(user, config.permission);
    }

    await this.auditLog.log({
      tenantId,
      userId: user.sub,
      entityType: 'data_import',
      entityId: session.id,
      action: 'preview',
      newValues: {
        module: session.module,
        file_name: session.fileName,
        rows: session.summary.totalRows,
        errors: session.summary.errorRows,
      },
    });

    return { success: true, data: session, error: null };
  }

  @Post(':id/remap')
  @ApiOperation({ summary: 'Update column mappings or edited preview rows, then revalidate' })
  async remap(@Req() req: Request, @Param('id') id: string, @Body() dto: RemapImportDto) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const existing = this.importService.getSession(id, tenantId);
    const config = this.registryService.get(existing.module);
    if (!config) throw new BadRequestException(`Unknown import module: ${existing.module}`);
    await this.assertAllowed(user, config.permission);

    const session = await this.importService.remapSession({
      sessionId: id,
      tenantId,
      user,
      accessScope,
      mappings: dto.mappings,
      editedRows: dto.rows,
      isSensitiveAllowed: this.isSensitiveAllowed(user),
    });

    return { success: true, data: session, error: null };
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm a validated import session and execute registered module processing' })
  async confirm(@Req() req: Request, @Param('id') id: string, @Body() dto: ConfirmImportDto) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const existing = this.importService.getSession(id, tenantId);
    const config = this.registryService.get(existing.module);
    if (!config) throw new BadRequestException(`Unknown import module: ${existing.module}`);
    await this.assertAllowed(user, config.permission);

    const session = await this.importService.confirm({
      sessionId: id,
      tenantId,
      user,
      accessScope,
      conflictStrategy: dto.conflictStrategy,
      ignoreEmptyValues: dto.ignoreEmptyValues,
      overwriteExisting: dto.overwriteExisting,
    });

    await this.auditLog.log({
      tenantId,
      userId: user.sub,
      entityType: 'data_import',
      entityId: session.id,
      action: 'confirm',
      newValues: {
        module: session.module,
        status: session.status,
        rows: session.summary.totalRows,
        imported: session.execution?.imported ?? 0,
        updated: session.execution?.updated ?? 0,
        skipped: session.execution?.skipped ?? 0,
        failed: session.execution?.failed ?? 0,
        duration_ms: session.durationMs,
      },
    });

    return { success: true, data: session, error: null };
  }

  @Get('history')
  @ApiOperation({ summary: 'List import history for the active tenant' })
  async history(@Req() req: Request, @Query('module') module?: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    return { success: true, data: this.importService.listHistory(tenantId, module), error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an import preview, status, or summary' })
  async getSession(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    return { success: true, data: this.importService.getSession(id, tenantId), error: null };
  }

  @Get(':id/report.csv')
  @ApiOperation({ summary: 'Download row validation report as CSV' })
  async downloadReport(@Req() req: Request, @Res() res: Response, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const csv = this.importService.generateCsvReport(id, tenantId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="import_${id}_report.csv"`);
    res.send(csv);
  }

  private async assertAllowed(user: any, permission: string): Promise<void> {
    const allowed = await this.authorizationService.can(user, permission as any);
    if (!allowed) {
      throw new ForbiddenException('You do not have permission to import this data');
    }
  }

  private isSensitiveAllowed(user: any): boolean {
    return ['super_admin', 'org_admin'].includes(user.userType || user.user_type || '');
  }
}
