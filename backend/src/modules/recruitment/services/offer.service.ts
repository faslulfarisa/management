import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { EmailService } from '../../auth/email.service';
import { ApplicationService } from './application.service';
import { CurrencyService } from '../../../shared/currency.service';
import {
  AddNegotiationDto, CreateOfferDto, SendOfferDto, UpdateOfferDto, WithdrawOfferDto,
} from '../dto/offer.dto';

const EDITABLE_STATUSES = ['draft', 'rejected'];
const SNAPSHOT_FIELDS = [
  'designation', 'employment_type_id', 'joining_date', 'currency', 'currency_symbol',
  'exchange_rate', 'base_currency', 'exchange_rate_to_base', 'exchange_rate_source',
  'exchange_rate_as_of', 'currency_snapshot', 'ctc', 'salary_components', 'benefits',
  'offer_letter_content',
];

const SELECT_WITH_JOINS = `
  SELECT o.*, c.first_name, c.last_name, c.email AS candidate_email, c.id AS candidate_id,
    jp.title AS job_title, v.title AS vacancy_title, et.name AS employment_type_name,
    cb.email AS created_by_email
  FROM offers o
  JOIN applications a ON o.application_id = a.id
  JOIN candidates c ON a.candidate_id = c.id
  JOIN job_postings jp ON a.job_posting_id = jp.id
  LEFT JOIN vacancies v ON o.vacancy_id = v.id
  LEFT JOIN employment_types et ON o.employment_type_id = et.id
  LEFT JOIN users cb ON o.created_by = cb.id
`;

@Injectable()
export class OfferService {
  constructor(
    private db: DatabaseService,
    private notifications: NotificationEmitterService,
    private email: EmailService,
    private applications: ApplicationService,
    private currencyService: CurrencyService,
  ) {}

  private snapshotOf(row: any) {
    const snap: Record<string, any> = {};
    for (const f of SNAPSHOT_FIELDS) snap[f] = row[f];
    return snap;
  }

  private async writeVersion(tenantId: string, offerId: string, versionNumber: number, snapshot: any, createdBy?: string, changeNote?: string) {
    await this.db.query(
      `INSERT INTO offer_versions (tenant_id, offer_id, version_number, snapshot, change_note, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
      [tenantId, offerId, versionNumber, JSON.stringify(snapshot), changeNote ?? null, createdBy ?? null],
    );
  }

  async list(tenantId: string, filters: { q?: string; applicationId?: string; status?: string; page?: number; limit?: number }) {
    const { q, applicationId, status, page = 1, limit = 20 } = filters;
    let where = 'WHERE o.tenant_id = $1 AND o.deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;
    if (applicationId) { where += ` AND o.application_id = $${idx++}`; params.push(applicationId); }
    if (status) { where += ` AND o.status = $${idx++}`; params.push(status); }
    if (q) { where += ` AND (c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx} OR jp.title ILIKE $${idx})`; params.push(`%${q}%`); idx++; }

    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM offers o
       JOIN applications a ON o.application_id = a.id
       JOIN candidates c ON a.candidate_id = c.id
       JOIN job_postings jp ON a.job_posting_id = jp.id
       ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (Number(page) - 1) * Number(limit);
    const dataResult = await this.db.query(
      `${SELECT_WITH_JOINS} ${where} ORDER BY o.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, Number(limit), offset],
    );
    return { data: dataResult.rows, total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(`${SELECT_WITH_JOINS} WHERE o.id = $1 AND o.tenant_id = $2 AND o.deleted_at IS NULL`, [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Offer not found');
    return rows[0];
  }

  async getRaw(id: string, tenantId: string) {
    const { rows } = await this.db.query('SELECT * FROM offers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Offer not found');
    return rows[0];
  }

  async create(tenantId: string, createdById: string, dto: CreateOfferDto) {
    const { rows: appRows } = await this.db.query('SELECT vacancy_id FROM applications WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [dto.application_id, tenantId]);
    if (!appRows.length) throw new NotFoundException('Application not found');

    const currency = await this.currencyService.getTenantCurrencySnapshot(tenantId, dto.currency);
    const currencySnapshot = JSON.stringify(currency.snapshot);
    const { rows } = await this.db.query(
      `INSERT INTO offers (
        tenant_id, application_id, vacancy_id, designation, employment_type_id, joining_date,
        currency, currency_symbol, exchange_rate, base_currency, exchange_rate_to_base,
        exchange_rate_source, exchange_rate_as_of, currency_snapshot, ctc, salary_components,
        benefits, offer_letter_content, created_by, last_updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17::jsonb,$18,$19,$19) RETURNING *`,
      [
        tenantId, dto.application_id, appRows[0].vacancy_id, dto.designation ?? null, dto.employment_type_id ?? null,
        dto.joining_date ?? null, currency.currencyCode, currency.currencySymbol, currency.exchangeRate,
        currency.baseCurrency, currency.exchangeRateToBase, currency.exchangeRateSource,
        currency.exchangeRateAsOf, currencySnapshot, dto.ctc ?? null,
        JSON.stringify(dto.salary_components ?? []), JSON.stringify(dto.benefits ?? []),
        dto.offer_letter_content ?? null, createdById,
      ],
    );
    const offer = rows[0];
    await this.writeVersion(tenantId, offer.id, 1, this.snapshotOf(offer), createdById, 'Initial version');
    return this.findOne(offer.id, tenantId);
  }

  async update(id: string, tenantId: string, updatedById: string, dto: UpdateOfferDto) {
    const existing = await this.getRaw(id, tenantId);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`Cannot edit an offer with status '${existing.status}'`);
    }

    const currency = dto.currency !== undefined
      ? await this.currencyService.getTenantCurrencySnapshot(tenantId, dto.currency)
      : null;

    const { rows } = await this.db.query(
      `UPDATE offers SET
        designation = COALESCE($3, designation), employment_type_id = COALESCE($4, employment_type_id),
        joining_date = COALESCE($5, joining_date),
        currency = COALESCE($6, currency),
        currency_symbol = COALESCE($7, currency_symbol),
        exchange_rate = COALESCE($8, exchange_rate),
        base_currency = COALESCE($9, base_currency),
        exchange_rate_to_base = COALESCE($10, exchange_rate_to_base),
        exchange_rate_source = COALESCE($11, exchange_rate_source),
        exchange_rate_as_of = COALESCE($12::timestamptz, exchange_rate_as_of),
        currency_snapshot = COALESCE($13::jsonb, currency_snapshot),
        ctc = COALESCE($14, ctc),
        salary_components = COALESCE($15::jsonb, salary_components), benefits = COALESCE($16::jsonb, benefits),
        offer_letter_content = COALESCE($17, offer_letter_content),
        current_version = current_version + 1, last_updated_by = $18, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        id, tenantId, dto.designation, dto.employment_type_id, dto.joining_date,
        currency?.currencyCode, currency?.currencySymbol, currency?.exchangeRate,
        currency?.baseCurrency, currency?.exchangeRateToBase, currency?.exchangeRateSource,
        currency?.exchangeRateAsOf, currency ? JSON.stringify(currency.snapshot) : null, dto.ctc,
        dto.salary_components ? JSON.stringify(dto.salary_components) : null,
        dto.benefits ? JSON.stringify(dto.benefits) : null, dto.offer_letter_content, updatedById,
      ],
    );
    const offer = rows[0];
    await this.writeVersion(tenantId, id, offer.current_version, this.snapshotOf(offer), updatedById, dto.change_note);
    return this.findOne(id, tenantId);
  }

  async softDelete(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status !== 'draft') throw new BadRequestException('Only draft offers can be deleted');
    await this.db.query('UPDATE offers SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async listVersions(offerId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT v.*, u.email AS created_by_email FROM offer_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.offer_id = $1 AND v.tenant_id = $2 ORDER BY v.version_number DESC`,
      [offerId, tenantId],
    );
    return rows;
  }

  async restoreVersion(offerId: string, tenantId: string, versionNumber: number, restoredById: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM offer_versions WHERE offer_id = $1 AND tenant_id = $2 AND version_number = $3',
      [offerId, tenantId, versionNumber],
    );
    if (!rows.length) throw new NotFoundException('Version not found');
    return this.update(offerId, tenantId, restoredById, { ...rows[0].snapshot, change_note: `Restored from version ${versionNumber}` });
  }

  /** Recruiter sends an approved offer to the candidate — generates the Career Portal link, emails it, and logs it. */
  async send(id: string, tenantId: string, actorId: string, dto: SendOfferDto) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status !== 'approved') {
      throw new BadRequestException(`Cannot send an offer with status '${existing.status}' — it must be approved first`);
    }

    const { rows } = await this.db.query(
      `UPDATE offers SET status = 'sent', sent_at = now(), expires_at = COALESCE($3, expires_at), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.expires_at ?? null],
    );

    const offer = await this.findOne(id, tenantId);
    const { rows: tenantRows } = await this.db.query('SELECT slug FROM tenants WHERE id = $1', [tenantId]);
    const slug = tenantRows[0]?.slug;
    const offerUrl = slug
      ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/career/${slug}/offers/${id}?email=${encodeURIComponent(offer.candidate_email)}`
      : undefined;

    const subject = `Your offer for ${offer.job_title}`;
    const body = `Hi ${offer.first_name},\n\nWe're pleased to extend an offer for the ${offer.designation || offer.job_title} role.\n\n${offerUrl ? `View and respond to your offer here: ${offerUrl}` : 'Please contact us for details.'}\n\nWe look forward to hearing from you.`;

    let status: 'sent' | 'failed' = 'sent';
    try {
      await this.email.sendGenericEmail(offer.candidate_email, subject, body);
    } catch {
      status = 'failed';
    }
    await this.db.query(
      `INSERT INTO candidate_communications (tenant_id, candidate_id, application_id, channel, subject, body, status, sent_by)
       VALUES ($1,$2,$3,'email',$4,$5,$6,$7)`,
      [tenantId, offer.candidate_id, offer.application_id, subject, body, status, actorId],
    );

    return rows[0];
  }

  async withdraw(id: string, tenantId: string, actorId: string, dto: WithdrawOfferDto) {
    const existing = await this.getRaw(id, tenantId);
    if (!['approved', 'sent'].includes(existing.status)) {
      throw new BadRequestException(`Cannot withdraw an offer with status '${existing.status}'`);
    }
    const { rows } = await this.db.query(
      `UPDATE offers SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, actorId],
    );
    return rows[0];
  }

  // ── Negotiation (internal/recruiter side) ─────────────────────────────
  async listNegotiations(offerId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT n.*, u.email AS created_by_email FROM offer_negotiations n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.offer_id = $1 AND n.tenant_id = $2 ORDER BY n.created_at ASC`,
      [offerId, tenantId],
    );
    return rows;
  }

  async addNegotiation(offerId: string, tenantId: string, createdById: string, dto: AddNegotiationDto) {
    await this.getRaw(offerId, tenantId);
    const { rows } = await this.db.query(
      `INSERT INTO offer_negotiations (tenant_id, offer_id, raised_by, note, proposed_ctc, proposed_joining_date, created_by)
       VALUES ($1,$2,'recruiter',$3,$4,$5,$6) RETURNING *`,
      [tenantId, offerId, dto.note, dto.proposed_ctc ?? null, dto.proposed_joining_date ?? null, createdById],
    );
    return rows[0];
  }

  // ── Candidate-facing (public Career Portal, email-matched, no login) ──
  private async assertCandidateAccess(offerId: string, tenantId: string, email: string) {
    const offer = await this.findOne(offerId, tenantId);
    if (offer.candidate_email.toLowerCase() !== email.trim().toLowerCase()) {
      throw new ForbiddenException('Offer not found');
    }
    return offer;
  }

  async getForCandidate(tenantId: string, offerId: string, email: string) {
    const offer = await this.assertCandidateAccess(offerId, tenantId, email);
    if (!['sent', 'accepted', 'declined'].includes(offer.status)) throw new NotFoundException('Offer not found');
    const negotiations = await this.listNegotiations(offerId, tenantId);
    return { offer, negotiations };
  }

  async acceptByCandidate(tenantId: string, offerId: string, email: string) {
    const offer = await this.assertCandidateAccess(offerId, tenantId, email);
    if (offer.status !== 'sent') throw new BadRequestException(`Cannot accept an offer with status '${offer.status}'`);

    const { rows } = await this.db.query(
      `UPDATE offers SET status = 'accepted', responded_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [offerId, tenantId],
    );
    await this.applications.updateStatus(offer.application_id, tenantId, null, 'hired');
    await this.notifyStakeholders(tenantId, offer, 'Offer accepted', `${offer.first_name} ${offer.last_name} accepted the offer for "${offer.job_title}".`);
    return rows[0];
  }

  async declineByCandidate(tenantId: string, offerId: string, email: string, reason?: string) {
    const offer = await this.assertCandidateAccess(offerId, tenantId, email);
    if (offer.status !== 'sent') throw new BadRequestException(`Cannot decline an offer with status '${offer.status}'`);

    const { rows } = await this.db.query(
      `UPDATE offers SET status = 'declined', responded_at = now(), decline_reason = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [offerId, tenantId, reason ?? null],
    );
    await this.notifyStakeholders(tenantId, offer, 'Offer declined', `${offer.first_name} ${offer.last_name} declined the offer for "${offer.job_title}".`);
    return rows[0];
  }

  async addNegotiationByCandidate(tenantId: string, offerId: string, email: string, dto: AddNegotiationDto) {
    const offer = await this.assertCandidateAccess(offerId, tenantId, email);
    if (offer.status !== 'sent') throw new BadRequestException(`Cannot negotiate an offer with status '${offer.status}'`);

    const { rows } = await this.db.query(
      `INSERT INTO offer_negotiations (tenant_id, offer_id, raised_by, note, proposed_ctc, proposed_joining_date)
       VALUES ($1,$2,'candidate',$3,$4,$5) RETURNING *`,
      [tenantId, offerId, dto.note, dto.proposed_ctc ?? null, dto.proposed_joining_date ?? null],
    );
    await this.notifyStakeholders(tenantId, offer, 'Candidate proposed changes to offer', `${offer.first_name} ${offer.last_name} proposed changes to the offer for "${offer.job_title}".`);
    return rows[0];
  }

  private async resolveUserIdForEmployee(tenantId: string, employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const { rows } = await this.db.query('SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL LIMIT 1', [tenantId, employeeId]);
    return rows[0]?.id ?? null;
  }

  private async notifyStakeholders(tenantId: string, offer: any, title: string, message: string) {
    if (!offer.vacancy_id) return;
    const { rows: vacancyRows } = await this.db.query('SELECT recruiter_id, hiring_manager_id FROM vacancies WHERE id = $1', [offer.vacancy_id]);
    const vacancy = vacancyRows[0];
    if (!vacancy) return;
    const userIds = (await Promise.all(
      [vacancy.recruiter_id, vacancy.hiring_manager_id].map((empId: string | null) => this.resolveUserIdForEmployee(tenantId, empId)),
    )).filter((id): id is string => !!id);
    if (!userIds.length) return;
    await this.notifications.emit(tenantId, {
      userIds, title, message, type: 'info', sourceModule: 'recruitment', entityType: 'offer', entityId: offer.id,
      actionUrl: `/dashboard/hr/recruitment/offers/${offer.id}`,
    });
  }
}
