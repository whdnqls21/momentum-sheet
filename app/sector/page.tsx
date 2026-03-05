'use client';

import { useState, useEffect, useCallback } from 'react';
import ExcelFrame from '@/components/ExcelFrame';

interface SectorETFResult {
  code: string;
  name: string;
  price: number;
  m1Return: number;
  m3Return: number | null;
  composite: number;
  rank: number;
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

const fmt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

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

  // 스크리닝 실행
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

      // 2) 이력 드롭다운을 서버에서 다시 fetch
      const histRes = await fetch('/api/sector/history', { cache: 'no-store' });
      if (histRes.ok) {
        const histData = await histRes.json();
        if (Array.isArray(histData) && histData.length > 0) {
          setHistory(histData);
          // 3) 방금 실행한 날짜를 드롭다운에서 자동 선택 (최신 항목)
          setSelectedDate(histData[0].screen_date);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const etfs = result?.etfs || [];
  const sorted = [...etfs].sort((a, b) => b.composite - a.composite);

  const statusItems = result
    ? { count: String(etfs.length), sum: result.selected?.name || '' }
    : undefined;

  return (
    <ExcelFrame statusItems={statusItems}>
      <div style={{ padding: 0 }}>
        {/* ── 컨트롤 영역 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={S.section} colSpan={2}>
                섹터로테이션 스크리닝
              </td>
            </tr>
            <tr>
              <td style={S.rowNum}>1</td>
              <td style={{ ...S.tdL, padding: '6px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <button
                    className="btn-ribbon"
                    onClick={handleRun}
                    disabled={loading}
                    style={loading ? { backgroundColor: '#e2efda' } : {}}
                  >
                    {loading ? '⏳ 스크리닝 중...' : '▶ 스크리닝 실행'}
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
            {/* ── 매수 종목 ── */}
            {result.selected && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ ...S.section, backgroundColor: '#FFFDE7', color: '#bf8f00' }} colSpan={2}>
                      이번 달 매수 종목: {result.selected.name} (복합점수: {result.selected.composite})
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* ── 결과 테이블 ── */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.section, textAlign: 'left' }} colSpan={9}>
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
                        <td style={{ ...S.tdL, fontWeight: isTop ? 700 : 400 }}>{etf.name}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── 매매규칙 ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0 }}>
              <tbody>
                <tr>
                  <td style={{ ...S.tdL, color: '#666', fontSize: 10, padding: '6px 8px' }}>
                    매매규칙: 200만원 매수 | 익절 +7% | 손절 -5% | 월말 미도달 시 종가 매도
                  </td>
                </tr>
                <tr>
                  <td style={{ ...S.tdL, color: '#888', fontSize: 10, padding: '2px 8px 6px' }}>
                    복합점수 = (1M수익률 × 0.6) + (3M수익률 × 0.4)
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    </ExcelFrame>
  );
}