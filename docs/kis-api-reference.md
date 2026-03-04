# 한국투자증권 오픈API 파라미터 레퍼런스

> ⚠ 이 문서는 공식 엑셀 문서에서 직접 추출한 정확한 파라미터입니다.
> API 호출 시 반드시 이 문서의 파라미터를 그대로 사용하세요.

---

## 1. 잔고조회 (TTTC8434R)

- **Method**: GET
- **URL**: `/uapi/domestic-stock/v1/trading/inquire-balance`
- **tr_id**: `TTTC8434R`

### Request Query Parameters
```json
{
  "CANO": "계좌번호 앞 8자리",
  "ACNT_PRDT_CD": "01",
  "AFHR_FLPR_YN": "N",
  "OFL_YN": "",
  "INQR_DVSN": "01",
  "UNPR_DVSN": "01",
  "FUND_STTL_ICLD_YN": "N",
  "FNCG_AMT_AUTO_RDPT_YN": "N",
  "PRCS_DVSN": "00",
  "CTX_AREA_FK100": "",
  "CTX_AREA_NK100": ""
}
```

### Response 주요 필드
**output1** (종목별 배열):
- `pdno`: 종목코드 (뒷 6자리)
- `prdt_name`: 종목명
- `hldg_qty`: 보유수량
- `pchs_avg_pric`: 매입평균가격
- `pchs_amt`: 매입금액
- `prpr`: 현재가
- `evlu_amt`: 평가금액
- `evlu_pfls_amt`: 평가손익금액
- `evlu_pfls_rt`: 평가손익율(%)
- `fltt_rt`: 등락율

**output2** (계좌 요약):
- `dnca_tot_amt`: 예수금총금액
- `prvs_rcdl_excc_amt`: D+2 예수금
- `pchs_amt_smtl_amt`: 매입금액합계
- `evlu_amt_smtl_amt`: 평가금액합계
- `evlu_pfls_smtl_amt`: 평가손익합계
- `tot_evlu_amt`: 총평가금액

---

## 2. 현재가 시세 (FHKST01010100)

- **Method**: GET
- **URL**: `/uapi/domestic-stock/v1/quotations/inquire-price`
- **tr_id**: `FHKST01010100`

### Request Query Parameters
```json
{
  "FID_COND_MRKT_DIV_CODE": "J",
  "FID_INPUT_ISCD": "종목코드"
}
```

### Response 주요 필드 (output)
- `stck_prpr`: 현재가
- `prdy_vrss`: 전일 대비
- `prdy_ctrt`: 전일 대비율
- `acml_vol`: 누적 거래량
- `stck_hgpr`: 최고가
- `stck_lwpr`: 최저가
- `w52_hgpr`: 52주 최고가
- `w52_lwpr`: 52주 최저가
- `hts_avls`: HTS 시가총액
- `lstn_stcn`: 상장 주수
- `per`: PER
- `pbr`: PBR

---

## 3. 일자별 시세 (FHKST01010400)

- **Method**: GET
- **URL**: `/uapi/domestic-stock/v1/quotations/inquire-daily-price`
- **tr_id**: `FHKST01010400`
- **최대 30건** (일/주/월)

### Request Query Parameters
```json
{
  "FID_COND_MRKT_DIV_CODE": "J",
  "FID_INPUT_ISCD": "종목코드",
  "FID_PERIOD_DIV_CODE": "D",
  "FID_ORG_ADJ_PRC": "0"
}
```

### Response 주요 필드 (output 배열)
- `stck_bsop_date`: 영업일자 (YYYYMMDD)
- `stck_oprc`: 시가
- `stck_hgpr`: 고가
- `stck_lwpr`: 저가
- `stck_clpr`: 종가
- `acml_vol`: 거래량
- `frgn_ntby_qty`: 외국인 순매수 수량

---

## 4. 투자자별 매매동향 (FHKST01010900)

- **Method**: GET
- **URL**: `/uapi/domestic-stock/v1/quotations/inquire-investor`
- **tr_id**: `FHKST01010900`

### Request Query Parameters
```json
{
  "FID_COND_MRKT_DIV_CODE": "J",
  "FID_INPUT_ISCD": "종목코드"
}
```

### Response 주요 필드 (output 배열)
- `stck_bsop_date`: 영업일자
- `stck_clpr`: 종가
- `prsn_ntby_qty`: 개인 순매수 수량
- `frgn_ntby_qty`: 외국인 순매수 수량
- `orgn_ntby_qty`: 기관계 순매수 수량

---

## 5. 기간별시세 (FHKST03010100)

- **Method**: GET
- **URL**: `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`
- **tr_id**: `FHKST03010100`
- **최대 100건**

### Request Query Parameters
```json
{
  "FID_COND_MRKT_DIV_CODE": "J",
  "FID_INPUT_ISCD": "종목코드",
  "FID_INPUT_DATE_1": "시작일(YYYYMMDD)",
  "FID_INPUT_DATE_2": "종료일(YYYYMMDD)",
  "FID_PERIOD_DIV_CODE": "D",
  "FID_ORG_ADJ_PRC": "0"
}
```

### Response 주요 필드
**output1** (현재 정보):
- `stck_prpr`: 현재가
- `hts_kor_isnm`: 종목명

**output2** (일별 배열, 최신→과거 순):
- `stck_bsop_date`: 영업일자
- `stck_clpr`: 종가
- `stck_oprc`: 시가
- `stck_hgpr`: 고가
- `stck_lwpr`: 저가
- `acml_vol`: 거래량

---

## 6. 거래량순위 (FHPST01710000)

- **Method**: GET
- **URL**: `/uapi/domestic-stock/v1/quotations/volume-rank`
- **tr_id**: `FHPST01710000`
- **최대 30건, 연속조회 불가**

### ⚠ Request Query Parameters (공식 예제 그대로)
```json
{
  "FID_COND_MRKT_DIV_CODE": "J",
  "FID_COND_SCR_DIV_CODE": "20171",
  "FID_INPUT_ISCD": "0000",
  "FID_DIV_CLS_CODE": "0",
  "FID_BLNG_CLS_CODE": "0",
  "FID_TRGT_CLS_CODE": "111111111",
  "FID_TRGT_EXLS_CLS_CODE": "000000",
  "FID_INPUT_PRICE_1": "0",
  "FID_INPUT_PRICE_2": "0",
  "FID_VOL_CNT": "0",
  "FID_INPUT_DATE_1": "0"
}
```

> ⚠ **주의**: `FID_COND_SCR_DIV_CODE`는 반드시 `"20171"`. `"20101"`이 아님!
> ⚠ **주의**: `FID_INPUT_DATE_1`은 `"0"` (빈 문자열 아님)

### Response 주요 필드 (output 배열)
- `hts_kor_isnm`: 종목명
- `mksc_shrn_iscd`: 종목코드
- `data_rank`: 순위
- `stck_prpr`: 현재가
- `prdy_vrss`: 전일 대비
- `prdy_ctrt`: 전일 대비율
- `acml_vol`: 누적 거래량
- `lstn_stcn`: 상장 주수
- `avrg_vol`: 평균 거래량
- `vol_inrt`: 거래량증가율

---

## 7. 신고/신저 근접종목 (FHPST01870000)

- **Method**: GET
- **URL**: `/uapi/domestic-stock/v1/ranking/near-new-highlow`
- **tr_id**: `FHPST01870000`
- **최대 30건, 연속조회 불가**

### ⚠ Request Query Parameters (공식 예제 그대로 — 소문자!)
```json
{
  "fid_cond_mrkt_div_code": "J",
  "fid_cond_scr_div_code": "20187",
  "fid_div_cls_code": "0",
  "fid_input_cnt_1": "",
  "fid_input_cnt_2": "",
  "fid_prc_cls_code": "0",
  "fid_input_iscd": "0000",
  "fid_trgt_cls_code": "0",
  "fid_trgt_exls_cls_code": "0",
  "fid_aply_rang_prc_1": "",
  "fid_aply_rang_prc_2": "",
  "fid_aply_rang_vol": "0"
}
```

> ⚠ **주의**: 이 API의 파라미터 키는 **소문자**!
> ⚠ **주의**: `fid_cond_scr_div_code`는 `"20187"` (화면 고유코드)
> ⚠ **주의**: `fid_input_cnt_1`, `fid_input_cnt_2`, `fid_aply_rang_prc_1`, `fid_aply_rang_prc_2`는 빈 문자열 `""`
> ⚠ **주의**: `fid_aply_rang_vol`은 `"0"` (이 필드 누락하면 에러 발생)

### Response 주요 필드 (output 배열)
- `hts_kor_isnm`: 종목명
- `mksc_shrn_iscd`: 종목코드
- `stck_prpr`: 현재가
- `prdy_vrss`: 전일 대비
- `prdy_ctrt`: 전일 대비율
- `acml_vol`: 누적 거래량
- `new_hgpr`: 신 최고가
- `hprc_near_rate`: 고가 근접 비율
- `new_lwpr`: 신 최저가
- `lwpr_near_rate`: 저가 근접 비율

---

## 공통 Request Headers

모든 API에 필수:
```json
{
  "content-type": "application/json; charset=utf-8",
  "authorization": "Bearer {access_token}",
  "appkey": "{KIS_APP_KEY}",
  "appsecret": "{KIS_APP_SECRET}",
  "tr_id": "{각 API의 TR_ID}",
  "custtype": "P"
}
```

## 공통 Response 구조

```json
{
  "rt_cd": "0",       // "0"이면 성공
  "msg_cd": "...",
  "msg1": "...",
  "output": "..."     // 또는 output1, output2
}
```

## 토큰 발급

- **POST** `/oauth2/tokenP`
- Body: `{ "grant_type": "client_credentials", "appkey": "...", "appsecret": "..." }`
- 유효기간: 24시간
- **⚠ 1일 1회 발급 원칙** — Supabase kis_token 테이블에서 재사용 우선
