'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, ReferenceLine,
} from 'recharts';
import type { JournalEntry } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString();

const TABS = [
  { id: 'cumulative', label: '누적손익' },
  { id: 'winrate', label: '전략별승률' },
  { id: 'monthly', label: '월별손익' },
] as const;

type TabId = typeof TABS[number]['id'];

const S = {
  section: { backgroundColor: '#d9e2f3', border: '1px solid #b4c6e7', padding: '5px 8px', fontWeight: 700 as const, color: '#1f3864', fontSize: 11 },
};

interface Props {
  closed: JournalEntry[];
}

export default function PerformanceCharts({ closed }: Props) {
  const [tab, setTab] = useState<TabId>('cumulative');

  if (closed.length < 2) return null;

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={S.section}>
              <span>성과 차트</span>
              <span style={{ marginLeft: 12 }}>
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      marginRight: 4,
                      border: '1px solid #b4c6e7',
                      backgroundColor: tab === t.id ? '#fff' : 'transparent',
                      color: tab === t.id ? '#1f3864' : '#5a7fb5',
                      fontWeight: tab === t.id ? 600 : 400,
                      cursor: 'pointer',
                      borderRadius: 2,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ padding: '12px 8px', backgroundColor: '#fff' }}>
        {tab === 'cumulative' && <CumulativeChart closed={closed} />}
        {tab === 'winrate' && <WinRateChart closed={closed} />}
        {tab === 'monthly' && <MonthlyChart closed={closed} />}
      </div>
    </div>
  );
}

// ── 누적 손익 라인 차트 ──
function CumulativeChart({ closed }: { closed: JournalEntry[] }) {
  const data = closed
    .filter((e) => e.sell_date && e.profit_loss !== null)
    .sort((a, b) => a.sell_date!.localeCompare(b.sell_date!))
    .reduce<{ date: string; profit: number; cumulative: number }[]>((acc, e) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
      acc.push({ date: e.sell_date!, profit: e.profit_loss!, cumulative: prev + e.profit_loss! });
      return acc;
    }, []);

  if (data.length < 2) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmt(v)} />
        <Tooltip
          formatter={(value: any) => [fmt(Number(value)) + '원', '누적손익']}
          labelFormatter={(l: any) => String(l)}
          contentStyle={{ fontSize: 11 }}
        />
        <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="cumulative" stroke="#217346" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── 전략별 승률 파이 차트 ──
const PIE_COLORS = { win: '#4CAF50', lose: '#F44336' };

function WinRateChart({ closed }: { closed: JournalEntry[] }) {
  const strategies = ['swing', 'sector'] as const;
  const chartData = strategies.map((s) => {
    const trades = closed.filter((e) => e.strategy === s && e.profit_loss !== null);
    const wins = trades.filter((e) => e.profit_loss! > 0).length;
    const losses = trades.length - wins;
    return { strategy: s, label: s === 'swing' ? '스윙' : '섹터', wins, losses, total: trades.length };
  }).filter((d) => d.total > 0);

  if (chartData.length === 0) return <NoData />;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
      {chartData.map((d) => (
        <div key={d.strategy} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: d.strategy === 'swing' ? '#2e75b6' : '#7030a0' }}>
            {d.label} ({d.total}건)
          </div>
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={[
                  { name: '승', value: d.wins },
                  { name: '패', value: d.losses },
                ]}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={60}
                dataKey="value"
                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                style={{ fontSize: 10 }}
              >
                <Cell fill={PIE_COLORS.win} />
                <Cell fill={PIE_COLORS.lose} />
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any, name: any) => [`${v}건`, name]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

// ── 월별 손익 바 차트 ──
function MonthlyChart({ closed }: { closed: JournalEntry[] }) {
  const monthMap = new Map<string, number>();
  for (const e of closed) {
    if (!e.sell_date || e.profit_loss === null) continue;
    const month = e.sell_date.slice(0, 7); // YYYY-MM
    monthMap.set(month, (monthMap.get(month) || 0) + e.profit_loss);
  }

  const data = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({ month, pnl }));

  if (data.length === 0) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(2)} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmt(v)} />
        <Tooltip
          formatter={(value: any) => [fmt(Number(value)) + '원', '손익']}
          contentStyle={{ fontSize: 11 }}
        />
        <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
        <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? '#4CAF50' : '#F44336'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function NoData() {
  return (
    <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 11 }}>
      거래 기록이 부족합니다.
    </div>
  );
}
