# MomentumSheet — 프로젝트 컨텍스트

> 이 파일은 Claude Code가 프로젝트 맥락을 이해하기 위한 문서입니다.
> 코드 수정, 기능 추가, 버그 수정 시 반드시 참고하세요.

---

## 프로젝트 개요

한국투자증권 오픈API를 활용한 **2트랙 모멘텀 투자 관리 시스템**.
Excel 스프레드시트 스타일 UI로 모바일/PC에서 사용.

- **기술스택**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **DB**: Supabase (PostgreSQL)
- **배포**: Vercel (예정)
- **API**: 한국투자증권 오픈API

---

## 한국투자증권 오픈API — 핵심 정보

### 공통 설정
- **Base URL**: `https://openapi.koreainvestment.com:9443`
- **인증**: OAuth2 Bearer 토큰
- **⚠ 토큰 발급 제한**: **1일 1회 원칙**. 잦은 발급 시 이용 제한됨
  - 토큰은 Supabase `kis_token` 테이블에 저장 (인메모리 캐시 사용 안 함)
  - 조회 순서: Supabase DB 조회 → 만료 시 새 발급
  - 무효화: DB의 `expires_at`을 과거로 설정
- **Rate Limit**: 초당 20건. API 호출 사이 최소 100ms 대기 필요

### 공통 헤더 (모든 API 요청에 필수)
```
Content-Type: application/json; charset=utf-8
authorization: Bearer {access_token}
appkey: {KIS_APP_KEY}
appsecret: {KIS_APP_SECRET}
tr_id: {각 API별 TR_ID}
custtype: P
```

### API 목록 및 파라미터

#### 1. 잔고조회 (TTTC8434R)
- **GET** `/uapi/domestic-stock/v1/trading/inquire-balance`
- Query: CANO, ACNT_PRDT_CD(01), AFHR_FLPR_YN(N), INQR_DVSN(01), UNPR_DVSN(01), FUND_STTL_ICLD_YN(N), FNCG_AMT_AUTO_RDPT_YN(N), PRCS_DVSN(00), CTX_AREA_FK100(""), CTX_AREA_NK100("")
- Response output1: pdno(코드), prdt_name(이름), hldg_qty(수량), pchs_avg_pric(평균가), prpr(현재가), evlu_pfls_amt(손익), evlu_pfls_rt(손익률%)
- Response output2: dnca_tot_amt(예수금), pchs_amt_smtl_amt(매입합계), evlu_amt_smtl_amt(평가합계), evlu_pfls_smtl_amt(손익합계)

#### 2. 현재가 조회 (FHKST01010100)
- **GET** `/uapi/domestic-stock/v1/quotations/inquire-price`
- Query: FID_COND_MRKT_DIV_CODE=J, FID_INPUT_ISCD={종목코드}
- Response output: stck_prpr(현재가), stck_hgpr(52주고가), stck_lwpr(52주저가)

#### 3. 일별시세 (FHKST01010400)
- **GET** `/uapi/domestic-stock/v1/quotations/inquire-daily-price`
- Query: FID_COND_MRKT_DIV_CODE=J, FID_INPUT_ISCD={종목코드}, FID_INPUT_DATE_1={시작일YYYYMMDD}, FID_INPUT_DATE_2={종료일YYYYMMDD}, FID_PERIOD_DIV_CODE=D, FID_ORG_ADJ_PRC=0
- Response output: stck_bsop_date(날짜), stck_clpr(종가), stck_oprc(시가), acml_vol(거래량)

#### 4. 투자자별 매매동향 (FHKST01010900)
- **GET** `/uapi/domestic-stock/v1/quotations/inquire-investor`
- Query: FID_COND_MRKT_DIV_CODE=J, FID_INPUT_ISCD={종목코드}
- Response output: frgn_ntby_qty(외국인순매수량) — 최근 날짜순

#### 5. 기간별시세 (FHKST03010100) — 섹터로테이션용
- **GET** `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`
- Query: FID_COND_MRKT_DIV_CODE=J, FID_INPUT_ISCD={종목코드}, FID_INPUT_DATE_1={시작일}, FID_INPUT_DATE_2={종료일}, FID_PERIOD_DIV_CODE=D, FID_ORG_ADJ_PRC=0
- Response output1: stck_prpr(현재가)
- Response output2: stck_clpr(종가) 배열 — [20]이 1M전, [59]가 3M전

#### 6. 거래량순위 (FHPST01710000) — 2차 풀 수집용
- **GET** `/uapi/domestic-stock/v1/quotations/volume-rank`
- Query: FID_COND_MRKT_DIV_CODE=J, FID_COND_SCR_DIV_CODE=20101, FID_INPUT_ISCD=0000, FID_DIV_CLS_CODE=0, FID_BLNG_CLS_CODE=0, FID_TRGT_CLS_CODE=111111111, FID_TRGT_EXLS_CLS_CODE=000000, FID_INPUT_PRICE_1=0, FID_INPUT_PRICE_2=0, FID_VOL_CNT=0, FID_INPUT_DATE_1=""
- Response output: mksc_shrn_iscd(코드), hts_kor_isnm(이름), stck_prpr(현재가), acml_vol(거래량), lstn_stcn(상장주수)

#### 7. 신고가근접 (FHPST01870000) — 2차 풀 수집용
- **GET** `/uapi/domestic-stock/v1/ranking/near-new-highlow`
- Query: FID_COND_MRKT_DIV_CODE=J, FID_COND_SCR_DIV_CODE=20175, FID_INPUT_ISCD=0000, FID_DIV_CLS_CODE=0, fid_rank_sort_cls_code=1, FID_INPUT_CNT_1=21, **FID_INPUT_CNT_2=0**, FID_TRGT_CLS_CODE=0, FID_TRGT_EXLS_CLS_CODE=0, FID_INPUT_PRICE_1=0, FID_INPUT_PRICE_2=0
- **⚠ FID_INPUT_CNT_2 필수!** 빠뜨리면 `OPSQ2001 ERROR INPUT FIELD NOT FOUND` 에러 발생
- Response output: stck_shrn_iscd(코드), hts_kor_isnm(이름), stck_prpr(현재가)

### ⚠ API 주의사항 (자주 발생하는 문제)
1. **FID_INPUT_CNT_2 누락**: 신고가근접 API에 반드시 포함. 없으면 에러.
2. **토큰 재발급 금지**: 하루 1회만 발급. Supabase에서 조회 우선.
3. **Rate Limit**: 초당 20건. 대량 호출 시 100ms sleep 삽입 필수.
4. **응답 코드 확인**: `rt_cd === '0'`이면 성공, 아니면 `msg1`에 에러 내용.
5. **숫자 필드**: API 응답의 숫자는 **문자열**로 옴. parseInt/parseFloat 필수.
6. **연속조회**: 50건 초과 시 tr_cont 헤더 'M'/'F' 처리 필요.

---

## 투자 전략 상세

### 트랙 A: 섹터로테이션 (월간)
- **주기**: 월 1회 (월말 15:30 이후 스크리닝 → 다음달 첫 거래일 매수)
- **종목풀**: 7개 고정 섹터 ETF

| ETF명 | 코드 |
|-------|------|
| KODEX 반도체 | 091160 |
| KODEX 자동차 | 091180 |
| KODEX 은행 | 091170 |
| KODEX 철강 | 117680 |
| KODEX 건설 | 117700 |
| TIGER 2차전지테마 | 305540 |
| KODEX 바이오 | 244580 |

- **복합 모멘텀 점수** = (1M수익률 × 0.6) + (3M수익률 × 0.4)
  - 1M수익률 = (현재가 - 20거래일전 종가) / 20거래일전 종가 × 100
  - 3M수익률 = (현재가 - 60거래일전 종가) / 60거래일전 종가 × 100
  - 3M 데이터 없으면 1M만 사용
- **매매규칙**: 200만원 매수, 익절 +7%, 손절 -5%, 월말 미도달 시 종가 매도

### 트랙 B: 단기스윙 (주간)
- **주기**: 주 1회 (금요일 스크리닝 → 월요일 매수)
- **종목풀**: 1차 고정 10종목 + 2차 동적 10종목

**1차 풀 (고정)**:

| 종목명 | 코드 |
|--------|------|
| KODEX 레버리지 | 122630 |
| KODEX 코스닥150레버리지 | 233740 |
| TIGER AI반도체핵심공정 | 471760 |
| KODEX AI전력핵심설비 | 487240 |
| TIGER K방산&우주 | 463250 |
| 네이버 | 035420 |
| 카카오 | 035720 |
| 한화에어로스페이스 | 012450 |
| HD현대중공업 | 329180 |
| 두산에너빌리티 | 034020 |

**2차 풀 수집 로직**:
1. 거래량순위 API → 상위 30개
2. 신고가근접 API → 상위 30개
3. 두 리스트 병합 (중복 제거)
4. 필터: 1차 풀 중복 제거, ETF/ETN 제외, 우선주 제외, SPAC 제외, 시총 1조↑
5. 거래량순 정렬 → 상위 10종목

**ETF 판별 키워드**:
```
KODEX, TIGER, KBSTAR, SOL, ACE, HANARO, ARIRANG, KOSEF, KIWOOM, BNK, TIMEFOLIO, PLUS, RISE, WOORI
```

**우선주 판별**: 종목코드 끝자리 5,7,8,9 또는 이름에 "우" 포함
**SPAC 판별**: 이름에 "스팩" 포함

**100점 스코어링 (8개 지표)**:

| # | 지표 | 배점 | 계산 | 점수 변환 |
|---|------|------|------|-----------|
| 1 | 거래량 강도 | 15 | 5일avg거래량 ÷ 20일avg거래량 | ≥2.0→15, ≥1.5→12, ≥1.2→9, ≥0.8→6, else→0 |
| 2 | 52주 고가 근접 | 15 | 현재가 ÷ 52주고가 × 100 | ≥95%→15, ≥90%→12, ≥85%→9, ≥80%→6, else→0 |
| 3 | 5일선 이격 | 10 | (현재가 - MA5) ÷ MA5 × 100 | 0~3%→10, 3~5%→7, 5~7%→4, else→0 |
| 4 | 정배열 | 10 | MA5 vs MA20 | MA5>MA20→10, else→0 |
| 5 | 20일선 기울기 | 10 | (오늘MA20 - 5일전MA20) ÷ 5일전MA20 × 100 | ≥1%→10, ≥0.5%→7, ≥0%→4, else→0 |
| 6 | 외국인 수급 | 15 | 최근 5일 중 순매수일 수 | 5일→15, 4일→12, 3일→9, 2일→6, else→0 |
| 7 | 연속 양봉 | 10 | 최근 5일 중 종가>시가 일수 × 2 | 최대 10 |
| 8 | 이격도 적정성 | 15 | 현재가 ÷ MA20 × 100 | 100~105%→15, 105~108%→10, 97~100%→7, else→0 |

**필터 (PASS/FAIL)**: 현재가>MA5 AND 20일선기울기>0 AND 거래량비율≥0.8
**매수 조건**: PASS + 60점↑ + 1위 (동점 시 1차 풀 우선)
**매매규칙**: 200만원 매수, 익절 +7%, 손절 -3%, 금요일 미청산 시 종가 매도

---

## Supabase 테이블 구조

### kis_token (토큰 저장)
```sql
CREATE TABLE kis_token (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW()
);
```

### journal (매매일지)
```sql
CREATE TABLE journal (
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
  close_reason TEXT,       -- 익절/손절/종가청산
  pool_type TEXT,          -- 1차/2차 (스윙용)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### screening_history (스크리닝 이력)
```sql
CREATE TABLE screening_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy TEXT NOT NULL CHECK (strategy IN ('swing', 'sector')),
  screen_date DATE NOT NULL,
  year INTEGER NOT NULL,
  week_num INTEGER,        -- 스윙용 (ISO 주차)
  month_num INTEGER,       -- 섹터용
  result JSONB NOT NULL,   -- 전체 결과
  selected_ticker TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 유니크 인덱스 (같은 주/월에 하나만 저장)
CREATE UNIQUE INDEX uq_swing_week ON screening_history(strategy, year, week_num) WHERE strategy='swing';
CREATE UNIQUE INDEX uq_sector_month ON screening_history(strategy, year, month_num) WHERE strategy='sector';
```
- **저장 방식**: delete + insert (partial unique index와 PostgREST upsert 호환 문제로 upsert 미사용)
- 스윙: 같은 `(year, week_num)` 행 삭제 후 새로 삽입
- 섹터: 같은 `(year, month_num)` 행 삭제 후 새로 삽입

---

## 환경변수

```
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_CANO=...              # 계좌번호 앞 8자리
KIS_ACNT_PRDT_CD=01       # 뒤 2자리
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

---

## UI 스타일 가이드

- **테마**: Excel 스프레드시트 스타일
- **리본바**: 초록색 (#217346) 배경, 홈/삽입/수식/데이터 탭
- **수식줄**: 시트별 수식 표시 (예: `=한투API(TTTC8434R, 잔고조회)`)
- **시트 탭**: 5개 — 잔고현황, 단기스윙, 섹터로테이션, 매매일지, 성과분석
- **상태바**: 초록색 배경, 평균/개수/합계

### 색상 규칙
- **수익**: 배경 #c6efce, 글자 #006100
- **손실**: 배경 #ffc7ce, 글자 #9c0006
- **API 데이터**: 파랑 계열
- **1위 종목**: 노란 하이라이트 (#FFFDE7)
- **PASS**: 초록 배경, **FAIL**: 빨강 배경

---

## 프로젝트 구조

```
momentum-sheet/
├── app/
│   ├── page.tsx              # 잔고현황 (홈)
│   ├── swing/page.tsx        # 단기스윙 스크리닝
│   ├── sector/page.tsx       # 섹터로테이션
│   ├── journal/page.tsx      # 매매일지
│   ├── stats/page.tsx        # 성과분석
│   ├── api/
│   │   ├── balance/route.ts  # 잔고조회
│   │   ├── swing/route.ts    # 스윙 스크리닝
│   │   ├── sector/route.ts   # 섹터 스크리닝
│   │   └── journal/route.ts  # 매매일지 CRUD
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── ExcelFrame.tsx        # Excel 프레임 (리본바, 수식줄, 시트탭, 상태바)
├── lib/
│   ├── types.ts              # 공유 타입
│   ├── constants.ts          # 종목풀, 매매규칙, TR_ID
│   ├── kis-auth.ts           # 토큰 관리 (Supabase DB 기반, 캐시 없음)
│   ├── kis-api.ts            # API 클라이언트
│   ├── rate-limiter.ts       # 초당 20회 제한
│   └── supabase.ts           # Supabase 클라이언트
└── docs/
    ├── SPEC.md               # 기능명세서
    └── supabase-setup.sql    # DB 셋업 SQL
```

---

## 개발 페이즈

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | 잔고현황 + 할일 체크리스트 | ✅ 완료 |
| 2 | 단기스윙 스크리닝 | ✅ 완료 |
| 3 | 섹터로테이션 스크리닝 | ✅ 완료 |
| 4 | 매매일지 (Supabase CRUD) | ✅ 완료 |
| 5 | 성과분석 차트 | ✅ 완료 |
| 6 | PWA + 알림 | ✅ 완료 |
| 7 | Vercel 배포 | 대기 |

---

## 코딩 패턴

### API Route 패턴 (검증된 방식)
```typescript
// 직접 fetch 방식 사용 (kis-api.ts 래퍼 대신)
import { getToken } from '@/lib/kis-auth';
import { KIS_BASE_URL } from '@/lib/constants';

const token = await getToken();
const params = new URLSearchParams({ ... });
const res = await fetch(`${KIS_BASE_URL}/uapi/...?${params}`, {
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: process.env.KIS_APP_KEY!,
    appsecret: process.env.KIS_APP_SECRET!,
    tr_id: 'TR_ID_HERE',
    custtype: 'P',
  },
  cache: 'no-store',
});
const data = await res.json();
if (data.rt_cd !== '0') throw new Error(data.msg1);
```

### 대량 API 호출 시 (스크리닝)
```typescript
// 100ms 간격 순차 처리
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

for (const stock of stocks) {
  const priceData = await fetchPrice(stock.code);
  await sleep(100);
  const dailyData = await fetchDaily(stock.code);
  await sleep(100);
  const investorData = await fetchInvestor(stock.code);
  await sleep(100);
}
```

---

## 알려진 이슈 및 해결책

| 문제 | 원인 | 해결 |
|------|------|------|
| OPSQ2001 ERROR INPUT FIELD NOT FOUND | API 필수 파라미터 누락 | 해당 API 문서 확인, 특히 FID_INPUT_CNT_2 |
| 토큰 발급 제한 | 하루 1회 초과 발급 | Supabase kis_token 테이블에서 조회 우선 |
| HTTP 500 on /api/balance | kis-api.ts 래퍼 문제 | 직접 fetch 방식 사용 |
| rate-limiter 에러 | 큐 처리 버그 | 단순 sleep 방식으로 대체 |
| duplicate key uq_swing_week | upsert의 onConflict가 partial unique index와 불일치 | delete + insert 패턴으로 변경 |
| 스크리닝 후 화면 미갱신 | 이력 드롭다운 로컬 갱신만 수행 | 서버 re-fetch + 최신 날짜 자동 선택 |
