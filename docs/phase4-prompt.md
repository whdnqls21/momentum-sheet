# Phase 4: 매매일지 페이지 구현

## 참고 파일
- docs/kis-api-reference.md (API 파라미터)
- docs/CLAUDE.md (프로젝트 전체 맥락)
- app/swing/page.tsx, app/sector/page.tsx (UI 패턴 참고)

---

## 개요

매수/매도 기록을 Supabase journal 테이블에 저장하고, 목록 조회 + 성과 통계를 보여주는 페이지.

---

## 1. Supabase 테이블 (이미 생성됐을 수 있음)

```sql
CREATE TABLE IF NOT EXISTS journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy TEXT NOT NULL CHECK (strategy IN ('swing', 'sector')),
  ticker_code TEXT NOT NULL,
  ticker_name TEXT NOT NULL,
  buy_date DATE NOT NULL,
  buy_price INTEGER NOT NULL,
  buy_qty INTEGER NOT NULL,
  buy_amount INTEGER NOT NULL,
  sell_date DATE,
  sell_price INTEGER,
  sell_amount INTEGER,
  profit_loss INTEGER,
  profit_rate NUMERIC(8,2),
  close_reason TEXT,
  pool_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 2. API Routes

### 2-1. GET `/api/journal/route.ts` — 목록 조회

Query params:
- `strategy` (선택): 'swing' 또는 'sector' — 없으면 전체
- `status` (선택): 'open' (sell_date IS NULL) 또는 'closed' (sell_date IS NOT NULL) — 없으면 전체

```typescript
// 기본: 최신순 정렬
const query = supabase
  .from('journal')
  .select('*')
  .order('buy_date', { ascending: false });

if (strategy) query.eq('strategy', strategy);
if (status === 'open') query.is('sell_date', null);
if (status === 'closed') query.not('sell_date', 'is', null);
```

### 2-2. POST `/api/journal/route.ts` — 매수 기록 추가

Request body:
```json
{
  "strategy": "swing",
  "ticker_code": "034020",
  "ticker_name": "두산에너빌리티",
  "buy_date": "2026-02-27",
  "buy_price": 103800,
  "buy_qty": 19,
  "buy_amount": 1972200,
  "pool_type": "1차",
  "notes": "9주차 스크리닝 1위"
}
```

### 2-3. PATCH `/api/journal/[id]/route.ts` — 매도 기록 (청산)

Request body:
```json
{
  "sell_date": "2026-03-05",
  "sell_price": 111000,
  "sell_amount": 2109000,
  "profit_loss": 136800,
  "profit_rate": 6.94,
  "close_reason": "익절"
}
```

profit_loss와 profit_rate는 프론트에서 계산해서 보내도 되고, 백엔드에서 계산해도 됨.
**백엔드 계산 추천**:
```typescript
const profit_loss = sell_amount - buy_amount;
const profit_rate = ((sell_price - buy_price) / buy_price * 100).toFixed(2);
```

### 2-4. DELETE `/api/journal/[id]/route.ts` — 기록 삭제

잘못 입력한 경우 삭제용.

---

## 3. UI: `app/journal/page.tsx`

기존 Excel 스타일 유지.

### 레이아웃

```
[매수 기록 추가] 버튼 + [전략 필터: 전체/스윙/섹터] + [상태 필터: 전체/보유중/청산]

── 보유 중 (미청산) ──────────────────────
| 전략 | 종목명 | 매수일 | 매수가 | 수량 | 매수금액 | 현재가 | 평가손익 | 수익률 | [매도] |

── 청산 완료 ──────────────────────────
| 전략 | 종목명 | 매수일 | 매도일 | 매수가 | 매도가 | 손익 | 수익률 | 청산사유 |

── 성과 요약 ──────────────────────────
총 거래: N건 | 승률: X% | 평균수익률: X% | 총손익: X원
```

### 매수 기록 추가 (모달 또는 인라인 폼)

입력 필드:
- 전략: 스윙/섹터 (라디오)
- 종목코드: 텍스트 (6자리)
- 종목명: 텍스트
- 매수일: 날짜 선택
- 매수가: 숫자
- 수량: 숫자
- 매수금액: 자동계산 (매수가 × 수량) — readonly
- 풀구분: 1차/2차/없음 (스윙만)
- 메모: 텍스트

**편의기능**: 스크리닝 결과에서 종목코드/종목명 자동 입력
→ 스윙 페이지의 1위 종목 정보를 localStorage나 URL param으로 전달 가능
→ 복잡하면 생략하고 수동 입력만 구현

### 매도 기록 (청산 모달)

보유 중 테이블의 [매도] 버튼 클릭 시:
- 매도일: 날짜 선택
- 매도가: 숫자
- 매도금액: 자동계산 (매도가 × 보유수량)
- 손익: 자동계산 (매도금액 - 매수금액)
- 수익률: 자동계산 ((매도가 - 매수가) / 매수가 × 100)
- 청산사유: 익절/손절/종가청산 (라디오)
- 메모: 텍스트

### 성과 요약 통계

전체 또는 필터된 청산 건 기준:
```typescript
const closed = journal.filter(j => j.sell_date);
const wins = closed.filter(j => j.profit_loss > 0);
const totalTrades = closed.length;
const winRate = (wins.length / totalTrades * 100).toFixed(1);
const avgReturn = (closed.reduce((s, j) => s + j.profit_rate, 0) / totalTrades).toFixed(2);
const totalPnL = closed.reduce((s, j) => s + j.profit_loss, 0);
```

### 테이블 스타일
- 보유 중: 배경 연노랑 (#FFFDE7)
- 청산 수익: 초록 (#c6efce)
- 청산 손실: 빨강 (#ffc7ce)
- 익절: 초록 텍스트, 손절: 빨강 텍스트
- 종가청산: 회색 텍스트
- 금액은 천단위 콤마 표시

---

## 4. 보유 중 종목 현재가 표시 (선택)

보유 중 종목의 실시간 평가손익을 표시하려면:
- 잔고조회 API(TTTC8434R)에서 가져오거나
- 현재가 API(FHKST01010100)로 각 종목 조회

→ Phase 5에서 구현해도 됨. Phase 4에서는 매수/매도 CRUD에 집중.

---

## 구현 순서
1. API routes (GET/POST `/api/journal`, PATCH/DELETE `/api/journal/[id]`)
2. UI 페이지 (`app/journal/page.tsx`) — 목록 테이블 + 필터
3. 매수 기록 추가 모달
4. 매도 기록 (청산) 모달
5. 성과 요약 통계

## ⚠ 주의사항
- journal 테이블이 Supabase에 없으면 먼저 생성해야 함 (위의 CREATE TABLE SQL)
- profit_rate는 NUMERIC(8,2) — 소수점 2자리
- buy_amount는 매수가 × 수량으로 자동계산
- 매도 시 profit_loss = sell_amount - buy_amount, profit_rate = (sell_price - buy_price) / buy_price * 100
- 삭제는 확인 다이얼로그 필수
