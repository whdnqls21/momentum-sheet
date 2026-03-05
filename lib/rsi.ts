/**
 * RSI(period) 계산
 * @param output2 - FHKST03010100 output2 배열 (최신순)
 * @param period  - RSI 기간 (기본값 3)
 * @returns RSI 값 (0~100), 데이터 부족 시 null
 */
export function calculateRSI(
  output2: Array<{ stck_clpr: string }>,
  period: number = 3
): number | null {
  const required = period * 2 + 14; // 안정화 버퍼 포함
  if (output2.length < required) return null;

  // 최신순 → 오래된 순으로 변환
  const prices = output2
    .slice(0, required)
    .map((d) => parseFloat(d.stck_clpr))
    .reverse();

  const changes = prices.slice(1).map((p, i) => p - prices[i]);

  // 초기 시드 (단순 평균)
  let avgGain =
    changes.slice(0, period).filter((c) => c > 0).reduce((a, b) => a + b, 0) /
    period;
  let avgLoss =
    changes
      .slice(0, period)
      .filter((c) => c < 0)
      .map(Math.abs)
      .reduce((a, b) => a + b, 0) / period;

  // Wilder's Smoothing
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type EntrySignal = 'BUY' | 'WAIT' | 'NO_DATA';

export function getEntrySignal(rsi: number | null): EntrySignal {
  if (rsi === null) return 'NO_DATA';
  if (rsi < 30) return 'BUY';
  return 'WAIT';
}