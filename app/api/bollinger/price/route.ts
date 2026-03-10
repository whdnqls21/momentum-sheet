import { NextResponse } from 'next/server';
import { getToken, invalidateToken, wasTokenRecentlyIssued } from '@/lib/kis-auth';
import { acquireSlot } from '@/lib/rate-limiter';
import { supabase } from '@/lib/supabase';
import { KIS_BASE_URL, KIS_TR_IDS, TRADING_RULES } from '@/lib/constants';

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

export async function GET() {
  try {
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
    const stopLossPrice = Math.floor(h.buy_price * (1 + TRADING_RULES.bollinger.stopLoss / 100));

    // 2. 현재가 조회 (FHKST01010100)
    console.log(`[BB Price] 현재가 조회: ${h.ticker_code} ${h.ticker_name}`);
    const data = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      KIS_TR_IDS.PRICE,
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: h.ticker_code,
      }
    );

    const currentPrice = parseFloat(data.output?.stck_prpr) || 0;
    const profitRate = currentPrice > 0
      ? Math.round((currentPrice - h.buy_price) / h.buy_price * 10000) / 100
      : 0;
    const profitLoss = (currentPrice - h.buy_price) * h.buy_qty;
    const stopLossNear = currentPrice > 0 && currentPrice <= h.buy_price * (1 + TRADING_RULES.bollinger.slAlert / 100);

    // 3. 일별시세 조회 (FHKST01010400) → MA20 계산
    let ma20: number | null = null;
    let aboveMa20 = false;
    try {
      console.log(`[BB Price] 일별시세 조회: ${h.ticker_code} ${h.ticker_name}`);
      const dailyData = await kisGet(
        '/uapi/domestic-stock/v1/quotations/inquire-daily-price',
        KIS_TR_IDS.DAILY_PRICE,
        {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: h.ticker_code,
          FID_INPUT_DATE_1: '',
          FID_INPUT_DATE_2: '',
          FID_PERIOD_DIV_CODE: 'D',
          FID_ORG_ADJ_PRC: '0',
        }
      );
      const dailyList = (dailyData.output || []) as any[];
      const closes = dailyList
        .slice(0, 20)
        .map((d: any) => parseFloat(d.stck_clpr) || 0)
        .filter((v: number) => v > 0);
      if (closes.length >= 20) {
        ma20 = Math.round(closes.reduce((a: number, b: number) => a + b, 0) / 20);
        aboveMa20 = currentPrice >= ma20;
      }
    } catch (err: unknown) {
      console.error(`[BB Price] MA20 계산 실패:`, (err as Error).message);
    }

    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const updatedAt = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

    return NextResponse.json({
      holding: {
        code: h.ticker_code,
        name: h.ticker_name,
        buyDate: h.buy_date,
        buyPrice: h.buy_price,
        buyQty: h.buy_qty,
        buyAmount: h.buy_amount,
        currentPrice,
        profitRate,
        profitLoss,
        stopLossPrice,
        stopLossNear,
        ma20,
        aboveMa20,
        updatedAt,
      },
    });
  } catch (err: unknown) {
    console.error('[BB Price API] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || '현재가 조회 실패' }, { status: 500 });
  }
}