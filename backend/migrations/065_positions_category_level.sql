-- Add category and level fields to positions for preset-based permission recommendations
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS level    VARCHAR(50);
