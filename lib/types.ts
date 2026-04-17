// ── 잔고 ──
export interface Holding {
  code: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  evalAmt: number;
  pnl: number;
  pnlRate: number;
  change: number;
  strategy?: 'swing' | 'sector' | 'bollinger';
}

export interface BalanceSummary {
  cashBalance: number;
  d2Balance: number;
  totalPurchase: number;
  totalEval: number;
  totalPnl: number;
  totalPnlRate: number;
}

export interface BalanceResponse {
  summary: BalanceSummary;
  holdings: Holding[];
  updatedAt: string;
}

// ── 스윙 스코어링 ──
export interface SwingScores {
  vol: number;
  high: number;
  ma5: number;
  align: number;
  slope: number;
  foreign: number;
  candle: number;
  gap: number;
}

export interface SwingRaw {
  volRatio: number;
  highRatio: number;
  ma5Gap: number;
  slope: number;
  foreignDays: number;
  bullDays: number;
  gapRatio: number;
  isAligned: boolean;
}

export interface SwingStock {
  code: string;
  name: string;
  price: number;
  pool: '1차' | '2차';
  pass: boolean;
  score: number;
  scores: SwingScores;
  raw: SwingRaw;
  error?: string;
}

// ── 무한매수법 ──
export interface InfiniteBuyCycle {
  id: string;
  cycle_num: number;
  ticker: string;
  start_date: string;
  end_date: string | null;
  total_slots: number;
  used_slots: number;
  initial_fund_krw: number;
  initial_fund_usd: number | null;
  slot_amount_usd: number | null;
  status: 'active' | 'completed' | 'stopped';
  total_invested_usd: number | null;
  total_sell_usd: number | null;
  profit_usd: number | null;
  profit_rate: number | null;
  created_at: string;
}

export interface InfiniteBuyJournal {
  id: string;
  cycle_num: number;
  record_type: 'buy' | 'sell' | 'exchange';
  ticker: string;
  trade_date: string;
  slot_num: number | null;
  price: number | null;
  quantity: number | null;
  amount_usd: number | null;
  amount_krw: number | null;
  exchange_rate: number | null;
  notes: string | null;
  created_at: string;
}

// ── 매매일지 ──
export interface JournalEntry {
  id: string;
  strategy: 'swing' | 'sector' | 'bollinger';
  ticker_code: string;
  ticker_name: string;
  buy_date: string;
  buy_price: number;
  buy_qty: number;
  buy_amount: number;
  sell_date: string | null;
  sell_price: number | null;
  sell_amount: number | null;
  profit_loss: number | null;
  profit_rate: number | null;
  close_reason: string | null;
  pool_type: string | null;
  notes: string | null;
  created_at: string;
}

