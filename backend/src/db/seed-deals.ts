import { pool } from './client';
import { getChecklist } from '../config/instrumentConfig';

const ADMIN_EMAIL = 'admin@aprisys.com';
const DEMO_SELLER_EMAIL = 'demo.seller@aprisys.com';
const DEMO_BUYER_EMAIL = 'demo.buyer@aprisys.com';

const DEAL_DATA: Record<string, {
  title: string;
  asset_ticker?: string;
  asset_name: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  notes: string;
  deal_metadata: Record<string, unknown>;
}> = {
  equity: {
    title: '[DEMO] Dangote Cement Block Trade — 500,000 Units',
    asset_ticker: 'DANGCEM',
    asset_name: 'Dangote Cement Plc',
    quantity: 500000,
    unit_price: 420,
    total_value: 210000000,
    notes: 'OTC block trade — negotiated at ₦420 per share, representing a 2% discount to the last market close of ₦428.50. Seller is a retiring institutional investor reducing Nigerian equity exposure.',
    deal_metadata: {},
  },
  tbill: {
    title: '[DEMO] FGN 91-Day T-Bill — ₦500M Face Value',
    asset_ticker: 'FGN-TB-91',
    asset_name: 'FGN 91-Day Treasury Bill',
    quantity: 1,
    unit_price: 477750000,
    total_value: 477750000,
    notes: 'Secondary sale of 91-day FGN Treasury Bill. Discount rate of 18.45% p.a. agreed by both parties. Seller unwinding a short-term position ahead of quarter-end.',
    deal_metadata: {
      face_value: 500000000,
      discount_rate: 18.45,
      tenor_days: 91,
      maturity_date: '2026-07-14',
      series: 'CBN/TB/2026/Q2/003',
    },
  },
  bond: {
    title: '[DEMO] FGN 2030 Bond — ₦250M Face Value',
    asset_ticker: 'FGN-2030',
    asset_name: 'FGN 12.50% MAR 2030 Bond',
    quantity: 1,
    unit_price: 251500000,
    total_value: 251500000,
    notes: 'Secondary market trade in FGN 12.50% March 2030 bond. Agreed yield to maturity of 17.85% reflects current market conditions. Clean price + accrued interest basis.',
    deal_metadata: {
      bond_name: 'FGN 12.50% MAR 2030',
      issuer: 'Federal Government of Nigeria',
      face_value: 250000000,
      coupon_rate: 12.5,
      maturity_date: '2030-03-27',
      agreed_price: 251500000,
      yield_to_maturity: 17.85,
      accrued_interest: 1500000,
    },
  },
  commercial_paper: {
    title: '[DEMO] Dangote Industries CP Series 7 — ₦150M',
    asset_ticker: 'DAN-CP-S7',
    asset_name: 'Dangote Industries Ltd Commercial Paper Series 7',
    quantity: 1,
    unit_price: 141750000,
    total_value: 141750000,
    notes: 'Short-term 180-day commercial paper issued by Dangote Industries. Credit rated A+ by Agusto & Co. Dealer: Stanbic IBTC Capital. IPA: Stanbic IBTC Bank.',
    deal_metadata: {
      issuer_name: 'Dangote Industries Limited',
      issuer_rc_number: 'RC-226043',
      face_value: 150000000,
      discount_rate: 21.0,
      tenor_days: 180,
      issue_date: '2026-01-15',
      maturity_date: '2026-07-14',
      credit_rating: 'A+',
      credit_rating_agency: 'Agusto & Co',
      dealer_arranger: 'Stanbic IBTC Capital',
      issuing_paying_agent: 'Stanbic IBTC Bank Plc',
      min_subscription: 50000000,
      programme_size: 500000000,
      fmdq_registration: 'FMDQ/CP/2026/007',
      series_number: 'Series 7',
    },
  },
  bankers_acceptance: {
    title: "[DEMO] Access Bank BA — ₦75M, 60-Day",
    asset_ticker: 'ACCESS-BA-001',
    asset_name: "Access Bank Plc Banker's Acceptance",
    quantity: 1,
    unit_price: 72637500,
    total_value: 72637500,
    notes: "60-day banker's acceptance guaranteed by Access Bank Plc. Underlying trade: importation of raw industrial materials. Discount rate of 18.75% p.a.",
    deal_metadata: {
      accepting_bank: 'Access Bank Plc',
      drawee: 'Coscharis Motors Limited',
      face_value: 75000000,
      discount_rate: 18.75,
      tenor_days: 60,
      issue_date: '2026-02-12',
      maturity_date: '2026-04-13',
      underlying_trade: 'Importation of CKD automotive parts from Germany',
    },
  },
  promissory_note: {
    title: '[DEMO] NLNG Promissory Note — ₦100M, 12 months',
    asset_ticker: 'NLNG-PN-001',
    asset_name: 'Nigeria LNG Limited Promissory Note',
    quantity: 1,
    unit_price: 100000000,
    total_value: 100000000,
    notes: 'Corporate promissory note from NLNG for settlement of supply chain obligations. Interest rate of 22% p.a., quarterly instalments. Collateralised by receivables.',
    deal_metadata: {
      maker_name: 'Nigeria LNG Limited',
      maker_rc_number: 'RC-119976',
      payee_name: 'TechnipFMC Nigeria Limited',
      principal_amount: 100000000,
      interest_rate: 22.0,
      issue_date: '2026-01-01',
      maturity_date: '2026-12-31',
      payment_terms: 'Quarterly instalments',
      security: 'Assignment of NLNG export receivables',
    },
  },
  reit_units: {
    title: '[DEMO] UPDC REIT Units — 2,000,000 Units @ ₦95',
    asset_ticker: 'UPDCREIT',
    asset_name: 'UPDC Real Estate Investment Trust',
    quantity: 2000000,
    unit_price: 95,
    total_value: 190000000,
    notes: 'OTC transfer of UPDC REIT units. NAV per unit as at last valuation: ₦98.40. Distribution rights transfer: buyer gets current period distribution.',
    deal_metadata: {
      reit_name: 'UPDC Real Estate Investment Trust',
      reit_ticker: 'UPDCREIT',
      unit_count: 2000000,
      nav_per_unit: 98.4,
      agreed_price_per_unit: 95,
      distribution_rights: 'Buyer gets current period',
    },
  },
  eurobond: {
    title: '[DEMO] FGN 2047 Eurobond — USD 2M @ 97.5% of Par',
    asset_ticker: 'FGN-2047-USD',
    asset_name: 'FGN 8.747% NOV 2047 Eurobond',
    quantity: 1,
    unit_price: 3120000000,
    total_value: 3120000000,
    notes: 'Secondary market trade in FGN 8.747% 2047 Eurobond. Agreed at 97.50% of par. YTM of 9.02%. Settlement in USD via correspondent banking. Accrued interest USD 12,450.',
    deal_metadata: {
      bond_name: 'FGN 8.747% NOV 2047 — ISIN: XS1218420326',
      issuer: 'Federal Government of Nigeria',
      currency: 'USD',
      face_value: 2000000,
      coupon_rate: 8.747,
      maturity_date: '2047-11-21',
      agreed_price: 97.5,
      yield_to_maturity: 9.02,
      accrued_interest: 12450,
      settlement_currency: 'USD',
    },
  },
  rights_nil_paid: {
    title: '[DEMO] Zenith Bank Rights (Nil-Paid) — 1,500,000 Rights',
    asset_ticker: 'ZENITHBANK',
    asset_name: 'Zenith Bank Plc Rights Issue Nil-Paid Letters',
    quantity: 1500000,
    unit_price: 18,
    total_value: 27000000,
    notes: 'Transfer of nil-paid rights from Zenith Bank Plc rights issue. Rights ratio: 1 for 5. Subscription price ₦36. Seller chose not to exercise and is liquidating entitlement.',
    deal_metadata: {
      company_name: 'Zenith Bank Plc',
      company_ticker: 'ZENITHBANK',
      rights_ratio: '1 for 5',
      subscription_price: 36,
      number_of_rights: 1500000,
      rights_expiry_date: '2026-05-30',
      seller_cscs_account: 'CSCS-0012345678',
    },
  },
  agri_commodity_forward: {
    title: '[DEMO] Cocoa Forward Contract — 200MT @ ₦4.5M/tonne',
    asset_ticker: 'COCOA-FWD-001',
    asset_name: 'Nigerian Cocoa Forward Contract',
    quantity: 200,
    unit_price: 4500000,
    total_value: 900000000,
    notes: 'Forward contract for delivery of 200 metric tonnes of Grade 1 Nigerian Cocoa in Apapa Port. Quality inspection by Bureau Veritas. 30% advance payment agreed.',
    deal_metadata: {
      commodity_type: 'Cocoa',
      quantity_tonnes: 200,
      quality_grade: 'Grade 1 — 7% Max Moisture, 5% Max Defects',
      agreed_price_per_tonne: 4500000,
      delivery_date: '2026-09-30',
      delivery_location: 'Apapa Port Warehouse, Lagos',
      quality_inspection: 'Bureau Veritas Nigeria',
      advance_payment_pct: 30,
    },
  },
  sukuk: {
    title: '[DEMO] FGN Sukuk Series III — ₦300M Secondary Trade',
    asset_ticker: 'FGN-SUKUK-III',
    asset_name: 'Federal Government of Nigeria Sukuk Series III (Ijarah)',
    quantity: 1,
    unit_price: 298500000,
    total_value: 298500000,
    notes: "Secondary market trade in FGN Sukuk III (Ijarah structure). Shari'ah-compliant instrument backed by road infrastructure assets. Profit rate 15.743% p.a. Shari'ah advisor: Prof. Abdulazeez Orire.",
    deal_metadata: {
      sukuk_name: 'FGN Sukuk — Series III (Ijarah)',
      issuer: 'Federal Government of Nigeria',
      structure_type: 'Ijarah',
      face_value: 300000000,
      profit_rate: 15.743,
      maturity_date: '2030-06-16',
      agreed_price: 298500000,
      shariah_advisor: 'Prof. Abdulazeez Orire',
    },
  },
  infrastructure_bond: {
    title: '[DEMO] Lagos Roads Infrastructure Bond — ₦500M',
    asset_ticker: 'LASG-INFRA-2031',
    asset_name: 'Lagos State Govt Road Infrastructure Bond 2031',
    quantity: 1,
    unit_price: 502500000,
    total_value: 502500000,
    notes: 'Secondary trade in Lagos State Government infrastructure bond, backed by road tolling revenues. Tax-exempt status confirmed by FIRS. 7-year instrument, credit enhanced by LGIM guarantee.',
    deal_metadata: {
      bond_name: 'LASG Road Infrastructure Bond Series I 2031',
      issuer: 'Lagos State Government',
      project_description: 'Expansion and rehabilitation of 14 Lagos State road corridors',
      face_value: 500000000,
      coupon_rate: 16.5,
      maturity_date: '2031-03-01',
      agreed_price: 502500000,
      credit_enhancement: 'LGIM Guarantee + Tolling Revenue Escrow',
      tax_exempt: 'Yes - tax exempt',
    },
  },
  esos: {
    title: '[DEMO] Flutterwave ESOS Transfer — 50,000 Options @ ₦500',
    asset_ticker: 'FLW-ESOS',
    asset_name: 'Flutterwave Inc. Employee Share Options',
    quantity: 50000,
    unit_price: 500,
    total_value: 25000000,
    notes: 'Transfer of vested Flutterwave employee share options from a departing senior employee. Exercise price ₦250, transfer at ₦500 per option. Company consent obtained. Pre-IPO secondary.',
    deal_metadata: {
      company_name: 'Flutterwave Inc.',
      option_scheme_name: 'Flutterwave 2021 Employee Option Plan',
      number_of_options: 50000,
      exercise_price: 250,
      agreed_transfer_price: 500,
      vesting_date: '2025-01-01',
      expiry_date: '2028-12-31',
      company_consent: 'Obtained',
      lock_up_restrictions: '12-month post-IPO lock-up applies',
    },
  },
  private_placement: {
    title: '[DEMO] Mixta Africa Private Placement — ₦600M',
    asset_ticker: 'MIXTA-PP-2026',
    asset_name: 'Mixta Real Estate Plc Private Placement',
    quantity: 6000000,
    unit_price: 100,
    total_value: 600000000,
    notes: 'Private placement of ordinary shares in Mixta Real Estate Plc. Proceeds to fund completion of Lakowe Lakes Estate Phase III. Min subscription ₦50M. Offer closes May 31, 2026.',
    deal_metadata: {
      issuer_name: 'Mixta Real Estate Plc',
      security_type: 'Ordinary shares',
      number_of_units: 6000000,
      price_per_unit: 100,
      min_subscription: 50000000,
      use_of_proceeds: 'Completion of Lakowe Lakes Estate Phase III development',
      offer_open_date: '2026-01-15',
      offer_close_date: '2026-05-31',
    },
  },
  off_market: {
    title: '[DEMO] GTCO Block Stake — ₦120M Off-Market',
    asset_ticker: 'GTCO',
    asset_name: 'Guaranty Trust Holding Company Plc',
    quantity: 3000000,
    unit_price: 40,
    total_value: 120000000,
    notes: 'Negotiated off-market transfer of GTCO shares between two institutional investors. Agreed at ₦40 per share, a 1.5% discount to the last close of ₦40.60. Settlement T+2 via CSCS.',
    deal_metadata: {},
  },
  fixed_income: {
    title: '[DEMO] FBN Holdings Fixed Income Note — ₦200M',
    asset_ticker: 'FBNH-FIN-001',
    asset_name: 'FBN Holdings Fixed Income Note',
    quantity: 1,
    unit_price: 200000000,
    total_value: 200000000,
    notes: 'General fixed income note issued by FBN Holdings Plc. 18-month tenor with 23% p.a. return. Backed by FBN Holdings corporate guarantee.',
    deal_metadata: {
      instrument_description: 'FBN Holdings 18-month Fixed Income Note backed by corporate guarantee',
      face_value: 200000000,
      return_rate: 23.0,
      maturity_date: '2027-10-13',
    },
  },
};

async function seed() {
  const client = await pool.connect();
  try {
    console.log('[Seed] Starting demo deal seed...');

    // 1. Resolve admin ID dynamically — fail fast if missing
    const adminRow = await client.query(
      `SELECT id FROM digest.subscribers WHERE email = $1`,
      [ADMIN_EMAIL]
    );
    if (!adminRow.rows.length) {
      throw new Error(`Admin subscriber not found for email: ${ADMIN_EMAIL}`);
    }
    const adminId: string = adminRow.rows[0].id;
    console.log(`[Seed] Admin resolved: ${adminId}`);

    // 2. Upsert demo seller (creator of all deals — admin is NOT a party so admin can see them in marketplace)
    const sellerResult = await client.query(`
      INSERT INTO digest.subscribers (email, name, password_hash, email_verified, account_type, kyc_status, account_status, is_admin)
      VALUES ($1, 'Demo Seller (Institutional)', crypt('DemoSeller1!', gen_salt('bf')), true, 'institutional', 'verified', 'active', false)
      ON CONFLICT (email) DO UPDATE SET
        account_type = 'institutional',
        kyc_status = 'verified',
        account_status = 'active'
      RETURNING id
    `, [DEMO_SELLER_EMAIL]);

    const sellerId: string = sellerResult.rows[0].id;
    console.log(`[Seed] Demo seller upserted: ${sellerId}`);

    await client.query(`DELETE FROM digest.subscriptions WHERE subscriber_id = $1`, [sellerId]);
    await client.query(
      `INSERT INTO digest.subscriptions (subscriber_id, plan, status) VALUES ($1, 'institutional', 'active')`,
      [sellerId]
    );

    // 3. Upsert demo buyer (counterparty)
    const buyerResult = await client.query(`
      INSERT INTO digest.subscribers (email, name, password_hash, email_verified, account_type, kyc_status, account_status, is_admin)
      VALUES ($1, 'Demo Buyer (Corporate)', crypt('DemoBuyer1!', gen_salt('bf')), true, 'corporate', 'verified', 'active', false)
      ON CONFLICT (email) DO UPDATE SET
        account_type = 'corporate',
        kyc_status = 'verified',
        account_status = 'active'
      RETURNING id
    `, [DEMO_BUYER_EMAIL]);

    const buyerId: string = buyerResult.rows[0].id;
    console.log(`[Seed] Demo buyer upserted: ${buyerId}`);

    // Ensure buyer has exactly one active subscription (no unique constraint on subscriber_id)
    await client.query(`DELETE FROM digest.subscriptions WHERE subscriber_id = $1`, [buyerId]);
    await client.query(
      `INSERT INTO digest.subscriptions (subscriber_id, plan, status) VALUES ($1, 'pro', 'active')`,
      [buyerId]
    );

    // 4. Delete existing [DEMO] deals and ALL dependent records (non-cascading tables first)
    const existingDeals = await client.query(`
      SELECT id FROM cdi.deals WHERE title LIKE '[DEMO]%'
    `);
    const existingIds: string[] = existingDeals.rows.map((r: { id: string }) => r.id);
    if (existingIds.length > 0) {
      await client.query(`DELETE FROM cdi.escrow_transactions WHERE deal_id = ANY($1)`, [existingIds]);
      await client.query(`DELETE FROM cdi.commissions WHERE deal_id = ANY($1)`, [existingIds]);
      await client.query(`DELETE FROM cdi.eoi_submissions WHERE deal_id = ANY($1)`, [existingIds]);
      await client.query(`DELETE FROM cdi.counterparty_ratings WHERE deal_id = ANY($1)`, [existingIds]);
    }
    const deleted = await client.query(`
      DELETE FROM cdi.deals WHERE title LIKE '[DEMO]%' RETURNING id
    `);
    console.log(`[Seed] Deleted ${deleted.rowCount} existing demo deals`);

    // 4. Insert 16 deals
    const dealTypes = Object.keys(DEAL_DATA);
    let inserted = 0;

    for (const dealType of dealTypes) {
      const data = DEAL_DATA[dealType];
      const checklist = getChecklist(dealType, 'institutional');

      // Compute a realistic past date for completed deals
      const daysAgo = 30 + Math.floor(Math.random() * 60); // 30-90 days ago
      const completedDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const createdDate = new Date(completedDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      const dealRes = await client.query(`
        INSERT INTO cdi.deals (
          created_by, title, deal_type, asset_ticker, asset_name,
          quantity, unit_price, total_value, currency,
          status, visibility, notes,
          deal_metadata, regulatory_checklist,
          checklist_override, checklist_override_by, checklist_override_reason,
          ai_documents, cie_risk_score, commission_pct,
          required_signatories, terms_locked,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, 'NGN',
          'completed', 'marketplace', $9,
          $10::jsonb, $11::jsonb,
          true, $12, 'Demo data — documents waived',
          '{}'::jsonb, $13, 0.5,
          2, true,
          $14, $15
        )
        RETURNING id
      `, [
        sellerId,
        data.title,
        dealType,
        data.asset_ticker ?? null,
        data.asset_name,
        data.quantity,
        data.unit_price,
        data.total_value,
        data.notes,
        JSON.stringify(data.deal_metadata),
        JSON.stringify(checklist),
        adminId,
        Math.floor(30 + Math.random() * 50),
        createdDate.toISOString(),
        completedDate.toISOString(),
      ]);

      const dealId: string = dealRes.rows[0].id;

      // 5. Insert deal parties (seller as creator, demo buyer as buyer)
      await client.query(`
        INSERT INTO cdi.deal_parties (deal_id, subscriber_id, role, status, eoi_submitted, eoi_submitted_at, responded_at)
        VALUES
          ($1, $2, 'creator', 'accepted', true, $3, $3),
          ($1, $4, 'buyer', 'accepted', true, $5, $5)
      `, [
        dealId,
        sellerId,
        createdDate.toISOString(),
        buyerId,
        new Date(createdDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      ]);

      // 6. Insert released escrow
      const fundedDate = new Date(createdDate.getTime() + 2 * 24 * 60 * 60 * 1000);
      const releasedDate = new Date(completedDate.getTime());
      const paystackRef = `PSK_DEMO_${dealType.toUpperCase()}_${Date.now().toString(36).toUpperCase()}`;

      await client.query(`
        INSERT INTO cdi.escrow_transactions (
          deal_id, funded_by, amount, currency,
          status, paystack_reference,
          funded_at, released_at,
          release_triggered_by,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, 'NGN',
          'released', $4,
          $5, $6,
          'conditions_met',
          $5, $6
        )
      `, [
        dealId,
        buyerId,
        data.total_value,
        paystackRef,
        fundedDate.toISOString(),
        releasedDate.toISOString(),
      ]);

      inserted++;
      console.log(`[Seed] ✓ ${dealType}: ${data.title}`);
    }

    console.log(`\n[Seed] Done! Inserted ${inserted} demo deals.`);
  } catch (err) {
    console.error('[Seed] Error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[Seed] Fatal:', err);
  process.exit(1);
});
