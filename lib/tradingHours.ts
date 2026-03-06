/**
 * 현재 KST 시간 기준으로 스크리닝 가능 여부 판단
 */

function getKSTHour(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCHours();
}

function getKSTMinutes(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCMinutes();
}

export function canScreenSwing(): { allowed: boolean; reason?: string } {
  const hour = getKSTHour();
  // 18:00~23:59, 00:00~08:59 허용
  if (hour >= 18 || hour < 9) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "외국인 수급 데이터가 장 마감 후 확정됩니다. 18:00 이후 스크리닝 가능합니다."
  };
}

export function canScreenSector(): { allowed: boolean; reason?: string } {
  const hour = getKSTHour();
  const min = getKSTMinutes();
  // 15:40~23:59, 00:00~08:59 허용
  if (hour >= 16 || (hour === 15 && min >= 40) || hour < 9) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "정규장 종가가 15:30에 확정됩니다. 15:40 이후 스크리닝 가능합니다."
  };
}

export function canRefreshRSI(): { allowed: boolean; reason?: string } {
  const hour = getKSTHour();
  const min = getKSTMinutes();
  // 15:40~23:59, 00:00~08:59 허용
  if (hour >= 16 || (hour === 15 && min >= 40) || hour < 9) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "당일 종가가 15:30에 확정됩니다. 15:40 이후 RSI 새로고침 가능합니다."
  };
}