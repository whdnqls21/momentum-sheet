# 무한매수법 시트 구현 작업 지시서

## 1. 작업 개요

MomentumSheet에 **"무한매수"** + **"무한매수 일지"** 2개 시트를 추가한다.
TQQQ/SOXL 중 추천 종목 선정, 사이클 현황 대시보드, 매수/매도가 자동 계산, 매매일지를 제공.

---

## 2. 작업 전 코드베이스 파악

- 기존 페이지 구조 (app/bollinger/page.tsx 등 Excel 스타일 참고)
- lib/kis-api.ts — KIS API 호출 유틸
- lib/constants.ts — 상수 관리
- docs/kis-api-reference.md — API 레퍼런스

---

## 3. 해외주식 API 레퍼런스

### 3-1. 해외주식 현재가상세 (HHDFS76200200)

- **Method**: GET
- **URL**: `/uapi/overseas-price/v1/quotations/price-detail`
- **tr_id**: `HHDFS76200200`

**Query Params:**
```json
{ "AUTH": "", "EXCD": "NAS", "SYMB": "TQQQ" }
```

**Response output 주요 필드:**
- `last`: 현재가
- `base`: 전일종가
- `h52p`: 52주최고가
- `l52p`: 52주최저가
- `t_rate`: 당일환율

### 3-2. 해외주식 잔고 (TTTS3012R)

- **Method**: GET
- **URL**: `/uapi/overseas-stock/v1/trading/inquire-balance`
- **tr_id**: `TTTS3012R`

**Query Params:**
```json
{
  "CANO": "계좌번호 앞 8자리",
  "ACNT_PRDT_CD": "01",
  "OVRS_EXCG_CD": "NASD",
  "TR_CRCY_CD": "USD",
  "CTX_AREA_FK200": "",
  "CTX_AREA_NK200": ""
}
```

**Response output1 주요 필드:**
- `ovrs_pdno`: 종목코드 (TQQQ)
- `pchs_avg_pric`: 매입평균가격 (= 평단가)
- `ovrs_cblc_qty`: 보유수량
- `frcr_pchs_amt1`: 외화매입금액
- `ovrs_stck_evlu_amt`: 평가금액
- `frcr_evlu_pfls_amt`: 외화평가손익
- `evlu_pfls_rt`: 평가손익율
- `now_pric2`: 현재가

### 3-3. 해외주식 기간별시세 (HHDFS76240000)

- **Method**: GET
- **URL**: `/uapi/overseas-price/v1/quotations/dailyprice`
- **tr_id**: `HHDFS76240000`

**Query Params:**
```json
{
  "AUTH": "", "EXCD": "NAS", "SYMB": "TQQQ",
  "GUBN": "0", "BYMD": "", "MODP": "1"
}
```

**Response output2 배열:** `xymd`(일자), `clos`(종가), `open`(시가), `high`(고가), `low`(저가)

---

## 4. Supabase 테이블

### 4-1. infinite_buy_journal

```sql
CREATE TABLE IF NOT EXISTS infinite_buy_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_num INTEGER NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('buy', 'sell', 'exchange')),
  ticker TEXT NOT NULL,
  trade_date DATE NOT NULL,
  slot_num INTEGER,
  price NUMERIC(10,2),
  quantity INTEGER,
  amount_usd NUMERIC(12,2),
  amount_krw INTEGER,
  exchange_rate NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

> quantity는 정수(INTEGER) — 소수점 거래 불가.

### 4-2. infinite_buy_cycle

```sql
CREATE TABLE IF NOT EXISTS infinite_buy_cycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_num INTEGER NOT NULL UNIQUE,
  ticker TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  total_slots INTEGER DEFAULT 40,
  used_slots INTEGER DEFAULT 0,
  initial_fund_krw INTEGER NOT NULL,
  initial_fund_usd NUMERIC(12,2),
  slot_amount_usd NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
  total_invested_usd NUMERIC(12,2) DEFAULT 0,
  total_sell_usd NUMERIC(12,2),
  profit_usd NUMERIC(12,2),
  profit_rate NUMERIC(8,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. 매매 로직 (핵심)

### 5-1. 매수 로직

```typescript
const slotAmount = cycle.slot_amount_usd; // 1칸 금액 ($69.44)
const avgPrice = balance.pchs_avg_pric;   // 평단가 (잔고 API)
const currentPrice = priceDetail.last;    // 현재가

if (보유수량 === 0) {
  // 첫 매수: 현재가 LOC
  const shares = Math.floor(slotAmount / currentPrice);
  return [{ type: "현재가 LOC", price: currentPrice, shares }];
}

if (currentPrice > avgPrice) {
  // 현재가 > 평단가
  const sharesPerSlot = Math.floor(slotAmount / currentPrice);
  
  if (sharesPerSlot >= 2) {
    // 2주 이상 → 5:5 분할
    const halfShares = Math.floor(sharesPerSlot / 2);
    return [
      { type: "평단가 LOC", price: avgPrice, shares: halfShares, desc: "종가 ≤ 평단가일 때 체결" },
      { type: "확보용 LOC", price: avgPrice * 1.15, shares: halfShares, desc: "급등장 확보" }
    ];
  } else {
    // 1주만 가능 → 확보용 LOC 1주
    return [
      { type: "확보용 LOC", price: avgPrice * 1.15, shares: 1, desc: "1칸 2주 미만 → 확보용 1주" }
    ];
  }
} else {
  // 현재가 < 평단가 → 현재가 LOC
  const shares = Math.floor(slotAmount / currentPrice);
  return [
    { type: "현재가 LOC", price: currentPrice, shares: Math.max(shares, 1), desc: "평단가 낮추기" }
  ];
}
```

### 5-2. 매도 로직

```typescript
// 평단가 × 1.10 전량 지정가 매도
const targetSellPrice = (avgPrice * 1.10).toFixed(2);
const totalShares = balance.ovrs_cblc_qty; // 전량

return {
  type: "전량 익절",
  price: targetSellPrice,
  shares: totalShares,
  desc: "평단가 × 1.10"
};
```

---

## 6. API Routes

### 6-1. 사이클 시작 추천: `GET /api/infinite/recommend/route.ts`

TQQQ, SOXL 비교 → 추천.

**추천 점수 계산:**

| 기준 | 가중치 | 계산 |
|--|--|--|
| 52주 고점 대비 하락률 | 40% | 하락률 클수록 점수 높음 (0~100 스케일링) |
| RSI(14) | 30% | RSI 낮을수록 점수 높음 (100-RSI) |
| 1칸 매수 가능 여부 | 20% | 1주 이상=100, 0주=0 |
| 최근 1M 낙폭 | 10% | 낙폭 클수록 점수 높음 |

> 1칸으로 1주도 못 사면 해당 종목 자동 제외 (필수 조건).

**RSI(14) 계산:** 기간별시세 API에서 최근 15일 종가 → RSI 계산.

**응답:**
```json
{
  "tqqq": {
    "ticker": "TQQQ", "price": 50.66,
    "high52": 60.69, "low52": 20.12, "dropFromHigh": -16.5,
    "rsi14": 52.3, "sharesPerSlot": 1, "month1Return": -8.2,
    "score": 72, "buyable": true
  },
  "soxl": { ... },
  "recommendation": {
    "ticker": "TQQQ",
    "reason": "52주 고점 대비 여유(-16.5%), RSI 적정(52.3), 1칸 1주 매수 가능"
  },
  "params": {
    "totalFundKRW": 4000000, "exchangeRate": 1440,
    "totalFundUSD": 2777.78, "slotAmountUSD": 69.44
  }
}
```

### 6-2. 현황 + 주문 계산: `GET /api/infinite/status/route.ts`

잔고 API + 현재가 API + 사이클 정보 → 현황 + 오늘의 주문 자동 계산.

**응답:**
```json
{
  "cycle": {
    "cycleNum": 1, "ticker": "TQQQ", "startDate": "2026-04-08",
    "usedSlots": 5, "totalSlots": 40, "slotAmountUSD": 69.44
  },
  "balance": {
    "avgPrice": 48.50, "quantity": 7,
    "investedUSD": 339.50, "currentPrice": 50.66,
    "evalUSD": 354.62, "profitUSD": 15.12, "profitRate": 4.45
  },
  "todayOrders": {
    "condition": "현재가 > 평단가, 1칸 1주 → 확보용 LOC 1주",
    "buyOrders": [
      { "type": "확보용 LOC", "price": 55.78, "shares": 1, "desc": "평단가 × 1.15" }
    ],
    "sellOrder": {
      "type": "전량 익절", "price": 53.35, "shares": 7, "desc": "평단가 × 1.10"
    }
  },
  "exchangeRate": 1440
}
```

### 6-3. 매매일지 CRUD: `/api/infinite/journal/route.ts`

- **GET**: `?cycle=1` (특정 사이클) 또는 `?cycle=all` (전체)
- 정렬: `trade_date DESC, created_at DESC` (최신순)
- **POST**: 매수/매도/환전 기록 추가

### 6-4. 사이클 관리: `/api/infinite/cycle/route.ts`

- **GET**: 활성 사이클 + 전체 사이클 목록
- **POST**: 새 사이클 시작
- **PATCH**: 사이클 완료 처리 (status → completed, end_date 설정)

---

## 7. 시트 1: 무한매수 (`app/infinite/page.tsx`)

### 7-1. 사이클 미시작 상태 — 추천 화면

```
툴바: [▶ 추천 조회] [📋 전략 규칙]
      투자금: 4,000,000원 | 환율: 1,440원 | = $2,777.78 | 1칸: $69.44

── 사이클 시작 추천 — TQQQ vs SOXL ──────────
┌──────────────────┬──────────────────┐
│ TQQQ ✅ 추천     │ SOXL ❌ 비추     │
│ 현재가    $50.66 │ 현재가    $85.31 │
│ 고점대비  -16.5% │ 고점대비  -0.8%  │
│ 52주범위  $20~60 │ 52주범위  $8~85  │
│ RSI(14)   52.3   │ RSI(14)   74.0   │
│ 1칸매수   1주 ✅ │ 1칸매수   0주 ❌ │
│ 1M수익   -8.2%   │ 1M수익   +15.3%  │
│ 점수      72     │ 점수      35     │
└──────────────────┴──────────────────┘
💡 TQQQ 추천 — 고점 대비 여유, RSI 적정, 1칸 1주 가능
              [TQQQ로 사이클 시작]
```

좌우 비교 테이블. 추천 종목 쪽 배경 연한 노랑(#FFFDE7).
비추 종목은 opacity 낮게.

### 7-2. 사이클 진행 중 — 현황 + 주문

```
툴바: [▶ 현재가 조회] [📋 전략 규칙] [사이클 완료]
      갱신: 오후 10:32

── 사이클 #1 현황 (TQQQ) ──────────────────
| 시작일     | 2026-04-08   | 슬롯        | 5 / 40 (12.5%)    |
| 평단가     | $48.50       | 현재가      | $50.66 (+4.45%)   |
| 보유 수량  | 7주          | 목표매도가  | $53.35 (평단×1.10) |
| 투자금     | $339.50      | 평가금액    | $354.62           |
| 평가손익   | +$15.12      | ≈ 원화 환산 | ≈ +21,773원 @1440 |
| 1칸 금액   | $69.44       | 잔여 슬롯   | 35칸              |

── 오늘의 주문 — 현재가 $50.66 > 평단가 $48.50 ──
판단: 현재가 > 평단가 → 1칸($69.44)÷현재가($50.66)=1주 → 2주 미만 → 확보용 LOC 1주

매수 주문:
| 구분       | 주문가  | 수량 | 금액   | 설명                    |
| 확보용 LOC | $55.78 | 1주  | $55.78 | 평단가 × 1.15           |

예약 매도 주문:
| 구분     | 목표가  | 수량 | 예상금액 | 설명               |
| 전량익절 | $53.35 | 7주  | $373.45 | 평단가 × 1.10 전량  |

참고: 현재가 < 평단가인 경우
  → 1회분 전량: 현재가 LOC. 1칸÷현재가=N주 매수.
```

### 7-3. 사이클 완료 처리

[사이클 완료] 버튼 → 확인 모달:
- 매도 체결 확인 메시지
- 수익 요약 표시
- 확인 시 infinite_buy_cycle 상태 → completed

---

## 8. 시트 2: 무한매수 일지 (`app/infinite-journal/page.tsx`)

### 8-1. 툴바

```
[기록 추가] 매수/매도/환전
                              사이클: [사이클 #2 (진행중) ▾]
                                      사이클 #1 (완료)
                                      전체
```

기본값: 현재 활성 사이클. "전체" 선택 시 모든 사이클 통합.

### 8-2. 사이클별 수익 현황

항상 표시 (필터 무관). 모든 사이클 요약.

```
| 사이클 | 종목 | 기간           | 슬롯 | 투자($) | 수익($)  | 수익률 | ≈수익(₩)  |
| #2     | TQQQ | 05/02~진행중  | 3/40 | $207   | +$8.40  | +4.1% | ≈+12,096 |
| #1     | TQQQ | 04/08~04/28  | 8/40 | $520   | +$52.00 | +10.0%| ≈+74,880 |
| 합계   |      |              |      | $727   | +$60.40 | +8.3% | ≈+86,976 |
```

- 진행중 사이클: 수익 = 미실현 손익 (잔고 API 기준)
- 완료 사이클: 수익 = 실현 손익 (매도금액 - 매수합계)
- 원화 환산: 현재 환율 기준 참고용

### 8-3. 매매일지

정렬: **최신순** (trade_date DESC, created_at DESC).

**"전체" 선택 시:** 사이클 구분선으로 그룹핑.

```
─── 사이클 #2 (TQQQ) — 진행중 ───  (초록 배경)
| 05/06 | 매수 | $52.30 | 1 | $52.30 | -         | 3   | 확보용 LOC    |
| 05/05 | 매수 | $48.10 | 1 | $48.10 | -         | 2   | 현재가 LOC    |
| 05/02 | 환전 | -      | - | $694   | 1,000,000 | -   | 2차 환전 @1440|
| 05/02 | 매수 | $49.20 | 1 | $49.20 | -         | 1   | 현재가 LOC    |

─── 사이클 #1 (TQQQ) — 완료 | 수익: +$52.00 (+10.0%) ─── (주황 배경)
| 04/28 | 매도 | $71.50 | 8 | $572   | -         | -   | 전량 익절     |
| 04/21 | 매수 | $63.80 | 1 | $63.80 | -         | 8   | 확보용 LOC    |
| ...   |      |        |   |        |           |     |              |
| 04/08 | 환전 | -      | - | $694   | 1,000,000 | -   | 1차 환전 @1440|
| 04/08 | 매수 | $50.20 | 1 | $50.20 | -         | 1   | 현재가 LOC    |
```

**특정 사이클 선택 시:** 구분선 없이 해당 사이클만 표시.

**유형별 스타일:**
- 매수: 초록 태그 (#c6efce)
- 매도: 진한 초록 태그 (#006100, 흰 텍스트) + 행 배경 연초록
- 환전: 파랑 태그 (#D6E4F0) + 행 배경 연파랑 (#E3F2FD)

### 8-4. 환전 내역 합산

매매일지 하단에 별도 섹션. 환전 기록만 모아서 합산.

```
── 환전 내역 합산 ───────────────────
| 일자  | 원화(₩)   | 달러($)  | 환율  | 메모     |
| 05/02 | 1,000,000 | $694.44 | 1,440 | 2차 환전 |
| 04/08 | 1,000,000 | $694.44 | 1,440 | 1차 환전 |
| 합계  | 2,000,000 | $1,388  | 평균 1,440 |        |
```

### 8-5. 기록 추가 폼

[기록 추가] 클릭 → 모달:

```
유형: (매수) (매도) (환전)  — 라디오

매수/매도 선택 시:
  일자: [____]
  단가($): [____]
  수량: [____] (정수만)
  슬롯: [____]
  메모: [____]
  금액: 자동 계산 (단가 × 수량)

환전 선택 시:
  일자: [____]
  원화(₩): [____]
  달러($): [____]
  환율: [____] (원화÷달러 자동 계산 또는 직접 입력)
  메모: [____]
```

---

## 9. 네비게이션 순서

```
무한매수 | 무한매수 일지 | 잔고현황 | 단기스윙 | 섹터로테이션 | 볼린저 | 매매일지 | 성과분석
```

무한매수 관련 시트를 맨 앞에 배치.

---

## 10. 전략 규칙 모달

[📋 전략 규칙] 버튼 → 모달. 기존 전략 규칙 모달 패턴 재활용.

```
📋 무한매수법 전략 규칙

── 기본 ──
종목: TQQQ 또는 SOXL (사이클 시작 시 선택)
투자금: 400만원, 40칸 균등 분할
1칸: 투자금(USD) ÷ 40

── 매수 (매일 저녁) ──
보유 없음:
  → 현재가 LOC (1칸 금액 ÷ 현재가 = N주)
현재가 > 평단가:
  1칸으로 2주↑ 가능 → 5:5 분할
    0.5회분 → 평단가 LOC (종가 ≤ 평단가 시 체결)
    0.5회분 → 확보용 LOC (평단가 × 1.15)
  1칸으로 1주만 가능 → 확보용 LOC 1주 (평단가 × 1.15)
현재가 < 평단가:
  → 현재가 LOC (1칸 금액 ÷ 현재가 = N주)

── 매도 (매일 저녁) ──
평단가 × 1.10 전량 지정가 매도
장중 도달 시 즉시 체결, 미달 시 장 마감 후 자동 취소

── 사이클 완료 ──
익절 체결 → 원금 재설정 → 즉시 재시작 (무한 반복)

── 손절 없음 ──
40칸 소진까지 보유 유지
나스닥 장기 우상향 전제
```

---

## 11. docs/kis-api-reference.md 업데이트

아래 3개 API 추가 (본 문서 3번 내용):

### 11. 해외주식 현재가상세 (HHDFS76200200)
### 12. 해외주식 잔고 (TTTS3012R)
### 13. 해외주식 기간별시세 (HHDFS76240000)

---

## 12. 주의사항

- **소수점 거래 불가**: quantity는 반드시 INTEGER. Math.floor 사용.
- 해외주식 API는 EXCD(거래소)가 API별로 다름:
  - 현재가상세: `EXCD=NAS`
  - 잔고: `OVRS_EXCG_CD=NASD`
  - 기간별시세: `EXCD=NAS`
- 가격은 소수점 2자리 (USD)
- 환율은 현재가상세 API의 `t_rate` 필드
- 미국장 시간: KST 23:30~06:00 (서머타임 22:30~05:00)
- 잔고 API는 장 종료 후 데이터 확정
- 보유 종목 없으면 잔고 API output1이 빈 배열 → 사이클 시작 추천 화면 표시
- 기존 journal 테이블과 별도 테이블 사용 (infinite_buy_journal)
- 매매일지 정렬: 최신순 (DESC)
- 사이클 필터 기본값: 현재 활성 사이클

---

## 13. Supabase 사전 작업 (사용자 실행)

```sql
CREATE TABLE IF NOT EXISTS infinite_buy_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_num INTEGER NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('buy', 'sell', 'exchange')),
  ticker TEXT NOT NULL,
  trade_date DATE NOT NULL,
  slot_num INTEGER,
  price NUMERIC(10,2),
  quantity INTEGER,
  amount_usd NUMERIC(12,2),
  amount_krw INTEGER,
  exchange_rate NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS infinite_buy_cycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_num INTEGER NOT NULL UNIQUE,
  ticker TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  total_slots INTEGER DEFAULT 40,
  used_slots INTEGER DEFAULT 0,
  initial_fund_krw INTEGER NOT NULL,
  initial_fund_usd NUMERIC(12,2),
  slot_amount_usd NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
  total_invested_usd NUMERIC(12,2) DEFAULT 0,
  total_sell_usd NUMERIC(12,2),
  profit_usd NUMERIC(12,2),
  profit_rate NUMERIC(8,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 14. 완료 조건

### Supabase (사용자)
- [ ] infinite_buy_journal 테이블 생성
- [ ] infinite_buy_cycle 테이블 생성

### API
- [ ] docs/kis-api-reference.md에 해외주식 API 3개 추가
- [ ] `/api/infinite/recommend/route.ts` — TQQQ vs SOXL 비교 추천
- [ ] `/api/infinite/status/route.ts` — 현황 + 주문 자동 계산
- [ ] `/api/infinite/journal/route.ts` — 매매일지 CRUD
- [ ] `/api/infinite/cycle/route.ts` — 사이클 관리

### 시트 1: 무한매수
- [ ] 사이클 미시작 → 추천 화면 (TQQQ vs SOXL 좌우 비교)
- [ ] 사이클 진행 중 → 현황 대시보드 (잔고 API)
- [ ] 오늘의 주문 자동 계산 (매수 로직: 정수 주식, 5:5 또는 확보용)
- [ ] 예약 매도 표시 (평단가 × 1.10 전량)
- [ ] 현재가 조회 버튼
- [ ] 사이클 완료 버튼 + 확인 모달
- [ ] 전략 규칙 모달

### 시트 2: 무한매수 일지
- [ ] 사이클별 수익 현황 테이블 (USD 메인 + ≈₩ 참고)
- [ ] 사이클 필터 드롭다운 (특정 사이클 / 전체)
- [ ] 매매일지 최신순 정렬
- [ ] 전체 선택 시 사이클 구분선 + 수익 요약
- [ ] 유형별 스타일 (매수/매도/환전)
- [ ] 환전 내역 합산 섹션
- [ ] 기록 추가 모달 (매수/매도/환전 폼)

### 네비게이션
- [ ] 시트 순서: 무한매수 | 무한매수 일지 | 잔고현황 | ...
- [ ] 기존 기능 정상 동작
