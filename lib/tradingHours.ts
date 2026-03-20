/**
 * 현재 KST 시간 기준으로 스크리닝 가능 여부 판단
 * 모든 전략: 평일 18:00 ~ 익일 08:45 + 주말 종일
 * (전일 장 마감 후 데이터 확정 → 익일 08:50 매수)
 */

function getKSTDayOfWeek(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCDay(); // 0=일, 1=월, ..., 5=금, 6=토
}

function getKSTHour(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCHours();
}

function getKSTMinutes(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCMinutes();
}

function isScreeningWindow(): { allowed: boolean; reason?: string } {
  const day = getKSTDayOfWeek(); // 0=일, 6=토
  const hour = getKSTHour();
  const min = getKSTMinutes();
  const totalMin = hour * 60 + min;

  // 주말 종일 가능
  if (day === 6 || day === 0) return { allowed: true };
  // 평일 00:00~08:45 가능
  if (day >= 1 && day <= 5 && totalMin < 525) return { allowed: true };
  // 평일 18:00~23:59 가능
  if (day >= 1 && day <= 5 && totalMin >= 1080) return { allowed: true };

  return {
    allowed: false,
    reason: '18:00 이후 스크리닝 가능합니다. (장 마감 후 데이터 확정)',
  };
}

export function canScreenSwing() { return isScreeningWindow(); }
export function canScreenSector() { return isScreeningWindow(); }
export function canScreenBollinger() { return isScreeningWindow(); }
export function canRefreshRSI() { return isScreeningWindow(); }