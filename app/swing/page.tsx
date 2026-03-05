'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ExcelFrame from '@/components/ExcelFrame';
import type { SwingStock, SwingScores } from '@/lib/types';

interface HistoryOption {
  screen_date: string;
  week_label: string;
  selected_ticker: string | null;
  selected_name: string | null;
  created_at?: string;
}

interface SwingResult {
  stocks: SwingStock[];
  selected: { code: string; name: string; score: number } | null;
  week: { year: number; week: number; label: string };
  screenDate?: string;
  processedAt?: string;
}

const fmt = (n: number) => n.toLocaleString();

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
function fmtOption(h: HistoryOption): string {
  const d = new Date(h.screen_date + 'T00:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${DAY_NAMES[d.getDay()]})`;
}

function groupByWeek(items: HistoryOption[]): { label: string; items: HistoryOption[] }[] {
  const groups: { label: string; items: HistoryOption[] }[] = [];
  const map = new Map<string, HistoryOption[]>();
  for (const h of items) {
    const key = h.week_label || '기타';
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

const SCORE_LABELS: { key: keyof SwingScores; label: string; max: number }[] = [
  { key: 'vol', label: '거래량', max: 15 },
  { key: 'high', label: '52주고가', max: 15 },
  { key: 'ma5', label: '5일선', max: 10 },
  { key: 'align', label: '정배열', max: 10 },
  { key: 'slope', label: '기울기', max: 10 },
  { key: 'foreign', label: '외국인', max: 15 },
  { key: 'candle', label: '양봉', max: 10 },
  { key: 'gap', label: '이격도', max: 15 },
];

function scoreColor(val: number, max: number): string {
  if (val === max) return '#006100';
  if (val === 0) return '#9c0006';
  return '#333';
}

function rawLabel(key: keyof SwingScores, raw: SwingStock['raw']): string {
  switch (key) {
    case 'vol': return raw.volRatio.toFixed(2);
    case 'high': return raw.highRatio.toFixed(1) + '%';
    case 'ma5': return raw.ma5Gap.toFixed(1) + '%';
    case 'align': return raw.isAligned ? 'Y' : 'N';
    case 'slope': return raw.slope.toFixed(1) + '%';
    case 'foreign': return raw.foreignDays + '일';
    case 'candle': return raw.bullDays + '일';
    case 'gap': return raw.gapRatio.toFixed(1) + '%';
  }
}

export default function SwingPage() {
  const [result, setResult] = useState<SwingResult | null>(null);
  const [history, setHistory] = useState<HistoryOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DB에서 특정 날짜 결과 로드
  const loadDateData = useCallback(async (screenDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/swing/history?screen_date=${screenDate}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('데이터 없음');
      const data = await r.json();
      const stocks: SwingStock[] = data.result || [];
      const topStock = stocks
        .filter((s: SwingStock) => s.pass && s.score >= 60)
        .sort((a: SwingStock, b: SwingStock) => b.score - a.score)[0];
      setResult({
        stocks,
        selected: data.selected_ticker
          ? { code: data.selected_ticker, name: data.selected_name || '', score: topStock?.score || 0 }
          : null,
        week: { year: data.year, week: data.week_num, label: data.week_label || '' },
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
    fetch('/api/swing/history', { cache: 'no-store' })
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
      const res = await fetch('/api/swing', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: SwingResult = await res.json();

      // 1) API 응답을 바로 테이블에 렌더링
      setResult({ ...data, screenDate: new Date().toISOString() });

      // 2) 이력 드롭다운을 서버에서 다시 fetch
      const histRes = await fetch('/api/swing/history', { cache: 'no-store' });
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

  const stocks = result?.stocks || [];
  const sorted = [...stocks].sort((a, b) => {
    const aQ = a.pass && a.score >= 60 ? 1 : 0;
    const bQ = b.pass && b.score >= 60 ? 1 : 0;
    if (aQ !== bQ) return bQ - aQ;
    return b.score - a.score;
  });
  const passCount = stocks.filter((s) => s.pass && s.score >= 60).length;

  const statusItems = result
    ? { count: String(stocks.length), sum: `PASS ${passCount}종목` }
    : undefined;

  return (
    <ExcelFrame statusItems={statusItems}>
      <div style={{ padding: 0 }}>
        {/* ── 컨트롤 영역 ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={S.section} colSpan={2}>
                단기스윙 스크리닝
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
                    {groupByWeek(history).map((g) => (
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
                      매수: {result.selected ? `${result.selected.name} (${result.selected.score}점)` : '없음'}
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
            ⏳ 20종목 데이터 수집 및 스코어링 중... (약 30~60초 소요)
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
                      이번 주 매수 종목: {result.selected.name} ({result.selected.code}) — {result.selected.score}점
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            {!result.selected && stocks.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ ...S.section, backgroundColor: '#ffc7ce', color: '#9c0006' }} colSpan={2}>
                      매수 후보 없음 (PASS + 60점 이상 종목 없음)
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* ── 스크리닝 결과 테이블 ── */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.section, textAlign: 'left' }} colSpan={23}>
                      통합 순위 (1차 {stocks.filter(s => s.pool === '1차').length}종목 + 2차 {stocks.filter(s => s.pool === '2차').length}종목)
                    </th>
                  </tr>
                  <tr>
                    <th style={S.th} rowSpan={2}>#</th>
                    <th style={S.th} rowSpan={2}>풀</th>
                    <th style={S.th} rowSpan={2}>종목코드</th>
                    <th style={{ ...S.th, textAlign: 'left' }} rowSpan={2}>종목명</th>
                    <th style={S.th} rowSpan={2}>현재가</th>
                    <th style={S.th} rowSpan={2}>총점</th>
                    <th style={S.th} rowSpan={2}>필터</th>
                    {SCORE_LABELS.map((sl) => (
                      <th key={sl.key} style={{ ...S.th, backgroundColor: '#dce6f1' }} colSpan={2}>
                        {sl.label}({sl.max})
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {SCORE_LABELS.map((sl) => (
                      <React.Fragment key={sl.key}>
                        <th style={{ ...S.th, backgroundColor: '#E3F2FD', fontSize: 9 }}>수치</th>
                        <th style={{ ...S.th, fontSize: 9 }}>점수</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => {
                    const isTop = s.code === result.selected?.code;
                    const rowBg = isTop ? '#FFFDE7' : s.pool === '2차' ? '#f2f7ed' : '#fff';

                    return (
                      <tr key={s.code} style={{ backgroundColor: rowBg }}>
                        <td style={S.rowNum}>{i + 1}</td>
                        <td style={{ ...S.tdC, fontSize: 9, color: s.pool === '1차' ? '#1f3864' : '#666' }}>{s.pool}</td>
                        <td style={{ ...S.tdC, fontFamily: 'monospace', fontSize: 10 }}>{s.code}</td>
                        <td style={{ ...S.tdL, fontWeight: isTop ? 700 : 400 }}>
                          {s.name}
                          {s.error && <span style={{ color: '#9c0006', fontSize: 9 }}> ({s.error})</span>}
                        </td>
                        <td style={S.td}>{s.price > 0 ? fmt(s.price) : '—'}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: s.score >= 60 ? '#006100' : s.score >= 40 ? '#bf8f00' : '#9c0006' }}>
                          {s.score}
                        </td>
                        <td style={{
                          ...S.tdC,
                          fontSize: 10,
                          fontWeight: 600,
                          backgroundColor: s.pass ? '#c6efce' : '#ffc7ce',
                          color: s.pass ? '#006100' : '#9c0006',
                        }}>
                          {s.pass ? 'PASS' : 'FAIL'}
                        </td>
                        {SCORE_LABELS.map((sl) => (
                          <React.Fragment key={sl.key}>
                            <td style={{ ...S.tdC, fontSize: 10, backgroundColor: '#E3F2FD' }}>
                              {rawLabel(sl.key, s.raw)}
                            </td>
                            <td style={{ ...S.tdC, fontSize: 10, color: scoreColor(s.scores[sl.key], sl.max), fontWeight: s.scores[sl.key] === sl.max ? 700 : 400 }}>
                              {s.scores[sl.key]}
                            </td>
                          </React.Fragment>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </ExcelFrame>
  );
}

