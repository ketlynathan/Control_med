export const LEGACY_STATE_KEY = 'fluxo-controle-caixa-v1';
export const AUTH_TOKEN_KEY = 'fluxo-auth-token-v1';
export const AUTH_EMAIL_KEY = 'fluxo-auth-email-v1';
export const CONFLICT_DRAFT_KEY = 'fluxo-sync-conflict-draft-v1';
export const CONFLICT_ARCHIVE_KEY = 'fluxo-sync-conflict-archive-v1';
export const SERVER_BASE_KEY = 'fluxo-last-server-state-v1';

export function defaultBusinessState() {
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return {
    business: { name: 'Meu negócio', doc: '', goal: 0, owner: 'Administrador', accountingFirstCycleStart: null },
    collaborators: [{ id: 'admin-default', name: 'Administrador', role: 'Gestor', code: '1234' }],
    transactions: [], openings: [], closings: [], auditLog: [],
    registers: { '1': { name: 'Caixa 01' }, '2': { name: 'Caixa 02' } },
    drogaria: { config: { storeName: 'Drogaria', attentionPercent: 130, preExpiryDays: 90 }, products: [] },
    convenio: { entries: [] },
    payables: { entries: [] },
    currentMonth: month, currentPage: 'dashboard',
  };
}

export function normalizeBusinessState(value = {}) {
  const base = defaultBusinessState();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {
    ...base,
    ...source,
    business: { ...base.business, ...(source.business || {}) },
    registers: { ...base.registers, ...(source.registers || {}) },
    drogaria: {
      ...base.drogaria,
      ...(source.drogaria || {}),
      config: { ...base.drogaria.config, ...(source.drogaria?.config || {}) },
      products: Array.isArray(source.drogaria?.products) ? source.drogaria.products : [],
    },
    convenio: { ...base.convenio, ...(source.convenio || {}), entries: Array.isArray(source.convenio?.entries) ? source.convenio.entries : [] },
    payables: { ...base.payables, ...(source.payables || {}), entries: Array.isArray(source.payables?.entries) ? source.payables.entries : [] },
    collaborators: Array.isArray(source.collaborators) && source.collaborators.length ? source.collaborators : base.collaborators,
    transactions: Array.isArray(source.transactions) ? source.transactions : [],
    openings: Array.isArray(source.openings) ? source.openings : [],
    closings: Array.isArray(source.closings) ? source.closings : [],
    auditLog: Array.isArray(source.auditLog) ? source.auditLog : [],
  };
  if (normalized.currentPage === 'movements' || normalized.currentPage === 'reconciliation') normalized.currentPage = 'dashboard';
  delete normalized.financialMovements;
  return normalized;
}

export function loadCachedBusinessState() {
  try {
    const cached = localStorage.getItem(LEGACY_STATE_KEY);
    return cached ? normalizeBusinessState(JSON.parse(cached)) : null;
  } catch {
    return null;
  }
}

export function persistBusinessState(state) {
  localStorage.setItem(LEGACY_STATE_KEY, JSON.stringify(state));
}

export function loadServerBaseState() {
  try {
    const saved = localStorage.getItem(SERVER_BASE_KEY);
    return saved ? normalizeBusinessState(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

export function persistServerBaseState(state) {
  localStorage.setItem(SERVER_BASE_KEY, JSON.stringify(state));
}