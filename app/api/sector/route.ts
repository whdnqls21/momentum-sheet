import { NextResponse } from 'next/server';
import { getToken, invalidateToken, wasTokenRecentlyIssued } from '@/lib/kis-auth';
import { acquireSlot } from '@/lib/rate-limiter';
import { supabase } from '@/lib/supabase';
import { KIS_BASE_URL, KIS_TR_IDS, SECTOR_ETFS } from '@/lib/constants';
import { calculateRSI } from '@/lib/rsi';

export const dynamic = 'force-dynamic';

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

  if (!res.ok) throw new Error(`KIS ${trId} ${res.status}`);
  if (!data || data.rt_cd !== '0') throw new Error(`KIS [${msgCd}] ${msg1}`);
  return data;
}

// ── 날짜 포맷 ──
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

interface SectorResult {
  code: string;
  name: string;
  price: number;
  m1Return: number;
  m3Return: number | null;
  composite: number;
  rank: number;
  rsi: number | null;
  prices: { current: number; m1Ago: number; m3Ago: number | null };
}

export async function GET() {
  try {
    const today = new Date();
    const endDate = formatDate(today);
    // 100거래일 ≈ 5개월
    const ago = new Date(today);
    ago.setDate(ago.getDate() - 150);
    const startDate = formatDate(ago);

    const results: SectorResult[] = [];

    for (const etf of SECTOR_ETFS) {
      try {
        console.log(`[Sector] API 호출: 기간별시세 (FHKST03010100) - ${etf.code} ${etf.name}`);
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
          KIS_TR_IDS.PERIOD_PRICE,
          {
            FID_COND_MRKT_DIV_CODE: 'J',
            FID_INPUT_ISCD: etf.code,
            FID_INPUT_DATE_1: startDate,
            FID_INPUT_DATE_2: endDate,
            FID_PERIOD_DIV_CODE: 'D',
            FID_ORG_ADJ_PRC: '0',
          }
        );

        const currentPrice = parseFloat(data.output1?.stck_prpr) || 0;
        const dailyList = (data.output2 || []) as any[];

        // 1M전 종가 (20거래일 전)
        const m1Price = dailyList.length > 20 ? parseFloat(dailyList[20].stck_clpr) || 0 : 0;
        // 3M전 종가 (60거래일 전)
        const m3Price = dailyList.length > 59 ? parseFloat(dailyList[59].stck_clpr) || 0 : 0;

        const m1Return = m1Price > 0 ? ((currentPrice - m1Price) / m1Price) * 100 : 0;
        const m3Return = m3Price > 0 ? ((currentPrice - m3Price) / m3Price) * 100 : null;

        // 복합점수: 3M 데이터 있으면 가중, 없으면 1M만
        const composite = m3Return !== null
          ? m1Return * 0.6 + m3Return * 0.4
          : m1Return;

        const rsi = calculateRSI(dailyList);

        results.push({
          code: etf.code,
          name: etf.name,
          price: currentPrice,
          m1Return: round2(m1Return),
          m3Return: m3Return !== null ? round2(m3Return) : null,
          composite: round2(composite),
          rank: 0,
          rsi: rsi !== null ? round1(rsi) : null,
          prices: { current: currentPrice, m1Ago: m1Price, m3Ago: m3Price || null },
        });
      } catch (err: any) {
        console.error(`[Sector] ${etf.code} ${etf.name} 실패:`, err.message);
        results.push({
          code: etf.code,
          name: etf.name,
          price: 0,
          m1Return: 0,
          m3Return: null,
          composite: 0,
          rank: 0,
          rsi: null,
          prices: { current: 0, m1Ago: 0, m3Ago: null },
        });
      }
    }

    // 복합점수 내림차순 정렬 + 순위
    results.sort((a, b) => b.composite - a.composite);
    results.forEach((r, i) => { r.rank = i + 1; });

    const top = results[0];
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1; // 1~12

    // 타겟 월: 월초에 실행하므로 현재 월
    const targetMonth = currentMonth;
    const targetYear = currentYear;

    // Supabase 저장: (strategy, screen_date) 기준 UPSERT — 같은 날 재실행 시 덮어쓰기, 다른 날은 별도 저장
    const screenDate = now.toISOString().slice(0, 10);
    const { error: upsertError } = await supabase
      .from('screening_history')
      .upsert({
        strategy: 'sector',
        screen_date: screenDate,
        year: targetYear,
        month_num: targetMonth,
        month_label: `${targetYear}년 ${targetMonth}월`,
        result: results,
        selected_ticker: top?.code || null,
        selected_name: top?.name || null,
      }, { onConflict: 'strategy,screen_date', ignoreDuplicates: false });

    if (upsertError) {
      console.error('[Sector] Supabase 저장 실패:', upsertError.message);
    } else {
      console.log(`[Sector] Supabase 저장 성공: ${screenDate} (타겟: ${targetYear}년 ${targetMonth}월), 선택: ${top?.name || '없음'}`);
    }

    // 지정가/손절가 계산
    const topPrevClose = top ? top.price : 0;
    const topLimitPrice = top ? Math.floor(topPrevClose * 1.01) : 0;
    const topStopLoss = top ? Math.floor(topLimitPrice * 0.95) : 0;

    return NextResponse.json({
      etfs: results,
      selected: top ? {
        code: top.code, name: top.name, composite: top.composite,
        prevClose: topPrevClose, limitPrice: topLimitPrice, stopLoss: topStopLoss,
      } : null,
      month: { year: targetYear, month: targetMonth, label: `${targetYear}년 ${targetMonth}월` },
      screenDate,
      processedAt: now.toISOString(),
    });
  } catch (err: any) {
    console.error('[Sector API] 에러:', err.message);
    return NextResponse.json({ error: err.message || '섹터 스크리닝 실패' }, { status: 500 });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}