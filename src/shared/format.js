export const formatCurrency = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
export const formatDate = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
export const formatDateTime = value => value ? new Date(value).toLocaleString('pt-BR') : '—';

export function createId() {
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function monthlyRange(month) {
  const [year, number] = (month || '').split('-').map(Number);
  if (!year || !number) return { start: '', end: '' };
  const start = new Date(year, number - 1, 6);
  const end = new Date(year, number, 5);
  const toIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { start: toIso(start), end: toIso(end) };
}

export const withinRange = (value, range) => !!value && (!range.start || value >= range.start) && (!range.end || value <= range.end);