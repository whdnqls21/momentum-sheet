# Phase 3: 섹터로테이션 스크리닝 페이지 구현

## 참고 파일
- docs/kis-api-reference.md (API 파라미터 정확한 레퍼런스)
- docs/CLAUDE.md (프로젝트 전체 맥락)
- app/swing/page.tsx (Phase 2 UI 참고)
- app/api/swing/route.ts (API route 패턴 참고)

---

## 개요

7개 고정 섹터 ETF의 복합 모멘텀 점수를 계산해 매월 1위 종목을 선정.
스윙보다 훨씬 단순 — API 1종류, 종목 7개 고정.

---

## 1. API Route: `/api/sector/route.ts`

### 사용 API: 기간별시세 (FHKST03010100)

docs/kis-api-reference.md의 "5. 기간별시세" 파라미터를 **정확히** 사용할 것:

```typescript
const params = new URLSearchParams({
  FID_COND_MRKT_DIV_CODE: "J",
  FID_INPUT_ISCD: code,        // 종목코드
  FID_INPUT_DATE_1: startDate,  // 100거래일 전 (YYYYMMDD)
  FID_INPUT_DATE_2: endDate,    // 오늘 (YYYYMMDD)
  FID_PERIOD_DIV_CODE: "D",
  FID_ORG_ADJ_PRC: "0"
});
```

**URL**: `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`
**tr_id**: `FHKST03010100`

### 종목풀 (7개 고정)

```typescript
const SECTOR_ETFS = [
  { code: "091160", name: "KODEX 반도체" },
  { code: "091180", name: "KODEX 자동차" },
  { code: "091170", name: "KODEX 은행" },
  { code: "117680", name: "KODEX 철강" },
  { code: "117700", name: "KODEX 건설" },
  { code: "305540", name: "TIGER 2차전지테마" },
  { code: "244580", name: "KODEX 바이오" },
];
```

이미 lib/constants.ts에 있으면 거기서 import.

### 처리 흐름

```
7개 ETF × 기간별시세 API (각 100ms 간격)
  ↓
각 ETF별:
  - output1.stck_prpr → 현재가
  - output2[20].stck_clpr → 1M전 종가 (20거래일 전)
  - output2[59].stck_clpr → 3M전 종가 (60거래일 전)
  ↓
수익률 계산:
  - 1M수익률 = (현재가 - 1M전종가) / 1M전종가 × 100
  - 3M수익률 = (현재가 - 3M전종가) / 3M전종가 × 100
  ↓
복합점수 = (1M수익률 × 0.6) + (3M수익률 × 0.4)
  - 3M 데이터 없으면 (output2가 60개 미만) → 1M수익률만 사용
  ↓
점수순 정렬 → 1위 = 이번 달 매수 종목
```

### 응답 형식

```json
{
  "etfs": [
    {
      "code": "091160",
      "name": "KODEX 반도체",
      "price": 45200,
      "m1Return": 8.5,
      "m3Return": 15.2,
      "composite": 11.18,
      "rank": 1,
      "prices": {
        "current": 45200,
        "m1Ago": 41659,
        "m3Ago": 39236
      }
    }
  ],
  "selected": {
    "code": "091160",
    "name": "KODEX 반도체",
    "composite": 11.18
  },
  "month": {
    "year": 2026,
    "month": 2,
    "label": "2026년 2월"
  },
  "processedAt": "2026-02-26T..."
}
```

### Supabase 이력 저장

스크리닝 실행 시 screening_history에 UPSERT:
```typescript
{
  strategy: "sector",
  screen_date: new Date().toISOString().split('T')[0],
  year: 현재연도,
  month_num: 현재월,
  result: 전체 결과 JSON,
  selected_ticker: 1위 종목 코드
}
```

**onConflict**: `strategy,year,month_num`

⚠ 이를 위해 Supabase에 UNIQUE 인덱스 필요 (이미 있을 수 있음):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_sector_monthly 
ON screening_history(strategy, year, month_num);
```

없으면 week_num이 NULL인 sector 행에서 충돌 가능.
**대안**: onConflict를 안 쓰고, 먼저 DELETE 후 INSERT:
```typescript
// 같은 연도+월 기존 데이터 삭제
await supabase
  .from('screening_history')
  .delete()
  .eq('strategy', 'sector')
  .eq('year', year)
  .eq('month_num', month);

// 새로 삽입
await supabase
  .from('screening_history')
  .insert({ ... });
```

이 방식이 UNIQUE 인덱스 문제를 피할 수 있어 더 안전함.

---

## 2. 이력 조회: `/api/sector/history/route.ts`

스윙의 history route와 동일한 패턴:
- GET `/api/sector/history` → strategy='sector' 이력 목록 (year, month_num, selected_ticker)
- GET `/api/sector/history?year=2026&month=2` → 특정 월의 result(JSONB) 조회

---

## 3. UI: `app/sector/page.tsx`

기존 스윙 페이지(app/swing/page.tsx)와 동일한 Excel 스타일.

### 레이아웃
```
[스크리닝 실행] 버튼 + [월 선택] 드롭다운

이번 달 매수 종목: KODEX 반도체 (복합점수: 11.18)

── 섹터 ETF 순위 ──────────────────────
| 순위 | ETF명 | 현재가 | 1M수익률 | 3M수익률 | 복합점수 |
|------|--------|--------|----------|----------|----------|

복합점수 = (1M수익률 × 0.6) + (3M수익률 × 0.4)
```

### 테이블 컬럼
순위, 종목코드, ETF명, 현재가, 1M전 종가, 3M전 종가, 1M수익률(%), 3M수익률(%), 복합점수

### 스타일 규칙
- 1위 종목 행: 노란 하이라이트 (#FFFDE7)
- 양수 수익률: 초록 (#c6efce / #006100)
- 음수 수익률: 빨강 (#ffc7ce / #9c0006)
- 복합점수 기준 내림차순 정렬
- 로딩 중: "스크리닝 중... (X/7)" 프로그레스

### 월 이력 조회
- 드롭다운으로 과거 월 선택 → /api/sector/history에서 조회 → 같은 테이블로 표시
- 최신 월이 기본 선택

---

## 4. 매매규칙 표시 (참고 정보)

테이블 하단에 매매규칙 요약 표시:
```
📋 매매규칙: 200만원 매수 | 익절 +7% | 손절 -5% | 월말 미도달 시 종가 매도
📊 복합점수 = (1M수익률 × 0.6) + (3M수익률 × 0.4)
```

---

## 구현 순서
1. API route (`/api/sector/route.ts`) — 7개 ETF 기간별시세 조회 + 복합모멘텀 계산
2. History route (`/api/sector/history/route.ts`) — 이력 조회
3. UI 페이지 (`app/sector/page.tsx`) — 스크리닝 실행 + 결과 테이블 + 이력 드롭다운

## ⚠ 주의사항
- 기간별시세 API(FHKST03010100) 파라미터는 docs/kis-api-reference.md 참고
- FID_INPUT_DATE_1은 충분히 과거로 (100거래일 ≈ 5개월 전)
- output2 배열이 60개 미만이면 3M수익률 계산 불가 → 1M만 사용
- output2는 최신→과거 순서 (index 0이 가장 최근)
- 모든 API 호출 사이 100ms sleep
- 숫자 필드는 문자열로 오므로 parseFloat 필수
