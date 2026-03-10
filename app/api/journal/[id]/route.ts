import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// ── PATCH: 매도 기록 (청산) ──
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { sell_date, sell_price, close_reason, notes } = body;

    if (!sell_date || !sell_price) {
      return NextResponse.json({ error: '매도일, 매도가는 필수입니다.' }, { status: 400 });
    }

    // 기존 매수 정보 조회
    const { data: existing, error: fetchError } = await supabase
      .from('journal')
      .select('buy_price, buy_qty, buy_amount')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: '해당 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    const sell_amount = sell_price * existing.buy_qty;
    const profit_loss = sell_amount - existing.buy_amount;
    const profit_rate = parseFloat(((sell_price - existing.buy_price) / existing.buy_price * 100).toFixed(2));

    const { data, error } = await supabase
      .from('journal')
      .update({
        sell_date,
        sell_price,
        sell_amount,
        profit_loss,
        profit_rate,
        close_reason: close_reason || null,
        notes: notes !== undefined ? notes : undefined,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    console.log(`[Journal] 청산: ${id} → 손익 ${profit_loss} (${profit_rate}%)`);
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[Journal PATCH] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE: 기록 삭제 ──
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from('journal')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    console.log(`[Journal] 삭제: ${id}`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[Journal DELETE] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}