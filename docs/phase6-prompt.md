# Phase 6: 성과분석 페이지 구현

## 참고 파일
- app/journal/page.tsx (하단 차트를 이 페이지로 이동)
- components/charts/ (Phase 5에서 만든 차트 컴포넌트 재활용)

---

## 개요

매매일지(journal) 하단에 있는 성과 차트를 별도 `/analysis` 페이지로 이동하고,
전략별 비교 + 청산 사유 분석을 추가.

---

## 1. 매매일지 정리

app/journal/page.tsx에서:
- 성과 차트 영역 제거 (누적손익, 전략별승률, 월별손익)
- 성과 요약 통계(총 거래, 승률 등)는 간단히 1줄만 남기기
- "상세 분석 →" 링크를 넣어서 /analysis로 이동 유도

---

## 2. 네비게이션 추가

상단 네비게이션 바 + 모바일 하단바에 "분석" 탭 추가:
홈 | 스윙 | 섹터 | 일지 | **분석**

---

## 3. API Route: `/api/analysis/route.ts`

journal 테이블에서 청산 완료 건(sell_date IS NOT NULL) 조회 후 통계 계산.
캐시 없이 DB 직접 조회: `export const dynamic = 'force-dynamic'`

### 계산 항목

```typescript
// 전체 요약
const totalTrades = closed.length;
const wins = closed.filter(j => j.profit_loss > 0);
const losses = closed.filter(j => j.profit_loss <= 0);
const winRate = (wins.length / totalTrades * 100).toFixed(1);
const avgReturn = (closed.reduce((s, j) => s + Number(j.profit_rate), 0) / totalTrades).toFixed(2);
const totalPnL = closed.reduce((s, j) => s + j.profit_loss, 0);
const maxWin = Math.max(...closed.map(j => j.profit_loss));
const maxLoss = Math.min(...closed.map(j => j.profit_loss));

// 평균 보유일
const avgHoldDays = closed.reduce((s, j) => {
  const days = (new Date(j.sell_date) - new Date(j.buy_date)) / 86400000;
  return s + days;
}, 0) / totalTrades;

// 전략별: 위 계산을 strategy='swing', strategy='sector'로 각각
// 청산사유별: close_reason 그룹핑
// 누적손익: sell_date 순 정렬 후 cumulative 계산
// 월별손익: sell_date의 YYYY-MM으로 그룹핑
```

---

## 4. UI: `app/analysis/page.tsx`

Excel 스타일 유지. 'use client' 컴포넌트.

### 레이아웃

```
성과분석

── 전체 요약 ───────────────────────────────────
| 총 거래 | 승/패 | 승률 | 평균수익률 | 총손익 | 최대수익 | 최대손실 | 평균보유일 |

── 전략별 비교 (테이블) ─────────────────────────
| 전략   | 거래수 | 승률  | 평균수익률 | 총손익  | 평균보유일 | 최대수익 | 최대손실 |
| 스윙   | 10    | 70%  | +3.5%    | +32만  | 4.2일    | +14만  | -6만   |
| 섹터   | 5     | 60%  | +2.6%    | +13만  | 22.5일   | +9.5만 | -4.5만 |

── 청산 사유 분석 (테이블 + 파이차트) ──────────
| 청산사유   | 건수 | 비율  | 총손익   | 평균수익률 |
| 익절      | 8   | 53%  | +62만   | +5.8%    |
| 손절      | 4   | 27%  | -17만   | -3.1%    |
| 종가청산   | 3   | 20%  | +2천   | +0.2%    |

── 누적 손익 차트 (LineChart) ───────────────
- 전략별 색상: 스윙(#2196F3 파랑), 섹터(#4CAF50 초록)
- 전체 합계 선: 검정 점선
- X축: 매도일, Y축: 누적 손익(원)

── 월별 손익 차트 (BarChart) ────────────────
- 스택 바: 스윙(파랑) + 섹터(초록)
- X축: YYYY-MM, Y축: 손익(원)
- 양수: 위로, 음수: 아래로
```

### 스타일 규칙
- 수익: 초록(#006100 / #c6efce), 손실: 빨강(#9c0006 / #ffc7ce)
- 금액은 천단위 콤마 + "원" 표시
- 데이터 없을 때: "청산 완료된 거래가 없습니다. 매매일지에서 기록을 추가해주세요."
- 차트는 청산 2건 이상일 때만 표시

### 차트 컴포넌트

Phase 5에서 만든 recharts 기반 차트 재활용.
journal 하단에서 제거하고 이 페이지로 이동.

추가 차트:
- 청산 사유 파이차트 (PieChart): 익절/손절/종가청산 비율
- 누적 손익에 전략별 라인 구분 추가

---

## 구현 순서
1. app/journal/page.tsx에서 차트 영역 제거, "상세 분석 →" 링크 추가
2. 네비게이션에 "분석" 탭 추가
3. /api/analysis/route.ts — 통계 계산 API
4. app/analysis/page.tsx — 테이블 + 차트 페이지
5. Phase 5 차트 컴포넌트를 이 페이지로 이동/확장

## ⚠ 주의사항
- recharts는 'use client'에서만 사용
- 데이터 0건일 때 에러 방지 (0으로 나누기 등)
- 캐시 사용하지 말 것 (force-dynamic)
- 숫자 필드는 Number() 변환 필수 (Supabase에서 string으로 올 수 있음)
