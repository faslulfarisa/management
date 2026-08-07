-- 095_signup_offers.sql
-- Super-admin-configurable signup offers (free trial extensions, percentage/flat
-- discounts) redeemable by organizations created through the public self-signup
-- flow. See: signup-offer.service.ts, registration.service.ts (redemption is
-- applied inside the same transaction that creates the tenant).

CREATE TABLE IF NOT EXISTS signup_offers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(150) NOT NULL,
  description         TEXT,
  offer_type          VARCHAR(20) NOT NULL
                        CHECK (offer_type IN ('free_trial', 'discount_percent', 'discount_flat')),
  trial_days          INT,
  discount_percent    NUMERIC(5,2),
  discount_amount     NUMERIC(12,2),
  code                VARCHAR(50),
  applicable_plan_id  UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  valid_from          TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until         TIMESTAMPTZ,
  max_redemptions     INT,
  redemptions_count   INT NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Codes are optional (NULL = auto-applied/shown to every registrant); when
-- present they must be unique case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_signup_offers_code
  ON signup_offers (UPPER(code)) WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signup_offers_active_window
  ON signup_offers (is_active, valid_from, valid_until);

-- One redemption per tenant — a self-signup organization can only ever apply
-- a single offer. Values are snapshotted off the offer at redemption time so
-- history stays accurate even if the offer is later edited or deleted.
CREATE TABLE IF NOT EXISTS tenant_signup_offer_redemptions (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offer_id                    UUID NOT NULL REFERENCES signup_offers(id),
  offer_type                  VARCHAR(20) NOT NULL,
  trial_days_granted          INT,
  discount_percent_granted    NUMERIC(5,2),
  discount_amount_granted     NUMERIC(12,2),
  discount_consumed_at        TIMESTAMPTZ,
  redeemed_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_offer_redemptions_offer
  ON tenant_signup_offer_redemptions (offer_id);
