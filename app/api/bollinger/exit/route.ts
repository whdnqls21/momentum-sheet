import { NextResponse } from 'next/server';
import { getToken, invalidateToken, wasTokenRecentlyIssued } from '@/lib/kis-auth';
import { acquireSlot } from '@/lib/rate-limiter';
import { supabase } from '@/lib/supabase';
import { KIS_BASE_URL, KIS_TR_IDS, TRADING_RULES } from '@/lib/constants';
import { calculateBollingerBand, getBBExitSignal } from '@/lib/bollinger';
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    // 1. journal에서 볼린저 보유 종목 조회
    const { data: holdings, error: dbError } = await supabase
      .from('journal')
      .select('*')
      .eq('strategy', 'bollinger')
      .is('sell_date', null)
      .order('buy_date', { ascending: false })
      .limit(1);

    if (dbError) throw new Error(dbError.message);

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({ holding: null });
    }

    const h = holdings[0];
    const baseHolding = {
      code: h.ticker_code,
      name: h.ticker_name,
      buyDate: h.buy_date,
      buyPrice: h.buy_price,
      buyQty: h.buy_qty,
      buyAmount: h.buy_amount,
      stopLossPrice: Math.floor(h.buy_price * (1 + TRADING_RULES.bollinger.stopLoss / 100)),
    };

    // refresh=false → journal 정보만 반환
    if (!refresh) {
      return NextResponse.json({ holding: baseHolding });
    }

    // 2. refresh=true → KIS API 호출하여 %B 계산
    const today = new Date();
    const endDate = formatDate(today);
    const ago = new Date(today);
    ago.setDate(ago.getDate() - 60);
    const startDate = formatDate(ago);

    console.log(`[BB Exit] API 호출: ${h.ticker_code} ${h.ticker_name}`);
    const data = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      KIS_TR_IDS.PERIOD_PRICE,
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: h.ticker_code,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
        FID_PERIOD_DIV_CODE: 'D',
        FID_ORG_ADJ_PRC: '0',
      }
    );

    const currentPrice = parseFloat(data.output1?.stck_prpr) || 0;
    const dailyList = (data.output2 || []) as any[];
    const prices = dailyList.map((d: any) => parseFloat(d.stck_clpr) || 0);

    const bb = calculateBollingerBand(prices);
    const percentB = bb?.percentB ?? null;
    const exitSignal = getBBExitSignal(percentB);

    const profitRate = currentPrice > 0
      ? Math.round((currentPrice - h.buy_price) / h.buy_price * 10000) / 100
      : 0;
    const profitLoss = (currentPrice - h.buy_price) * h.buy_qty;

    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const updatedAt = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

    return NextResponse.json({
      holding: {
        ...baseHolding,
        currentPrice,
        profitRate,
        profitLoss,
        percentB,
        exitSignal,
        bb: bb ? { upper: bb.upper, middle: bb.middle, lower: bb.lower } : null,
        updatedAt,
      },
    });
  } catch (err: unknown) {
    console.error('[BB Exit API] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || '매도 신호 확인 실패' }, { status: 500 });
  }
}