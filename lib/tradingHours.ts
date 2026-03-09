/**
 * 현재 KST 시간 기준으로 스크리닝 가능 여부 판단
 * 모든 전략: 08:00 ~ 08:45 (45분 윈도우)
 */

function getKSTHour(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCHours();
}

function getKSTMinutes(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCMinutes();
}

export function getKSTDayOfWeek(): number {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.getUTCDay(); // 0=일, 1=월, ..., 5=금, 6=토
}

export function canScreenSwing(): { allowed: boolean; reason?: string } {
  const hour = getKSTHour();
  const min = getKSTMinutes();
  const totalMin = hour * 60 + min;
  const dayOfWeek = getKSTDayOfWeek();

  // 주말 제한
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { allowed: false, reason: "평일 08:00에 스크리닝 가능합니다." };
  }

  // 평일 08:00 ~ 08:45 허용
  if (totalMin >= 480 && totalMin < 525) {
    return { allowed: true };
  }

  if (totalMin < 480) {
    return { allowed: false, reason: "08:00 이후 스크리닝 가능합니다." };
  }

  return { allowed: false, reason: "오늘 스크리닝 시간이 지났습니다. 내일 08:00에 다시 가능합니다." };
}

export function canScreenSector(): { allowed: boolean; reason?: string } {
  const hour = getKSTHour();
  const min = getKSTMinutes();
  const totalMin = hour * 60 + min;

  // 08:00 ~ 08:45 허용
  if (totalMin >= 480 && totalMin < 525) {
    return { allowed: true };
  }

  if (totalMin < 480) {
    return { allowed: false, reason: "08:00 이후 스크리닝 가능합니다." };
  }

  return { allowed: false, reason: "오늘 스크리닝 시간이 지났습니다. 내일 08:00에 다시 가능합니다." };
}

export function canScreenBollinger(): { allowed: boolean; reason?: string } {
  const hour = getKSTHour();
  const min = getKSTMinutes();
  const totalMin = hour * 60 + min;

  // 08:00 ~ 08:45 허용
  if (totalMin >= 480 && totalMin < 525) {
    return { allowed: true };
  }

  if (totalMin < 480) {
    return { allowed: false, reason: "08:00 이후 스크리닝 가능합니다." };
  }

  return { allowed: false, reason: "오늘 스크리닝 시간이 지났습니다. 내일 08:00에 다시 가능합니다." };
}

export function canCheckBBHolding(): { allowed: boolean; mode: 'price' | 'exit' } {
  // 시간 제한 없음 — 언제든 확인 가능
  // 08:00 이후면 'exit' (%B 포함), 이전이면 'price' (현재가+MA20만)
  const hour = getKSTHour();
  const min = getKSTMinutes();
  const totalMin = hour * 60 + min;

  if (totalMin >= 480) {
    return { allowed: true, mode: 'exit' };
  }
  return { allowed: true, mode: 'price' };
}

export function canRefreshRSI(): { allowed: boolean; reason?: string } {
  const hour = getKSTHour();
  const min = getKSTMinutes();
  const totalMin = hour * 60 + min;

  // 08:00 ~ 08:45 허용
  if (totalMin >= 480 && totalMin < 525) {
    return { allowed: true };
  }

  if (totalMin < 480) {
    return { allowed: false, reason: "08:00 이후 RSI 확인 가능합니다." };
  }

  return { allowed: false, reason: "오늘 RSI 확인 시간이 지났습니다. 내일 08:00에 다시 가능합니다." };
}