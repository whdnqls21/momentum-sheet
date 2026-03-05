# 📊 MomentumSheet — 모멘텀 투자 관리

2트랙 모멘텀 투자 전략(섹터로테이션 + 단기스윙)을 위한 스크리닝·매매관리·성과분석 대시보드.
Excel 스프레드시트 스타일 UI · 한국투자증권 오픈API 연동 · PWA 지원

## 기술 스택

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (PostgreSQL)
- **Vercel** 배포
- 한국투자증권 오픈API

## 주요 기능

- **잔고현황**: 보유종목·계좌요약·오늘의 할일 체크리스트
- **단기스윙**: 20종목 8지표 100점 스코어링 (주간)
- **섹터로테이션**: 7개 섹터 ETF 복합 모멘텀 + RSI(3) 진입 필터 (월간)
- **매매일지**: 매수/매도 기록 CRUD
- **성과분석**: 누적 손익 차트, 전략별 비교, 청산 사유 분석
- **PWA**: 홈화면 설치, 오프라인 지원

## 빠른 시작

### 1. 의존성 설치

```bash
cd momentum-sheet
npm install
```

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local` 파일을 열어서 실제 값을 입력:

```
KIS_APP_KEY=한투_앱키
KIS_APP_SECRET=한투_시크릿
KIS_CANO=계좌번호_앞8자리
KIS_ACNT_PRDT_CD=01
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

### 3. Supabase 테이블 생성

Supabase 대시보드 → SQL Editor → `docs/supabase-setup.sql` 내용 실행

### 4. 개발 서버 실행

```bash
npm run dev
```

http://localhost:3000 접속

## 프로젝트 구조

```
momentum-sheet/
├── app/
│   ├── page.tsx                  ← 잔고현황 (홈)
│   ├── swing/page.tsx            ← 단기스윙
│   ├── sector/page.tsx           ← 섹터로테이션 + RSI 진입 필터
│   ├── journal/page.tsx          ← 매매일지
│   ├── stats/page.tsx            ← 성과분석
│   ├── api/
│   │   ├── balance/route.ts      ← 잔고 API
│   │   ├── swing/
│   │   │   ├── route.ts          ← 스윙 스크리닝
│   │   │   └── history/route.ts  ← 스윙 이력
│   │   ├── sector/
│   │   │   ├── route.ts          ← 섹터 스크리닝
│   │   │   ├── history/route.ts  ← 섹터 이력
│   │   │   └── rsi/route.ts      ← RSI 새로고침 (1위 ETF 전용)
│   │   └── journal/route.ts      ← 매매일지 CRUD
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── ExcelFrame.tsx            ← Excel 스타일 프레임
├── lib/
│   ├── types.ts                  ← 공유 타입
│   ├── constants.ts              ← 종목풀, 매매규칙, TR_ID
│   ├── kis-auth.ts               ← 토큰 관리 (Supabase DB 기반)
│   ├── kis-api.ts                ← API 클라이언트
│   ├── rate-limiter.ts           ← 초당 20회 제한
│   ├── rsi.ts                    ← RSI(3) 계산 + 진입 신호 판단
│   └── supabase.ts               ← Supabase 클라이언트
├── docs/
│   ├── SPEC.md                   ← 기능명세서
│   ├── supabase-setup.sql        ← DB 셋업 스크립트
│   └── RSI_진입필터_작업지시.md    ← RSI 진입 필터 설계 문서
└── .env.local.example
```

## 섹터로테이션 RSI 진입 필터

월초 스크리닝으로 모멘텀 1위 ETF를 선정한 뒤, RSI(3) < 30 눌림목 확인 후 진입하는 전략.

```
[섹터 스크리닝]  → 7개 ETF 모멘텀 점수 + RSI(3) 계산 → 1위 확정
[RSI 새로고침]   → 1위 ETF RSI만 재계산 (매일 장 마감 후 사용)

RSI(3) < 30  → BUY  (다음 날 08:50 매수)
RSI(3) >= 30 → WAIT (다음 날 장 마감 후 재확인)
월말까지 미달 → PASS (해당 월 패스, 현금 유지)
```

## 개발 로드맵

| Phase | 범위 | 상태 |
|-------|------|------|
| 1 | 잔고현황 + 수동 새로고침 + 할일 체크리스트 | ✅ 완료 |
| 2 | 단기스윙 스크리닝 + 주차별 이력 | ✅ 완료 |
| 3 | 섹터로테이션 스크리닝 + 월별 이력 | ✅ 완료 |
| 4 | 매매일지 + 입력 팝업 | ✅ 완료 |
| 5 | 성과분석 차트 | ✅ 완료 |
| 6 | PWA + 알림 | ✅ 완료 |
| 7 | RSI(3) 진입 필터 | ✅ 완료 |
| 8 | Vercel 배포 | 대기 |

## 문서

- 기능명세서: `docs/SPEC.md`
- RSI 진입 필터 설계: `docs/RSI_진입필터_작업지시.md`
