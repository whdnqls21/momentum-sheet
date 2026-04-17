import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── GET: 매매일지 조회 ──
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cycleParam = searchParams.get('cycle'); // 'all' 또는 사이클 번호

    let query = supabase
      .from('infinite_buy_journal')
      .select('*')
      .order('trade_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (cycleParam && cycleParam !== 'all') {
      query = query.eq('cycle_num', parseInt(cycleParam));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json(data || []);
  } catch (err: unknown) {
    console.error('[Infinite Journal GET] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST: 기록 추가 ──
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cycle_num, record_type, ticker, trade_date } = body;

    if (!cycle_num || !record_type || !ticker || !trade_date) {
      return NextResponse.json({ error: '필수 필드 누락 (cycle_num, record_type, ticker, trade_date)' }, { status: 400 });
    }

    if (record_type === 'buy') {
      if (body.price == null || body.quantity == null || body.slot_num == null) {
        return NextResponse.json({ error: '매수는 단가/수량/슬롯 번호가 모두 필수입니다' }, { status: 400 });
      }
    } else if (record_type === 'sell') {
      if (body.price == null || body.quantity == null) {
        return NextResponse.json({ error: '매도는 단가/수량이 모두 필수입니다' }, { status: 400 });
      }
    } else if (record_type === 'exchange') {
      if (body.amount_usd == null || body.amount_krw == null || body.exchange_rate == null) {
        return NextResponse.json({ error: '환전은 원화/달러/환율이 모두 필수입니다' }, { status: 400 });
      }
    }

    const record: Record<string, unknown> = {
      cycle_num,
      record_type,
      ticker,
      trade_date,
      notes: body.notes || null,
    };

    if (record_type === 'exchange') {
      record.amount_usd = body.amount_usd;
      record.amount_krw = body.amount_krw;
      record.exchange_rate = body.exchange_rate;
    } else {
      // buy or sell
      record.price = body.price;
      record.quantity = body.quantity;
      record.amount_usd = Math.round(body.price * body.quantity * 100) / 100;
      if (record_type === 'buy') record.slot_num = body.slot_num;
    }

    const { data, error } = await supabase
      .from('infinite_buy_journal')
      .insert(record)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // 매수 기록 시 사이클 used_slots 증가
    if (record_type === 'buy' && body.slot_num) {
      await supabase
        .from('infinite_buy_cycle')
        .update({ used_slots: body.slot_num })
        .eq('cycle_num', cycle_num);
    }

    console.log(`[Infinite Journal] ${record_type} 기록 추가: ${ticker} cycle#${cycle_num}`);
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    console.error('[Infinite Journal POST] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE: 기록 삭제 ──
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    const { error } = await supabase
      .from('infinite_buy_journal')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[Infinite Journal DELETE] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
