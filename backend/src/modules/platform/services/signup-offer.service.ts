import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CreateSignupOfferDto, UpdateSignupOfferDto } from '../dto/signup-offer.dto';

@Injectable()
export class SignupOfferService {
  constructor(private db: DatabaseService) {}

  private validateTypeFields(offerType: string, trialDays?: number | null, discountPercent?: number | null, discountAmount?: number | null) {
    if (offerType === 'free_trial' && !trialDays) {
      throw new BadRequestException('trialDays is required for a free trial offer');
    }
    if (offerType === 'discount_percent' && (discountPercent === undefined || discountPercent === null)) {
      throw new BadRequestException('discountPercent is required for a percentage discount offer');
    }
    if (offerType === 'discount_flat' && (discountAmount === undefined || discountAmount === null)) {
      throw new BadRequestException('discountAmount is required for a flat discount offer');
    }
  }

  // ── Super admin CRUD ────────────────────────────────────────────

  async findAll() {
    const { rows } = await this.db.query('SELECT * FROM signup_offers ORDER BY created_at DESC');
    return rows;
  }

  async findOne(id: string) {
    const { rows } = await this.db.query('SELECT * FROM signup_offers WHERE id = $1', [id]);
    if (!rows.length) throw new NotFoundException('Offer not found');
    return rows[0];
  }

  async create(dto: CreateSignupOfferDto, userId: string) {
    this.validateTypeFields(dto.offerType, dto.trialDays, dto.discountPercent, dto.discountAmount);
    const code = dto.code?.trim() ? dto.code.trim().toUpperCase() : null;

    try {
      const { rows } = await this.db.query(
        `INSERT INTO signup_offers (
           name, description, offer_type, trial_days, discount_percent, discount_amount,
           code, applicable_plan_id, valid_from, valid_until, max_redemptions, is_active, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, now()), $10, $11, COALESCE($12, true), $13)
         RETURNING *`,
        [
          dto.name, dto.description || null, dto.offerType, dto.trialDays || null,
          dto.discountPercent ?? null, dto.discountAmount ?? null, code,
          dto.applicablePlanId || null, dto.validFrom || null, dto.validUntil || null,
          dto.maxRedemptions || null, dto.isActive, userId,
        ],
      );
      return rows[0];
    } catch (err: any) {
      if (err.code === '23505') throw new ConflictException('An offer with this code already exists');
      throw err;
    }
  }

  async update(id: string, dto: UpdateSignupOfferDto) {
    const existing = await this.findOne(id);
    this.validateTypeFields(
      dto.offerType ?? existing.offer_type,
      dto.trialDays ?? existing.trial_days,
      dto.discountPercent ?? existing.discount_percent,
      dto.discountAmount ?? existing.discount_amount,
    );
    const code = dto.code !== undefined ? (dto.code?.trim() ? dto.code.trim().toUpperCase() : null) : undefined;

    try {
      const { rows } = await this.db.query(
        `UPDATE signup_offers SET
           name = COALESCE($2, name),
           description = COALESCE($3, description),
           offer_type = COALESCE($4, offer_type),
           trial_days = COALESCE($5, trial_days),
           discount_percent = COALESCE($6, discount_percent),
           discount_amount = COALESCE($7, discount_amount),
           code = COALESCE($8, code),
           applicable_plan_id = COALESCE($9, applicable_plan_id),
           valid_from = COALESCE($10, valid_from),
           valid_until = COALESCE($11, valid_until),
           max_redemptions = COALESCE($12, max_redemptions),
           is_active = COALESCE($13, is_active),
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          id, dto.name, dto.description, dto.offerType, dto.trialDays,
          dto.discountPercent, dto.discountAmount, code, dto.applicablePlanId,
          dto.validFrom, dto.validUntil, dto.maxRedemptions, dto.isActive,
        ],
      );
      if (!rows.length) throw new NotFoundException('Offer not found');
      return rows[0];
    } catch (err: any) {
      if (err.code === '23505') throw new ConflictException('An offer with this code already exists');
      throw err;
    }
  }

  async toggleActive(id: string, isActive: boolean) {
    const { rows } = await this.db.query(
      'UPDATE signup_offers SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [id, isActive],
    );
    if (!rows.length) throw new NotFoundException('Offer not found');
    return rows[0];
  }

  async remove(id: string) {
    const offer = await this.findOne(id);
    if (offer.redemptions_count > 0) {
      throw new BadRequestException('This offer has already been redeemed and cannot be deleted — deactivate it instead');
    }
    await this.db.query('DELETE FROM signup_offers WHERE id = $1', [id]);
    return { success: true };
  }

  // ── Public (unauthenticated) — consumed by the registration wizard ──

  async getPublicActiveOffers() {
    const { rows } = await this.db.query(
      `SELECT id, name, description, offer_type, trial_days, discount_percent, discount_amount, applicable_plan_id, valid_until
       FROM signup_offers
       WHERE is_active = true AND code IS NULL
         AND valid_from <= now() AND (valid_until IS NULL OR valid_until >= now())
         AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)
       ORDER BY created_at DESC`,
    );
    return rows;
  }

  async validateCode(code: string) {
    const { rows } = await this.db.query(
      `SELECT id, name, description, offer_type, trial_days, discount_percent, discount_amount, applicable_plan_id, valid_until
       FROM signup_offers
       WHERE UPPER(code) = UPPER($1) AND is_active = true
         AND valid_from <= now() AND (valid_until IS NULL OR valid_until >= now())
         AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)`,
      [code],
    );
    if (!rows.length) throw new BadRequestException('This code is invalid, expired, or no longer available');
    return rows[0];
  }

  /**
   * Redeems `offerId` for a freshly-created tenant. Must run inside the same
   * DB transaction (and using its `client`) as the tenant INSERT in
   * registration.service.ts, so the row lock + redemption count update are
   * atomic with org creation. Re-validates eligibility server-side regardless
   * of whether the caller arrived at this offerId via a code or a public
   * listing — never trust the client's earlier validation.
   */
  async redeemForTenant(client: any, tenantId: string, offerId: string) {
    const { rows } = await client.query('SELECT * FROM signup_offers WHERE id = $1 FOR UPDATE', [offerId]);
    if (!rows.length) throw new BadRequestException('Offer not found');
    const offer = rows[0];
    const now = new Date();

    if (!offer.is_active) throw new BadRequestException('This offer is no longer active');
    if (new Date(offer.valid_from) > now) throw new BadRequestException('This offer is not yet available');
    if (offer.valid_until && new Date(offer.valid_until) < now) throw new BadRequestException('This offer has expired');
    if (offer.max_redemptions !== null && offer.redemptions_count >= offer.max_redemptions) {
      throw new BadRequestException('This offer has reached its redemption limit');
    }

    await client.query(
      `INSERT INTO tenant_signup_offer_redemptions
         (tenant_id, offer_id, offer_type, trial_days_granted, discount_percent_granted, discount_amount_granted)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, offer.id, offer.offer_type, offer.trial_days, offer.discount_percent, offer.discount_amount],
    );
    await client.query(
      'UPDATE signup_offers SET redemptions_count = redemptions_count + 1, updated_at = now() WHERE id = $1',
      [offer.id],
    );

    let trialEndsAt: Date | null = null;
    if (offer.offer_type === 'free_trial' && offer.trial_days) {
      trialEndsAt = new Date(now.getTime() + offer.trial_days * 24 * 60 * 60 * 1000);
      await client.query('UPDATE tenants SET trial_ends_at = $2 WHERE id = $1', [tenantId, trialEndsAt]);
    }

    return { offer, trialEndsAt };
  }
}
