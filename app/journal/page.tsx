'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ExcelFrame from '@/components/ExcelFrame';
import type { JournalEntry } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

// ── 셀 스타일 ──
const S = {
  th: {
    backgroundColor: '#f2f2f2', border: '1px solid #d4d4d4', padding: '4px 6px',
    fontWeight: 600 as const, textAlign: 'center' as const, whiteSpace: 'nowrap' as const, fontSize: 10,
  },
  td: { border: '1px solid #e0e0e0', padding: '3px 6px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  tdL: { border: '1px solid #e0e0e0', padding: '3px 6px', textAlign: 'left' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  tdC: { border: '1px solid #e0e0e0', padding: '3px 6px', textAlign: 'center' as const, whiteSpace: 'nowrap' as const, fontSize: 11 },
  section: { backgroundColor: '#d9e2f3', border: '1px solid #b4c6e7', padding: '5px 8px', fontWeight: 700 as const, color: '#1f3864', fontSize: 11 },
  rowNum: { border: '1px solid #d4d4d4', padding: '3px 4px', textAlign: 'center' as const, backgroundColor: '#f2f2f2', color: '#666', width: 28, fontSize: 10 },
  label: { border: '1px solid #e0e0e0', padding: '3px 8px', textAlign: 'left' as const, backgroundColor: '#f7f7f7', fontWeight: 600 as const, fontSize: 11 },
};

const reasonColor: Record<string, string> = {
  '익절': '#006100',
  '손절': '#9c0006',
  '종가청산': '#888',
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [strategyFilter, setStrategyFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showBuyForm, setShowBuyForm] = useState(false);
  const [sellTarget, setSellTarget] = useState<JournalEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (strategyFilter) params.set('strategy', strategyFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/journal?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) setEntries(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [strategyFilter, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchEntries().finally(() => setLoading(false));
  }, [fetchEntries]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`"${name}" 기록을 삭제하시겠습니까?`)) return;
    await fetch(`/api/journal/${id}`, { method: 'DELETE' });
    fetchEntries();
  }, [fetchEntries]);

  const open = entries.filter((e) => !e.sell_date);
  const closed = entries.filter((e) => e.sell_date);

  // 성과 통계
  const wins = closed.filter((e) => (e.profit_loss || 0) > 0);
  const totalTrades = closed.length;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const avgReturn = totalTrades > 0 ? closed.reduce((s, e) => s + (e.profit_rate || 0), 0) / totalTrades : 0;
  const totalPnl = closed.reduce((s, e) => s + (e.profit_loss || 0), 0);

  const statusItems = {
    count: String(entries.length),
    sum: totalTrades > 0 ? `${fmt(totalPnl)}` : '0',
  };

  return (
    <ExcelFrame statusItems={statusItems}>
      <div style={{ padding: 0 }}>
        {/* ── 컨트롤 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={S.section} colSpan={2}>매매일지</td></tr>
            <tr>
              <td style={S.rowNum}>1</td>
              <td style={{ ...S.tdL, padding: '6px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-ribbon" onClick={() => setShowBuyForm(true)}>
                    + 매수 기록 추가
                  </button>
                  <select value={strategyFilter} onChange={(e) => setStrategyFilter(e.target.value)}
                    style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #d4d4d4' }}>
                    <option value="">전략: 전체</option>
                    <option value="swing">스윙</option>
                    <option value="sector">섹터</option>
                  </select>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #d4d4d4' }}>
                    <option value="">상태: 전체</option>
                    <option value="open">보유중</option>
                    <option value="closed">청산</option>
                  </select>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {error && (
          <div style={{ padding: '8px 12px', color: '#9c0006', fontWeight: 700, fontSize: 11 }}>
            #ERROR — {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 20, color: '#888', fontSize: 11 }}>로딩 중...</div>
        ) : (
          <>
            {/* ── 보유 중 ── */}
            {(statusFilter === '' || statusFilter === 'open') && (
              <OpenTable entries={open} onSell={setSellTarget} onDelete={handleDelete} />
            )}

            {/* ── 청산 완료 ── */}
            {(statusFilter === '' || statusFilter === 'closed') && (
              <ClosedTable entries={closed} onDelete={handleDelete} />
            )}

            {/* ── 성과 요약 ── */}
            {totalTrades > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ ...S.tdL, padding: '6px 8px', fontSize: 11 }}>
                      <span style={{ color: '#666' }}>
                        청산 {totalTrades}건 | 승률{' '}
                        <span style={{ color: winRate >= 50 ? '#006100' : '#9c0006', fontWeight: 600 }}>{winRate.toFixed(1)}%</span>
                        {' '}| 총손익{' '}
                        <span style={{ color: totalPnl >= 0 ? '#006100' : '#9c0006', fontWeight: 600 }}>{totalPnl > 0 ? '+' : ''}{fmt(totalPnl)}</span>
                      </span>
                      <Link href="/analysis" style={{ marginLeft: 12, fontSize: 10, color: '#2e75b6', textDecoration: 'none' }}>
                        상세 분석 →
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── 매수 모달 ── */}
        {showBuyForm && (
          <BuyModal
            onClose={() => setShowBuyForm(false)}
            onSaved={() => { setShowBuyForm(false); fetchEntries(); }}
          />
        )}

        {/* ── 매도 모달 ── */}
        {sellTarget && (
          <SellModal
            entry={sellTarget}
            onClose={() => setSellTarget(null)}
            onSaved={() => { setSellTarget(null); fetchEntries(); }}
          />
        )}
      </div>
    </ExcelFrame>
  );
}

// ── 보유 중 테이블 ──
function OpenTable({ entries, onSell, onDelete }: {
  entries: JournalEntry[];
  onSell: (e: JournalEntry) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr><th style={{ ...S.section, textAlign: 'left' }} colSpan={10}>보유 중 ({entries.length}건)</th></tr>
        {entries.length > 0 && (
          <tr>
            <th style={{ ...S.th, width: 28 }}>#</th>
            <th style={S.th}>전략</th>
            <th style={{ ...S.th, textAlign: 'left' }}>종목명</th>
            <th style={S.th}>매수일</th>
            <th style={S.th}>매수가</th>
            <th style={S.th}>수량</th>
            <th style={S.th}>매수금액</th>
            <th style={S.th}>풀</th>
            <th style={S.th}>메모</th>
            <th style={S.th}></th>
          </tr>
        )}
      </thead>
      <tbody>
        {entries.length === 0 ? (
          <tr><td style={{ ...S.tdL, color: '#888', padding: 8 }} colSpan={10}>보유 중인 종목이 없습니다.</td></tr>
        ) : entries.map((e, i) => (
          <tr key={e.id} style={{ backgroundColor: '#FFFDE7' }}>
            <td style={S.rowNum}>{i + 1}</td>
            <td style={{ ...S.tdC, fontSize: 10, color: e.strategy === 'swing' ? '#2e75b6' : '#7030a0' }}>
              {e.strategy === 'swing' ? '스윙' : '섹터'}
            </td>
            <td style={S.tdL}>{e.ticker_name}</td>
            <td style={S.tdC}>{e.buy_date}</td>
            <td style={S.td}>{fmt(e.buy_price)}</td>
            <td style={S.td}>{e.buy_qty}</td>
            <td style={S.td}>{fmt(e.buy_amount)}</td>
            <td style={S.tdC}>{e.pool_type || '—'}</td>
            <td style={{ ...S.tdL, fontSize: 10, color: '#666', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' as const }}>
              {e.notes || ''}
            </td>
            <td style={{ ...S.tdC, whiteSpace: 'nowrap' as const }}>
              <button onClick={() => onSell(e)} style={{ fontSize: 10, padding: '1px 6px', marginRight: 2, cursor: 'pointer', border: '1px solid #d4d4d4', backgroundColor: '#fff' }}>매도</button>
              <button onClick={() => onDelete(e.id, e.ticker_name)} style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer', border: '1px solid #d4d4d4', backgroundColor: '#fff', color: '#9c0006' }}>삭제</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 청산 테이블 ──
function ClosedTable({ entries, onDelete }: {
  entries: JournalEntry[];
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr><th style={{ ...S.section, textAlign: 'left' }} colSpan={11}>청산 완료 ({entries.length}건)</th></tr>
        {entries.length > 0 && (
          <tr>
            <th style={{ ...S.th, width: 28 }}>#</th>
            <th style={S.th}>전략</th>
            <th style={{ ...S.th, textAlign: 'left' }}>종목명</th>
            <th style={S.th}>매수일</th>
            <th style={S.th}>매도일</th>
            <th style={S.th}>매수가</th>
            <th style={S.th}>매도가</th>
            <th style={S.th}>손익</th>
            <th style={S.th}>수익률</th>
            <th style={S.th}>사유</th>
            <th style={S.th}></th>
          </tr>
        )}
      </thead>
      <tbody>
        {entries.length === 0 ? (
          <tr><td style={{ ...S.tdL, color: '#888', padding: 8 }} colSpan={11}>청산 기록이 없습니다.</td></tr>
        ) : entries.map((e, i) => {
          const pnl = e.profit_loss || 0;
          const rowBg = pnl > 0 ? '#c6efce' : pnl < 0 ? '#ffc7ce' : '#fff';
          return (
            <tr key={e.id} style={{ backgroundColor: rowBg }}>
              <td style={S.rowNum}>{i + 1}</td>
              <td style={{ ...S.tdC, fontSize: 10, color: e.strategy === 'swing' ? '#2e75b6' : '#7030a0' }}>
                {e.strategy === 'swing' ? '스윙' : '섹터'}
              </td>
              <td style={S.tdL}>{e.ticker_name}</td>
              <td style={S.tdC}>{e.buy_date}</td>
              <td style={S.tdC}>{e.sell_date}</td>
              <td style={S.td}>{fmt(e.buy_price)}</td>
              <td style={S.td}>{e.sell_price ? fmt(e.sell_price) : '—'}</td>
              <td style={{ ...S.td, fontWeight: 600, color: pnl > 0 ? '#006100' : pnl < 0 ? '#9c0006' : '#333' }}>
                {pnl > 0 ? '+' : ''}{fmt(pnl)}
              </td>
              <td style={{ ...S.td, fontWeight: 600, color: (e.profit_rate || 0) > 0 ? '#006100' : (e.profit_rate || 0) < 0 ? '#9c0006' : '#333' }}>
                {e.profit_rate !== null ? fmtPct(e.profit_rate) : '—'}
              </td>
              <td style={{ ...S.tdC, fontSize: 10, color: reasonColor[e.close_reason || ''] || '#333' }}>
                {e.close_reason || '—'}
              </td>
              <td style={S.tdC}>
                <button onClick={() => onDelete(e.id, e.ticker_name)} style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer', border: '1px solid #d4d4d4', backgroundColor: '#fff', color: '#9c0006' }}>삭제</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── 종목 자동완성 타입 ──
interface TickerSuggestion {
  code: string;
  name: string;
  strategy: 'swing' | 'sector';
  pool_type?: string;
}

// ── 매수 모달 ──
function BuyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    strategy: 'swing',
    ticker_code: '',
    ticker_name: '',
    buy_date: todayStr(),
    buy_price: '',
    buy_qty: '',
    pool_type: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // 자동완성
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [filtered, setFiltered] = useState<TickerSuggestion[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [hlIdx, setHlIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/journal/tickers')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setSuggestions(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const handleNameChange = (value: string) => {
    setForm((f) => ({ ...f, ticker_name: value, ticker_code: '' }));
    if (!value.trim()) { setFiltered([]); setShowDrop(false); return; }
    const q = value.toLowerCase();
    const list = suggestions
      .filter((s) => s.strategy === form.strategy)
      .filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q));
    setFiltered(list);
    setShowDrop(list.length > 0);
    setHlIdx(-1);
  };

  const selectSuggestion = (s: TickerSuggestion) => {
    setForm((f) => ({ ...f, ticker_code: s.code, ticker_name: s.name, pool_type: s.pool_type || f.pool_type }));
    setShowDrop(false);
    setHlIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDrop) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHlIdx((p) => Math.min(p + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHlIdx((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter' && hlIdx >= 0) { e.preventDefault(); selectSuggestion(filtered[hlIdx]); }
    else if (e.key === 'Escape') setShowDrop(false);
  };

  const buyAmount = (parseInt(form.buy_price) || 0) * (parseInt(form.buy_qty) || 0);

  const handleSubmit = async () => {
    if (!form.ticker_code || !form.ticker_name || !form.buy_price || !form.buy_qty) {
      setErr('필수 필드를 입력하세요.');
      return;
    }
    setSubmitting(true);
    setErr('');
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          buy_price: parseInt(form.buy_price),
          buy_qty: parseInt(form.buy_qty),
          pool_type: form.pool_type || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: '#1f3864' }}>매수 기록 추가</div>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <FormRow label="전략">
              <label style={{ fontSize: 11 }}>
                <input type="radio" name="strategy" value="swing" checked={form.strategy === 'swing'}
                  onChange={(e) => setForm({ ...form, strategy: e.target.value, ticker_code: '', ticker_name: '', pool_type: '' })} /> 스윙
              </label>
              <label style={{ fontSize: 11, marginLeft: 8 }}>
                <input type="radio" name="strategy" value="sector" checked={form.strategy === 'sector'}
                  onChange={(e) => setForm({ ...form, strategy: e.target.value, ticker_code: '', ticker_name: '', pool_type: '' })} /> 섹터
              </label>
            </FormRow>
            <FormRow label="종목명">
              <div ref={wrapRef} style={{ position: 'relative' }}>
                <input
                  style={{ ...inputStyle, width: 180 }}
                  value={form.ticker_name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => { if (form.ticker_name.trim() && filtered.length > 0) setShowDrop(true); }}
                  placeholder="종목명 입력"
                  autoComplete="off"
                />
                {showDrop && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, width: 260,
                    maxHeight: 160, overflowY: 'auto',
                    backgroundColor: '#fff', border: '1px solid #d4d4d4', borderTop: 'none',
                    zIndex: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                  }}>
                    {filtered.map((s, i) => (
                      <div
                        key={s.code}
                        onClick={() => selectSuggestion(s)}
                        onMouseEnter={() => setHlIdx(i)}
                        style={{
                          padding: '4px 6px', fontSize: 11, cursor: 'pointer',
                          backgroundColor: i === hlIdx ? '#d6e4f0' : '#fff',
                          borderBottom: '1px solid #f0f0f0',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      >
                        <span>{s.name}</span>
                        <span style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>
                          {s.code}
                          {s.pool_type && <span style={{ marginLeft: 4, color: '#2e75b6' }}>({s.pool_type})</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FormRow>
            <FormRow label="종목코드">
              <input
                style={{ ...inputStyle, backgroundColor: form.ticker_code ? '#e2efda' : '#fff' }}
                value={form.ticker_code}
                onChange={(e) => setForm({ ...form, ticker_code: e.target.value })}
                placeholder="종목명에서 자동입력"
                maxLength={6}
              />
            </FormRow>
            <FormRow label="매수일"><input style={inputStyle} type="date" value={form.buy_date} onChange={(e) => setForm({ ...form, buy_date: e.target.value })} /></FormRow>
            <FormRow label="매수가"><input style={inputStyle} type="number" value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} /></FormRow>
            <FormRow label="수량"><input style={inputStyle} type="number" value={form.buy_qty} onChange={(e) => setForm({ ...form, buy_qty: e.target.value })} /></FormRow>
            <FormRow label="매수금액"><span style={{ fontSize: 11, fontWeight: 600 }}>{fmt(buyAmount)}</span></FormRow>
            {form.strategy === 'swing' && (
              <FormRow label="풀구분">
                <select style={{ ...inputStyle, width: 80 }} value={form.pool_type} onChange={(e) => setForm({ ...form, pool_type: e.target.value })}>
                  <option value="">없음</option>
                  <option value="1차">1차</option>
                  <option value="2차">2차</option>
                </select>
              </FormRow>
            )}
            <FormRow label="메모"><input style={{ ...inputStyle, width: 200 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormRow>
          </tbody>
        </table>
        {err && <div style={{ color: '#9c0006', fontSize: 10, marginTop: 6 }}>{err}</div>}
        <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
          <button className="btn-ribbon" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '저장 중...' : '저장'}
          </button>
          <button onClick={onClose} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #d4d4d4', backgroundColor: '#fff', cursor: 'pointer' }}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ── 매도 모달 ──
function SellModal({ entry, onClose, onSaved }: { entry: JournalEntry; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    sell_date: todayStr(),
    sell_price: '',
    close_reason: '익절',
    notes: entry.notes || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const sellPrice = parseInt(form.sell_price) || 0;
  const sellAmount = sellPrice * entry.buy_qty;
  const profitLoss = sellAmount - entry.buy_amount;
  const profitRate = entry.buy_price > 0 ? ((sellPrice - entry.buy_price) / entry.buy_price) * 100 : 0;

  const handleSubmit = async () => {
    if (!form.sell_price) {
      setErr('매도가를 입력하세요.');
      return;
    }
    setSubmitting(true);
    setErr('');
    try {
      const res = await fetch(`/api/journal/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sell_date: form.sell_date,
          sell_price: sellPrice,
          close_reason: form.close_reason,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: '#1f3864' }}>
          매도 — {entry.ticker_name} ({entry.buy_qty}주)
        </div>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <FormRow label="매수가"><span style={{ fontSize: 11 }}>{fmt(entry.buy_price)} x {entry.buy_qty}주 = {fmt(entry.buy_amount)}</span></FormRow>
            <FormRow label="매도일"><input style={inputStyle} type="date" value={form.sell_date} onChange={(e) => setForm({ ...form, sell_date: e.target.value })} /></FormRow>
            <FormRow label="매도가"><input style={inputStyle} type="number" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} /></FormRow>
            <FormRow label="매도금액"><span style={{ fontSize: 11, fontWeight: 600 }}>{fmt(sellAmount)}</span></FormRow>
            <FormRow label="손익">
              <span style={{ fontSize: 11, fontWeight: 700, color: profitLoss > 0 ? '#006100' : profitLoss < 0 ? '#9c0006' : '#333' }}>
                {profitLoss > 0 ? '+' : ''}{fmt(profitLoss)} ({fmtPct(profitRate)})
              </span>
            </FormRow>
            <FormRow label="청산사유">
              {['익절', '손절', '종가청산'].map((r) => (
                <label key={r} style={{ fontSize: 11, marginRight: 8 }}>
                  <input type="radio" name="reason" value={r} checked={form.close_reason === r} onChange={(e) => setForm({ ...form, close_reason: e.target.value })} /> {r}
                </label>
              ))}
            </FormRow>
            <FormRow label="메모"><input style={{ ...inputStyle, width: 200 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormRow>
          </tbody>
        </table>
        {err && <div style={{ color: '#9c0006', fontSize: 10, marginTop: 6 }}>{err}</div>}
        <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
          <button className="btn-ribbon" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '저장 중...' : '매도 저장'}
          </button>
          <button onClick={onClose} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #d4d4d4', backgroundColor: '#fff', cursor: 'pointer' }}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ── 폼 행 ──
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={{ padding: '3px 8px 3px 0', fontSize: 11, fontWeight: 600, color: '#333', whiteSpace: 'nowrap' as const }}>{label}</td>
      <td style={{ padding: '3px 0' }}>{children}</td>
    </tr>
  );
}

const inputStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 6px', border: '1px solid #d4d4d4', width: 120,
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalBox: React.CSSProperties = {
  backgroundColor: '#fff', padding: '16px 20px', border: '1px solid #d4d4d4',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 320,
};