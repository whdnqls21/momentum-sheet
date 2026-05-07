'use client';

import { useState, useCallback, useEffect } from 'react';
import ExcelFrame from '@/components/ExcelFrame';
import type { InfiniteBuyCycle, InfiniteBuyJournal } from '@/lib/types';

/* ── 스타일 ── */
const S = {
  th: { padding: '6px 10px', fontSize: 11, fontWeight: 600, backgroundColor: '#f5f5f5', borderBottom: '1px solid #d4d4d4', borderRight: '1px solid #e0e0e0', textAlign: 'left' as const, whiteSpace: 'nowrap' as const },
  thR: { padding: '6px 10px', fontSize: 11, fontWeight: 600, backgroundColor: '#f5f5f5', borderBottom: '1px solid #d4d4d4', borderRight: '1px solid #e0e0e0', textAlign: 'right' as const, whiteSpace: 'nowrap' as const },
  td: { padding: '5px 10px', fontSize: 11, borderBottom: '1px solid #e0e0e0', borderRight: '1px solid #e0e0e0' },
  tdR: { padding: '5px 10px', fontSize: 11, borderBottom: '1px solid #e0e0e0', borderRight: '1px solid #e0e0e0', textAlign: 'right' as const, fontFamily: 'monospace' },
  section: { margin: '12px 0 0', backgroundColor: '#d9e2f3', border: '1px solid #b4c6e7', padding: '5px 8px', fontWeight: 700 as const, color: '#1f3864', fontSize: 11 },
  card: { margin: '0 0 12px', border: '1px solid #d4d4d4', borderRadius: 4, overflow: 'hidden' },
};

const fmtUSD = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  const [, m, day] = d.split('-');
  return `${m}/${day}`;
};

const TAG_STYLES: Record<string, { bg: string; color: string }> = {
  buy: { bg: '#c6efce', color: '#006100' },
  sell: { bg: '#006100', color: '#fff' },
  exchange: { bg: '#D6E4F0', color: '#1565C0' },
};

const TAG_LABELS: Record<string, string> = {
  buy: '매수', sell: '매도', exchange: '환전',
};

const ROW_BG: Record<string, string> = {
  sell: '#f0fff0',
  exchange: '#E3F2FD',
};

export default function InfiniteJournalPage() {
  const [cycles, setCycles] = useState<InfiniteBuyCycle[]>([]);
  const [journal, setJournal] = useState<InfiniteBuyJournal[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('active'); // 'all', 'active', or cycle_num
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(1440);

  // 폼 상태
  const [formType, setFormType] = useState<'buy' | 'sell' | 'exchange'>('buy');
  const [formDate, setFormDate] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formSlot, setFormSlot] = useState('');
  const [formAmountUSD, setFormAmountUSD] = useState('');
  const [formAmountKRW, setFormAmountKRW] = useState('');
  const [formExRate, setFormExRate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 사이클 목록
      const cr = await fetch('/api/infinite/cycle', { cache: 'no-store' });
      if (!cr.ok) throw new Error('사이클 조회 실패');
      const cycleData = await cr.json();
      setCycles(cycleData.cycles || []);

      // 매매일지 — 전체 조회 후 클라이언트에서 필터
      const jr = await fetch('/api/infinite/journal?cycle=all', { cache: 'no-store' });
      if (!jr.ok) throw new Error('일지 조회 실패');
      const jData = await jr.json();
      setJournal(jData || []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 기록 추가
  const handleSubmit = useCallback(async () => {
    const activeCycle = cycles.find(c => c.status === 'active');
    const cycleNum = activeCycle?.cycle_num;
    if (!cycleNum) {
      setError('활성 사이클이 없습니다');
      return;
    }

    if (!formDate) {
      setError('일자는 필수입니다');
      return;
    }
    if (formType === 'buy') {
      if (!formPrice || !formQty || !formSlot) {
        setError('매수는 단가/수량/슬롯 번호가 모두 필수입니다');
        return;
      }
    } else if (formType === 'sell') {
      if (!formPrice || !formQty) {
        setError('매도는 단가/수량이 모두 필수입니다');
        return;
      }
    } else if (formType === 'exchange') {
      if (!formAmountKRW || !formAmountUSD || !formExRate) {
        setError('환전은 원화/달러/환율이 모두 필수입니다');
        return;
      }
    }

    const body: Record<string, unknown> = {
      cycle_num: cycleNum,
      record_type: formType,
      ticker: activeCycle.ticker,
      trade_date: formDate,
      notes: formNotes || null,
    };

    if (formType === 'exchange') {
      body.amount_usd = parseFloat(formAmountUSD);
      body.amount_krw = parseInt(formAmountKRW.replace(/,/g, ''));
      body.exchange_rate = parseFloat(formExRate);
    } else {
      body.price = parseFloat(formPrice);
      body.quantity = parseInt(formQty);
      if (formType === 'buy') body.slot_num = parseInt(formSlot);
    }

    try {
      setLoading(true);
      const r = await fetch('/api/infinite/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || '기록 추가 실패');
      }
      setFormOpen(false);
      resetForm();
      await fetchData();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cycles, formType, formDate, formPrice, formQty, formSlot, formAmountUSD, formAmountKRW, formExRate, formNotes, fetchData]);

  const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const resetForm = () => {
    setFormType('buy');
    setFormDate(todayLocal());
    setFormPrice('');
    setFormQty('');
    setFormSlot('');
    setFormAmountUSD('');
    setFormAmountKRW('');
    setFormExRate('');
    setFormNotes('');
  };

  // 환전 폼에서 자동 환율 계산
  useEffect(() => {
    if (formType === 'exchange' && formAmountKRW && formAmountUSD) {
      const krw = parseInt(formAmountKRW.replace(/,/g, ''));
      const usd = parseFloat(formAmountUSD);
      if (krw > 0 && usd > 0) {
        setFormExRate((krw / usd).toFixed(2));
      }
    }
  }, [formAmountKRW, formAmountUSD, formType]);

  const activeCycleForFilter = cycles.find(c => c.status === 'active');
  const filterCycleNum =
    selectedCycle === 'all' ? null
    : selectedCycle === 'active' ? (activeCycleForFilter?.cycle_num ?? null)
    : parseInt(selectedCycle);

  // 사이클별 수익 현황 데이터 (선택 사이클로 필터)
  const cycleSummaries = cycles
    .filter(c => filterCycleNum == null || c.cycle_num === filterCycleNum)
    .map(c => {
    const cycleJournal = journal.filter(j => j.cycle_num === c.cycle_num);
    const buys = cycleJournal.filter(j => j.record_type === 'buy');
    const sells = cycleJournal.filter(j => j.record_type === 'sell');
    const totalInvested = buys.reduce((sum, j) => sum + (j.amount_usd || 0), 0);
    const totalSold = sells.reduce((sum, j) => sum + (j.amount_usd || 0), 0);

    let profit = 0;
    let profitRate = 0;
    if (c.status === 'completed' && totalInvested > 0) {
      profit = totalSold - totalInvested;
      profitRate = (profit / totalInvested) * 100;
    } else if (c.profit_usd != null) {
      profit = c.profit_usd;
      profitRate = c.profit_rate || 0;
    }

    return {
      ...c,
      totalInvested,
      totalSold,
      profit,
      profitRate,
      profitKRW: Math.round(profit * exchangeRate),
    };
  });

  const totalProfit = cycleSummaries.reduce((s, c) => s + c.profit, 0);
  const totalInvested = cycleSummaries.reduce((s, c) => s + c.totalInvested, 0);

  const activeCycle = activeCycleForFilter;

  // 매매일지는 매수/매도만 + 선택한 사이클로 필터
  const tradeJournal = journal
    .filter(j => j.record_type !== 'exchange')
    .filter(j => filterCycleNum == null || j.cycle_num === filterCycleNum);

  return (
    <ExcelFrame
      onRefresh={fetchData}
      refreshing={loading}
      ribbonExtra={
        <>
          <button className="btn-ribbon" onClick={() => { resetForm(); setFormOpen(true); }}>
            기록 추가
          </button>
          <select
            value={selectedCycle}
            onChange={e => setSelectedCycle(e.target.value)}
            style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #d4d4d4', borderRadius: 3 }}
          >
            <option value="active">
              {activeCycle ? `사이클 #${activeCycle.cycle_num} (진행중)` : '활성 사이클'}
            </option>
            {cycles.filter(c => c.status !== 'active').map(c => (
              <option key={c.cycle_num} value={c.cycle_num.toString()}>
                사이클 #{c.cycle_num} ({c.status === 'completed' ? '완료' : c.status})
              </option>
            ))}
            <option value="all">전체</option>
          </select>
        </>
      }
    >
      {error && (
        <div style={{ margin: 12, padding: 8, backgroundColor: '#ffc7ce', color: '#9c0006', fontSize: 11, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* ── 기록 추가 모달 ── */}
      {formOpen && (
        <div
          onClick={() => setFormOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: '#fff', border: '1px solid #b4b4b4', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', width: '90%', maxWidth: 400, display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ backgroundColor: '#217346', color: '#fff', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, fontSize: 12 }}>
              <span>기록 추가</span>
              <button onClick={() => setFormOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              {/* 유형 선�� */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['buy', 'sell', 'exchange'] as const).map(t => (
                  <label key={t} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" name="recordType" checked={formType === t} onChange={() => setFormType(t)} />
                    {TAG_LABELS[t]}
                  </label>
                ))}
              </div>

              {/* 공통: 일자 */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: '#666', display: 'block', marginBottom: 2 }}>
                  일자<span style={{ color: '#9c0006' }}> *</span>
                </label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required
                  style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3 }} />
              </div>

              {formType !== 'exchange' ? (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: '#666', display: 'block', marginBottom: 2 }}>
                      단가 ($)<span style={{ color: '#9c0006' }}> *</span>
                    </label>
                    <input type="number" step="0.01" value={formPrice} onChange={e => setFormPrice(e.target.value)} required
                      style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3 }} />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: '#666', display: 'block', marginBottom: 2 }}>
                      수량 (정수)<span style={{ color: '#9c0006' }}> *</span>
                    </label>
                    <input type="number" step="1" value={formQty} onChange={e => setFormQty(e.target.value)} required
                      style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3 }} />
                  </div>
                  {formType === 'buy' && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 10, color: '#666', display: 'block', marginBottom: 2 }}>
                        슬롯 번호<span style={{ color: '#9c0006' }}> *</span>
                      </label>
                      <input type="number" step="1" value={formSlot} onChange={e => setFormSlot(e.target.value)} required
                        style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3 }} />
                    </div>
                  )}
                  {formPrice && formQty && (
                    <div style={{ fontSize: 11, color: '#217346', marginBottom: 8 }}>
                      금액: {fmtUSD(parseFloat(formPrice) * parseInt(formQty || '0'))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: '#666', display: 'block', marginBottom: 2 }}>
                      원화 (&#8361;)<span style={{ color: '#9c0006' }}> *</span>
                    </label>
                    <input type="text" value={formAmountKRW} onChange={e => setFormAmountKRW(e.target.value)}
                      placeholder="1000000" required
                      style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3 }} />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: '#666', display: 'block', marginBottom: 2 }}>
                      달러 ($)<span style={{ color: '#9c0006' }}> *</span>
                    </label>
                    <input type="number" step="0.01" value={formAmountUSD} onChange={e => setFormAmountUSD(e.target.value)} required
                      style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3 }} />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: '#666', display: 'block', marginBottom: 2 }}>
                      환율 (자동계산)<span style={{ color: '#9c0006' }}> *</span>
                    </label>
                    <input type="number" step="0.01" value={formExRate} onChange={e => setFormExRate(e.target.value)} required
                      style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3 }} />
                  </div>
                </>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: '#666', display: 'block', marginBottom: 2 }}>메모</label>
                <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)}
                  style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid #d4d4d4', borderRadius: 3 }} />
              </div>

              {(() => {
                const canSubmit =
                  !!formDate &&
                  (formType === 'buy'
                    ? !!formPrice && !!formQty && !!formSlot
                    : formType === 'sell'
                      ? !!formPrice && !!formQty
                      : !!formAmountKRW && !!formAmountUSD && !!formExRate);
                return (
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !canSubmit}
                    style={{ width: '100%', padding: '8px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 3, cursor: canSubmit && !loading ? 'pointer' : 'not-allowed', backgroundColor: canSubmit && !loading ? '#217346' : '#a5c9b3', color: '#fff' }}
                  >
                    {loading ? '저장 중...' : '저장'}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── 사이클별 수익 현황 ── */}
      <div style={S.section}>사이클별 수익 현황</div>
      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
            <thead>
              <tr>
                {([
                  ['사이클', 'L'], ['슬롯', 'R'], ['종목', 'L'], ['기간', 'L'],
                  ['투자($)', 'R'], ['수익($)', 'R'], ['수익률', 'R'], ['수익(원)', 'R'],
                ] as [string, 'L' | 'R'][]).map(([h, a]) => (
                  <th key={h} style={a === 'R' ? S.thR : S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycleSummaries.map(c => (
                <tr key={c.cycle_num} style={{ backgroundColor: c.status === 'active' ? '#f0fff0' : undefined }}>
                  <td style={S.td}>#{c.cycle_num}</td>
                  <td style={S.tdR}>{c.used_slots}/{c.total_slots}</td>
                  <td style={S.td}>{c.ticker}</td>
                  <td style={S.td}>{fmtDate(c.start_date)}~{c.end_date ? fmtDate(c.end_date) : '진행중'}</td>
                  <td style={S.tdR}>{fmtUSD(c.totalInvested)}</td>
                  <td style={{ ...S.tdR, color: c.profit >= 0 ? '#006100' : '#9c0006' }}>
                    {c.profit >= 0 ? '+' : ''}{fmtUSD(c.profit)}
                  </td>
                  <td style={{ ...S.tdR, color: c.profitRate >= 0 ? '#006100' : '#9c0006' }}>
                    {c.profitRate >= 0 ? '+' : ''}{c.profitRate.toFixed(1)}%
                  </td>
                  <td style={{ ...S.tdR, color: '#888' }}>
                    ≈{c.profitKRW >= 0 ? '+' : ''}{c.profitKRW.toLocaleString()}
                  </td>
                </tr>
              ))}
              {cycleSummaries.length > 1 && (
                <tr style={{ backgroundColor: '#f5f5f5', fontWeight: 600 }}>
                  <td style={S.td} colSpan={4}>합계</td>
                  <td style={S.tdR}>{fmtUSD(totalInvested)}</td>
                  <td style={{ ...S.tdR, color: totalProfit >= 0 ? '#006100' : '#9c0006' }}>
                    {totalProfit >= 0 ? '+' : ''}{fmtUSD(totalProfit)}
                  </td>
                  <td style={{ ...S.tdR, color: totalProfit >= 0 ? '#006100' : '#9c0006' }}>
                    {totalInvested > 0 ? `${totalProfit >= 0 ? '+' : ''}${((totalProfit / totalInvested) * 100).toFixed(1)}%` : '-'}
                  </td>
                  <td style={{ ...S.tdR, color: '#888' }}>
                    ≈{Math.round(totalProfit * exchangeRate).toLocaleString()}
                  </td>
                </tr>
              )}
              {cycleSummaries.length === 0 && (
                <tr><td style={S.td} colSpan={8}>사이클 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 매매일지 ── */}
      <div style={S.section}>매매일지</div>
      {renderJournalTable(tradeJournal)}

      <div style={{ height: 20 }} />
    </ExcelFrame>
  );
}

function renderJournalTable(items: InfiniteBuyJournal[]) {
  const S2 = {
    th: { padding: '6px 10px', fontSize: 11, fontWeight: 600, backgroundColor: '#f5f5f5', borderBottom: '1px solid #d4d4d4', borderRight: '1px solid #e0e0e0', textAlign: 'left' as const, whiteSpace: 'nowrap' as const },
    thR: { padding: '6px 10px', fontSize: 11, fontWeight: 600, backgroundColor: '#f5f5f5', borderBottom: '1px solid #d4d4d4', borderRight: '1px solid #e0e0e0', textAlign: 'right' as const, whiteSpace: 'nowrap' as const },
    td: { padding: '5px 10px', fontSize: 11, borderBottom: '1px solid #e0e0e0', borderRight: '1px solid #e0e0e0' },
    tdR: { padding: '5px 10px', fontSize: 11, borderBottom: '1px solid #e0e0e0', borderRight: '1px solid #e0e0e0', textAlign: 'right' as const, fontFamily: 'monospace' },
  };
  const fmtUSD2 = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate2 = (d: string) => { const [, m, day] = d.split('-'); return `${m}/${day}`; };

  return (
    <div style={{ margin: '0 0 12px', border: '1px solid #d4d4d4', borderRadius: '0 0 4px 4px', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              {([
                ['사이클', 'L'], ['슬롯', 'R'], ['일자', 'L'], ['유형', 'L'],
                ['단가', 'R'], ['수량', 'R'], ['금액($)', 'R'],
                ['메모', 'L'],
              ] as [string, 'L' | 'R'][]).map(([h, a]) => (
                <th key={h} style={a === 'R' ? S2.thR : S2.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(j => (
              <tr key={j.id} style={{ backgroundColor: ROW_BG[j.record_type] || undefined }}>
                <td style={S2.td}>#{j.cycle_num}</td>
                <td style={S2.tdR}>{j.slot_num ?? '-'}</td>
                <td style={S2.td}>{fmtDate2(j.trade_date)}</td>
                <td style={S2.td}>
                  <span style={{
                    padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                    backgroundColor: TAG_STYLES[j.record_type]?.bg,
                    color: TAG_STYLES[j.record_type]?.color,
                  }}>
                    {TAG_LABELS[j.record_type]}
                  </span>
                </td>
                <td style={S2.tdR}>{j.price ? fmtUSD2(j.price) : '-'}</td>
                <td style={S2.tdR}>{j.quantity ?? '-'}</td>
                <td style={S2.tdR}>{j.amount_usd ? fmtUSD2(j.amount_usd) : '-'}</td>
                <td style={{ ...S2.td, color: '#888', fontSize: 10 }}>{j.notes || ''}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td style={S2.td} colSpan={8}>기록 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
