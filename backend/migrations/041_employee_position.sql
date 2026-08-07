-- Add position_id to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES positions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_position ON employees(position_id) WHERE position_id IS NOT NULL;
