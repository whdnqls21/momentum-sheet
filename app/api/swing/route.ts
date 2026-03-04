import { NextResponse } from 'next/server';
import { getToken, invalidateToken, wasTokenRecentlyIssued } from '@/lib/kis-auth';
import { acquireSlot } from '@/lib/rate-limiter';
import { supabase } from '@/lib/supabase';
import { KIS_BASE_URL, KIS_TR_IDS, SWING_POOL_1, ETF_KEYWORDS } from '@/lib/constants';
import type { SwingStock, SwingScores, SwingRaw } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── 한투 API GET ──
async function kisGet(path: string, trId: string, params: Record<string, string>, _retry = false): Promise<any> {
  await acquireSlot();

  const token = await getToken();
  const url = new URL(path, KIS_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY!,
      appsecret: process.env.KIS_APP_SECRET!,
      tr_id: trId,
      custtype: 'P',
    },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null);

  // 토큰 만료: HTTP 500이어도 body에 EGW00123이면 재발급 후 재시도
  const msgCd = data?.msg_cd || '';
  const msg1 = data?.msg1 || '';
  if (!_retry && (msgCd === 'EGW00123' || msg1.includes('token'))) {
    if (await wasTokenRecentlyIssued()) {
      console.log(`[KIS] 최근 발급 토큰으로 EGW00123 수신, 1초 후 동일 토큰 재시도`);
      await new Promise(r => setTimeout(r, 1000));
      return kisGet(path, trId, params, true);
    }
    console.log(`[KIS] 토큰 만료 감지 (${msgCd}), 재발급 후 재시도`);
    await invalidateToken();
    return kisGet(path, trId, params, true);
  }

  if (!res.ok) {
    console.error(`[KIS] ${trId} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    throw new Error(`KIS ${trId} ${res.status}`);
  }

  if (!data || data.rt_cd !== '0') throw new Error(`KIS [${msgCd}] ${msg1}`);
  return data;
}

// ── 2차 풀 수집 ──
async function fetchSecondaryPool(primaryCodes: Set<string>): Promise<{ code: string; name: string }[]> {
  // 거래량순위 — docs/kis-api-reference.md §6 공식 예제
  console.log('[Swing] API 호출: 거래량순위 (FHPST01710000)');
  const volData = await kisGet(
    '/uapi/domestic-stock/v1/quotations/volume-rank',
    KIS_TR_IDS.VOLUME_RANK,
    {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_COND_SCR_DIV_CODE: '20171',
      FID_INPUT_ISCD: '0000',
      FID_DIV_CLS_CODE: '0',
      FID_BLNG_CLS_CODE: '0',
      FID_TRGT_CLS_CODE: '111111111',
      FID_TRGT_EXLS_CLS_CODE: '000000',
      FID_INPUT_PRICE_1: '0',
      FID_INPUT_PRICE_2: '0',
      FID_VOL_CNT: '0',
      FID_INPUT_DATE_1: '0',
    }
  );

  // 신고가근접 — docs/kis-api-reference.md §7 공식 예제 (키 소문자!)
  console.log('[Swing] API 호출: 신고가근접 (FHPST01870000)');
  const highData = await kisGet(
    '/uapi/domestic-stock/v1/ranking/near-new-highlow',
    KIS_TR_IDS.NEW_HIGH,
    {
      fid_cond_mrkt_div_code: 'J',
      fid_cond_scr_div_code: '20187',
      fid_div_cls_code: '0',
      fid_input_cnt_1: '',
      fid_input_cnt_2: '',
      fid_prc_cls_code: '0',
      fid_input_iscd: '0000',
      fid_trgt_cls_code: '0',
      fid_trgt_exls_cls_code: '0',
      fid_aply_rang_prc_1: '',
      fid_aply_rang_prc_2: '',
      fid_aply_rang_vol: '0',
    }
  );

  // 후보 합치기: 거래량순위 30건 + 신고가근접 30건
  const candidates: { code: string; name: string; price: number; volume: number; shares: number }[] = [];
  const seen = new Set<string>();

  for (const item of (volData.output || []).slice(0, 30)) {
    const code = item.mksc_shrn_iscd;
    if (!seen.has(code)) {
      seen.add(code);
      candidates.push({
        code,
        name: item.hts_kor_isnm,
        price: parseInt(item.stck_prpr) || 0,
        volume: parseInt(item.acml_vol) || 0,
        shares: parseInt(item.lstn_stcn) || 0,
      });
    }
  }

  for (const item of (highData.output || []).slice(0, 30)) {
    const code = item.mksc_shrn_iscd;
    if (!seen.has(code)) {
      seen.add(code);
      candidates.push({
        code,
        name: item.hts_kor_isnm,
        price: parseInt(item.stck_prpr) || 0,
        volume: parseInt(item.acml_vol) || 0,
        shares: parseInt(item.lstn_stcn) || 0,
      });
    }
  }

  console.log(`[Swing] 후보 총 ${candidates.length}개 (중복 제거 후)`);

  // 기본 필터 + 시총 1조 필터
  const FUND_KEYWORDS = ['채권', '머니마켓', '크레딧', '액티브', '인버스', '레버리지', '선물', '금리', '국고', '통안'];
  const result: { code: string; name: string }[] = [];

  for (const c of candidates) {
    if (primaryCodes.has(c.code)) continue;
    if (/[^0-9]/.test(c.code)) continue;
    if (ETF_KEYWORDS.some((kw) => c.name.includes(kw))) continue;
    if (FUND_KEYWORDS.some((kw) => c.name.includes(kw))) continue;
    if (['5', '7', '8', '9'].includes(c.code.charAt(5))) continue;
    if (c.name.includes('스팩')) continue;
    if (c.price <= 0) continue;

    // 시총 1조 필터
    if (c.shares > 0) {
      const marketCap = c.price * c.shares;
      if (marketCap < 1_000_000_000_000) continue;
      result.push({ code: c.code, name: c.name });
    } else {
      try {
        const priceData = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-price',
          KIS_TR_IDS.PRICE,
          { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: c.code }
        );
        const htsAvls = parseInt(priceData.output?.hts_avls) || 0;
        if (htsAvls >= 10000) {
          result.push({ code: c.code, name: c.name });
        }
      } catch {
        // 시총 확인 실패 → 제외
      }
    }
  }

  console.log(`[Swing] 2차 풀: ${result.length}개 — ${result.map((s) => s.name).join(', ')}`);
  return result;
}

// ── 종목별 데이터 수집 ──
interface StockData {
  code: string;
  name: string;
  price: number;
  high52: number;
  daily: { close: number; open: number; volume: number }[];
  foreignBuys: number[];
}

async function fetchStockData(code: string, name: string): Promise<StockData> {
  // 현재가 — docs/kis-api-reference.md §2
  console.log(`[Swing] API 호출: 현재가 (FHKST01010100) - ${code} ${name}`);
  const priceData = await kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-price',
    KIS_TR_IDS.PRICE,
    { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
  );
  const output = priceData.output;
  const price = parseInt(output.stck_prpr) || 0;
  const high52 = parseInt(output.w52_hgpr) || 0;

  // 일자별시세 — docs/kis-api-reference.md §3
  console.log(`[Swing] API 호출: 일자별시세 (FHKST01010400) - ${code}`);
  const dailyData = await kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-daily-price',
    KIS_TR_IDS.DAILY_PRICE,
    {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: code,
      FID_PERIOD_DIV_CODE: 'D',
      FID_ORG_ADJ_PRC: '0',
    }
  );
  const daily = ((dailyData.output || []) as any[])
    .slice(0, 30)
    .map((d: any) => ({
      close: parseInt(d.stck_clpr) || 0,
      open: parseInt(d.stck_oprc) || 0,
      volume: parseInt(d.acml_vol) || 0,
    }));

  // 투자자별 — docs/kis-api-reference.md §4
  console.log(`[Swing] API 호출: 투자자별 (FHKST01010900) - ${code}`);
  const investorData = await kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-investor',
    KIS_TR_IDS.INVESTOR,
    { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
  );
  const foreignBuys = ((investorData.output || []) as any[])
    .slice(0, 5)
    .map((d: any) => parseInt(d.frgn_ntby_qty) || 0);

  return { code, name, price, high52, daily, foreignBuys };
}

// ── 스코어링 ──
function scoreStock(data: StockData, pool: '1차' | '2차'): SwingStock {
  const { daily, price, high52, foreignBuys } = data;

  if (daily.length < 20) {
    return {
      code: data.code, name: data.name, price, pool, pass: false, score: 0,
      scores: { vol: 0, high: 0, ma5: 0, align: 0, slope: 0, foreign: 0, candle: 0, gap: 0 },
      raw: { volRatio: 0, highRatio: 0, ma5Gap: 0, slope: 0, foreignDays: 0, bullDays: 0, gapRatio: 0, isAligned: false },
      error: '일별 데이터 부족',
    };
  }

  const closes = daily.map((d) => d.close);
  const volumes = daily.map((d) => d.volume);

  // MA 계산
  const ma5 = avg(closes.slice(0, 5));
  const ma20 = avg(closes.slice(0, 20));
  const ma20_5ago = daily.length >= 25 ? avg(closes.slice(5, 25)) : ma20;

  // 지표 계산
  const vol5 = avg(volumes.slice(0, 5));
  const vol20 = avg(volumes.slice(0, 20));
  const volRatio = vol20 > 0 ? vol5 / vol20 : 0;

  const highRatio = high52 > 0 ? (price / high52) * 100 : 0;
  const ma5Gap = ma5 > 0 ? ((price - ma5) / ma5) * 100 : 0;
  const isAligned = ma5 > ma20;
  const slopeVal = ma20_5ago > 0 ? ((ma20 - ma20_5ago) / ma20_5ago) * 100 : 0;

  const foreignDays = foreignBuys.filter((v) => v > 0).length;
  const bullDays = daily.slice(0, 5).filter((d) => d.close > d.open).length;
  const gapRatio = ma20 > 0 ? (price / ma20) * 100 : 0;

  // 점수 변환
  const scores: SwingScores = {
    vol: volRatio >= 2.0 ? 15 : volRatio >= 1.5 ? 12 : volRatio >= 1.2 ? 9 : volRatio >= 0.8 ? 6 : 0,
    high: highRatio >= 95 ? 15 : highRatio >= 90 ? 12 : highRatio >= 85 ? 9 : highRatio >= 80 ? 6 : 0,
    ma5: ma5Gap >= 0 && ma5Gap < 3 ? 10 : ma5Gap >= 3 && ma5Gap < 5 ? 7 : ma5Gap >= 5 && ma5Gap < 7 ? 4 : 0,
    align: isAligned ? 10 : 0,
    slope: slopeVal >= 1 ? 10 : slopeVal >= 0.5 ? 7 : slopeVal >= 0 ? 4 : 0,
    foreign: foreignDays >= 5 ? 15 : foreignDays >= 4 ? 12 : foreignDays >= 3 ? 9 : foreignDays >= 2 ? 6 : 0,
    candle: Math.min(bullDays * 2, 10),
    gap: gapRatio >= 100 && gapRatio < 105 ? 15 : gapRatio >= 105 && gapRatio < 108 ? 10 : gapRatio >= 97 && gapRatio < 100 ? 7 : 0,
  };

  const score = Object.values(scores).reduce((a, b) => a + b, 0);

  // 필터
  const pass = price > ma5 && slopeVal > 0 && volRatio >= 0.8;

  return {
    code: data.code,
    name: data.name,
    price,
    pool,
    pass,
    score,
    scores,
    raw: {
      volRatio: round2(volRatio),
      highRatio: round2(highRatio),
      ma5Gap: round2(ma5Gap),
      slope: round2(slopeVal),
      foreignDays,
      bullDays,
      gapRatio: round2(gapRatio),
      isAligned,
    },
  };
}

// ── ISO 주차 ──
function getISOWeek(date: Date): { year: number; week: number; label: string } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week, label: `${d.getUTCFullYear()}년 ${week}주차` };
}

// ── Supabase 저장 ──
async function saveHistory(stocks: SwingStock[], weekInfo: { year: number; week: number; label: string }, selectedTicker: string | null, selectedName: string | null) {
  const screenDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 같은 주차 기존 데이터 삭제 후 새로 삽입 (partial unique index와 PostgREST upsert 호환 문제 우회)
  await supabase
    .from('screening_history')
    .delete()
    .eq('strategy', 'swing')
    .eq('year', weekInfo.year)
    .eq('week_num', weekInfo.week);

  const { error } = await supabase
    .from('screening_history')
    .insert({
      strategy: 'swing',
      screen_date: screenDate,
      year: weekInfo.year,
      week_num: weekInfo.week,
      week_label: weekInfo.label,
      result: stocks,
      selected_ticker: selectedTicker,
      selected_name: selectedName,
    });

  if (error) {
    console.error('[Swing] Supabase 저장 실패:', error.message);
  } else {
    console.log(`[Swing] Supabase 저장 성공: ${screenDate} (${weekInfo.label}), 선택: ${selectedName || '없음'}`);
  }
}

// ── 유틸 ──
function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── API Handler ──
export async function GET() {
  try {
    const primaryCodes = new Set(SWING_POOL_1.map((s) => s.code));

    // 1) 2차 풀 수집
    console.log('[Swing] 2차 풀 수집 시작');
    const secondaryPool = await fetchSecondaryPool(primaryCodes);
    console.log(`[Swing] 2차 풀: ${secondaryPool.map((s) => s.name).join(', ')}`);

    // 2) 20종목 데이터 수집 + 스코어링
    const allStocks: SwingStock[] = [];
    const totalCount = SWING_POOL_1.length + secondaryPool.length;
    let processed = 0;

    // 1차 풀
    for (const stock of SWING_POOL_1) {
      try {
        const data = await fetchStockData(stock.code, stock.name);
        allStocks.push(scoreStock(data, '1차'));
      } catch (err: any) {
        console.error(`[Swing] ${stock.code} ${stock.name} 데이터 수집 실패:`, err.message);
        allStocks.push({
          code: stock.code, name: stock.name, price: 0, pool: '1차', pass: false, score: 0,
          scores: { vol: 0, high: 0, ma5: 0, align: 0, slope: 0, foreign: 0, candle: 0, gap: 0 },
          raw: { volRatio: 0, highRatio: 0, ma5Gap: 0, slope: 0, foreignDays: 0, bullDays: 0, gapRatio: 0, isAligned: false },
          error: err.message,
        });
      }
      processed++;
      console.log(`[Swing] 진행: ${processed}/${totalCount}`);
    }

    // 2차 풀
    for (const stock of secondaryPool) {
      try {
        const data = await fetchStockData(stock.code, stock.name);
        allStocks.push(scoreStock(data, '2차'));
      } catch (err: any) {
        console.error(`[Swing] ${stock.code} ${stock.name} 데이터 수집 실패:`, err.message);
        allStocks.push({
          code: stock.code, name: stock.name, price: 0, pool: '2차', pass: false, score: 0,
          scores: { vol: 0, high: 0, ma5: 0, align: 0, slope: 0, foreign: 0, candle: 0, gap: 0 },
          raw: { volRatio: 0, highRatio: 0, ma5Gap: 0, slope: 0, foreignDays: 0, bullDays: 0, gapRatio: 0, isAligned: false },
          error: err.message,
        });
      }
      processed++;
      console.log(`[Swing] 진행: ${processed}/${totalCount}`);
    }

    // 3) 순위 정렬: PASS + 60점 이상 → 1차풀 우선 → 점수순
    allStocks.sort((a, b) => {
      const aQualified = a.pass && a.score >= 60 ? 1 : 0;
      const bQualified = b.pass && b.score >= 60 ? 1 : 0;
      if (aQualified !== bQualified) return bQualified - aQualified;
      if (a.pool !== b.pool) return a.pool === '1차' ? -1 : 1;
      return b.score - a.score;
    });

    // 4) 1위 종목
    const top = allStocks.find((s) => s.pass && s.score >= 60) || null;

    // 5) Supabase 저장
    const weekInfo = getISOWeek(new Date());
    await saveHistory(allStocks, weekInfo, top?.code || null, top?.name || null);

    return NextResponse.json({
      stocks: allStocks,
      selected: top ? { code: top.code, name: top.name, score: top.score } : null,
      week: weekInfo,
      processedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Swing API] 에러:', err.message);
    return NextResponse.json({ error: err.message || '스크리닝 실패' }, { status: 500 });
  }
}