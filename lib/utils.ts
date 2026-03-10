/** 공통 포매터 및 유틸리티 */

export const fmt = (n: number) => n.toLocaleString();

export const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export function fmtOption(h: { screen_date: string }): string {
  const d = new Date(h.screen_date + 'T00:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${DAY_NAMES[d.getDay()]})`;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}