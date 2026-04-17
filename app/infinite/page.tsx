'use client';

import { useState, useCallback, useEffect } from 'react';
import ExcelFrame from '@/components/ExcelFrame';
import StrategyRulesModal from '@/components/StrategyRulesModal';
import type { InfiniteBuyCycle, InfiniteBuyJournal } from '@/lib/types';

/* ── 타입 ── */
interface StockInfo {
  ticker: string;
  price: number;
  high52: number;
  low52: number;
  dropFromHigh: number;
  rsi14: number | null;
  sharesPerSlot: number;
  month1Return: number | null;
  score: number;
  buyable: boolean;
}

interface RecommendResult {
  tqqq: StockInfo;
  soxl: StockInfo;
  recommendation: { ticker: string; reason: string } | null;
  params: { totalFundKRW: number; exchangeRate: number; totalFundUSD: number; slotAmountUSD: number };
}

interface OrderItem {
  type: string;
  price: number;
  shares: number;
  desc: string;
}

interface StatusResult {
  cycle: {
    cycleNum: number; ticker: string; startDate: string;
    usedSlots: number; totalSlots: number; slotAmountUSD: number;
    initialFundKRW: number; initialFundUSD: number;
  };
  balance: {
    avgPrice: number; quantity: number; investedUSD: number;
    currentPrice: number; evalUSD: number; profitUSD: number; profitRate: number;
  };
  todayOrders: {
    condition: string;
    buyOrders: OrderItem[];
    sellOrder: OrderItem | null;
  };
  exchangeRate: number;
}

/* ── 스타일 ── */
const S = {
  th: { padding: '6px 10px', fontSize: 11, fontWeight: 600, backgroundColor: '#f5f5f5', borderBottom: '2px solid #217346', borderRight: '1px solid #e0e0e0', textAlign: 'left' as const, whiteSpace: 'nowrap' as const },
  thR: { padding: '6px 10px', fontSize: 11, fontWeight: 600, backgroundColor: '#f5f5f5', borderBottom: '2px solid #217346', borderRight: '1px solid #e0e0e0', textAlign: 'right' as const, whiteSpace: 'nowrap' as const },
  td: { padding: '5px 10px', fontSize: 11, borderBottom: '1px solid #e0e0e0', borderRight: '1px solid #e0e0e0' },
  tdR: { padding: '5px 10px', fontSize: 11, borderBottom: '1px solid #e0e0e0', borderRight: '1px solid #e0e0e0', textAlign: 'right' as const, fontFamily: 'monospace' },
  section: { margin: '12px 0 0', backgroundColor: '#d9e2f3', border: '1px solid #b4c6e7', padding: '5px 8px', fontWeight: 700 as const, color: '#1f3864', fontSize: 11 },
  card: { margin: '0 0 12px', border: '1px solid #d4d4d4', borderRadius: 4, overflow: 'hidden' },
};

const fmtUSD = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKRW = (n: number) => n.toLocaleString() + '원';
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const fmtDate = (d: string) => { const [, m, day] = d.split('-'); return `${m}/${day}`; };

export default function InfiniteBuyPage() {
  const [recommend, setRecommend] = useState<RecommendResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [cycles, setCycles] = useState<InfiniteBuyCycle[]>([]);
  const [exchanges, setExchanges] = useState<InfiniteBuyJournal[]>([]);
  const [mode, setMode] = useState<'loading' | 'recommend' | 'status' | 'idle'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  // 사이클 + 환전 데이터 (요약용)
  const fetchSummary = useCallback(async () => {
    try {
      const [cRes, jRes] = await Promise.all([
        fetch('/api/infinite/cycle', { cache: 'no-store' }),
        fetch('/api/infinite/journal?cycle=all', { cache: 'no-store' }),
      ]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setCycles(cData.cycles || []);
      }
      if (jRes.ok) {
        const jData = await jRes.json();
        setExchanges((jData || []).filter((j: InfiniteBuyJournal) => j.record_type === 'exchange'));
      }
    } catch {
      // 요약 조회 실패는 치명적이지 않음
    }
  }, []);

  // 현황 조회 (사이클 진행 중)
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/infinite/status', { cache: 'no-store' });
      if (!r.ok) throw new Error('현황 조회 실패');
      const data = await r.json();
      if (data.cycle) {
        setStatus(data);
        setMode('status');
      } else {
        // 활성 사이클 없음 → 추천 조회
        await fetchRecommend();
      }
      await fetchSummary();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchSummary]);

  // 추천 조회 (사이클 미시작)
  const fetchRecommend = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/infinite/recommend', { cache: 'no-store' });
      if (!r.ok) throw new Error('추천 조회 실패');
      const data = await r.json();
      setRecommend(data);
      setMode('recommend');
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 사이클 시작
  const startCycle = useCallback(async (ticker: string) => {
    if (!recommend) return;
    setLoading(true);
    try {
      const r = await fetch('/api/infinite/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          initial_fund_krw: recommend.params.totalFundKRW,
          initial_fund_usd: recommend.params.totalFundUSD,
          slot_amount_usd: recommend.params.slotAmountUSD,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || '사이클 시작 실패');
      }
      await fetchStatus();
    } catch (e: unknown) {
      setError((e as Error).message);
      setLoading(false);
    }
  }, [recommend, fetchStatus]);

  // 사이클 완료
  const completeCycle = useCallback(async () => {
    if (!status) return;
    setLoading(true);
    try {
      const r = await fetch('/api/infinite/cycle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycle_num: status.cycle.cycleNum,
          total_sell_usd: status.balance.evalUSD,
          profit_usd: status.balance.profitUSD,
          profit_rate: status.balance.profitRate,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || '사이클 완료 실패');
      }
      setCompleteOpen(false);
      setStatus(null);
      setMode('idle');
      await fetchRecommend();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, fetchRecommend]);

  // 페이지 진입 시 자동 로드
  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 원금 대비 요약 계산 ── */
  const totalExKRW = exchanges.reduce((s, j) => s + (j.amount_krw || 0), 0);
  const totalExUSD = exchanges.reduce((s, j) => s + (j.amount_usd || 0), 0);
  const realizedUSD = cycles
    .filter(c => c.status === 'completed' && c.profit_usd != null)
    .reduce((s, c) => s + (c.profit_usd || 0), 0);
  const unrealizedUSD = status?.balance.profitUSD ?? 0;
  const totalProfitUSD = realizedUSD + unrealizedUSD;
  const exchangeRate = status?.exchangeRate ?? recommend?.params.exchangeRate ?? 1440;
  const totalProfitKRW = Math.round(totalProfitUSD * exchangeRate);
  const profitPct = totalExKRW > 0 ? (totalProfitKRW / totalExKRW) * 100 : 0;

  /* ── 추천 카드 렌더링 ── */
  const renderStockCard = (stock: StockInfo, isRecommended: boolean) => (
    <div style={{
      flex: 1, padding: 12, borderRadius: 4,
      border: isRecommended ? '2px solid #217346' : '1px solid #d4d4d4',
      backgroundColor: isRecommended ? '#FFFDE7' : '#fafafa',
      opacity: isRecommended ? 1 : 0.65,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {stock.ticker}
        {isRecommended
          ? <span style={{ fontSize: 10, color: '#217346', fontWeight: 600 }}>추천</span>
          : <span style={{ fontSize: 10, color: '#999' }}>비추</span>
        }
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <tbody>
          {[
            ['현재가', fmtUSD(stock.price)],
            ['고점대비', fmtPct(stock.dropFromHigh)],
            ['52주범위', `${fmtUSD(stock.low52)}~${fmtUSD(stock.high52)}`],
            ['RSI(14)', stock.rsi14 !== null ? stock.rsi14.toFixed(1) : 'N/A'],
            ['1칸매수', `${stock.sharesPerSlot}주 ${stock.buyable ? '가능' : '불가'}`],
            ['1M수익', stock.month1Return !== null ? fmtPct(stock.month1Return) : 'N/A'],
            ['점수', `${stock.score}점`],
          ].map(([label, val]) => (
            <tr key={label}>
              <td style={{ padding: '2px 0', color: '#666' }}>{label}</td>
              <td style={{ padding: '2px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ExcelFrame
      refreshing={loading}
      ribbonExtra={
        <>
          <button
            className="btn-ribbon"
            onClick={fetchStatus}
            disabled={loading}
            style={loading ? { backgroundColor: '#e2efda' } : {}}
          >
            {loading ? '⏳ 갱신 중...' : '▶ 현재가 가져오기'}
          </button>
          <button className="btn-ribbon" onClick={() => setRulesOpen(true)}>
            전략 규칙
          </button>
          {mode === 'status' && status && (
            <button className="btn-ribbon" onClick={() => setCompleteOpen(true)}>
              사이클 완료
            </button>
          )}
        </>
      }
    >
      {/* ── 전략 규칙 모달 ── */}
      <StrategyRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} title="무한매수법 전략 규칙">
        <div style={{ fontSize: 11, lineHeight: 1.8 }}>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>기본</p>
          <p>종목: TQQQ 또는 SOXL (사이클 시작 시 선택)</p>
          <p>투자금: 400만원, 40칸 균등 분할</p>
          <p>1칸: 투자금(USD) / 40</p>
          <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #e0e0e0' }} />

          <p style={{ fontWeight: 700, marginBottom: 4 }}>매수 (매일 저녁)</p>
          <p><b>보유 없음:</b> 현재가 LOC (1칸 / 현재가 = N주)</p>
          <p><b>현재가 &gt; 평단가:</b></p>
          <p style={{ paddingLeft: 12 }}>1칸으로 2주 이상 → 5:5 분할</p>
          <p style={{ paddingLeft: 20 }}>0.5회분 → 평단가 LOC (종가 ≤ 평단가 시 체결)</p>
          <p style={{ paddingLeft: 20 }}>0.5회분 → 확보용 LOC (평단가 x 1.15)</p>
          <p style={{ paddingLeft: 12 }}>1칸으로 1주만 → 확보용 LOC 1주 (평단가 x 1.15)</p>
          <p><b>현재가 = 평단가:</b> 확보용 LOC (1칸 / 현재가 = N주, 평단가 x 1.15)</p>
          <p><b>현재가 &lt; 평단가:</b> 현재가 LOC (1칸 / 현재가 = N주)</p>
          <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #e0e0e0' }} />

          <p style={{ fontWeight: 700, marginBottom: 4 }}>매도 (매일 저녁)</p>
          <p>평단가 x 1.10 전량 지정가 매도</p>
          <p>장중 도달 시 체결, 미달 시 자동 취소</p>
          <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #e0e0e0' }} />

          <p style={{ fontWeight: 700, marginBottom: 4 }}>사이클 완료</p>
          <p>익절 체결 → 원금 재설정 → 즉시 재시작</p>
          <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #e0e0e0' }} />

          <p style={{ fontWeight: 700, marginBottom: 4 }}>손절 없음</p>
          <p>40칸 소진까지 보유 유지. 나스닥 장기 우상향 전제.</p>
        </div>
      </StrategyRulesModal>

      {/* ── 사이클 완료 모달 ── */}
      <StrategyRulesModal isOpen={completeOpen} onClose={() => setCompleteOpen(false)} title="사이클 완료 확인">
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          {status && (
            <>
              <p>사이클 #{status.cycle.cycleNum} ({status.cycle.ticker})을 완료합니다.</p>
              <p style={{ marginTop: 8, fontWeight: 600 }}>수익 요약:</p>
              <p>투자금: {fmtUSD(status.balance.investedUSD)}</p>
              <p>평가금: {fmtUSD(status.balance.evalUSD)}</p>
              <p>손익: {fmtUSD(status.balance.profitUSD)} ({fmtPct(status.balance.profitRate)})</p>
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setCompleteOpen(false)}
                  style={{ padding: '6px 16px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3, cursor: 'pointer', backgroundColor: '#fff' }}
                >
                  취소
                </button>
                <button
                  onClick={completeCycle}
                  disabled={loading}
                  style={{ padding: '6px 16px', fontSize: 11, border: 'none', borderRadius: 3, cursor: 'pointer', backgroundColor: '#217346', color: '#fff', fontWeight: 600 }}
                >
                  {loading ? '처리 중...' : '완료 확인'}
                </button>
              </div>
            </>
          )}
        </div>
      </StrategyRulesModal>

      {error && (
        <div style={{ margin: 12, padding: 8, backgroundColor: '#ffc7ce', color: '#9c0006', fontSize: 11, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* ── 원금 대비 누적 수익 요약 ── */}
      {totalExKRW > 0 && (
        <>
          <div style={S.section}>원금 대비 누적 수익</div>
          <div style={S.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ ...S.td, color: '#666', width: '20%' }}>투입 원금</td>
                  <td style={{ ...S.tdR, width: '30%' }}>{fmtKRW(totalExKRW)} ≈ {fmtUSD(totalExUSD)}</td>
                  <td style={{ ...S.td, color: '#666', width: '20%' }}>환율</td>
                  <td style={{ ...S.tdR, width: '30%' }}>{exchangeRate.toLocaleString()}원/$</td>
                </tr>
                <tr>
                  <td style={{ ...S.td, color: '#666' }}>실현 수익</td>
                  <td style={{ ...S.tdR, color: realizedUSD >= 0 ? '#006100' : '#9c0006' }}>
                    {realizedUSD >= 0 ? '+' : ''}{fmtUSD(realizedUSD)}
                  </td>
                  <td style={{ ...S.td, color: '#666' }}>미실현 수익</td>
                  <td style={{ ...S.tdR, color: unrealizedUSD >= 0 ? '#006100' : '#9c0006' }}>
                    {unrealizedUSD >= 0 ? '+' : ''}{fmtUSD(unrealizedUSD)}
                  </td>
                </tr>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <td style={{ ...S.td, color: '#666', fontWeight: 600 }}>누적 수익</td>
                  <td style={{ ...S.tdR, color: totalProfitUSD >= 0 ? '#006100' : '#9c0006', fontWeight: 600 }}>
                    {totalProfitUSD >= 0 ? '+' : ''}{fmtUSD(totalProfitUSD)} ≈ {totalProfitKRW >= 0 ? '+' : ''}{totalProfitKRW.toLocaleString()}원
                  </td>
                  <td style={{ ...S.td, color: '#666', fontWeight: 600 }}>원금 대비</td>
                  <td style={{ ...S.tdR, color: profitPct >= 0 ? '#006100' : '#9c0006', fontWeight: 700, fontSize: 13 }}>
                    {fmtPct(profitPct)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── idle 상태: 안내 ── */}
      {mode === 'idle' && !loading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 12 }}>
          <p>▶ 현재가 가져오기 버튼을 눌러 시작하세요.</p>
        </div>
      )}

      {/* ── 추천 화면 (사이클 미시작) ── */}
      {mode === 'recommend' && recommend && (
        <>
          {/* 파라미터 요약 */}
          <div style={{ margin: '12px 0 0', padding: '8px 12px', backgroundColor: '#f0f7f0', borderRadius: 4, fontSize: 11, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <span>투자금: <b>{fmtKRW(recommend.params.totalFundKRW)}</b></span>
            <span>환율: <b>{recommend.params.exchangeRate.toLocaleString()}원</b></span>
            <span>= <b>{fmtUSD(recommend.params.totalFundUSD)}</b></span>
            <span>1칸: <b>{fmtUSD(recommend.params.slotAmountUSD)}</b></span>
          </div>

          <div style={S.section}>사이클 시작 추천 — TQQQ vs SOXL</div>
          <div style={{ ...S.card, display: 'flex', gap: 12, padding: 12, flexWrap: 'wrap' }}>
            {renderStockCard(recommend.tqqq, recommend.recommendation?.ticker === 'TQQQ')}
            {renderStockCard(recommend.soxl, recommend.recommendation?.ticker === 'SOXL')}
          </div>

          {recommend.recommendation && (
            <div style={{ margin: '0 0 12px', padding: '10px 12px', backgroundColor: '#E8F5E9', borderRadius: 4, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>{recommend.recommendation.ticker} 추천 — {recommend.recommendation.reason}</span>
              <button
                onClick={() => startCycle(recommend.recommendation!.ticker)}
                disabled={loading}
                style={{ padding: '6px 16px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 3, cursor: 'pointer', backgroundColor: '#217346', color: '#fff' }}
              >
                {recommend.recommendation.ticker}로 사이클 시작
              </button>
            </div>
          )}

          {!recommend.recommendation && (
            <div style={{ margin: '0 0 12px', padding: '10px 12px', backgroundColor: '#FFF3E0', borderRadius: 4, fontSize: 11, color: '#E65100' }}>
              두 종목 모두 1칸 매수 불가 — 투자금 증액 또는 가격 하락 대기
            </div>
          )}
        </>
      )}

      {/* ── 현황 화면 (사이클 진행 중) ── */}
      {mode === 'status' && status && (
        <>
          <div style={S.section}>
            사이클 #{status.cycle.cycleNum} 현황 ({status.cycle.ticker})
          </div>
          <div style={S.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['시작일', status.cycle.startDate, '슬롯', `${status.cycle.usedSlots} / ${status.cycle.totalSlots} (${((status.cycle.usedSlots / status.cycle.totalSlots) * 100).toFixed(1)}%)`],
                  ['평단가', fmtUSD(status.balance.avgPrice), '현재가', `${fmtUSD(status.balance.currentPrice)} (${fmtPct(status.balance.profitRate)})`],
                  ['보유 수량', `${status.balance.quantity}주`, '목표매도가', `${fmtUSD(Math.round(status.balance.avgPrice * 1.10 * 100) / 100)} (평단x1.10)`],
                  ['투자금', fmtUSD(status.balance.investedUSD), '평가금액', fmtUSD(status.balance.evalUSD)],
                  ['평가손익', `${status.balance.profitUSD >= 0 ? '+' : ''}${fmtUSD(status.balance.profitUSD)}`, '원화 환산', `≈ ${(status.balance.profitUSD * status.exchangeRate >= 0 ? '+' : '')}${Math.round(status.balance.profitUSD * status.exchangeRate).toLocaleString()}원 @${status.exchangeRate}`],
                  ['1칸 금액', fmtUSD(status.cycle.slotAmountUSD), '잔여 슬롯', `${status.cycle.totalSlots - status.cycle.usedSlots}칸`],
                ].map(([l1, v1, l2, v2], i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, color: '#666', width: '20%' }}>{l1}</td>
                    <td style={{ ...S.tdR, width: '30%', color: l1 === '평가손익' ? (status.balance.profitUSD >= 0 ? '#006100' : '#9c0006') : undefined }}>{v1}</td>
                    <td style={{ ...S.td, color: '#666', width: '20%' }}>{l2}</td>
                    <td style={{ ...S.tdR, width: '30%', color: l2 === '현재가' ? (status.balance.profitRate >= 0 ? '#006100' : '#9c0006') : undefined }}>{v2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 오늘의 주문 */}
          <div style={S.section}>
            오늘의 주문 — 현재가 {fmtUSD(status.balance.currentPrice)} {status.balance.quantity > 0 ? (status.balance.currentPrice > status.balance.avgPrice ? '> ' : '< ') + '평단가 ' + fmtUSD(status.balance.avgPrice) : ''}
          </div>

          <div style={{ margin: '0 0 4px', fontSize: 11, color: '#555', padding: '4px 0' }}>
            판단: {status.todayOrders.condition}
          </div>

          {/* 매수 주문 */}
          <div style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: '#333' }}>매수 주문:</div>
          <div style={S.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {([
                    ['구분', 'L'], ['주문가', 'R'], ['수량', 'R'], ['금액', 'R'], ['설명', 'L'],
                  ] as [string, 'L' | 'R'][]).map(([h, a]) => (
                    <th key={h} style={a === 'R' ? S.thR : S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.todayOrders.buyOrders.map((order, i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      <span style={{ padding: '1px 6px', borderRadius: 3, backgroundColor: '#c6efce', color: '#006100', fontSize: 10 }}>{order.type}</span>
                    </td>
                    <td style={S.tdR}>{fmtUSD(order.price)}</td>
                    <td style={S.tdR}>{order.shares}주</td>
                    <td style={S.tdR}>{fmtUSD(Math.round(order.price * order.shares * 100) / 100)}</td>
                    <td style={{ ...S.td, color: '#888', fontSize: 10 }}>{order.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 매도 주문 */}
          {status.todayOrders.sellOrder && (
            <>
              <div style={{ margin: '8px 0 4px', fontSize: 11, fontWeight: 600, color: '#333' }}>예약 매도 주문:</div>
              <div style={S.card}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {([
                        ['구분', 'L'], ['목표가', 'R'], ['수량', 'R'], ['예상금액', 'R'], ['설명', 'L'],
                      ] as [string, 'L' | 'R'][]).map(([h, a]) => (
                        <th key={h} style={a === 'R' ? S.thR : S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ ...S.td, fontWeight: 600 }}>
                        <span style={{ padding: '1px 6px', borderRadius: 3, backgroundColor: '#006100', color: '#fff', fontSize: 10 }}>{status.todayOrders.sellOrder.type}</span>
                      </td>
                      <td style={S.tdR}>{fmtUSD(status.todayOrders.sellOrder.price)}</td>
                      <td style={S.tdR}>{status.todayOrders.sellOrder.shares}주</td>
                      <td style={S.tdR}>{fmtUSD(Math.round(status.todayOrders.sellOrder.price * status.todayOrders.sellOrder.shares * 100) / 100)}</td>
                      <td style={{ ...S.td, color: '#888', fontSize: 10 }}>{status.todayOrders.sellOrder.desc}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* 참고 */}
          <div style={{ margin: '8px 0 16px', padding: '8px 12px', backgroundColor: '#F5F5F5', borderRadius: 4, fontSize: 10, color: '#888', lineHeight: 1.6 }}>
            참고: 현재가 &lt; 평단가인 경우 → 1회분 전량: 현재가 LOC. 1칸/현재가=N주 매수.
          </div>
        </>
      )}

      {/* ── 환전 내역 합산 ── */}
      {exchanges.length > 0 && (
        <>
          <div style={S.section}>환전 내역 합산</div>
          <div style={S.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {([
                    ['일자', 'L'], ['원화(원)', 'R'], ['달러($)', 'R'], ['환율', 'R'], ['메모', 'L'],
                  ] as [string, 'L' | 'R'][]).map(([h, a]) => (
                    <th key={h} style={a === 'R' ? S.thR : S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exchanges.map(j => (
                  <tr key={j.id}>
                    <td style={S.td}>{fmtDate(j.trade_date)}</td>
                    <td style={S.tdR}>{j.amount_krw ? fmtKRW(j.amount_krw) : '-'}</td>
                    <td style={S.tdR}>{j.amount_usd ? fmtUSD(j.amount_usd) : '-'}</td>
                    <td style={S.tdR}>{j.exchange_rate || '-'}</td>
                    <td style={{ ...S.td, color: '#888' }}>{j.notes || ''}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: '#f5f5f5', fontWeight: 600 }}>
                  <td style={S.td}>합계</td>
                  <td style={S.tdR}>{fmtKRW(totalExKRW)}</td>
                  <td style={S.tdR}>{fmtUSD(totalExUSD)}</td>
                  <td style={S.tdR}>{totalExUSD > 0 ? `평균 ${Math.round(totalExKRW / totalExUSD)}` : '-'}</td>
                  <td style={S.td}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </ExcelFrame>
  );
}
