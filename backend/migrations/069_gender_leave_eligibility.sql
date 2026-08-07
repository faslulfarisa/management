-- 069_gender_leave_eligibility.sql
-- Adds gender_eligibility to leave_types so Maternity / Paternity
-- leave can be automatically filtered by employee gender.
-- Values: 'all' (default, shown to everyone)
--         'female' (Maternity Leave — female employees only)
--         'male'   (Paternity Leave — male employees only)

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS gender_eligibility TEXT NOT NULL DEFAULT 'all'
    CHECK (gender_eligibility IN ('all', 'male', 'female'));

CREATE INDEX IF NOT EXISTS idx_lt_gender ON leave_types(gender_eligibility);
