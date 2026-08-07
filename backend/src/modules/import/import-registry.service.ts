import { Injectable } from '@nestjs/common';
import { Permission } from '../../shared/permissions.constants';
import { AccessScope } from '../../shared/scope.util';

export type ImportFieldType = 'string' | 'number' | 'date' | 'currency' | 'boolean' | 'email' | 'phone' | 'enum' | 'uuid';
export type ImportSeverity = 'warning' | 'error';
export type DuplicateStrategy = 'skip' | 'update' | 'insert' | 'merge';

export interface ImportValidationIssue {
  severity: ImportSeverity;
  column: string;
  field?: string;
  value?: unknown;
  expected?: string;
  reason: string;
  suggestedFix?: string;
}

export interface ImportFieldDef {
  key: string;
  header: string;
  type?: ImportFieldType;
  required?: boolean;
  unique?: boolean;
  sensitive?: boolean;
  aliases?: string[];
  enumValues?: string[];
  defaultValue?: unknown;
  transformer?: (value: unknown) => unknown;
  validate?: (value: unknown, row: Record<string, unknown>) => ImportValidationIssue[];
}

export interface ImportRowContext {
  tenantId: string;
  user: any;
  accessScope: AccessScope;
  rowNumber: number;
  rawRow: Record<string, unknown>;
  mappedRow: Record<string, unknown>;
}

export interface ImportExecutionContext {
  tenantId: string;
  user: any;
  accessScope: AccessScope;
  conflictStrategy: DuplicateStrategy;
  ignoreEmptyValues: boolean;
  overwriteExisting: boolean;
}

export interface ImportExecutionResult {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  warnings: number;
  errors: ImportValidationIssue[];
}

export interface ImportExistingRecordCheck {
  table: string;
  tenantColumn?: string;
  branchColumn?: string;
  uniqueFieldColumns: Record<string, string>;
  displayColumns?: string[];
}

export interface ImportModuleConfig {
  module: string;
  title: string;
  permission: Permission;
  fields: ImportFieldDef[];
  requiredFields: string[];
  uniqueKeys: string[];
  duplicateStrategy?: DuplicateStrategy;
  defaultMappings?: Record<string, string>;
  detectHeaders?: string[];
  existingRecordCheck?: ImportExistingRecordCheck;
  validateRow?: (ctx: ImportRowContext) => Promise<ImportValidationIssue[]> | ImportValidationIssue[];
  executeRows?: (rows: Record<string, unknown>[], ctx: ImportExecutionContext) => Promise<ImportExecutionResult>;
}

@Injectable()
export class ImportRegistryService {
  private readonly registry = new Map<string, ImportModuleConfig>();

  register(config: ImportModuleConfig): void {
    if (this.registry.has(config.module)) {
      throw new Error(`Import module '${config.module}' is already registered`);
    }
    this.registry.set(config.module, {
      ...config,
      requiredFields: config.requiredFields.length ? config.requiredFields : config.fields.filter((f) => f.required).map((f) => f.key),
      uniqueKeys: config.uniqueKeys.length ? config.uniqueKeys : config.fields.filter((f) => f.unique).map((f) => f.key),
    });
  }

  get(module: string): ImportModuleConfig | undefined {
    return this.registry.get(module);
  }

  listModules(): string[] {
    return Array.from(this.registry.keys());
  }

  getPublicConfig(module: string) {
    const config = this.registry.get(module);
    if (!config) return undefined;

    return {
      module: config.module,
      title: config.title,
      fields: config.fields.map(({ key, header, type, required, unique, sensitive, aliases, enumValues }) => ({
        key,
        header,
        type,
        required,
        unique,
        sensitive,
        aliases,
        enumValues,
      })),
      requiredFields: config.requiredFields,
      uniqueKeys: config.uniqueKeys,
      duplicateStrategy: config.duplicateStrategy ?? 'skip',
      supportsExecution: Boolean(config.executeRows),
    };
  }
}
