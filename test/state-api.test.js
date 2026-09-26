const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const routePath = path.resolve(__dirname, '../api/state.js');
const originalLoad = Module._load;
let queryHandler;

Module._load = function (request, parent, isMain) {
  if (request === './_lib/db' && parent?.filename === routePath) return { getPool: () => ({ query: (...args) => queryHandler(...args) }) };
  if (request === './_lib/auth' && parent?.filename === routePath) return { getAuthBusinessId: () => 'test-business' };
  return originalLoad.call(this, request, parent, isMain);
};
const route = require(routePath);
Module._load = originalLoad;

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

const version = '424242';

test('GET devolve o estado e uma versão que o cliente pode comparar', async () => {
  queryHandler = async sql => {
    assert.match(sql, /SELECT state/);
    assert.match(sql, /AS version/);
    return { rows: [{ state: { transactions: [] }, version }] };
  };
  const res = response();
  await route({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.state, { transactions: [] });
  assert.equal(res.body.version, version);
});

test('PUT atualiza apenas se a versão xmin ainda for igual à versão lida', async () => {
  let called = false;
  queryHandler = async (sql, values) => {
    called = true;
    assert.match(sql, /UPDATE business_state SET state = \$2, updated_at = now\(\)/);
    assert.match(sql, /xmin::text = \$3/);
    assert.equal(values[0], 'test-business');
    assert.deepEqual(values[1], { transactions: [{ id: 'new' }] });
    assert.equal(values[2], version);
    return { rows: [{ version: '424243' }] };
  };
  const res = response();
  await route({ method: 'PUT', headers: {}, body: { state: { transactions: [{ id: 'new' }] }, version } }, res);
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.version, '424243');
});

test('PUT obsoleto responde 409 sem aplicar a alteração', async () => {
  let calls = 0;
  queryHandler = async () => {
    calls++;
    if (calls === 1) return { rows: [] };
    return { rows: [{ version: '424244' }] };
  };
  const res = response();
  await route({ method: 'PUT', headers: {}, body: { state: { transactions: [{ id: 'stale' }] }, version } }, res);
  assert.equal(calls, 2);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.version, '424244');
});

test('PUT sem versão é recusado para impedir overwrite por cliente antigo', async () => {
  let called = false;
  queryHandler = async () => { called = true; return { rows: [] }; };
  const res = response();
  await route({ method: 'PUT', headers: {}, body: { state: { transactions: [] } } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(called, false);
});

test('PUT com versão malformada é recusado sem executar SQL', async () => {
  let called = false;
  queryHandler = async () => { called = true; return { rows: [] }; };
  const res = response();
  await route({ method: 'PUT', headers: {}, body: { state: { transactions: [] }, version: 'not-a-version' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});
