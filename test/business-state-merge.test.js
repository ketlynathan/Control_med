const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeBusinessState } = require('../src/state/merge-business-state.js');
const { normalizeBusinessState } = require('../src/state/default-state.js');

test('mescla inclusões independentes de caixas sem perder nenhum registro', () => {
  const base = { closings: [] };
  const local = { closings: [{ id: 'local', actual: 100 }] };
  const remote = { closings: [{ id: 'remote', actual: 200 }] };
  const result = mergeBusinessState(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.state.closings, [remote.closings[0], local.closings[0]]);
});

test('mescla campos diferentes do mesmo registro', () => {
  const base = { payables: { entries: [{ id: 'rent', amount: 100, paid: false }] } };
  const local = { payables: { entries: [{ id: 'rent', amount: 120, paid: false }] } };
  const remote = { payables: { entries: [{ id: 'rent', amount: 100, paid: true }] } };
  const result = mergeBusinessState(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.state.payables.entries, [{ id: 'rent', amount: 120, paid: true }]);
});

test('sinaliza alterações concorrentes no mesmo campo e prefere a cópia local', () => {
  const base = { transactions: [{ id: 'tx', amount: 100 }] };
  const local = { transactions: [{ id: 'tx', amount: 120 }] };
  const remote = { transactions: [{ id: 'tx', amount: 130 }] };
  const result = mergeBusinessState(base, local, remote);
  assert.deepEqual(result.state.transactions, local.transactions);
  assert.deepEqual(result.conflicts, ['transactions[tx].amount']);
});

test('propaga exclusão quando o outro dispositivo não alterou o registro', () => {
  const base = { closings: [{ id: 'old', actual: 100 }] };
  const local = { closings: [] };
  const remote = { closings: [{ id: 'old', actual: 100 }] };
  const result = mergeBusinessState(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.state.closings, []);
});

test('mantém a edição local e sinaliza a exclusão remota concorrente', () => {
  const base = { closings: [{ id: 'old', actual: 100 }] };
  const local = { closings: [{ id: 'old', actual: 120 }] };
  const remote = { closings: [] };
  const result = mergeBusinessState(base, local, remote);
  assert.deepEqual(result.conflicts, ['closings[old]']);
  assert.deepEqual(result.state.closings, local.closings);
});

test('mantém a exclusão local e sinaliza a edição remota concorrente', () => {
  const base = { closings: [{ id: 'old', actual: 100 }] };
  const local = { closings: [] };
  const remote = { closings: [{ id: 'old', actual: 120 }] };
  const result = mergeBusinessState(base, local, remote);
  assert.deepEqual(result.conflicts, ['closings[old]']);
  assert.deepEqual(result.state.closings, local.closings);
});

test('prefere valores locais e sinaliza conflitos em campos de contas a pagar', () => {
  const base = { payables: { entries: [{ id: 'bill', dueDate: '2026-10-20', updatedAt: 'base' }] } };
  const local = { payables: { entries: [{ id: 'bill', dueDate: '2026-10-22', paid: false, updatedAt: 'local' }] } };
  const remote = { payables: { entries: [{ id: 'bill', dueDate: '2026-10-21', paid: true, updatedAt: 'remote' }] } };
  const result = mergeBusinessState(base, local, remote);
  assert.deepEqual(result.state.payables.entries, local.payables.entries);
  assert.deepEqual(result.conflicts, ['payables.entries[bill].dueDate', 'payables.entries[bill].updatedAt', 'payables.entries[bill].paid']);
});

test('normaliza estado legado sem remover campos operacionais existentes', () => {
  const legacy = {
    business: { name: 'Operação antiga', accountingFirstCycleStart: '2026-10-05' },
    transactions: [{ id: 'tx-1', amount: 45, attachment: 'data:legacy' }],
    closings: [{ id: 'close-1', date: '2026-10-06', actual: 20, revision: 3 }],
    payables: { entries: [{ id: 'rent-1', amount: 900, dueDate: '2026-10-20' }] },
    customOperationalField: { kept: true },
    financialMovements: [{ id: 'derived' }],
  };
  const normalized = normalizeBusinessState(legacy);
  assert.deepEqual(normalized.transactions, legacy.transactions);
  assert.deepEqual(normalized.closings, legacy.closings);
  assert.deepEqual(normalized.payables, legacy.payables);
  assert.deepEqual(normalized.customOperationalField, legacy.customOperationalField);
  assert.equal(Object.hasOwn(normalized, 'financialMovements'), false);
});

test('migra o colaborador padrão antigo sem duplicar o administrador sintético do servidor', () => {
  const base = { collaborators: [{ id: 'admin-default', name: 'Administrador', role: 'Gestor', code: '1234' }] };
  const local = { collaborators: [{ id: 'id-random-old', name: 'Administrador', role: 'Gestor', code: '1234' }] };
  const remote = { collaborators: [] };
  const result = mergeBusinessState(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.state.collaborators, local.collaborators);
});