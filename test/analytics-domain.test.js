const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { cents, getCashBaseForClosing, calculateClosingCashReconciliation, buildFinancialLedger, filterFinancialLedger, buildRegisterSummary, buildModuleMetrics, canEditClosingToday, buildClosingRevision } = require('../analytics-domain');

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

test('cards do Caixa excluem Lançamentos, detalham apenas saídas próprias e mostram um único fundo recente', () => {
  const result = buildRegisterSummary({
    transactions: [{ id: 'outside-in', type: 'entrada', amount: 10 }, { id: 'outside-out', type: 'saida', amount: 20 }],
    closings: [
      { entryTotal: 100, exitTotal: 50, expenses: [{ amount: 30 }, { amount: 20 }] },
      { entryTotal: 25, exitTotal: 10, expenses: [] },
    ],
    openings: [
      { id: 'old', date: '2026-09-01', amount: 500 },
      { id: 'latest', date: '2026-09-25', amount: 114, register: '1' },
    ],
  });
  assert.equal(result.cashEntriesCents, 12500);
  assert.equal(result.cashExitsCents, 6000);
  assert.equal(result.cashBalanceCents, 6500);
  assert.equal(result.movementEntriesCents, 1000);
  assert.equal(result.movementExitsCents, 2000);
  assert.equal(result.lastFund.id, 'latest');
  assert.equal(result.lastFund.amount, 114);
});
test('cards do Caixa aplicam o período selecionado a entradas, saídas e último fundo', () => {
  const result = buildRegisterSummary({
    transactions: [{ id: 'outside', type: 'entrada', amount: 999, date: '2026-10-10' }],
    closings: [
      { id: 'sep', date: '2026-09-20', entryTotal: 100, exitTotal: 20, expenses: [{ amount: 20 }] },
      { id: 'prior-count', date: '2026-09-30', register: '', actual: 50 },
      { id: 'oct', date: '2026-10-07', entryTotal: 250, exitTotal: 35, expenses: [{ amount: 35 }] },
    ],
    openings: [
      { id: 'sep-fund', date: '2026-09-20', amount: 50 },
      { id: 'oct-fund', date: '2026-10-07', amount: 94 },
    ],
  }, { range: { start: '2026-10-06', end: '2026-11-05' } });

  assert.equal(result.cashEntriesCents, 25000);
  assert.equal(result.cashExitsCents, 3500);
  assert.equal(result.cashBalanceCents, 21500);
  assert.equal(result.lastFund.id, 'oct-fund');
  assert.equal(result.fundsCents, 0);
  assert.equal(result.filteredLedger.pendingFundCents, 9400);
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
    incrementalFundCents: 0, pendingFundCents: 0, includedFundIds: [], pendingFundIds: [],
  });
  assert.deepEqual(getCashBaseForClosing([], openings, '1', '2026-09-22'), {
    amountCents: 5000, source: 'initial-fund', sourceDate: '2026-09-10', sourceId: 'f1', repeatedOpeningCount: 2,
    incrementalFundCents: 0, pendingFundCents: 18000, includedFundIds: [], pendingFundIds: ['f2', 'f3'],
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

test('ledger produz entradas por meio e mantém uma única ocorrência para duplicidade exata com vínculos', () => {
  const input = {
    transactions: [{ id: 'tx-sale', date: '2026-09-22', type: 'saida', amount: 12.5, description: 'Uber', register: '1', collaborator: 'u1', paymentMethod: 'dinheiro' }],
    closings: [{ id: 'close-22', date: '2026-09-22', register: '1', collaborator: 'u1', pix: 25, debit: 12.5, credit: 5, cash: 10, entryTotal: 52.5, exitTotal: 12.5, expenses: [{ description: 'Uber', amount: 12.5, paymentMethod: 'dinheiro' }] }],
    openings: [],
  };
  const ledger = buildFinancialLedger(input);
  assert.deepEqual(ledger.paymentTotalsCents, { pix: 2500, debit: 1250, credit: 500, cash: 1000, card_unspecified: 0, transferencia: 0, outro: 0, nao_informado: 0 });
  assert.equal(ledger.totals.cashEntriesCents, 5250);
  assert.equal(ledger.totals.cashExitsCents, 1250);
  assert.equal(ledger.totals.movementEntriesCents, 0);
  assert.equal(ledger.totals.movementExitsCents, 1250);
  assert.equal(ledger.possibleDuplicates.length, 1);
  assert.equal(ledger.totals.duplicatePendingCents, 1250);
  assert.equal(ledger.confirmedRecords.filter(row => row.type === 'saida').length, 2);
  assert.equal(ledger.possibleDuplicates[0].transactionIds[0], 'tx-sale');
  assert.equal(ledger.possibleDuplicates[0].closingId, 'close-22');
  assert.equal(ledger.records.find(row => row.id === 'closing:close-22:entry:pix').relatedClosingId, 'close-22');
});

test('filtro canônico por período, caixa, categoria e tipo conserva totais em centavos', () => {
  const ledger = buildFinancialLedger({
    transactions: [{ id: 'tx1', date: '2026-09-22', type: 'saida', amount: 14.25, description: 'Gasolina', category: '', register: '1', collaborator: 'u1', paymentMethod: 'pix' }, { id: 'tx2', date: '2026-09-23', type: 'entrada', amount: 50, description: 'Venda', register: '2', collaborator: 'u2', paymentMethod: 'dinheiro' }],
    closings: [], openings: [],
  });
  const result = filterFinancialLedger(ledger, { range: { start: '2026-09-22', end: '2026-09-22' }, register: '1', user: 'u1', type: 'saida', category: 'Transporte' });
  assert.equal(result.records.length, 1);
  assert.equal(result.movementExitsCents, 1425);
  assert.equal(result.movementBalanceCents, -1425);
  assert.equal(result.cashExitsCents, 0);
});

test('fundo igual à contagem anterior fica carregado e nunca é somado novamente', () => {
  const input = {
    closings: [{ id: 'prior', date: '2026-09-21', register: '1', actual: 21.75 }],
    openings: [{ id: 'carry', date: '2026-09-22', register: '1', amount: 21.75, ledgerDisposition: 'carry-forward' }],
  };
  const ledger = buildFinancialLedger(input);
  assert.equal(ledger.totals.fundsCents, 0);
  assert.equal(ledger.records.find(row => row.id === 'fund:carry').status, 'carried_forward');
  const base = getCashBaseForClosing(input.closings, input.openings, '1', '2026-09-23');
  assert.equal(base.amountCents, 2175);
  assert.equal(base.incrementalFundCents, 0);
  assert.equal(base.pendingFundCents, 0);
});

test('fundo histórico sem proveniência fica pendente e não entra no saldo como receita presumida', () => {
  const ledger = buildFinancialLedger({ closings: [{ id: 'prior', date: '2026-09-21', register: '1', actual: 21.75 }], openings: [{ id: 'unknown', date: '2026-09-22', register: '1', amount: 21.75 }] });
  assert.equal(ledger.totals.fundsCents, 0);
  assert.equal(ledger.totals.pendingFundCents, 2175);
});

test('21/09 usa última contagem e só subtrai a compra multirão confirmada em dinheiro', () => {
  const criticalClosing = { id: 'critical-21', date: '2026-09-21', register: '1', actual: 21.75, pix: 120.99, debit: 54, credit: 92, cash: 45.75, entryTotal: 312.74, exitTotal: 1779.99, expenses: [
    { description: 'Dona Betty', amount: 100 }, { description: 'almoço', amount: 34 }, { description: 'Merenda', amount: 40 },
    { description: 'Gasolina', amount: 20 }, { description: 'Uber', amount: 30 }, { description: 'Compras (multirão)', amount: 1145 },
    { description: 'compras', amount: 69 }, { description: 'compras', amount: 202.79 }, { description: 'compras', amount: 139.2 },
  ] };
  const historical = { closings: [{ id: 'prior-count', date: '2026-09-20', register: '1', actual: 153.75 }, criticalClosing], openings: [], transactions: [
    { id: 'unrelated-entry', date: '2026-09-21', register: '1', type: 'entrada', amount: 900, description: 'Lançamento fora do Caixa', paymentMethod: 'cash' },
    { id: 'unrelated-exit', date: '2026-09-21', register: '1', type: 'saida', amount: 200, description: 'Saída fora do Caixa', paymentMethod: 'cash' },
  ], financialReconciliation: { expensePaymentMethodById: { 'closing-expense:critical-21:5': 'cash' } } };
  const result = calculateClosingCashReconciliation(historical, criticalClosing);
  assert.equal(result.baseCents, 15375);
  assert.equal(result.cashEntryCents, 4575);
  assert.equal(result.cashExpenseCents, 114500);
  assert.equal(result.unknownOutflowCents, 63499);
  assert.equal(result.expectedCents, -94550);
  assert.equal(result.actualCents, 2175);
  assert.equal(result.differenceCents, 96725);
  assert.equal(result.provisional, true);
});

test('candidato a duplicidade com Lançamentos não remove despesa do Caixa nem altera esperado físico', () => {
  const closing = { id: 'same-day', date: '2026-09-21', register: '1', actual: 25, cash: 0, entryTotal: 0, exitTotal: 100, expenses: [{ description: 'Mercadoria', amount: 100, paymentMethod: 'cash' }] };
  const result = calculateClosingCashReconciliation({ closings: [{ id: 'prior', date: '2026-09-20', register: '1', actual: 125 }, closing], openings: [], transactions: [{ id: 'manual', date: '2026-09-21', register: '1', type: 'saida', amount: 100, description: 'Mercadoria', paymentMethod: 'cash' }] }, closing);
  assert.equal(result.cashExpenseCents, 10000);
  assert.equal(result.expectedCents, 2500);
  assert.equal(result.actualCents, 2500);
});

test('Caixa, Lançamentos, Contas, Estoque e Convênio permanecem fontes separadas no ledger central', () => {
  const source = {
    closings: [{ id: 'cash1', date: '2026-09-22', register: '1', actual: 18, entryTotal: 40, pix: 20, cash: 20, exitTotal: 7, expenses: [{ description: 'Merenda', amount: 7, paymentMethod: 'cash' }] }],
    transactions: [{ id: 'manual1', date: '2026-09-22', type: 'saida', amount: 4.5, description: 'Compra', paymentMethod: 'pix', register: '1' }],
    openings: [],
    payables: { entries: [{ id: 'pay', supplier: 'Fornecedor', amount: 30, dueDate: '2026-09-25', paid: false }] },
    drogaria: { products: [{ id: 'stock', name: 'Produto', currentStock: 4, minimumStock: 1 }] },
    convenio: { entries: [{ id: 'conv', date: '2026-09-22', productName: 'Produto', quantity: 2, unitPrice: 5, total: 10 }] },
  };
  const ledger = buildFinancialLedger(source);
  assert.ok(ledger.records.some(row => row.sourceModule === 'payables' && row.id === 'payable:pay'));
  assert.ok(ledger.records.some(row => row.sourceModule === 'inventory' && row.id === 'inventory:stock'));
  assert.ok(ledger.records.some(row => row.sourceModule === 'convenio' && row.id === 'convenio:conv'));
  const result = buildModuleMetrics(source, [], { range: { start: '', end: '' }, module: 'cash' }, '2026-09-26');
  assert.equal(result.cash.entries, 4000);
  assert.equal(result.cash.totalExits, 700);
  assert.equal(result.cash.balance, 3300);
  assert.equal(result.movements.count, 0);
  assert.equal(result.payables.openTotal, 3000);
  assert.equal(result.inventory.productCount, 1);
  assert.equal(result.convenio.total, 1000);
});

test('interface Caixa não lista Lançamentos e permite apagar fechamentos com auditoria', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  const cashPage = html.slice(html.indexOf('<section class="page" id="page-register">'), html.indexOf('<section class="page" id="page-analytics">'));
  const cashCards = html.slice(html.indexOf('function renderCashCards()'), html.indexOf('function movementTable('));
  const closingHistory = html.slice(html.indexOf("qs('#closingsTable').innerHTML="), html.indexOf("qs('#openingsTable').innerHTML="));
  assert.ok(cashPage.length > 0);
  assert.doesNotMatch(closingHistory, /Esperado original \/ reconciliação|calculateClosingCashReconciliation|Recalculado:|Diferença|diffCents/);
  for (const header of ['Entradas', 'Saídas', 'Contado', 'Detalhes']) assert.match(closingHistory, new RegExp(`<th>${header}<\\/th>`));
  assert.doesNotMatch(cashPage, /Lançamentos|registerUserSummary|registerMovementHistory/);
  assert.match(html, /closing-delete/);
  assert.doesNotMatch(cashCards, /state\.transactions|Movimentos registrados|lançamento\(s\)/);
  assert.match(html, /closingsTable'\)\.addEventListener\('click'/);
  assert.match(html, /deleteWithAudit\('closing'/);
  assert.match(html, /canEditClosingToday\(c,todayISO\(\)\)\?`<button class="btn btn-ghost btn-sm closing-edit/);
  assert.match(html, /canEditClosingToday\(c,todayISO\(\)\)/);
  assert.match(html, /function startEditClosing\(id\)[\s\S]*?canEditClosingToday\(c, todayISO\(\)\)/);
  assert.match(html, /function upsertClosing\(obj, coll\)[\s\S]*?canEditClosingToday\(state\.closings\[i\], todayISO\(\)\)/);
});

test('edição do fechamento só é elegível na mesma data local do caixa', () => {
  assert.equal(canEditClosingToday({ id: 'today', date: '2026-10-05' }, '2026-10-05'), true);
  assert.equal(canEditClosingToday({ id: 'yesterday', date: '2026-10-04' }, '2026-10-05'), false);
  assert.equal(canEditClosingToday({ date: '2026-10-05' }, '2026-10-05'), false);
  assert.equal(canEditClosingToday(null, '2026-10-05'), false);
});

test('retificação mantém a versão anterior, ID e data de criação do fechamento', () => {
  const original = { id: 'closing-1', date: '2026-10-05', entryTotal: 100, actual: 100, createdAt: '2026-10-05T16:00:00Z' };
  const revision = buildClosingRevision(original, { entryTotal: 140, actual: 140 }, '2026-10-05T17:00:00Z');
  assert.equal(original.entryTotal, 100);
  assert.equal(revision.before.entryTotal, 100);
  assert.equal(revision.after.entryTotal, 140);
  assert.equal(revision.after.id, original.id);
  assert.equal(revision.after.createdAt, original.createdAt);
  assert.equal(revision.after.revision, 1);
  assert.equal(revision.after.updatedAt, '2026-10-05T17:00:00Z');
});

test('Contas a pagar oferece atualização manual sem sair do módulo e preserva sync compartilhado', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /id="payableSyncNow"/);
  assert.match(html, /qs\('#payableSyncNow'\)\.addEventListener\('click',syncPayablesNow\)/);
  assert.match(html, /async function syncPayablesNow\(\)[\s\S]*?apiFetch\('\/api\/state'\)/);
  assert.match(html, /function savePayable\(event\)[\s\S]*?saveState\(\)/);
  assert.match(html, /function handlePayableAction\(event\)[\s\S]*?saveState\(\)/);
  assert.match(html, /setInterval\(refreshServerStateIfChanged, 15000\)/);
});

test('Conciliação e resumo de ciclos usam somente saídas em PIX para o abatimento', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /t\.type==='saida' && String\(t\.paymentMethod \|\| ''\)\.toLowerCase\(\)==='pix'/);
  assert.match(html, /Total de movimentos PIX/);
  assert.match(html, /Total a subtrair do saldo/);
  assert.match(html, /finalBalance: cashEntries - cashExits - paidAccounts - pixExits/);
  assert.match(html, /Resultado final/);
});
