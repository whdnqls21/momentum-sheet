'use client';

import { useState, useEffect, useCallback } from 'react';
import ExcelFrame from '@/components/ExcelFrame';
import StrategyRulesModal from '@/components/StrategyRulesModal';
import { canScreenBollinger } from '@/lib/tradingHours';
import { TRADING_RULES } from '@/lib/constants';
import { fmt, fmtOption } from '@/lib/utils';
import type { BBSignal } from '@/lib/bollinger';

interface BBETFResult {
  code: string;
  name: string;
  price: number;
  percentB: number | null;
  volumeRatio: number | null;
  signal: BBSignal;
  bb: { upper: number; middle: number; lower: number } | null;
}

interface BBScreenResult {
  etfs: BBETFResult[];
  buyCandidate: { code: string; name: string; percentB: number | null; volumeRatio: number | null; prevClose?: number; limitPrice?: number; stopLoss?: number } | null;
  screenDate?: string;
  processedAt?: string;
}

interface HoldingBase {
  code: string;
  name: string;
  buyDate: string;
  buyPrice: number;
  buyQty: number;
  buyAmount: number;
  stopLossPrice: number;
}

interface HoldingPrice extends HoldingBase {
  currentPrice: number;
  profitRate: number;
  profitLoss: number;
  stopLossNear: boolean;
  ma20: number | null;
  aboveMa20: boolean;
  updatedAt: string;
}

interface HoldingFull extends HoldingBase {
  currentPrice: number;
  profitRate: number;
  profitLoss: number;
  percentB: number | null;
  exitSignal: 'EXIT' | 'HOLD' | 'NO_DATA';
  bb: { upper: number; middle: number; lower: number } | null;
  updatedAt: string;
}

interface HistoryOption {
  screen_date: string;
  selected_ticker: string | null;
  selected_name: string | null;
  created_at?: string;
}

function getTodayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function groupByMonth(items: HistoryOption[]): { label: string; items: HistoryOption[] }[] {
  const groups: { label: string; items: HistoryOption[] }[] = [];
  const map = new Map<string, HistoryOption[]>();
  for (const h of items) {
    const d = new Date(h.screen_date + 'T00:00:00');
    const key = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
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

function signalColor(signal: BBSignal): { bg: string; color: string } {
  switch (signal) {
    case 'BUY': return { bg: '#ffc7ce', color: '#9c0006' };
    case 'WATCH': return { bg: '#FFF3E0', color: '#e65100' };
    default: return { bg: 'transparent', color: '#888' };
  }
}

function signalLabel(signal: BBSignal): string {
  switch (signal) {
    case 'BUY': return 'BUY';
    case 'WATCH': return 'WATCH';
    case 'NO_SIGNAL': return '-';
    case 'NO_DATA': return '-';
  }
}

export default function BollingerPage() {
  const [result, setResult] = useState<BBScreenResult | null>(null);
  const [history, setHistory] = useState<HistoryOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [timeStatus, setTimeStatus] = useState(canScreenBollinger());
  const [holding, setHolding] = useState<HoldingBase | HoldingPrice | HoldingFull | null>(null);
  const [holdingCheckLoading, setHoldingCheckLoading] = useState(false);
  const [todayKST, setTodayKST] = useState(() => getTodayKST());

  // 파생: 오늘 스크리닝 완료 여부
  const screenedToday = history.some(h => h.screen_date === todayKST);
  const todayEntry = history.find(h => h.screen_date === todayKST);

  // 1분마다 시간 체크 + 날짜 변경 감지
  useEffect(() => {
    const check = () => {
      setTimeStatus(canScreenBollinger());
      setTodayKST(getTodayKST());
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  // DB에서 특정 날짜 결과 로드
  const loadDateData = useCallback(async (screenDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/bollinger/history?screen_date=${screenDate}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('데이터 없음');
      const data = await r.json();
      const etfs: BBETFResult[] = data.result || [];
      const buyCandidate = etfs.find(e => e.signal === 'BUY') || null;
      setResult({
        etfs,
        buyCandidate: buyCandidate ? {
          code: buyCandidate.code,
          name: buyCandidate.name,
          percentB: buyCandidate.percentB,
          volumeRatio: buyCandidate.volumeRatio,
        } : null,
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
    fetch('/api/bollinger/history', { cache: 'no-store' })
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

  // 보유 종목 확인 (초기 로드)
  useEffect(() => {
    fetch('/api/bollinger/exit', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.holding) setHolding(data.holding);
      })
      .catch(() => {});
  }, []);

  // 보유종목 확인 (통합: 08:00 이전→price, 08:00 이후→exit)
  const handleHoldingCheck = useCallback(async () => {
    if (!holding) return;
    setHoldingCheckLoading(true);
    setError(null);
    try {
      const kstStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false });
      const [h, m] = kstStr.split(':').map(Number);
      const totalMin = h * 60 + m;
      const isAfter0800 = totalMin >= 480;

      if (isAfter0800) {
        const res = await fetch('/api/bollinger/exit?refresh=true', { cache: 'no-store' });
        if (!res.ok) throw new Error('매도 신호 확인 실패');
        const data = await res.json();
        if (data.holding) setHolding(data.holding);
      } else {
        const res = await fetch('/api/bollinger/price', { cache: 'no-store' });
        if (!res.ok) throw new Error('현재가 조회 실패');
        const data = await res.json();
        if (data.holding) setHolding(data.holding);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setHoldingCheckLoading(false);
    }
  }, [holding]);

  // 스크리닝 실행
  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/bollinger', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: BBScreenResult = await res.json();
      setResult({ ...data, screenDate: new Date().toISOString() });

      // 이력 드롭다운 갱신
      const histRes = await fetch('/api/bollinger/history', { cache: 'no-store' });
      if (histRes.ok) {
        const histData = await histRes.json();
        if (Array.isArray(histData) && histData.length > 0) {
          setHistory(histData);
          setSelectedDate(histData[0].screen_date);
        }
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const etfs = result?.etfs || [];
  const watchList = etfs.filter(e => e.signal === 'WATCH');

  const statusItems = result
    ? { count: String(etfs.length), sum: result.buyCandidate?.name || '신호 없음' }
    : undefined;

  // 스크리닝 버튼 disabled 사유
  const screenDisabled = loading || !timeStatus.allowed || screenedToday || !!holding;
  const screenTitle = screenedToday
    ? '오늘 스크리닝 완료'
    : holding
      ? '보유 종목 매도 후 스크리닝 가능'
      : timeStatus.reason;

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
                  <span>볼린저밴드 %B 스크리닝</span>
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
                    disabled={screenDisabled}
                    title={screenTitle}
                    style={loading ? { backgroundColor: '#e2efda' } : screenDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    {loading ? '⏳ 스크리닝 중...' : '▶ 스크리닝 실행'}
                  </button>
                  <button
                    className="btn-ribbon"
                    onClick={handleHoldingCheck}
                    disabled={holdingCheckLoading || !holding}
                    title={!holding ? '보유 종목 없음' : undefined}
                    style={holdingCheckLoading ? { backgroundColor: '#e2efda' } : !holding ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    {holdingCheckLoading ? '⏳ 확인 중...' : '📉 보유종목 확인'}
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

        {!timeStatus.allowed && !screenedToday && !holding && (
          <div style={{ padding: '4px 12px', color: '#9c0006', fontSize: 10 }}>
            ⚠ {timeStatus.reason}
          </div>
        )}

        {/* ── 스크리닝 상태 메시지 ── */}
        {!loading && screenedToday && (
          <div style={{ padding: '4px 12px', color: '#006100', fontSize: 10, fontWeight: 600 }}>
            {todayEntry?.selected_name
              ? `✅ 오늘 스크리닝 완료 — 매수: ${todayEntry.selected_name}`
              : '✅ 오늘 스크리닝 완료 — 매수 대상 없음'}
          </div>
        )}
        {!loading && !screenedToday && !!holding && (
          <div style={{ padding: '4px 12px', color: '#9c0006', fontSize: 10, fontWeight: 600 }}>
            ⚠ 보유 종목 있음 — 매도 후 스크리닝 가능
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', color: '#9c0006', fontWeight: 700, fontSize: 11 }}>
            #ERROR — {error}
          </div>
        )}

        {loading && !result && (
          <div style={{ padding: '20px 12px', color: '#888', fontSize: 11 }}>
            ⏳ 8개 ETF 데이터 수집 중... (약 5~10초 소요)
          </div>
        )}

        {/* ── 보유 종목 카드 ── */}
        {holding && (() => {
          const isFull = 'exitSignal' in holding;
          const isPrice = !isFull && 'currentPrice' in holding;
          const full = isFull ? holding as HoldingFull : null;
          const price = isPrice ? holding as HoldingPrice : null;
          const isExit = full?.exitSignal === 'EXIT';
          const isStopNear = price?.stopLossNear === true;
          const fullStopNear = full ? full.currentPrice <= holding.buyPrice * (1 + TRADING_RULES.bollinger.slAlert / 100) : false;
          const isAboveMa20 = price?.aboveMa20 === true;
          const cardBg = isExit ? '#FFFDE7' : (fullStopNear || isStopNear) ? '#FFEBEE' : isAboveMa20 ? '#FFFDE7' : '#E3F2FD';
          const headerBg = isExit ? '#FFFDE7' : (fullStopNear || isStopNear) ? '#ffcdd2' : isAboveMa20 ? '#fff9c4' : '#bbdefb';
          const headerIcon = (fullStopNear || isStopNear) ? '⚠️' : (isExit || isAboveMa20) ? '🔔' : '📈';

          return (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ ...S.section, backgroundColor: headerBg, color: '#1f3864' }} colSpan={2}>
                    {headerIcon} 보유 중: {holding.name} ({holding.code})
                  </td>
                </tr>
                <tr>
                  <td style={S.rowNum} />
                  <td style={{ ...S.tdL, padding: '10px 12px', backgroundColor: cardBg }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {full ? (
                        <>
                          <div style={{ fontSize: 11, color: '#333' }}>
                            매수가: {fmt(holding.buyPrice)}원 | 종가: {fmt(full.currentPrice)}원
                            <span style={{
                              marginLeft: 6,
                              fontWeight: 700,
                              color: full.profitRate >= 0 ? '#006100' : '#9c0006',
                            }}>
                              ({full.profitRate >= 0 ? '+' : ''}{full.profitRate.toFixed(1)}%)
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: full.profitLoss >= 0 ? '#006100' : '#9c0006', fontWeight: 600 }}>
                            평가손익: {full.profitLoss >= 0 ? '+' : ''}{fmt(full.profitLoss)}원
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                            %B: {full.percentB !== null ? full.percentB.toFixed(3) : '—'}
                          </div>
                          {full.bb && (
                            <div style={{ fontSize: 10, color: '#888' }}>
                              밴드: 하단 {fmt(full.bb.lower)} | MA20 {fmt(full.bb.middle)} | 상단 {fmt(full.bb.upper)}
                            </div>
                          )}
                          {/* MA20 비교 */}
                          {full.bb && (() => {
                            const ma20 = full.bb.middle;
                            const diff = full.currentPrice - ma20;
                            const diffPct = (diff / ma20 * 100);
                            const diffSign = diff >= 0 ? '+' : '';
                            const diffColor = diff >= 0 ? '#006100' : '#9c0006';
                            return (
                              <div style={{ fontSize: 11, color: diffColor, fontWeight: 600 }}>
                                종가 {fmt(full.currentPrice)}원 {diff >= 0 ? '>' : '<'} MA20 {fmt(ma20)}원 ({diffSign}{fmt(diff)}원, {diffSign}{diffPct.toFixed(2)}%)
                              </div>
                            );
                          })()}
                          {isExit ? (
                            <div style={{
                              display: 'inline-block', padding: '4px 10px', borderRadius: 4,
                              backgroundColor: '#ffc7ce', color: '#9c0006', fontWeight: 700, fontSize: 11,
                              width: 'fit-content',
                            }}>
                              🔔 익절 신호 (%B ≥ 0.5) — 08:50 시장가 매도
                            </div>
                          ) : (
                            <div style={{
                              display: 'inline-block', padding: '4px 10px', borderRadius: 4,
                              backgroundColor: '#e3f2fd', color: '#1565c0', fontWeight: 600, fontSize: 11,
                              width: 'fit-content',
                            }}>
                              ⏳ 보유 유지 — %B ≥ 0.5 시 매도
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: '#666' }}>
                            손절가: {fmt(holding.stopLossPrice)}원 (-5%)
                          </div>
                          {fullStopNear && (
                            <div style={{
                              padding: '4px 10px', borderRadius: 4,
                              backgroundColor: '#ffc7ce', color: '#9c0006', fontWeight: 700, fontSize: 11,
                            }}>
                              🚨 손절가 근접! 종가와 손절가 차이: {fmt(full.currentPrice - holding.stopLossPrice)}원 ({((full.currentPrice - holding.stopLossPrice) / holding.stopLossPrice * 100).toFixed(1)}%)
                              <br />
                              <span style={{ fontWeight: 400, fontSize: 10 }}>
                                손절 지정가 주문이 등록되어 있는지 확인하세요.
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: 9, color: '#999' }}>
                            확인시각: {full.updatedAt}
                          </div>
                        </>
                      ) : price ? (
                        <>
                          <div style={{ fontSize: 11, color: '#333' }}>
                            매수가: {fmt(holding.buyPrice)}원 | 현재가: {fmt(price.currentPrice)}원
                            <span style={{
                              marginLeft: 6,
                              fontWeight: 700,
                              color: price.profitRate >= 0 ? '#006100' : '#9c0006',
                            }}>
                              ({price.profitRate >= 0 ? '+' : ''}{price.profitRate.toFixed(1)}%)
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: price.profitLoss >= 0 ? '#006100' : '#9c0006', fontWeight: 600 }}>
                            평가손익: {price.profitLoss >= 0 ? '+' : ''}{fmt(price.profitLoss)}원
                          </div>
                          {/* MA20 상세 */}
                          {price.ma20 !== null && (() => {
                            const diff = price.currentPrice - price.ma20;
                            const diffPct = (diff / price.ma20 * 100);
                            const diffSign = diff >= 0 ? '+' : '';
                            const diffColor = diff >= 0 ? '#006100' : '#9c0006';
                            return (
                              <>
                                <div style={{ fontSize: 11, color: '#333' }}>
                                  MA20: {fmt(price.ma20)}원
                                </div>
                                <div style={{ fontSize: 11, color: diffColor, fontWeight: 600 }}>
                                  현재가 {fmt(price.currentPrice)}원 {diff >= 0 ? '>' : '<'} MA20 {fmt(price.ma20)}원 ({diffSign}{fmt(diff)}원, {diffSign}{diffPct.toFixed(2)}%)
                                </div>
                              </>
                            );
                          })()}
                          {isAboveMa20 ? (
                            <div style={{
                              padding: '4px 10px', borderRadius: 4,
                              backgroundColor: '#ffc7ce', color: '#9c0006', fontWeight: 700, fontSize: 11,
                              marginTop: 2,
                            }}>
                              ✅ MA20 돌파 — 즉시 매도 가능
                              <br />
                              <span style={{ fontWeight: 400, fontSize: 10 }}>
                                한투앱에서 시장가 매도 (또는 08:00 이후 %B 확인 후 매도)
                              </span>
                            </div>
                          ) : (
                            <div style={{
                              display: 'inline-block', padding: '4px 10px', borderRadius: 4,
                              backgroundColor: '#e3f2fd', color: '#1565c0', fontWeight: 600, fontSize: 11,
                              width: 'fit-content', marginTop: 2,
                            }}>
                              ⏳ MA20 미돌파 — 보유 유지
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                            손절가: {fmt(holding.stopLossPrice)}원 (-5%)
                          </div>
                          {isStopNear && (
                            <div style={{
                              padding: '4px 10px', borderRadius: 4,
                              backgroundColor: '#ffc7ce', color: '#9c0006', fontWeight: 700, fontSize: 11,
                              marginTop: 2,
                            }}>
                              🚨 손절가 근접! 현재가와 손절가 차이: {fmt(price.currentPrice - holding.stopLossPrice)}원 ({((price.currentPrice - holding.stopLossPrice) / holding.stopLossPrice * 100).toFixed(1)}%)
                              <br />
                              <span style={{ fontWeight: 400, fontSize: 10 }}>
                                손절 지정가 주문이 등록되어 있는지 확인하세요.
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>
                            확인시각: {price.updatedAt}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, color: '#333' }}>
                            매수일: {holding.buyDate}
                          </div>
                          <div style={{ fontSize: 11, color: '#333' }}>
                            매수가: {fmt(holding.buyPrice)}원 | 수량: {holding.buyQty}주 | 매수금액: {fmt(holding.buyAmount)}원
                          </div>
                          <div style={{ fontSize: 10, color: '#666' }}>
                            손절가: {fmt(holding.stopLossPrice)}원 (-5%)
                          </div>
                          <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                            [📉 보유종목 확인] 버튼을 눌러주세요.
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          );
        })()}

        {result && (
          <>
            {/* ── 매수 신호 카드 ── */}
            {result.buyCandidate ? (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ ...S.section, backgroundColor: '#FFFDE7', color: '#bf8f00' }} colSpan={2}>
                      📌 오늘 매수 대상
                    </td>
                  </tr>
                  <tr>
                    <td style={S.rowNum} />
                    <td style={{ ...S.tdL, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>
                          {result.buyCandidate.name} ({result.buyCandidate.code})
                        </div>
                        <div style={{ fontSize: 11, color: '#555' }}>
                          %B: {result.buyCandidate.percentB?.toFixed(3) ?? '—'}
                          <span style={{ marginLeft: 12 }}>
                            거래량: {result.buyCandidate.volumeRatio?.toFixed(2) ?? '—'}배
                          </span>
                        </div>
                        <div style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: 4,
                          backgroundColor: '#c6efce', color: '#006100', fontWeight: 700, fontSize: 11,
                          width: 'fit-content',
                        }}>
                          ✅ 매수 조건 충족 — 08:50 지정가 매수
                        </div>
                        {result.buyCandidate.prevClose ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                            <div style={{ fontSize: 11, color: '#333' }}>전일 종가: {fmt(result.buyCandidate.prevClose)}원</div>
                            <div style={{ fontSize: 11, color: '#1565C0', fontWeight: 700 }}>지정가: {fmt(result.buyCandidate.limitPrice!)}원 (종가 +1%)</div>
                            <div style={{ fontSize: 11, color: '#C62828', fontWeight: 700 }}>손절가: {fmt(result.buyCandidate.stopLoss!)}원 (지정가 -5%)</div>
                            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                              → 08:50에 지정가 {fmt(result.buyCandidate.limitPrice!)}원으로 주문
                              <br />→ 시초가 {fmt(result.buyCandidate.limitPrice!)}원 초과 시 미체결 (패스)
                            </div>
                          </div>
                        ) : null}
                        <div style={{ fontSize: 9, color: '#999' }}>
                          익절: %B ≥ 0.5 확인 후 08:50 매도
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ ...S.section, backgroundColor: '#f5f5f5', color: '#888' }} colSpan={2}>
                      📊 매수 대상 없음
                    </td>
                  </tr>
                  <tr>
                    <td style={S.rowNum} />
                    <td style={{ ...S.tdL, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, color: '#666' }}>
                        조건: %B &lt; 0.10 AND 거래량 ≥ 1.5배
                        <br />
                        <span style={{ fontSize: 10, color: '#999' }}>오늘 18:00 이후 다시 확인하세요.</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            )}

            {/* ── WATCH 종목 ── */}
            {watchList.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {watchList.map(w => (
                    <tr key={w.code}>
                      <td style={{ ...S.tdL, padding: '3px 12px', fontSize: 10, color: '#e65100', backgroundColor: '#FFF3E0' }}>
                        ⚠ {w.name} — %B: {w.percentB?.toFixed(3) ?? '—'}, 거래량: {w.volumeRatio?.toFixed(2) ?? '—'}배 (거래량 부족, 관찰 중)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}

            {/* ── 스크리닝 테이블 ── */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.section, textAlign: 'left' }} colSpan={10}>
                      볼린저밴드 스크리닝 (8개 ETF)
                    </th>
                  </tr>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>종목코드</th>
                    <th style={{ ...S.th, textAlign: 'left' }}>ETF명</th>
                    <th style={S.th}>현재가</th>
                    <th style={S.th}>상단</th>
                    <th style={S.th}>중심선</th>
                    <th style={S.th}>하단</th>
                    <th style={S.th}>%B</th>
                    <th style={S.th}>거래량비</th>
                    <th style={S.th}>신호</th>
                  </tr>
                </thead>
                <tbody>
                  {etfs.map((etf, i) => {
                    const sc = signalColor(etf.signal);
                    const isBuy = etf.signal === 'BUY';
                    const isWatch = etf.signal === 'WATCH';
                    const rowBg = isBuy ? '#FFFDE7' : isWatch ? '#FFF3E0' : i % 2 === 1 ? '#fafafa' : '#fff';

                    return (
                      <tr key={etf.code} style={{ backgroundColor: rowBg }}>
                        <td style={{ ...S.tdC, fontWeight: isBuy ? 700 : 400 }}>{i + 1}</td>
                        <td style={{ ...S.tdC, fontFamily: 'monospace', fontSize: 10 }}>{etf.code}</td>
                        <td style={{ ...S.tdL, fontWeight: isBuy ? 700 : 400 }}>
                          {etf.name}
                          {isBuy && <span style={{ fontSize: 9, color: '#9c0006', marginLeft: 4 }}>🔔</span>}
                        </td>
                        <td style={S.td}>{etf.price > 0 ? fmt(etf.price) : '—'}</td>
                        <td style={S.td}>{etf.bb ? fmt(etf.bb.upper) : '—'}</td>
                        <td style={S.td}>{etf.bb ? fmt(etf.bb.middle) : '—'}</td>
                        <td style={S.td}>{etf.bb ? fmt(etf.bb.lower) : '—'}</td>
                        <td style={{
                          ...S.td,
                          fontWeight: 600,
                          color: etf.percentB !== null && etf.percentB < 0.10 ? '#9c0006'
                            : etf.percentB !== null && etf.percentB > 0.90 ? '#1f3864'
                            : '#333',
                        }}>
                          {etf.percentB !== null ? etf.percentB.toFixed(3) : '—'}
                        </td>
                        <td style={{
                          ...S.td,
                          fontWeight: etf.volumeRatio !== null && etf.volumeRatio >= 1.5 ? 700 : 400,
                          color: etf.volumeRatio !== null && etf.volumeRatio >= 1.5 ? '#006100' : '#333',
                        }}>
                          {etf.volumeRatio !== null ? `${etf.volumeRatio.toFixed(2)}배` : '—'}
                        </td>
                        <td style={{
                          ...S.tdC,
                          fontSize: 10,
                          fontWeight: 700,
                          backgroundColor: sc.bg,
                          color: sc.color,
                        }}>
                          {signalLabel(etf.signal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── 하단 정보 ── */}
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0 }}>
              <tbody>
                <tr>
                  <td style={{ ...S.tdL, color: '#666', fontSize: 10, padding: '6px 8px' }}>
                    매매규칙: 150만원 매수 | 익절 %B ≥ 0.5 | 손절 -5% | 복리 운용
                  </td>
                </tr>
                <tr>
                  <td style={{ ...S.tdL, color: '#888', fontSize: 10, padding: '2px 8px' }}>
                    조건: %B &lt; 0.10 AND 거래량 ≥ 20일 평균의 1.5배
                  </td>
                </tr>
                <tr>
                  <td style={{ ...S.tdL, color: '#888', fontSize: 10, padding: '2px 8px 6px' }}>
                    서킷브레이커: 2연속 손절 → 2주 중단 | 총자금 30% 손실 → 전면 중단
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      <StrategyRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} title="📋 볼린저밴드 %B 전략 규칙">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <tbody>
            <tr><td colSpan={2} style={RS.header}>기본 정보</td></tr>
            <tr><td style={RS.label}>전략명</td><td style={RS.val}>볼린저밴드 %B 섹터 ETF 평균회귀</td></tr>
            <tr><td style={RS.label}>핵심 원리</td><td style={RS.val}>섹터 ETF 과매도(%B &lt; 0.10) 진입, 중심선 복귀 시 매도</td></tr>
            <tr><td style={RS.label}>매매 주기</td><td style={RS.val}>신호 발생 시 즉시 (평균 보유 1~2주)</td></tr>
            <tr><td style={RS.label}>매매 자금</td><td style={RS.val}>150만원 (복리 운용)</td></tr>
            <tr><td style={RS.label}>종목풀</td><td style={RS.val}>8개 섹터 ETF</td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>종목풀</td></tr>
            <tr><td colSpan={2} style={RS.val}>KODEX 반도체, KODEX 자동차, KODEX 은행, KODEX 철강, KODEX 건설, TIGER 2차전지테마, KODEX 바이오, KODEX 코스닥150</td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>지표</td></tr>
            <tr><td style={RS.label}>볼린저밴드</td><td style={RS.val}>20일 이동평균, 표준편차 2배</td></tr>
            <tr><td style={RS.label}>%B</td><td style={RS.val}>(현재가 - 하단) / (상단 - 하단)</td></tr>
            <tr><td style={RS.label}>거래량 비율</td><td style={RS.val}>당일 거래량 / 20일 평균 거래량</td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>매수 조건 (AND)</td></tr>
            <tr><td colSpan={2} style={RS.val}>%B &lt; 0.10 AND 거래량 ≥ 20일 평균의 1.5배</td></tr>
            <tr><td colSpan={2} style={RS.val}>복수 신호 시 %B 가장 낮은 종목 1개</td></tr>
            <tr><td style={RS.label}>매수 방법</td><td style={RS.val}>지정가 (전일 종가 +1%)<br /><span style={{ color: '#888', fontSize: 10 }}>시초가가 지정가 초과 시 미체결 → 패스</span></td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>청산 규칙</td></tr>
            <tr><td style={RS.label}>장중 매도</td><td style={RS.val}>현재가 ≥ MA20 돌파 시 즉시 시장가 매도 (한투앱)</td></tr>
            <tr><td style={RS.label}>익절</td><td style={RS.val}>08:00 이후 %B ≥ 0.5 확인 → 08:50 시장가 매도</td></tr>
            <tr><td style={RS.label}>손절</td><td style={RS.val}>매수가 대비 -5% (매수 당일 즉시 지정가 등록)</td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>서킷브레이커</td></tr>
            <tr><td style={RS.label}>2연속 손절</td><td style={RS.val}>2주 매매 중단</td></tr>
            <tr><td style={RS.label}>총자금 30% 손실</td><td style={RS.val}>매매 전면 중단 (105만원 이하)</td></tr>

            <tr><td colSpan={2} style={{ ...RS.header, paddingTop: 10 }}>금지 사항</td></tr>
            <tr><td colSpan={2} style={RS.val}>물타기 금지 | 조건 임의 완화 금지 | 손절 취소 금지</td></tr>
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