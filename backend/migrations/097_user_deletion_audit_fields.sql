-- 097_user_deletion_audit_fields.sql
-- Soft-delete audit fields for users, supporting the deactivate-before-delete
-- workflow: who deleted the account and why (captured from the deactivation
-- context, since deletion is only ever allowed on already-deactivated users).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
