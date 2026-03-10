import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: rows, error } = await supabase
      .from('journal')
      .select('*')
      .not('sell_date', 'is', null)
      .order('sell_date', { ascending: true });

    if (error) throw new Error(error.message);

    const closed = (rows || []).map((r: any) => ({
      ...r,
      buy_price: Number(r.buy_price),
      buy_qty: Number(r.buy_qty),
      buy_amount: Number(r.buy_amount),
      sell_price: Number(r.sell_price),
      sell_amount: Number(r.sell_amount),
      profit_loss: Number(r.profit_loss),
      profit_rate: Number(r.profit_rate),
    }));

    if (closed.length === 0) {
      return NextResponse.json({ empty: true });
    }

    // ── 전체 요약 ──
    const totalTrades = closed.length;
    const wins = closed.filter((j: any) => j.profit_loss > 0);
    const losses = closed.filter((j: any) => j.profit_loss <= 0);
    const winRate = Number(((wins.length / totalTrades) * 100).toFixed(1));
    const avgReturn = Number((closed.reduce((s: number, j: any) => s + j.profit_rate, 0) / totalTrades).toFixed(2));
    const totalPnl = closed.reduce((s: number, j: any) => s + j.profit_loss, 0);
    const maxWin = Math.max(...closed.map((j: any) => j.profit_loss));
    const maxLoss = Math.min(...closed.map((j: any) => j.profit_loss));
    const avgHoldDays = Number((closed.reduce((s: number, j: any) => {
      const days = (new Date(j.sell_date).getTime() - new Date(j.buy_date).getTime()) / 86400000;
      return s + days;
    }, 0) / totalTrades).toFixed(1));

    const summary = { totalTrades, wins: wins.length, losses: losses.length, winRate, avgReturn, totalPnl, maxWin, maxLoss, avgHoldDays };

    // ── 전략별 ──
    const byStrategy: Record<string, any> = {};
    for (const strat of ['swing', 'sector', 'bollinger']) {
      const trades = closed.filter((j: any) => j.strategy === strat);
      if (trades.length === 0) continue;
      const w = trades.filter((j: any) => j.profit_loss > 0);
      byStrategy[strat] = {
        trades: trades.length,
        wins: w.length,
        winRate: Number(((w.length / trades.length) * 100).toFixed(1)),
        avgReturn: Number((trades.reduce((s: number, j: any) => s + j.profit_rate, 0) / trades.length).toFixed(2)),
        totalPnl: trades.reduce((s: number, j: any) => s + j.profit_loss, 0),
        maxWin: Math.max(...trades.map((j: any) => j.profit_loss)),
        maxLoss: Math.min(...trades.map((j: any) => j.profit_loss)),
        avgHoldDays: Number((trades.reduce((s: number, j: any) => {
          const days = (new Date(j.sell_date).getTime() - new Date(j.buy_date).getTime()) / 86400000;
          return s + days;
        }, 0) / trades.length).toFixed(1)),
      };
    }

    // ── 청산 사유별 ──
    const reasonMap = new Map<string, { count: number; totalPnl: number; sumRate: number }>();
    for (const j of closed) {
      const reason = (j as any).close_reason || '기타';
      const prev = reasonMap.get(reason) || { count: 0, totalPnl: 0, sumRate: 0 };
      prev.count++;
      prev.totalPnl += (j as any).profit_loss;
      prev.sumRate += (j as any).profit_rate;
      reasonMap.set(reason, prev);
    }
    const byReason = Array.from(reasonMap.entries()).map(([reason, v]) => ({
      reason,
      count: v.count,
      ratio: Number(((v.count / totalTrades) * 100).toFixed(1)),
      totalPnl: v.totalPnl,
      avgReturn: Number((v.sumRate / v.count).toFixed(2)),
    }));

    // ── 누적 손익 (전략별) ──
    const cumSwing: { date: string; cumulative: number }[] = [];
    const cumSector: { date: string; cumulative: number }[] = [];
    const cumBollinger: { date: string; cumulative: number }[] = [];
    const cumTotal: { date: string; cumulative: number }[] = [];
    let runSwing = 0, runSector = 0, runBollinger = 0, runTotal = 0;
    for (const j of closed) {
      const pl = (j as any).profit_loss;
      const d = (j as any).sell_date;
      runTotal += pl;
      cumTotal.push({ date: d, cumulative: runTotal });
      if ((j as any).strategy === 'swing') {
        runSwing += pl;
        cumSwing.push({ date: d, cumulative: runSwing });
      } else if ((j as any).strategy === 'bollinger') {
        runBollinger += pl;
        cumBollinger.push({ date: d, cumulative: runBollinger });
      } else {
        runSector += pl;
        cumSector.push({ date: d, cumulative: runSector });
      }
    }

    // ── 월별 손익 (전략별) ──
    const monthlyMap = new Map<string, { swing: number; sector: number; bollinger: number }>();
    for (const j of closed) {
      const month = (j as any).sell_date.slice(0, 7);
      const prev = monthlyMap.get(month) || { swing: 0, sector: 0, bollinger: 0 };
      if ((j as any).strategy === 'swing') prev.swing += (j as any).profit_loss;
      else if ((j as any).strategy === 'bollinger') prev.bollinger += (j as any).profit_loss;
      else prev.sector += (j as any).profit_loss;
      monthlyMap.set(month, prev);
    }
    const monthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, swing: v.swing, sector: v.sector, bollinger: v.bollinger, total: v.swing + v.sector + v.bollinger }));

    return NextResponse.json({
      summary,
      byStrategy,
      byReason,
      cumulative: { total: cumTotal, swing: cumSwing, sector: cumSector, bollinger: cumBollinger },
      monthly,
    });
  } catch (err: unknown) {
    console.error('[Analysis GET] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}