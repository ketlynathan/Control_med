const test = require('node:test');
const assert = require('node:assert/strict');
const { key, range, label, contains, shift } = require('../accounting-period');

test('ciclo contábil: dias 06 ao fim pertencem ao mês iniciado no dia 06', () => {
  assert.equal(key('2026-10-06'), '2026-10');
  assert.equal(key('2026-10-31'), '2026-10');
  assert.equal(key('2026-10-05'), '2026-09');
  assert.equal(key('2026-01-05'), '2025-12');
});

test('range do ciclo termina no dia 05 do mês seguinte', () => {
  assert.deepEqual(range('2026-09'), { key: '2026-09', start: '2026-09-06', end: '2026-10-05' });
  assert.equal(contains('2026-10-05', '2026-09'), true);
  assert.equal(contains('2026-10-06', '2026-09'), false);
  assert.equal(shift('2026-09', 1), '2026-10');
});

test('rótulo identifica claramente as datas do ciclo', () => {
  assert.match(label('2026-09'), /06\/09\/2026 a 05\/10\/2026/);
});
