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

  const rounded = Math.round(amount * 10) / 10;
  const eok = Math.floor(rounded / 10000);
  const remainder = Math.round((rounded - eok * 10000) * 10) / 10;
  if (!eok) return `${koreanNumber.format(remainder)}만 원`;
  return remainder
    ? `${koreanNumber.format(eok)}억 ${koreanNumber.format(remainder)}만 원`
    : `${koreanNumber.format(eok)}억 원`;
}

export function formatArea(value) {
  const area = Number(value);
  return Number.isFinite(area) && area > 0 ? `${areaNumber.format(area)}㎡` : '-';
}

export function formatAreaUnit(value, unit = 'm2') {
  if (unit !== 'pyeong') return formatArea(value);
  const area = Number(value);
  return value !== null && value !== undefined && value !== ''
    && Number.isFinite(area) && area > 0
    ? `${areaNumber.format(area * 0.3025)}평` : '-';
}

export function formatPricePerPyeong(price10k, areaM2) {
  if (price10k === null || price10k === undefined || price10k === ''
      || areaM2 === null || areaM2 === undefined || areaM2 === '') return '-';
  const price = Number(price10k);
  const area = Number(areaM2);
  return Number.isFinite(price) && price >= 0 && Number.isFinite(area) && area > 0
    ? `${formatKrw10k(Math.round(price / (area * 0.3025)))}/평` : '-';
}

const AREA_PRESETS = {
  'under-40': { min: null, max: 40, label: '40㎡ 미만' },
  '40-60': { min: 40, max: 60, label: '40~60㎡' },
  '60-85': { min: 60, max: 85, label: '60~85㎡' },
  '85-135': { min: 85, max: 135, label: '85~135㎡' },
  'over-135': { min: 135, max: null, label: '135㎡ 이상' },
};

export function getAreaFilter(value, minimum = '', maximum = '') {
  if (value !== 'custom') return AREA_PRESETS[value] ?? null;

  const rawMin = String(minimum).trim();
  const rawMax = String(maximum).trim();
  if (!rawMin && !rawMax) {
    throw new RangeError('최소 또는 최대 면적을 입력해 주세요.');
  }

  const validNumber = /^\d+(?:\.\d{1,2})?$/;
  if ((rawMin && !validNumber.test(rawMin)) || (rawMax && !validNumber.test(rawMax))) {
    throw new RangeError('면적은 0 이상의 숫자를 소수 둘째 자리까지 입력해 주세요.');
  }
  const min = rawMin ? Number(rawMin) : null;
  const max = rawMax ? Number(rawMax) : null;
  if ((max !== null && max <= 0) || (min !== null && max !== null && min > max)) {
    throw new RangeError('최대 면적은 최소 면적 이상으로 입력해 주세요.');
  }

  const label = min !== null && max !== null
    ? `${areaNumber.format(min)}~${areaNumber.format(max)}㎡`
    : min !== null ? `${areaNumber.format(min)}㎡ 이상` : `${areaNumber.format(max)}㎡ 이하`;
  return { min, max, includeMax: true, label };
}

export function filterByArea(items, areaFilter) {
  if (!areaFilter) return items;

  return items.filter((item) => {
    if (item?.area_m2 === null || item?.area_m2 === undefined || item?.area_m2 === '') {
      return false;
    }
    const area = Number(item.area_m2);
    return Number.isFinite(area) && area > 0
      && (areaFilter.min === null || area >= areaFilter.min)
      && (areaFilter.max === null
        || (areaFilter.includeMax ? area <= areaFilter.max : area < areaFilter.max));
  });
}

export function getPriceFilter(minimum = '', maximum = '') {
  const rawMin = String(minimum).trim();
  const rawMax = String(maximum).trim();
  if (!rawMin && !rawMax) return null;
  const validNumber = /^\d+(?:\.\d{1,2})?$/;
  if ((rawMin && !validNumber.test(rawMin)) || (rawMax && !validNumber.test(rawMax))) {
    throw new RangeError('가격은 0 이상의 억 원 단위 숫자로 소수 둘째 자리까지 입력해 주세요.');
  }
  const min = rawMin ? Number(rawMin) : null;
  const max = rawMax ? Number(rawMax) : null;
  if ((max !== null && max <= 0) || (min !== null && max !== null && min > max)) {
    throw new RangeError('최대 가격은 최소 가격 이상으로 입력해 주세요.');
  }
  const label = min !== null && max !== null
    ? `${areaNumber.format(min)}~${areaNumber.format(max)}억 원`
    : min !== null ? `${areaNumber.format(min)}억 원 이상`
      : `${areaNumber.format(max)}억 원 이하`;
  return {
    min10k: min === null ? null : Math.round(min * 10000),
    max10k: max === null ? null : Math.round(max * 10000),
    label,
  };
}

export function filterByPrice(items, priceFilter, dealType) {
  if (!priceFilter) return items;
  const key = dealType === 'rent' ? 'deposit_10k' : 'price_10k';
  return items.filter((item) => {
    const raw = item?.[key];
    if (raw === null || raw === undefined || raw === '') return false;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0
      && (priceFilter.min10k === null || value >= priceFilter.min10k)
      && (priceFilter.max10k === null || value <= priceFilter.max10k);
  });
}

export function toggleComparedTransaction(selected, transaction, limit = 3) {
  if (selected.has(transaction)) {
    selected.delete(transaction);
    return true;
  }
  if (selected.size >= limit) return false;
  selected.add(transaction);
  return true;
}

function normalizedName(value) {
  return typeof value === 'string'
    ? value.trim().normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko') : '';
}

export function matchingUnitTransactions(items, reference) {
  const name = normalizedName(reference?.name);
  const district = normalizedName(reference?.district);
  const area = Number(reference?.area_m2);
  if (!name || !district || !Number.isFinite(area) || area <= 0) return [];
  return items.filter((item) => {
    const itemArea = Number(item?.area_m2);
    return normalizedName(item?.name) === name
      && normalizedName(item?.district) === district
      && item?.area_m2 !== null && item?.area_m2 !== undefined && item?.area_m2 !== ''
      && Number.isFinite(itemArea) && Math.abs(itemArea - area) <= 1;
  });
}

export function shiftMonth(month, offset) {
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(offset)) {
    throw new RangeError('올바른 거래년월이 필요합니다.');
  }
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4)) - 1 + offset, 1));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sortedAmounts(items, key) {
  return items
    .map((item) => item[key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
}

export function summarizeTransactions(items, dealType) {
  if (dealType === 'trade') {
    const prices = sortedAmounts(items, 'price_10k');
    const middle = Math.floor(prices.length / 2);
    return {
      median_price_10k: prices.length
        ? (prices[middle] + prices[Math.floor((prices.length - 1) / 2)]) / 2 : null,
      min_price_10k: prices[0] ?? null,
      max_price_10k: prices[prices.length - 1] ?? null,
    };
  }

  const deposits = sortedAmounts(items, 'deposit_10k');
  const rents = sortedAmounts(items, 'monthly_rent_10k');
  const middle = Math.floor(deposits.length / 2);
  return {
    median_deposit_10k: deposits.length
      ? (deposits[middle] + deposits[Math.floor((deposits.length - 1) / 2)]) / 2 : null,
    min_deposit_10k: deposits[0] ?? null,
    max_deposit_10k: deposits[deposits.length - 1] ?? null,
    monthly_rent_avg_10k: rents.length
      ? Math.round((rents.reduce((sum, value) => sum + value, 0) / rents.length) * 10) / 10 : null,
  };
}

export function formatMonth(value) {
  return /^\d{6}$/.test(value) ? `${value.slice(0, 4)}년 ${Number(value.slice(4))}월` : '-';
}

export function formatDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, '.') : '-';
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
