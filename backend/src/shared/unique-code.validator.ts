import { BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * Validates that a code value is unique within a tenant for active/non-deleted records.
 *
 * Usage:
 *   await assertUniqueCode(db, 'departments', tenantId, 'code', 'DEP001');
 *   await assertUniqueCode(db, 'positions',   tenantId, 'code', 'POS01', { excludeId: id });
 *
 * @param db         DatabaseService instance
 * @param table      SQL table name (hardcoded in calling service — not user input)
 * @param tenantId   Tenant scope
 * @param field      Column name holding the code (e.g. 'code', 'employee_code')
 * @param value      The code value to check
 * @param options    excludeId: omit own row on updates; label: human-readable field name;
 *                   deletionField: 'deleted_at' (default) or 'is_active' for is_active tables
 */
export async function assertUniqueCode(
  db: DatabaseService,
  table: string,
  tenantId: string,
  field: string,
  value: string,
  options: {
    excludeId?: string;
    label?: string;
    deletionField?: 'deleted_at' | 'is_active';
  } = {},
): Promise<void> {
  const { excludeId, label = 'Code', deletionField = 'deleted_at' } = options;

  const activeFilter =
    deletionField === 'is_active' ? 'is_active = true' : 'deleted_at IS NULL';

  const params: any[] = [tenantId, value];
  let sql = `SELECT 1 FROM ${table} WHERE tenant_id = $1 AND ${field} = $2 AND ${activeFilter}`;

  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id != $${params.length}`;
  }

  const { rows } = await db.query(sql, params);
  if (rows.length) {
    throw new BadRequestException(`${label} already exists`);
  }
}

/**
 * Translates a PostgreSQL unique-constraint violation (23505) into a user-friendly
 * ConflictException.  Call this in your catch block:
 *
 *   } catch (e: any) {
 *     translateUniqueViolation(e, 'Department code');
 *     throw e;
 *   }
 */
export function translateUniqueViolation(error: any, label = 'Code'): void {
  if (error?.code === '23505') {
    throw new ConflictException(`${label} already exists`);
  }
}
