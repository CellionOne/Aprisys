-- Aprisys Database Schema
-- Powered by Cellion One

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS digest;
CREATE SCHEMA IF NOT EXISTS cdi;
CREATE SCHEMA IF NOT EXISTS audit;

-- ─── SUBSCRIBERS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digest.subscribers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  phone                 TEXT,
  password_hash         TEXT,
  google_id             TEXT UNIQUE,
  email_verified        BOOLEAN DEFAULT FALSE,
  verify_token          TEXT,
  reset_token           TEXT,
  reset_expires         TIMESTAMPTZ,
  refresh_token         TEXT,
  refresh_token_expires TIMESTAMPTZ,
  account_type          TEXT DEFAULT 'retail' CHECK (account_type IN ('retail','qualified','broker','fund_manager','corporate','institutional','admin')),
  kyc_status            TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending','submitted','under_review','verified','rejected')),
  account_status        TEXT DEFAULT 'active' CHECK (account_status IN ('active','suspended','deleted')),
  suspension_reason     TEXT,
  suspended_at          TIMESTAMPTZ,
  suspended_by          UUID,
  is_admin              BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digest.subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id         UUID NOT NULL REFERENCES digest.subscribers(id) ON DELETE CASCADE,
  plan                  TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','standard','pro','broker','institutional')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','grace','suspended','cancelled')),
  paystack_sub_code     TEXT,
  paystack_email_token  TEXT,
  current_period_end    TIMESTAMPTZ,
  grace_until           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── WATCHLISTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digest.watchlists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES digest.subscribers(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subscriber_id, ticker)
);

-- ─── PREFERENCES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digest.preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   UUID UNIQUE NOT NULL REFERENCES digest.subscribers(id) ON DELETE CASCADE,
  delivery_time   TEXT DEFAULT '19:30',
  frequency       TEXT DEFAULT 'daily' CHECK (frequency IN ('daily','weekdays','weekly')),
  channels        TEXT[] DEFAULT ARRAY['email'],
  signal_types    TEXT[] DEFAULT ARRAY['trade_calls','rumours','sector_rotation','dividends'],
  sms_hours_start TEXT DEFAULT '07:00',
  sms_hours_end   TEXT DEFAULT '21:00',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DELIVERIES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digest.deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   UUID NOT NULL REFERENCES digest.subscribers(id) ON DELETE CASCADE,
  digest_date     DATE NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('email','sms','push')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed','bounced')),
  resend_id       TEXT,
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  open_token      TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  unsub_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex')
);

-- ─── DIGEST ARCHIVE ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digest.archive (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date     DATE UNIQUE NOT NULL,
  market_snapshot JSONB,
  ai_commentary   TEXT,
  top_securities  JSONB,
  signals         JSONB,
  composed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── KYC RECORDS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digest.kyc_records (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id          UUID NOT NULL REFERENCES digest.subscribers(id) ON DELETE CASCADE,
  version                INTEGER DEFAULT 1,
  entity_type            TEXT NOT NULL CHECK (entity_type IN ('individual','qualified_individual','stockbroker','fund_manager','corporate','institutional')),
  nin                    TEXT,
  bvn                    TEXT,
  cac_number             TEXT,
  tin                    TEXT,
  sec_licence            TEXT,
  ngx_membership         TEXT,
  cscs_code              TEXT,
  net_worth_declaration  TEXT,
  investment_experience  TEXT,
  required_signatories   INTEGER DEFAULT 1,
  documents              JSONB DEFAULT '[]',
  status                 TEXT DEFAULT 'pending' CHECK (status IN ('pending','submitted','under_review','verified','rejected')),
  reviewed_by            UUID,
  review_notes           TEXT,
  rejection_reason       TEXT,
  submitted_at           TIMESTAMPTZ,
  verified_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digest.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES digest.subscribers(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     UUID,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CDI: DEALS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.deals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            TEXT UNIQUE NOT NULL DEFAULT 'CDI-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  created_by           UUID NOT NULL REFERENCES digest.subscribers(id),
  title                TEXT NOT NULL,
  deal_type            TEXT NOT NULL CHECK (deal_type IN ('equity','tbill','bond','private_placement','off_market','fixed_income')),
  asset_ticker         TEXT,
  asset_name           TEXT,
  quantity             NUMERIC,
  unit_price           NUMERIC,
  total_value          NUMERIC,
  currency             TEXT DEFAULT 'NGN',
  conditions           JSONB DEFAULT '[]',
  expiry_at            TIMESTAMPTZ,
  status               TEXT DEFAULT 'draft' CHECK (status IN ('draft','open','funded','verified','completed','failed','expired','disputed')),
  visibility           TEXT DEFAULT 'private' CHECK (visibility IN ('private','invite_only','marketplace')),
  cie_risk_score       NUMERIC,
  ai_term_sheet        TEXT,
  commission_pct       NUMERIC DEFAULT 0,
  required_signatories INTEGER DEFAULT 1,
  terms_locked         BOOLEAN DEFAULT FALSE,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CDI: DEAL PARTIES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.deal_parties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES cdi.deals(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES digest.subscribers(id),
  role          TEXT NOT NULL CHECK (role IN ('creator','buyer','seller','broker','co_broker','observer')),
  status        TEXT DEFAULT 'invited' CHECK (status IN ('invited','accepted','declined','removed')),
  eoi_submitted BOOLEAN DEFAULT FALSE,
  eoi_submitted_at TIMESTAMPTZ,
  eoi_message   TEXT,
  commission_pct NUMERIC DEFAULT 0,
  invited_at    TIMESTAMPTZ DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  UNIQUE(deal_id, subscriber_id)
);

-- ─── CDI: DEAL MESSAGES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.deal_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id               UUID NOT NULL REFERENCES cdi.deals(id) ON DELETE CASCADE,
  sender_id             UUID NOT NULL REFERENCES digest.subscribers(id),
  message               TEXT NOT NULL,
  message_type          TEXT DEFAULT 'text' CHECK (message_type IN ('text','system','ai_summary','document','terms_proposal')),
  terms_proposal_status TEXT CHECK (terms_proposal_status IN ('pending','accepted','countered','rejected')),
  metadata              JSONB,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CDI: DOCUMENTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.deal_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES cdi.deals(id) ON DELETE CASCADE,
  uploaded_by   UUID NOT NULL REFERENCES digest.subscribers(id),
  filename      TEXT NOT NULL,
  storage_key   TEXT NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT,
  document_type TEXT CHECK (document_type IN ('term_sheet','agreement','id_document','board_resolution','other')),
  ai_analysis   JSONB,
  version       INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CDI: SIGNATURES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.deal_signatures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES cdi.deal_documents(id),
  signer_id      UUID NOT NULL REFERENCES digest.subscribers(id),
  signature_data TEXT NOT NULL,
  ip_address     TEXT,
  signed_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, signer_id)
);

-- ─── CDI: ESCROW ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.escrow_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id              UUID NOT NULL REFERENCES cdi.deals(id),
  funded_by            UUID NOT NULL REFERENCES digest.subscribers(id),
  amount               NUMERIC NOT NULL,
  currency             TEXT DEFAULT 'NGN',
  status               TEXT DEFAULT 'pending' CHECK (status IN ('pending','funded','conditions_checking','releasing','released','refunding','refunded','disputed','failed')),
  paystack_reference   TEXT,
  conditions           JSONB DEFAULT '[]',
  funded_at            TIMESTAMPTZ,
  released_at          TIMESTAMPTZ,
  refunded_at          TIMESTAMPTZ,
  release_triggered_by TEXT CHECK (release_triggered_by IN ('conditions_met','admin_manual','timeout','dispute_resolution')),
  admin_notes          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CDI: COMMISSIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.commissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES cdi.deals(id),
  recipient_id  UUID NOT NULL REFERENCES digest.subscribers(id),
  amount        NUMERIC NOT NULL,
  pct           NUMERIC,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CDI: EOI ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.eoi_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES cdi.deals(id),
  subscriber_id UUID NOT NULL REFERENCES digest.subscribers(id),
  message       TEXT,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','invited','declined')),
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deal_id, subscriber_id)
);

-- ─── CDI: RATINGS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdi.counterparty_ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID NOT NULL REFERENCES cdi.deals(id),
  rater_id   UUID NOT NULL REFERENCES digest.subscribers(id),
  rated_id   UUID NOT NULL REFERENCES digest.subscribers(id),
  score      INTEGER CHECK (score BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deal_id, rater_id, rated_id)
);

-- ─── AUDIT (IMMUTABLE) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit.events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  actor_id    UUID,
  actor_email TEXT,
  entity_type TEXT,
  entity_id   UUID,
  payload     JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CIE REFERENCE DATA ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cie_securities (
  ticker     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sector     TEXT,
  market_cap NUMERIC,
  is_active  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.cie_scores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker     TEXT NOT NULL,
  score_date DATE NOT NULL,
  ias        NUMERIC,
  rs         NUMERIC,
  cs         NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker, score_date)
);

CREATE TABLE IF NOT EXISTS public.cie_daily_prices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker     TEXT NOT NULL,
  trade_date DATE NOT NULL,
  open       NUMERIC,
  high       NUMERIC,
  low        NUMERIC,
  close      NUMERIC,
  volume     NUMERIC,
  UNIQUE(ticker, trade_date)
);

CREATE TABLE IF NOT EXISTS public.cie_signals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker       TEXT,
  type         TEXT,
  headline     TEXT NOT NULL,
  body         TEXT,
  priority     TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cie_market_pulse (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date      DATE UNIQUE NOT NULL,
  asi             NUMERIC,
  asi_change      NUMERIC,
  asi_change_pct  NUMERIC,
  advancing       INTEGER,
  declining       INTEGER,
  unchanged       INTEGER,
  turnover        NUMERIC,
  volume          NUMERIC,
  deals           INTEGER,
  commentary      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cie_dividends (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker              TEXT NOT NULL,
  declared_date       DATE,
  ex_date             DATE,
  payment_date        DATE,
  dividend_per_share  NUMERIC,
  yield_pct           NUMERIC
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON digest.subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_account_type ON digest.subscribers(account_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON digest.subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_subscriber ON digest.watchlists(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_subscriber ON digest.deliveries(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_date ON digest.deliveries(digest_date);
CREATE INDEX IF NOT EXISTS idx_kyc_subscriber ON digest.kyc_records(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_notifications_subscriber ON digest.notifications(subscriber_id, read_at);
CREATE INDEX IF NOT EXISTS idx_deals_status ON cdi.deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_creator ON cdi.deals(created_by);
CREATE INDEX IF NOT EXISTS idx_deals_visibility ON cdi.deals(visibility, status);
CREATE INDEX IF NOT EXISTS idx_deal_parties_subscriber ON cdi.deal_parties(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_deal_messages_deal ON cdi.deal_messages(deal_id, created_at);
CREATE INDEX IF NOT EXISTS idx_escrow_deal ON cdi.escrow_transactions(deal_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON cdi.escrow_transactions(status);
CREATE INDEX IF NOT EXISTS idx_eoi_deal ON cdi.eoi_submissions(deal_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit.events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit.events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit.events(created_at DESC);

-- ─── SEED DATA ────────────────────────────────────────────────────────────────
INSERT INTO public.cie_securities (ticker, name, sector) VALUES
('DANGCEM','Dangote Cement Plc','Building Materials'),
('GTCO','Guaranty Trust Holding Co','Banking'),
('ZENITHBANK','Zenith Bank Plc','Banking'),
('MTNN','MTN Nigeria Communications','Telecoms'),
('SEPLAT','Seplat Energy Plc','Oil & Gas'),
('NESTLE','Nestle Nigeria Plc','Consumer Goods'),
('BUACEMENT','BUA Cement Plc','Building Materials'),
('ACCESSCORP','Access Holdings Plc','Banking'),
('FBNH','FBN Holdings Plc','Banking'),
('AIRTELAFRI','Airtel Africa Plc','Telecoms'),
('STANBIC','Stanbic IBTC Holdings','Banking'),
('TOTALENERGIES','TotalEnergies Marketing Nigeria','Oil & Gas'),
('FLOURMILL','Flour Mills of Nigeria','Consumer Goods'),
('PRESCO','Presco Plc','Agriculture'),
('GEREGU','Geregu Power Plc','Power')
ON CONFLICT DO NOTHING;

INSERT INTO public.cie_market_pulse (trade_date, asi, asi_change, asi_change_pct, advancing, declining, unchanged, turnover, volume, deals, commentary)
VALUES (CURRENT_DATE, 98432.50, 412.30, 0.42, 23, 14, 8, 4823000000, 312000000, 4821,
'The All-Share Index extended its bullish streak today, buoyed by renewed interest in banking stocks ahead of Q3 earnings season. Broad market breadth remained positive with advancers outpacing decliners by 23 to 14. Foreign portfolio inflows continued to support sentiment in the telecoms sector, with MTN Nigeria and Airtel Africa both recording moderate gains. The construction sector remained subdued amid ongoing cement price pressures.')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  tickers TEXT[] := ARRAY['DANGCEM','GTCO','ZENITHBANK','MTNN','SEPLAT','NESTLE','BUACEMENT','ACCESSCORP','FBNH','AIRTELAFRI'];
  t TEXT;
  d INTEGER;
  base_ias NUMERIC;
  base_close NUMERIC;
BEGIN
  FOREACH t IN ARRAY tickers LOOP
    base_ias := 45 + random() * 50;
    base_close := 100 + random() * 900;
    FOR d IN 0..4 LOOP
      INSERT INTO public.cie_scores (ticker, score_date, ias, rs, cs)
      VALUES (t, CURRENT_DATE - d, ROUND((base_ias + random()*5 - 2.5)::numeric, 2),
              ROUND((base_ias * 0.9 + random()*5)::numeric, 2),
              ROUND((base_ias * 0.85 + random()*5)::numeric, 2))
      ON CONFLICT DO NOTHING;

      INSERT INTO public.cie_daily_prices (ticker, trade_date, open, high, low, close, volume)
      VALUES (t, CURRENT_DATE - d,
              ROUND((base_close + random()*20 - 10)::numeric, 2),
              ROUND((base_close + random()*30)::numeric, 2),
              ROUND((base_close - random()*20)::numeric, 2),
              ROUND((base_close + random()*10 - 5)::numeric, 2),
              ROUND((1000000 + random()*9000000)::numeric, 0))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO public.cie_signals (ticker, type, headline, body, priority) VALUES
('GTCO', 'trade_call', 'Institutional accumulation detected in GTCO', 'Large block purchases observed at the ₦48–₦50 level over the past 3 sessions suggest institutional positioning ahead of H1 results announcement expected next week.', 'high'),
('DANGCEM', 'sector_rotation', 'Building materials sector showing renewed momentum', 'Rotation from banking into building materials accelerating as infrastructure spend guidance from federal budget allocation becomes clearer. DANGCEM and BUACEMENT both showing improving RS scores.', 'medium'),
('ZENITHBANK', 'dividends', 'Zenith Bank declares interim dividend of ₦1.50 per share', 'Board declares interim dividend. Ex-date set for next month. Payment date to follow. Yield at current prices: approximately 3.2%.', 'low')
ON CONFLICT DO NOTHING;

-- Seed admin account (password: Admin1234!)
INSERT INTO digest.subscribers (email, name, password_hash, email_verified, account_type, kyc_status, account_status, is_admin)
VALUES ('admin@aprisys.com', 'Aprisys Admin',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMUBkW4P8vGJ2oJMqIyvFHBhHu',
  TRUE, 'admin', 'verified', 'active', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO digest.subscriptions (subscriber_id, plan, status)
SELECT id, 'institutional', 'active' FROM digest.subscribers WHERE email = 'admin@aprisys.com'
ON CONFLICT DO NOTHING;

INSERT INTO digest.preferences (subscriber_id)
SELECT id FROM digest.subscribers WHERE email = 'admin@aprisys.com'
ON CONFLICT DO NOTHING;
