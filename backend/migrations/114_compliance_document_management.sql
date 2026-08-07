-- 114_compliance_document_management.sql
-- Compliance & Document Management System: promotes the Compliance module
-- from a flat statutory-filing/notes tracker into the org-wide repository for
-- company AND employee documents — categories, versioning, approvals (via the
-- existing ApprovalEngineService), policy acknowledgement, document requests,
-- and a generic compliance tracker. Extends compliance_documents in place
-- (additive, backward-compatible) instead of replacing it; compliance_filings
-- (monthly statutory filings) is untouched and keeps working as-is.

-- 1. Categories ---------------------------------------------------------------
-- tenant_id NULL = system default category visible to every tenant; tenant_id
-- set = org-specific custom category created by an admin.
CREATE TABLE IF NOT EXISTS compliance_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),
  scope TEXT NOT NULL CHECK (scope IN ('company', 'employee')),
  group_label TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  extra_field_schema JSONB NOT NULL DEFAULT '[]',
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_categories_system_code
  ON compliance_categories(scope, code) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_categories_tenant_code
  ON compliance_categories(tenant_id, scope, code) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_categories_tenant ON compliance_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_categories_scope ON compliance_categories(scope, is_active);

-- System default company-document categories
INSERT INTO compliance_categories (scope, group_label, name, code, is_system, sort_order) VALUES
  ('company','Statutory Registration','Company Registration','company_registration',true,10),
  ('company','Statutory Registration','GST','gst',true,20),
  ('company','Statutory Registration','PAN','pan',true,30),
  ('company','Statutory Registration','CIN','cin',true,40),
  ('company','Statutory Registration','Professional Tax','professional_tax',true,50),
  ('company','Statutory Registration','ESI Registration','esi_registration',true,60),
  ('company','Statutory Registration','PF Registration','pf_registration',true,70),
  ('company','Statutory Registration','MSME','msme',true,80),
  ('company','Statutory Registration','Import Export Code','iec',true,90),
  ('company','Statutory Registration','Shop & Establishment','shop_establishment',true,100),
  ('company','License','Trade License','trade_license',true,110),
  ('company','License','Factory License','factory_license',true,120),
  ('company','License','Business License','business_license',true,130),
  ('company','Certification','ISO Certificates','iso_certificate',true,140),
  ('company','Government Registration','Fire Safety Certificate','fire_safety_certificate',true,150),
  ('company','Government Registration','Pollution Certificate','pollution_certificate',true,160),
  ('company','Insurance','Insurance Policies','insurance_policy',true,170),
  ('company','Legal','Legal Agreements','legal_agreement',true,180),
  ('company','Legal','Lease Agreements','lease_agreement',true,190),
  ('company','Legal','Vendor Agreements','vendor_agreement',true,200),
  ('company','Legal','Client Agreements','client_agreement',true,210),
  ('company','Legal','Board Resolutions','board_resolution',true,220),
  ('company','Financial','Financial Statements','financial_statement',true,230),
  ('company','Financial','Tax Returns','tax_return',true,240),
  ('company','Financial','Audit Reports','audit_report',true,250),
  ('company','Financial','Bank Documents','bank_document',true,260),
  ('company','Policy','Policy Document','policy_document',true,270),
  ('company','Template','Document Template','document_template',true,280),
  ('company','Custom','Custom Documents','custom',true,999)
ON CONFLICT DO NOTHING;

-- System default employee-document categories
INSERT INTO compliance_categories (scope, group_label, name, code, is_system, sort_order) VALUES
  ('employee','Recruitment','Resume','resume',true,10),
  ('employee','Recruitment','Offer Letter','offer_letter',true,20),
  ('employee','Recruitment','Appointment Letter','appointment_letter',true,30),
  ('employee','Recruitment','Employment Contract','employment_contract',true,40),
  ('employee','Recruitment','NDA','nda',true,50),
  ('employee','Recruitment','Joining Documents','joining_documents',true,60),
  ('employee','Education & Experience','Educational Certificates','educational_certificate',true,70),
  ('employee','Education & Experience','Experience Certificates','experience_certificate',true,80),
  ('employee','Identity Proof','Identity Proof','identity_proof',true,90),
  ('employee','Identity Proof','Passport','passport',true,100),
  ('employee','Identity Proof','Driving License','driving_license',true,110),
  ('employee','Identity Proof','PAN Card','pan_card',true,120),
  ('employee','Identity Proof','Aadhaar','aadhaar',true,130),
  ('employee','Identity Proof','Voter ID','voter_id',true,140),
  ('employee','Identity Proof','Visa','visa',true,150),
  ('employee','Identity Proof','Work Permit','work_permit',true,160),
  ('employee','Health & Verification','Medical Reports','medical_report',true,170),
  ('employee','Health & Verification','Police Verification','police_verification',true,180),
  ('employee','Health & Verification','Background Verification','background_verification',true,190),
  ('employee','Employment Lifecycle','Salary Revision Letters','salary_revision_letter',true,200),
  ('employee','Employment Lifecycle','Promotion Letters','promotion_letter',true,210),
  ('employee','Employment Lifecycle','Warning Letters','warning_letter',true,220),
  ('employee','Training & Skills','Training Certificates','training_certificate',true,230),
  ('employee','Training & Skills','Skill Certifications','skill_certification',true,240),
  ('employee','Exit','Exit Documents','exit_documents',true,250),
  ('employee','Exit','Relieving Letter','relieving_letter',true,260),
  ('employee','Exit','Experience Letter','experience_letter',true,270),
  ('employee','Exit','FnF Documents','fnf_documents',true,280),
  ('employee','Custom','Custom Documents','custom',true,999)
ON CONFLICT DO NOTHING;

-- 2. compliance_documents — extend in place ----------------------------------
ALTER TABLE compliance_documents
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'company' CHECK (scope IN ('company','employee')),
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES compliance_categories(id),
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS renewal_date DATE,
  ADD COLUMN IF NOT EXISTS grace_period_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','rejected','expired','renewal_pending','archived','deleted')),
  ADD COLUMN IF NOT EXISTS confidentiality_level TEXT NOT NULL DEFAULT 'internal'
    CHECK (confidentiality_level IN ('public','internal','confidential','restricted')),
  ADD COLUMN IF NOT EXISTS current_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS issuing_authority TEXT,
  ADD COLUMN IF NOT EXISTS extra_fields JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes INT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','under_review','escalated','approved','rejected','cancelled','expired')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS approval_step INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_updated_by UUID REFERENCES users(id);

-- Backfill: legacy rows (created before this migration) are company-level,
-- already-final documents with no version history of their own.
UPDATE compliance_documents
SET title = COALESCE(title, name),
    status = CASE WHEN deleted_at IS NOT NULL THEN 'deleted' ELSE 'approved' END,
    approval_status = 'not_required',
    category_id = COALESCE(category_id, (
      SELECT id FROM compliance_categories WHERE tenant_id IS NULL AND scope = 'company' AND code = 'custom' LIMIT 1
    ))
WHERE title IS NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_documents_employee ON compliance_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_branch ON compliance_documents(branch_id);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_category ON compliance_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_status ON compliance_documents(status);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_scope ON compliance_documents(scope);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_tags ON compliance_documents USING GIN(tags);

-- 3. Version history — append-only, never overwritten ------------------------
CREATE TABLE IF NOT EXISTS compliance_document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  version_number INT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size_bytes INT,
  mime_type TEXT,
  change_note TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_versions_document ON compliance_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_versions_tenant ON compliance_document_versions(tenant_id);

-- 4. Policy acknowledgements ---------------------------------------------------
CREATE TABLE IF NOT EXISTS compliance_policy_acknowledgements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  version_acknowledged INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged')),
  acknowledged_at TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, employee_id, version_acknowledged)
);
CREATE INDEX IF NOT EXISTS idx_compliance_policy_ack_employee ON compliance_policy_acknowledgements(employee_id);
CREATE INDEX IF NOT EXISTS idx_compliance_policy_ack_document ON compliance_policy_acknowledgements(document_id);
CREATE INDEX IF NOT EXISTS idx_compliance_policy_ack_tenant ON compliance_policy_acknowledgements(tenant_id, status);

-- 5. HR/Admin -> employee document requests -----------------------------------
CREATE TABLE IF NOT EXISTS compliance_document_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  category_id UUID REFERENCES compliance_categories(id),
  title TEXT NOT NULL,
  instructions TEXT,
  requested_by UUID REFERENCES users(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploaded','approved','rejected','expired')),
  resulting_document_id UUID REFERENCES compliance_documents(id),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_requests_employee ON compliance_document_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_requests_tenant ON compliance_document_requests(tenant_id, status);

-- 6. Generic compliance tracker (Labour Law/PF/ESI/GST/Audits/Legal/Custom) ----
CREATE TABLE IF NOT EXISTS compliance_tracker_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  branch_id UUID REFERENCES branches(id),
  compliance_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track','due','overdue','completed')),
  due_date DATE,
  responsible_user_id UUID REFERENCES users(id),
  completion_percent INT NOT NULL DEFAULT 0 CHECK (completion_percent BETWEEN 0 AND 100),
  remarks TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_tracker_tenant ON compliance_tracker_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_tracker_branch ON compliance_tracker_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_compliance_tracker_due ON compliance_tracker_items(due_date);

CREATE TABLE IF NOT EXISTS compliance_tracker_documents (
  tracker_item_id UUID NOT NULL REFERENCES compliance_tracker_items(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,
  PRIMARY KEY (tracker_item_id, document_id)
);

-- 7. Permission catalog rows (global, no tenant scoping — see `permissions` table) --
INSERT INTO permissions (module, action) VALUES
  ('compliance.company_docs', 'manage'),
  ('compliance.employee_docs', 'manage'),
  ('compliance.employee_docs', 'view_own'),
  ('compliance.documents', 'approve'),
  ('compliance', 'admin'),
  ('compliance.tracker', 'manage'),
  ('compliance.policies', 'manage'),
  ('compliance.policies', 'acknowledge')
ON CONFLICT (module, action) DO NOTHING;
