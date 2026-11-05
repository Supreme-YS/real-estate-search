const koreanNumber = new Intl.NumberFormat('ko-KR');
const areaNumber = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

export function formatNumber(value) {
  return koreanNumber.format(Number(value) || 0);
}

export function formatKrw10k(value) {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '-';
  if (amount === 0) return '0원';

  const eok = Math.floor(amount / 10000);
  const remainder = Math.round((amount % 10000) * 10) / 10;
  if (!eok) return `${koreanNumber.format(remainder)}만 원`;
  return remainder
    ? `${koreanNumber.format(eok)}억 ${koreanNumber.format(remainder)}만 원`
    : `${koreanNumber.format(eok)}억 원`;
}

export function formatArea(value) {
  const area = Number(value);
  return Number.isFinite(area) && area > 0 ? `${areaNumber.format(area)}㎡` : '-';
}

export function formatMonth(value) {
  return /^\d{6}$/.test(value) ? `${value.slice(0, 4)}년 ${Number(value.slice(4))}월` : '-';
}

export function formatDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '.') : '-';
}

export function previousKoreanMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

export function currentKoreanMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
}
