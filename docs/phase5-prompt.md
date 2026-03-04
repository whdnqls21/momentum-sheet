# Phase 5: PWA + 성과차트 + Vercel 배포

## 참고 파일
- docs/CLAUDE.md (프로젝트 전체 맥락)
- app/layout.tsx (루트 레이아웃)
- app/journal/page.tsx (매매일지 — 차트 추가 대상)

---

## 1. PWA 설정

### 1-1. manifest.json → `public/manifest.json`

```json
{
  "name": "MomentumSheet - 모멘텀 투자 관리",
  "short_name": "MomentumSheet",
  "description": "2트랙 모멘텀 투자 관리 대시보드",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#217346",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 1-2. 아이콘 생성

간단한 SVG → PNG 변환으로 아이콘 생성.
초록 배경(#217346)에 "MS" 흰색 텍스트, 192px + 512px 두 사이즈.

### 1-3. layout.tsx에 메타 태그 추가

```tsx
// app/layout.tsx <head> 안에 추가
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#217346" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

### 1-4. viewport 메타 (모바일 최적화)

```tsx
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
```

---

## 2. 성과 차트 (매매일지 페이지 하단)

### 2-1. 라이브러리

recharts 사용 (Next.js와 호환 좋음):
```bash
npm install recharts
```

### 2-2. 차트 3개

**차트 A: 누적 손익 추이 (라인 차트)**
- X축: 매도일 (시간순)
- Y축: 누적 손익 (원)
- 데이터: 청산 완료 건만, 매도일 순 정렬
- 양수 구간: 초록, 음수 구간: 빨강

```typescript
const cumulativeData = closedTrades
  .sort((a, b) => a.sell_date.localeCompare(b.sell_date))
  .reduce((acc, trade) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    acc.push({
      date: trade.sell_date,
      profit: trade.profit_loss,
      cumulative: prev + trade.profit_loss
    });
    return acc;
  }, []);
```

**차트 B: 전략별 승률 (파이 차트)**
- 스윙: 승/패 비율
- 섹터: 승/패 비율
- 색상: 승(#4CAF50), 패(#F44336)

**차트 C: 월별 손익 (바 차트)**
- X축: 월 (YYYY-MM)
- Y축: 해당 월 총 손익
- 양수: 초록 바, 음수: 빨강 바

### 2-3. UI 배치

매매일지 페이지 성과 요약 아래에 배치:
```
── 성과 요약 ──
총 거래: N건 | 승률: X% | ...

── 성과 차트 ──
[누적손익] [전략별승률] [월별손익]
(탭으로 전환 또는 세로 나열)
```

차트 영역은 데이터 없으면 "거래 기록이 없습니다" 표시.
청산 완료 건이 2건 이상일 때만 차트 표시.

---

## 3. 네비게이션 개선

### 3-1. 현재 페이지 하이라이트

네비게이션 바에서 현재 활성 페이지 탭에 볼드 + 하단 바 표시.
현재 경로를 usePathname()으로 감지.

### 3-2. 모바일 반응형 네비게이션

화면 너비 768px 이하에서:
- 네비게이션 탭을 하단 고정 바로 변경
- 아이콘 + 짧은 라벨 (홈, 스윙, 섹터, 일지)

---

## 4. Vercel 배포 준비

### 4-1. 환경변수 확인

Vercel에 설정할 환경변수:
```
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_CANO=...
KIS_ACNT_PRDT_CD=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

### 4-2. 빌드 테스트

```bash
npm run build
```

에러 없이 빌드 되는지 확인.
TypeScript 에러, import 누락 등 수정.

### 4-3. API Route 최적화

- 모든 API route에 `export const dynamic = 'force-dynamic'` 확인
- 토큰 관리: Supabase kis_token 테이블에서 재사용

### 4-4. 보안

- 환경변수가 클라이언트에 노출되지 않는지 확인
- API route는 서버 사이드에서만 KIS API 키 사용
- Supabase anon key는 RLS(Row Level Security) 고려
  → 1인 사용이므로 간단히 처리 가능

---

## 구현 순서
1. PWA 설정 (manifest, 아이콘, 메타태그)
2. recharts 설치 + 성과 차트 3개
3. 네비게이션 개선 (활성 페이지, 모바일 하단바)
4. `npm run build` 통과 확인

## ⚠ 주의사항
- recharts는 'use client' 컴포넌트에서만 사용
- 차트 컴포넌트는 별도 파일로 분리 추천 (components/charts/)
- PWA 아이콘은 sharp나 canvas 대신 간단한 SVG로 생성
- 빌드 시 any 타입 경고는 무시해도 되지만 에러는 수정
