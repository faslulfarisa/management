-- Migration 098: Composite indexes for hot permission/role lookup paths.
--
-- RoleService.getUserPermissions / PositionService.getUserPermissions run on
-- every permission check (AuthorizationService.hasPermission), which fires on
-- most authenticated requests. The existing single-column indexes on
-- user_roles(user_id), role_permissions(role_id), position_permissions(position_id)
-- and user_positions(user_id / position_id) leave Postgres to filter the
-- second predicate (tenant_id, or the permission_id join column) without an
-- index. CONCURRENTLY avoids locking these tables on a live database.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_tenant_user
  ON user_roles(tenant_id, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_permissions_role_permission
  ON role_permissions(role_id, permission_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_position_permissions_position_permission
  ON position_permissions(position_id, permission_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_positions_tenant_user
  ON user_positions(tenant_id, user_id);
