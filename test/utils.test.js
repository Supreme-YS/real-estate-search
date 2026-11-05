import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currentKoreanMonth,
  formatArea,
  formatDate,
  formatKrw10k,
  formatMonth,
  previousKoreanMonth,
} from '../public/utils.js';

test('만원 단위 원본 금액을 정확한 원화 표기로 바꾼다', () => {
  assert.equal(formatKrw10k(245000), '24억 5,000만 원');
  assert.equal(formatKrw10k(10000), '1억 원');
  assert.equal(formatKrw10k(9500), '9,500만 원');
  assert.equal(formatKrw10k(72.5), '72.5만 원');
  assert.equal(formatKrw10k(0), '0원');
  assert.equal(formatKrw10k(null), '-');
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
