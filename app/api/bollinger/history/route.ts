import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const screenDate = searchParams.get('screen_date');

    // 특정 날짜 결과 조회
    if (screenDate) {
      const res = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/screening_history?strategy=eq.bollinger&screen_date=eq.${screenDate}&select=*`,
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
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: '해당 날짜 데이터 없음' }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

    // 이력 목록 조회 (최근 30건)
    const { data, error } = await supabase
      .from('screening_history')
      .select('screen_date, selected_ticker, selected_name, created_at')
      .eq('strategy', 'bollinger')
      .order('screen_date', { ascending: false })
      .limit(30);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data || []);
  } catch (err: unknown) {
    console.error('[Bollinger History] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || '이력 조회 실패' }, { status: 500 });
  }
}