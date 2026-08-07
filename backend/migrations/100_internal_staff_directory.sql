-- 100_internal_staff_directory.sql
-- Internal staff (Marketing/Sales/Technical) have no employee_id (they're not
-- part of any organization's workforce), so the usual name source — a joined
-- employees row — doesn't apply to them. A plain column is simplest.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
