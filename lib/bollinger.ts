/**
 * 볼린저밴드 %B 계산
 * @param prices - 종가 배열 (최신순, 최소 20개)
 * @param period - 이동평균 기간 (기본값 20)
 * @param multiplier - 표준편차 배수 (기본값 2)
 * @returns { percentB, upper, middle, lower } 또는 null
 */
export function calculateBollingerBand(
  prices: number[],
  period: number = 20,
  multiplier: number = 2
): {
  percentB: number;
  upper: number;
  middle: number;
  lower: number;
} | null {
  if (prices.length < period) return null;

  const slice = prices.slice(0, period);

  const middle = slice.reduce((a, b) => a + b, 0) / period;

  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + (stdDev * multiplier);
  const lower = middle - (stdDev * multiplier);

  const bandWidth = upper - lower;
  if (bandWidth === 0) return null;

  const percentB = (prices[0] - lower) / bandWidth;

  return {
    percentB: Math.round(percentB * 1000) / 1000,
    upper: Math.round(upper),
    middle: Math.round(middle),
    lower: Math.round(lower),
  };
}

/**
 * 거래량 비율 계산
 * @param volumes - 거래량 배열 (최신순, 최소 20개)
 * @returns 당일거래량 / 20일 평균거래량, 또는 null
 */
export function calculateVolumeRatio(
  volumes: number[]
): number | null {
  if (volumes.length < 20) return null;

  const todayVol = volumes[0];
  const avg20 = volumes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;

  if (avg20 === 0) return null;
  return Math.round((todayVol / avg20) * 100) / 100;
}

/**
 * 매수 신호 판단
 */
export type BBSignal = 'BUY' | 'WATCH' | 'NO_SIGNAL' | 'NO_DATA';

export function getBBEntrySignal(
  percentB: number | null,
  volumeRatio: number | null
): BBSignal {
  if (percentB === null || volumeRatio === null) return 'NO_DATA';
  if (percentB < 0.10 && volumeRatio >= 1.5) return 'BUY';
  if (percentB < 0.10) return 'WATCH';
  return 'NO_SIGNAL';
}

/**
 * 익절 신호 판단
 */
export function getBBExitSignal(percentB: number | null): 'EXIT' | 'HOLD' | 'NO_DATA' {
  if (percentB === null) return 'NO_DATA';
  if (percentB >= 0.5) return 'EXIT';
  return 'HOLD';
}