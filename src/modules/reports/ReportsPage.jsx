import { useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import { formatCurrency, formatDate } from '../../shared/format.js';
import { DataTable, PageHeading, Panel, StatCard } from '../../shared/components.jsx';

export default function ReportsPage({ state }) {
  const options = { initialStart: state.business.accountingFirstCycleStart };
  const range = useMemo(() => window.AccountingPeriod.range(state.currentMonth, options), [state.currentMonth, state.business.accountingFirstCycleStart]);
  const report = window.FinanceAnalytics.buildFinancialCycleReport(state, range);
  const payables = window.FinanceAnalytics.summarizePayablesByCategory(state.payables.entries || []);
  const previousKey = window.AccountingPeriod.shift(state.currentMonth, -1);
  const previousRange = window.AccountingPeriod.range(previousKey, options);
  const previous = window.FinanceAnalytics.buildFinancialCycleReport(state, previousRange);
  const expenseRows = Object.entries(report.categoryTotalsCents).map(([category, totalCents]) => ({ category, totalCents }));

  function exportCSV() {
    const rows = [
      ['Resumo do ciclo', range.start, range.end],
      ['Indicador', 'Valor'],
      ['Entradas do Caixa', (report.cashEntriesCents / 100).toFixed(2)],
      ['Despesas do Caixa', (report.cashExitsCents / 100).toFixed(2)],
      ['Saldo do Caixa', (report.cashBalanceCents / 100).toFixed(2)],
      ['Contas pagas', (report.paidAccountsCents / 100).toFixed(2)],
      ['Resultado líquido', (report.netResultCents / 100).toFixed(2)],
      ...expenseRows.map(row => [`Despesas · ${row.category}`, (row.totalCents / 100).toFixed(2)]),
    ];
    const csv = `\ufeff${rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fluxo-relatorio-${state.currentMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="module-page">
    <PageHeading eyebrow="Análise" title="Relatórios" description={`Ciclo financeiro de ${formatDate(range.start)} a ${formatDate(range.end)}.`} actions={<><button className="button button-quiet" onClick={() => window.print()}><Printer size={16} />Imprimir</button><button className="button button-primary" onClick={exportCSV}><Download size={16} />Exportar CSV</button></>} />
    <div className="stats-grid"><StatCard label="Entradas do Caixa" value={formatCurrency(report.cashEntriesCents / 100)} tone="positive" /><StatCard label="Despesas do Caixa" value={formatCurrency(report.cashExitsCents / 100)} tone="negative" /><StatCard label="Saldo do Caixa" value={formatCurrency(report.cashBalanceCents / 100)} /><StatCard label="Resultado após contas pagas" value={formatCurrency(report.netResultCents / 100)} detail="Contas vinculadas a despesas não são subtraídas duas vezes." tone={report.netResultCents >= 0 ? 'positive' : 'negative'} /></div>
    <div className="report-result"><span>Resultado do ciclo</span><strong>{formatCurrency(report.netResultCents / 100)}</strong><p>Entradas do caixa − despesas detalhadas − contas pagas não vinculadas a despesas do caixa.</p></div>
    <div className="dashboard-lower"><Panel title="Despesas por categoria" description="Categorias inferidas a partir dos registros existentes."><DataTable rows={expenseRows} emptyTitle="Sem despesas classificadas" columns={[{ key: 'category', label: 'Categoria' }, { key: 'totalCents', label: 'Total', numeric: true, render: row => formatCurrency(row.totalCents / 100) }]} /></Panel><Panel title="Contas a pagar" description="Totais independentes dos registros do Caixa."><DataTable rows={payables.rows} emptyTitle="Nenhuma conta cadastrada" columns={[{ key: 'category', label: 'Categoria' }, { key: 'count', label: 'Contas', numeric: true }, { key: 'paidCents', label: 'Pagas', numeric: true, render: row => formatCurrency(row.paidCents / 100) }, { key: 'pendingCents', label: 'Pendentes', numeric: true, render: row => formatCurrency(row.pendingCents / 100) }]} /><div className="report-total"><span>Total pendente</span><strong>{formatCurrency(payables.total.pendingCents / 100)}</strong></div></Panel></div>
    <Panel title="Comparativo de ciclos" description="Cada ciclo respeita o calendário financeiro de 06 a 05."><DataTable rows={[{ label: `Ciclo atual · ${formatDate(range.start)} a ${formatDate(range.end)}`, report }, { label: `Ciclo anterior · ${formatDate(previousRange.start)} a ${formatDate(previousRange.end)}`, report: previous }]} columns={[{ key: 'label', label: 'Período' }, { key: 'entries', label: 'Entradas', numeric: true, render: row => formatCurrency(row.report.cashEntriesCents / 100) }, { key: 'exits', label: 'Despesas', numeric: true, render: row => formatCurrency(row.report.cashExitsCents / 100) }, { key: 'balance', label: 'Saldo do Caixa', numeric: true, render: row => formatCurrency(row.report.cashBalanceCents / 100) }, { key: 'net', label: 'Resultado líquido', numeric: true, render: row => formatCurrency(row.report.netResultCents / 100) }]} /></Panel>
    <p className="report-footnote">Métodos não identificados e diferenças em dados históricos permanecem separados; relatórios não alteram os registros de origem.</p>
  </div>;
}