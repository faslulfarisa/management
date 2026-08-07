-- 154_interview_notes.sql
-- Add notes field to interviews table

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS notes TEXT;
