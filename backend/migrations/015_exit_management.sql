-- Exit Management Module
-- Tables: exit_requests, exit_checklist, exit_clearances, final_settlements

CREATE TABLE IF NOT EXISTS exit_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    request_type VARCHAR(50) NOT NULL DEFAULT 'resignation',
    reason TEXT NOT NULL,
    notice_period_days INTEGER NOT NULL DEFAULT 30,
    requested_date DATE NOT NULL,
    last_working_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(id),
    approval_date TIMESTAMP,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exit_checklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    exit_request_id UUID NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
    item VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    assigned_to UUID REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    remarks TEXT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exit_clearances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    exit_request_id UUID NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
    department VARCHAR(100) NOT NULL,
    cleared_by UUID REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    remarks TEXT,
    cleared_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS final_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    exit_request_id UUID NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    basic_salary DECIMAL(12, 2) NOT NULL DEFAULT 0,
    allowances DECIMAL(12, 2) NOT NULL DEFAULT 0,
    gratuity DECIMAL(12, 2) NOT NULL DEFAULT 0,
    leave_encashment DECIMAL(12, 2) NOT NULL DEFAULT 0,
    bonus DECIMAL(12, 2) NOT NULL DEFAULT 0,
    deductions DECIMAL(12, 2) NOT NULL DEFAULT 0,
    notice_pay_recovery DECIMAL(12, 2) NOT NULL DEFAULT 0,
    asset_recovery DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_payable DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(12, 2) NOT NULL DEFAULT 0,
    net_payable DECIMAL(12, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_date DATE,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exit_requests_tenant ON exit_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exit_requests_employee ON exit_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_exit_requests_status ON exit_requests(status);
CREATE INDEX IF NOT EXISTS idx_exit_checklist_request ON exit_checklist(exit_request_id);
CREATE INDEX IF NOT EXISTS idx_exit_clearances_request ON exit_clearances(exit_request_id);
CREATE INDEX IF NOT EXISTS idx_final_settlements_request ON final_settlements(exit_request_id);
