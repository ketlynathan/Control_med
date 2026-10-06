(function (root) {
  'use strict';

  const cents = value => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) : 0;
  };
  const amount = value => cents(value) / 100;
  const clean = value => String(value ?? '').trim();
  const within = (date, range) => !!date && (!range.start || date >= range.start) && (!range.end || date <= range.end);
  const sumCents = (items, selector) => items.reduce((total, item) => total + cents(selector(item)), 0);
  const sumValuesCents = (items, selector) => items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
  const hasFilter = value => value != null && value !== '' && value !== 'all';
  const registerMatches = (record, register) => !hasFilter(register) || String(record.register || '') === String(register);
  const userMatches = (record, user) => !hasFilter(user) || String(record.collaborator || record.collaboratorId || '') === String(user);
  const normalizedDescription = value => clean(value).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const paymentMethod = value => {
    const method = normalizedDescription(value);
    if (['cash', 'dinheiro', 'especie'].includes(method)) return 'cash';
    if (['pix'].includes(method)) return 'pix';
    if (['debit', 'debito'].includes(method)) return 'debit';
    if (['credit', 'credito'].includes(method)) return 'credit';
    if (['transferencia', 'transfer'].includes(method)) return 'transferencia';
    if (['outro', 'other'].includes(method)) return 'outro';
    if (['cartao', 'card'].includes(method)) return 'card_unspecified';
    return 'nao_informado';
  };
  const expenseCategories = ['Alimentação', 'Transporte', 'Medicamentos', 'Mercadorias', 'Material / Operacional', 'Financeiro', 'Outros / Não classificado'];

  function inferExpenseCategory(description, existingCategory = '') {
    if (clean(existingCategory)) {
      const existing = normalizedDescription(existingCategory);
      if (existing === 'alimentacao') return 'Alimentação';
      if (existing === 'transporte') return 'Transporte';
      if (existing === 'medicamento' || existing === 'medicamentos' || existing === 'medicamentos/saude') return 'Medicamentos';
      if (existing === 'mercadoria' || existing === 'mercadorias' || existing === 'compras') return 'Mercadorias';
      if (existing === 'material' || existing === 'material / operacional') return 'Material / Operacional';
      if (existing === 'emprestimo' || existing === 'emprestimos' || existing === 'financeiro') return 'Financeiro';
      if (existing === 'outros' || existing === 'sem categoria' || existing === 'outros / nao classificado') return 'Outros / Não classificado';
      return clean(existingCategory);
    }
    const text = normalizedDescription(description);
    if (/agua sanitaria|detergente|sabonete|tinta|papel|fita|pano de chao|copo descartavel|material/.test(text)) return 'Material / Operacional';
    if (/uber|passagem|transporte|gasolina|frete|deslocamento|onibus|taxi/.test(text)) return 'Transporte';
    if (/medicamento|remedio|drogaria|farmacia/.test(text)) return 'Medicamentos';
    if (/emprestimo|devolucao pix|ajuda/.test(text)) return 'Financeiro';
    if (/mercadoria|compras?|loja|mutirao/.test(text)) return 'Mercadorias';
    if (/merenda|cafe|almoco|lanche|pao|comida|fruta|queijo|agua|coca/.test(text)) return 'Alimentação';
    return 'Outros / Não classificado';
  }

  function buildFinancialLedger(state = {}) {
    const transactions = Array.isArray(state.transactions) ? state.transactions : [];
    const closings = Array.isArray(state.closings) ? state.closings : [];
    const openings = Array.isArray(state.openings) ? state.openings : [];
    const categoryOverrides = state.analyticsCategories || {};
    const fundDisposition = state.financialReconciliation?.fundDispositionById || {};
    const paymentMethodOverrides = state.financialReconciliation?.expensePaymentMethodById || {};
    const transactionPaymentOverrides = state.financialReconciliation?.transactionPaymentMethodById || {};
    const records = [];
    const directRows = [];
    const expenseRows = [];
    const closingEntryRows = [];
    const push = row => { records.push(row); return row; };

    transactions.forEach(tx => {
      const id = String(tx.id || '');
      const row = push({
        id: `transaction:${id}`, date: tx.date || null, valueCents: cents(tx.amount), type: tx.type,
        responsible: tx.collaborator || null, register: tx.register || null,
        category: tx.type === 'saida' ? inferExpenseCategory(tx.description, categoryOverrides[`transaction:${id}`] || tx.category) : clean(tx.category) || null,
        description: clean(tx.description), origin: 'financial_transaction', sourceModule: 'financial_transactions',
        relatedClosingId: tx.closingId || null, relatedTransactionId: id || null,
        paymentMethod: paymentMethod(transactionPaymentOverrides[id] || tx.paymentMethod), status: tx.reconciled ? 'registered_reconciled' : 'registered_unreconciled',
        createdAt: tx.createdAt || null, updatedAt: tx.updatedAt || tx.createdAt || null,
      });
      if (row.type === 'saida' || row.type === 'entrada') directRows.push(row);
    });

    closings.forEach(closing => {
      const closingId = String(closing.id || '');
      const register = closing.register || null;
      const responsible = closing.collaborator || null;
      const closedAt = closing.closedAt || closing.createdAt || null;
      push({
        id: `closing:${closingId}`, date: closing.date || null, valueCents: cents(closing.actual), type: 'fechamento',
        responsible, register, category: null, description: 'Conferência de caixa', origin: 'cash_closing',
        sourceModule: 'cash_closings', relatedClosingId: closingId || null, relatedTransactionId: null,
        paymentMethod: null, status: 'historical_observation', createdAt: closedAt, updatedAt: closing.updatedAt || closedAt,
      });
      const methods = [['pix', closing.pix], ['debit', closing.debit], ['credit', closing.credit], ['cash', closing.cash]];
      let reportedMethodsCents = 0;
      methods.forEach(([method, raw]) => {
        const valueCents = cents(raw);
        if (!valueCents) return;
        reportedMethodsCents += valueCents;
        const entryRow = push({
          id: `closing:${closingId}:entry:${method}`, date: closing.date || null, valueCents, type: 'entrada',
          responsible, register, category: null, description: `Entrada no fechamento (${method})`, origin: 'cash_closing_entry',
          sourceModule: 'cash_closings', relatedClosingId: closingId || null, relatedTransactionId: null,
          paymentMethod: method, status: 'reported_in_closing', createdAt: closedAt, updatedAt: closing.updatedAt || closedAt,
        });
        closingEntryRows.push(entryRow);
      });
      const entryTotalCents = cents(closing.entryTotal ?? reportedMethodsCents / 100);
      const unclassifiedEntryCents = Math.max(0, entryTotalCents - reportedMethodsCents);
      if (unclassifiedEntryCents) push({
        id: `closing:${closingId}:entry:unclassified`, date: closing.date || null, valueCents: unclassifiedEntryCents, type: 'entrada',
        responsible, register, category: null, description: 'Entrada do fechamento — meio não detalhado', origin: 'cash_closing_entry',
        sourceModule: 'cash_closings', relatedClosingId: closingId || null, relatedTransactionId: null,
        paymentMethod: 'nao_informado', status: 'reported_in_closing', createdAt: closedAt, updatedAt: closing.updatedAt || closedAt,
      });
      const expenses = Array.isArray(closing.expenses) ? closing.expenses : [];
      if (expenses.length) {
        expenses.forEach((expense, index) => {
          const id = `closing-expense:${closingId}:${index}`;
          const row = push({
            id, date: closing.date || null, valueCents: cents(expense.amount), type: 'saida',
            responsible: expense.collaborator || responsible, register: expense.register || register,
            category: inferExpenseCategory(expense.description, categoryOverrides[`closing-expense:${closingId}:${index}`] || expense.category),
            description: clean(expense.description), origin: 'cash_closing_expense', sourceModule: 'cash_closing_expenses',
            relatedClosingId: closingId || null, relatedTransactionId: expense.transactionId || null,
            paymentMethod: paymentMethod(paymentMethodOverrides[id] || expense.paymentMethod),
            status: paymentMethod(paymentMethodOverrides[id] || expense.paymentMethod) !== 'nao_informado' ? 'reported_in_closing' : 'payment_method_unclassified',
            createdAt: expense.createdAt || closedAt, updatedAt: expense.updatedAt || closedAt,
          });
          expenseRows.push(row);
        });
      } else if (cents(closing.exitTotal) > 0) {
        const row = push({
          id: `closing:${closingId}:expense:unitemized`, date: closing.date || null, valueCents: cents(closing.exitTotal), type: 'saida',
          responsible, register, category: 'Outros / Não classificado', description: 'Saída do fechamento sem detalhamento',
          origin: 'cash_closing_expense', sourceModule: 'cash_closings', relatedClosingId: closingId || null, relatedTransactionId: null,
          paymentMethod: 'nao_informado', status: 'detail_unavailable', createdAt: closedAt, updatedAt: closing.updatedAt || closedAt,
        });
        expenseRows.push(row);
      }
    });

    openings.forEach(opening => {
      const id = String(opening.id || '');
      const explicitDisposition = fundDisposition[id] || opening.ledgerDisposition || null;
      const previousClosings = closings.filter(closing => String(closing.register || '') === String(opening.register || '') && String(closing.date || '') < String(opening.date || '') && closing.actual !== null && closing.actual !== undefined);
      previousClosings.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.closedAt || b.createdAt || '').localeCompare(String(a.closedAt || a.createdAt || '')) || String(b.id || '').localeCompare(String(a.id || '')));
      const prior = previousClosings[0] || null;
      const matchesPriorCount = !!prior && cents(opening.amount) === cents(prior.actual);
      const disposition = explicitDisposition || (prior ? 'pending' : 'initial-balance');
      const status = disposition === 'carry-forward' ? 'carried_forward' : disposition === 'contribution' ? 'confirmed_contribution' : disposition === 'initial-balance' ? 'initial_balance' : 'possible_carry_forward';
      push({
        id: `fund:${id}`, date: opening.date || null, valueCents: cents(opening.amount),
        type: disposition === 'carry-forward' ? 'transferencia' : 'fundo',
        responsible: opening.collaborator || null, register: opening.register || null, category: null,
        description: clean(opening.notes) || 'Fundo de caixa', origin: disposition === 'carry-forward' ? 'cash_carry_forward' : 'cash_fund', sourceModule: 'cash_openings',
        relatedClosingId: null, relatedTransactionId: opening.transactionId || null,
        paymentMethod: 'dinheiro', status, createdAt: opening.createdAt || null, updatedAt: opening.updatedAt || opening.createdAt || null,
        priorClosingId: prior?.id || null, priorCountCents: prior ? cents(prior.actual) : null,
      });
    });

    const payableRows = Array.isArray(state.payables?.entries) ? state.payables.entries : [];
    payableRows.forEach((payable, index) => {
      const id = String(payable.id || `index-${index}`);
      push({
        id: `payable:${id}`, date: payable.dueDate || payable.date || null, valueCents: cents(payable.amount), type: 'obrigacao',
        responsible: clean(payable.responsible || payable.collaboratorId) || null, register: null,
        category: clean(payable.category) || 'Sem categoria', description: clean(payable.description || payable.supplier) || 'Conta a pagar',
        origin: 'payables', sourceModule: 'payables', sourceId: id, relatedClosingId: null, relatedTransactionId: null,
        paymentMethod: paymentMethod(payable.paymentMethod), status: payable.paid ? 'paid_obligation' : 'open_obligation',
        paidAt: payable.paidAt || null, createdAt: payable.createdAt || null, updatedAt: payable.updatedAt || null,
      });
    });

    const products = Array.isArray(state.drogaria?.products) ? state.drogaria.products : [];
    products.forEach((product, index) => {
      const id = String(product.id || `index-${index}`);
      const quantity = Number(product.currentStock) || 0;
      const unitCost = product.costPrice ?? product.unitCost ?? product.purchasePrice ?? product.cost;
      const valued = unitCost !== undefined && unitCost !== null && unitCost !== '';
      push({
        id: `inventory:${id}`, date: product.updatedAt || null, valueCents: valued ? cents(Number(unitCost) * quantity) : 0, type: 'estoque',
        responsible: null, register: null, category: 'Estoque', description: clean(product.name) || 'Produto', origin: 'pharmacy_inventory',
        sourceModule: 'inventory', sourceId: id, quantity, unitCostCents: valued ? cents(unitCost) : null,
        valuationStatus: valued ? 'estimated_cost_value' : 'unvalued_missing_cost', paymentMethod: 'nao_informado',
        status: Number(product.currentStock) <= Number(product.minimumStock) ? 'low_stock' : 'in_stock',
        createdAt: product.createdAt || null, updatedAt: product.updatedAt || null,
      });
    });

    const convenioRows = Array.isArray(state.convenio?.entries) ? state.convenio.entries : [];
    convenioRows.forEach((entry, index) => {
      const id = String(entry.id || `index-${index}`);
      const entryTotal = entry.total ?? (Number(entry.quantity) * Number(entry.unitPrice));
      const paidFlag = entry.paid ?? entry.received ?? entry.isPaid;
      push({
        id: `convenio:${id}`, date: entry.date || entry.entryDate || null, valueCents: cents(entryTotal), type: 'convenio_receivable',
        responsible: clean(entry.collaboratorId || entry.collaborator) || null, register: null,
        category: 'Convênio', description: clean(entry.productName || entry.product || entry.description) || 'Lançamento de convênio',
        origin: 'convenio', sourceModule: 'convenio', sourceId: id, quantity: Number(entry.quantity) || null,
        paymentMethod: paymentMethod(entry.paymentMethod),
        status: typeof paidFlag === 'boolean' ? (paidFlag ? 'received' : 'receivable_open') : (clean(entry.status) || 'payment_state_unclassified'),
        notes: clean(entry.notes) || null, createdAt: entry.createdAt || null, updatedAt: entry.updatedAt || null,
      });
    });

    const duplicatePairs = [];
    const duplicateTransactionIds = new Set();
    const duplicateExpenseIds = new Set();
    expenseRows.forEach(expense => {
      const desc = normalizedDescription(expense.description);
      if (!desc) return;
      const candidates = directRows.filter(tx => tx.type === 'saida' && tx.date === expense.date && String(tx.register || '') === String(expense.register || '') && tx.valueCents === expense.valueCents && normalizedDescription(tx.description) === desc && (!tx.responsible || !expense.responsible || tx.responsible === expense.responsible) && (!tx.paymentMethod || tx.paymentMethod === 'nao_informado' || expense.paymentMethod === 'nao_informado' || tx.paymentMethod === expense.paymentMethod));
      if (!candidates.length) return;
      candidates.forEach(tx => duplicateTransactionIds.add(tx.id));
      duplicateExpenseIds.add(expense.id);
      duplicatePairs.push({ id: `possible-duplicate:${expense.id}`, date: expense.date, valueCents: expense.valueCents, type: 'saida', status: 'possible_duplicate', transactionIds: candidates.map(tx => tx.relatedTransactionId), expenseId: expense.id, closingId: expense.relatedClosingId, register: expense.register, responsible: expense.responsible, description: expense.description });
    });
    duplicateTransactionIds.forEach(id => { const row = records.find(item => item.id === id); if (row) { row.possibleDuplicateExpense = true; row.status = 'possible_duplicate_expense'; } });
    duplicateExpenseIds.forEach(id => { const row = records.find(item => item.id === id); if (row) { row.possibleDuplicateExpense = true; row.status = 'possible_duplicate'; } });

    const usedClosingEntryIds = new Set();
    directRows.filter(row => row.type === 'entrada').forEach(transaction => {
      if (transaction.relatedClosingId) {
        const linked = closingEntryRows.find(row => row.relatedClosingId === transaction.relatedClosingId && row.paymentMethod === transaction.paymentMethod);
        if (linked && transaction.valueCents === linked.valueCents) {
          transaction.possibleDuplicateEntry = true;
          transaction.status = 'possible_duplicate_entry';
          usedClosingEntryIds.add(linked.id);
          duplicatePairs.push({ id: `possible-duplicate:${transaction.id}`, date: transaction.date, valueCents: transaction.valueCents, type: 'entrada', status: 'possible_duplicate', transactionIds: [transaction.relatedTransactionId], closingEntryId: linked.id, closingId: linked.relatedClosingId, register: transaction.register, responsible: transaction.responsible, description: transaction.description || linked.description });
        }
      } else {
        const candidate = closingEntryRows.find(row => !usedClosingEntryIds.has(row.id) && row.date === transaction.date && String(row.register || '') === String(transaction.register || '') && row.paymentMethod === transaction.paymentMethod && row.valueCents === transaction.valueCents);
        if (candidate) {
          transaction.possibleDuplicateEntry = true;
          transaction.status = 'possible_duplicate_entry';
          usedClosingEntryIds.add(candidate.id);
          duplicatePairs.push({ id: `possible-duplicate:${transaction.id}`, date: transaction.date, valueCents: transaction.valueCents, type: 'entrada', status: 'possible_duplicate', transactionIds: [transaction.relatedTransactionId], closingEntryId: candidate.id, closingId: candidate.relatedClosingId, register: transaction.register, responsible: transaction.responsible, description: transaction.description || candidate.description });
        }
      }
    });

    const confirmedRecords = records.filter(row => {
      if (!(row.type === 'entrada' || row.type === 'saida' || (row.type === 'fundo' && row.status === 'confirmed_contribution'))) return false;
      // Keep source-module rows intact. Cross-module matches are flagged, not merged into either module's totals.
      return true;
    });
    const cashRecords = confirmedRecords.filter(row => ['cash_closings', 'cash_closing_expenses'].includes(row.sourceModule));
    const movementRecords = confirmedRecords.filter(row => row.sourceModule === 'financial_transactions');
    const sumType = (sourceRows, type) => sumValuesCents(sourceRows.filter(row => row.type === type), row => row.valueCents);
    const paymentMethods = ['pix', 'debit', 'credit', 'cash', 'card_unspecified', 'transferencia', 'outro', 'nao_informado'];
    const paymentTotalsCents = Object.fromEntries(paymentMethods.map(method => [method, sumValuesCents(confirmedRecords.filter(row => row.type === 'entrada' && row.sourceModule === 'cash_closings' && row.paymentMethod === method), row => row.valueCents)]));
    const categoryRows = confirmedRecords.filter(row => row.type === 'saida');
    const totalExpenseByModule = new Map();
    const categoryTotals = new Map();
    categoryRows.forEach(row => {
      const category = row.category || 'Outros / Não classificado';
      const key = `${row.sourceModule}|${category}`;
      if (!categoryTotals.has(key)) categoryTotals.set(key, { category, sourceModule: row.sourceModule, count: 0, amountCents: 0, daily: {}, responsible: {}, registers: {}, topExpenses: [] });
      const item = categoryTotals.get(key);
      item.count += 1;
      item.amountCents += row.valueCents;
      totalExpenseByModule.set(row.sourceModule, (totalExpenseByModule.get(row.sourceModule) || 0) + row.valueCents);
      item.daily[row.date || 'sem-data'] = (item.daily[row.date || 'sem-data'] || 0) + row.valueCents;
      const user = row.responsible || 'Não informado';
      const register = row.register || 'Não informado';
      item.responsible[user] = (item.responsible[user] || 0) + row.valueCents;
      item.registers[register] = (item.registers[register] || 0) + row.valueCents;
      item.topExpenses.push({ id: row.id, date: row.date, description: row.description, amountCents: row.valueCents, responsible: user, register });
    });
    const categories = [...categoryTotals.values()].map(item => ({ ...item, percentCents: totalExpenseByModule.get(item.sourceModule) ? Math.round(item.amountCents * 10000 / totalExpenseByModule.get(item.sourceModule)) : 0, topExpenses: item.topExpenses.sort((a, b) => b.amountCents - a.amountCents || String(a.date).localeCompare(String(b.date))).slice(0, 5) })).sort((a, b) => a.sourceModule.localeCompare(b.sourceModule) || b.amountCents - a.amountCents || a.category.localeCompare(b.category, 'pt-BR'));
    const contributionsCents = sumValuesCents(confirmedRecords.filter(row => row.type === 'fundo'), row => row.valueCents);
    const pendingFundCents = sumValuesCents(records.filter(row => row.sourceModule === 'cash_openings' && row.status === 'possible_carry_forward'), row => row.valueCents);
    const duplicatePendingCents = sumValuesCents(duplicatePairs, row => row.valueCents);
    return {
      records, confirmedRecords, possibleDuplicates: duplicatePairs, categories, paymentTotalsCents,
      totals: { cashEntriesCents: sumType(cashRecords, 'entrada'), cashExitsCents: sumType(cashRecords, 'saida'), cashBalanceCents: sumType(cashRecords, 'entrada') - sumType(cashRecords, 'saida'), movementEntriesCents: sumType(movementRecords, 'entrada'), movementExitsCents: sumType(movementRecords, 'saida'), movementBalanceCents: sumType(movementRecords, 'entrada') - sumType(movementRecords, 'saida'), fundsCents: contributionsCents, pendingFundCents, fundEventsCents: sumValuesCents(records.filter(row => row.sourceModule === 'cash_openings'), row => row.valueCents), cashPhysicalExpenseCents: sumValuesCents(cashRecords.filter(row => row.type === 'saida' && row.paymentMethod === 'cash'), row => row.valueCents), cashUnclassifiedExpenseMethodCents: sumValuesCents(cashRecords.filter(row => row.type === 'saida' && row.paymentMethod === 'nao_informado'), row => row.valueCents), duplicatePendingCents },
    };
  }

  function filterFinancialLedger(ledger, filters = {}) {
    const range = filters.range || { start: '', end: '' };
    const module = filters.module || 'all';
    const sourceMatches = row => module === 'all' || (module === 'cash' && ['cash_closings', 'cash_closing_expenses', 'cash_openings'].includes(row.sourceModule)) || (module === 'movement' && row.sourceModule === 'financial_transactions') || (module === 'payables' && row.sourceModule === 'payables') || (module === 'inventory' && row.sourceModule === 'inventory') || (module === 'convenio' && row.sourceModule === 'convenio');
    const records = (ledger?.records || []).filter(row => {
      if (!within(row.date, range) || !userMatches({ collaborator: row.responsible }, filters.user || 'all') || !registerMatches(row, filters.register || 'all')) return false;
      if (filters.type && filters.type !== 'all' && row.type !== filters.type) return false;
      if (filters.category && filters.category !== 'all' && row.category !== filters.category) return false;
      if (!sourceMatches(row)) return false;
      if (row.type === 'fechamento' || row.type === 'transferencia') return false;
      return true;
    });
    const cashRecords = records.filter(row => ['cash_closings', 'cash_closing_expenses'].includes(row.sourceModule));
    const movementRecords = records.filter(row => row.sourceModule === 'financial_transactions');
    const entries = cashRecords.filter(row => row.type === 'entrada');
    const exits = cashRecords.filter(row => row.type === 'saida');
    const movementEntries = movementRecords.filter(row => row.type === 'entrada');
    const movementExits = movementRecords.filter(row => row.type === 'saida');
    const funds = records.filter(row => row.type === 'fundo' && row.status === 'confirmed_contribution');
    const sum = rows => sumValuesCents(rows, row => row.valueCents);
    const methods = ['pix', 'debit', 'credit', 'cash', 'card_unspecified', 'transferencia', 'outro', 'nao_informado'];
    return {
      records, cashEntriesCents: sum(entries), cashExitsCents: sum(exits), cashBalanceCents: sum(entries) - sum(exits),
      movementEntriesCents: sum(movementEntries), movementExitsCents: sum(movementExits), movementBalanceCents: sum(movementEntries) - sum(movementExits), fundsCents: sum(funds),
      paymentTotalsCents: Object.fromEntries(methods.map(method => [method, sum(entries.filter(row => row.sourceModule === 'cash_closings' && row.paymentMethod === method))])),
      fundEventsCents: sum(ledger?.records?.filter(row => row.sourceModule === 'cash_openings' && within(row.date, range) && registerMatches(row, filters.register || 'all') && userMatches({ collaborator: row.responsible }, filters.user || 'all')) || []),
      possibleDuplicates: (ledger?.possibleDuplicates || []).filter(row => within(row.date, range) && registerMatches(row, filters.register || 'all') && userMatches({ collaborator: row.responsible }, filters.user || 'all')),
      pendingFundCents: sum((ledger?.records || []).filter(row => row.sourceModule === 'cash_openings' && row.status === 'possible_carry_forward' && within(row.date, range) && registerMatches(row, filters.register || 'all') && userMatches({ collaborator: row.responsible }, filters.user || 'all'))),
    };
  }

  function getCashBaseForClosing(closings = [], openings = [], register, date, fundDispositionById = {}) {
    const eligibleClosings = closings.filter(row => String(row.register || '') === String(register || '') && row.date < date && row.actual !== undefined && row.actual !== null && Number.isFinite(Number(row.actual)));
    eligibleClosings.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.closedAt || b.createdAt || '').localeCompare(String(a.closedAt || a.createdAt || '')) || String(b.id || '').localeCompare(String(a.id || '')));
    let baseAmountCents = 0;
    let source = 'zero-unconfirmed';
    let sourceDate = null;
    let sourceId = null;
    let previousActualCents = null;
    if (eligibleClosings.length) {
      const closing = eligibleClosings[0];
      baseAmountCents = cents(closing.actual);
      previousActualCents = baseAmountCents;
      source = 'previous-count';
      sourceDate = closing.date;
      sourceId = closing.id || null;
    } else {
      const eligibleOpenings = openings.filter(row => String(row.register || '') === String(register || '') && row.date <= date && Number.isFinite(Number(row.amount)));
      eligibleOpenings.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id || '').localeCompare(String(b.id || '')));
      if (eligibleOpenings.length) {
        const first = eligibleOpenings[0];
        baseAmountCents = cents(first.amount);
        source = 'initial-fund';
        sourceDate = first.date;
        sourceId = first.id || null;
      }
    }
    const laterOpenings = openings.filter(row => String(row.register || '') === String(register || '') && row.date <= date && row.id !== sourceId && (sourceDate ? row.date >= sourceDate : true) && Number.isFinite(Number(row.amount)));
    let incrementalFundCents = 0;
    let pendingFundCents = 0;
    const includedFundIds = [];
    const pendingFundIds = [];
    laterOpenings.forEach(opening => {
      const disposition = fundDispositionById[String(opening.id || '')] || opening.ledgerDisposition || '';
      if (disposition === 'carry-forward') return;
      if (disposition === 'contribution') {
        incrementalFundCents += cents(opening.amount);
        includedFundIds.push(opening.id || null);
        return;
      }
      // Historical openings without explicit provenance are not presumed new cash.
      pendingFundCents += cents(opening.amount);
      pendingFundIds.push(opening.id || null);
    });
    const repeatedOpeningCount = source === 'initial-fund' ? Math.max(0, openings.filter(row => String(row.register || '') === String(register || '') && row.date <= date).length - 1) : 0;
    return { amountCents: baseAmountCents, source, sourceDate, sourceId, repeatedOpeningCount, incrementalFundCents, pendingFundCents, includedFundIds, pendingFundIds };
  }

  function calculateClosingCashReconciliation(state = {}, closing = {}) {
    const ledger = buildFinancialLedger(state);
    const register = String(closing.register || '');
    const date = closing.date || '';
    const priorRows = (state.closings || []).filter(row => String(row.register || '') === register && row.date < date && Number.isFinite(Number(row.actual))).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.closedAt || b.createdAt || '').localeCompare(String(a.closedAt || a.createdAt || '')) || String(b.id || '').localeCompare(String(a.id || '')));
    const prior = priorRows[0] || null;
    const initial = prior ? null : (state.openings || []).filter(row => String(row.register || '') === register && row.date <= date).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id || '').localeCompare(String(b.id || '')))[0] || null;
    const baseCents = prior ? cents(prior.actual) : initial ? cents(initial.amount) : 0;
    const baseDate = prior?.date || initial?.date || null;
    const baseId = prior?.id || initial?.id || null;
    const fundRows = ledger.records.filter(row => row.sourceModule === 'cash_openings' && String(row.register || '') === register && row.date <= date && row.id !== `fund:${baseId}` && (!baseDate || row.date >= baseDate));
    const confirmedFundCents = sumValuesCents(fundRows.filter(row => row.status === 'confirmed_contribution'), row => row.valueCents);
    const pendingFundsCents = sumValuesCents(fundRows.filter(row => row.status === 'possible_carry_forward'), row => row.valueCents);
    const dayEntries = ledger.records.filter(row => row.date === date && String(row.register || '') === register && row.sourceModule === 'cash_closings' && row.type === 'entrada' && row.paymentMethod === 'cash');
    const cashEntryCents = sumValuesCents(dayEntries, row => row.valueCents);
    const closingCashOut = ledger.records.filter(row => row.date === date && String(row.register || '') === register && row.type === 'saida' && row.sourceModule === 'cash_closing_expenses' && row.paymentMethod === 'cash');
    const cashExpenseCents = sumValuesCents(closingCashOut, row => row.valueCents);
    const unknownOutflows = ledger.records.filter(row => row.date === date && String(row.register || '') === register && row.sourceModule === 'cash_closing_expenses' && row.type === 'saida' && ['nao_informado', 'card_unspecified'].includes(row.paymentMethod));
    const unknownOutflowCents = sumValuesCents(unknownOutflows, row => row.valueCents);
    const expectedCents = baseCents + confirmedFundCents + cashEntryCents - cashExpenseCents;
    const missingBase = !prior && !initial;
    const provisional = missingBase || pendingFundsCents > 0 || unknownOutflowCents > 0;
    const actualCents = cents(closing.actual);
    return {
      expectedCents, actualCents, differenceCents: actualCents - expectedCents,
      baseCents, baseDate, baseId, baseSource: prior ? 'previous-count' : initial ? 'initial-fund' : 'missing',
      confirmedFundCents, pendingFundsCents, cashEntryCents, cashExpenseCents, unknownOutflowCents,
      provisional, status: provisional ? 'provisional' : 'reconciled_inputs', missingBase,
    };
  }

  function buildRegisterSummary(state = {}) {
    const openings = Array.isArray(state.openings) ? state.openings : [];
    const ledger = buildFinancialLedger(state);
    const movementEntriesCents = sumValuesCents(ledger.confirmedRecords.filter(row => row.type === 'entrada' && row.sourceModule === 'financial_transactions'), row => row.valueCents);
    const movementExitsCents = sumValuesCents(ledger.confirmedRecords.filter(row => row.type === 'saida' && row.sourceModule === 'financial_transactions'), row => row.valueCents);
    const closingEntriesCents = sumValuesCents(ledger.confirmedRecords.filter(row => row.type === 'entrada' && row.sourceModule === 'cash_closings'), row => row.valueCents);
    const closingExitsCents = sumValuesCents(ledger.confirmedRecords.filter(row => row.type === 'saida' && row.sourceModule !== 'financial_transactions' && row.sourceModule !== 'payables' && row.sourceModule !== 'inventory' && row.sourceModule !== 'convenio'), row => row.valueCents);
    const financialTransactionsEntriesCents = movementEntriesCents;
    const financialTransactionsExitsCents = movementExitsCents;
    const lastFund = openings.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.id || '').localeCompare(String(a.id || '')))[0] || null;
    const entriesCents = closingEntriesCents;
    const exitsCents = closingExitsCents;
    const fundEventsCents = ledger.totals.fundEventsCents;
    const fundsCents = ledger.totals.fundsCents;
    const possibleFundCents = Math.max(0, fundEventsCents - fundsCents - sumValuesCents(ledger.records.filter(row => row.type === 'transferencia' && row.sourceModule === 'cash_openings'), row => row.valueCents));
    return {
      movementEntriesCents: financialTransactionsEntriesCents,
      closingEntriesCents,
      cashEntriesCents: entriesCents,
      movementExitsCents: financialTransactionsExitsCents,
      closingExitsCents,
      cashExitsCents: exitsCents,
      cashBalanceCents: entriesCents - exitsCents,
      fundsCents,
      fundEventsCents,
      possibleFundCents,
      cashBalanceWithConfirmedFundsCents: entriesCents - exitsCents + fundsCents,
      paymentTotalsCents: ledger.paymentTotalsCents,
      duplicatePairs: ledger.possibleDuplicates,
      lastFund,
      ledger,
    };
  }

  function buildModuleMetrics(state, ledgerRows, filters = {}, today = new Date().toISOString().slice(0, 10), categoryOf = row => clean(row.category) || 'Sem categoria') {
    const financialLedger = buildFinancialLedger(state);
    const filteredLedger = filterFinancialLedger(financialLedger, filters);
    const range = filters.range || { start: '', end: '' };
    const user = filters.user || 'all';
    const register = filters.register || 'all';
    const category = filters.category || 'all';
    const type = filters.type || 'all';
    const module = filters.module || 'all';
    const moduleSelected = id => module === 'all' || module === id;
    const categoryMatch = row => !hasFilter(category) || categoryOf(row) === category;
    const cashRows = filteredLedger.records.filter(row => row.sourceModule !== 'financial_transactions');
    const movementRows = filteredLedger.records.filter(row => row.sourceModule === 'financial_transactions');
    const movementEntries = sumValuesCents(movementRows.filter(row => row.type === 'entrada'), row => row.valueCents);
    const movementExits = sumValuesCents(movementRows.filter(row => row.type === 'saida'), row => row.valueCents);

    const closings = (state.closings || []).filter(row => within(row.date, range) && userMatches(row, user) && registerMatches(row, register));
    const closingEntries = type === 'saida' ? 0 : sumValuesCents(filteredLedger.records.filter(row => row.sourceModule === 'cash_closings' && row.type === 'entrada'), row => row.valueCents);
    const closingExitTotalRaw = type === 'entrada' ? 0 : sumCents(closings, row => row.exitTotal);
    const closingExpenses = type === 'entrada' ? 0 : sumValuesCents(filteredLedger.records.filter(row => row.sourceModule === 'cash_closing_expenses' && row.type === 'saida'), row => row.valueCents);
    const cashTotalExits = type === 'entrada' ? 0 : sumCents(closings, row => Array.isArray(row.expenses) && row.expenses.length ? row.expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0) : row.exitTotal);
    const cashClosingDifference = cashTotalExits - closingExitTotalRaw;
    const closingExpensesWithoutDetail = closings.filter(row => !(Array.isArray(row.expenses) && row.expenses.length) && cents(row.exitTotal) > 0);
    const closingEntryLedger = type === 'saida' ? 0 : sumValuesCents(cashRows.filter(row => row.type === 'entrada'), row => row.valueCents);
    const openings = (state.openings || []).filter(row => within(row.date, range) && userMatches(row, user) && registerMatches(row, register));
    const openingEvents = sumCents(openings, row => row.amount);

    const payablesAll = ((state.payables || {}).entries || []).filter(row => !row.paid);
    const payablesInRange = ((state.payables || {}).entries || []).filter(row => within(row.paid ? String(row.paidAt || row.dueDate || '').slice(0, 10) : row.dueDate, range) && (!hasFilter(category) || clean(row.category) === category));
    const payablesPaidInRange = payablesInRange.filter(row => !!row.paid);
    const payablesOpenInRange = payablesInRange.filter(row => !row.paid);
    const payablesOverdue = payablesAll.filter(row => row.dueDate && row.dueDate < today);
    const payablesOpenTotal = sumCents(payablesAll, row => row.amount);
    const payablesPaidTotal = sumCents(payablesPaidInRange, row => row.amount);
    const payablesPeriodOpenTotal = sumCents(payablesOpenInRange, row => row.amount);
    const payablesOverdueTotal = sumCents(payablesOverdue, row => row.amount);

    const products = ((state.drogaria || {}).products || []);
    const relevantProducts = products.filter(row => !row.purchased);
    const lowStock = relevantProducts.filter(row => Number(row.currentStock || 0) <= Number(row.minimumStock || 0));
    const attentionPercent = Number(state.drogaria?.config?.attentionPercent || 130);
    const attentionStock = relevantProducts.filter(row => Number(row.currentStock || 0) > Number(row.minimumStock || 0) && Number(row.currentStock || 0) <= Math.ceil(Number(row.minimumStock || 0) * attentionPercent / 100));
    const expiredProducts = products.filter(row => row.expiryDate && row.expiryDate < today);
    const expiringProducts = products.filter(row => row.expiryDate && row.expiryDate >= today && row.expiryDate <= new Date(new Date(`${today}T12:00:00`).getTime() + 90 * 86400000).toISOString().slice(0, 10));
    const productsWithCost = products.filter(row => ['costPrice', 'unitCost', 'purchasePrice', 'cost'].some(key => row[key] !== undefined && row[key] !== null && row[key] !== ''));
    const stockValue = productsWithCost.length === products.length && products.length > 0
      ? products.reduce((total, row) => total + cents(row.currentStock) * cents(row.costPrice ?? row.unitCost ?? row.purchasePrice ?? row.cost) / 100, 0)
      : null;

    const convenioEntries = ((state.convenio || {}).entries || []).filter(row => within(row.date, range) && (!hasFilter(user) || String(row.collaboratorId || '') === String(user)));
    const convenioTotal = sumCents(convenioEntries, row => row.total);
    const convenioHasPaymentState = convenioEntries.some(row => ['paid', 'received', 'status'].some(key => Object.hasOwn(row, key)));

    const allDirectRows = (state.transactions || []).filter(row => within(row.date, range) && userMatches(row, user) && registerMatches(row, register) && (type === 'all' || row.type === type) && (!hasFilter(category) || categoryOf(row) === category));
    const missingResponsible = allDirectRows.filter(row => !clean(row.collaborator));
    const missingCategory = allDirectRows.filter(row => row.type === 'saida' && !clean(row.category));
    const missingRegister = allDirectRows.filter(row => !clean(row.register) || row.register === 'none');
    const pendingReconciliation = allDirectRows.filter(row => !row.reconciled);
    const duplicateGroups = new Map();
    allDirectRows.forEach(row => {
      const key = [row.date, row.register || '', row.type, cents(row.amount), normalizedDescription(row.description)].join('|');
      duplicateGroups.set(key, (duplicateGroups.get(key) || 0) + 1);
    });
    const duplicateExtraRows = [...duplicateGroups.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
    const negativeExpected = closings.filter(row => Number(row.expected) < 0);
    const inconsistentStoredDifference = closings.filter(row => cents(row.actual) - cents(row.expected) !== cents(row.diff ?? (Number(row.actual) - Number(row.expected))));
    const recalculatedClosings = closings.map(row => ({ closing: row, ...calculateClosingCashReconciliation(state, row) }));
    const recalculatedExpectedDifferences = recalculatedClosings.filter(row => row.expectedCents !== cents(row.closing.expected));
    const closingWithoutPriorCount = [];
    const closingsByRegister = new Map();
    (state.closings || []).forEach(row => {
      const key = String(row.register || '');
      if (!closingsByRegister.has(key)) closingsByRegister.set(key, []);
      closingsByRegister.get(key).push(row);
    });
    closingsByRegister.forEach((rows, registerId) => {
      rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.closedAt || a.createdAt || '').localeCompare(String(b.closedAt || b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
      if (!rows.length) return;
      const first = rows[0];
      const initialFund = sumCents((state.openings || []).filter(opening => opening.date === first.date && String(opening.register || '') === registerId), opening => opening.amount);
      if (initialFund === 0) closingWithoutPriorCount.push(first);
    });
    const paidPayablesInRange = payablesInRange.filter(row => row.paid);
    const payableMovementCandidates = [];
    const paidPayablesWithoutCandidate = [];
    paidPayablesInRange.forEach(payable => {
      const basis = payable.paidAt ? String(payable.paidAt).slice(0, 10) : String(payable.dueDate || '').slice(0, 10);
      const candidates = (state.transactions || []).filter(row => row.type === 'saida' && row.date === basis && cents(row.amount) === cents(payable.amount));
      if (candidates.length) payableMovementCandidates.push({ payable, candidates, dateBasis: payable.paidAt ? 'paidAt' : 'dueDate' });
      else paidPayablesWithoutCandidate.push(payable);
    });
    const duplicateClosingExpenseCandidates = filteredLedger.possibleDuplicates;
    const historicalExpensesWithoutMethod = financialLedger.records.filter(row => row.sourceModule === 'cash_closing_expenses' && row.paymentMethod === 'nao_informado' && within(row.date, range) && registerMatches(row, register) && userMatches({ collaborator: row.responsible }, user));

    const applies = {
      cash: moduleSelected('cash'), movement: moduleSelected('movement'), payables: moduleSelected('payables'),
      inventory: moduleSelected('inventory'), convenio: moduleSelected('convenio'),
      filtersNote: [hasFilter(user) ? 'Usuário: não aplicável a contas a pagar e estoque.' : '', hasFilter(register) ? 'Caixa: não aplicável a contas a pagar, estoque e convênio.' : '', hasFilter(category) ? 'Categoria: somente módulos com categoria cadastrada.' : '', type !== 'all' ? 'Tipo entrada/saída: não aplicável a status de contas, estoque e convênio.' : ''].filter(Boolean).join(' ')
    };

    return {
      applied: applies,
      ledger: {
        cashEntries: filteredLedger.cashEntriesCents, cashExits: filteredLedger.cashExitsCents, cashBalance: filteredLedger.cashBalanceCents,
        movementEntries: filteredLedger.movementEntriesCents, movementExits: filteredLedger.movementExitsCents, movementBalance: filteredLedger.movementBalanceCents, funds: filteredLedger.fundsCents,
        fundEvents: filteredLedger.fundEventsCents, pendingFunds: filteredLedger.pendingFundCents,
        paymentTotals: filteredLedger.paymentTotalsCents,
        categories: filteredLedger.records.filter(row => row.type === 'saida'),
      },
      movements: { count: movementRows.length, entries: sumValuesCents(movementRows.filter(row => row.type === 'entrada'), row => row.valueCents), exits: movementExits, pendingReconciliation: pendingReconciliation.length },
      cash: { closingCount: closings.length, entries: closingEntries, totalExits: cashTotalExits, balance: closingEntries - cashTotalExits, closingExitTotalRaw, closingEntryLedger, expenses: closingExpenses, expensesWithoutDetail: closingExpensesWithoutDetail.length, closingDifference: cashClosingDifference, differenceNet: sumCents(closings, row => row.diff ?? (Number(row.actual) - Number(row.expected))), fundsCount: openings.length, fundsEventSum: openingEvents, negativeExpectedCount: negativeExpected.length },
      payables: { openCount: payablesAll.length, openTotal: payablesOpenTotal, paidInRangeCount: payablesPaidInRange.length, paidInRangeTotal: payablesPaidTotal, openInRangeCount: payablesOpenInRange.length, openInRangeTotal: payablesPeriodOpenTotal, overdueCount: payablesOverdue.length, overdueTotal: payablesOverdueTotal },
      inventory: { productCount: products.length, lowStockCount: lowStock.length, attentionCount: attentionStock.length, expiredCount: expiredProducts.length, expiringCount: expiringProducts.length, currentQuantity: sumCents(products, row => row.currentStock), minimumQuantity: sumCents(products, row => row.minimumStock), productsWithCost: productsWithCost.length, valueEstimate: stockValue },
      convenio: { count: convenioEntries.length, total: convenioTotal, hasPaymentState: convenioHasPaymentState },
      integrity: { missingResponsible, missingCategory, missingRegister, duplicateExtraRows, negativeExpected, inconsistentStoredDifference, recalculatedClosings, recalculatedExpectedDifferences, closingWithoutPriorCount, pendingReconciliation, payableMovementCandidates, paidPayablesWithoutCandidate, duplicateClosingExpenseCandidates, historicalExpensesWithoutMethod, pendingFunds: financialLedger.records.filter(row => row.sourceModule === 'cash_openings' && row.status === 'possible_carry_forward' && within(row.date, range) && registerMatches(row, register) && userMatches({ collaborator: row.responsible }, user)) }
    };
  }

  function canEditClosing(closing) {
    return !!closing && !!clean(closing.id) && /^\d{4}-\d{2}-\d{2}$/.test(String(closing.date || ''));
  }

  function buildClosingRevision(closing, changes, updatedAt = new Date().toISOString()) {
    if (!closing || !clean(closing.id)) throw new Error('Fechamento inválido para retificação.');
    const before = JSON.parse(JSON.stringify(closing));
    const after = { ...before, ...changes, id: before.id, createdAt: before.createdAt || updatedAt, closedAt: before.closedAt || updatedAt, updatedAt, revision: (Number(before.revision) || 0) + 1 };
    return { before, after };
  }

  const api = { cents, amount, inferExpenseCategory, buildFinancialLedger, filterFinancialLedger, getCashBaseForClosing, calculateClosingCashReconciliation, buildRegisterSummary, buildModuleMetrics, canEditClosing, buildClosingRevision, expenseCategories };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FinanceAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
