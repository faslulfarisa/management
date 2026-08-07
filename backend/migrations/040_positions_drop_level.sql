-- Remove level column from positions (no longer used)
ALTER TABLE positions DROP COLUMN IF EXISTS level;
