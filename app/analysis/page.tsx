'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ExcelFrame from '@/components/ExcelFrame';

const AnalysisCharts = dynamic(() => import('@/components/charts/AnalysisCharts'), { ssr: false });

const fmt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
function pnlColor(n: number): string {
  return n > 0 ? '#006100' : n < 0 ? '#9c0006' : '#333';
}

const S = {
  th: {
    backgroundColor: '#f2f2f2', border: '1px solid #d4d4d4', padding: '4px 6px',
    fontWeight: 600 as const, textAlign: 'center' as const, whiteSpace: 'nowrap' as const, fontSize: 10,
  },
  td: { border: '1px solid #e0e0e0', padding: '3px 6px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  tdL: { border: '1px solid #e0e0e0', padding: '3px 6px', textAlign: 'left' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  tdC: { border: '1px solid #e0e0e0', padding: '3px 6px', textAlign: 'center' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  section: { backgroundColor: '#d9e2f3', border: '1px solid #b4c6e7', padding: '5px 8px', fontWeight: 700 as const, color: '#1f3864', fontSize: 11 },
  label: { border: '1px solid #e0e0e0', padding: '3px 8px', textAlign: 'left' as const, backgroundColor: '#f7f7f7', fontWeight: 600 as const, fontSize: 11 },
};

interface Summary {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturn: number;
  totalPnl: number;
  maxWin: number;
  maxLoss: number;
  avgHoldDays: number;
}

interface StrategyStats {
  trades: number;
  wins: number;
  winRate: number;
  avgReturn: number;
  totalPnl: number;
  maxWin: number;
  maxLoss: number;
  avgHoldDays: number;
}

interface ReasonStats {
  reason: string;
  count: number;
  ratio: number;
  totalPnl: number;
  avgReturn: number;
}

interface CumPoint { date: string; cumulative: number }

interface MonthlyPoint { month: string; swing: number; sector: number; total: number }

interface AnalysisData {
  empty?: boolean;
  summary: Summary;
  byStrategy: Record<string, StrategyStats>;
  byReason: ReasonStats[];
  cumulative: { total: CumPoint[]; swing: CumPoint[]; sector: CumPoint[] };
  monthly: MonthlyPoint[];
}

export default function AnalysisPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/analysis', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <ExcelFrame>
        <div style={{ padding: 20, color: '#888', fontSize: 11 }}>로딩 중...</div>
      </ExcelFrame>
    );
  }

  if (error) {
    return (
      <ExcelFrame>
        <div style={{ padding: 20, color: '#9c0006', fontSize: 11 }}>#ERROR — {error}</div>
      </ExcelFrame>
    );
  }

  if (!data || data.empty) {
    return (
      <ExcelFrame>
        <div style={{ padding: 20, color: '#888', fontSize: 11 }}>
          청산 완료된 거래가 없습니다. 매매일지에서 기록을 추가해주세요.
        </div>
      </ExcelFrame>
    );
  }

  const { summary: sm, byStrategy, byReason } = data;

  const statusItems = {
    count: String(sm.totalTrades),
    sum: fmt(sm.totalPnl),
  };

  return (
    <ExcelFrame statusItems={statusItems}>
      <div style={{ padding: 0 }}>
        {/* ── 전체 요약 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={S.section} colSpan={10}>전체 요약</td></tr>
            <tr>
              <td style={S.label}>총 거래</td>
              <td style={S.td}>{sm.totalTrades}건</td>
              <td style={S.label}>승/패</td>
              <td style={S.td}>{sm.wins}승 {sm.losses}패</td>
              <td style={S.label}>승률</td>
              <td style={{ ...S.td, color: sm.winRate >= 50 ? '#006100' : '#9c0006', fontWeight: 600 }}>{sm.winRate}%</td>
              <td style={S.label}>평균수익률</td>
              <td style={{ ...S.td, color: pnlColor(sm.avgReturn), fontWeight: 600 }}>{fmtPct(sm.avgReturn)}</td>
            </tr>
            <tr>
              <td style={S.label}>총 손익</td>
              <td style={{ ...S.td, color: pnlColor(sm.totalPnl), fontWeight: 700 }}>{sm.totalPnl > 0 ? '+' : ''}{fmt(sm.totalPnl)}</td>
              <td style={S.label}>최대수익</td>
              <td style={{ ...S.td, color: '#006100' }}>{fmt(sm.maxWin)}</td>
              <td style={S.label}>최대손실</td>
              <td style={{ ...S.td, color: '#9c0006' }}>{fmt(sm.maxLoss)}</td>
              <td style={S.label}>평균보유일</td>
              <td style={S.td}>{sm.avgHoldDays}일</td>
            </tr>
          </tbody>
        </table>

        {/* ── 전략별 비교 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={{ ...S.section, textAlign: 'left' }} colSpan={9}>전략별 비교</th></tr>
            <tr>
              <th style={S.th}>전략</th>
              <th style={S.th}>거래수</th>
              <th style={S.th}>승률</th>
              <th style={S.th}>평균수익률</th>
              <th style={S.th}>총손익</th>
              <th style={S.th}>평균보유일</th>
              <th style={S.th}>최대수익</th>
              <th style={S.th}>최대손실</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byStrategy).map(([strat, s]) => (
              <tr key={strat}>
                <td style={{ ...S.tdC, color: strat === 'swing' ? '#2e75b6' : '#7030a0', fontWeight: 600 }}>
                  {strat === 'swing' ? '스윙' : '섹터'}
                </td>
                <td style={S.td}>{s.trades}건</td>
                <td style={{ ...S.td, color: s.winRate >= 50 ? '#006100' : '#9c0006', fontWeight: 600 }}>{s.winRate}%</td>
                <td style={{ ...S.td, color: pnlColor(s.avgReturn), fontWeight: 600 }}>{fmtPct(s.avgReturn)}</td>
                <td style={{ ...S.td, color: pnlColor(s.totalPnl), fontWeight: 700 }}>{s.totalPnl > 0 ? '+' : ''}{fmt(s.totalPnl)}</td>
                <td style={S.td}>{s.avgHoldDays}일</td>
                <td style={{ ...S.td, color: '#006100' }}>{fmt(s.maxWin)}</td>
                <td style={{ ...S.td, color: '#9c0006' }}>{fmt(s.maxLoss)}</td>
              </tr>
            ))}
            {Object.keys(byStrategy).length === 0 && (
              <tr><td style={{ ...S.tdL, color: '#888', padding: 8 }} colSpan={8}>데이터 없음</td></tr>
            )}
          </tbody>
        </table>

        {/* ── 청산 사유 분석 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={{ ...S.section, textAlign: 'left' }} colSpan={5}>청산 사유 분석</th></tr>
            <tr>
              <th style={S.th}>청산사유</th>
              <th style={S.th}>건수</th>
              <th style={S.th}>비율</th>
              <th style={S.th}>총손익</th>
              <th style={S.th}>평균수익률</th>
            </tr>
          </thead>
          <tbody>
            {byReason.map((r) => (
              <tr key={r.reason}>
                <td style={{ ...S.tdC, color: reasonColor(r.reason), fontWeight: 600 }}>{r.reason}</td>
                <td style={S.td}>{r.count}건</td>
                <td style={S.td}>{r.ratio}%</td>
                <td style={{ ...S.td, color: pnlColor(r.totalPnl), fontWeight: 600 }}>{r.totalPnl > 0 ? '+' : ''}{fmt(r.totalPnl)}</td>
                <td style={{ ...S.td, color: pnlColor(r.avgReturn), fontWeight: 600 }}>{fmtPct(r.avgReturn)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── 차트 영역 ── */}
        <AnalysisCharts
          cumulative={data.cumulative}
          monthly={data.monthly}
          byReason={byReason}
        />
      </div>
    </ExcelFrame>
  );
}

function reasonColor(reason: string): string {
  if (reason === '익절') return '#006100';
  if (reason === '손절') return '#9c0006';
  return '#888';
}