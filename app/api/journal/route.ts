import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── GET: 목록 조회 ──
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const strategy = searchParams.get('strategy');
    const status = searchParams.get('status');

    let query = supabase
      .from('journal')
      .select('*')
      .order('buy_date', { ascending: false });

    if (strategy) query = query.eq('strategy', strategy);
    if (status === 'open') query = query.is('sell_date', null);
    if (status === 'closed') query = query.not('sell_date', 'is', null);

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return NextResponse.json(data || []);
  } catch (err: unknown) {
    console.error('[Journal GET] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST: 매수 기록 추가 ──
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { strategy, ticker_code, ticker_name, buy_date, buy_price, buy_qty, pool_type, notes } = body;

    if (!strategy || !ticker_code || !ticker_name || !buy_date || !buy_price || !buy_qty) {
      return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 });
    }

    const buy_amount = buy_price * buy_qty;

    const { data, error } = await supabase
      .from('journal')
      .insert({
        strategy,
        ticker_code,
        ticker_name,
        buy_date,
        buy_price,
        buy_qty,
        buy_amount,
        pool_type: pool_type || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    console.log(`[Journal] 매수 기록 추가: ${ticker_name} ${buy_qty}주 @ ${buy_price}`);
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    console.error('[Journal POST] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}