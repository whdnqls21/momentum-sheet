'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ExcelFrame from '@/components/ExcelFrame';
import TradingFlowModal from '@/components/TradingFlowModal';
import type { BalanceResponse, Holding, JournalEntry } from '@/lib/types';
import { TRADING_RULES } from '@/lib/constants';

// ── 유틸 ──
const fmt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => n.toFixed(2) + '%';
const pnlClass = (n: number) => (n > 0 ? 'pnl-pos' : n < 0 ? 'pnl-neg' : '');

// ── 루틴 타입 ──
interface RoutineItem {
  time: string;
  tag: 'sw' | 'sec' | 'bb';
  label: string;
  action: string;
  sheet: string;
  sheetPath: string;
  done: boolean;
  highlight: boolean;
  warn?: boolean;
}

interface RoutineResponse {
  routines: RoutineItem[];
  holdings: Record<string, { ticker_name: string; ticker_code: string } | null>;
  screeningStatus: Record<string, { done: boolean; selectedName: string | null }>;
  dayOfWeek: number;
  isWeekend: boolean;
  kstHour: number;
  kstMinute: number;
}

// ── 자금 배분 ──
const ALLOCATION = {
  swing:     { base: 0.375,  max: 0.375  },
  sector:    { base: 0.3125, max: 0.50   },
  bollinger: { base: 0.3125, max: 0.50   },
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

// ── 전략 태그 색상 ──
const tagColors: Record<string, { bg: string; color: string }> = {
  sw: { bg: '#FFF3E0', color: '#E65100' },
  sec: { bg: '#E8F5E9', color: '#2E7D32' },
  bb: { bg: '#E8EAF6', color: '#283593' },
};

export default function HomePage() {
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [routine, setRoutine] = useState<RoutineResponse | null>(null);
  const [openJournal, setOpenJournal] = useState<JournalEntry[]>([]);
  const [flowOpen, setFlowOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [balanceRes, routineRes, journalRes] = await Promise.all([
        fetch('/api/balance'),
        fetch('/api/routine'),
        fetch('/api/journal?status=open'),
      ]);

      const balanceJson = await balanceRes.json();
      if (balanceJson.error) throw new Error(balanceJson.error);
      setData(balanceJson);

      const routineJson = await routineRes.json();
      if (!routineJson.error) setRoutine(routineJson);

      const journalJson = await journalRes.json();
      if (Array.isArray(journalJson)) setOpenJournal(journalJson);

      setError(null);
      setLastRefresh(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // ── 자금 배분 계산 ──
  const holdingsTotal = data ? data.holdings.reduce((s, h) => s + h.evalAmt, 0) : 0;
  const totalFund = data ? data.summary.cashBalance + holdingsTotal : 0;

  const swingHolding = openJournal.find(j => j.strategy === 'swing');
  const sectorHolding = openJournal.find(j => j.strategy === 'sector');
  const bollingerHolding = openJournal.find(j => j.strategy === 'bollinger');

  const swingAvailable = totalFund * ALLOCATION.swing.base;
  const sectorAvailable = bollingerHolding
    ? totalFund * ALLOCATION.sector.base
    : totalFund * ALLOCATION.sector.max;
  const bollingerAvailable = sectorHolding
    ? totalFund * ALLOCATION.bollinger.base
    : totalFund * ALLOCATION.bollinger.max;

  // 보유 종목에서 전략별 평가금액 찾기
  const findEvalAmt = (strategy: string) => {
    const j = openJournal.find(e => e.strategy === strategy);
    if (!j) return 0;
    const h = data?.holdings.find(h => h.code === j.ticker_code);
    return h ? h.evalAmt : j.buy_amount;
  };

  const findPnlRate = (strategy: string) => {
    const j = openJournal.find(e => e.strategy === strategy);
    if (!j) return 0;
    const h = data?.holdings.find(h => h.code === j.ticker_code);
    return h ? h.pnlRate : 0;
  };

  // ── 전략별 상태 텍스트 ──
  function getStrategyStatus(strategy: string): { text: string; color: string } {
    const j = openJournal.find(e => e.strategy === strategy);
    if (j) {
      const rate = findPnlRate(strategy);
      const sign = rate > 0 ? '+' : '';
      const name = j.ticker_name;
      const icon = rate >= 0 ? '📈' : '📉';
      const color = rate > 0 ? '#006100' : rate < 0 ? '#9c0006' : '#333';
      return { text: `${icon} 보유 중: ${name} ${sign}${rate.toFixed(1)}%`, color };
    }

    if (strategy === 'sector' && routine?.screeningStatus.sector) {
      const s = routine.screeningStatus.sector;
      if (!s.done) return { text: '📋 스크리닝 필요', color: '#bf8f00' };
      if (s.selectedName) return { text: `🔄 RSI 대기 중 (${s.selectedName})`, color: '#2e75b6' };
      return { text: '💤 이번 달 패스', color: '#888' };
    }

    return { text: '⏳ 대기 중', color: '#888' };
  }

  const statusItems = data
    ? {
        count: String(data.holdings.length),
        sum: fmt(data.summary.totalPnl),
      }
    : undefined;

  return (
    <ExcelFrame
      onRefresh={handleRefresh}
      refreshing={refreshing}
      statusItems={statusItems}
      ribbonExtra={
        <button className="btn-ribbon" onClick={() => setFlowOpen(true)}>
          📊 운영 플로우
        </button>
      }
    >
      {loading ? (
        <div style={{ padding: 20, color: '#888' }}>로딩 중...</div>
      ) : error ? (
        <div style={{ padding: 20, color: '#9c0006', fontWeight: 700 }}>#ERROR — {error}</div>
      ) : data ? (
        <div style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
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
                <td style={S.rowNum}>1</td>
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
                <td style={S.rowNum}>2</td>
                <td style={S.label}>예수금 (D+2)</td>
                <td style={S.td}>{fmt(data.summary.d2Balance)}</td>
                <td style={S.label}>매입 합계</td>
                <td style={S.td}>{fmt(data.summary.totalPurchase)}</td>
              </tr>
              <tr>
                <td style={S.rowNum}>3</td>
                <td style={S.label}>현금 잔고</td>
                <td style={S.td}>{fmt(data.summary.cashBalance)}</td>
                <td style={S.label}>평가 합계</td>
                <td style={S.td}>{fmt(data.summary.totalEval)}</td>
              </tr>

              {/* ── 빈 행 ── */}
              <tr>
                <td style={S.rowNum}>4</td>
                <td style={{ ...S.td, border: '1px solid #e0e0e0' }} colSpan={4}></td>
              </tr>
            </tbody>
          </table>
          </div>

          {/* ── 보유 종목 ── */}
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.section, textAlign: 'left' }} colSpan={10}>보유 종목</th>
              </tr>
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
              {data.holdings.map((h, i) => (
                <tr key={h.code} style={i % 2 === 1 ? { backgroundColor: '#fafafa' } : {}}>
                  <td style={S.rowNum}>{i + 1}</td>
                  <td style={S.tdC} className="font-mono">{h.code}</td>
                  <td style={S.tdL}>{h.name}</td>
                  <td style={{
                    ...S.tdC, fontSize: 10,
                    color: h.strategy === 'swing' ? '#2e75b6' : h.strategy === 'sector' ? '#7030a0' : h.strategy === 'bollinger' ? '#00695c' : '#666',
                  }}>
                    {h.strategy === 'swing' ? '스윙' : h.strategy === 'sector' ? '섹터' : h.strategy === 'bollinger' ? '볼린저' : '—'}
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
                <td style={{ ...S.td, fontWeight: 700 }}>{fmt(holdingsTotal)}</td>
                <td style={{ ...S.td, fontWeight: 700 }} className={pnlClass(data.summary.totalPnl)}>
                  {data.summary.totalPnl > 0 ? '+' : ''}{fmt(data.holdings.reduce((s, h) => s + h.pnl, 0))}
                </td>
                <td style={S.td}></td>
              </tr>
            </tbody>
          </table>
          </div>

          {/* ── 전략별 자금 배분 ── */}
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ ...S.section, textAlign: 'left' }} colSpan={5}>전략별 자금 배분</th>
              </tr>
              <tr>
                <th style={{ ...S.th, width: 32 }}></th>
                <th style={{ ...S.th, textAlign: 'left' }}>전략</th>
                <th style={S.th}>비중</th>
                <th style={S.th}>가용 자금</th>
                <th style={{ ...S.th, textAlign: 'left' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {/* 스윙 */}
              {(() => {
                const isHolding = !!swingHolding;
                const status = getStrategyStatus('swing');
                return (
                  <tr style={isHolding ? { backgroundColor: '#FFFDE7' } : {}}>
                    <td style={S.rowNum}>1</td>
                    <td style={{ ...S.tdL, fontWeight: 600 }}>스윙</td>
                    <td style={S.tdC}>
                      {isHolding ? '보유 중' : '37.5% (고정)'}
                    </td>
                    <td style={S.td}>
                      {isHolding ? fmt(findEvalAmt('swing')) + '원' : fmt(Math.round(swingAvailable)) + '원'}
                    </td>
                    <td style={{ ...S.tdL, color: status.color }}>{status.text}</td>
                  </tr>
                );
              })()}
              {/* 섹터 */}
              {(() => {
                const isHolding = !!sectorHolding;
                const status = getStrategyStatus('sector');
                const pctLabel = isHolding
                  ? '보유 중'
                  : bollingerHolding
                    ? '31.25% (기본)'
                    : '50% (최대)';
                const pctColor = !isHolding && !bollingerHolding ? '#006100' : undefined;
                return (
                  <tr style={isHolding ? { backgroundColor: '#FFFDE7' } : {}}>
                    <td style={S.rowNum}>2</td>
                    <td style={{ ...S.tdL, fontWeight: 600 }}>섹터</td>
                    <td style={{ ...S.tdC, color: pctColor }}>{pctLabel}</td>
                    <td style={S.td}>
                      {isHolding ? fmt(findEvalAmt('sector')) + '원' : fmt(Math.round(sectorAvailable)) + '원'}
                    </td>
                    <td style={{ ...S.tdL, color: status.color }}>{status.text}</td>
                  </tr>
                );
              })()}
              {/* 볼린저 */}
              {(() => {
                const isHolding = !!bollingerHolding;
                const status = getStrategyStatus('bollinger');
                const pctLabel = isHolding
                  ? '보유 중'
                  : sectorHolding
                    ? '31.25% (기본)'
                    : '50% (최대)';
                const pctColor = !isHolding && !sectorHolding ? '#006100' : undefined;
                return (
                  <tr style={isHolding ? { backgroundColor: '#FFFDE7' } : {}}>
                    <td style={S.rowNum}>3</td>
                    <td style={{ ...S.tdL, fontWeight: 600 }}>볼린저</td>
                    <td style={{ ...S.tdC, color: pctColor }}>{pctLabel}</td>
                    <td style={S.td}>
                      {isHolding ? fmt(findEvalAmt('bollinger')) + '원' : fmt(Math.round(bollingerAvailable)) + '원'}
                    </td>
                    <td style={{ ...S.tdL, color: status.color }}>{status.text}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
          </div>

          {/* ── 오늘의 루틴 ── */}
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ ...S.section, textAlign: 'left' }} colSpan={5}>오늘의 루틴</th>
              </tr>
              <tr>
                <th style={{ ...S.th, width: 32 }}></th>
                <th style={{ ...S.th, width: 80 }}>시간</th>
                <th style={{ ...S.th, width: 60 }}>전략</th>
                <th style={{ ...S.th, textAlign: 'left' }}>할 일</th>
                <th style={{ ...S.th, width: 90 }}>시트</th>
              </tr>
            </thead>
            <tbody>
              {routine?.isWeekend ? (
                <tr>
                  <td style={S.rowNum}>1</td>
                  <td style={{ ...S.tdL, color: '#4472c4' }} colSpan={4}>
                    주말에는 루틴이 없습니다. 월요일에 만나요!
                  </td>
                </tr>
              ) : routine && routine.routines.length === 0 ? (
                <tr>
                  <td style={S.rowNum}>1</td>
                  <td style={{ ...S.tdL, color: '#006100' }} colSpan={4}>
                    ✓ 오늘 할 일이 없습니다
                  </td>
                </tr>
              ) : routine ? (
                routine.routines.map((r, i) => {
                  const bg = r.highlight
                    ? '#FFFDE7'
                    : r.warn && !r.done
                      ? '#FFF3E0'
                      : r.done
                        ? '#f9f9f9'
                        : undefined;
                  const textColor = r.done ? '#aaa' : r.warn ? '#E65100' : '#333';
                  const tag = tagColors[r.tag];
                  const timePrefix = r.done ? '✅ ' : r.highlight ? '→ ' : '';
                  return (
                    <tr key={i} style={bg ? { backgroundColor: bg } : {}}>
                      <td style={S.rowNum}>{i + 1}</td>
                      <td style={{ ...S.tdC, color: textColor, fontSize: 10 }}>
                        {timePrefix}{r.time}
                      </td>
                      <td style={S.tdC}>
                        <span style={{
                          display: 'inline-block',
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 600,
                          backgroundColor: tag.bg,
                          color: tag.color,
                        }}>
                          {r.label}
                        </span>
                      </td>
                      <td style={{ ...S.tdL, color: textColor }}>{r.action}</td>
                      <td style={{ ...S.tdC, fontSize: 10 }}>
                        <Link href={r.sheetPath} style={{ color: '#4472c4', textDecoration: 'none' }}>
                          → {r.sheet}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td style={S.rowNum}>1</td>
                  <td style={{ ...S.tdL, color: '#888' }} colSpan={4}>로딩 중...</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}
      <TradingFlowModal isOpen={flowOpen} onClose={() => setFlowOpen(false)} />
    </ExcelFrame>
  );
}
