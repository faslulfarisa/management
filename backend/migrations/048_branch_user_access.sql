CREATE TABLE IF NOT EXISTS branch_user_access (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  branch_id   UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role        VARCHAR(50) NOT NULL DEFAULT 'viewer',
  granted_by  UUID        REFERENCES users(id),
  revoked_by  UUID        REFERENCES users(id),
  revoked_at  TIMESTAMPTZ,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bua_branch  ON branch_user_access(branch_id)  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_bua_user    ON branch_user_access(user_id)    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_bua_tenant  ON branch_user_access(tenant_id)  WHERE is_active = TRUE;
