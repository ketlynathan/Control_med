'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareBusinessState } = require('../src/migration/integrity-comparator');

test('compara módulos aninhados do legado com o schema normalizado', () => {
  const result = compareBusinessState({
    businessId: 'business-1',
    legacyState: {
      transactions: [
        { id: 'tx-1', amount: 271.14 },
        { id: 'tx-2', amount: 70 }
      ],
      payables: { entries: [{ id: 'pay-1', amount: 100 }] },
      drogaria: { products: [{ id: 'product-1', name: 'Produto' }] }
    },
    normalized: {
      financialTransactions: [
        { legacy_id: 'tx-1', amount: 27114 },
        { legacy_id: 'tx-2', amount: 70 }
      ],
      payableAccounts: [{ legacy_id: 'pay-1', amount: 100 }],
      pharmacyProducts: [{ legacy_id: 'product-1' }]
    }
  });

  assert.equal(result.businessId, 'business-1');
  assert.equal(result.modules.transactions.legacyCount, 2);
  assert.equal(result.modules.transactions.normalizedCount, 2);
  assert.equal(result.modules.transactions.amount.multipliedBy100, 1);
  assert.equal(result.modules.transactions.amount.sameValue, 1);
  assert.equal(result.modules.payables.hasDivergence, false);
  assert.equal(result.modules.products.hasDivergence, false);
  assert.equal(result.hasDivergence, true);
});

test('identifica registros faltantes, extras e ids duplicados', () => {
  const result = compareBusinessState({
    legacyState: {
      collaborators: [
        { id: 'collab-1' },
        { id: 'collab-1' },
        { id: 'collab-2' }
      ]
    },
    normalized: {
      collaborators: [
        { legacy_id: 'collab-1' },
        { legacy_id: 'collab-3' },
        { legacy_id: 'collab-3' }
      ]
    }
  });

  const collaborators = result.modules.collaborators;
  assert.deepEqual(collaborators.missingLegacyIds, ['collab-2']);
  assert.deepEqual(collaborators.extraNormalizedIds, ['collab-3']);
  assert.deepEqual(collaborators.duplicateLegacyIds, ['collab-1']);
  assert.deepEqual(collaborators.duplicateNormalizedIds, ['collab-3']);
  assert.equal(collaborators.hasDivergence, true);
});

test('não marca módulo vazio como divergente', () => {
  const result = compareBusinessState({
    businessId: 'empty-business',
    legacyState: { business: { name: 'Sem operação' } },
    normalized: {}
  });

  assert.equal(result.hasDivergence, false);
  assert.equal(result.modules.transactions.legacyCount, 0);
  assert.equal(result.modules.transactions.normalizedCount, 0);
});
