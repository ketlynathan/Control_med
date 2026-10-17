export function parseInstallment(description = '') {
  const match = String(description).match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < 1 || current > total) return null;
  return { current, total };
}

export function isInstallmentPayment(description = '') {
  return /\bpagamento\b/i.test(String(description)) && !!parseInstallment(description);
}

export function getInstallmentProgress(entry = {}) {
  const parsed = parseInstallment(entry.description);
  const current = Number(entry.installmentCurrent) || parsed?.current;
  const total = Number(entry.installmentTotal) || parsed?.total;
  if (!current || !total || current > total || current < 1 || total < 1) return null;

  const completed = entry.paid ? current : current - 1;
  return {
    current,
    total,
    completed,
    remaining: total - completed,
    percentage: Math.round((completed / total) * 100),
  };
}