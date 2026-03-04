// ── 1차 풀 (고정 10종목) ──
export const SWING_POOL_1 = [
  { code: '122630', name: 'KODEX 레버리지' },
  { code: '233740', name: 'KODEX 코스닥150레버리지' },
  { code: '471760', name: 'TIGER AI반도체핵심공정' },
  { code: '487240', name: 'KODEX AI전력핵심설비' },
  { code: '463250', name: 'TIGER K방산&우주' },
  { code: '035420', name: '네이버' },
  { code: '035720', name: '카카오' },
  { code: '012450', name: '한화에어로스페이스' },
  { code: '329180', name: 'HD현대중공업' },
  { code: '034020', name: '두산에너빌리티' },
] as const;

// ── 섹터 ETF (고정 7종목) ──
export const SECTOR_ETFS = [
  { code: '091160', name: 'KODEX 반도체' },
  { code: '091180', name: 'KODEX 자동차' },
  { code: '091170', name: 'KODEX 은행' },
  { code: '117680', name: 'KODEX 철강' },
  { code: '117700', name: 'KODEX 건설' },
  { code: '305540', name: 'TIGER 2차전지테마' },
  { code: '244580', name: 'KODEX 바이오' },
] as const;

// ── ETF 키워드 (2차 풀 필터용) ──
export const ETF_KEYWORDS = [
  'KODEX', 'TIGER', 'KBSTAR', 'SOL', 'ACE', 'HANARO', 'ARIRANG',
  'KOSEF', 'KIWOOM', 'BNK', 'TIMEFOLIO', 'PLUS', 'RISE', 'WOORI',
];

// ── 매매 규칙 ──
export const TRADING_RULES = {
  swing: {
    buyAmount: 2_000_000,
    takeProfit: 7,    // +7%
    stopLoss: -3,     // -3%
    tpAlert: 6,       // 임박: +6%
    slAlert: -2,      // 임박: -2%
    clearDay: 'friday' as const,
  },
  sector: {
    buyAmount: 2_000_000,
    takeProfit: 7,    // +7%
    stopLoss: -5,     // -5%
    tpAlert: 6,       // 임박: +6%
    slAlert: -4,      // 임박: -4%
    clearDay: 'monthEnd' as const,
  },
} as const;

// ── 한투 API ──
export const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

export const KIS_TR_IDS = {
  PRICE: 'FHKST01010100',         // 현재가
  DAILY_PRICE: 'FHKST01010400',   // 일별시세
  INVESTOR: 'FHKST01010900',      // 투자자별
  PERIOD_PRICE: 'FHKST03010100',  // 기간별시세
  VOLUME_RANK: 'FHPST01710000',   // 거래량순위
  NEW_HIGH: 'FHPST01870000',      // 신고근접
  BALANCE: 'TTTC8434R',           // 잔고조회
} as const;
