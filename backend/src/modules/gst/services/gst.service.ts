import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class GstService {
  constructor(private db: DatabaseService) {}

  async getSettings(tenantId: string) {
    const { rows } = await this.db.query('SELECT * FROM gst_settings WHERE tenant_id = $1', [tenantId]);
    return rows[0] || null;
  }

  async saveSettings(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO gst_settings (tenant_id, gstin, legal_name, trade_name, registration_date, state_code, is_composition)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, gstin) DO UPDATE SET legal_name=$3, trade_name=$4, registration_date=$5, state_code=$6, is_composition=$7, updated_at=now()
        RETURNING *`,
      [tenantId, data.gstin, data.legal_name, data.trade_name, data.registration_date, data.state_code, data.is_composition || false],
    );
    return rows[0];
  }

  async getInvoices(tenantId: string, filters: any) {
    const { page = 1, limit = 20, date_from, date_to, status } = filters;
    let query = 'SELECT * FROM gst_invoices WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (date_from) { query += ` AND invoice_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND invoice_date <= $${idx++}`; params.push(date_to); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY invoice_date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createInvoice(tenantId: string, data: any) {
    const taxable = parseFloat(data.taxable_value);
    const rate = parseFloat(data.gst_rate || 18);
    const isInterstate = data.place_of_supply !== data.state_code;

    let cgst = 0, sgst = 0, igst = 0;
    if (isInterstate) {
      igst = taxable * (rate / 100);
    } else {
      cgst = taxable * (rate / 200);
      sgst = taxable * (rate / 200);
    }
    const total = taxable + cgst + sgst + igst;

    const { rows } = await this.db.query(
      `INSERT INTO gst_invoices (tenant_id, invoice_number, invoice_date, customer_gstin, customer_name, place_of_supply,
        taxable_value, cgst, sgst, igst, total_amount, gst_rate, is_reverse_charge)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [tenantId, data.invoice_number, data.invoice_date, data.customer_gstin, data.customer_name, data.place_of_supply,
        taxable, cgst, sgst, igst, total, rate, data.is_reverse_charge || false],
    );
    return rows[0];
  }

  async getReturns(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM gst_returns WHERE tenant_id = $1 ORDER BY period_year DESC, period_month DESC',
      [tenantId],
    );
    return rows;
  }

  async generateReturn(tenantId: string, returnType: string, month: number, year: number) {
    const invoices = await this.db.query(
      `SELECT * FROM gst_invoices WHERE tenant_id = $1 AND EXTRACT(MONTH FROM invoice_date) = $2 AND EXTRACT(YEAR FROM invoice_date) = $3`,
      [tenantId, month, year],
    );

    const totalOutward = invoices.rows.reduce((sum, i) => sum + parseFloat(i.taxable_value), 0);
    const totalIgst = invoices.rows.reduce((sum, i) => sum + parseFloat(i.igst), 0);
    const totalCgst = invoices.rows.reduce((sum, i) => sum + parseFloat(i.cgst), 0);
    const totalSgst = invoices.rows.reduce((sum, i) => sum + parseFloat(i.sgst), 0);
    const totalTax = totalIgst + totalCgst + totalSgst;

    const { rows } = await this.db.query(
      `INSERT INTO gst_returns (tenant_id, return_type, period_month, period_year, total_outward, total_igst, total_cgst, total_sgst, total_tax)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (tenant_id, return_type, period_month, period_year) DO UPDATE SET
          total_outward=$5, total_igst=$6, total_cgst=$7, total_sgst=$8, total_tax=$9, updated_at=now()
        RETURNING *`,
      [tenantId, returnType, month, year, totalOutward, totalIgst, totalCgst, totalSgst, totalTax],
    );
    return rows[0];
  }

  async getSummary(tenantId: string) {
    const totalOutward = await this.db.query(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM gst_invoices WHERE tenant_id = $1',
      [tenantId],
    );
    const totalTax = await this.db.query(
      'SELECT COALESCE(SUM(cgst + sgst + igst), 0) as total FROM gst_invoices WHERE tenant_id = $1',
      [tenantId],
    );
    return { total_outward: totalOutward.rows[0].total, total_tax: totalTax.rows[0].total };
  }
}
