import { NextResponse } from 'next/server';
import { SWING_POOL_1, SECTOR_ETFS, BB_ETFS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

interface TickerSuggestion {
  code: string;
  name: string;
  strategy: 'swing' | 'sector' | 'bollinger';
  pool_type?: string;
}

async function fetchScreeningResults(strategy: string, limit: number): Promise<any[]> {
  const url = `${process.env.SUPABASE_URL}/rest/v1/screening_history?strategy=eq.${strategy}&select=result&order=screen_date.desc&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function GET() {
  try {
    const tickers = new Map<string, TickerSuggestion>();

    // 1) 고정 종목풀 (기본값)
    for (const s of SWING_POOL_1) {
      tickers.set(`swing:${s.code}`, { code: s.code, name: s.name, strategy: 'swing', pool_type: '1차' });
    }
    for (const s of SECTOR_ETFS) {
      tickers.set(`sector:${s.code}`, { code: s.code, name: s.name, strategy: 'sector' });
    }
    for (const s of BB_ETFS) {
      tickers.set(`bollinger:${s.code}`, { code: s.code, name: s.name, strategy: 'bollinger' });
    }

    // 2) 스크리닝 이력에서 추가 종목 수집
    const [swingRows, sectorRows] = await Promise.all([
      fetchScreeningResults('swing', 5),
      fetchScreeningResults('sector', 3),
    ]);

    for (const row of swingRows) {
      const stocks = row.result;
      if (!Array.isArray(stocks)) continue;
      for (const s of stocks) {
        if (!s.code || !s.name) continue;
        const key = `swing:${s.code}`;
        if (!tickers.has(key)) {
          tickers.set(key, { code: s.code, name: s.name, strategy: 'swing', pool_type: s.pool || '2차' });
        }
      }
    }

    for (const row of sectorRows) {
      const etfs = row.result;
      if (!Array.isArray(etfs)) continue;
      for (const s of etfs) {
        if (!s.code || !s.name) continue;
        const key = `sector:${s.code}`;
        if (!tickers.has(key)) {
          tickers.set(key, { code: s.code, name: s.name, strategy: 'sector' });
        }
      }
    }

    const result = Array.from(tickers.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[Tickers API] 에러:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
