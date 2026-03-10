import { NextResponse } from 'next/server';
import { getToken, invalidateToken, wasTokenRecentlyIssued } from '@/lib/kis-auth';
import { acquireSlot } from '@/lib/rate-limiter';
import { supabase } from '@/lib/supabase';
import { KIS_BASE_URL, KIS_TR_IDS } from '@/lib/constants';
import { calculateRSI, getEntrySignal } from '@/lib/rsi';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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
      await new Promise(r => setTimeout(r, 1000));
      return kisGet(path, trId, params, true);
    }
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
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: '종목코드(code) 필수' }, { status: 400 });
    }

    const today = new Date();
    const endDate = formatDate(today);
    const ago = new Date(today);
    ago.setDate(ago.getDate() - 150);
    const startDate = formatDate(ago);

    console.log(`[RSI Refresh] API 호출: ${code}`);
    const data = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      KIS_TR_IDS.PERIOD_PRICE,
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: code,
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: endDate,
        FID_PERIOD_DIV_CODE: 'D',
        FID_ORG_ADJ_PRC: '0',
      }
    );

    const dailyList = (data.output2 || []) as Array<{ stck_clpr: string }>;
    const rsi = calculateRSI(dailyList);
    const signal = getEntrySignal(rsi);

    const rsiRounded = rsi !== null ? Math.round(rsi * 10) / 10 : null;

    // screening_history의 1위 ETF RSI 값 업데이트
    const screenDate = searchParams.get('screen_date');
    if (screenDate) {
      const res = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/screening_history?strategy=eq.sector&screen_date=eq.${screenDate}&select=id,result`,
        {
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
            Accept: 'application/json',
          },
          cache: 'no-store',
        }
      );
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0];
        const result = Array.isArray(row.result) ? row.result : [];
        const updated = result.map((etf: any) =>
          etf.code === code ? { ...etf, rsi: rsiRounded } : etf
        );
        await supabase
          .from('screening_history')
          .update({ result: updated })
          .eq('id', row.id);
        console.log(`[RSI Refresh] DB 업데이트: ${screenDate} / ${code} → RSI ${rsiRounded}`);
      }
    }

    return NextResponse.json({
      rsi: rsiRounded,
      signal,
      updatedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }),
    });
  } catch (err: unknown) {
    console.error('[RSI Refresh] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || 'RSI 새로고침 실패' }, { status: 500 });
  }
}