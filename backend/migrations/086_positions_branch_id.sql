-- Add branch_id column to positions table
ALTER TABLE positions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_positions_branch ON positions(branch_id) WHERE branch_id IS NOT NULL AND deleted_at IS NULL;
