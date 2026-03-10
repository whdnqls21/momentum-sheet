/**
 * 현재 KST 시간 기준으로 스크리닝 가능 여부 판단
 * 모든 전략: 평일 08:00 ~ 08:45 (45분 윈도우)
 */

function getKSTHour(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCHours();
}

function getKSTMinutes(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCMinutes();
}

function getKSTDayOfWeek(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCDay(); // 0=일, 1=월, ..., 5=금, 6=토
}

function checkScreeningTime(label: string): { allowed: boolean; reason?: string } {
  const dayOfWeek = getKSTDayOfWeek();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { allowed: false, reason: `평일 08:00에 ${label} 가능합니다.` };
  }
  const totalMin = getKSTHour() * 60 + getKSTMinutes();
  if (totalMin >= 480 && totalMin < 525) return { allowed: true };
  if (totalMin < 480) return { allowed: false, reason: `08:00 이후 ${label} 가능합니다.` };
  return { allowed: false, reason: `오늘 ${label} 시간이 지났습니다. 내일 08:00에 다시 가능합니다.` };
}

export function canScreenSwing() { return checkScreeningTime('스크리닝'); }
export function canScreenSector() { return checkScreeningTime('스크리닝'); }
export function canScreenBollinger() { return checkScreeningTime('스크리닝'); }
export function canRefreshRSI() { return checkScreeningTime('RSI 확인'); }