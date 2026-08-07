import { DatabaseService } from '../../../shared/database.service';

export async function isOrganizationAdmin(db: DatabaseService, tenantId: string, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM user_tenants
     WHERE tenant_id = $1
       AND user_id = $2
       AND (is_org_admin = true OR user_type = 'org_admin')
     LIMIT 1`,
    [tenantId, userId],
  );
  if (rows.length) return true;

  const { rows: roleRows } = await db.query(
    `SELECT 1 FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.tenant_id = $1
       AND ur.user_id = $2
       AND r.name = 'org_admin'
       AND r.is_system = true
     LIMIT 1`,
    [tenantId, userId],
  );
  return roleRows.length > 0;
}
