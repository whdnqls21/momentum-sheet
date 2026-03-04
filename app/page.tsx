'use client';

import { useState, useEffect, useCallback } from 'react';
import ExcelFrame from '@/components/ExcelFrame';
import type { BalanceResponse, Holding, TodoItem } from '@/lib/types';
import { TRADING_RULES } from '@/lib/constants';

// ── 유틸 ──
const fmt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => n.toFixed(2) + '%';
const pnlClass = (n: number) => (n > 0 ? 'pnl-pos' : n < 0 ? 'pnl-neg' : '');
const pnlTextClass = (n: number) => (n > 0 ? 'pnl-pos-text' : n < 0 ? 'pnl-neg-text' : '');

// ── 할일 생성 ──
function buildTodos(holdings: Holding[]): TodoItem[] {
  const todos: TodoItem[] = [];
  const now = new Date();
  const day = now.getDay(); // 0=일 ~ 6=토
  const date = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // 요일 기반
  if (day === 5) {
    todos.push({ id: 'swing-screen', text: '스윙 스크리닝 실행 필요 (금요일)', icon: '□', color: 'default', action: 'swing' });
  }
  if (day === 1) {
    todos.push({ id: 'swing-buy', text: '스윙 매수 실행 확인 (월요일)', icon: '□', color: 'default', action: 'swing' });
  }
  if (date === lastDay || (day === 5 && date >= lastDay - 2)) {
    todos.push({ id: 'sector-screen', text: '섹터 스크리닝 실행 필요 (월말)', icon: '□', color: 'default', action: 'sector' });
  }
  if (date <= 3 && day >= 1 && day <= 5) {
    todos.push({ id: 'sector-buy', text: '섹터 매수 실행 확인 (월초)', icon: '□', color: 'default', action: 'sector' });
  }

  // 보유종목 익절/손절 임박
  holdings.forEach((h) => {
    const strategy = h.strategy || 'swing';
    const rules = TRADING_RULES[strategy];

    if (h.pnlRate >= rules.tpAlert) {
      todos.push({
        id: `tp-${h.code}`,
        text: `${h.name} +${fmtPct(h.pnlRate)} → 익절 임박 (+${rules.takeProfit}%)`,
        icon: '⚠',
        color: 'warning',
      });
    }
    if (h.pnlRate <= rules.slAlert) {
      todos.push({
        id: `sl-${h.code}`,
        text: `${h.name} ${fmtPct(h.pnlRate)} → 손절 임박 (${rules.stopLoss}%)`,
        icon: '⚠',
        color: 'danger',
      });
    }
  });

  // 금요일 스윙 미청산 경고
  if (day === 5) {
    holdings
      .filter((h) => h.strategy === 'swing')
      .forEach((h) => {
        todos.push({
          id: `clear-${h.code}`,
          text: `${h.name} 스윙 종가청산 확인 필요`,
          icon: '⚠',
          color: 'danger',
        });
      });
  }

  return todos;
}

const todoColors: Record<string, string> = {
  default: '#333',
  warning: '#bf8f00',
  danger: '#9c0006',
  success: '#006100',
};

// ── 셀 스타일 ──
const S = {
  th: {
    backgroundColor: '#f2f2f2', border: '1px solid #d4d4d4', padding: '4px 8px',
    fontWeight: 600 as const, textAlign: 'center' as const, whiteSpace: 'nowrap' as const, fontSize: 11,
  },
  td: { border: '1px solid #e0e0e0', padding: '3px 8px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  tdL: { border: '1px solid #e0e0e0', padding: '3px 8px', textAlign: 'left' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  tdC: { border: '1px solid #e0e0e0', padding: '3px 8px', textAlign: 'center' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  label: { border: '1px solid #e0e0e0', padding: '3px 8px', textAlign: 'left' as const, backgroundColor: '#f7f7f7', fontWeight: 600 as const, fontSize: 11 },
  section: { backgroundColor: '#d9e2f3', border: '1px solid #b4c6e7', padding: '5px 8px', fontWeight: 700 as const, color: '#1f3864', fontSize: 11 },
  rowNum: { border: '1px solid #d4d4d4', padding: '3px 6px', textAlign: 'center' as const, backgroundColor: '#f2f2f2', color: '#666', width: 32, fontSize: 10 },
};

export default function HomePage() {
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/balance');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
      setLastRefresh(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBalance().finally(() => setLoading(false));
  }, [fetchBalance]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBalance();
    setRefreshing(false);
  }, [fetchBalance]);

  const todos = data ? buildTodos(data.holdings) : [];

  const statusItems = data
    ? {
        count: String(data.holdings.length),
        sum: fmt(data.summary.totalPnl),
      }
    : undefined;

  return (
    <ExcelFrame onRefresh={handleRefresh} refreshing={refreshing} statusItems={statusItems}>
      {loading ? (
        <div style={{ padding: 20, color: '#888' }}>로딩 중...</div>
      ) : error ? (
        <div style={{ padding: 20, color: '#9c0006', fontWeight: 700 }}>#ERROR — {error}</div>
      ) : data ? (
        <div style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {/* ── 할일 ── */}
              <tr>
                <td style={S.section} colSpan={5}>
                  오늘의 할일
                </td>
              </tr>
              {todos.length === 0 ? (
                <tr>
                  <td style={S.rowNum}>1</td>
                  <td style={{ ...S.tdL, color: '#006100' }} colSpan={4}>
                    ✓ 오늘 할 일이 없습니다
                  </td>
                </tr>
              ) : (
                todos.map((t, i) => (
                  <tr key={t.id}>
                    <td style={S.rowNum}>{i + 1}</td>
                    <td
                      style={{
                        ...S.tdL,
                        color: todoColors[t.color],
                        fontWeight: t.color !== 'default' ? 600 : 400,
                      }}
                      colSpan={4}
                    >
                      {t.icon} {t.text}
                    </td>
                  </tr>
                ))
              )}

              {/* ── 빈 행 ── */}
              <tr>
                <td style={S.rowNum}>{todos.length + 2}</td>
                <td style={{ ...S.td, border: '1px solid #e0e0e0' }} colSpan={4}></td>
              </tr>

              {/* ── 계좌 요약 ── */}
              <tr>
                <td style={S.section} colSpan={5}>
                  계좌 요약
                  {lastRefresh && (
                    <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 12, color: '#4472c4' }}>
                      갱신: {lastRefresh}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td style={S.rowNum}>{todos.length + 4}</td>
                <td style={S.label}>총 평가자산</td>
                <td style={{ ...S.td, fontWeight: 700, fontSize: 12 }}>{fmt(data.summary.totalEval)}</td>
                <td style={S.label}>총 손익</td>
                <td
                  style={{
                    ...S.td,
                    fontWeight: 700,
                    color: data.summary.totalPnl > 0 ? '#006100' : data.summary.totalPnl < 0 ? '#9c0006' : '#333',
                  }}
                >
                  {data.summary.totalPnl > 0 ? '+' : ''}
                  {fmt(data.summary.totalPnl)} ({fmtPct(data.summary.totalPnlRate)})
                </td>
              </tr>
              <tr>
                <td style={S.rowNum}>{todos.length + 5}</td>
                <td style={S.label}>예수금 (D+2)</td>
                <td style={S.td}>{fmt(data.summary.d2Balance)}</td>
                <td style={S.label}>매입 합계</td>
                <td style={S.td}>{fmt(data.summary.totalPurchase)}</td>
              </tr>
              <tr>
                <td style={S.rowNum}>{todos.length + 6}</td>
                <td style={S.label}>현금 잔고</td>
                <td style={S.td}>{fmt(data.summary.cashBalance)}</td>
                <td style={S.label}>평가 합계</td>
                <td style={S.td}>{fmt(data.summary.totalEval)}</td>
              </tr>

              {/* ── 빈 행 ── */}
              <tr>
                <td style={S.rowNum}>{todos.length + 7}</td>
                <td style={{ ...S.td, border: '1px solid #e0e0e0' }} colSpan={4}></td>
              </tr>
            </tbody>
          </table>

          {/* ── 보유 종목 ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 32 }}></th>
                <th style={S.th}>종목코드</th>
                <th style={{ ...S.th, textAlign: 'left' }}>종목명</th>
                <th style={S.th}>전략</th>
                <th style={S.th}>수량</th>
                <th style={S.th}>매입평균가</th>
                <th style={S.th}>현재가</th>
                <th style={S.th}>평가금액</th>
                <th style={S.th}>손익금액</th>
                <th style={S.th}>수익률</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.section} colSpan={10}>보유 종목</td>
              </tr>
              {data.holdings.map((h, i) => (
                <tr key={h.code} style={i % 2 === 1 ? { backgroundColor: '#fafafa' } : {}}>
                  <td style={S.rowNum}>{i + 1}</td>
                  <td style={S.tdC} className="font-mono">{h.code}</td>
                  <td style={S.tdL}>{h.name}</td>
                  <td style={{ ...S.tdC, fontSize: 10, color: h.strategy === 'swing' ? '#2e75b6' : '#7030a0' }}>
                    {h.strategy === 'swing' ? '스윙' : h.strategy === 'sector' ? '섹터' : '—'}
                  </td>
                  <td style={S.td}>{h.qty}</td>
                  <td style={S.td}>{fmt(h.avgPrice)}</td>
                  <td style={S.td}>{fmt(h.currentPrice)}</td>
                  <td style={S.td}>{fmt(h.evalAmt)}</td>
                  <td style={{ ...S.td, fontWeight: 600 }} className={pnlClass(h.pnl)}>
                    {h.pnl > 0 ? '+' : ''}{fmt(h.pnl)}
                  </td>
                  <td style={{ ...S.td, fontWeight: 600 }} className={pnlClass(h.pnlRate)}>
                    {fmtPct(h.pnlRate)}
                  </td>
                </tr>
              ))}
              {/* 합계 행 */}
              <tr style={{ backgroundColor: '#f2f2f2' }}>
                <td style={S.rowNum}></td>
                <td style={S.td}></td>
                <td style={{ ...S.tdL, fontWeight: 700 }}>합계</td>
                <td style={S.td}></td>
                <td style={S.td}></td>
                <td style={S.td}></td>
                <td style={S.td}></td>
                <td style={{ ...S.td, fontWeight: 700 }}>{fmt(data.holdings.reduce((s, h) => s + h.evalAmt, 0))}</td>
                <td style={{ ...S.td, fontWeight: 700 }} className={pnlClass(data.summary.totalPnl)}>
                  {data.summary.totalPnl > 0 ? '+' : ''}{fmt(data.holdings.reduce((s, h) => s + h.pnl, 0))}
                </td>
                <td style={S.td}></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </ExcelFrame>
  );
}
