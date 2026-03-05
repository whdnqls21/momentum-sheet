# MomentumSheet RSI 진입 필터 추가 작업 지시서

## 1. 작업 개요

MomentumSheet Next.js 프로젝트에 **RSI(3일) 진입 필터**를 추가한다.
현재 `/sector` 페이지에서 모멘텀 점수로 1위 섹터 ETF를 선정하고 있는데,
여기에 RSI 조건을 붙여 **진입 타이밍 판단**까지 자동화하는 것이 목표다.

---

## 2. 작업 전 코드베이스 파악

아래 항목을 먼저 읽고 파악한 뒤 작업 시작할 것.

- `/sector` 페이지 파일 위치 및 구조
- 한국투자증권 API 호출 로직 (FHKST03010100 사용 위치)
- 기존 복합 모멘텀 점수 계산 로직
- 프로젝트의 utils/lib 폴더 구조 및 컨벤션
- 스타일링 방식 (Tailwind / CSS Module 등)

---

## 3. 배경 — 전략 로직

| 항목 | 내용 |
|---|---|
| 전략 | 모멘텀 섹터 ETF 월간 로테이션 |
| 종목풀 | 7개 섹터 ETF (KODEX 반도체 등) |
| 선정 로직 | 복합점수 = 1개월 수익률 × 0.6 + 3개월 수익률 × 0.4 |
| 기존 문제 | 1위 선정 후 매월 첫 거래일 무조건 매수 → 고점 진입 후 즉시 손절 위험 |
| 개선 방향 | 1위 선정 이후 RSI(3) < 30 눌림목 확인 후 진입 |

### 진입 규칙

```
RSI(3) < 30        → BUY     (진입 가능 — 다음 날 08:50 매수)
RSI(3) ≥ 30        → WAIT    (대기 — 다음 날 장 마감 후 재확인)
월말까지 미달 시     → PASS    (해당 월 패스, 현금 유지)
데이터 없음         → NO_DATA
```

### 월중 운영 루틴

```
매일 장 마감 후 (15:30 이후)
  → RSI 새로고침 버튼 클릭
  → RSI < 30 이면 다음 날 08:50 매수
  → RSI ≥ 30 이면 다음 날 다시 확인
  → 월말(마지막 거래일)까지 RSI < 30 안 오면 해당 월 패스, 현금 유지
```

> RSI는 **일별 종가 기준**으로 하루에 한 번만 업데이트된다.
> 장중에 새로고침해도 전일 종가 기준 RSI가 표시되며, 당일 RSI는 15:30 이후 확인해야 한다.

---

## 4. RSI 계산 스펙

### 데이터 소스

- API: `FHKST03010100` (기간별시세 조회) — 이미 사용 중
- 필드: `output2[n].stck_clpr` (일별 종가, 최신순 정렬)
- 최소 필요 데이터: 20일치 (period 3 + Wilder 안정화 버퍼)

### RSI(3) 계산 코드

```typescript
/**
 * RSI(period) 계산
 * @param output2 - FHKST03010100 output2 배열 (최신순)
 * @param period  - RSI 기간 (기본값 3)
 * @returns RSI 값 (0~100), 데이터 부족 시 null
 */
export function calculateRSI(
  output2: Array<{ stck_clpr: string }>,
  period: number = 3
): number | null {
  const required = period * 2 + 14; // 안정화 버퍼 포함
  if (output2.length < required) return null;

  // 최신순 → 오래된 순으로 변환
  const prices = output2
    .slice(0, required)
    .map((d) => parseFloat(d.stck_clpr))
    .reverse();

  const changes = prices.slice(1).map((p, i) => p - prices[i]);

  // 초기 시드 (단순 평균)
  let avgGain =
    changes.slice(0, period).filter((c) => c > 0).reduce((a, b) => a + b, 0) /
    period;
  let avgLoss =
    changes
      .slice(0, period)
      .filter((c) => c < 0)
      .map(Math.abs)
      .reduce((a, b) => a + b, 0) / period;

  // Wilder's Smoothing
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
```

### 진입 신호 판단 함수

```typescript
export type EntrySignal = 'BUY' | 'WAIT' | 'NO_DATA';

export function getEntrySignal(rsi: number | null): EntrySignal {
  if (rsi === null) return 'NO_DATA';
  if (rsi < 30) return 'BUY';
  return 'WAIT';
}
```

> `PASS` (월말 패스) 는 UI 상태로 관리한다. 월말 마지막 거래일에 RSI ≥ 30이면
> 사용자가 수동으로 "이번 달 패스" 처리한다. 자동화하지 않아도 된다.

---

## 5. 파일 작업 목록

### 5-1. 신규 파일: `lib/rsi.ts` (또는 `utils/rsi.ts`)

프로젝트 컨벤션에 맞는 위치에 생성.
위 `calculateRSI`, `getEntrySignal`, `EntrySignal` 타입 포함.

### 5-2. `/sector` 페이지 — 버튼 구조

**버튼 두 개로 분리**

```
[ 섹터 스크리닝 ]   ← 월초 1회만 클릭.
                      7개 ETF 모멘텀 점수 계산 → 1위 확정
                      → 7개 ETF 전부 RSI(3) 계산 (이미 받아온 60일치 데이터 재사용, 추가 API 호출 없음)
                      → 결과를 스크리닝 테이블에 표시 (모멘텀 점수 + RSI 컬럼)
                      → 1위 ETF를 "이번 달 진입 대상"으로 확정 및 저장

[ RSI 새로고침  ]   ← 월중 매일 장 마감 후 클릭.
                      1위 ETF FHKST03010100 호출 (최신 종가 필요, 1건만 호출)
                      → RSI(3) 재계산 → 진입 판단 카드만 업데이트.
                      스크리닝 테이블 및 순위는 변경되지 않음.
```

> RSI는 1위 ETF 1개만 계산한다. 나머지 6개 ETF는 RSI 계산 불필요.

**상태 관리 구조**

```typescript
// 월초 스크리닝으로 확정된 진입 대상 (로컬스토리지 또는 상태로 유지)
const [lockedTarget, setLockedTarget] = useState<{
  name: string;
  code: string;
  month: string; // "2026-04" 형태로 월 단위 관리
} | null>(null);

// RSI 새로고침 시 lockedTarget의 RSI만 업데이트
const [targetRsi, setTargetRsi] = useState<number | null>(null);
```

> 스크리닝 버튼을 다시 누르면 lockedTarget이 덮어써진다.
> 월이 바뀌면 (month 불일치) 자동으로 이전 달 대상이 초기화된다.

### 5-3. `/sector` 페이지 — 데이터 페칭 로직 수정

스크리닝 시 7개 ETF 모두 모멘텀 점수 + RSI(3) 계산. 이미 받아온 `output2` 재사용.

```typescript
import { calculateRSI, getEntrySignal } from '@/lib/rsi';

// 7개 ETF 전부 모멘텀 점수 + RSI 계산
const etfsWithRsi = etfs.map((etf) => ({
  ...etf,
  rsi: calculateRSI(etf.output2), // 기존 60일치 데이터 재사용, 추가 API 호출 없음
}));

// 1위 확정
const ranked = etfsWithRsi.sort((a, b) => b.score - a.score);
const topEtf = ranked[0];

// 진입 대상 저장 (1위 ETF + 초기 RSI)
setLockedTarget({
  ...topEtf,
  entrySignal: getEntrySignal(topEtf.rsi),
  month: currentMonth,
});
```

### RSI 새로고침 시 — 1위 ETF만 API 호출, 진입 판단 카드만 업데이트

```typescript
// RSI 새로고침: 1위 ETF 1건만 FHKST03010100 호출
const freshOutput2 = await fetchDailyPrices(lockedTarget.code);
const freshRsi = calculateRSI(freshOutput2);

// 진입 판단 카드 상태만 업데이트. 스크리닝 테이블은 건드리지 않음.
setLockedTarget((prev) => ({
  ...prev!,
  rsi: freshRsi,
  entrySignal: getEntrySignal(freshRsi),
  updatedAt: new Date().toLocaleTimeString('ko-KR'),
}));
```

### 5-3. `/sector` 페이지 — UI 수정

#### A. 스크리닝 테이블

RSI(3) 컬럼 추가. 7개 ETF 전부 표시.
1위 ETF 행에 "📌 이번 달 진입 대상" 표시.

| 컬럼명 | 값 | 비고 |
|---|---|---|
| RSI(3) | 소수점 1자리 (예: 28.4) | null이면 "-" 표시 |

> RSI는 스크리닝 시 이미 받아온 60일치 데이터로 계산. 추가 API 호출 없음.

#### B. 진입 신호 판단 카드 (별도 섹션)

스크리닝 테이블 상단에 카드 형태로 추가. **월중에는 이 카드만 보면 된다.**

```
┌─────────────────────────────────────────────┐
│  📌 이번 달 진입 대상 (2026년 4월)               │
│                                             │
│  KODEX 반도체 (091160)                        │
│  RSI(3): 28.4   (15:32 기준)                 │
│                                             │
│  ✅ 진입 가능 — 내일 08:50 매수                  │
│  또는                                        │
│  ⏳ 대기 — RSI 54.2, 내일 장 마감 후 재확인        │
│                                             │
│  기준: RSI(3) < 30 시 진입                     │
│        월말까지 미달 시 해당 월 패스               │
│                                  [RSI 새로고침]│
└─────────────────────────────────────────────┘
```

> RSI 새로고침 버튼은 이 카드 안에도 배치한다. (테이블 위 별도 버튼과 동일 동작)

---

## 6. 주의사항

- **기존 복합 모멘텀 점수 계산 로직 수정 금지**
- **RSI 계산 실패 시 graceful degradation** — 기존 스크리닝은 정상 동작해야 함
- TypeScript strict 모드 준수
- 스타일은 기존 프로젝트 컨벤션 따를 것
- 작업 완료 후 `/sector` 페이지 전체 기능 정상 동작 확인

---

## 7. 완료 조건

- [ ] `lib/rsi.ts` (또는 `utils/rsi.ts`) 생성
- [ ] 스크리닝 시 7개 ETF 전부 RSI(3) 계산 (추가 API 호출 없음)
- [ ] 스크리닝 테이블에 RSI(3) 컬럼 표시
- [ ] 스크리닝 버튼 / RSI 새로고침 버튼 분리 동작
- [ ] 월초 스크리닝 후 진입 대상 ETF 고정 (월 단위)
- [ ] RSI 새로고침 시 고정된 ETF RSI만 업데이트 (스크리닝 결과 불변)
- [ ] 진입 판단 카드 표시 (RSI 값 + 진입 여부 + 마지막 업데이트 시각)
- [ ] 기존 모멘텀 스크리닝 정상 동작 확인
