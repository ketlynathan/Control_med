const test = require('node:test');
const assert = require('node:assert/strict');
const { cents, getCashBaseForClosing, buildRegisterSummary, buildModuleMetrics } = require('../analytics-domain');

const state = {
  transactions: [
    { id: 'tx1', date: '2026-09-21', type: 'saida', amount: '271.14', collaborator: '', register: '1', category: 'Mercadoria', description: 'Compra', paymentMethod: 'pix', reconciled: false },
    { id: 'tx2', date: '2026-09-22', type: 'saida', amount: '0.10', collaborator: 'user-1', register: '1', category: 'Impostos', description: 'Taxa', paymentMethod: 'dinheiro', reconciled: true },
    { id: 'tx3', date: '2026-09-22', type: 'entrada', amount: '10.20', collaborator: 'user-1', register: '2', category: 'Vendas', description: 'Venda', reconciled: false },
  ],
  closings: [
    { id: 'close1', date: '2026-09-21', register: '1', collaborator: 'user-1', cash: 100, entryTotal: 150, exitTotal: 25, expenses: [{ description: 'Merenda', amount: 25 }], expected: 75, actual: 80, diff: 5 },
    { id: 'close2', date: '2026-09-22', register: '2', collaborator: 'user-1', cash: 30, entryTotal: 50, exitTotal: 0, expenses: [], expected: 30, actual: 28, diff: -2 },
  ],
  openings: [{ id: 'fund1', date: '2026-09-21', register: '1', collaborator: 'user-1', amount: 20 }],
  payables: { entries: [
    { id: 'pay1', dueDate: '2026-09-20', amount: 40, paid: false, category: 'Fornecedor' },
    { id: 'pay2', dueDate: '2026-09-21', amount: 10, paid: true, category: 'Impostos' },
  ] },
  drogaria: { config: { attentionPercent: 130 }, products: [
    { id: 'p1', currentStock: 0, minimumStock: 2, costPrice: 3 },
    { id: 'p2', currentStock: 4, minimumStock: 3, costPrice: 5 },
    { id: 'p3', currentStock: 2, minimumStock: 2 },
  ] },
  convenio: { entries: [
    { id: 'c1', date: '2026-09-22', total: 12, collaboratorId: 'user-1' },
  ] },
};

const ledger = [
  { id: 'movement:tx1', source: 'movement', date: '2026-09-21', type: 'saida', amount: 271.14, collaborator: '', register: '1', category: 'Mercadoria', description: 'Compra', transaction: state.transactions[0] },
  { id: 'movement:tx2', source: 'movement', date: '2026-09-22', type: 'saida', amount: 0.10, collaborator: 'user-1', register: '1', category: 'Impostos', description: 'Taxa', transaction: state.transactions[1] },
  { id: 'movement:tx3', source: 'movement', date: '2026-09-22', type: 'entrada', amount: 10.20, collaborator: 'user-1', register: '2', category: 'Vendas', description: 'Venda', transaction: state.transactions[2] },
  { id: 'closing-expense:close1:0', source: 'closing-expense', date: '2026-09-21', type: 'saida', amount: 25, collaborator: 'user-1', register: '1', category: '', description: 'Merenda' },
  { id: 'closing-entry:close1', source: 'closing-entry', date: '2026-09-21', type: 'entrada', amount: 150, collaborator: 'user-1', register: '1', category: '', description: 'Entradas do fechamento' },
  { id: 'closing-entry:close2', source: 'closing-entry', date: '2026-09-22', type: 'entrada', amount: 50, collaborator: 'user-1', register: '2', category: '', description: 'Entradas do fechamento' },
];

test('converte dinheiro para centavos sem somar floats', () => {
  assert.equal(cents(0.1) + cents(0.2), 30);
  assert.equal(cents('271.14'), 27114);
});

test('cards combinam entradas e saídas por origem, evitam duplicar detalhe e mostram um único fundo recente', () => {
  const result = buildRegisterSummary({
    transactions: [{ type: 'entrada', amount: 10 }, { type: 'saida', amount: 20 }],
    closings: [
      { entryTotal: 100, exitTotal: 50, expenses: [{ amount: 30 }, { amount: 20 }] },
      { entryTotal: 25, exitTotal: 10, expenses: [] },
    ],
    openings: [
      { id: 'old', date: '2026-09-01', amount: 500 },
      { id: 'latest', date: '2026-09-25', amount: 114, register: '1' },
    ],
  });
  assert.equal(result.entriesCents, 13500);
  assert.equal(result.exitsCents, 8000);
  assert.equal(result.balanceCents, 5500);
  assert.equal(result.lastFund.id, 'latest');
  assert.equal(result.lastFund.amount, 114);
});

test('base do fechamento usa a contagem mais recente, não soma fundos diários', () => {
  const closings = [
    { id: 'c1', register: '1', date: '2026-09-20', actual: 100 },
    { id: 'c2', register: '1', date: '2026-09-21', actual: 135.45 },
    { id: 'c3', register: '2', date: '2026-09-21', actual: 80 },
  ];
  const openings = [
    { id: 'f1', register: '1', date: '2026-09-10', amount: 50 },
    { id: 'f2', register: '1', date: '2026-09-20', amount: 90 },
    { id: 'f3', register: '1', date: '2026-09-20', amount: 90 },
  ];
  assert.deepEqual(getCashBaseForClosing(closings, openings, '1', '2026-09-22'), {
    amountCents: 13545, source: 'previous-count', sourceDate: '2026-09-21', sourceId: 'c2', repeatedOpeningCount: 0,
  });
  assert.deepEqual(getCashBaseForClosing([], openings, '1', '2026-09-22'), {
    amountCents: 5000, source: 'initial-fund', sourceDate: '2026-09-10', sourceId: 'f1', repeatedOpeningCount: 2,
  });
  assert.equal(getCashBaseForClosing([], [], 'new', '2026-09-22').source, 'zero-unconfirmed');
});

test('separa movimentos de módulo das linhas derivadas do fechamento', () => {
  const result = buildModuleMetrics(state, ledger, { range: { start: '', end: '' } }, '2026-09-26', row => row.category || 'Sem categoria');
  assert.equal(result.movements.count, 3);
  assert.equal(result.movements.exits, 27124);
  assert.equal(result.movements.entries, 1020);
  assert.equal(result.cash.closingCount, 2);
  assert.equal(result.cash.entries, 20000);
  assert.equal(result.cash.expenses, 2500);
  assert.equal(result.cash.fundsEventSum, 2000);
  assert.equal(result.cash.differenceNet, 300);
});

test('filtra movimentos por período, usuário, caixa e categoria sem misturar contas', () => {
  const result = buildModuleMetrics(state, ledger, { range: { start: '2026-09-22', end: '2026-09-22' }, user: 'user-1', register: '1', category: 'Impostos', type: 'saida' }, '2026-09-26', row => row.category || 'Sem categoria');
  assert.equal(result.movements.count, 1);
  assert.equal(result.movements.exits, 10);
  assert.equal(result.cash.closingCount, 0);
  assert.match(result.applied.filtersNote, /contas a pagar/);
});

test('calcula contas abertas/vencidas e identifica estoque sem custo e convênio sem status de recebimento', () => {
  const result = buildModuleMetrics(state, ledger, { range: { start: '2026-09-01', end: '2026-09-30' } }, '2026-09-26');
  assert.equal(result.payables.openTotal, 4000);
  assert.equal(result.payables.overdueTotal, 4000);
  assert.equal(result.payables.paidInRangeTotal, 1000);
  assert.equal(result.integrity.payableMovementCandidates.length, 0);
  assert.equal(result.integrity.paidPayablesWithoutCandidate.length, 1);
  assert.equal(result.inventory.productCount, 3);
  assert.equal(result.inventory.lowStockCount, 2);
  assert.equal(result.inventory.valueEstimate, null);
  assert.equal(result.convenio.count, 1);
  assert.equal(result.convenio.total, 1200);
  assert.equal(result.convenio.hasPaymentState, false);
});

test('sinaliza responsáveis ausentes, reconciliação pendente e fechamento sem saldo inicial sem corrigir registros', () => {
  const result = buildModuleMetrics(state, ledger, { range: { start: '', end: '' } }, '2026-09-26');
  assert.equal(result.integrity.missingResponsible.length, 1);
  assert.equal(result.integrity.pendingReconciliation.length, 2);
  assert.equal(result.integrity.negativeExpected.length, 0);
  assert.equal(result.integrity.closingWithoutPriorCount.length, 1);
  assert.equal(result.integrity.inconsistentStoredDifference.length, 0);
  assert.equal(state.transactions[0].collaborator, '');
});
