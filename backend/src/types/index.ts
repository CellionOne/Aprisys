export type AccountType = 'retail' | 'qualified' | 'broker' | 'fund_manager' | 'corporate' | 'institutional' | 'admin';
export type KycStatus = 'pending' | 'submitted' | 'under_review' | 'verified' | 'rejected';
export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type Plan = 'free' | 'standard' | 'pro' | 'broker' | 'institutional';
export type SubscriptionStatus = 'active' | 'grace' | 'suspended' | 'cancelled';
export type DealType = 'equity' | 'tbill' | 'bond' | 'private_placement' | 'off_market' | 'fixed_income';
export type DealStatus = 'draft' | 'open' | 'funded' | 'verified' | 'completed' | 'failed' | 'expired' | 'disputed';
export type DealVisibility = 'private' | 'invite_only' | 'marketplace';
export type PartyRole = 'creator' | 'buyer' | 'seller' | 'broker' | 'co_broker' | 'observer';
export type PartyStatus = 'invited' | 'accepted' | 'declined' | 'removed';
export type EscrowStatus = 'pending' | 'funded' | 'conditions_checking' | 'releasing' | 'released' | 'refunding' | 'refunded' | 'disputed' | 'failed';
export type MessageType = 'text' | 'system' | 'ai_summary' | 'document' | 'terms_proposal';
export type DocumentType = 'term_sheet' | 'agreement' | 'id_document' | 'board_resolution' | 'other';
export type NotificationType = 
  'kyc_approved' | 'kyc_rejected' | 'deal_invited' | 'deal_accepted' | 'deal_declined' |
  'deal_completed' | 'escrow_funded' | 'escrow_released' | 'escrow_disputed' |
  'document_uploaded' | 'document_signed' | 'terms_accepted' | 'eoi_received' |
  'account_suspended' | 'rating_prompt' | 'subscription_activated';

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  phone?: string;
  password_hash?: string;
  google_id?: string;
  email_verified: boolean;
  account_type: AccountType;
  kyc_status: KycStatus;
  account_status: AccountStatus;
  suspension_reason?: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  subscriber_id: string;
  plan: Plan;
  status: SubscriptionStatus;
  paystack_sub_code?: string;
  current_period_end?: string;
  grace_until?: string;
}

export interface KycRecord {
  id: string;
  subscriber_id: string;
  version: number;
  entity_type: string;
  nin?: string;
  bvn?: string;
  cac_number?: string;
  tin?: string;
  sec_licence?: string;
  ngx_membership?: string;
  cscs_code?: string;
  net_worth_declaration?: string;
  investment_experience?: string;
  required_signatories: number;
  documents: KycDocument[];
  status: KycStatus;
  reviewed_by?: string;
  review_notes?: string;
  rejection_reason?: string;
  submitted_at?: string;
  verified_at?: string;
}

export interface KycDocument {
  storage_key: string;
  filename: string;
  file_size: number;
  mime_type: string;
  document_label: string;
  uploaded_at: string;
}

export interface Deal {
  id: string;
  reference: string;
  created_by: string;
  title: string;
  deal_type: DealType;
  asset_ticker?: string;
  asset_name?: string;
  quantity?: number;
  unit_price?: number;
  total_value?: number;
  currency: string;
  conditions: DealCondition[];
  expiry_at?: string;
  status: DealStatus;
  visibility: DealVisibility;
  cie_risk_score?: number;
  ai_term_sheet?: string;
  commission_pct: number;
  required_signatories: number;
  terms_locked: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DealCondition {
  id: string;
  description: string;
  type: string;
  met: boolean;
  met_at?: string;
  met_by?: string;
  evidence?: string;
}

export interface DealParty {
  id: string;
  deal_id: string;
  subscriber_id: string;
  role: PartyRole;
  status: PartyStatus;
  eoi_submitted: boolean;
  commission_pct: number;
  invited_at: string;
  responded_at?: string;
}

export interface DealMessage {
  id: string;
  deal_id: string;
  sender_id: string;
  message: string;
  message_type: MessageType;
  terms_proposal_status?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface DealDocument {
  id: string;
  deal_id: string;
  uploaded_by: string;
  filename: string;
  storage_key: string;
  file_size?: number;
  mime_type?: string;
  document_type?: DocumentType;
  ai_analysis?: Record<string, unknown>;
  version: number;
  created_at: string;
}

export interface EscrowTransaction {
  id: string;
  deal_id: string;
  funded_by: string;
  amount: number;
  currency: string;
  status: EscrowStatus;
  paystack_reference?: string;
  conditions: DealCondition[];
  funded_at?: string;
  released_at?: string;
  refunded_at?: string;
  release_triggered_by?: string;
  admin_notes?: string;
}

export interface Notification {
  id: string;
  subscriber_id: string;
  type: NotificationType;
  title: string;
  body: string;
  entity_type?: string;
  entity_id?: string;
  read_at?: string;
  created_at: string;
}

export interface MarketPulse {
  id: string;
  trade_date: string;
  asi: number;
  asi_change: number;
  asi_change_pct: number;
  advancing: number;
  declining: number;
  unchanged: number;
  turnover: number;
  volume: number;
  deals: number;
  commentary?: string;
}

export interface SecurityScore {
  ticker: string;
  name: string;
  sector?: string;
  ias: number;
  rs: number;
  cs: number;
  close?: number;
  close_change_pct?: number;
}

export interface Signal {
  id: string;
  ticker?: string;
  type?: string;
  headline: string;
  body?: string;
  priority: 'low' | 'medium' | 'high';
  published_at: string;
}

// Express augmentation
declare global {
  namespace Express {
    interface Request {
      subscriber?: Subscriber & { plan: Plan; subscription_status: SubscriptionStatus };
    }
  }
}
