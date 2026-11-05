import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAppServer } from '../server.js';

async function withServer(fetchImpl, callback) {
  const server = createAppServer({ fetchImpl });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('홈페이지와 정적 파일을 제공한다', async () => {
  await withServer(() => {
    throw new Error('정적 파일에는 프록시를 호출하면 안 됩니다.');
  }, async (base) => {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /자연이랑 영석이랑 살 집은 어디일까\?/);

    const script = await fetch(`${base}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.match(await script.text(), /performSearch/);

    const missing = await fetch(`${base}/server.js`);
    assert.equal(missing.status, 404);
  });
});

test('배포용 상태 확인은 외부 프록시 호출 없이 동작한다', async () => {
  await withServer(() => {
    throw new Error('상태 확인에는 프록시를 호출하면 안 됩니다.');
  }, async (base) => {
    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('지역 검색은 스킬의 region-code 엔드포인트로 전달한다', async () => {
  let upstreamUrl;
  await withServer(async (url) => {
    upstreamUrl = new URL(url);
    return jsonResponse({ results: [{ lawd_cd: '11680', name: '서울특별시 강남구' }] });
  }, async (base) => {
    const response = await fetch(`${base}/api/regions?q=${encodeURIComponent('강남구')}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results[0].lawd_cd, '11680');
    assert.equal(upstreamUrl.pathname, '/v1/real-estate/region-code');
    assert.equal(upstreamUrl.searchParams.get('q'), '강남구');
  });
});

test('거래 조회는 올바른 유형, 날짜, 지역코드와 최대 1000건을 요청한다', async () => {
  let upstreamUrl;
  await withServer(async (url) => {
    upstreamUrl = new URL(url);
    return jsonResponse({ items: [], summary: { sample_count: 0 } });
  }, async (base) => {
    const response = await fetch(
      `${base}/api/transactions?asset_type=officetel&deal_type=rent&lawd_cd=11440&deal_ymd=202403`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items, []);
    assert.equal(upstreamUrl.pathname, '/v1/real-estate/officetel/rent');
    assert.equal(upstreamUrl.searchParams.get('lawd_cd'), '11440');
    assert.equal(upstreamUrl.searchParams.get('deal_ymd'), '202403');
    assert.equal(upstreamUrl.searchParams.get('num_of_rows'), '1000');
  });
});

test('잘못된 조회 조건과 미지원 상업용 전월세를 차단한다', async () => {
  await withServer(() => {
    throw new Error('잘못된 조건에서는 프록시를 호출하면 안 됩니다.');
  }, async (base) => {
    const paths = [
      '/api/regions?q=%20',
      '/api/transactions?asset_type=commercial&deal_type=rent&lawd_cd=11680&deal_ymd=202403',
      '/api/transactions?asset_type=apartment&deal_type=trade&lawd_cd=116800&deal_ymd=202403',
      '/api/transactions?asset_type=apartment&deal_type=trade&lawd_cd=11680&deal_ymd=202413',
      '/api/transactions?asset_type=apartment&deal_type=trade&lawd_cd=11680&deal_ymd=209912',
    ];
    for (const path of paths) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 400, path);
    }
  });
});

test('상위 서비스 장애를 명확한 오류로 반환한다', async () => {
  await withServer(async () => jsonResponse({ error: 'hidden' }, 503), async (base) => {
    const response = await fetch(`${base}/api/regions?q=%EA%B0%95%EB%82%A8%EA%B5%AC`);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /일시적으로/);
  });
});
