-- 115_platform_super_admin_and_extended_internal_roles.sql
-- Phase 2 of the Platform/Customer separation (see project memory
-- project_platform_customer_separation.md). Expands users.internal_role to
-- cover Finance/Customer Success/Customer Support teams, and adds a
-- dedicated `platform_super_admin` role — the identity that replaces the old
-- `is_super_admin` bypass inside InternalStaffGuard/OpsPermissionGuard.
-- `users.is_super_admin` itself is untouched by this migration: it remains
-- exactly what it was, the top of the *customer* user_type hierarchy. The
-- two identities no longer overlap after this change.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_internal_role_check;
ALTER TABLE users ADD CONSTRAINT users_internal_role_check CHECK (internal_role IN (
  'marketing_executive', 'marketing_manager',
  'sales_executive', 'sales_manager',
  'technical_executive', 'technical_manager',
  'finance_executive', 'finance_manager',
  'customer_success_executive', 'customer_success_manager',
  'customer_support_executive', 'customer_support_manager',
  'platform_super_admin'
));
