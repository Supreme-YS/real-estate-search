import {
  currentKoreanMonth,
  filterByArea,
  filterByPrice,
  formatAreaUnit,
  formatDate,
  formatKrw10k,
  formatMonth,
  formatNumber,
  formatPricePerPyeong,
  getAreaFilter,
  getPriceFilter,
  matchingUnitTransactions,
  previousKoreanMonth,
  shiftMonth,
  summarizeTransactions,
  toggleComparedTransaction,
} from './utils.js';

const PAGE_SIZE = 12;
const CACHE_TTL_MS = 5 * 60 * 1000;
const transactionCache = new Map();
const pendingDetails = new Map();
const ASSET_NAMES = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '연립·다세대',
  'single-house': '단독·다가구',
  commercial: '상업·업무용',
};

const elements = {
  form: document.querySelector('#search-form'),
  searchCard: document.querySelector('#search-card'),
  searchToggle: document.querySelector('#search-toggle'),
  searchToggleLabel: document.querySelector('#search-toggle-label'),
  searchSummary: document.querySelector('#search-summary'),
  headerSearchButton: document.querySelector('#header-search-button'),
  regionField: document.querySelector('#region-field'),
  regionInput: document.querySelector('#region-input'),
  regionOptions: document.querySelector('#region-options'),
  assetSelect: document.querySelector('#asset-select'),
  monthInput: document.querySelector('#month-input'),
  areaSelect: document.querySelector('#area-select'),
  customAreaFields: document.querySelector('#custom-area-fields'),
  areaMin: document.querySelector('#area-min'),
  areaMax: document.querySelector('#area-max'),
  priceMin: document.querySelector('#price-min'),
  priceMax: document.querySelector('#price-max'),
  budgetHint: document.querySelector('#budget-hint'),
  dealButtons: [...document.querySelectorAll('.deal-option')],
  dealHint: document.querySelector('#deal-hint'),
  searchButton: document.querySelector('#search-button'),
  searchButtonLabel: document.querySelector('#search-button-label'),
  formError: document.querySelector('#form-error'),
  quickRegions: [...document.querySelectorAll('.quick-regions button')],
  resultsTitle: document.querySelector('#results-title'),
  resultsSection: document.querySelector('#results'),
  resultsDescription: document.querySelector('#results-description'),
  resultTools: document.querySelector('#result-tools'),
  unitButtons: [...document.querySelectorAll('.unit-option')],
  shareButton: document.querySelector('#share-button'),
  sharePanel: document.querySelector('#share-panel'),
  shareUrl: document.querySelector('#share-url'),
  copyLink: document.querySelector('#copy-link'),
  shareStatus: document.querySelector('#share-status'),
  feedback: document.querySelector('#feedback'),
  resultsContent: document.querySelector('#results-content'),
  statsGrid: document.querySelector('#stats-grid'),
  dealOverview: document.querySelector('#deal-overview'),
  dealOverviewButton: document.querySelector('#deal-overview-button'),
  dealOverviewContent: document.querySelector('#deal-overview-content'),
  listCount: document.querySelector('#list-count'),
  buildingFilter: document.querySelector('#building-filter'),
  sortSelect: document.querySelector('#sort-select'),
  limitNotice: document.querySelector('#limit-notice'),
  priceHeading: document.querySelector('#price-heading'),
  areaHeading: document.querySelector('#area-heading'),
  listCard: document.querySelector('.list-card'),
  tableWrap: document.querySelector('#table-wrap'),
  rows: document.querySelector('#transaction-rows'),
  emptyState: document.querySelector('#empty-state'),
  pagination: document.querySelector('#pagination'),
  pageSummary: document.querySelector('#page-summary'),
  pageNumber: document.querySelector('#page-number'),
  previousPage: document.querySelector('#previous-page'),
  nextPage: document.querySelector('#next-page'),
  compareToolbar: document.querySelector('#compare-toolbar'),
  compareHint: document.querySelector('#compare-hint'),
  compareJump: document.querySelector('#compare-jump'),
  compareSection: document.querySelector('#compare-section'),
  compareGrid: document.querySelector('#compare-grid'),
  compareClear: document.querySelector('#compare-clear'),
  insightsSection: document.querySelector('#insights-section'),
  insightsSubtitle: document.querySelector('#insights-subtitle'),
  insightsClose: document.querySelector('#insights-close'),
  trendCaption: document.querySelector('#trend-caption'),
  trendContent: document.querySelector('#trend-content'),
  dealPairContent: document.querySelector('#deal-pair-content'),
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
  filteredItems: [],
  areaFilter: null,
  priceFilter: null,
  summary: {},
  resultDealType: 'trade',
  resultAssetType: 'apartment',
  resultRegion: null,
  resultMonth: '',
  appliedSearch: null,
  unit: 'm2',
  compared: new Set(),
  detailRequestId: 0,
  detailTarget: null,
  trendSeries: null,
  pairItems: null,
  overviewData: null,
  overviewRequestId: 0,
  page: 1,
  hasResults: false,
};

const mobileSearch = window.matchMedia('(max-width: 620px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function setSearchCollapsed(collapsed) {
  const shouldCollapse = mobileSearch.matches && collapsed;
  elements.form.hidden = shouldCollapse;
  elements.searchSummary.hidden = !shouldCollapse;
  elements.searchCard.classList.toggle('is-collapsed', shouldCollapse);
  elements.searchToggle.setAttribute('aria-expanded', String(!shouldCollapse));
  elements.searchToggleLabel.textContent = shouldCollapse ? '조건 수정' : '접기';
}

function syncMobileSearch() {
  const showControls = mobileSearch.matches && state.hasResults;
  elements.searchToggle.hidden = !showControls;
  elements.headerSearchButton.hidden = !showControls;
  setSearchCollapsed(showControls);
}

function scrollToSection(section) {
  requestAnimationFrame(() => {
    section.scrollIntoView({
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
      block: 'start',
    });
  });
}

function setFormError(message = '') {
  elements.formError.textContent = message;
  elements.formError.hidden = !message;
}

function setSearching(searching) {
  elements.searchButton.disabled = searching;
  elements.searchButtonLabel.textContent = searching ? '찾아보는 중...' : '실거래 살펴보기';
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

function transactionKey(asset, deal, code, month) {
  return `${asset}/${deal}/${code}/${month}`;
}

async function getTransactions(asset, deal, code, month, { signal, fresh = false } = {}) {
  const key = transactionKey(asset, deal, code, month);
  const cached = transactionCache.get(key);
  if (!fresh && cached && cached.expires > Date.now()) return cached.data;
  if (!fresh && pendingDetails.has(key)) return pendingDetails.get(key);

  const params = new URLSearchParams({
    asset_type: asset,
    deal_type: deal,
    lawd_cd: code,
    deal_ymd: month,
  });
  const request = requestJson(`/api/transactions?${params}`, signal).then((data) => {
    if (!Array.isArray(data?.items)
        || data.items.some((item) => !item || typeof item !== 'object')) {
      throw new Error('거래 목록을 읽을 수 없습니다.');
    }
    transactionCache.delete(key);
    transactionCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
    if (transactionCache.size > 35) transactionCache.delete(transactionCache.keys().next().value);
    return data;
  }).finally(() => {
    if (pendingDetails.get(key) === request) pendingDetails.delete(key);
  });

  if (!fresh) pendingDetails.set(key, request);
  return request;
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
  elements.budgetHint.textContent = type === 'trade'
    ? '매매 금액 기준 · 억 원 (비워두면 전체)'
    : '보증금 기준 · 억 원 (월세는 포함하지 않아요)';
}

function updateAssetAvailability() {
  const commercial = elements.assetSelect.value === 'commercial';
  const rentButton = elements.dealButtons.find((button) => button.dataset.deal === 'rent');
  rentButton.disabled = commercial;
  elements.dealHint.hidden = !commercial;
  if (commercial) setDealType('trade');
  else setDealType(state.dealType);
}

function updateAreaInputs() {
  elements.customAreaFields.hidden = elements.areaSelect.value !== 'custom';
}

function setUnit(unit) {
  state.unit = unit === 'pyeong' ? 'pyeong' : 'm2';
  for (const button of elements.unitButtons) {
    const selected = button.dataset.unit === state.unit;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  elements.areaHeading.textContent = state.unit === 'pyeong' ? '면적 (평)' : '면적 (㎡)';
  if (state.hasResults) {
    renderRows();
    renderComparePanel();
    renderInsights();
    if (!elements.sharePanel.hidden) elements.shareUrl.value = createShareUrl();
  }
}

function showLoading() {
  elements.resultsContent.hidden = true;
  elements.resultTools.hidden = true;
  elements.sharePanel.hidden = true;
  elements.shareButton.setAttribute('aria-expanded', 'false');
  elements.feedback.hidden = false;
  elements.feedback.replaceChildren();

  const spinner = document.createElement('span');
  spinner.className = 'loading-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const title = document.createElement('strong');
  title.textContent = '실거래 내역을 불러오고 있어요';
  const detail = document.createElement('p');
  detail.textContent = '동네의 거래 내역을 확인하고 있어요.';
  elements.feedback.append(spinner, title, detail);
}

function showFeedback(titleText, detailText, retry = false) {
  elements.resultsContent.hidden = true;
  elements.resultTools.hidden = true;
  elements.sharePanel.hidden = true;
  elements.shareButton.setAttribute('aria-expanded', 'false');
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
  setSearchCollapsed(false);
  setFormError(message);
  renderSuggestions(matches);
  elements.regionInput.focus();
  if (!state.hasResults) showFeedback('지역을 선택해 주세요', message);
  return null;
}

async function performSearch(expectedName, scrollAfterSearch = false) {
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

  let areaFilter;
  try {
    if (elements.areaSelect.value === 'custom'
        && (elements.areaMin.validity.badInput || elements.areaMax.validity.badInput)) {
      throw new RangeError('면적을 숫자로 입력해 주세요.');
    }
    areaFilter = getAreaFilter(
      elements.areaSelect.value,
      elements.areaMin.value,
      elements.areaMax.value,
    );
  } catch (error) {
    setFormError(error.message);
    if (elements.areaSelect.value === 'custom') {
      (elements.areaMin.value ? elements.areaMax : elements.areaMin).focus();
    } else {
      elements.areaSelect.focus();
    }
    return;
  }

  let priceFilter;
  try {
    if (elements.priceMin.validity.badInput || elements.priceMax.validity.badInput) {
      throw new RangeError('가격을 숫자로 입력해 주세요.');
    }
    priceFilter = getPriceFilter(elements.priceMin.value, elements.priceMax.value);
  } catch (error) {
    setFormError(error.message);
    (elements.priceMin.value ? elements.priceMax : elements.priceMin).focus();
    return;
  }

  const searchOptions = {
    asset: elements.assetSelect.value,
    deal: state.dealType,
    month: monthValue,
    area: elements.areaSelect.value,
    areaMin: elements.areaSelect.value === 'custom' ? elements.areaMin.value : '',
    areaMax: elements.areaSelect.value === 'custom' ? elements.areaMax.value : '',
    priceMin: elements.priceMin.value,
    priceMax: elements.priceMax.value,
  };
  setSearching(true);
  try {
    const region = await resolveRegion(query, controller.signal, expectedName);
    if (!region || controller.signal.aborted) return;

    const { asset, deal } = searchOptions;
    const month = monthValue.replace('-', '');
    const description = [
      ASSET_NAMES[asset],
      deal === 'trade' ? '매매' : '전월세',
      formatMonth(month),
      areaFilter?.label,
      priceFilter?.label,
    ].filter(Boolean).join(' · ');
    elements.resultsTitle.textContent = `${region.name}의 실거래가`;
    elements.resultsDescription.textContent = description;
    state.detailRequestId += 1;
    elements.insightsSection.hidden = true;
    showLoading();

    const data = await getTransactions(asset, deal, region.lawd_cd, month, {
      signal: controller.signal,
      fresh: true,
    });
    if (controller.signal.aborted || requestId !== state.requestId) return;

    state.items = data.items;
    state.areaFilter = areaFilter;
    state.priceFilter = priceFilter;
    state.filteredItems = filterByPrice(filterByArea(state.items, areaFilter), priceFilter, deal);
    state.summary = data.summary && typeof data.summary === 'object' ? data.summary : {};
    state.resultDealType = deal;
    state.resultAssetType = asset;
    state.resultRegion = region;
    state.resultMonth = month;
    state.appliedSearch = { ...searchOptions, region: region.name };
    state.compared.clear();
    state.detailTarget = null;
    state.trendSeries = null;
    state.pairItems = null;
    state.overviewData = null;
    state.overviewRequestId += 1;
    elements.dealOverview.hidden = asset === 'commercial';
    elements.dealOverviewContent.hidden = true;
    elements.dealOverviewButton.setAttribute('aria-expanded', 'false');
    elements.dealOverviewButton.textContent = '나란히 보기';
    state.page = 1;
    state.hasResults = true;
    elements.searchSummary.textContent = `${region.name} · ${description}`;
    syncMobileSearch();
    elements.buildingFilter.value = '';
    elements.sortSelect.value = 'latest';
    elements.priceHeading.textContent = deal === 'trade' ? '거래 금액' : '보증금 / 월세';

    renderStats();
    renderRows();
    renderComparePanel();
    elements.feedback.hidden = true;
    elements.resultsContent.hidden = false;
    elements.resultTools.hidden = false;
    if (scrollAfterSearch && mobileSearch.matches) scrollToSection(elements.resultsSection);
  } catch (error) {
    if (controller.signal.aborted || requestId !== state.requestId) return;
    setSearchCollapsed(false);
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
  const summary = state.areaFilter || state.priceFilter
    ? summarizeTransactions(state.filteredItems, state.resultDealType)
    : state.summary;
  elements.statsGrid.replaceChildren();
  addStat(
    state.areaFilter || state.priceFilter ? '선택한 조건' : '조회된 거래',
    `${formatNumber(state.filteredItems.length)}건`,
    '취소 거래 제외 · 조회 목록 기준',
  );

  if (state.resultDealType === 'trade') {
    addStat('중위 거래금액', formatKrw10k(summary.median_price_10k), '선택한 조건의 중간 가격');
    addStat('최저 거래금액', formatKrw10k(summary.min_price_10k), '선택한 조건 기준');
    addStat('최고 거래금액', formatKrw10k(summary.max_price_10k), '선택한 조건 기준');
  } else {
    addStat('중위 보증금', formatKrw10k(summary.median_deposit_10k),
      `최저 ${formatKrw10k(summary.min_deposit_10k)}`);
    addStat('평균 월세', formatKrw10k(summary.monthly_rent_avg_10k), '선택한 조건 기준');
    addStat('최고 보증금', formatKrw10k(summary.max_deposit_10k), '선택한 조건 기준');
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

function formatFloor(value) {
  if (value === null || value === undefined || value === '') return '-';
  const floor = Number(value);
  if (!Number.isFinite(floor) || floor === 0) return '-';
  return floor < 0 ? `지하 ${Math.abs(floor)}층` : `${floor}층`;
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

  createCell(row, '면적', formatAreaUnit(item.area_m2, state.unit));
  createCell(row, '층', formatFloor(item.floor));

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
  } else {
    const perPyeong = formatPricePerPyeong(item.price_10k, item.area_m2);
    const descriptions = [item.deal_type, perPyeong !== '-' ? perPyeong : null].filter(Boolean);
    if (descriptions.length) {
      const additional = document.createElement('span');
      additional.className = 'amount-secondary';
      additional.textContent = descriptions.join(' · ');
      amountContent.append(additional);
    }
  }

  createCell(row, '계약일', formatDate(item.deal_date));
  const actionCell = createCell(row, '더 보기', '');
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const canCompare = typeof item.name === 'string' && item.name.trim()
    && typeof item.district === 'string' && item.district.trim();
  const area = Number(item.area_m2);
  const detailButton = document.createElement('button');
  detailButton.type = 'button';
  detailButton.textContent = '추이·전월세';
  detailButton.disabled = !canCompare || !Number.isFinite(area) || area <= 0;
  if (detailButton.disabled) detailButton.title = '건물명·동·면적 정보가 있는 거래에서 이용할 수 있어요.';
  detailButton.addEventListener('click', () => openInsights(item));
  const compareButton = document.createElement('button');
  compareButton.type = 'button';
  compareButton.disabled = !canCompare;
  compareButton.title = compareButton.disabled ? '건물명·동 정보가 있는 거래에서 이용할 수 있어요.' : '';
  const selected = canCompare && state.compared.has(item);
  compareButton.textContent = selected ? '비교 해제' : '비교 담기';
  compareButton.classList.toggle('is-selected', Boolean(selected));
  compareButton.setAttribute('aria-pressed', String(Boolean(selected)));
  compareButton.addEventListener('click', () => toggleCompare(item));
  actions.append(detailButton, compareButton);
  actionCell.append(actions);
  return row;
}

function renderEmpty() {
  elements.emptyState.replaceChildren();
  const symbol = document.createElement('span');
  symbol.className = 'empty-symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = '⌕';
  const title = document.createElement('strong');
  const detail = document.createElement('span');
  if (!state.items.length) {
    title.textContent = '이 기간에는 거래 내역이 없어요';
    detail.textContent = '지역이나 거래년월을 바꿔 다시 조회해 보세요.';
  } else if (!state.filteredItems.length) {
    title.textContent = '선택한 조건의 거래가 없어요';
    detail.textContent = '면적·가격 범위를 넓히거나 다른 거래년월을 선택해 보세요.';
  } else {
    title.textContent = '검색 결과가 없어요';
    detail.textContent = '다른 건물명이나 동 이름으로 검색해 보세요.';
  }
  elements.emptyState.append(symbol, title, detail);
}

function renderRows() {
  const filter = elements.buildingFilter.value.trim().toLocaleLowerCase('ko');
  const matches = state.filteredItems.filter((item) =>
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

  const sourceCount = formatNumber(state.items.length);
  const filteredCount = formatNumber(state.filteredItems.length);
  elements.listCount.textContent = filter
    ? `${state.areaFilter || state.priceFilter ? `선택 조건 ${filteredCount}건` : `조회된 ${sourceCount}건`} 중 검색 결과 ${formatNumber(matches.length)}건`
    : state.areaFilter || state.priceFilter
      ? `조회된 ${sourceCount}건 중 조건에 맞는 거래 ${filteredCount}건`
      : `조회된 거래 ${sourceCount}건`;

  elements.tableWrap.hidden = matches.length === 0;
  elements.emptyState.hidden = matches.length !== 0;
  if (!matches.length) renderEmpty();

  elements.pagination.hidden = pageCount <= 1;
  if (pageCount > 1) {
    elements.pageSummary.textContent =
      `${formatNumber(start + 1)}–${formatNumber(Math.min(start + PAGE_SIZE, matches.length))} / ${formatNumber(matches.length)}건`;
    elements.pageNumber.textContent = `${state.page} / ${pageCount}`;
    elements.previousPage.disabled = state.page === 1;
    elements.nextPage.disabled = state.page === pageCount;
  }
}

function toggleCompare(item) {
  if (!toggleComparedTransaction(state.compared, item)) {
    elements.compareHint.textContent = '한 번에 최대 3건의 거래를 비교할 수 있어요.';
    return;
  }
  renderRows();
  renderComparePanel();
}

function compareText(parent, className, text, tag = 'p') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  parent.append(element);
}

function renderComparePanel() {
  const count = state.compared.size;
  elements.compareToolbar.hidden = count === 0;
  elements.compareJump.hidden = count < 2;
  elements.compareSection.hidden = count < 2;
  elements.compareHint.textContent = count === 1
    ? '1건 담았어요. 비교할 거래를 하나 더 골라주세요.'
    : `${count}건을 나란히 비교하고 있어요.`;
  elements.compareGrid.replaceChildren();
  if (count < 2) return;

  for (const item of state.compared.values()) {
    const card = document.createElement('article');
    card.className = 'compare-card';
    compareText(card, '', item.name, 'h4');
    compareText(card, 'card-subtitle',
      [item.district, item.build_year ? `${item.build_year}년 준공` : null]
        .filter(Boolean).join(' · '));
    compareText(card, 'card-amount', formatKrw10k(
      state.resultDealType === 'trade' ? item.price_10k : item.deposit_10k,
    ));
    if (state.resultDealType === 'rent') {
      compareText(card, 'card-detail', item.monthly_rent_10k === null
        || item.monthly_rent_10k === undefined ? '월세 정보 없음'
        : Number(item.monthly_rent_10k) === 0 ? '전세' : `월세 ${formatKrw10k(item.monthly_rent_10k)}`);
    } else {
      const perPyeong = formatPricePerPyeong(item.price_10k, item.area_m2);
      if (perPyeong !== '-') compareText(card, 'card-detail', perPyeong);
    }
    compareText(card, 'card-detail',
      `${formatAreaUnit(item.area_m2, state.unit)} · ${formatFloor(item.floor)} · ${formatDate(item.deal_date)} 계약`);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = '비교에서 빼기';
    remove.setAttribute('aria-label', `${item.name} ${formatFloor(item.floor)} ${
      formatKrw10k(state.resultDealType === 'trade' ? item.price_10k : item.deposit_10k)
    } 비교에서 빼기`);
    remove.addEventListener('click', () => toggleCompare(item));
    card.append(remove);
    elements.compareGrid.append(card);
  }
}

function createShareUrl() {
  const search = state.appliedSearch;
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  for (const key of ['region', 'asset', 'deal', 'month', 'area', 'areaMin', 'areaMax', 'priceMin', 'priceMax']) {
    if (search[key] && !(key === 'area' && search[key] === 'all')) {
      url.searchParams.set(key, search[key]);
    }
  }
  if (state.unit === 'pyeong') url.searchParams.set('unit', 'pyeong');
  return url.href;
}

function restoreSharedSearch() {
  const params = new URLSearchParams(window.location.search);
  const region = params.get('region')?.trim();
  if (!region || region.length < 2 || region.length > 60) return;
  elements.regionInput.value = region;
  const asset = params.get('asset');
  if (Object.prototype.hasOwnProperty.call(ASSET_NAMES, asset)) {
    elements.assetSelect.value = asset;
  }
  const month = params.get('month');
  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) && month <= currentKoreanMonth()) {
    elements.monthInput.value = month;
  }
  const area = params.get('area');
  if ([...elements.areaSelect.options].some((option) => option.value === area)) {
    elements.areaSelect.value = area;
  }
  for (const [key, element] of [
    ['areaMin', elements.areaMin], ['areaMax', elements.areaMax],
    ['priceMin', elements.priceMin], ['priceMax', elements.priceMax],
  ]) {
    const value = params.get(key);
    if (value && /^\d+(?:\.\d{1,2})?$/.test(value)) element.value = value;
  }
  const deal = params.get('deal');
  if (deal === 'rent' || deal === 'trade') setDealType(deal);
  setUnit(params.get('unit'));
}

function makeOverviewCard(label, items, dealType) {
  const card = document.createElement('div');
  card.className = 'pair-card';
  compareText(card, '', `${label} · ${formatNumber(items.length)}건`, 'strong');
  const summary = summarizeTransactions(items, dealType);
  const median = dealType === 'trade'
    ? summary.median_price_10k : summary.median_deposit_10k;
  compareText(card, 'pair-amount', formatKrw10k(median), 'span');
  compareText(card, 'pair-detail',
    dealType === 'trade' ? '중위 거래금액' : '중위 보증금', 'span');
  if (dealType === 'rent') {
    compareText(card, 'pair-detail',
      `평균 월세 ${formatKrw10k(summary.monthly_rent_avg_10k)}`, 'span');
  }
  return card;
}

function renderDealOverview() {
  if (!state.overviewData || elements.dealOverviewContent.hidden) return;
  elements.dealOverviewContent.replaceChildren();
  const main = filterByArea(state.items, state.areaFilter);
  const other = filterByArea(state.overviewData.items, state.areaFilter);
  const cards = document.createElement('div');
  cards.className = 'pair-grid';
  cards.append(
    makeOverviewCard('매매',
      state.resultDealType === 'trade' ? main : other, 'trade'),
    makeOverviewCard('전월세',
      state.resultDealType === 'rent' ? main : other, 'rent'),
  );
  elements.dealOverviewContent.append(cards);
  const notice = document.createElement('p');
  notice.className = 'trend-detail';
  notice.textContent = '같은 단지끼리 1:1로 비교한 금액이 아니에요. 표시된 거래의 중위값입니다.';
  elements.dealOverviewContent.append(notice);
  if (state.items.length >= 1000 || state.overviewData.items.length >= 1000) {
    const warning = document.createElement('p');
    warning.className = 'trend-detail';
    warning.textContent = '일부 자료가 월별 1,000건 조회 한도에 걸려 전체 거래를 반영하지 않을 수 있어요.';
    elements.dealOverviewContent.append(warning);
  }
}

async function toggleDealOverview() {
  if (state.resultAssetType === 'commercial' || !state.hasResults) return;
  const requestId = ++state.overviewRequestId;
  const opening = elements.dealOverviewContent.hidden;
  elements.dealOverviewContent.hidden = !opening;
  elements.dealOverviewButton.setAttribute('aria-expanded', String(opening));
  elements.dealOverviewButton.textContent = opening ? '접기' : '나란히 보기';
  if (!opening) return;
  if (state.overviewData) {
    renderDealOverview();
    return;
  }
  insightMessage(elements.dealOverviewContent, '두 거래 유형의 자료를 불러오고 있어요...', true);
  const otherDeal = state.resultDealType === 'trade' ? 'rent' : 'trade';
  try {
    const data = await getTransactions(
      state.resultAssetType, otherDeal, state.resultRegion.lawd_cd, state.resultMonth,
    );
    if (requestId !== state.overviewRequestId) return;
    state.overviewData = data;
    renderDealOverview();
  } catch (error) {
    if (requestId === state.overviewRequestId) {
      insightMessage(elements.dealOverviewContent,
        `비교 자료를 불러오지 못했어요. 접었다가 다시 열어주세요. (${error.message})`);
    }
  }
}

function insightMessage(container, text, loading = false) {
  container.replaceChildren();
  if (loading) {
    const spinner = document.createElement('span');
    spinner.className = 'loading-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    container.append(spinner);
  }
  const message = document.createElement('span');
  message.textContent = text;
  container.append(message);
}

function shortMoney(value) {
  if (value >= 10000) {
    const eok = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
    return `${eok.format(value / 10000)}억`;
  }
  return `${formatNumber(Math.round(value))}만`;
}

function renderTrend() {
  if (!state.trendSeries || elements.insightsSection.hidden) return;
  elements.trendContent.replaceChildren();
  if (!state.trendSeries.some((entry) => entry.median !== null)) {
    insightMessage(elements.trendContent, '최근 6개월간 비슷한 면적의 거래가 조회되지 않았어요.');
    return;
  }

  const max = Math.max(...state.trendSeries.map((entry) => entry.median ?? 0));
  const chart = document.createElement('ul');
  chart.className = 'trend-chart';
  chart.setAttribute('aria-label', '월별 중위 거래 금액');
  for (const entry of state.trendSeries) {
    const column = document.createElement('li');
    const monthLabel = formatMonth(entry.month);
    column.setAttribute('aria-label', entry.median === null
      ? `${monthLabel}: 조회된 거래 없음`
      : `${monthLabel}: ${formatKrw10k(entry.median)}, ${entry.count}건`);

    const value = document.createElement('span');
    value.className = 'trend-value';
    value.textContent = entry.median === null ? '–' : shortMoney(entry.median);
    const track = document.createElement('span');
    track.className = 'trend-track';
    if (entry.median !== null) {
      const bar = document.createElement('span');
      bar.className = 'trend-bar';
      bar.style.height = `${max ? Math.max(8, Math.round((entry.median / max) * 100)) : 8}%`;
      track.append(bar);
    }
    const month = document.createElement('span');
    month.className = 'trend-month';
    month.textContent = `${Number(entry.month.slice(4))}월`;
    column.append(value, track, month);
    chart.append(column);
  }
  elements.trendContent.append(chart);
  const available = state.trendSeries.filter((entry) => entry.count > 0);
  const details = document.createElement('p');
  details.className = 'trend-detail';
  details.textContent = `${available.length}개월 거래 확인 · 월별 중위 금액 · 거래가 없는 달은 ‘–’`;
  elements.trendContent.append(details);
  if (state.trendSeries.some((entry) => entry.limited)) {
    const warning = document.createElement('p');
    warning.className = 'trend-detail';
    warning.textContent = '일부 월은 1,000건 조회 한도에 걸려 해당 단지 거래가 누락될 수 있어요.';
    elements.trendContent.append(warning);
  }
}

function makePairCard(label, items, dealType) {
  const card = document.createElement('div');
  card.className = 'pair-card';
  compareText(card, '', label, 'strong');
  const latest = [...items].sort((a, b) =>
    String(b.deal_date ?? '').localeCompare(String(a.deal_date ?? '')))[0];
  if (!latest) {
    compareText(card, 'pair-amount', '조회 내역 없음', 'span');
    compareText(card, 'pair-detail', '선택한 달에 유사 면적 거래를 찾지 못했어요.', 'span');
    return card;
  }
  compareText(card, 'pair-amount', formatKrw10k(
    dealType === 'trade' ? latest.price_10k : latest.deposit_10k,
  ), 'span');
  const extra = dealType === 'trade'
    ? formatPricePerPyeong(latest.price_10k, latest.area_m2)
    : latest.monthly_rent_10k === null || latest.monthly_rent_10k === undefined
      ? '월세 정보 없음'
      : Number(latest.monthly_rent_10k) === 0 ? '전세' : `월세 ${formatKrw10k(latest.monthly_rent_10k)}`;
  compareText(card, 'pair-detail', extra, 'span');
  compareText(card, 'pair-detail',
    `${formatDate(latest.deal_date)} · ${formatAreaUnit(latest.area_m2, state.unit)} · ${items.length}건 중 최근 거래`,
    'span');
  return card;
}

function renderDealPair() {
  if (!state.pairItems || elements.insightsSection.hidden) return;
  if (state.pairItems.unsupported) {
    insightMessage(elements.dealPairContent, '상업·업무용은 전월세 조회를 제공하지 않아요.');
    return;
  }
  elements.dealPairContent.replaceChildren();
  const cards = document.createElement('div');
  cards.className = 'pair-grid';
  cards.append(
    makePairCard('매매', state.pairItems.trade, 'trade'),
    makePairCard('전월세 · 보증금', state.pairItems.rent, 'rent'),
  );
  elements.dealPairContent.append(cards);
  if (state.pairItems.limited) {
    const warning = document.createElement('p');
    warning.className = 'trend-detail';
    warning.textContent = '해당 월의 조회 한도(1,000건) 때문에 다른 거래가 더 있을 수 있어요.';
    elements.dealPairContent.append(warning);
  }
}

function renderInsights() {
  if (!state.detailTarget || elements.insightsSection.hidden) return;
  const target = state.detailTarget;
  elements.insightsSubtitle.textContent = [
    target.name, target.district, formatAreaUnit(target.area_m2, state.unit),
    '면적 ±1㎡ 기준',
  ].join(' · ');
  elements.trendCaption.textContent = `${state.resultDealType === 'trade' ? '매매 금액' : '보증금'} · 월별 중위 금액`;
  renderTrend();
  renderDealPair();
}

async function openInsights(item) {
  const requestId = ++state.detailRequestId;
  state.detailTarget = item;
  state.trendSeries = null;
  state.pairItems = null;
  elements.insightsSection.hidden = false;
  renderInsights();
  insightMessage(elements.trendContent, '지난 6개월의 거래를 찾아보고 있어요...', true);
  insightMessage(elements.dealPairContent, '매매·전월세 거래를 비교하고 있어요...', true);
  scrollToSection(elements.insightsSection);

  const asset = state.resultAssetType;
  const deal = state.resultDealType;
  const code = state.resultRegion.lawd_cd;
  const selectedMonth = state.resultMonth;

  const loadHistory = async () => {
    const series = [];
    for (let offset = -5; offset <= 0; offset += 1) {
      if (requestId !== state.detailRequestId) return;
      const month = shiftMonth(selectedMonth, offset);
      if (month < '200001') {
        series.push({ month, median: null, count: 0, limited: false });
        continue;
      }
      const data = await getTransactions(asset, deal, code, month);
      if (requestId !== state.detailRequestId) return;
      const matches = matchingUnitTransactions(data.items, item);
      const summary = summarizeTransactions(matches, deal);
      series.push({
        month,
        median: deal === 'trade' ? summary.median_price_10k : summary.median_deposit_10k,
        count: matches.length,
        limited: data.items.length >= 1000,
      });
    }
    state.trendSeries = series;
    renderTrend();
  };

  const loadPair = async () => {
    if (asset === 'commercial') {
      state.pairItems = { unsupported: true };
      renderDealPair();
      return;
    }
    const otherDeal = deal === 'trade' ? 'rent' : 'trade';
    const data = await getTransactions(asset, otherDeal, code, selectedMonth);
    if (requestId !== state.detailRequestId) return;
    const currentMatches = matchingUnitTransactions(state.items, item);
    const otherMatches = matchingUnitTransactions(data.items, item);
    state.pairItems = {
      trade: deal === 'trade' ? currentMatches : otherMatches,
      rent: deal === 'rent' ? currentMatches : otherMatches,
      limited: state.items.length >= 1000 || data.items.length >= 1000,
    };
    renderDealPair();
  };

  await Promise.all([
    loadHistory().catch((error) => {
      if (requestId === state.detailRequestId) {
        insightMessage(elements.trendContent,
          `추이를 불러오지 못했어요. 다시 눌러주세요. (${error.message})`);
      }
    }),
    loadPair().catch((error) => {
      if (requestId === state.detailRequestId) {
        insightMessage(elements.dealPairContent,
          `비교 자료를 불러오지 못했어요. 다시 눌러주세요. (${error.message})`);
      }
    }),
  ]);
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
elements.areaSelect.addEventListener('change', updateAreaInputs);
for (const button of elements.unitButtons) {
  button.addEventListener('click', () => setUnit(button.dataset.unit));
}
elements.shareButton.addEventListener('click', () => {
  const opening = elements.sharePanel.hidden;
  elements.sharePanel.hidden = !opening;
  elements.shareButton.setAttribute('aria-expanded', String(opening));
  if (opening) {
    elements.shareUrl.value = createShareUrl();
    elements.shareStatus.textContent = '복사해서 친구에게 보내보세요.';
    elements.shareUrl.focus();
    elements.shareUrl.select();
  }
});
elements.copyLink.addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('클립보드를 사용할 수 없어요.');
    await navigator.clipboard.writeText(elements.shareUrl.value);
    elements.shareStatus.textContent = '링크를 복사했어요! 그대로 보내면 같은 조건으로 열려요.';
  } catch {
    elements.shareUrl.focus();
    elements.shareUrl.select();
    elements.shareStatus.textContent = '자동 복사가 어려워요. 선택된 주소를 길게 눌러 복사해 주세요.';
  }
});
elements.shareUrl.addEventListener('click', () => elements.shareUrl.select());
elements.dealOverviewButton.addEventListener('click', toggleDealOverview);
elements.compareJump.addEventListener('click', () => scrollToSection(elements.compareSection));
elements.compareClear.addEventListener('click', () => {
  state.compared.clear();
  renderRows();
  renderComparePanel();
});
elements.insightsClose.addEventListener('click', () => {
  state.detailRequestId += 1;
  state.detailTarget = null;
  elements.insightsSection.hidden = true;
});
elements.searchToggle.addEventListener('click', () => {
  setSearchCollapsed(!elements.form.hidden);
});
elements.headerSearchButton.addEventListener('click', () => {
  setSearchCollapsed(false);
  scrollToSection(elements.searchCard);
});
if (typeof mobileSearch.addEventListener === 'function') {
  mobileSearch.addEventListener('change', syncMobileSearch);
} else {
  mobileSearch.addListener(syncMobileSearch);
}
elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  performSearch(undefined, true);
});
for (const button of elements.quickRegions) {
  button.addEventListener('click', () => {
    elements.regionInput.value = button.dataset.regionQuery;
    state.selectedRegion = null;
    performSearch(button.dataset.regionName, true);
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
    if (mobileSearch.matches) scrollToSection(elements.listCard);
  }
});
elements.nextPage.addEventListener('click', () => {
  state.page += 1;
  renderRows();
  if (mobileSearch.matches) scrollToSection(elements.listCard);
});

elements.monthInput.max = currentKoreanMonth();
elements.monthInput.value = previousKoreanMonth();
restoreSharedSearch();
updateAssetAvailability();
updateAreaInputs();
performSearch();
