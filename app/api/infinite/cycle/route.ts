import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── GET: 사이클 조회 ──
export async function GET() {
  try {
    // 활성 사이클
    const { data: active, error: activeErr } = await supabase
      .from('infinite_buy_cycle')
      .select('*')
      .eq('status', 'active')
      .order('cycle_num', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeErr) throw new Error(activeErr.message);

    // 전체 사이클 목록
    const { data: all, error: allErr } = await supabase
      .from('infinite_buy_cycle')
      .select('*')
      .order('cycle_num', { ascending: false });

    if (allErr) throw new Error(allErr.message);

    return NextResponse.json({ active, cycles: all || [] });
  } catch (err: unknown) {
    console.error('[Infinite Cycle GET] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST: 새 사이클 시작 ──
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ticker, initial_fund_krw, initial_fund_usd, slot_amount_usd } = body;

    if (!ticker || !initial_fund_krw) {
      return NextResponse.json({ error: 'ticker, initial_fund_krw 필수' }, { status: 400 });
    }

    // 활성 사이클 존재 확인
    const { data: existing } = await supabase
      .from('infinite_buy_cycle')
      .select('id')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: '이미 진행 중인 사이클이 있습니다' }, { status: 400 });
    }

    // 다음 사이클 번호
    const { data: last } = await supabase
      .from('infinite_buy_cycle')
      .select('cycle_num')
      .order('cycle_num', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNum = (last?.cycle_num || 0) + 1;

    const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
      .replace(/\. /g, '-').replace('.', '').replace(/(\d+)-(\d+)-(\d+)/, (_, y, m, d) =>
        `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);

    const { data, error } = await supabase
      .from('infinite_buy_cycle')
      .insert({
        cycle_num: nextNum,
        ticker,
        start_date: today,
        total_slots: 40,
        used_slots: 0,
        initial_fund_krw,
        initial_fund_usd: initial_fund_usd || null,
        slot_amount_usd: slot_amount_usd || null,
        status: 'active',
        total_invested_usd: 0,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    console.log(`[Infinite Cycle] 사이클 #${nextNum} 시작: ${ticker}`);
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    console.error('[Infinite Cycle POST] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── PATCH: 사이클 완료 처리 ──
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { cycle_num } = body;

    if (!cycle_num) {
      return NextResponse.json({ error: 'cycle_num 필수' }, { status: 400 });
    }

    // 매매일지에서 buy/sell 집계 (실제 거래 기록을 진실의 원천으로 사용)
    const { data: trades, error: tradesErr } = await supabase
      .from('infinite_buy_journal')
      .select('record_type, amount_usd')
      .eq('cycle_num', cycle_num)
      .in('record_type', ['buy', 'sell']);

    if (tradesErr) throw new Error(tradesErr.message);

    const totalBuy = (trades || [])
      .filter(t => t.record_type === 'buy')
      .reduce((s, t) => s + Number(t.amount_usd || 0), 0);
    const totalSell = (trades || [])
      .filter(t => t.record_type === 'sell')
      .reduce((s, t) => s + Number(t.amount_usd || 0), 0);

    if (totalSell === 0) {
      return NextResponse.json(
        { error: '매도 기록이 없습니다. 매도를 먼저 입력하세요.' },
        { status: 400 }
      );
    }

    const profitUsd = Math.round((totalSell - totalBuy) * 100) / 100;
    const profitRate = totalBuy > 0
      ? Math.round((profitUsd / totalBuy) * 10000) / 100
      : 0;

    const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
      .replace(/\. /g, '-').replace('.', '').replace(/(\d+)-(\d+)-(\d+)/, (_, y, m, d) =>
        `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);

    const { data, error } = await supabase
      .from('infinite_buy_cycle')
      .update({
        status: 'completed',
        end_date: today,
        total_invested_usd: Math.round(totalBuy * 100) / 100,
        total_sell_usd: Math.round(totalSell * 100) / 100,
        profit_usd: profitUsd,
        profit_rate: profitRate,
      })
      .eq('cycle_num', cycle_num)
      .select()
      .single();

    if (error) throw new Error(error.message);

    console.log(`[Infinite Cycle] 사이클 #${cycle_num} 완료 (손익 $${profitUsd}, ${profitRate}%)`);
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[Infinite Cycle PATCH] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
