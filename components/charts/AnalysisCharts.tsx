'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  BarChart, Bar, ReferenceLine,
} from 'recharts';
import { fmt } from '@/lib/utils';

const TABS = [
  { id: 'cumulative', label: '누적손익' },
  { id: 'monthly', label: '월별손익' },
  { id: 'reason', label: '청산사유' },
] as const;

type TabId = typeof TABS[number]['id'];

const S = {
  section: { backgroundColor: '#d9e2f3', border: '1px solid #b4c6e7', padding: '5px 8px', fontWeight: 700 as const, color: '#1f3864', fontSize: 11 },
};

interface CumPoint { date: string; cumulative: number }
interface MonthlyPoint { month: string; swing: number; sector: number; bollinger: number; total: number }
interface ReasonStats { reason: string; count: number; ratio: number; totalPnl: number; avgReturn: number }

interface Props {
  cumulative: { total: CumPoint[]; swing: CumPoint[]; sector: CumPoint[]; bollinger: CumPoint[] };
  monthly: MonthlyPoint[];
  byReason: ReasonStats[];
}

export default function AnalysisCharts({ cumulative, monthly, byReason }: Props) {
  const [tab, setTab] = useState<TabId>('cumulative');

  const hasChartData = cumulative.total.length >= 2 || monthly.length > 0 || byReason.length > 0;
  if (!hasChartData) return null;

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
                      fontSize: 10, padding: '2px 8px', marginRight: 4,
                      border: '1px solid #b4c6e7',
                      backgroundColor: tab === t.id ? '#fff' : 'transparent',
                      color: tab === t.id ? '#1f3864' : '#5a7fb5',
                      fontWeight: tab === t.id ? 600 : 400,
                      cursor: 'pointer', borderRadius: 2,
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
        {tab === 'cumulative' && <CumulativeChart cumulative={cumulative} />}
        {tab === 'monthly' && <MonthlyChart monthly={monthly} />}
        {tab === 'reason' && <ReasonPieChart byReason={byReason} />}
      </div>
    </div>
  );
}

// ── 누적 손익 (전략별 라인) ──
function CumulativeChart({ cumulative }: { cumulative: Props['cumulative'] }) {
  if (cumulative.total.length < 2) {
    return <NoData />;
  }

  // Merge all dates into a single timeline
  const dateSet = new Set<string>();
  cumulative.total.forEach((p) => dateSet.add(p.date));
  const dates = Array.from(dateSet).sort();

  // Build lookup maps
  const totalMap = new Map(cumulative.total.map((p) => [p.date, p.cumulative]));
  const swingMap = new Map(cumulative.swing.map((p) => [p.date, p.cumulative]));
  const sectorMap = new Map(cumulative.sector.map((p) => [p.date, p.cumulative]));
  const bollingerMap = new Map(cumulative.bollinger.map((p) => [p.date, p.cumulative]));

  let lastSwing = 0, lastSector = 0, lastBollinger = 0;
  const data = dates.map((d) => {
    if (swingMap.has(d)) lastSwing = swingMap.get(d)!;
    if (sectorMap.has(d)) lastSector = sectorMap.get(d)!;
    if (bollingerMap.has(d)) lastBollinger = bollingerMap.get(d)!;
    return {
      date: d,
      total: totalMap.get(d) ?? lastSwing + lastSector + lastBollinger,
      swing: lastSwing,
      sector: lastSector,
      bollinger: lastBollinger,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: any) => String(v).slice(5)} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => fmt(Number(v))} />
        <Tooltip
          formatter={(value: any, name: any) => [fmt(Number(value)) + '원', name]}
          labelFormatter={(l: any) => String(l)}
          contentStyle={{ fontSize: 11 }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
        {cumulative.swing.length > 0 && (
          <Line type="monotone" dataKey="swing" name="스윙" stroke="#2196F3" strokeWidth={2} dot={{ r: 2 }} />
        )}
        {cumulative.sector.length > 0 && (
          <Line type="monotone" dataKey="sector" name="섹터" stroke="#4CAF50" strokeWidth={2} dot={{ r: 2 }} />
        )}
        {cumulative.bollinger.length > 0 && (
          <Line type="monotone" dataKey="bollinger" name="볼린저" stroke="#009688" strokeWidth={2} dot={{ r: 2 }} />
        )}
        <Line type="monotone" dataKey="total" name="전체" stroke="#333" strokeWidth={2} strokeDasharray="5 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── 월별 손익 (스택 바) ──
function MonthlyChart({ monthly }: { monthly: MonthlyPoint[] }) {
  if (monthly.length === 0) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={monthly} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v: any) => String(v).slice(2)} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => fmt(Number(v))} />
        <Tooltip
          formatter={(value: any, name: any) => [fmt(Number(value)) + '원', name]}
          contentStyle={{ fontSize: 11 }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
        <Bar dataKey="swing" name="스윙" stackId="a" fill="#2196F3" />
        <Bar dataKey="sector" name="섹터" stackId="a" fill="#4CAF50" />
        <Bar dataKey="bollinger" name="볼린저" stackId="a" fill="#009688" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 청산 사유 파이차트 ──
const REASON_COLORS: Record<string, string> = {
  '익절': '#4CAF50',
  '손절': '#F44336',
  '종가청산': '#FF9800',
};

function ReasonPieChart({ byReason }: { byReason: ReasonStats[] }) {
  if (byReason.length === 0) return <NoData />;

  const pieData = byReason.map((r) => ({ name: r.reason, value: r.count }));

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
      <ResponsiveContainer width={220} height={220}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={80}
            dataKey="value"
            label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
            style={{ fontSize: 10 }}
          >
            {pieData.map((d, i) => (
              <Cell key={i} fill={REASON_COLORS[d.name] || '#999'} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any, name: any) => [`${v}건`, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 11 }}>
        {byReason.map((r) => (
          <div key={r.reason} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: REASON_COLORS[r.reason] || '#999', display: 'inline-block' }} />
            <span style={{ fontWeight: 600, width: 56 }}>{r.reason}</span>
            <span>{r.count}건 ({r.ratio}%)</span>
            <span style={{ color: r.totalPnl >= 0 ? '#006100' : '#9c0006', fontWeight: 600 }}>
              {r.totalPnl > 0 ? '+' : ''}{fmt(r.totalPnl)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoData() {
  return (
    <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 11 }}>
      거래 기록이 부족합니다.
    </div>
  );
}