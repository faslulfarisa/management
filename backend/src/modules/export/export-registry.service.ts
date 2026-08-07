import { Injectable } from '@nestjs/common';
import { Permission } from '../../shared/permissions.constants';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface ExportColumnDef {
  /** Stable key returned to the frontend and used in column-selection requests. */
  key: string;
  /** Human-readable header (used in CSV / XLSX / PDF). */
  header: string;
  /** SQL expression that produces this column, e.g. `'e.first_name'` or `CONCAT(...)`. */
  dbExpression: string;
  /** Hint for client-side formatters. */
  type?: 'string' | 'number' | 'date' | 'currency' | 'boolean';
  /** If true the column is only included when the caller has the module's base permission
   *  AND at least org_admin-tier access. */
  sensitive?: boolean;
}

export interface ExportModuleConfig {
  /** Unique registry key, e.g. `'employees'`, `'attendance'`. */
  module: string;
  /** Human-readable title used in PDF export headers. */
  title: string;
  /** The RBAC permission required to perform an export for this module. */
  permission: Permission;
  /**
   * Base SQL fragment: `SELECT {columns} FROM ... LEFT JOIN ...`
   *
   * The `{columns}` placeholder is replaced at runtime with the caller's
   * selected columns. The query MUST include a `WHERE <alias>.tenant_id = $1`
   * clause (tenant isolation is non-negotiable).
   */
  baseQuery: string;
  /** The table/alias whose `tenant_id` column is used for tenant isolation. */
  tenantColumn?: string;
  /** The table/alias whose `branch_id` column is used for branch-scope enforcement. */
  branchColumn?: string;
  /** All exportable columns. */
  columns: ExportColumnDef[];
  /** Column keys shown by default when the export dialog opens. */
  defaultColumns: string[];
  /** Optional map of `filterKey -> SQL fragment template`. `$N` placeholder is
   *  appended by the service at runtime. Example: `{ status: '<alias>.status = $N' }` */
  filterMap?: Record<string, string>;
  /** Optional order-by clause appended when no explicit sort is given. */
  defaultOrderBy?: string;
}

// ─── Registry service ─────────────────────────────────────────────────────────

@Injectable()
export class ExportRegistryService {
  private readonly registry = new Map<string, ExportModuleConfig>();

  /** Register a module's export configuration (called at startup). */
  register(config: ExportModuleConfig): void {
    if (this.registry.has(config.module)) {
      throw new Error(`Export module '${config.module}' is already registered`);
    }
    this.registry.set(config.module, config);
  }

  /** Look up a module's config. Returns `undefined` when the module is not registered. */
  get(module: string): ExportModuleConfig | undefined {
    return this.registry.get(module);
  }

  /** List every registered module key (used by the registry introspection endpoint). */
  listModules(): string[] {
    return Array.from(this.registry.keys());
  }

  /** Return the public column metadata for a module (consumed by the frontend dialog). */
  getColumnDefs(module: string): { columns: ExportColumnDef[]; defaultColumns: string[] } | undefined {
    const cfg = this.registry.get(module);
    if (!cfg) return undefined;
    return {
      columns: cfg.columns.map(({ key, header, type, sensitive }) => ({ key, header, type, sensitive, dbExpression: '' })),
      defaultColumns: cfg.defaultColumns,
    };
  }
}
