# Phase 2: 단기스윙 스크리닝 페이지 구현

프로젝트 컨텍스트를 먼저 파악해줘:
- docs/SPEC.md (기능명세서)
- lib/constants.ts (종목풀, TR_ID 등)
- lib/kis-auth.ts (토큰 관리 - Supabase 저장 방식)
- lib/supabase.ts (Supabase 클라이언트)
- app/page.tsx (잔고현황 - 기존 UI 스타일 참고)
- components/ExcelFrame.tsx (Excel 프레임 레이아웃)

---

## 구현할 것

### 1. API Route: `/api/swing/route.ts`

**1차 풀 (고정 10종목)** — constants.ts의 SWING_POOL_PRIMARY 사용

**2차 풀 (동적 10종목)** — API 2개로 수집:
- 거래량순위 API (FHPST01710000): `/uapi/domestic-stock/v1/quotations/volume-rank`
  - Query: FID_COND_MRKT_DIV_CODE=J, FID_COND_SCR_DIV_CODE=20101, FID_INPUT_ISCD=0000, FID_DIV_CLS_CODE=0, FID_BLNG_CLS_CODE=0, FID_TRGT_CLS_CODE=111111111, FID_TRGT_EXLS_CLS_CODE=000000, FID_INPUT_PRICE_1=0, FID_INPUT_PRICE_2=0, FID_VOL_CNT=0, FID_INPUT_DATE_1=""
  - tr_id: FHPST01710000
  - Response: output에서 mksc_shrn_iscd(종목코드), hts_kor_isnm(종목명), stck_prpr(현재가), acml_vol(거래량), lstn_stcn(상장주수)
  - 상위 30개 가져오기

- 신고가근접 API (FHPST01870000): `/uapi/domestic-stock/v1/ranking/near-new-highlow`
  - Query: FID_COND_MRKT_DIV_CODE=J, FID_COND_SCR_DIV_CODE=20175, FID_INPUT_ISCD=0000, FID_DIV_CLS_CODE=0, fid_rank_sort_cls_code=1, FID_INPUT_CNT_1=21, FID_TRGT_CLS_CODE=0, FID_TRGT_EXLS_CLS_CODE=0, FID_INPUT_PRICE_1=0, FID_INPUT_PRICE_2=0
  - tr_id: FHPST01870000
  - Response: output에서 stck_shrn_iscd(종목코드), hts_kor_isnm(종목명), stck_prpr(현재가)
  - 상위 30개 가져오기

- **2차 풀 필터링**:
  - 1차 풀과 중복 제거
  - ETF/ETN 제외 (종목명에 KODEX, TIGER, KBSTAR, SOL, ACE, HANARO, ARIRANG, KOSEF, KIWOOM, BNK, TIMEFOLIO, PLUS, RISE, WOORI 포함 시)
  - 우선주 제외 (종목코드 끝자리가 5,7,8,9 또는 이름에 "우" 포함)
  - SPAC 제외 (이름에 "스팩" 포함)
  - 시가총액 1조 이상 (stck_prpr × lstn_stcn ≥ 1,000,000,000,000)
  - 거래량순으로 정렬 후 상위 10종목

**20종목 데이터 수집** (1차+2차 각 종목마다):
- 현재가 API (FHKST01010100): 현재가, 52주고가(stck_hgpr)
- 일별시세 API (FHKST01010400): 최근 30일 (종가stck_clpr, 시가stck_oprc, 거래량acml_vol)
  - Query: FID_COND_MRKT_DIV_CODE=J, FID_INPUT_ISCD=종목코드, FID_INPUT_DATE_1=(오늘), FID_INPUT_DATE_2=(30영업일전), FID_PERIOD_DIV_CODE=D, FID_ORG_ADJ_PRC=0
- 투자자별 API (FHKST01010900): 최근 5일 외국인 순매수
  - Query: FID_COND_MRKT_DIV_CODE=J, FID_INPUT_ISCD=종목코드
  - Response: output에서 frgn_ntby_qty (외국인순매수량), 최근 5일분

**⚠ API 호출 속도 제한**: 초당 20건 제한. 20종목 × 3개 API = 60건이니까 순차처리하되, 각 호출 사이 최소 100ms 대기 (setTimeout/sleep). 한 종목의 3개 API를 순서대로 호출 후 다음 종목으로.

### 2. 100점 스코어링 계산

각 종목 데이터로 8개 지표 계산 → 점수 변환:

```
① 거래량 강도 (15점)
   - 원본: 5일평균거래량 ÷ 20일평균거래량
   - 점수: ≥2.0→15, ≥1.5→12, ≥1.2→9, ≥0.8→6, else→0

② 52주 고가 근접 (15점)
   - 원본: 현재가 ÷ 52주고가 × 100
   - 점수: ≥95%→15, ≥90%→12, ≥85%→9, ≥80%→6, else→0

③ 5일선 이격 (10점)
   - 원본: (현재가 - MA5) ÷ MA5 × 100
   - 점수: 0~3%→10, 3~5%→7, 5~7%→4, else→0

④ 정배열 (10점)
   - MA5 > MA20 → 10, else → 0

⑤ 20일선 기울기 (10점)
   - 원본: (오늘MA20 - 5일전MA20) ÷ 5일전MA20 × 100
   - 점수: ≥1%→10, ≥0.5%→7, ≥0%→4, else→0

⑥ 외국인 수급 (15점)
   - 최근 5일 중 순매수일 수
   - 점수: 5일→15, 4일→12, 3일→9, 2일→6, else→0

⑦ 연속 양봉 (10점)
   - 최근 5일 중 종가>시가인 날 수 × 2 (최대 10)

⑧ 이격도 적정성 (15점)
   - 원본: 현재가 ÷ MA20 × 100
   - 점수: 100~105%→15, 105~108%→10, 97~100%→7, else→0
```

**필터 (PASS/FAIL)**:
- 현재가 > MA5 AND 20일선기울기 > 0 AND 거래량비율 ≥ 0.8
- 3개 모두 충족 = PASS

**순위 결정**:
- PASS 종목 중 60점 이상만 매수 후보
- 동점 시 1차 풀 우선
- 1위 종목 = 이번 주 매수 종목

### 3. Supabase 이력 저장

스크리닝 실행 시 screening_history 테이블에 UPSERT:
```
strategy: 'swing'
screen_date: 오늘 날짜
year: 현재 연도
week_num: ISO 주차 번호
result: 전체 스크리닝 결과 (JSONB) — 20종목 점수, 순위, 필터 결과 모두 포함
selected_ticker: 1위 종목 코드
```
- UNIQUE: (strategy, year, week_num) — 같은 주에 다시 실행하면 덮어쓰기

### 4. UI: `app/swing/page.tsx`

기존 잔고현황 페이지(app/page.tsx)의 Excel 스타일 유지.

**레이아웃**:
```
[스크리닝 실행] 버튼 + [주차 선택] 드롭다운

── 1차 풀 (고정 10종목) ──────────────────
| 순위 | 종목명 | 현재가 | 점수 | 필터 | 세부점수... |
|------|--------|--------|------|------|------------|

── 2차 풀 (동적 10종목) ──────────────────  
| 순위 | 종목명 | 현재가 | 점수 | 필터 | 세부점수... |
|------|--------|--------|------|------|------------|

🏆 이번 주 매수 종목: [종목명] (XX점)
```

**테이블 컬럼**:
순위, 풀구분(1차/2차), 종목코드, 종목명, 현재가, 총점, 필터(PASS/FAIL),
거래량(15), 52주고가(15), 5일선이격(10), 정배열(10), 기울기(10), 외국인(15), 양봉(10), 이격도(15)

**스타일 규칙**:
- 1위 종목 행: 노란 하이라이트 (#FFFDE7)
- PASS: 초록 배경 (#c6efce), FAIL: 빨강 배경 (#ffc7ce)
- 점수 만점: 진한 초록, 0점: 빨강
- 1차/2차 풀 구분선 표시
- 로딩 중: "스크리닝 중... (X/20)" 프로그레스 표시

**주차 이력 조회**:
- 드롭다운으로 과거 주차 선택 → screening_history에서 result 조회 → 같은 테이블로 표시
- 최신 주차가 기본 선택

---

## 구현 순서 제안
1. API route 먼저 (`/api/swing/route.ts`) — 2차 풀 수집 → 데이터 수집 → 스코어링
2. UI 페이지 (`app/swing/page.tsx`)
3. 이력 저장/조회 연동

## 중요 참고사항
- 한투 API 공통 헤더: content-type(application/json; charset=utf-8), authorization(Bearer 토큰), appkey, appsecret, tr_id, custtype('P')
- 모든 API는 GET 방식
- 기존 balance route 패턴 참고해서 직접 fetch 사용
- rate limit: 호출 사이 100ms sleep 필수
- 토큰은 lib/kis-auth.ts의 getToken() 사용
