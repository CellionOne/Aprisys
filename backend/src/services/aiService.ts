import Anthropic from '@anthropic-ai/sdk';
import { queryOne, query } from '../db/client.js';
import { logEvent } from './audit.js';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}
const MODEL = 'claude-sonnet-4-5';

async function callClaude(system: string, userContent: string, maxTokens = 2048): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userContent }],
  });
  const content = response.content[0];
  return content.type === 'text' ? content.text : '';
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

// 1. Deal structure from plain text description
export async function getDealStructure(description: string, actor_id?: string) {
  const system = `You are a Nigerian capital markets deal structuring expert with deep knowledge of NGX, SEC regulations, and market practices. Analyse the deal description and return ONLY valid JSON with exactly this structure: {"deal_type":"equity|tbill|bond|private_placement|off_market|fixed_income","asset_ticker":"ticker or null","suggested_quantity":number,"suggested_price":number,"suggested_total":number,"conditions":[{"id":"cond_1","description":"description","type":"type"}],"suggested_expiry_days":number,"commission_pct":number,"reasoning":"brief explanation"}`;
  const result = await callClaude(system, description);
  await logEvent('ai.request', actor_id ?? null, null, null, null, { feature: 'deal_structure', input_length: description.length });
  return parseJson(result);
}

// 2. Term sheet generation
export async function generateTermSheet(deal_id: string, actor_id?: string) {
  const deal = await queryOne<Record<string, unknown>>('SELECT * FROM cdi.deals WHERE id = $1', [deal_id]);
  if (!deal) throw new Error('Deal not found');

  const parties = await query<Record<string, unknown>>(
    `SELECT dp.role, s.name, s.email, s.account_type
     FROM cdi.deal_parties dp
     JOIN digest.subscribers s ON s.id = dp.subscriber_id
     WHERE dp.deal_id = $1 AND dp.status = 'accepted'`,
    [deal_id]
  );

  const system = `You are a Nigerian capital markets legal expert. Generate a formal term sheet following Nigerian SEC and NGX standards. Include all standard sections: Parties, Asset Description, Transaction Details, Conditions Precedent, Settlement Terms (T+3 standard for NGX equities), Governing Law (Laws of the Federation of Nigeria), Dispute Resolution (Lagos State arbitration), and Signatures Block. Be specific and professional. Return plain text with clear section headers.`;

  const content = `Generate a term sheet for this deal:\n${JSON.stringify({ deal, parties }, null, 2)}`;
  const result = await callClaude(system, content, 4096);
  await logEvent('ai.request', actor_id ?? null, null, 'deal', deal_id, { feature: 'term_sheet' });
  return result;
}

// 3. Risk scoring
export async function scoreDealRisk(deal_id: string, actor_id?: string) {
  const deal = await queryOne<Record<string, unknown>>('SELECT * FROM cdi.deals WHERE id = $1', [deal_id]);
  if (!deal) throw new Error('Deal not found');

  const [creatorHistory] = await query<{ total: string; completed: string; disputed: string }>(
    `SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) FILTER (WHERE status = 'disputed') as disputed
     FROM cdi.deals WHERE created_by = $1`,
    [deal.created_by as string]
  );

  const cieScore = deal.asset_ticker ? await queryOne<{ ias: number; rs: number }>(
    `SELECT ias, rs FROM public.cie_scores WHERE ticker = $1 ORDER BY score_date DESC LIMIT 1`,
    [deal.asset_ticker]
  ) : null;

  const system = `You are a financial risk analyst specialising in Nigerian capital markets. Score this deal's risk from 1-10 (1=lowest risk, 10=highest). Consider: counterparty history, deal structure, market conditions, asset quality, and time to expiry. Return ONLY valid JSON: {"risk_score":number,"risk_level":"low|medium|high","risk_factors":[{"factor":"name","description":"detail","weight":"low|medium|high"}],"recommendation":"brief recommendation"}`;

  const content = JSON.stringify({ deal, creator_history: creatorHistory, cie_score: cieScore });
  const result = await callClaude(system, content);
  await logEvent('ai.request', actor_id ?? null, null, 'deal', deal_id, { feature: 'risk_score' });
  return parseJson(result);
}

// 4. Counterparty matching
export async function matchCounterparties(deal_id: string, actor_id?: string) {
  const deal = await queryOne<Record<string, unknown>>('SELECT * FROM cdi.deals WHERE id = $1', [deal_id]);
  if (!deal) throw new Error('Deal not found');

  const candidates = await query<Record<string, unknown>>(
    `SELECT s.id, s.name, s.account_type,
            COUNT(DISTINCT dp.deal_id) as deal_count,
            AVG(cr.score) as avg_rating
     FROM digest.subscribers s
     LEFT JOIN cdi.deal_parties dp ON dp.subscriber_id = s.id AND dp.status = 'accepted'
     LEFT JOIN cdi.counterparty_ratings cr ON cr.rated_id = s.id
     WHERE s.kyc_status = 'verified'
       AND s.account_status = 'active'
       AND s.id != $1
     GROUP BY s.id, s.name, s.account_type
     ORDER BY deal_count DESC, avg_rating DESC
     LIMIT 10`,
    [deal.created_by as string]
  );

  const system = `You are a Nigerian capital markets expert. Based on the deal details and candidate profiles, suggest the 3 best counterparties. Return ONLY valid JSON: {"matches":[{"subscriber_id":"id","name":"name","account_type":"type","reasoning":"why they are a good match","confidence":"high|medium|low"}]}`;

  const content = JSON.stringify({ deal, candidates });
  const result = await callClaude(system, content);
  await logEvent('ai.request', actor_id ?? null, null, 'deal', deal_id, { feature: 'counterparty_match' });
  return parseJson(result);
}

// 5. Deal room summariser
export async function summariseDealRoom(deal_id: string, actor_id?: string) {
  const messages = await query<Record<string, unknown>>(
    `SELECT dm.message, dm.message_type, dm.created_at, s.name as sender_name
     FROM cdi.deal_messages dm
     JOIN digest.subscribers s ON s.id = dm.sender_id
     WHERE dm.deal_id = $1
     ORDER BY dm.created_at ASC`,
    [deal_id]
  );

  if (messages.length === 0) return { summary: 'No messages yet.', key_points_agreed: [], open_issues: [], last_proposed_terms: {}, deal_progress: 'early' };

  const system = `You are a Nigerian capital markets deal assistant. Summarise this deal room negotiation thread. Return ONLY valid JSON: {"summary":"2-3 sentence summary","key_points_agreed":["point1"],"open_issues":["issue1"],"last_proposed_terms":{},"deal_progress":"early|mid|near_completion"}`;

  const content = messages.map(m => `[${m.sender_name} at ${m.created_at}]: ${m.message}`).join('\n');
  const result = await callClaude(system, content);
  await logEvent('ai.request', actor_id ?? null, null, 'deal', deal_id, { feature: 'room_summary' });
  return parseJson(result);
}

// 6. Document analyser
export async function analyseDocument(document_text: string, actor_id?: string) {
  const system = `You are a Nigerian capital markets compliance expert. Analyse this financial document. Return ONLY valid JSON: {"key_terms":[{"term":"name","value":"value"}],"red_flags":[{"issue":"description","severity":"low|medium|high"}],"missing_fields":["field1"],"market_deviation_notes":["note1"],"overall_assessment":"brief assessment"}`;

  const result = await callClaude(system, document_text.slice(0, 8000), 2048);
  await logEvent('ai.request', actor_id ?? null, null, null, null, { feature: 'document_analysis', doc_length: document_text.length });
  return parseJson(result);
}

// 7. Market context for deal creation
export async function getMarketContext(ticker: string, actor_id?: string) {
  const [score] = await query<Record<string, unknown>>(
    `SELECT ias, rs, cs, score_date FROM public.cie_scores WHERE ticker = $1 ORDER BY score_date DESC LIMIT 1`,
    [ticker]
  );

  const prices = await query<Record<string, unknown>>(
    `SELECT trade_date, close, volume FROM public.cie_daily_prices WHERE ticker = $1 ORDER BY trade_date DESC LIMIT 5`,
    [ticker]
  );

  const signals = await query<Record<string, unknown>>(
    `SELECT headline, type, priority, published_at FROM public.cie_signals WHERE ticker = $1 ORDER BY published_at DESC LIMIT 3`,
    [ticker]
  );

  const security = await queryOne<{ name: string; sector: string }>(
    'SELECT name, sector FROM public.cie_securities WHERE ticker = $1',
    [ticker]
  );

  const system = `You are a Nigerian equity market analyst. Provide concise market context for a deal being structured on this security. Return ONLY valid JSON: {"ias_score":number,"ias_trend":"improving|stable|declining","fair_value_range":{"low":number,"high":number},"recent_signals":["signal1"],"sector_sentiment":"bullish|neutral|bearish","ai_commentary":"2-3 sentences of market context"}`;

  const content = JSON.stringify({ ticker, security, score, prices, signals });
  const result = await callClaude(system, content);
  await logEvent('ai.request', actor_id ?? null, null, 'security', null, { feature: 'market_context', ticker });
  return parseJson(result);
}

// 8. Negotiation suggestion
export async function getNegotiationSuggestion(deal_id: string, latest_message: string, actor_id?: string) {
  const deal = await queryOne<Record<string, unknown>>('SELECT * FROM cdi.deals WHERE id = $1', [deal_id]);
  const recentMessages = await query<Record<string, unknown>>(
    `SELECT dm.message, dm.message_type, s.name as sender_name
     FROM cdi.deal_messages dm
     JOIN digest.subscribers s ON s.id = dm.sender_id
     WHERE dm.deal_id = $1 ORDER BY dm.created_at DESC LIMIT 10`,
    [deal_id]
  );

  const system = `You are a Nigerian capital markets deal negotiation assistant. Based on the deal context and recent messages, suggest a professional response. Return ONLY valid JSON: {"suggested_response":"the suggested message text","tone":"firm|collaborative|urgent","market_data_points":["data point to reference"],"reasoning":"why this approach"}`;

  const content = JSON.stringify({ deal, recent_messages: recentMessages.reverse(), latest_message });
  const result = await callClaude(system, content);
  await logEvent('ai.request', actor_id ?? null, null, 'deal', deal_id, { feature: 'negotiation_suggest' });
  return parseJson(result);
}

// 9. Daily digest commentary
export async function generateDigestCommentary(marketData: Record<string, unknown>): Promise<string> {
  const system = `You are a senior Nigerian equity market analyst writing for professional investors and sophisticated retail subscribers. Write a 3-paragraph daily market commentary covering: (1) overall market direction and key index drivers, (2) sector highlights and notable securities, (3) forward outlook and key risks or catalysts to watch. Be factual, data-driven, and authoritative. Avoid generic statements. Return plain text only.`;
  const result = await callClaude(system, JSON.stringify(marketData), 1024);
  return result;
}
