-- 141_holiday_policy_templates.sql
-- Promote holidays into the existing template policy architecture.

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_until DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'templates_status_check'
  ) THEN
    ALTER TABLE templates
      ADD CONSTRAINT templates_status_check
      CHECK (status IN ('draft', 'active', 'inactive', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_templates_type_status_effective
  ON templates(tenant_id, template_type, status, effective_from, effective_until)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_template_assignments_branch_lookup
  ON template_assignments(tenant_id, template_type, scope_type, scope_id)
  WHERE deleted_at IS NULL;

WITH normalized_holidays AS (
  SELECT
    h.tenant_id,
    COALESCE(h.branch_id, b.id) AS branch_id,
    EXTRACT(YEAR FROM h.holiday_date)::int AS holiday_year,
    h.name,
    h.holiday_date,
    h.holiday_type,
    h.property_id
  FROM holidays h
  LEFT JOIN branches b ON b.property_id = h.property_id AND b.tenant_id = h.tenant_id
  WHERE h.deleted_at IS NULL
),
grouped AS (
  SELECT
    tenant_id,
    branch_id,
    holiday_year,
    jsonb_agg(
      jsonb_build_object(
        'name', name,
        'date', holiday_date,
        'type', CASE
          WHEN lower(COALESCE(holiday_type, '')) = 'national' THEN 'National Holiday'
          WHEN lower(COALESCE(holiday_type, '')) = 'state' THEN 'State Holiday'
          WHEN lower(COALESCE(holiday_type, '')) = 'festival' THEN 'Festival'
          WHEN lower(COALESCE(holiday_type, '')) IN ('organization', 'company') THEN 'Company Holiday'
          ELSE COALESCE(NULLIF(holiday_type, ''), 'Custom')
        END,
        'description', '',
        'recurring_yearly', false,
        'half_day', false,
        'optional_holiday', false,
        'restricted_holiday', false,
        'paid_holiday', true,
        'applicable_branch_ids', CASE
          WHEN branch_id IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(branch_id)
        END,
        'applicable_department_ids', '[]'::jsonb,
        'color_label', '#64748b'
      )
      ORDER BY holiday_date
    ) AS holidays
  FROM normalized_holidays
  GROUP BY tenant_id, branch_id, holiday_year
),
inserted_templates AS (
  INSERT INTO templates (
    tenant_id, template_type, name, description, config, is_default,
    status, effective_from, effective_until, notes
  )
  SELECT
    g.tenant_id,
    'holiday_policy',
    CASE
      WHEN g.branch_id IS NULL THEN 'Holiday Calendar ' || g.holiday_year
      ELSE COALESCE(b.name, 'Branch') || ' Holiday Calendar ' || g.holiday_year
    END,
    CASE
      WHEN g.branch_id IS NULL THEN 'Migrated organization holiday calendar'
      ELSE 'Migrated branch holiday calendar'
    END,
    jsonb_build_object(
      'year', g.holiday_year,
      'allowed_holiday_types', jsonb_build_array(
        'National Holiday',
        'State Holiday',
        'Festival',
        'Company Holiday',
        'Optional Holiday',
        'Restricted Holiday',
        'Special Holiday',
        'Emergency Closure',
        'Custom'
      ),
      'holidays', g.holidays,
      'migrated_branch_id', g.branch_id,
      'import_metadata', jsonb_build_object(
        'source', 'legacy_holidays',
        'migrated_at', now()
      )
    ),
    g.branch_id IS NULL,
    'active',
    make_date(g.holiday_year, 1, 1),
    make_date(g.holiday_year, 12, 31),
    'Created from legacy holidays table'
  FROM grouped g
  LEFT JOIN branches b ON b.id = g.branch_id
  WHERE NOT EXISTS (
    SELECT 1 FROM templates t
    WHERE t.tenant_id = g.tenant_id
      AND t.template_type = 'holiday_policy'
      AND t.deleted_at IS NULL
      AND t.effective_from = make_date(g.holiday_year, 1, 1)
      AND COALESCE((t.config->>'migrated_branch_id')::text, '') = COALESCE(g.branch_id::text, '')
  )
  RETURNING id, tenant_id, config, is_default
)
INSERT INTO template_assignments (
  tenant_id, template_id, template_type, scope_type, scope_id,
  priority, effective_from, effective_to
)
SELECT
  t.tenant_id,
  t.id,
  'holiday_policy',
  CASE
    WHEN NULLIF(t.config->>'migrated_branch_id', '') IS NULL THEN 'organization'
    ELSE 'branch'
  END,
  COALESCE(NULLIF(t.config->>'migrated_branch_id', '')::uuid, t.tenant_id),
  CASE
    WHEN NULLIF(t.config->>'migrated_branch_id', '') IS NULL THEN 0
    ELSE 10
  END,
  make_date((t.config->>'year')::int, 1, 1),
  make_date((t.config->>'year')::int, 12, 31)
FROM inserted_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM template_assignments ta
  WHERE ta.tenant_id = t.tenant_id
    AND ta.template_id = t.id
    AND ta.template_type = 'holiday_policy'
    AND ta.deleted_at IS NULL
);
