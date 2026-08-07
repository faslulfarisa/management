import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { APPROVAL_WORKFLOWS, getApprovalWorkflow, isImplementedApprovalWorkflow } from '../../approvals/approval-workflows';

@Injectable()
export class BranchApprovalChainService {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string, branchId?: string) {
    let query = `
      SELECT bac.*,
        b.name AS branch_name, b.code AS branch_code,
        u.email AS created_by_email
      FROM branch_approval_chains bac
      JOIN branches b ON b.id = bac.branch_id
      LEFT JOIN users u ON u.id = bac.created_by
      WHERE bac.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (branchId) { query += ` AND bac.branch_id = $${idx++}`; params.push(branchId); }
    query += ' ORDER BY b.name, bac.workflow_type';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  getWorkflowDefinitions() {
    return APPROVAL_WORKFLOWS;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT bac.*, b.name AS branch_name
       FROM branch_approval_chains bac
       JOIN branches b ON b.id = bac.branch_id
       WHERE bac.id = $1 AND bac.tenant_id = $2`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Approval chain not found');
    return rows[0];
  }

  async upsert(tenantId: string, createdBy: string, data: any) {
    await this.validateChain(tenantId, data);

    const { rows } = await this.db.query(
      `INSERT INTO branch_approval_chains
         (tenant_id, branch_id, workflow_type, steps, is_active, auto_approve_hours, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       ON CONFLICT (tenant_id, branch_id, workflow_type) DO UPDATE
         SET steps             = EXCLUDED.steps,
             is_active         = EXCLUDED.is_active,
             auto_approve_hours = EXCLUDED.auto_approve_hours,
             updated_at        = now()
       RETURNING *`,
      [
        tenantId,
        data.branch_id,
        data.workflow_type,
        JSON.stringify(data.steps || []),
        data.is_active !== false,
        data.auto_approve_hours || null,
        createdBy,
      ],
    );
    return rows[0];
  }

  private async validateChain(tenantId: string, data: any) {
    if (!data?.branch_id) {
      throw new BadRequestException('Branch is required for an approval chain');
    }

    const workflow = getApprovalWorkflow(data.workflow_type);
    if (!workflow) {
      throw new BadRequestException(`Workflow '${data.workflow_type}' is not supported by the Approval Engine`);
    }
    if (!isImplementedApprovalWorkflow(data.workflow_type)) {
      throw new BadRequestException(`Workflow '${workflow.label}' is not available for approval-chain configuration yet`);
    }

    const { rows: branches } = await this.db.query(
      'SELECT 1 FROM branches WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [data.branch_id, tenantId],
    );
    if (!branches.length) {
      throw new BadRequestException('Branch does not exist for this organization');
    }

    const steps = Array.isArray(data.steps) ? data.steps : [];
    const seenSteps = new Set<number>();
    const seenApprovers = new Set<string>();
    for (const step of steps) {
      const stepNumber = Number(step?.step);
      if (!Number.isInteger(stepNumber) || stepNumber < 1) {
        throw new BadRequestException('Approval steps must use positive step numbers');
      }
      if (seenSteps.has(stepNumber)) {
        throw new BadRequestException(`Duplicate approval step ${stepNumber}`);
      }
      seenSteps.add(stepNumber);

      if (!step?.approver_id && !step?.role) {
        throw new BadRequestException(`Step ${stepNumber} must define an approver`);
      }
      if (step?.approver_id) {
        if (seenApprovers.has(step.approver_id)) {
          throw new BadRequestException('The same approver cannot be assigned to multiple steps in one chain');
        }
        seenApprovers.add(step.approver_id);

        const { rows: approvers } = await this.db.query(
          `SELECT 1
           FROM users u
           LEFT JOIN user_tenants ut
             ON ut.user_id = u.id
            AND ut.tenant_id = $2
           LEFT JOIN branch_user_access bua
             ON bua.user_id = u.id
            AND bua.tenant_id = $2
            AND bua.branch_id = $3
            AND bua.is_active = true
           WHERE u.id = $1
             AND u.tenant_id = $2
             AND u.is_active = true
             AND u.deleted_at IS NULL
             AND (
               u.is_super_admin = true
               OR ut.is_org_admin = true
               OR ut.user_type = 'org_admin'
               OR bua.id IS NOT NULL
             )
           LIMIT 1`,
          [step.approver_id, tenantId, data.branch_id],
        );
        if (!approvers.length) {
          throw new BadRequestException(`Approver for step ${stepNumber} is inactive or has no access to this branch`);
        }
      } else if (step?.role) {
        const { rows: roleApprovers } = await this.db.query(
          `SELECT 1
           FROM branch_user_access bua
           JOIN users u ON u.id = bua.user_id
           WHERE bua.tenant_id = $1
             AND bua.branch_id = $2
             AND bua.role = $3
             AND bua.is_active = true
             AND u.is_active = true
             AND u.deleted_at IS NULL
           LIMIT 1`,
          [tenantId, data.branch_id, step.role],
        );
        if (!roleApprovers.length) {
          throw new BadRequestException(`No active approvers are available for role '${step.role}' on step ${stepNumber}`);
        }
      }
    }
  }

  async deactivate(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `UPDATE branch_approval_chains SET is_active = false, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Approval chain not found');
    return rows[0];
  }

  async activate(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `UPDATE branch_approval_chains SET is_active = true, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Approval chain not found');
    return rows[0];
  }

  /** Returns the active chain for a branch + workflow, or null if none configured. */
  async resolveChain(tenantId: string, branchId: string | null, workflowType: string) {
    if (!branchId) return null;
    const { rows } = await this.db.query(
      `SELECT * FROM branch_approval_chains
       WHERE branch_id = $1 AND tenant_id = $2 AND workflow_type = $3 AND is_active = true`,
      [branchId, tenantId, workflowType],
    );
    return rows[0] ?? null;
  }

  /**
   * Given the current approval step and the chain steps array, determines whether
   * the workflow is fully approved after this action, or needs to advance.
   * Returns: { fullyApproved, nextStep, newLog }
   */
  computeAdvance(
    currentStep: number,
    approvedBy: string,
    chain: any | null,
    existingLog: any[],
  ): { fullyApproved: boolean; nextStep: number; newLog: any[] } {
    const newEntry = { step: currentStep, approved_by: approvedBy, approved_at: new Date().toISOString() };
    const newLog = [...(existingLog || []), newEntry];

    if (!chain || !Array.isArray(chain.steps) || chain.steps.length === 0) {
      return { fullyApproved: true, nextStep: currentStep, newLog };
    }

    const sorted = [...chain.steps].sort((a: any, b: any) => a.step - b.step);
    const idx = sorted.findIndex((s: any) => s.step === currentStep);
    const nextStepEntry = sorted[idx + 1];

    if (!nextStepEntry) {
      return { fullyApproved: true, nextStep: currentStep, newLog };
    }
    return { fullyApproved: false, nextStep: nextStepEntry.step, newLog };
  }
}
