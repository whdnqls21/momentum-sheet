# 📊 MomentumSheet — 모멘텀 투자 관리

2트랙 모멘텀 투자 전략(섹터로테이션 + 단기스윙)을 위한 스크리닝·매매관리·성과분석 대시보드.  
Excel 스프레드시트 스타일 UI · 한국투자증권 오픈API 연동 · PWA 지원

## 기술 스택

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (PostgreSQL)
- **Vercel** 배포
- 한국투자증권 오픈API

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
│   ├── page.tsx              ← 잔고현황 (홈)
│   ├── swing/page.tsx        ← 단기스윙
│   ├── sector/page.tsx       ← 섹터로테이션
│   ├── journal/page.tsx      ← 매매일지
│   ├── stats/page.tsx        ← 성과분석
│   ├── api/
│   │   └── balance/route.ts  ← 잔고 API
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── ExcelFrame.tsx        ← Excel 스타일 프레임
├── lib/
│   ├── types.ts              ← 공유 타입
│   ├── constants.ts          ← 종목풀, 매매규칙
│   ├── kis-auth.ts           ← 한투 토큰 관리
│   ├── kis-api.ts            ← 한투 API 클라이언트
│   ├── rate-limiter.ts       ← API 호출 제한
│   └── supabase.ts           ← Supabase 클라이언트
├── docs/
│   ├── SPEC.md               ← 기능명세서
│   └── supabase-setup.sql    ← DB 셋업 스크립트
└── .env.local.example
```

## 개발 로드맵

| Phase | 범위 | 상태 |
|-------|------|------|
| 1 | 잔고현황 + 수동 새로고침 + 할일 체크리스트 | ✅ 완료 |
| 2 | 단기스윙 스크리닝 + 주차별 이력 | 예정 |
| 3 | 섹터로테이션 스크리닝 + 월별 이력 | 예정 |
| 4 | 매매일지 + 입력 팝업 | 예정 |
| 5 | 오늘의 할일 (Supabase 연동) | 예정 |
| 6 | 성과분석 시트 | 예정 |
| 7 | PWA | 예정 |

## 문서

- 기능명세서: `docs/SPEC.md`
