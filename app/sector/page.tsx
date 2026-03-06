'use client';

import { useState, useEffect, useCallback } from 'react';
import ExcelFrame from '@/components/ExcelFrame';
import StrategyRulesModal from '@/components/StrategyRulesModal';
import { canScreenSector, canRefreshRSI } from '@/lib/tradingHours';
import type { EntrySignal } from '@/lib/rsi';

interface SectorETFResult {
  code: string;
  name: string;
  price: number;
  m1Return: number;
  m3Return: number | null;
  composite: number;
  rank: number;
  rsi?: number | null;
  prices: { current: number; m1Ago: number; m3Ago: number | null };
}

interface SectorResult {
  etfs: SectorETFResult[];
  selected: { code: string; name: string; composite: number } | null;
  month: { year: number; month: number; label: string };
  screenDate?: string;
  processedAt?: string;
}

interface HistoryOption {
  screen_date: string;
  month_label: string;
  selected_ticker: string | null;
  selected_name: string | null;
  created_at?: string;
}

interface LockedTarget {
  name: string;
  code: string;
  rsi: number | null;
  signal: EntrySignal;
  month: string;
  updatedAt?: string;
}

const fmt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

function getEntrySignalLocal(rsi: number | null): EntrySignal {
  if (rsi === null) return 'NO_DATA';
  if (rsi < 30) return 'BUY';
  return 'WAIT';
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
function fmtOption(h: HistoryOption): string {
  const d = new Date(h.screen_date + 'T00:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${DAY_NAMES[d.getDay()]})`;
}

function groupByMonth(items: HistoryOption[]): { label: string; items: HistoryOption[] }[] {
  const groups: { label: string; items: HistoryOption[] }[] = [];
  const map = new Map<string, HistoryOption[]>();
  for (const h of items) {
    const key = h.month_label || '기타';
    if (!map.has(key)) { map.set(key, []); groups.push({ label: key, items: map.get(key)! }); }
    map.get(key)!.push(h);
  }
  return groups;
}

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
};

function pnlColor(n: number): string {
  return n > 0 ? '#006100' : n < 0 ? '#9c0006' : '#333';
}

export default function SectorPage() {
  const [result, setResult] = useState<SectorResult | null>(null);
  const [history, setHistory] = useState<HistoryOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedTarget, setLockedTarget] = useState<LockedTarget | null>(null);
  const [rsiLoading, setRsiLoading] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [sectorTimeStatus, setSectorTimeStatus] = useState(canScreenSector());
  const [rsiTimeStatus, setRsiTimeStatus] = useState(canRefreshRSI());

  // 1분마다 시간 체크
  useEffect(() => {
    const check = () => {
      setSectorTimeStatus(canScreenSector());
      setRsiTimeStatus(canRefreshRSI());
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  // DB에서 특정 날짜 결과 로드
  const loadDateData = useCallback(async (screenDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/sector/history?screen_date=${screenDate}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('데이터 없음');
      const data = await r.json();
      const etfs: SectorETFResult[] = data.result || [];
      const topEtf = [...etfs].sort((a: SectorETFResult, b: SectorETFResult) => b.composite - a.composite)[0];
      setResult({
        etfs,
        selected: data.selected_ticker
          ? { code: data.selected_ticker, name: data.selected_name || '', composite: topEtf?.composite || 0 }
          : null,
        month: { year: data.year, month: data.month_num, label: data.month_label || '' },
        screenDate: data.created_at || data.screen_date || '',
      });
      // 이력 로드 시 1위 ETF를 lockedTarget으로 설정
      if (topEtf && data.selected_ticker) {
        const monthStr = `${data.year}-${String(data.month_num).padStart(2, '0')}`;
        setLockedTarget({
          name: data.selected_name || topEtf.name,
          code: data.selected_ticker,
          rsi: topEtf.rsi ?? null,
          signal: getEntrySignalLocal(topEtf.rsi ?? null),
          month: monthStr,
        });
      }
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 드롭다운 변경 핸들러
  const handleDateChange = useCallback((value: string) => {
    setSelectedDate(value);
    loadDateData(value);
  }, [loadDateData]);

  // 초기 로드: 이력 목록 + 최신 결과
  useEffect(() => {
    fetch('/api/sector/history', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setHistory(data);
          if (data.length > 0) {
            const latest = data[0];
            setSelectedDate(latest.screen_date);
            loadDateData(latest.screen_date);
          }
        }
      })
      .catch(() => {});
  }, [loadDateData]);

  // 섹터 스크리닝 실행
  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/sector', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: SectorResult = await res.json();

      // 1) API 응답을 바로 테이블에 렌더링
      setResult({ ...data, screenDate: new Date().toISOString() });

      // 2) 1위 ETF를 lockedTarget으로 저장
      if (data.selected && data.etfs.length > 0) {
        const topEtf = [...data.etfs].sort((a, b) => b.composite - a.composite)[0];
        const monthStr = `${data.month.year}-${String(data.month.month).padStart(2, '0')}`;
        setLockedTarget({
          name: data.selected.name,
          code: data.selected.code,
          rsi: topEtf.rsi ?? null,
          signal: getEntrySignalLocal(topEtf.rsi ?? null),
          month: monthStr,
          updatedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        });
      }

      // 3) 이력 드롭다운을 서버에서 다시 fetch
      const histRes = await fetch('/api/sector/history', { cache: 'no-store' });
      if (histRes.ok) {
        const histData = await histRes.json();
        if (Array.isArray(histData) && histData.length > 0) {
          setHistory(histData);
          setSelectedDate(histData[0].screen_date);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // RSI 새로고침 (1위 ETF만)
  const handleRsiRefresh = useCallback(async () => {
    if (!lockedTarget) return;
    setRsiLoading(true);
    try {
      const res = await fetch(`/api/sector/rsi?code=${lockedTarget.code}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('RSI 새로고침 실패');
      const data = await res.json();
      setLockedTarget((prev) => prev ? {
        ...prev,
        rsi: data.rsi,
        signal: data.signal,
        updatedAt: data.updatedAt,
      } : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRsiLoading(false);
    }
  }, [lockedTarget]);

  const etfs = result?.etfs || [];
  const sorted = [...etfs].sort((a, b) => b.composite - a.composite);

  const statusItems = result
    ? { count: String(etfs.length), sum: result.selected?.name || '' }
    : undefined;

  return (
    <ExcelFrame statusItems={statusItems}>
      <div style={{ padding: 0 }}>
        {/* ── 컨트롤 영역 ── */}
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={S.section} colSpan={2}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                  <span>섹터로테이션 스크리닝</span>
                  <button
                    onClick={() => setRulesOpen(true)}
                    style={{
                      background: 'none', border: '1px solid #b4c6e7', borderRadius: 2,
                      color: '#1f3864', fontSize: 10, padding: '1px 6px', cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    📋 전략 규칙
                  </button>
                </div>
              </td>
            </tr>
            <tr>
              <td style={S.rowNum}>1</td>
              <td style={{ ...S.tdL, padding: '6px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', flexWrap: 'wrap' }}>
                  <button
                    className="btn-ribbon"
                    onClick={handleRun}
                    disabled={loading || !sectorTimeStatus.allowed}
                    title={sectorTimeStatus.reason}
                    style={loading ? { backgroundColor: '#e2efda' } : !sectorTimeStatus.allowed ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    {loading ? '⏳ 스크리닝 중...' : '▶ 섹터 스크리닝'}
                  </button>
                  <button
                    className="btn-ribbon"
                    onClick={handleRsiRefresh}
                    disabled={rsiLoading || !lockedTarget || loading || !rsiTimeStatus.allowed}
                    title={rsiTimeStatus.reason}
                    style={{
                      ...(rsiLoading ? { backgroundColor: '#e2efda' } : {}),
                      ...(!lockedTarget || !rsiTimeStatus.allowed ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                    }}
                  >
                    {rsiLoading ? '⏳ 조회 중...' : '🔄 RSI 새로고침'}
                  </button>
                  <select
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    disabled={loading}
                    style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #d4d4d4' }}
                  >
                    {history.length === 0 && <option value="">이력 없음</option>}
                    {groupByMonth(history).map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.items.map((h) => (
                          <option key={h.screen_date} value={h.screen_date}>
                            {fmtOption(h)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {result && (
                    <span style={{ fontSize: 10, color: result.selected ? '#bf8f00' : '#999' }}>
                      매수: {result.selected ? result.selected.name : '없음'}
                    </span>
                  )}
                  {result?.screenDate && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>
                      스크리닝: {result.screenDate.length <= 10 ? result.screenDate : new Date(result.screenDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        {(!sectorTimeStatus.allowed || !rsiTimeStatus.allowed) && (
          <div style={{ padding: '4px 12px', color: '#9c0006', fontSize: 10 }}>
            ⚠ {sectorTimeStatus.reason || rsiTimeStatus.reason}
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', color: '#9c0006', fontWeight: 700, fontSize: 11 }}>
            #ERROR — {error}
          </div>
        )}

        {loading && !result && (
          <div style={{ padding: '20px 12px', color: '#888', fontSize: 11 }}>
            ⏳ 7개 ETF 데이터 수집 중... (약 5~10초 소요)
          </div>
        )}

        {result && (
          <>
            {/* ── 진입 판단 카드 ── */}
            {lockedTarget && (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ ...S.section, backgroundColor: '#FFFDE7', color: '#bf8f00' }} colSpan={2}>
                      📌 이번 달 진입 대상 ({lockedTarget.month.replace('-', '년 ')}월)
                    </td>
                  </tr>
                  <tr>
                    <td style={S.rowNum} />
                    <td style={{ ...S.tdL, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>
                          {lockedTarget.name} ({lockedTarget.code})
                        </div>
                        <div style={{ fontSize: 11, color: '#555' }}>
                          RSI(3): {lockedTarget.rsi !== null ? lockedTarget.rsi.toFixed(1) : '—'}
                          {lockedTarget.updatedAt && (
                            <span style={{ color: '#999', marginLeft: 8 }}>({lockedTarget.updatedAt} 기준)</span>
                          )}
                        </div>
                        {lockedTarget.signal === 'BUY' && (
                          <div style={{
                            display: 'inline-block', padding: '4px 10px', borderRadius: 4,
                            backgroundColor: '#c6efce', color: '#006100', fontWeight: 700, fontSize: 11,
                            width: 'fit-content',
                          }}>
                            ✅ 진입 가능 — 내일 08:50 매수
                          </div>
                        )}
                        {lockedTarget.signal === 'WAIT' && (
                          <div style={{
                            display: 'inline-block', padding: '4px 10px', borderRadius: 4,
                            backgroundColor: '#FFF3E0', color: '#e65100', fontWeight: 700, fontSize: 11,
                            width: 'fit-content',
                          }}>
                            ⏳ 대기 — RSI {lockedTarget.rsi !== null ? lockedTarget.rsi.toFixed(1) : '—'}, 내일 장 마감 후 재확인
                          </div>
                        )}
                        {lockedTarget.signal === 'NO_DATA' && (
                          <div style={{
                            display: 'inline-block', padding: '4px 10px', borderRadius: 4,
                            backgroundColor: '#f5f5f5', color: '#888', fontWeight: 700, fontSize: 11,
                            width: 'fit-content',
                          }}>
                            데이터 없음
                          </div>
                        )}
                        <div style={{ fontSize: 9, color: '#999' }}>
                          기준: RSI(3) &lt; 30 시 진입 | 월말까지 미달 시 해당 월 패스
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            )}

            {/* ── 결과 테이블 ── */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.section, textAlign: 'left' }} colSpan={10}>
                      섹터 ETF 순위
                    </th>
                  </tr>
                  {/* ── 그룹 헤더 ── */}
                  <tr>
                    <th style={S.th} rowSpan={2}>순위</th>
                    <th style={S.th} rowSpan={2}>종목코드</th>
                    <th style={{ ...S.th, textAlign: 'left' }} rowSpan={2}>ETF명</th>
                    <th style={S.th} rowSpan={2}>현재가</th>
                    <th style={{ ...S.th, backgroundColor: '#dce6f1' }} colSpan={2}>1M</th>
                    <th style={{ ...S.th, backgroundColor: '#dce6f1' }} colSpan={2}>3M</th>
                    <th style={S.th} rowSpan={2}>복합점수</th>
                    <th style={S.th} rowSpan={2}>RSI(3)</th>
                  </tr>
                  {/* ── 서브 헤더 ── */}
                  <tr>
                    <th style={{ ...S.th, backgroundColor: '#E3F2FD', fontSize: 9 }}>종가</th>
                    <th style={{ ...S.th, fontSize: 9 }}>수익률</th>
                    <th style={{ ...S.th, backgroundColor: '#E3F2FD', fontSize: 9 }}>종가</th>
                    <th style={{ ...S.th, fontSize: 9 }}>수익률</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((etf, i) => {
                    const isTop = i === 0;
                    const rowBg = isTop ? '#FFFDE7' : i % 2 === 1 ? '#fafafa' : '#fff';

                    return (
                      <tr key={etf.code} style={{ backgroundColor: rowBg }}>
                        <td style={{ ...S.tdC, fontWeight: isTop ? 700 : 400 }}>{i + 1}</td>
                        <td style={{ ...S.tdC, fontFamily: 'monospace', fontSize: 10 }}>{etf.code}</td>
                        <td style={{ ...S.tdL, fontWeight: isTop ? 700 : 400 }}>
                          {etf.name}
                          {isTop && <span style={{ fontSize: 9, color: '#bf8f00', marginLeft: 4 }}>📌</span>}
                        </td>
                        <td style={S.td}>{etf.price > 0 ? fmt(etf.price) : '—'}</td>
                        <td style={{ ...S.td, backgroundColor: '#E3F2FD' }}>
                          {etf.prices?.m1Ago ? fmt(etf.prices.m1Ago) : '—'}
                        </td>
                        <td style={{ ...S.td, color: pnlColor(etf.m1Return), fontWeight: 600 }}>
                          {fmtPct(etf.m1Return)}
                        </td>
                        <td style={{ ...S.td, backgroundColor: '#E3F2FD' }}>
                          {etf.prices?.m3Ago ? fmt(etf.prices.m3Ago) : '—'}
                        </td>
                        <td style={{ ...S.td, color: etf.m3Return !== null ? pnlColor(etf.m3Return) : '#888', fontWeight: 600 }}>
                          {etf.m3Return !== null ? fmtPct(etf.m3Return) : '—'}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: pnlColor(etf.composite) }}>
                          {etf.composite.toFixed(2)}
                        </td>
                        <td style={{
                          ...S.td,
                          fontWeight: 600,
                          color: etf.rsi != null && etf.rsi < 30 ? '#006100' : etf.rsi != null && etf.rsi >= 70 ? '#9c0006' : '#333',
                        }}>
                          {etf.rsi != null ? etf.rsi.toFixed(1) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── 매매규칙 ── */}
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0 }}>
              <tbody>
                <tr>
                  <td style={{ ...S.tdL, color: '#666', fontSize: 10, padding: '6px 8px' }}>
                    매매규칙: 200만원 매수 | 익절 +7% | 손절 -5% | 월말 미도달 시 종가 매도
                  </td>
                </tr>
                <tr>
                  <td style={{ ...S.tdL, color: '#888', fontSize: 10, padding: '2px 8px 6px' }}>
                    복합점수 = (1M수익률 × 0.6) + (3M수익률 × 0.4) | 진입: RSI(3) &lt; 30
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      <StrategyRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} title="📋 섹터로테이션 전략 규칙">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <tbody>
            <tr><td colSpan={2} style={RS.header}>기본 정보</td></tr>
            <tr><td style={RS.label}>주기</td><td style={RS.val}>월 1회 (월말 스크리닝 → 첫 거래일 매수)</td></tr>
            <tr><td style={RS.label}>종목풀</td><td style={RS.val}>7개 고정 섹터 ETF: KODEX 반도체, KODEX 자동차, KODEX 은행, KODEX 철강, KODEX 건설, TIGER 2차전지테마, KODEX 바이오</td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>선정 기준</td></tr>
            <tr><td style={RS.label}>복합점수</td><td style={RS.val}>(1M수익률 x 0.6) + (3M수익률 x 0.4)</td></tr>
            <tr><td style={RS.label}>3M 미달</td><td style={RS.val}>1M수익률만 사용 (처음 2개월)</td></tr>
            <tr><td style={RS.label}>매수 종목</td><td style={RS.val}>복합점수 1위</td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>진입 필터 (RSI)</td></tr>
            <tr><td style={RS.label}>RSI(3) &lt; 30</td><td style={RS.val}>진입 가능 (다음 날 08:50 매수)</td></tr>
            <tr><td style={RS.label}>RSI(3) ≥ 30</td><td style={RS.val}>대기 (매일 장 마감 후 재확인)</td></tr>
            <tr><td style={RS.label}>월말까지 미달</td><td style={RS.val}>해당 월 패스 (현금 유지)</td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>매매 규칙</td></tr>
            <tr><td style={RS.label}>매수금액</td><td style={RS.val}>200만원</td></tr>
            <tr><td style={RS.label}>익절</td><td style={RS.val}>+7%</td></tr>
            <tr><td style={RS.label}>손절</td><td style={RS.val}>매수가 대비 -5% (매수 당일 즉시 지정가 등록)</td></tr>
            <tr><td style={RS.label}>월말 미도달</td><td style={RS.val}>종가 매도</td></tr>
          </tbody>
        </table>
      </StrategyRulesModal>
    </ExcelFrame>
  );
}

const RS = {
  header: {
    backgroundColor: '#d9e2f3', color: '#1f3864', fontWeight: 700 as const,
    padding: '4px 6px', fontSize: 11, border: '1px solid #b4c6e7',
  },
  label: {
    padding: '3px 6px', fontWeight: 600 as const, whiteSpace: 'nowrap' as const,
    color: '#333', width: 100, border: '1px solid #e0e0e0', fontSize: 11,
  },
  val: {
    padding: '3px 6px', color: '#555', border: '1px solid #e0e0e0', fontSize: 11,
  },
};