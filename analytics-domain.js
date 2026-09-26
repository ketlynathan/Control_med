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
  const hasFilter = value => value != null && value !== '' && value !== 'all';
  const registerMatches = (record, register) => !hasFilter(register) || String(record.register || '') === String(register);
  const userMatches = (record, user) => !hasFilter(user) || String(record.collaborator || record.collaboratorId || '') === String(user);
  const normalizedDescription = value => clean(value).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

  function getCashBaseForClosing(closings = [], openings = [], register, date) {
    const eligibleClosings = closings.filter(row => String(row.register || '') === String(register || '') && row.date <= date && row.actual !== undefined && row.actual !== null && Number.isFinite(Number(row.actual)));
    eligibleClosings.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.closedAt || b.createdAt || '').localeCompare(String(a.closedAt || a.createdAt || '')) || String(b.id || '').localeCompare(String(a.id || '')));
    if (eligibleClosings.length) {
      const closing = eligibleClosings[0];
      return { amountCents: cents(closing.actual), source: 'previous-count', sourceDate: closing.date, sourceId: closing.id || null, repeatedOpeningCount: 0 };
    }
    const eligibleOpenings = openings.filter(row => String(row.register || '') === String(register || '') && row.date <= date && Number.isFinite(Number(row.amount)));
    eligibleOpenings.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id || '').localeCompare(String(b.id || '')));
    if (!eligibleOpenings.length) return { amountCents: 0, source: 'zero-unconfirmed', sourceDate: null, sourceId: null, repeatedOpeningCount: 0 };
    const first = eligibleOpenings[0];
    return { amountCents: cents(first.amount), source: 'initial-fund', sourceDate: first.date, sourceId: first.id || null, repeatedOpeningCount: eligibleOpenings.length - 1 };
  }

  function buildRegisterSummary(state = {}) {
    const transactions = Array.isArray(state.transactions) ? state.transactions : [];
    const closings = Array.isArray(state.closings) ? state.closings : [];
    const openings = Array.isArray(state.openings) ? state.openings : [];
    const movementEntriesCents = sumCents(transactions.filter(row => row.type === 'entrada'), row => row.amount);
    const movementExitsCents = sumCents(transactions.filter(row => row.type === 'saida'), row => row.amount);
    const closingEntriesCents = sumCents(closings, row => row.entryTotal ?? (Number(row.pix || 0) + Number(row.debit || 0) + Number(row.credit || 0) + Number(row.cash || 0)));
    const closingExitsCents = closings.reduce((total, row) => {
      const details = Array.isArray(row.expenses) ? row.expenses : [];
      return total + (details.length ? sumCents(details, expense => expense.amount) : cents(row.exitTotal));
    }, 0);
    const lastFund = openings.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.id || '').localeCompare(String(a.id || '')))[0] || null;
    const entriesCents = movementEntriesCents + closingEntriesCents;
    const exitsCents = movementExitsCents + closingExitsCents;
    return { movementEntriesCents, closingEntriesCents, entriesCents, movementExitsCents, closingExitsCents, exitsCents, balanceCents: entriesCents - exitsCents, lastFund };
  }

  function buildModuleMetrics(state, ledgerRows, filters = {}, today = new Date().toISOString().slice(0, 10), categoryOf = row => clean(row.category) || 'Sem categoria') {
    const range = filters.range || { start: '', end: '' };
    const user = filters.user || 'all';
    const register = filters.register || 'all';
    const category = filters.category || 'all';
    const type = filters.type || 'all';
    const module = filters.module || 'all';
    const moduleSelected = id => module === 'all' || module === id;
    const categoryMatch = row => !hasFilter(category) || categoryOf(row) === category;
    const cashRows = (ledgerRows || []).filter(row => row.source !== 'movement' && within(row.date, range) && userMatches(row, user) && registerMatches(row, register) && (type === 'all' || row.type === type) && categoryMatch(row));
    const movementRows = (state.transactions || []).map(row => ({ ...row, source: 'movement' })).filter(row => within(row.date, range) && userMatches(row, user) && registerMatches(row, register) && (type === 'all' || row.type === type) && categoryMatch(row));
    const movementEntries = sumCents(movementRows.filter(row => row.type === 'entrada'), row => row.amount);
    const movementExits = sumCents(movementRows.filter(row => row.type === 'saida'), row => row.amount);

    const closings = (state.closings || []).filter(row => within(row.date, range) && userMatches(row, user) && registerMatches(row, register));
    const closingEntries = type === 'saida' ? 0 : sumCents(closings, row => row.entryTotal ?? ((Number(row.pix || 0) + Number(row.debit || 0) + Number(row.credit || 0) + Number(row.cash || 0))));
    const closingExitTotalRaw = type === 'entrada' ? 0 : sumCents(closings, row => row.exitTotal);
    const closingExpenses = type === 'entrada' ? 0 : sumCents(closings.flatMap(row => Array.isArray(row.expenses) ? row.expenses : []), row => row.amount);
    const closingExpensesWithoutDetail = closings.filter(row => !(Array.isArray(row.expenses) && row.expenses.length) && cents(row.exitTotal) > 0);
    const closingEntryLedger = type === 'saida' ? 0 : sumCents(cashRows.filter(row => row.type === 'entrada'), row => row.amount);
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

    const directRows = movementRows;
    const missingResponsible = directRows.filter(row => !clean(row.collaborator));
    const missingCategory = directRows.filter(row => row.type === 'saida' && !clean(row.category));
    const missingRegister = directRows.filter(row => !clean(row.register) || row.register === 'none');
    const pendingReconciliation = directRows.filter(row => !row.reconciled);
    const duplicateGroups = new Map();
    directRows.forEach(row => {
      const key = [row.date, row.register || '', row.type, cents(row.amount), normalizedDescription(row.description)].join('|');
      duplicateGroups.set(key, (duplicateGroups.get(key) || 0) + 1);
    });
    const duplicateExtraRows = [...duplicateGroups.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
    const negativeExpected = closings.filter(row => Number(row.expected) < 0);
    const inconsistentStoredDifference = closings.filter(row => cents(row.actual) - cents(row.expected) !== cents(row.diff ?? (Number(row.actual) - Number(row.expected))));
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
    const duplicateClosingExpenseCandidates = [];
    const movementExitsAll = (state.transactions || []).filter(row => row.type === 'saida');
    (state.closings || []).filter(row => within(row.date, range) && userMatches(row, user) && registerMatches(row, register)).forEach(closing => {
      (closing.expenses || []).forEach((expense, index) => {
        const description = normalizedDescription(expense.description);
        const match = movementExitsAll.find(row => row.date === closing.date && String(row.register || '') === String(closing.register || '') && cents(row.amount) === cents(expense.amount) && (() => {
          const movementDescription = normalizedDescription(row.description);
          return movementDescription === description || (description.length > 3 && (movementDescription.includes(description) || description.includes(movementDescription)));
        })());
        if (match) duplicateClosingExpenseCandidates.push({ closingId: closing.id, expenseIndex: index, transactionId: match.id, amount: cents(expense.amount) });
      });
    });

    const applies = {
      cash: moduleSelected('cash'), movement: moduleSelected('movement'), payables: moduleSelected('payables'),
      inventory: moduleSelected('inventory'), convenio: moduleSelected('convenio'),
      filtersNote: [hasFilter(user) ? 'Usuário: não aplicável a contas a pagar e estoque.' : '', hasFilter(register) ? 'Caixa: não aplicável a contas a pagar, estoque e convênio.' : '', hasFilter(category) ? 'Categoria: somente módulos com categoria cadastrada.' : '', type !== 'all' ? 'Tipo entrada/saída: não aplicável a status de contas, estoque e convênio.' : ''].filter(Boolean).join(' ')
    };

    return {
      applied: applies,
      movements: { count: movementRows.length, entries: movementEntries, exits: movementExits, pendingReconciliation: pendingReconciliation.length },
      cash: { closingCount: closings.length, entries: closingEntries, closingExitTotalRaw, closingEntryLedger, expenses: closingExpenses, expensesWithoutDetail: closingExpensesWithoutDetail.length, differenceNet: sumCents(closings, row => row.diff ?? (Number(row.actual) - Number(row.expected))), fundsCount: openings.length, fundsEventSum: openingEvents, negativeExpectedCount: negativeExpected.length },
      payables: { openCount: payablesAll.length, openTotal: payablesOpenTotal, paidInRangeCount: payablesPaidInRange.length, paidInRangeTotal: payablesPaidTotal, openInRangeCount: payablesOpenInRange.length, openInRangeTotal: payablesPeriodOpenTotal, overdueCount: payablesOverdue.length, overdueTotal: payablesOverdueTotal },
      inventory: { productCount: products.length, lowStockCount: lowStock.length, attentionCount: attentionStock.length, expiredCount: expiredProducts.length, expiringCount: expiringProducts.length, currentQuantity: sumCents(products, row => row.currentStock), minimumQuantity: sumCents(products, row => row.minimumStock), productsWithCost: productsWithCost.length, valueEstimate: stockValue },
      convenio: { count: convenioEntries.length, total: convenioTotal, hasPaymentState: convenioHasPaymentState },
      integrity: { missingResponsible, missingCategory, missingRegister, duplicateExtraRows, negativeExpected, inconsistentStoredDifference, closingWithoutPriorCount, pendingReconciliation, payableMovementCandidates, paidPayablesWithoutCandidate, duplicateClosingExpenseCandidates }
    };
  }

  const api = { cents, amount, getCashBaseForClosing, buildRegisterSummary, buildModuleMetrics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FinanceAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
