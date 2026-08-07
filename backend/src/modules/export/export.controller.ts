import {
  Controller, Post, Get, Body, Param, Req, Res, UseGuards,
  BadRequestException, ForbiddenException, Inject, forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../auth/guards/active-org.guard';
import { AuthorizationService } from '../platform/services/authorization.service';
import { UserHierarchyService } from '../platform/services/user-hierarchy.service';
import { AuditLogService } from '../platform/services/audit-log.service';
import { ExportService } from './export.service';
import { ExportRegistryService } from './export-registry.service';
import { ExportRequestDto } from './dto/export.dto';

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('export')
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly registryService: ExportRegistryService,
    @Inject(forwardRef(() => AuthorizationService))
    private readonly authorizationService: AuthorizationService,
    @Inject(forwardRef(() => UserHierarchyService))
    private readonly userHierarchyService: UserHierarchyService,
    @Inject(forwardRef(() => AuditLogService))
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Registry introspection (column definitions for the frontend dialog) ──

  @Get('registry')
  @ApiOperation({ summary: 'List all registered export modules' })
  async listModules() {
    const modules = this.registryService.listModules();
    return { success: true, data: modules, error: null };
  }

  @Get('registry/:module')
  @ApiOperation({ summary: 'Get column definitions for an export module' })
  async getModuleConfig(@Param('module') module: string) {
    const config = this.registryService.getColumnDefs(module);
    if (!config) {
      throw new BadRequestException(`Unknown export module: ${module}`);
    }
    return { success: true, data: config, error: null };
  }

  // ── Export endpoint ──────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Export data for a module (CSV / XLSX download)' })
  async exportData(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: ExportRequestDto,
  ) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;

    // ── Validate module exists ────────────────────────────────────────────
    const config = this.registryService.get(dto.module);
    if (!config) {
      throw new BadRequestException(`Unknown export module: ${dto.module}`);
    }

    // ── Permission check ──────────────────────────────────────────────────
    const allowed = await this.authorizationService.can(user, config.permission);
    if (!allowed) {
      throw new ForbiddenException('You do not have permission to export this data');
    }

    // ── Access scope (branch restriction) ─────────────────────────────────
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);

    // ── Sensitive column access — only org_admin+ can see sensitive cols ───
    const isSensitiveAllowed = ['super_admin', 'org_admin'].includes(
      user.userType || user.user_type || '',
    );

    // ── Fetch data ────────────────────────────────────────────────────────
    const result = await this.exportService.fetchExportData(
      dto.module,
      tenantId,
      accessScope,
      {
        columns: dto.columns,
        filters: dto.scope === 'all' ? {} : dto.filters,
        limit: dto.limit,
        isSensitiveAllowed,
      },
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    await this.auditLog.log({
      tenantId,
      userId: user.sub,
      entityType: 'data_export',
      entityId: randomUUID(),
      action: 'export',
      newValues: {
        module: dto.module,
        format: dto.format,
        scope: dto.scope || 'filtered',
        columns: dto.columns || config.defaultColumns,
        record_count: result.totalCount,
        filters: dto.filters || {},
      },
    });

    // ── Generate file ─────────────────────────────────────────────────────
    const dateStamp = new Date().toISOString().split('T')[0];
    const baseFilename = `${dto.module}_export_${dateStamp}`;

    if (dto.format === 'csv') {
      const csv = this.exportService.generateCsv(result);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.csv"`);
      res.send(csv);
    } else {
      // XLSX — generate server-side using xlsx package
      try {
        const XLSX = await import('xlsx');
        const aoa = [result.headers, ...result.rows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Auto-fit column widths
        ws['!cols'] = result.headers.map((h, i) => {
          const maxLen = Math.max(
            h.length,
            ...result.rows.map((r) => String(r[i] ?? '').length),
          );
          return { wch: Math.min(maxLen + 2, 40) };
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, config.title.slice(0, 31));
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.xlsx"`);
        res.send(buf);
      } catch (err) {
        // Fallback to CSV if xlsx is unavailable
        const csv = this.exportService.generateCsv(result);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.csv"`);
        res.send(csv);
      }
    }
  }
}
