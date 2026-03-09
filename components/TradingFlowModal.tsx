'use client';

import { useEffect } from 'react';

interface TradingFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── 스타일 ──
const TH: React.CSSProperties = {
  backgroundColor: '#217346', color: '#fff', border: '1px solid #1a5c35',
  padding: '4px 8px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 11,
};
const TD: React.CSSProperties = {
  border: '1px solid #e0e0e0', padding: '3px 8px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: 11,
};

const TAG: Record<string, React.CSSProperties> = {
  sw: { backgroundColor: '#FFF3E0', color: '#E65100', padding: '1px 5px', borderRadius: 2, fontSize: 10, fontWeight: 700 },
  sec: { backgroundColor: '#E8F5E9', color: '#2E7D32', padding: '1px 5px', borderRadius: 2, fontSize: 10, fontWeight: 700 },
  bb: { backgroundColor: '#E8EAF6', color: '#283593', padding: '1px 5px', borderRadius: 2, fontSize: 10, fontWeight: 700 },
};

function Tag({ type, label }: { type: 'sw' | 'sec' | 'bb'; label: string }) {
  return <span style={TAG[type]}>{label}</span>;
}

function Yes({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 3 }}>
      <span style={{ backgroundColor: '#c6efce', color: '#006100', padding: '0 4px', borderRadius: 2, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✅</span>
      <span style={{ fontSize: 11, color: '#333' }}>{children}</span>
    </div>
  );
}

function No({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 3 }}>
      <span style={{ backgroundColor: '#ffc7ce', color: '#9c0006', padding: '0 4px', borderRadius: 2, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>❌</span>
      <span style={{ fontSize: 11, color: '#333' }}>{children}</span>
    </div>
  );
}

function Neutral({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 3 }}>
      <span style={{ backgroundColor: '#e0e0e0', color: '#555', padding: '0 4px', borderRadius: 2, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>──</span>
      <span style={{ fontSize: 11, color: '#333' }}>{children}</span>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 3 }}>
      <span style={{ backgroundColor: '#ffc7ce', color: '#9c0006', padding: '0 4px', borderRadius: 2, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>🚨</span>
      <span style={{ fontSize: 11, color: '#333' }}>{children}</span>
    </div>
  );
}

// ── 타임라인 블록 ──
function TimeBlock({ time, children }: { time: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
      {/* 세로선 + 마커 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#217346', flexShrink: 0, marginTop: 2 }} />
        <div style={{ width: 3, flex: 1, backgroundColor: '#217346', opacity: 0.3 }} />
      </div>
      {/* 내용 */}
      <div style={{ flex: 1, paddingBottom: 16 }}>
        <div style={{ fontWeight: 700, color: '#217346', fontSize: 12, marginBottom: 6 }}>{time}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── 좌우 분기 블록 ──
function BranchBlock({ question, leftLabel, rightLabel, left, right, wideRight }: {
  question: string;
  leftLabel: string;
  rightLabel: string;
  left: React.ReactNode;
  right: React.ReactNode;
  wideRight?: boolean;
}) {
  return (
    <div style={{ border: '1px solid #d4d4d4', borderRadius: 4, overflow: 'hidden' }}>
      {/* 분기 조건 헤더 */}
      <div style={{
        backgroundColor: '#f0f0f0', padding: '4px 8px', fontSize: 11, fontWeight: 700,
        textAlign: 'center', borderBottom: '1px solid #d4d4d4', color: '#333',
      }}>
        {question}
      </div>
      {/* 좌우 컬럼 */}
      <div className={wideRight ? 'branch-grid branch-grid-wide' : 'branch-grid'}>
        <div className="branch-col-left" style={{ padding: 8 }}>
          <div style={{
            backgroundColor: '#e0e0e0', color: '#555', padding: '2px 8px', borderRadius: 2,
            fontSize: 10, fontWeight: 700, textAlign: 'center', marginBottom: 6,
          }}>
            {leftLabel}
          </div>
          {left}
        </div>
        <div style={{ padding: 8 }}>
          <div style={{
            backgroundColor: '#FFFDE7', color: '#bf8f00', padding: '2px 8px', borderRadius: 2,
            fontSize: 10, fontWeight: 700, textAlign: 'center', marginBottom: 6,
          }}>
            {rightLabel}
          </div>
          {right}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ borderColor = '#217346', bg = '#fff', children }: { borderColor?: string; bg?: string; children: React.ReactNode }) {
  return (
    <div style={{
      borderLeft: `4px solid ${borderColor}`,
      backgroundColor: bg,
      padding: '6px 10px',
      borderRadius: '0 4px 4px 0',
      fontSize: 11,
      lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

export default function TradingFlowModal({ isOpen, onClose }: TradingFlowModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff', border: '1px solid #b4b4b4',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          width: '95%', maxWidth: 700, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* 타이틀 바 */}
        <div style={{
          backgroundColor: '#217346', color: '#fff', padding: '8px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontWeight: 700, fontSize: 12, flexShrink: 0,
        }}>
          <span>📊 운영 플로우</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#fff',
              fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '12px 16px', overflowY: 'auto', fontSize: 11, lineHeight: 1.7 }}>

          {/* ── 자금 배분 ── */}
          <div style={{ fontWeight: 700, fontSize: 12, color: '#1f3864', marginBottom: 6 }}>
            자금 배분 (전략별 독립 복리)
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>전략</th>
                  <th style={TH}>기본 비중</th>
                  <th style={TH}>상대 미보유 시</th>
                  <th style={TH}>최대</th>
                  <th style={TH}>익절</th>
                  <th style={TH}>손절</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...TD, fontWeight: 600 }}><Tag type="sw" label="스윙" /></td>
                  <td style={TD}>37.5%</td>
                  <td style={TD}>37.5% (고정)</td>
                  <td style={TD}>37.5%</td>
                  <td style={{ ...TD, color: '#006100', fontWeight: 600 }}>+7%</td>
                  <td style={{ ...TD, color: '#9c0006', fontWeight: 600 }}>-3%</td>
                </tr>
                <tr>
                  <td style={{ ...TD, fontWeight: 600 }}><Tag type="sec" label="섹터" /></td>
                  <td style={TD}>31.25%</td>
                  <td style={TD}>+18.75%</td>
                  <td style={TD}>50%</td>
                  <td style={{ ...TD, color: '#006100', fontWeight: 600 }}>+7%</td>
                  <td style={{ ...TD, color: '#9c0006', fontWeight: 600 }}>-5%</td>
                </tr>
                <tr>
                  <td style={{ ...TD, fontWeight: 600 }}><Tag type="bb" label="볼린저" /></td>
                  <td style={TD}>31.25%</td>
                  <td style={TD}>+18.75%</td>
                  <td style={TD}>50%</td>
                  <td style={{ ...TD, color: '#006100', fontWeight: 600 }}>%B≥0.5</td>
                  <td style={{ ...TD, color: '#9c0006', fontWeight: 600 }}>-5%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── 타임라인 ── */}
          <div style={{ fontWeight: 700, fontSize: 12, color: '#1f3864', marginBottom: 10 }}>
            운영 타임라인
          </div>

          {/* 매일 아침 */}
          <TimeBlock time="매일 08:00~08:45">
            <ActionCard>
              <div><Tag type="bb" label="볼린저" /> <strong>[스크리닝 실행]</strong></div>
              <div style={{ paddingLeft: 8, marginTop: 2 }}>
                8개 ETF %B + 거래량 확인
                <Yes>BUY → 08:50 시장가 매수</Yes>
                <Neutral>WATCH → 관찰</Neutral>
                <No>없음 → 내일 다시</No>
              </div>
            </ActionCard>
            <BranchBlock
              question="섹터 진입 대기 중?"
              leftLabel="진입 대기 아님"
              rightLabel="진입 대기 중"
              left={
                <div style={{ fontSize: 11, color: '#888', padding: '8px 4px', textAlign: 'center' }}>
                  (해당 없음)
                </div>
              }
              right={
                <ActionCard borderColor="#2E7D32" bg="#E8F5E9">
                  <div><Tag type="sec" label="섹터" /> <strong>[RSI 새로고침]</strong></div>
                  <div style={{ paddingLeft: 8, marginTop: 2 }}>
                    <Yes>RSI &lt; 50 → 08:50 매수</Yes>
                    <No>RSI ≥ 50 → 내일 재확인</No>
                    <Neutral>월말 마지막일 → 이번 달 패스</Neutral>
                  </div>
                </ActionCard>
              }
            />
          </TimeBlock>

          {/* 08:50 매수 */}
          <TimeBlock time="08:50 매수">
            <BranchBlock
              question="매수 신호 있음?"
              leftLabel="없음"
              rightLabel="있음"
              left={
                <div style={{ fontSize: 11, color: '#888', padding: '6px 4px' }}>
                  매수 없음<br />일반 루틴 진행
                </div>
              }
              right={
                <div>
                  <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6 }}>어떤 전략?</div>
                  <div className="branch-grid-3col" style={{ gap: 4 }}>
                    {/* 스윙 */}
                    <div style={{ border: '1px solid #E65100', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 10, textAlign: 'center', padding: '2px 0' }}>
                        스윙
                      </div>
                      <div style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.6 }}>
                        37.5% (고정)<br />
                        시장가 매수<br />
                        손절 -3%
                      </div>
                    </div>
                    {/* 섹터 */}
                    <div style={{ border: '1px solid #2E7D32', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: 10, textAlign: 'center', padding: '2px 0' }}>
                        섹터
                      </div>
                      <div style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.6 }}>
                        볼린저 보유?<br />
                        Y→31.25%<br />
                        N→50%<br />
                        손절 -5%
                      </div>
                    </div>
                    {/* 볼린저 */}
                    <div style={{ border: '1px solid #283593', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#E8EAF6', color: '#283593', fontWeight: 700, fontSize: 10, textAlign: 'center', padding: '2px 0' }}>
                        볼린저
                      </div>
                      <div style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.6 }}>
                        섹터 보유?<br />
                        Y→31.25%<br />
                        N→50%<br />
                        손절 -5%
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: '#555', borderTop: '1px solid #e0e0e0', paddingTop: 4 }}>
                    한투앱 시장가 매수 (08:50 접수)<br />
                    즉시 손절 지정가 등록<br />
                    매매일지 매수 기록
                  </div>
                </div>
              }
            />
          </TimeBlock>

          {/* 장중 */}
          <TimeBlock time="장중 09:00~15:30">
            <ActionCard borderColor="#283593" bg="#E8EAF6">
              <div><Tag type="bb" label="볼린저" /> 보유 종목 있으면</div>
              <div style={{ paddingLeft: 8 }}>
                → <strong>[보유종목 확인]</strong> (시간 제한 없음)
                <Yes>현재가 ≥ MA20 → 즉시 매도 가능 (한투앱 시장가 매도)</Yes>
                <Neutral>현재가 &lt; MA20 → 보유 유지</Neutral>
                <Warn>-3%↓ → 손절가 근접 경고</Warn>
              </div>
            </ActionCard>
          </TimeBlock>

          {/* 월요일 */}
          <TimeBlock time="월요일 08:00~08:45">
            <BranchBlock
              question="스윙 보유 종목 있음?"
              leftLabel="보유 없음"
              rightLabel="보유 있음 (금 15:20 매도됨)"
              left={
                <ActionCard borderColor="#E65100" bg="#FFF3E0">
                  <div><Tag type="sw" label="스윙" /> <strong>[스크리닝 실행]</strong></div>
                  <div style={{ paddingLeft: 8, marginTop: 2 }}>
                    20종목 스코어링
                    <Yes>PASS + 60↑ → 08:50 매수</Yes>
                    <No>미달 → 다음 주</No>
                  </div>
                </ActionCard>
              }
              right={
                <ActionCard borderColor="#E65100" bg="#FFF3E0">
                  <div><Tag type="sw" label="스윙" /> <strong>[스크리닝 실행]</strong></div>
                  <div style={{ paddingLeft: 8, marginTop: 2 }}>
                    20종목 스코어링
                    <Yes>PASS + 60↑ → 08:50 매수</Yes>
                    <No>미달 → 다음 주</No>
                  </div>
                </ActionCard>
              }
            />
          </TimeBlock>

          {/* 금요일 매도 */}
          <TimeBlock time="금요일 15:20">
            <ActionCard borderColor="#9c0006" bg="#FFEBEE">
              <div><Tag type="sw" label="스윙" /> 보유 종목 종가 매도</div>
              <div style={{ paddingLeft: 8, marginTop: 2 }}>
                <Neutral>매매일지 기록</Neutral>
              </div>
            </ActionCard>
          </TimeBlock>

          {/* 매도 이벤트 */}
          <TimeBlock time="매도 이벤트 발생 시">
            <ActionCard borderColor="#9c0006" bg="#FFEBEE">
              <div style={{ fontWeight: 700 }}>매도 사유 확인:</div>
              <div style={{ paddingLeft: 8 }}>
                <Yes>익절: <Tag type="sw" label="스윙" /> +7% / <Tag type="sec" label="섹터" /> +7% → 체결 확인</Yes>
                <Yes>볼린저 익절: 장중 MA20 돌파 or %B≥0.5 → 매도</Yes>
                <Warn>손절: 지정가 자동 체결 → 알림 확인</Warn>
                <Neutral>기한 매도: <Tag type="sw" label="스윙" /> 금15:20 / <Tag type="sec" label="섹터" /> 월말15:20</Neutral>
              </div>
            </ActionCard>
            <ActionCard borderColor="#1565c0" bg="#E3F2FD">
              <div>→ 손절 지정가 주문 취소 (손절 체결 제외)</div>
              <div>→ 매매일지 매도 기록 (청산사유 선택)</div>
              <div>→ 잔액 확인 → 복리 반영</div>
            </ActionCard>
            <ActionCard borderColor="#9c0006" bg="#FFEBEE">
              <div><Tag type="bb" label="볼린저" /> 손절 시 서킷브레이커:</div>
              <div style={{ paddingLeft: 8 }}>
                <Warn>2연속 손절 → 2주 중단</Warn>
                <Warn>총자금 30%↓ → 전면 중단</Warn>
              </div>
            </ActionCard>
          </TimeBlock>

          {/* 매월 초 */}
          <TimeBlock time="매월 초 08:00~">
            <ActionCard borderColor="#2E7D32" bg="#E8F5E9">
              <div><Tag type="sec" label="섹터" /> 보유 중이면 → 전월 말 15:20 종가 매도 → 매매일지 기록</div>
              <div style={{ marginTop: 4 }}>
                <Tag type="sec" label="섹터" /> <strong>[섹터 스크리닝]</strong> → 1위 ETF 확정
              </div>
              <div style={{ paddingLeft: 8 }}>
                → 이후 매일 08:00 RSI 새로고침으로 진입 대기
              </div>
            </ActionCard>
          </TimeBlock>

          {/* ── 절대 금지 ── */}
          <div style={{
            border: '2px solid #9c0006',
            borderRadius: 4,
            padding: '8px 12px',
            marginTop: 8,
            backgroundColor: '#FFEBEE',
          }}>
            <div style={{ fontWeight: 700, color: '#9c0006', fontSize: 12, marginBottom: 4 }}>
              🚫 절대 금지
            </div>
            <div style={{ fontSize: 11, color: '#9c0006', lineHeight: 1.8 }}>
              물타기 금지 · 조건 임의 완화 금지 · 손절 취소/변경 금지 · 전략 간 자금 혼용 금지 · 감정적 매매 금지
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
