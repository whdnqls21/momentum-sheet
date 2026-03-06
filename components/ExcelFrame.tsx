'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface Sheet {
  id: string;
  label: string;
  path: string;
  formula: string;
  description: string;
}

const SHEETS: Sheet[] = [
  { id: 'balance',  label: '잔고현황',     path: '/',        formula: '=한투API(TTTC8434R, 잔고조회)', description: '한국투자증권 · 보유종목 현황' },
  { id: 'swing',    label: '단기스윙',     path: '/swing',   formula: '=RANK(총점, 1차풀+2차풀, 0)  |  필터: 현재가>MA5 AND 기울기>0 AND 거래량비≥0.8', description: '금요일 스크리닝 → 월요일 매수' },
  { id: 'sector',   label: '섹터로테이션', path: '/sector',  formula: '=ROUND(1M수익률*0.6 + 3M수익률*0.4, 2)', description: '월말 스크리닝 → 첫 거래일 매수' },
  { id: 'bollinger', label: '볼린저',     path: '/bollinger', formula: '=(현재가-하단)/(상단-하단)  |  %B<0.10 AND 거래량≥1.5배', description: '%B 평균회귀 · 매일 스크리닝' },
  { id: 'journal',  label: '매매일지',     path: '/journal', formula: '=SUMIF(전략, "*", 손익)  |  승률=COUNTIF(손익,">0")/COUNT(매도일)', description: '거래 기록 · 성과 추적' },
  { id: 'analysis', label: '성과분석',     path: '/analysis', formula: '=IFERROR(승/총거래, 0)  ·  PF=총수익/ABS(총손실)', description: '전략별 비교 · 누적 손익 추이' },
];

const MOBILE_ICONS: Record<string, string> = {
  balance: '📊', swing: '⚡', sector: '🔄', bollinger: '📉', journal: '📝', analysis: '📈',
};
const MOBILE_LABELS: Record<string, string> = {
  balance: '홈', swing: '스윙', sector: '섹터', bollinger: '볼린저', journal: '일지', analysis: '분석',
};

interface ExcelFrameProps {
  children: ReactNode;
  statusItems?: { avg?: string; count?: string; sum?: string };
  onRefresh?: () => void;
  refreshing?: boolean;
  ribbonExtra?: ReactNode;
}

export default function ExcelFrame({ children, statusItems, onRefresh, refreshing, ribbonExtra }: ExcelFrameProps) {
  const router = useRouter();
  const pathname = usePathname();

  const current = SHEETS.find((s) => s.path === pathname) || SHEETS[0];

  const handleSheetClick = useCallback(
    (sheet: Sheet) => {
      if (sheet.path !== pathname) router.push(sheet.path);
    },
    [pathname, router]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '100vw', overflow: 'hidden' }}>
      {/* ── Ribbon ── */}
      <div style={{ backgroundColor: '#217346', borderBottom: '1px solid #1a5c35' }}>
        {/* Ribbon tabs */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px 0' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 12, marginRight: 16, letterSpacing: -0.5 }}>
            📊 MomentumSheet
          </div>
          {['홈', '삽입', '수식', '데이터'].map((t, i) => (
            <button
              key={t}
              style={{
                padding: '5px 14px 4px',
                fontSize: 12,
                color: i === 0 ? '#217346' : 'rgba(255,255,255,0.85)',
                backgroundColor: i === 0 ? '#fff' : 'transparent',
                border: 'none',
                borderRadius: i === 0 ? '3px 3px 0 0' : 0,
                cursor: 'pointer',
                fontWeight: i === 0 ? 600 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {/* Ribbon body */}
        <div
          style={{
            backgroundColor: '#fff',
            borderBottom: '1px solid #d4d4d4',
            padding: '4px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 30,
          }}
        >
          {onRefresh && (
            <button
              className="btn-ribbon"
              onClick={onRefresh}
              disabled={refreshing}
              style={refreshing ? { backgroundColor: '#e2efda' } : {}}
            >
              {refreshing ? '⏳ 갱신 중...' : '▶ 전체 새로고침'}
            </button>
          )}
          {ribbonExtra}
          <span style={{ fontSize: 10, color: '#888' }}>
            {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span style={{ fontSize: 10, color: '#888', marginLeft: 'auto' }}>
            {current.description}
          </span>
        </div>
      </div>

      {/* ── Formula Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #d4d4d4',
          backgroundColor: '#fff',
          height: 24,
        }}
      >
        <div
          style={{
            width: 80,
            borderRight: '1px solid #d4d4d4',
            padding: '0 6px',
            fontSize: 11,
            fontWeight: 500,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            color: '#333',
          }}
        >
          A1
        </div>
        <div
          style={{
            padding: '0 6px',
            fontSize: 11,
            color: '#888',
            fontStyle: 'italic',
            borderRight: '1px solid #d4d4d4',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          fx
        </div>
        <div
          style={{
            flex: 1,
            padding: '0 6px',
            fontSize: 11,
            color: '#444',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {current.formula}
        </div>
      </div>

      {/* ── Workspace ── */}
      <div className="workspace" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', backgroundColor: '#fff' }}>{children}</div>

      {/* ── Sheet Tabs (Desktop) ── */}
      <div className="desktop-sheet-tabs"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          borderTop: '1px solid #c0c0c0',
          backgroundColor: '#e7e6e6',
          padding: '0 4px',
          flexShrink: 0,
        }}
      >
        <span style={{ padding: '4px 8px', fontSize: 10, color: '#888' }}>◀ ▶</span>
        {SHEETS.map((s) => {
          const active = s.id === current.id;
          return (
            <button
              key={s.id}
              onClick={() => handleSheetClick(s)}
              style={{
                padding: '3px 16px',
                fontSize: 11,
                color: active ? '#217346' : '#555',
                backgroundColor: active ? '#fff' : '#e7e6e6',
                border: active ? '1px solid #c0c0c0' : '1px solid transparent',
                borderBottom: active ? '1px solid #fff' : '1px solid #c0c0c0',
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
                marginRight: -1,
              }}
            >
              {s.label}
            </button>
          );
        })}
        <span style={{ padding: '4px 8px', fontSize: 12, color: '#aaa', cursor: 'pointer' }}>＋</span>
      </div>

      {/* ── Status Bar (Desktop) ── */}
      <div className="desktop-status-bar"
        style={{
          backgroundColor: '#217346',
          color: 'rgba(255,255,255,0.9)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '2px 12px',
          fontSize: 10,
          height: 22,
          flexShrink: 0,
        }}
      >
        <span>{refreshing ? '계산 중...' : '준비'}</span>
        <span style={{ display: 'flex', gap: 16 }}>
          {statusItems?.avg && <span>평균: {statusItems.avg}</span>}
          {statusItems?.count && <span>개수: {statusItems.count}</span>}
          {statusItems?.sum && <span>합계: {statusItems.sum}</span>}
        </span>
        <span>100%</span>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="mobile-bottom-nav">
        {SHEETS.map((s) => {
          const active = s.id === current.id;
          return (
            <button
              key={s.id}
              onClick={() => handleSheetClick(s)}
              className={active ? 'mobile-nav-active' : ''}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                padding: '6px 0 4px',
                border: 'none',
                backgroundColor: 'transparent',
                color: active ? '#217346' : '#888',
                fontSize: 9,
                fontWeight: active ? 700 : 400,
                cursor: 'pointer',
                borderTop: active ? '2px solid #217346' : '2px solid transparent',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 16 }}>{MOBILE_ICONS[s.id]}</span>
              <span>{MOBILE_LABELS[s.id]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
