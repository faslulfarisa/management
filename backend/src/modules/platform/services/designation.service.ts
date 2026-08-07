import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class DesignationService {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM designations WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY level ASC',
      [tenantId],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM designations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Designation not found');
    return rows[0];
  }

  async create(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'INSERT INTO designations (tenant_id, department_id, name, level) VALUES ($1, $2, $3, $4) RETURNING *',
      [tenantId, data.department_id, data.name, data.level],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE designations SET name = COALESCE($3, name), level = COALESCE($4, level), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.name, data.level],
    );
    return rows[0];
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE designations SET deleted_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId],
    );
    return rows[0];
  }
}

@Injectable()
export class CostCenterService {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM cost_centers WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC',
      [tenantId],
    );
    return rows;
  }

  async create(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'INSERT INTO cost_centers (tenant_id, name, code, property_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [tenantId, data.name, data.code, data.property_id],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'UPDATE cost_centers SET name = COALESCE($3, name), code = COALESCE($4, code), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.name, data.code],
    );
    if (!rows.length) throw new NotFoundException('Cost center not found');
    return rows[0];
  }
}

@Injectable()
export class EmploymentTypeService {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM employment_types WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC',
      [tenantId],
    );
    return rows;
  }

  async create(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'INSERT INTO employment_types (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [tenantId, data.name, data.description],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'UPDATE employment_types SET name = COALESCE($3, name), description = COALESCE($4, description), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.name, data.description],
    );
    if (!rows.length) throw new NotFoundException('Employment type not found');
    return rows[0];
  }
}

@Injectable()
export class EmployeeGroupService {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM employee_groups WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC',
      [tenantId],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM employee_groups WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Employee group not found');
    return rows[0];
  }

  async create(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'INSERT INTO employee_groups (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [tenantId, data.name, data.description],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE employee_groups SET name = COALESCE($3, name), description = COALESCE($4, description), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.name, data.description],
    );
    return rows[0];
  }

  async addMembers(tenantId: string, groupId: string, employeeIds: string[]) {
    const inserts = employeeIds.map((eid, i) =>
      this.db.query(
        'INSERT INTO employee_group_members (tenant_id, group_id, employee_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [tenantId, groupId, eid],
      ),
    );
    await Promise.all(inserts);
    return { count: employeeIds.length };
  }

  async removeMember(tenantId: string, groupId: string, employeeId: string) {
    await this.db.query(
      'DELETE FROM employee_group_members WHERE group_id = $1 AND employee_id = $2 AND tenant_id = $3',
      [groupId, employeeId, tenantId],
    );
    return { success: true };
  }
}
