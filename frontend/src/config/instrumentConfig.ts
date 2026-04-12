export const INSTRUMENT_CONFIG: Record<string, any> = {
  equity: { label: 'Equity', category: 'Equity & Exchange-traded', description: 'OTC block trade in NGX-listed shares', metadata_fields: [] },
  tbill: { label: 'Treasury Bill', category: 'Money Market', description: 'Secondary trade in FGN Treasury Bills', metadata_fields: [
    { key: 'face_value', label: 'Face value (₦)', type: 'number', required: true },
    { key: 'discount_rate', label: 'Discount rate (%)', type: 'number', required: true },
    { key: 'tenor_days', label: 'Tenor (days)', type: 'select', options: [91,182,364], required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
    { key: 'series', label: 'Series/issuance reference', type: 'text', required: false },
  ]},
  bond: { label: 'Bond', category: 'Fixed Income', description: 'Secondary trade in FGN or corporate bonds', metadata_fields: [
    { key: 'bond_name', label: 'Bond name/series', type: 'text', required: true },
    { key: 'issuer', label: 'Issuer', type: 'text', required: true },
    { key: 'face_value', label: 'Face value (₦)', type: 'number', required: true },
    { key: 'coupon_rate', label: 'Coupon rate (% p.a.)', type: 'number', required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
    { key: 'agreed_price', label: 'Agreed trade price (₦)', type: 'number', required: true },
    { key: 'yield_to_maturity', label: 'Yield to maturity (%)', type: 'number', required: false },
  ]},
  commercial_paper: { label: 'Commercial Paper', category: 'Money Market', description: 'Short-term unsecured promissory note, 30–270 days', metadata_fields: [
    { key: 'issuer_name', label: 'Issuer name', type: 'text', required: true },
    { key: 'issuer_rc_number', label: 'Issuer RC number', type: 'text', required: true },
    { key: 'face_value', label: 'Face value (₦)', type: 'number', required: true },
    { key: 'discount_rate', label: 'Discount rate (%)', type: 'number', required: true },
    { key: 'tenor_days', label: 'Tenor (days)', type: 'select', options: [30,60,90,180,270], required: true },
    { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
    { key: 'credit_rating', label: 'Credit rating', type: 'text', required: false },
    { key: 'credit_rating_agency', label: 'Rating agency', type: 'select', options: ['Agusto & Co','GCR Ratings','S&P','Fitch','Unrated'], required: false },
    { key: 'dealer_arranger', label: 'Dealer/Arranger', type: 'text', required: true },
    { key: 'issuing_paying_agent', label: 'Issuing and paying agent (bank)', type: 'text', required: true },
    { key: 'min_subscription', label: 'Minimum subscription (₦)', type: 'number', required: true },
    { key: 'fmdq_registration', label: 'FMDQ registration number', type: 'text', required: false },
    { key: 'series_number', label: 'Series/tranche number', type: 'text', required: false },
  ]},
  bankers_acceptance: { label: "Banker's Acceptance", category: 'Money Market', description: 'Bank-guaranteed short-term instrument', metadata_fields: [
    { key: 'accepting_bank', label: 'Accepting bank', type: 'text', required: true },
    { key: 'drawee', label: 'Drawee (original issuer)', type: 'text', required: true },
    { key: 'face_value', label: 'Face value (₦)', type: 'number', required: true },
    { key: 'discount_rate', label: 'Discount rate (%)', type: 'number', required: true },
    { key: 'tenor_days', label: 'Tenor (days)', type: 'select', options: [30,60,90,120,180], required: true },
    { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
  ]},
  promissory_note: { label: 'Promissory Note', category: 'Money Market', description: 'Corporate promise to pay at a future date', metadata_fields: [
    { key: 'maker_name', label: 'Maker name', type: 'text', required: true },
    { key: 'maker_rc_number', label: 'Maker RC number', type: 'text', required: true },
    { key: 'payee_name', label: 'Payee name', type: 'text', required: true },
    { key: 'principal_amount', label: 'Principal amount (₦)', type: 'number', required: true },
    { key: 'interest_rate', label: 'Interest rate (% p.a.)', type: 'number', required: false },
    { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
    { key: 'payment_terms', label: 'Payment terms', type: 'select', options: ['Lump sum at maturity','Monthly instalments','Quarterly instalments'], required: true },
  ]},
  reit_units: { label: 'REIT Units', category: 'Equity & Exchange-traded', description: 'Secondary trade in REIT units', metadata_fields: [
    { key: 'reit_name', label: 'REIT name', type: 'text', required: true },
    { key: 'unit_count', label: 'Number of units', type: 'number', required: true },
    { key: 'nav_per_unit', label: 'NAV per unit (₦)', type: 'number', required: false },
    { key: 'agreed_price_per_unit', label: 'Agreed price per unit (₦)', type: 'number', required: true },
    { key: 'distribution_rights', label: 'Distribution rights', type: 'select', options: ['Full transfer','Seller retains current period','Buyer gets current period'], required: true },
  ]},
  eurobond: { label: 'Eurobond (Secondary)', category: 'Fixed Income', description: 'Secondary trade in Nigerian Eurobonds', metadata_fields: [
    { key: 'bond_name', label: 'Bond name/ISIN', type: 'text', required: true },
    { key: 'issuer', label: 'Original issuer', type: 'text', required: true },
    { key: 'currency', label: 'Currency', type: 'select', options: ['USD','EUR','GBP'], required: true },
    { key: 'face_value', label: 'Face value', type: 'number', required: true },
    { key: 'coupon_rate', label: 'Coupon rate (% p.a.)', type: 'number', required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
    { key: 'agreed_price', label: 'Agreed trade price (% of par)', type: 'number', required: true },
    { key: 'settlement_currency', label: 'Settlement currency', type: 'select', options: ['USD','NGN'], required: true },
  ]},
  rights_nil_paid: { label: 'Rights Issue Nil-Paid Letters', category: 'Equity & Exchange-traded', description: 'Transfer of unexercised rights entitlements', metadata_fields: [
    { key: 'company_name', label: 'Issuing company', type: 'text', required: true },
    { key: 'company_ticker', label: 'NGX ticker', type: 'text', required: true },
    { key: 'rights_ratio', label: 'Rights ratio (e.g. 1 for 4)', type: 'text', required: true },
    { key: 'subscription_price', label: 'Subscription price (₦)', type: 'number', required: true },
    { key: 'number_of_rights', label: 'Number of rights', type: 'number', required: true },
    { key: 'rights_expiry_date', label: 'Rights expiry date', type: 'date', required: true },
    { key: 'seller_cscs_account', label: "Seller's CSCS account", type: 'text', required: true },
  ]},
  agri_commodity_forward: { label: 'Agricultural Commodity Forward', category: 'Other', description: 'Forward contract for agricultural commodities', metadata_fields: [
    { key: 'commodity_type', label: 'Commodity', type: 'select', options: ['Cocoa','Sesame','Cashew','Maize','Sorghum','Palm Oil','Groundnut','Cassava','Cotton','Other'], required: true },
    { key: 'quantity_tonnes', label: 'Quantity (metric tonnes)', type: 'number', required: true },
    { key: 'quality_grade', label: 'Quality grade/specification', type: 'text', required: true },
    { key: 'agreed_price_per_tonne', label: 'Agreed price per tonne (₦)', type: 'number', required: true },
    { key: 'delivery_date', label: 'Delivery date', type: 'date', required: true },
    { key: 'delivery_location', label: 'Delivery location/warehouse', type: 'text', required: true },
  ]},
  sukuk: { label: 'Sukuk (Secondary)', category: 'Fixed Income', description: "Secondary trade in Shari'ah-compliant instruments", metadata_fields: [
    { key: 'sukuk_name', label: 'Sukuk name/series', type: 'text', required: true },
    { key: 'issuer', label: 'Issuer', type: 'text', required: true },
    { key: 'structure_type', label: 'Sukuk structure', type: 'select', options: ['Ijarah','Murabaha','Musharakah','Wakalah','Mudarabah'], required: true },
    { key: 'face_value', label: 'Face value (₦)', type: 'number', required: true },
    { key: 'profit_rate', label: 'Profit rate (% p.a.)', type: 'number', required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
    { key: 'agreed_price', label: 'Agreed trade price (₦)', type: 'number', required: true },
  ]},
  infrastructure_bond: { label: 'Infrastructure Bond', category: 'Fixed Income', description: 'Long-dated bond for infrastructure projects', metadata_fields: [
    { key: 'bond_name', label: 'Bond name/series', type: 'text', required: true },
    { key: 'issuer', label: 'Issuer', type: 'text', required: true },
    { key: 'project_description', label: 'Underlying project', type: 'text', required: true },
    { key: 'face_value', label: 'Face value (₦)', type: 'number', required: true },
    { key: 'coupon_rate', label: 'Coupon rate (% p.a.)', type: 'number', required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
    { key: 'agreed_price', label: 'Agreed trade price (₦)', type: 'number', required: true },
    { key: 'tax_exempt', label: 'Tax exempt', type: 'select', options: ['Yes - tax exempt','No - taxable'], required: true },
  ]},
  esos: { label: 'Employee Share Options (ESOS)', category: 'Equity & Exchange-traded', description: 'Transfer of vested employee share options', metadata_fields: [
    { key: 'company_name', label: 'Company name', type: 'text', required: true },
    { key: 'option_scheme_name', label: 'Option scheme name', type: 'text', required: true },
    { key: 'number_of_options', label: 'Number of options', type: 'number', required: true },
    { key: 'exercise_price', label: 'Exercise price per share (₦)', type: 'number', required: true },
    { key: 'agreed_transfer_price', label: 'Agreed transfer price per option (₦)', type: 'number', required: true },
    { key: 'vesting_date', label: 'Vesting date', type: 'date', required: true },
    { key: 'expiry_date', label: 'Option expiry date', type: 'date', required: true },
    { key: 'company_consent', label: 'Company consent', type: 'select', options: ['Obtained','Pending','Not required'], required: true },
  ]},
  private_placement: { label: 'Private Placement', category: 'Other', description: 'Securities offered to select qualified investors', metadata_fields: [
    { key: 'issuer_name', label: 'Issuer name', type: 'text', required: true },
    { key: 'security_type', label: 'Security type', type: 'select', options: ['Ordinary shares','Preference shares','Convertible notes','Hybrid'], required: true },
    { key: 'number_of_units', label: 'Number of units offered', type: 'number', required: true },
    { key: 'price_per_unit', label: 'Price per unit (₦)', type: 'number', required: true },
    { key: 'min_subscription', label: 'Minimum subscription (₦)', type: 'number', required: true },
    { key: 'use_of_proceeds', label: 'Use of proceeds', type: 'text', required: true },
    { key: 'offer_close_date', label: 'Offer close date', type: 'date', required: true },
  ]},
  off_market: { label: 'Off-Market Trade', category: 'Other', description: 'Negotiated trade outside normal exchange mechanisms', metadata_fields: [] },
  fixed_income: { label: 'Fixed Income (General)', category: 'Fixed Income', description: 'General fixed income instrument', metadata_fields: [
    { key: 'instrument_description', label: 'Instrument description', type: 'text', required: true },
    { key: 'face_value', label: 'Face value (₦)', type: 'number', required: true },
    { key: 'return_rate', label: 'Return rate (% p.a.)', type: 'number', required: true },
    { key: 'maturity_date', label: 'Maturity date', type: 'date', required: true },
  ]},
};

export const INSTRUMENT_CATEGORIES = [
  'Equity & Exchange-traded',
  'Money Market',
  'Fixed Income',
  'Other',
];

export const DOC_LABELS: Record<string, string> = {
  term_sheet: 'Term Sheet',
  agreement: 'Transaction Agreement',
  letter_of_offer: 'Letter of Offer',
  subscription_agreement: 'Subscription Agreement',
  deed_of_assignment: 'Deed of Assignment',
  comfort_letter: 'Comfort Letter',
  information_memorandum: 'Information Memorandum',
  programme_memorandum: 'Programme Memorandum',
  dealer_agreement: 'Dealer Agreement',
  credit_rating: 'Credit Rating Certificate',
  regulatory_filing: 'SEC/FMDQ Filing Confirmation',
  board_resolution: 'Board Resolution',
  aml_declaration: 'AML/CFT Declaration',
  source_of_funds: 'Source of Funds Declaration',
  pep_declaration: 'PEP Declaration',
  beneficial_ownership: 'Beneficial Ownership Disclosure',
  cscs_instruction: 'CSCS Transfer Instruction',
  id_document: 'Identity Document',
  other: 'Other Document',
};

export function getInstrumentLabel(deal_type: string): string {
  return INSTRUMENT_CONFIG[deal_type]?.label ?? deal_type;
}

export function getInstrumentCategory(deal_type: string): string {
  return INSTRUMENT_CONFIG[deal_type]?.category ?? 'Other';
}

export function getInstrumentsByCategory(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(INSTRUMENT_CONFIG)) {
    const cat = (val as any).category;
    if (!result[cat]) result[cat] = [];
    result[cat].push(key);
  }
  return result;
}
