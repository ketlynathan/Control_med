(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AccountingPeriod = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function iso(value) {
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(value || '').slice(0, 10);
  }
  function parse(value) {
    const text = iso(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  function initialStart(options) {
    const date = parse(options && options.initialStart);
    return date && date.day === 5 ? date : null;
  }
  function periodKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  function key(value, options) {
    const text = iso(value);
    const date = parse(value) || parse(new Date());
    const first = initialStart(options);
    if (first && text === `${periodKey(first.year, first.month)}-05`) {
      return periodKey(first.year, first.month);
    }
    let year = date.year;
    let month = date.month;
    // Dia 06 abre o ciclo do mês; dias 01–05 ainda pertencem ao ciclo anterior.
    if (date.day <= 5) {
      month -= 1;
      if (month === 0) { month = 12; year -= 1; }
    }
    return periodKey(year, month);
  }
  function addMonths(year, month, amount) {
    const date = new Date(year, month - 1 + amount, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }
  function range(period, options) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(period || ''));
    const base = match ? { year: Number(match[1]), month: Number(match[2]) } : (() => { const d = parse(new Date()); return { year: d.year, month: d.month }; })();
    const next = addMonths(base.year, base.month, 1);
    const first = initialStart(options);
    const isFirstPeriod = first && periodKey(first.year, first.month) === periodKey(base.year, base.month);
    return {
      key: periodKey(base.year, base.month),
      start: isFirstPeriod ? `${periodKey(first.year, first.month)}-05` : `${periodKey(base.year, base.month)}-06`,
      end: `${next.year}-${String(next.month).padStart(2, '0')}-05`,
    };
  }
  function label(period, options) {
    const r = range(period, options);
    const fmt = value => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
    return `${fmt(r.start)} a ${fmt(r.end)}`;
  }
  function contains(value, period, options) {
    const text = iso(value);
    const r = range(period || key(value, options), options);
    return text >= r.start && text <= r.end;
  }
  function shift(period, amount) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(period || ''));
    const now = parse(new Date());
    const base = match ? { year: Number(match[1]), month: Number(match[2]) } : { year: now.year, month: now.month };
    const moved = addMonths(base.year, base.month, Number(amount || 0));
    return `${moved.year}-${String(moved.month).padStart(2, '0')}`;
  }
  return { key, range, label, contains, shift };
});
