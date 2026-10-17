const test = require('node:test');
const assert = require('node:assert/strict');
const { getInstallmentProgress, isInstallmentPayment, parseInstallment } = require('../src/shared/installments.js');

test('lê a contagem de parcelas da descrição', () => {
  assert.deepEqual(parseInstallment('Pagamento BEMOL (1/16)'), { current: 1, total: 16 });
  assert.deepEqual(parseInstallment('Pagamento DAVINA (1/8)'), { current: 1, total: 8 });
  assert.equal(isInstallmentPayment('Pagamento DAVINA (1/8)'), true);
  assert.equal(isInstallmentPayment('Compra DAVINA (1/8)'), false);
});

test('mostra todas as parcelas em aberto e avança o progresso ao pagar a atual', () => {
  assert.deepEqual(getInstallmentProgress({ description: 'BEMOL (1/16)', paid: false }), {
    current: 1, total: 16, completed: 0, remaining: 16, percentage: 0,
  });
  assert.deepEqual(getInstallmentProgress({ description: 'BEMOL (1/16)', paid: true }), {
    current: 1, total: 16, completed: 1, remaining: 15, percentage: 6,
  });
});

test('ignora contagem inválida e aceita campos numéricos explícitos', () => {
  assert.equal(parseInstallment('Pagamento (17/16)'), null);
  assert.deepEqual(getInstallmentProgress({ installmentCurrent: 2, installmentTotal: 8 }), {
    current: 2, total: 8, completed: 1, remaining: 7, percentage: 13,
  });
});