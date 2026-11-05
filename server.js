import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const DEFAULT_PROXY_BASE_URL = 'https://k-skill-proxy.nomadamas.org/';
const ASSET_TYPES = new Set([
  'apartment',
  'officetel',
  'villa',
  'single-house',
  'commercial',
]);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, value, head = false) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(head ? undefined : body);
}

function currentKoreanMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  return `${parts.find((part) => part.type === 'year').value}${parts.find((part) => part.type === 'month').value}`;
}

async function fetchFromProxy(res, endpoint, fetchImpl, baseUrl, head) {
  let upstream;

  try {
    upstream = await fetchImpl(new URL(endpoint, baseUrl), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    sendJson(res, timedOut ? 504 : 502, {
      error: timedOut
        ? '조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
        : '실거래가 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    }, head);
    return;
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    sendJson(res, 502, { error: '실거래가 서비스에서 올바른 응답을 받지 못했습니다.' }, head);
    return;
  }

  if (!upstream.ok) {
    const message = upstream.status === 429
      ? '조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.'
      : upstream.status === 503
        ? '실거래가 서비스를 일시적으로 이용할 수 없습니다.'
        : '실거래가 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.';

    sendJson(res, upstream.status === 429 ? 429 : 502, { error: message }, head);
    return;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    sendJson(res, 502, { error: '실거래가 서비스에서 올바른 응답을 받지 못했습니다.' }, head);
    return;
  }

  sendJson(res, 200, data, head);
}

async function serveStatic(res, pathname, head, publicDir) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 404, { error: '페이지를 찾을 수 없습니다.' }, head);
    return;
  }

  if (decoded.includes('\0') || decoded.includes('\\')) {
    sendJson(res, 404, { error: '페이지를 찾을 수 없습니다.' }, head);
    return;
  }

  const filePath = resolve(publicDir, decoded === '/' ? 'index.html' : decoded.slice(1));
  const relativePath = relative(publicDir, filePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    sendJson(res, 404, { error: '페이지를 찾을 수 없습니다.' }, head);
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(head ? undefined : body);
  } catch {
    sendJson(res, 404, { error: '페이지를 찾을 수 없습니다.' }, head);
  }
}

export function createAppServer({
  fetchImpl = fetch,
  proxyBaseUrl = process.env.KSKILL_PROXY_BASE_URL || DEFAULT_PROXY_BASE_URL,
  publicDir = PUBLIC_DIR,
} = {}) {
  const baseUrl = new URL(
    proxyBaseUrl.endsWith('/') ? proxyBaseUrl : `${proxyBaseUrl}/`,
  );
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('KSKILL_PROXY_BASE_URL은 HTTP 또는 HTTPS 주소여야 합니다.');
  }

  return createServer(async (req, res) => {
    const head = req.method === 'HEAD';
    if (req.method !== 'GET' && !head) {
      sendJson(res, 405, { error: 'GET 요청만 지원합니다.' }, false);
      return;
    }

    try {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/healthz') {
        sendJson(res, 200, { status: 'ok' }, head);
        return;
      }

      if (url.pathname === '/api/regions') {
        const query = (url.searchParams.get('q') ?? '').trim();
        if (query.length < 2 || query.length > 60) {
          sendJson(res, 400, { error: '지역명을 2~60자로 입력해 주세요.' }, head);
          return;
        }

        const params = new URLSearchParams({ q: query });
        await fetchFromProxy(res, `v1/real-estate/region-code?${params}`, fetchImpl, baseUrl, head);
        return;
      }

      if (url.pathname === '/api/transactions') {
        const asset = url.searchParams.get('asset_type') ?? '';
        const deal = url.searchParams.get('deal_type') ?? '';
        const code = url.searchParams.get('lawd_cd') ?? '';
        const month = url.searchParams.get('deal_ymd') ?? '';

        if (!ASSET_TYPES.has(asset) || !['trade', 'rent'].includes(deal)
            || (asset === 'commercial' && deal === 'rent')) {
          sendJson(res, 400, { error: '지원하지 않는 주택 유형 또는 거래 구분입니다.' }, head);
          return;
        }
        if (!/^\d{5}$/.test(code)) {
          sendJson(res, 400, { error: '올바른 지역 코드를 선택해 주세요.' }, head);
          return;
        }
        if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(month) || month > currentKoreanMonth()) {
          sendJson(res, 400, { error: '올바른 거래년월을 선택해 주세요.' }, head);
          return;
        }

        const params = new URLSearchParams({
          lawd_cd: code,
          deal_ymd: month,
          num_of_rows: '1000',
        });
        await fetchFromProxy(res, `v1/real-estate/${asset}/${deal}?${params}`, fetchImpl, baseUrl, head);
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'API를 찾을 수 없습니다.' }, head);
        return;
      }

      await serveStatic(res, url.pathname, head, publicDir);
    } catch {
      if (!res.headersSent) {
        sendJson(res, 500, { error: '요청을 처리하는 중 오류가 발생했습니다.' }, head);
      } else {
        res.end();
      }
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT는 1~65535 사이의 정수여야 합니다.');
  }
  createAppServer().listen(port, host, () => {
    console.log(`실거래가 조회: http://${host}:${port}`);
  });
}
