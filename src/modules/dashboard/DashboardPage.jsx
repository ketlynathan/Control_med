import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, ClipboardCheck, Plus, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency, formatDate, withinRange } from '../../shared/format.js';
import { DataTable, PageHeading, Panel, StatCard } from '../../shared/components.jsx';

const paymentMethods = [
  { key: 'pix', label: 'Pix', color: '#198754' },
  { key: 'debit', label: 'Débito', color: '#3276b1' },
  { key: 'credit', label: 'Crédito', color: '#dc8155' },
  { key: 'cash', label: 'Dinheiro', color: '#b99527' },
  { key: 'other', label: 'Outros', color: '#7b718f' },
];

const expenseColors = { Alimentação: '#d18055', Transporte: '#397a9d' };
const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function dailyTotals(dailyEntries, range, lastDate) {
  const totals = new Map(dailyEntries.filter(row => row.date <= lastDate).map(row => [row.date, row.entriesCents]));
  const rows = [];
  const cursor = new Date(`${range.start}T12:00:00`);
  const end = new Date(`${lastDate}T12:00:00`);
  while (cursor <= end) {
    const date = isoDate(cursor);
    rows.push({ date, label: formatDate(date).slice(0, 5), entriesCents: totals.get(date) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

function cumulative(rows) {
  let total = 0;
  return rows.map((row, index) => ({ cycleDay: index + 1, totalCents: (total += row.entriesCents) }));
}

export default function DashboardPage({ state, onNavigate }) {
  const options = { initialStart: state.business.accountingFirstCycleStart };
  const range = useMemo(() => window.AccountingPeriod.range(state.currentMonth, options), [state.currentMonth, state.business.accountingFirstCycleStart]);
  const previousRange = window.AccountingPeriod.range(window.AccountingPeriod.shift(state.currentMonth, -1), options);
  const report = window.FinanceAnalytics.buildFinancialCycleReport(state, range);
  const previousReport = window.FinanceAnalytics.buildFinancialCycleReport(state, previousRange);
  const closings = state.closings.filter(row => withinRange(row.date, range)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
  const openPayables = state.payables.entries.filter(item => !item.paid);
  const cycleLabel = window.AccountingPeriod.label(state.currentMonth, { initialStart: state.business.accountingFirstCycleStart });
  const today = isoDate(new Date());
  const activePeriod = window.AccountingPeriod.key(today, options);
  const currentLastDate = state.currentMonth === activePeriod && today < range.end ? today : range.end;
  const currentDaily = dailyTotals(report.dailyEntriesCents, range, currentLastDate);
  const previousDaily = dailyTotals(previousReport.dailyEntriesCents, previousRange, previousRange.end);
  const currentCumulative = cumulative(currentDaily);
  const previousCumulative = cumulative(previousDaily);
  const trendData = Array.from({ length: Math.max(currentCumulative.length, previousCumulative.length) }, (_, index) => ({
    cycleDay: index + 1,
    currentCents: currentCumulative[index]?.totalCents ?? null,
    previousCents: previousCumulative[index]?.totalCents ?? null,
  }));
  const dailyData = currentDaily.map(row => ({ ...row, entries: row.entriesCents / 100 }));
  const bestDay = dailyData.reduce((best, row) => row.entriesCents > (best?.entriesCents || 0) ? row : best, null);
  const paymentData = [
    ...paymentMethods.map(method => ({ ...method, valueCents: report.paymentTotalsCents[method.key] || 0 })),
    { key: 'unclassified', label: 'Não informado', color: '#a4aaa6', valueCents: report.unclassifiedPaymentCents },
  ].filter(row => row.valueCents > 0);
  const expenseData = ['Alimentação', 'Transporte'].map(category => ({
    category,
    total: (report.categoryTotalsCents[category] || 0) / 100,
    totalCents: report.categoryTotalsCents[category] || 0,
    color: expenseColors[category],
  }));
  const entryChange = previousReport.cashEntriesCents
    ? ((report.cashEntriesCents - previousReport.cashEntriesCents) / previousReport.cashEntriesCents) * 100
    : null;
  const ratio = report.cashEntriesCents ? report.cashExitsCents / report.cashEntriesCents : null;

  return (
    <div className="module-page">
      <PageHeading eyebrow={`Ciclo ${cycleLabel}`} title="Saúde da operação" description="Entradas, despesas e ritmo diário do caixa. Os valores acompanham a sincronização da conta." actions={<button className="button button-primary" onClick={() => onNavigate('cash')}><Plus size={16} />Fechar caixa</button>} />
      <div className="stats-grid dashboard-kpis">
        <StatCard label="Entradas do ciclo" value={formatCurrency(report.cashEntriesCents / 100)} detail={entryChange === null ? `Ciclo anterior: ${formatCurrency(previousReport.cashEntriesCents / 100)}` : `${entryChange >= 0 ? '+' : ''}${entryChange.toFixed(1)}% vs. ciclo anterior`} tone="positive" icon={ArrowDownRight} />
        <StatCard label="Saldo do caixa" value={formatCurrency(report.cashBalanceCents / 100)} detail="Entradas menos despesas registradas" tone={report.cashBalanceCents >= 0 ? 'positive' : 'negative'} icon={CircleDollarSign} />
        <StatCard label="Alimentação" value={formatCurrency((report.categoryTotalsCents.Alimentação || 0) / 100)} detail="Despesas classificadas no ciclo" tone="warning" icon={ArrowUpRight} />
        <StatCard label="Transporte" value={formatCurrency((report.categoryTotalsCents.Transporte || 0) / 100)} detail="Despesas classificadas no ciclo" tone="warning" icon={TrendingUp} />
        <StatCard label="Contas em aberto" value={formatCurrency(openPayables.reduce((sum, item) => sum + Number(item.amount || 0), 0))} detail={`${openPayables.length} obrigação(ões) pendente(s)`} tone="warning" icon={ClipboardCheck} />
      </div>
      <div className="dashboard-insight" role="status"><strong>{report.cashBalanceCents >= 0 ? 'Caixa positivo' : 'Atenção ao caixa'}</strong><span>{ratio === null ? 'Ainda não há entradas registradas neste ciclo.' : `${(ratio * 100).toFixed(1)}% das entradas foram consumidas pelas despesas do Caixa.`}</span><span>{bestDay?.entriesCents ? `Maior entrada diária: ${bestDay.label}, ${formatCurrency(bestDay.entriesCents / 100)}.` : 'Registre fechamentos para identificar os dias de maior entrada.'}</span></div>

      <Panel title="Entradas acumuladas por ciclo" description={`Comparação diária do ciclo atual com o anterior. Atual: ${formatCurrency(report.cashEntriesCents / 100)} · anterior: ${formatCurrency(previousReport.cashEntriesCents / 100)}.`}>
        <div className="dashboard-chart dashboard-chart-wide"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 12, right: 18, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#e9eeea" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="cycleDay" tickLine={false} axisLine={false} tick={{ fill: '#6b7971', fontSize: 10 }} tickFormatter={value => `D${value}`} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: '#6b7971', fontSize: 10 }} tickFormatter={value => formatCurrency(value / 100)} />
          <Tooltip labelFormatter={value => `Dia ${value} do ciclo`} formatter={value => formatCurrency(Number(value) / 100)} />
          <Legend />
          <Line name="Ciclo atual" type="monotone" dataKey="currentCents" stroke="#176a54" strokeWidth={2.5} dot={false} connectNulls={false} />
          <Line name="Ciclo anterior" type="monotone" dataKey="previousCents" stroke="#d07a55" strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </LineChart></ResponsiveContainer></div>
      </Panel>

      <Panel title="Entradas por dia" description="Compare os dias do ciclo e identifique os de maior movimento." action={bestDay?.entriesCents ? <span className="chart-highlight">Pico: {bestDay.label}</span> : null}>
        <div className="dashboard-chart dashboard-chart-wide"><ResponsiveContainer width="100%" height="100%"><BarChart data={dailyData} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#e9eeea" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={14} tickLine={false} axisLine={false} tick={{ fill: '#6b7971', fontSize: 9 }} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: '#6b7971', fontSize: 10 }} tickFormatter={value => formatCurrency(value)} />
          <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? formatDate(payload[0].payload.date) : ''} formatter={value => formatCurrency(Number(value))} />
          <Bar name="Entradas" dataKey="entries" fill="#3276b1" radius={[3, 3, 0, 0]} maxBarSize={30} />
        </BarChart></ResponsiveContainer></div>
      </Panel>

      <section className="dashboard-chart-grid">
        <Panel title="Entradas por forma de pagamento" description="Valores informados nos fechamentos deste ciclo.">
          {paymentData.length ? <div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><PieChart>
            <Pie data={paymentData} dataKey="valueCents" nameKey="label" innerRadius="54%" outerRadius="78%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
              {paymentData.map(row => <Cell key={row.key} fill={row.color} />)}
            </Pie>
            <Tooltip formatter={value => formatCurrency(Number(value) / 100)} />
          </PieChart></ResponsiveContainer></div> : <div className="chart-empty">Sem entradas detalhadas neste ciclo.</div>}
            {!!paymentData.length && <div className="chart-breakdown">{paymentData.map(row => <div className="chart-breakdown-row" key={row.key}><span className="chart-breakdown-label"><i style={{ '--chart-color': row.color }} />{row.label}</span><strong>{formatCurrency(row.valueCents / 100)}</strong></div>)}</div>}
        </Panel>
        <Panel title="Gastos com alimentação e transporte" description="Despesas dos fechamentos classificadas pela descrição.">
          <div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={expenseData} layout="vertical" margin={{ top: 18, right: 18, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="#e9eeea" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#6b7971', fontSize: 10 }} tickFormatter={value => formatCurrency(value)} />
            <YAxis type="category" dataKey="category" width={90} tickLine={false} axisLine={false} tick={{ fill: '#34453b', fontSize: 10 }} />
            <Tooltip formatter={value => formatCurrency(Number(value))} />
            <Bar name="Gasto" dataKey="total" radius={[0, 3, 3, 0]} maxBarSize={34}>
              {expenseData.map(row => <Cell key={row.category} fill={row.color} />)}
            </Bar>
          </BarChart></ResponsiveContainer></div>
        </Panel>
      </section>

      <Panel title="Fechamentos recentes" description="Conferências registradas no ciclo financeiro atual." action={<button className="button button-quiet button-small" onClick={() => onNavigate('cash')}>Abrir caixa</button>}>
        <DataTable rows={closings} emptyTitle="Nenhum fechamento neste ciclo" emptyDescription="Quando o caixa for fechado, o registro aparecerá aqui." columns={[
          { key: 'date', label: 'Data', render: row => formatDate(row.date) },
          { key: 'register', label: 'Caixa', render: row => state.registers?.[row.register]?.name || `Caixa ${row.register || '—'}` },
          { key: 'collaborator', label: 'Responsável', render: row => state.collaborators.find(person => person.id === row.collaborator)?.name || 'Não informado' },
          { key: 'entryTotal', label: 'Entradas', numeric: true, className: 'text-positive', render: row => formatCurrency(row.entryTotal) },
          { key: 'exitTotal', label: 'Despesas', numeric: true, className: 'text-negative', render: row => formatCurrency(row.exitTotal) },
          { key: 'actual', label: 'Contado', numeric: true, render: row => formatCurrency(row.actual) },
        ]} />
      </Panel>
      <section className="dashboard-lower">
        <Panel title="Resumo de contas" description="Obrigações ainda não marcadas como pagas."><div className="compact-list">{openPayables.slice(0, 5).map(item => <div className="compact-row" key={item.id}><span><strong>{item.supplier || item.description || 'Conta'}</strong><small>Vence em {formatDate(item.dueDate)}</small></span><b>{formatCurrency(item.amount)}</b></div>)}{!openPayables.length && <p className="muted-copy">Nenhuma conta em aberto.</p>}</div><button className="text-action" onClick={() => onNavigate('payables')}>Ver contas a pagar</button></Panel>
        <Panel title="Seu próximo passo" description="Mantenha os módulos operacionais atualizados."><div className="next-action"><span className="next-icon"><CircleDollarSign size={20} /></span><div><strong>Conferir o caixa</strong><p>Registre entradas, despesas e valor contado para fechar o turno.</p></div><button className="icon-button" aria-label="Abrir caixa" onClick={() => onNavigate('cash')}><Plus size={18} /></button></div><div className="next-action"><span className="next-icon next-icon-alt"><ClipboardCheck size={19} /></span><div><strong>Revisar pendências</strong><p>Confira contas com vencimento próximo.</p></div><button className="icon-button" aria-label="Abrir contas a pagar" onClick={() => onNavigate('payables')}><ArrowDownRight size={17} /></button></div></Panel>
      </section>
    </div>
  );
}