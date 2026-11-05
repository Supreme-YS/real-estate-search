import {
  currentKoreanMonth,
  formatArea,
  formatDate,
  formatKrw10k,
  formatMonth,
  formatNumber,
  previousKoreanMonth,
} from './utils.js';

const PAGE_SIZE = 12;
const ASSET_NAMES = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '연립·다세대',
  'single-house': '단독·다가구',
  commercial: '상업·업무용',
};

const elements = {
  form: document.querySelector('#search-form'),
  regionField: document.querySelector('#region-field'),
  regionInput: document.querySelector('#region-input'),
  regionOptions: document.querySelector('#region-options'),
  assetSelect: document.querySelector('#asset-select'),
  monthInput: document.querySelector('#month-input'),
  dealButtons: [...document.querySelectorAll('.deal-option')],
  dealHint: document.querySelector('#deal-hint'),
  searchButton: document.querySelector('#search-button'),
  searchButtonLabel: document.querySelector('#search-button-label'),
  formError: document.querySelector('#form-error'),
  quickRegions: [...document.querySelectorAll('.quick-regions button')],
  resultsTitle: document.querySelector('#results-title'),
  resultsDescription: document.querySelector('#results-description'),
  feedback: document.querySelector('#feedback'),
  resultsContent: document.querySelector('#results-content'),
  statsGrid: document.querySelector('#stats-grid'),
  listCount: document.querySelector('#list-count'),
  buildingFilter: document.querySelector('#building-filter'),
  sortSelect: document.querySelector('#sort-select'),
  limitNotice: document.querySelector('#limit-notice'),
  priceHeading: document.querySelector('#price-heading'),
  tableWrap: document.querySelector('#table-wrap'),
  rows: document.querySelector('#transaction-rows'),
  emptyState: document.querySelector('#empty-state'),
  pagination: document.querySelector('#pagination'),
  pageSummary: document.querySelector('#page-summary'),
  pageNumber: document.querySelector('#page-number'),
  previousPage: document.querySelector('#previous-page'),
  nextPage: document.querySelector('#next-page'),
};

const state = {
  dealType: 'trade',
  selectedRegion: null,
  suggestions: [],
  activeSuggestion: -1,
  suggestionTimer: null,
  suggestionController: null,
  searchController: null,
  requestId: 0,
  items: [],
  summary: {},
  resultDealType: 'trade',
  resultAssetType: 'apartment',
  page: 1,
  hasResults: false,
};

function setFormError(message = '') {
  elements.formError.textContent = message;
  elements.formError.hidden = !message;
}

function setSearching(searching) {
  elements.searchButton.disabled = searching;
  elements.searchButtonLabel.textContent = searching ? '조회 중...' : '실거래가 조회';
}

function hideSuggestions() {
  elements.regionOptions.hidden = true;
  elements.regionInput.setAttribute('aria-expanded', 'false');
  elements.regionInput.removeAttribute('aria-activedescendant');
  state.activeSuggestion = -1;
}

function stopSuggestionRequest() {
  clearTimeout(state.suggestionTimer);
  state.suggestionController?.abort();
  state.suggestionController = null;
}

function selectRegion(region) {
  state.selectedRegion = region;
  elements.regionInput.value = region.name;
  state.suggestions = [];
  hideSuggestions();
  elements.regionOptions.replaceChildren();
  setFormError();
}

function highlightSuggestion(index) {
  if (!state.suggestions.length) return;
  state.activeSuggestion = (index + state.suggestions.length) % state.suggestions.length;

  for (const [position, option] of [...elements.regionOptions.querySelectorAll('.region-option')].entries()) {
    const active = position === state.activeSuggestion;
    option.classList.toggle('is-highlighted', active);
    option.setAttribute('aria-selected', String(active));
    if (active) option.scrollIntoView({ block: 'nearest' });
  }
  elements.regionInput.setAttribute('aria-activedescendant', `region-option-${state.activeSuggestion}`);
}

function renderSuggestions(regions, message = '해당 지역을 찾지 못했어요.') {
  state.suggestions = regions;
  state.activeSuggestion = -1;
  elements.regionOptions.replaceChildren();

  if (!regions.length) {
    const empty = document.createElement('div');
    empty.className = 'region-message';
    empty.textContent = message;
    elements.regionOptions.append(empty);
  } else {
    for (const [index, region] of regions.entries()) {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `region-option-${index}`;
      option.className = 'region-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = region.name;
      option.addEventListener('click', () => selectRegion(region));
      elements.regionOptions.append(option);
    }
  }

  elements.regionOptions.hidden = false;
  elements.regionInput.setAttribute('aria-expanded', 'true');
}

async function requestJson(url, signal) {
  const response = await fetch(url, { signal });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('서버의 응답을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : '조회에 실패했습니다.');
  }
  return data;
}

async function searchRegions(query, signal) {
  const params = new URLSearchParams({ q: query });
  const data = await requestJson(`/api/regions?${params}`, signal);
  if (!Array.isArray(data?.results)) throw new Error('지역 검색 결과를 읽을 수 없습니다.');
  return data.results.filter((item) =>
    item && /^\d{5}$/.test(item.lawd_cd) && typeof item.name === 'string');
}

function scheduleSuggestions() {
  stopSuggestionRequest();
  state.selectedRegion = null;
  setFormError();
  const query = elements.regionInput.value.trim();

  if (query.length < 2) {
    state.suggestions = [];
    hideSuggestions();
    return;
  }

  state.suggestionTimer = setTimeout(async () => {
    const controller = new AbortController();
    state.suggestionController = controller;
    try {
      const regions = await searchRegions(query, controller.signal);
      if (!controller.signal.aborted && elements.regionInput.value.trim() === query) {
        renderSuggestions(regions);
      }
    } catch (error) {
      if (!controller.signal.aborted && elements.regionInput.value.trim() === query) {
        renderSuggestions([], error.message);
      }
    }
  }, 300);
}

function setDealType(type) {
  if (type === 'rent' && elements.assetSelect.value === 'commercial') return;
  state.dealType = type;
  for (const button of elements.dealButtons) {
    const selected = button.dataset.deal === type;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function updateAssetAvailability() {
  const commercial = elements.assetSelect.value === 'commercial';
  const rentButton = elements.dealButtons.find((button) => button.dataset.deal === 'rent');
  rentButton.disabled = commercial;
  elements.dealHint.hidden = !commercial;
  if (commercial) setDealType('trade');
}

function showLoading() {
  elements.resultsContent.hidden = true;
  elements.feedback.hidden = false;
  elements.feedback.replaceChildren();

  const spinner = document.createElement('span');
  spinner.className = 'loading-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const title = document.createElement('strong');
  title.textContent = '실거래 내역을 불러오고 있어요';
  const detail = document.createElement('p');
  detail.textContent = '국토교통부 신고 자료를 확인하는 중입니다.';
  elements.feedback.append(spinner, title, detail);
}

function showFeedback(titleText, detailText, retry = false) {
  elements.resultsContent.hidden = true;
  elements.feedback.hidden = false;
  elements.feedback.replaceChildren();

  const icon = document.createElement('span');
  icon.className = 'feedback-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '!';
  const title = document.createElement('strong');
  title.textContent = titleText;
  const detail = document.createElement('p');
  detail.textContent = detailText;
  elements.feedback.append(icon, title, detail);

  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'retry-button';
    button.textContent = '다시 조회하기';
    button.addEventListener('click', () => performSearch());
    elements.feedback.append(button);
  }
}

async function resolveRegion(query, signal, expectedName) {
  if (state.selectedRegion?.name === query) return state.selectedRegion;

  const matches = await searchRegions(query, signal);
  const region = matches.find((item) => item.name === expectedName)
    ?? matches.find((item) => item.name === query)
    ?? (matches.length === 1 ? matches[0] : null);

  if (region) {
    selectRegion(region);
    return region;
  }

  const message = matches.length
    ? '검색 결과가 여러 개예요. 목록에서 시·군·구를 선택해 주세요.'
    : '해당 지역을 찾지 못했어요. 다른 시·군·구 이름을 입력해 주세요.';
  setFormError(message);
  renderSuggestions(matches);
  elements.regionInput.focus();
  if (!state.hasResults) showFeedback('지역을 선택해 주세요', message);
  return null;
}

async function performSearch(expectedName) {
  state.searchController?.abort();
  stopSuggestionRequest();
  hideSuggestions();
  const requestId = ++state.requestId;
  const controller = new AbortController();
  state.searchController = controller;
  const query = elements.regionInput.value.trim();
  const monthValue = elements.monthInput.value;

  setFormError();
  setSearching(false);
  if (query.length < 2) {
    setFormError('시·군·구 이름을 두 글자 이상 입력해 주세요.');
    elements.regionInput.focus();
    return;
  }
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(monthValue)
      || monthValue > currentKoreanMonth()) {
    setFormError('현재 또는 이전 거래년월을 선택해 주세요.');
    elements.monthInput.focus();
    return;
  }

  setSearching(true);
  try {
    const region = await resolveRegion(query, controller.signal, expectedName);
    if (!region || controller.signal.aborted) return;

    const asset = elements.assetSelect.value;
    const deal = state.dealType;
    const month = monthValue.replace('-', '');
    elements.resultsTitle.textContent = `${region.name} 실거래가`;
    elements.resultsDescription.textContent = `${ASSET_NAMES[asset]} · ${deal === 'trade' ? '매매' : '전월세'} · ${formatMonth(month)}`;
    showLoading();

    const params = new URLSearchParams({
      asset_type: asset,
      deal_type: deal,
      lawd_cd: region.lawd_cd,
      deal_ymd: month,
    });
    const data = await requestJson(`/api/transactions?${params}`, controller.signal);
    if (!Array.isArray(data?.items)
        || data.items.some((item) => !item || typeof item !== 'object')) {
      throw new Error('거래 목록을 읽을 수 없습니다.');
    }
    if (controller.signal.aborted || requestId !== state.requestId) return;

    state.items = data.items;
    state.summary = data.summary && typeof data.summary === 'object' ? data.summary : {};
    state.resultDealType = deal;
    state.resultAssetType = asset;
    state.page = 1;
    state.hasResults = true;
    elements.buildingFilter.value = '';
    elements.sortSelect.value = 'latest';
    elements.priceHeading.textContent = deal === 'trade' ? '거래 금액' : '보증금 / 월세';

    renderStats();
    renderRows();
    elements.feedback.hidden = true;
    elements.resultsContent.hidden = false;
  } catch (error) {
    if (controller.signal.aborted || requestId !== state.requestId) return;
    showFeedback('실거래 내역을 불러오지 못했어요', error.message, true);
  } finally {
    if (requestId === state.requestId) setSearching(false);
  }
}

function addStat(label, value, detail) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const labelElement = document.createElement('p');
  labelElement.className = 'stat-label';
  labelElement.textContent = label;
  const valueElement = document.createElement('p');
  valueElement.className = 'stat-value';
  valueElement.textContent = value;
  const detailElement = document.createElement('p');
  detailElement.className = 'stat-subtext';
  detailElement.textContent = detail;
  card.append(labelElement, valueElement, detailElement);
  elements.statsGrid.append(card);
}

function renderStats() {
  const summary = state.summary;
  elements.statsGrid.replaceChildren();
  addStat('조회된 거래', `${formatNumber(state.items.length)}건`, '취소 거래 제외 · 조회 목록 기준');

  if (state.resultDealType === 'trade') {
    addStat('중위 거래금액', formatKrw10k(summary.median_price_10k), '조회된 거래의 중간 가격');
    addStat('최저 거래금액', formatKrw10k(summary.min_price_10k), '조회된 거래 기준');
    addStat('최고 거래금액', formatKrw10k(summary.max_price_10k), '조회된 거래 기준');
  } else {
    addStat('중위 보증금', formatKrw10k(summary.median_deposit_10k),
      `최저 ${formatKrw10k(summary.min_deposit_10k)}`);
    addStat('평균 월세', formatKrw10k(summary.monthly_rent_avg_10k), '조회된 거래 전체 기준');
    addStat('최고 보증금', formatKrw10k(summary.max_deposit_10k), '조회된 거래 기준');
  }

  elements.limitNotice.hidden = state.items.length < 1000;
  elements.limitNotice.textContent = state.items.length >= 1000
    ? '한 번에 최대 1,000건까지 불러옵니다. 아래 통계·검색은 표시된 거래만 기준으로 하며, 전체 내역은 공식 자료에서 확인해 주세요.'
    : '';
}

function createCell(row, label, text) {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function buildingTitle(item) {
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  if (name) return name;

  const type = item.houseType ? `${item.houseType}주택` : ASSET_NAMES[state.resultAssetType];
  return [item.district, type].filter(Boolean).join(' ') || '건물명 미제공';
}

function renderTransaction(item) {
  const row = document.createElement('tr');
  const building = createCell(row, '건물 / 위치', '');
  const name = document.createElement('div');
  name.className = 'building-name';
  name.textContent = buildingTitle(item);
  const hasBuildingName = typeof item.name === 'string' && item.name.trim().length > 0;
  const details = hasBuildingName
    ? [item.district, item.houseType || item.buildingUse,
      item.build_year ? `${item.build_year}년 준공` : null]
    : ['건물명 미제공', item.buildingUse, item.build_year ? `${item.build_year}년 준공` : null];
  const location = document.createElement('span');
  location.className = 'building-detail';
  location.textContent = details.filter(Boolean).join(' · ');
  building.append(name, location);

  createCell(row, '면적', formatArea(item.area_m2));
  let floor = '-';
  if (item.floor !== null && item.floor !== undefined && item.floor !== '') {
    const floorNumber = Number(item.floor);
    floor = Number.isFinite(floorNumber) && floorNumber !== 0
      ? floorNumber < 0 ? `지하 ${Math.abs(floorNumber)}층` : `${floorNumber}층`
      : '-';
  }
  createCell(row, '층', floor);

  const amountCell = createCell(row, state.resultDealType === 'trade' ? '거래 금액' : '보증금 / 월세', '');
  const amount = document.createElement('span');
  amount.className = 'amount-primary';
  amount.textContent = formatKrw10k(
    state.resultDealType === 'trade' ? item.price_10k : item.deposit_10k,
  );
  const amountContent = document.createElement('div');
  amountContent.className = 'amount-content';
  amountContent.append(amount);
  amountCell.append(amountContent);

  if (state.resultDealType === 'rent') {
    const additional = document.createElement('span');
    additional.className = 'amount-secondary';
    const monthly = item.monthly_rent_10k;
    const rentLabel = monthly === null || monthly === undefined
      ? '월세 정보 없음'
      : Number(monthly) === 0 ? '전세 · 월세 없음' : `월세 ${formatKrw10k(monthly)}`;
    additional.textContent = [rentLabel, item.contract_type].filter(Boolean).join(' · ');
    amountContent.append(additional);
  } else if (item.deal_type) {
    const additional = document.createElement('span');
    additional.className = 'amount-secondary';
    additional.textContent = item.deal_type;
    amountContent.append(additional);
  }

  createCell(row, '계약일', formatDate(item.deal_date));
  return row;
}

function renderEmpty(filteredOut) {
  elements.emptyState.replaceChildren();
  const symbol = document.createElement('span');
  symbol.className = 'empty-symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = '⌕';
  const title = document.createElement('strong');
  title.textContent = filteredOut ? '검색 결과가 없어요' : '이 기간에는 거래 내역이 없어요';
  const detail = document.createElement('span');
  detail.textContent = filteredOut
    ? '다른 건물명이나 동 이름으로 검색해 보세요.'
    : '지역이나 거래년월을 바꿔 다시 조회해 보세요.';
  elements.emptyState.append(symbol, title, detail);
}

function renderRows() {
  const filter = elements.buildingFilter.value.trim().toLocaleLowerCase('ko');
  const matches = state.items.filter((item) =>
    `${buildingTitle(item)} ${item.district ?? ''} ${item.buildingUse ?? ''}`
      .toLocaleLowerCase('ko').includes(filter));
  const sort = elements.sortSelect.value;

  matches.sort((a, b) => {
    if (sort === 'latest') {
      return String(b.deal_date ?? '').localeCompare(String(a.deal_date ?? ''));
    }
    const priceKey = state.resultDealType === 'trade' ? 'price_10k' : 'deposit_10k';
    const left = Number(a[priceKey]);
    const right = Number(b[priceKey]);
    const difference = (Number.isFinite(right) ? right : -1)
      - (Number.isFinite(left) ? left : -1);
    return (sort === 'price-desc' ? difference : -difference)
      || String(b.deal_date ?? '').localeCompare(String(a.deal_date ?? ''));
  });

  const pageCount = Math.ceil(matches.length / PAGE_SIZE);
  state.page = Math.min(state.page, Math.max(1, pageCount));
  const start = (state.page - 1) * PAGE_SIZE;
  const visible = matches.slice(start, start + PAGE_SIZE);
  const fragment = document.createDocumentFragment();
  for (const item of visible) fragment.append(renderTransaction(item));
  elements.rows.replaceChildren(fragment);

  elements.listCount.textContent = filter
    ? `조회된 ${formatNumber(state.items.length)}건 중 검색 결과 ${formatNumber(matches.length)}건`
    : `조회된 거래 ${formatNumber(state.items.length)}건`;

  elements.tableWrap.hidden = matches.length === 0;
  elements.emptyState.hidden = matches.length !== 0;
  if (!matches.length) renderEmpty(Boolean(filter && state.items.length));

  elements.pagination.hidden = pageCount <= 1;
  if (pageCount > 1) {
    elements.pageSummary.textContent =
      `${formatNumber(start + 1)}–${formatNumber(Math.min(start + PAGE_SIZE, matches.length))} / ${formatNumber(matches.length)}건`;
    elements.pageNumber.textContent = `${state.page} / ${pageCount}`;
    elements.previousPage.disabled = state.page === 1;
    elements.nextPage.disabled = state.page === pageCount;
  }
}

elements.regionInput.addEventListener('input', scheduleSuggestions);
elements.regionInput.addEventListener('focus', () => {
  if (state.suggestions.length && !state.selectedRegion) {
    elements.regionOptions.hidden = false;
    elements.regionInput.setAttribute('aria-expanded', 'true');
  }
});
elements.regionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideSuggestions();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!state.suggestions.length) return;
    event.preventDefault();
    if (elements.regionOptions.hidden) {
      elements.regionOptions.hidden = false;
      elements.regionInput.setAttribute('aria-expanded', 'true');
    }
    highlightSuggestion(state.activeSuggestion + (event.key === 'ArrowDown' ? 1 : -1));
  } else if (event.key === 'Enter' && !elements.regionOptions.hidden
      && state.activeSuggestion >= 0) {
    event.preventDefault();
    selectRegion(state.suggestions[state.activeSuggestion]);
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!elements.regionField.contains(event.target)) hideSuggestions();
});

for (const button of elements.dealButtons) {
  button.addEventListener('click', () => setDealType(button.dataset.deal));
}
elements.assetSelect.addEventListener('change', updateAssetAvailability);
elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  performSearch();
});
for (const button of elements.quickRegions) {
  button.addEventListener('click', () => {
    elements.regionInput.value = button.dataset.regionQuery;
    state.selectedRegion = null;
    performSearch(button.dataset.regionName);
  });
}
elements.buildingFilter.addEventListener('input', () => {
  state.page = 1;
  renderRows();
});
elements.sortSelect.addEventListener('change', () => {
  state.page = 1;
  renderRows();
});
elements.previousPage.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    renderRows();
  }
});
elements.nextPage.addEventListener('click', () => {
  state.page += 1;
  renderRows();
});

elements.monthInput.max = currentKoreanMonth();
elements.monthInput.value = previousKoreanMonth();
updateAssetAvailability();
performSearch();
