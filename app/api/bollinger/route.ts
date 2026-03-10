import { NextResponse } from 'next/server';
import { getToken, invalidateToken, wasTokenRecentlyIssued } from '@/lib/kis-auth';
import { acquireSlot } from '@/lib/rate-limiter';
import { supabase } from '@/lib/supabase';
import { KIS_BASE_URL, KIS_TR_IDS, BB_ETFS, TRADING_RULES } from '@/lib/constants';
import { calculateBollingerBand, calculateVolumeRatio, getBBEntrySignal, type BBSignal } from '@/lib/bollinger';
import { formatDate } from '@/lib/utils';

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

interface BBResult {
  code: string;
  name: string;
  price: number;
  percentB: number | null;
  volumeRatio: number | null;
  signal: BBSignal;
  bb: { upper: number; middle: number; lower: number } | null;
}

export async function GET() {
  try {
    const today = new Date();
    const endDate = formatDate(today);
    // 40거래일 ≈ 2개월 여유
    const ago = new Date(today);
    ago.setDate(ago.getDate() - 60);
    const startDate = formatDate(ago);

    const results: BBResult[] = [];

    for (const etf of BB_ETFS) {
      try {
        console.log(`[Bollinger] API 호출: 기간별시세 (FHKST03010100) - ${etf.code} ${etf.name}`);
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

        // 종가 배열 (최신순)
        const prices = dailyList.map((d: any) => parseFloat(d.stck_clpr) || 0);
        // 거래량 배열 (최신순)
        const volumes = dailyList.map((d: any) => parseFloat(d.acml_vol) || 0);

        const bb = calculateBollingerBand(prices);
        const volumeRatio = calculateVolumeRatio(volumes);
        const signal = getBBEntrySignal(bb?.percentB ?? null, volumeRatio);

        results.push({
          code: etf.code,
          name: etf.name,
          price: currentPrice,
          percentB: bb?.percentB ?? null,
          volumeRatio,
          signal,
          bb: bb ? { upper: bb.upper, middle: bb.middle, lower: bb.lower } : null,
        });
      } catch (err: unknown) {
        console.error(`[Bollinger] ${etf.code} ${etf.name} 실패:`, (err as Error).message);
        results.push({
          code: etf.code,
          name: etf.name,
          price: 0,
          percentB: null,
          volumeRatio: null,
          signal: 'NO_DATA',
          bb: null,
        });
      }
    }

    // %B 오름차순 정렬 (NO_DATA는 뒤로)
    results.sort((a, b) => {
      const aB = a.percentB ?? 999;
      const bB = b.percentB ?? 999;
      return aB - bB;
    });

    // BUY 신호 중 %B 가장 낮은 종목 = 매수 후보
    const buyCandidate = results.find(r => r.signal === 'BUY') || null;

    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const year = now.getFullYear();
    const screenDate = now.toISOString().slice(0, 10);

    // Supabase 저장
    const { error: upsertError } = await supabase
      .from('screening_history')
      .upsert({
        strategy: 'bollinger',
        screen_date: screenDate,
        year,
        result: results,
        selected_ticker: buyCandidate?.code || null,
        selected_name: buyCandidate?.name || null,
      }, { onConflict: 'strategy,screen_date', ignoreDuplicates: false });

    if (upsertError) {
      console.error('[Bollinger] Supabase 저장 실패:', upsertError.message);
    } else {
      console.log(`[Bollinger] Supabase 저장 성공: ${screenDate}, 매수후보: ${buyCandidate?.name || '없음'}`);
    }

    // 지정가/손절가 계산
    const bcPrevClose = buyCandidate ? buyCandidate.price : 0;
    const bcLimitPrice = buyCandidate ? Math.floor(bcPrevClose * (1 + TRADING_RULES.bollinger.gapLimit)) : 0;
    const bcStopLoss = buyCandidate ? Math.floor(bcLimitPrice * (1 + TRADING_RULES.bollinger.stopLoss / 100)) : 0;

    return NextResponse.json({
      etfs: results,
      buyCandidate: buyCandidate ? {
        code: buyCandidate.code,
        name: buyCandidate.name,
        percentB: buyCandidate.percentB,
        volumeRatio: buyCandidate.volumeRatio,
        prevClose: bcPrevClose, limitPrice: bcLimitPrice, stopLoss: bcStopLoss,
      } : null,
      screenDate,
      processedAt: now.toISOString(),
    });
  } catch (err: unknown) {
    console.error('[Bollinger API] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || '볼린저 스크리닝 실패' }, { status: 500 });
  }
}