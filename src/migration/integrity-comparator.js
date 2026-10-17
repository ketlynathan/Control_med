'use strict';

const MODULES = [
  { key: 'transactions', legacyPath: ['transactions'], normalizedKey: 'financialTransactions', amount: true },
  { key: 'openings', legacyPath: ['openings'], normalizedKey: 'cashOpenings', amount: true },
  { key: 'closings', legacyPath: ['closings'], normalizedKey: 'cashClosings', amount: false },
  { key: 'collaborators', legacyPath: ['collaborators'], normalizedKey: 'collaborators', amount: false },
  { key: 'registers', legacyPath: ['registers'], normalizedKey: 'cashRegisters', amount: false },
  { key: 'attachments', legacyPath: ['attachments'], normalizedKey: 'attachments', amount: false },
  { key: 'payables', legacyPath: ['payables', 'entries'], normalizedKey: 'payableAccounts', amount: true },
  { key: 'products', legacyPath: ['drogaria', 'products'], normalizedKey: 'pharmacyProducts', amount: false },
  { key: 'convenio', legacyPath: ['convenio', 'entries'], normalizedKey: 'convenioEntries', amount: true },
  { key: 'auditLog', legacyPath: ['auditLog'], normalizedKey: 'cashAuditLog', amount: false }
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readPath(object, path) {
  return path.reduce((current, key) => current && current[key], object);
}

function idOf(record, normalized = false) {
  const value = normalized ? record?.legacy_id : record?.id;
  return value === undefined || value === null || value === '' ? null : String(value);
}

function decimal(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sameAmount(left, right) {
  return Math.abs(left - right) < 0.005;
}

function amountStatus(legacyRecord, normalizedRecord) {
  const legacyAmount = decimal(legacyRecord?.amount);
  const normalizedAmount = decimal(normalizedRecord?.amount);
  if (sameAmount(normalizedAmount, legacyAmount)) return 'same';
  if (sameAmount(normalizedAmount, legacyAmount * 100)) return 'multiplied_by_100';
  if (sameAmount(normalizedAmount / 100, legacyAmount)) return 'divided_by_100';
  return 'other_difference';
}

function compareModule(legacyRecords, normalizedRecords, hasAmount) {
  const legacy = asArray(legacyRecords);
  const normalized = asArray(normalizedRecords);
  const normalizedById = new Map(normalized.map(record => [idOf(record, true), record]));
  const legacyIds = new Set(legacy.map(record => idOf(record)).filter(Boolean));
  const normalizedIds = new Set(normalized.map(record => idOf(record, true)).filter(Boolean));
  const missingLegacyIds = [...legacyIds].filter(id => !normalizedIds.has(id));
  const extraNormalizedIds = [...normalizedIds].filter(id => !legacyIds.has(id));

  const result = {
    legacyCount: legacy.length,
    normalizedCount: normalized.length,
    missingLegacyIds,
    extraNormalizedIds,
    duplicateLegacyIds: duplicateIds(legacy.map(record => idOf(record)).filter(Boolean)),
    duplicateNormalizedIds: duplicateIds(normalized.map(record => idOf(record, true)).filter(Boolean))
  };

  if (hasAmount) {
    const matched = legacy
      .map(record => ({ legacy: record, normalized: normalizedById.get(idOf(record)) }))
      .filter(pair => pair.normalized);
    const statuses = matched.map(pair => amountStatus(pair.legacy, pair.normalized));
    result.amount = {
      legacyTotal: rounded(legacy.reduce((sum, record) => sum + decimal(record.amount), 0)),
      normalizedTotal: rounded(normalized.reduce((sum, record) => sum + decimal(record.amount), 0)),
      matchedCount: matched.length,
      sameValue: statuses.filter(status => status === 'same').length,
      multipliedBy100: statuses.filter(status => status === 'multiplied_by_100').length,
      dividedBy100: statuses.filter(status => status === 'divided_by_100').length,
      otherDifference: statuses.filter(status => status === 'other_difference').length
    };
  }

  result.hasDivergence = Boolean(
    result.missingLegacyIds.length ||
    result.extraNormalizedIds.length ||
    result.duplicateLegacyIds.length ||
    result.duplicateNormalizedIds.length ||
    (result.amount && (result.amount.multipliedBy100 || result.amount.dividedBy100 || result.amount.otherDifference))
  );
  return result;
}

function duplicateIds(ids) {
  const counts = new Map();
  ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}

function compareBusinessState({ businessId, legacyState, normalized }) {
  const modules = {};
  for (const definition of MODULES) {
    modules[definition.key] = compareModule(
      readPath(legacyState || {}, definition.legacyPath),
      normalized?.[definition.normalizedKey],
      definition.amount
    );
  }
  return {
    businessId: businessId || null,
    hasDivergence: Object.values(modules).some(module => module.hasDivergence),
    modules
  };
}

module.exports = {
  MODULES,
  compareBusinessState,
  compareModule,
  decimal
};
