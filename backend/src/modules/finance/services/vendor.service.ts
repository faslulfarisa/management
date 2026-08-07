import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class VendorService {
  constructor(private db: DatabaseService) {}

  async getVendors(tenantId: string, filters: any) {
    const { status, search, category } = filters;
    let query = 'SELECT * FROM vendors WHERE tenant_id = $1 AND deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (category) { query += ` AND category = $${idx++}`; params.push(category); }
    if (search) {
      query += ` AND (name ILIKE $${idx} OR email ILIKE $${idx} OR gstin ILIKE $${idx} OR phone ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    query += ' ORDER BY name ASC';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async getVendor(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Vendor not found');
    return rows[0];
  }

  async getVendorStatement(id: string, tenantId: string) {
    const vendor = await this.getVendor(id, tenantId);

    const { rows: bills } = await this.db.query(
      `SELECT id, bill_number, bill_date, due_date, total_amount, amount_paid, status
         FROM vendor_bills
        WHERE tenant_id = $1 AND vendor_name = $2 AND deleted_at IS NULL
        ORDER BY bill_date DESC`,
      [tenantId, vendor.name],
    );

    const totalBilled = bills.reduce((s: number, b: any) => s + parseFloat(b.total_amount || 0), 0);
    const totalPaid   = bills.reduce((s: number, b: any) => s + parseFloat(b.amount_paid  || 0), 0);

    return { vendor, bills, summary: { total_billed: totalBilled, total_paid: totalPaid, outstanding: totalBilled - totalPaid } };
  }

  async createVendor(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO vendors
         (tenant_id, name, email, phone, gstin, pan, address, city, state, pincode,
          bank_name, bank_account, bank_ifsc, payment_terms, category, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        tenantId, data.name, data.email || null, data.phone || null,
        data.gstin ? data.gstin.toUpperCase() : null, data.pan ? data.pan.toUpperCase() : null,
        data.address || null, data.city || null, data.state || null, data.pincode || null,
        data.bank_name || null, data.bank_account || null, data.bank_ifsc ? data.bank_ifsc.toUpperCase() : null,
        data.payment_terms || 30, data.category || null, data.notes || null, data.status || 'active',
      ],
    );
    return rows[0];
  }

  async updateVendor(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE vendors SET
         name          = COALESCE($3, name),
         email         = COALESCE($4, email),
         phone         = COALESCE($5, phone),
         gstin         = COALESCE($6, gstin),
         pan           = COALESCE($7, pan),
         address       = COALESCE($8, address),
         city          = COALESCE($9, city),
         state         = COALESCE($10, state),
         pincode       = COALESCE($11, pincode),
         bank_name     = COALESCE($12, bank_name),
         bank_account  = COALESCE($13, bank_account),
         bank_ifsc     = COALESCE($14, bank_ifsc),
         payment_terms = COALESCE($15, payment_terms),
         category      = COALESCE($16, category),
         notes         = COALESCE($17, notes),
         status        = COALESCE($18, status),
         updated_at    = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [
        id, tenantId,
        data.name || null, data.email || null, data.phone || null,
        data.gstin ? data.gstin.toUpperCase() : null, data.pan ? data.pan.toUpperCase() : null,
        data.address || null, data.city || null, data.state || null, data.pincode || null,
        data.bank_name || null, data.bank_account || null, data.bank_ifsc ? data.bank_ifsc.toUpperCase() : null,
        data.payment_terms || null, data.category || null, data.notes || null, data.status || null,
      ],
    );
    if (!rows.length) throw new NotFoundException('Vendor not found');
    return rows[0];
  }

  async deleteVendor(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `UPDATE vendors SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING id`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Vendor not found');
  }
}
