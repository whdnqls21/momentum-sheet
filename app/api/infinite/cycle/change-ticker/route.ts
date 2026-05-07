import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { INFINITE_BUY_STOCKS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker) {
      return NextResponse.json({ error: 'ticker 필수' }, { status: 400 });
    }
    if (!INFINITE_BUY_STOCKS.some(s => s.ticker === ticker)) {
      return NextResponse.json({ error: `허용되지 않은 종목: ${ticker}` }, { status: 400 });
    }

    const { data: cycle, error: cycleErr } = await supabase
      .from('infinite_buy_cycle')
      .select('*')
      .eq('status', 'active')
      .order('cycle_num', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cycleErr) throw new Error(cycleErr.message);
    if (!cycle) {
      return NextResponse.json({ error: '활성 사이클이 없습니다' }, { status: 400 });
    }
    if (cycle.ticker === ticker) {
      return NextResponse.json({ error: '이미 동일한 종목입니다' }, { status: 400 });
    }
    if ((cycle.used_slots || 0) > 0) {
      return NextResponse.json({ error: '매수가 시작된 사이클은 종목을 변경할 수 없습니다' }, { status: 400 });
    }

    const { count: buyCount, error: buyErr } = await supabase
      .from('infinite_buy_journal')
      .select('id', { count: 'exact', head: true })
      .eq('cycle_num', cycle.cycle_num)
      .eq('record_type', 'buy');

    if (buyErr) throw new Error(buyErr.message);
    if (buyCount && buyCount > 0) {
      return NextResponse.json({ error: '매수 기록이 있어 종목을 변경할 수 없습니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('infinite_buy_cycle')
      .update({ ticker })
      .eq('cycle_num', cycle.cycle_num)
      .select()
      .single();

    if (error) throw new Error(error.message);

    console.log(`[Infinite Cycle] 사이클 #${cycle.cycle_num} 종목 변경: ${cycle.ticker} → ${ticker}`);
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[Infinite Cycle change-ticker] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
