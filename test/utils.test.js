import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMapSearchUrl,
  currentKoreanMonth,
  filterByArea,
  filterByPrice,
  formatArea,
  formatAreaUnit,
  formatDate,
  formatKrw10k,
  formatMonth,
  formatPricePerPyeong,
  getAreaFilter,
  getPriceFilter,
  matchingUnitTransactions,
  previousKoreanMonth,
  shiftMonth,
  summarizeTransactions,
  toggleComparedTransaction,
} from '../public/utils.js';

test('건물명과 동으로 카카오맵 검색 링크를 안전하게 만든다', () => {
  const url = new URL(createMapSearchUrl('서울특별시 강남구', {
    name: ' 은마/1차? #2 ',
    district: ' 대치동 ',
  }));
  assert.equal(url.origin, 'https://map.kakao.com');
  assert.equal(decodeURIComponent(url.pathname), '/link/search/서울특별시 강남구 대치동 은마/1차? #2');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');

  assert.equal(
    decodeURIComponent(new URL(createMapSearchUrl('서울특별시 강남구', {
      name: '', district: '대치동',
    })).pathname),
    '/link/search/서울특별시 강남구 대치동',
  );
  assert.equal(createMapSearchUrl('서울특별시 강남구', { name: ' ', district: null }), null);
  assert.equal(createMapSearchUrl('', null), null);
});

test('단지명 끝 괄호 설명이 지도 검색을 막으면 괄호만 제외해 검색한다', () => {
  const searchQuery = (name) => decodeURIComponent(new URL(createMapSearchUrl(
    '서울특별시 강남구', { name, district: '자곡동' },
  )).pathname);
  assert.equal(searchQuery('강남한양수자인(4단지)'),
    '/link/search/서울특별시 강남구 자곡동 강남한양수자인');
  assert.equal(searchQuery('강남한양수자인 (4단지)(419동)'),
    '/link/search/서울특별시 강남구 자곡동 강남한양수자인');
  assert.equal(searchQuery('래미안(강남)아파트'),
    '/link/search/서울특별시 강남구 자곡동 래미안(강남)아파트');
  assert.equal(searchQuery('(4단지)'),
    '/link/search/서울특별시 강남구 자곡동 (4단지)');
});

test('만원 단위 원본 금액을 정확한 원화 표기로 바꾼다', () => {
  assert.equal(formatKrw10k(245000), '24억 5,000만 원');
  assert.equal(formatKrw10k(10000), '1억 원');
  assert.equal(formatKrw10k(9500), '9,500만 원');
  assert.equal(formatKrw10k(72.5), '72.5만 원');
  assert.equal(formatKrw10k(0), '0원');
  assert.equal(formatKrw10k(null), '-');
  assert.equal(formatKrw10k(9999.99), '1억 원');
});

test('한국 시간 기준으로 기본 조회월과 현재월을 계산한다', () => {
  const lateOctoberUtc = new Date('2026-10-31T15:30:00Z');
  assert.equal(currentKoreanMonth(lateOctoberUtc), '2026-11');
  assert.equal(previousKoreanMonth(lateOctoberUtc), '2026-10');
  assert.equal(previousKoreanMonth(new Date('2025-12-31T15:30:00Z')), '2025-12');
});

test('날짜와 면적을 읽기 쉬운 형식으로 표시한다', () => {
  assert.equal(formatDate('2026-09-30'), '2026.09.30');
  assert.equal(formatMonth('202609'), '2026년 9월');
  assert.equal(formatArea(84.99), '84.99㎡');
  assert.equal(formatArea(null), '-');
});

test('구형 브라우저에서 최신 문자열·배열 메서드가 없어도 날짜와 통계를 계산한다', () => {
  const originalAt = Array.prototype.at;
  const originalReplaceAll = String.prototype.replaceAll;
  let formattedDate;
  let tradeSummary;
  let rentSummary;
  try {
    Array.prototype.at = undefined;
    String.prototype.replaceAll = undefined;
    formattedDate = formatDate('2026-09-30');
    tradeSummary = summarizeTransactions([{ price_10k: 10000 }, { price_10k: 20000 }], 'trade');
    rentSummary = summarizeTransactions([{ deposit_10k: 0 }, { deposit_10k: 30000 }], 'rent');
  } finally {
    Array.prototype.at = originalAt;
    String.prototype.replaceAll = originalReplaceAll;
  }
  assert.equal(formattedDate, '2026.09.30');
  assert.equal(tradeSummary.max_price_10k, 20000);
  assert.equal(rentSummary.max_deposit_10k, 30000);
});

test('면적 구간은 경계값을 중복 없이 나누고 면적 미제공 거래를 제외한다', () => {
  const items = [
    { area_m2: 39.99 }, { area_m2: 40 }, { area_m2: 60 },
    { area_m2: 84.99 }, { area_m2: 85 }, { area_m2: 135 },
    { area_m2: null }, { area_m2: '' }, { area_m2: 0 },
  ];
  assert.equal(getAreaFilter('all'), null);
  assert.equal(filterByArea(items, getAreaFilter('all')).length, items.length);
  assert.deepEqual(filterByArea(items, getAreaFilter('under-40')).map((item) => item.area_m2), [39.99]);
  assert.deepEqual(filterByArea(items, getAreaFilter('40-60')).map((item) => item.area_m2), [40]);
  assert.deepEqual(filterByArea(items, getAreaFilter('60-85')).map((item) => item.area_m2), [60, 84.99]);
  assert.deepEqual(filterByArea(items, getAreaFilter('85-135')).map((item) => item.area_m2), [85]);
  assert.deepEqual(filterByArea(items, getAreaFilter('over-135')).map((item) => item.area_m2), [135]);
});

test('면적 직접 입력은 양쪽 경계를 포함하고 한쪽만 입력할 수도 있다', () => {
  const items = [59, 59.99, 60, 85, 85.01, null].map((area_m2) => ({ area_m2 }));
  const custom = getAreaFilter('custom', '60', '85');
  assert.equal(custom.label, '60~85㎡');
  assert.deepEqual(filterByArea(items, custom).map((item) => item.area_m2), [60, 85]);
  assert.equal(getAreaFilter('custom', '', '59.99').label, '59.99㎡ 이하');
  assert.equal(filterByArea(items, getAreaFilter('custom', '', '59.99')).length, 2);
  assert.equal(getAreaFilter('custom', '85', '').label, '85㎡ 이상');
  assert.equal(filterByArea(items, getAreaFilter('custom', '85', '')).length, 2);

  assert.throws(() => getAreaFilter('custom'), /최소 또는 최대/);
  assert.throws(() => getAreaFilter('custom', '-1', ''), /0 이상/);
  assert.throws(() => getAreaFilter('custom', '1.234', ''), /소수 둘째/);
  assert.throws(() => getAreaFilter('custom', '85', '60'), /최대 면적/);
});

test('면적 필터 결과에 맞춰 매매·전월세 통계를 다시 계산한다', () => {
  assert.deepEqual(summarizeTransactions([
    { price_10k: 10000 }, { price_10k: 20000 }, { price_10k: 30000 },
    { price_10k: null },
  ], 'trade'), {
    median_price_10k: 20000,
    min_price_10k: 10000,
    max_price_10k: 30000,
  });
  assert.equal(summarizeTransactions([
    { price_10k: 10000 }, { price_10k: 20000 },
  ], 'trade').median_price_10k, 15000);
  assert.deepEqual(summarizeTransactions([
    { deposit_10k: 0, monthly_rent_10k: 0 },
    { deposit_10k: 10000, monthly_rent_10k: 40 },
    { deposit_10k: 20000, monthly_rent_10k: null },
  ], 'rent'), {
    median_deposit_10k: 10000,
    min_deposit_10k: 0,
    max_deposit_10k: 20000,
    monthly_rent_avg_10k: 20,
  });
  assert.equal(summarizeTransactions([], 'trade').median_price_10k, null);
  assert.equal(summarizeTransactions([], 'rent').monthly_rent_avg_10k, null);
});

test('예산 범위는 억 원을 원본 만 원 단위로 변환해 양쪽 경계를 포함한다', () => {
  const items = [
    { price_10k: 49999, deposit_10k: 0 },
    { price_10k: 50000, deposit_10k: 12000 },
    { price_10k: 150000, deposit_10k: 50000 },
    { price_10k: 150001, deposit_10k: 70000 },
    { price_10k: null, deposit_10k: null },
  ];
  const budget = getPriceFilter('5', '15');
  assert.deepEqual(budget, { min10k: 50000, max10k: 150000, label: '5~15억 원' });
  assert.deepEqual(filterByPrice(items, budget, 'trade').map((item) => item.price_10k),
    [50000, 150000]);
  assert.deepEqual(filterByPrice(items, getPriceFilter('', '1.2'), 'rent')
    .map((item) => item.deposit_10k), [0, 12000]);
  assert.equal(getPriceFilter(), null);
  assert.equal(filterByPrice(items, null, 'trade'), items);
  assert.throws(() => getPriceFilter('5.123', ''), /소수 둘째/);
  assert.throws(() => getPriceFilter('-1', ''), /0 이상/);
  assert.throws(() => getPriceFilter('15', '5'), /최대 가격/);
});

test('면적 단위와 매매 평당가를 환산하며 면적 미제공을 구분한다', () => {
  assert.equal(formatAreaUnit(84.43, 'pyeong'), '25.54평');
  assert.equal(formatAreaUnit(84.43, 'm2'), '84.43㎡');
  assert.equal(formatAreaUnit(null, 'pyeong'), '-');
  assert.equal(formatPricePerPyeong(10000, 400 / 121), '1억 원/평');
  assert.equal(formatPricePerPyeong(343000, 84.43), '1억 3,430만 원/평');
  assert.equal(formatPricePerPyeong(null, 84), '-');
  assert.equal(formatPricePerPyeong(10000, 0), '-');
});

test('단지 거래 추이는 이름·동·유사 면적만 묶고 연도가 바뀌어도 월을 계산한다', () => {
  const reference = { name: '은마', district: '대치동', area_m2: 84.43 };
  const deals = [
    { name: '은마', district: '대치동', area_m2: 84.43 },
    { name: ' 은마 ', district: '대치동', area_m2: 85.43 },
    { name: '은마', district: '대치동', area_m2: 85.5 },
    { name: '은마', district: '도곡동', area_m2: 84.43 },
    { name: '다른 단지', district: '대치동', area_m2: 84.43 },
    { name: '은마', district: '대치동', area_m2: null },
  ];
  assert.deepEqual(matchingUnitTransactions(deals, reference), deals.slice(0, 2));
  assert.deepEqual(matchingUnitTransactions(deals, { ...reference, name: '' }), []);
  assert.equal(shiftMonth('202601', -1), '202512');
  assert.equal(shiftMonth('202610', -5), '202605');
  assert.throws(() => shiftMonth('202613', -1), /올바른 거래년월/);
});

test('같은 아파트라도 거래 가격·층이 다르면 각각 비교하고 선택한 거래만 해제한다', () => {
  const compared = new Set();
  const building = { name: '성원대치2단지아파트', district: '개포동', area_m2: 49.86 };
  const highFloor = { ...building, floor: 9, price_10k: 205000 };
  const lowFloor = { ...building, floor: 1, price_10k: 140000 };
  const samePriceOtherFloor = { ...building, floor: 2, price_10k: 140000 };
  const fourth = { name: '다른 아파트', district: '개포동', price_10k: 150000 };

  assert.equal(toggleComparedTransaction(compared, highFloor), true);
  assert.equal(toggleComparedTransaction(compared, lowFloor), true);
  assert.equal(toggleComparedTransaction(compared, samePriceOtherFloor), true);
  assert.deepEqual([...compared], [highFloor, lowFloor, samePriceOtherFloor]);
  assert.equal(toggleComparedTransaction(compared, fourth), false);
  assert.equal(toggleComparedTransaction(compared, lowFloor), true);
  assert.deepEqual([...compared], [highFloor, samePriceOtherFloor]);
  assert.equal(toggleComparedTransaction(compared, fourth), true);
  assert.deepEqual([...compared], [highFloor, samePriceOtherFloor, fourth]);
});
