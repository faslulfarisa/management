import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service';
import { ExportRegistryService, ExportModuleConfig, ExportColumnDef } from './export-registry.service';
import { AccessScope, branchScopeClause } from '../../shared/scope.util';

export interface ExportResult {
  headers: string[];
  rows: string[][];
  totalCount: number;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ExportRegistryService,
  ) {}

  /**
   * Fetch export data for a given module, applying tenant isolation, branch
   * scoping, caller-selected columns, and caller-supplied filters.
   *
   * Reuses the module's registered base query (with its JOINs) — no new
   * business logic is created.
   */
  async fetchExportData(
    module: string,
    tenantId: string,
    accessScope: AccessScope,
    opts: {
      columns?: string[];
      filters?: Record<string, any>;
      limit?: number;
      isSensitiveAllowed?: boolean;
    },
  ): Promise<ExportResult> {
    const config = this.registry.get(module);
    if (!config) {
      throw new BadRequestException(`Unknown export module: ${module}`);
    }

    // ── Resolve columns ───────────────────────────────────────────────────
    const requestedKeys = opts.columns?.length
      ? opts.columns
      : config.defaultColumns;

    const resolvedColumns = this.resolveColumns(config, requestedKeys, opts.isSensitiveAllowed ?? false);

    if (resolvedColumns.length === 0) {
      throw new BadRequestException('No valid columns selected for export');
    }

    // ── Build SELECT list ─────────────────────────────────────────────────
    const selectList = resolvedColumns
      .map((col) => `${col.dbExpression} AS "${col.key}"`)
      .join(', ');

    // Replace {columns} placeholder in base query
    let query = config.baseQuery.replace('{columns}', selectList);

    // ── Build WHERE clauses ───────────────────────────────────────────────
    const params: any[] = [tenantId];
    let paramIdx = 2;

    // Branch scoping
    if (config.branchColumn) {
      const scope = branchScopeClause(accessScope, config.branchColumn, paramIdx);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
        paramIdx += scope.params.length;
      }
    }

    // Apply caller-supplied filters
    if (opts.filters && config.filterMap) {
      for (const [filterKey, rawValue] of Object.entries(opts.filters)) {
        const filterValue = this.normalizeFilterValue(rawValue);
        if (this.isEmptyFilterValue(filterValue)) continue;
        const template = config.filterMap[filterKey];
        if (!template) continue;

        if (filterKey === 'search') {
          // Search filters use ILIKE with % wrapping — the same parameter may
          // appear multiple times in the template, so we count occurrences.
          const searchValue = `%${String(filterValue)}%`;
          const occurrences = (template.match(/\$N/g) || []).length;
          let resolved = template;
          for (let i = 0; i < occurrences; i++) {
            resolved = resolved.replace('$N', `$${paramIdx}`);
            // All search occurrences share the same param value
          }
          query += ` AND ${resolved}`;
          params.push(searchValue);
          paramIdx += 1;
        } else if (filterKey.startsWith('date_')) {
          // Date filters
          const dateValue = new Date(filterValue as any);
          if (Number.isNaN(dateValue.getTime())) continue;
          const resolved = template.replace('$N', `$${paramIdx}`);
          query += ` AND ${resolved}`;
          params.push(dateValue);
          paramIdx += 1;
        } else {
          const values = Array.isArray(filterValue) ? filterValue : [filterValue];
          const placeholders = values.map((_, i) => `$${paramIdx + i}`);
          const resolved = Array.isArray(filterValue)
            ? this.expandArrayFilterTemplate(template, placeholders)
            : template.replace('$N', `$${paramIdx}`);
          query += ` AND ${resolved}`;
          params.push(...values);
          paramIdx += values.length;
        }
      }
    }

    // ── ORDER BY ──────────────────────────────────────────────────────────
    if (config.defaultOrderBy) {
      query += ` ORDER BY ${config.defaultOrderBy}`;
    }

    // ── LIMIT (cap at 10 000 for safety) ──────────────────────────────────
    const exportLimit = Math.min(opts.limit || 10000, 10000);
    query += ` LIMIT $${paramIdx}`;
    params.push(exportLimit);
    paramIdx += 1;

    // ── Execute ───────────────────────────────────────────────────────────
    const { rows } = await this.db.query(query, params);

    // ── Format into string[][] for export utilities ───────────────────────
    const headers = resolvedColumns.map((c) => c.header);
    const dataRows = rows.map((row: any) =>
      resolvedColumns.map((col) => this.formatValue(row[col.key], col.type)),
    );

    // ── Count (separate query, same WHERE, no LIMIT) ─────────────────────
    const countQuery = query
      .replace(
        /SELECT .+ FROM/s,
        'SELECT COUNT(*) AS count FROM',
      )
      .replace(/ORDER BY .+$/s, '')
      .replace(/LIMIT \$\d+$/s, '');
    const countParams = params.slice(0, -1); // remove the LIMIT param
    let totalCount = rows.length;
    try {
      const { rows: countRows } = await this.db.query(countQuery, countParams);
      totalCount = parseInt(countRows[0]?.count ?? rows.length, 10);
    } catch {
      // If count query fails (edge case), fall back to rows.length
    }

    return { headers, rows: dataRows, totalCount };
  }

  /**
   * Generate a CSV string from export results (server-side).
   */
  generateCsv(result: ExportResult): string {
    const bom = '\uFEFF'; // UTF-8 BOM for Excel
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = result.headers.map(escape).join(',');
    const body = result.rows
      .map((row) => row.map(escape).join(','))
      .join('\n');
    return `${bom}${header}\n${body}`;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resolveColumns(
    config: ExportModuleConfig,
    requestedKeys: string[],
    isSensitiveAllowed: boolean,
  ): ExportColumnDef[] {
    return requestedKeys
      .map((key) => config.columns.find((c) => c.key === key))
      .filter((col): col is ExportColumnDef => {
        if (!col) return false;
        if (col.sensitive && !isSensitiveAllowed) return false;
        return true;
      });
  }

  private formatValue(value: any, type?: string): string {
    if (value == null) return '';
    switch (type) {
      case 'date':
        try {
          return new Date(value).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
        } catch {
          return String(value);
        }
      case 'currency':
        return typeof value === 'number'
          ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : String(value);
      case 'number':
        return typeof value === 'number' ? value.toLocaleString('en-IN') : String(value);
      case 'boolean':
        return value ? 'Yes' : 'No';
      default:
        return String(value);
    }
  }

  private normalizeFilterValue(value: any): any {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.normalizeFilterValue(item))
        .filter((item) => !this.isEmptyFilterValue(item));
    }

    if (value && typeof value === 'object') {
      if ('value' in value) return this.normalizeFilterValue(value.value);
      if ('id' in value) return this.normalizeFilterValue(value.id);
      if ('key' in value) return this.normalizeFilterValue(value.key);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      return trimmed;
    }

    return value;
  }

  private isEmptyFilterValue(value: any): boolean {
    if (value == null || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  private expandArrayFilterTemplate(template: string, placeholders: string[]): string {
    const inClause = `(${placeholders.join(', ')})`;

    if (template.includes('= $N')) {
      return template.replace('= $N', `IN ${inClause}`);
    }

    return template.replace('$N', inClause);
  }
}
