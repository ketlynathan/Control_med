import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, ClipboardCheck, Plus } from 'lucide-react';
import { formatCurrency, formatDate, monthlyRange, withinRange } from '../../shared/format.js';
import { DataTable, PageHeading, Panel, StatCard } from '../../shared/components.jsx';

export default function DashboardPage({ state, onNavigate }) {
  const range = useMemo(() => window.AccountingPeriod.range(state.currentMonth, { initialStart: state.business.accountingFirstCycleStart }), [state.currentMonth, state.business.accountingFirstCycleStart]);
  const summary = window.FinanceAnalytics.buildRegisterSummary(state, { range });
  const closings = state.closings.filter(row => withinRange(row.date, range)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
  const openPayables = state.payables.entries.filter(item => !item.paid);
  const closingCount = state.closings.filter(row => withinRange(row.date, range)).length;
  const cycleLabel = window.AccountingPeriod.label(state.currentMonth, { initialStart: state.business.accountingFirstCycleStart });

  return (
    <div className="module-page">
      <PageHeading eyebrow={`Ciclo ${cycleLabel}`} title="Resumo da operação" description="Caixa, pendências e registros recentes da sua empresa." actions={<button className="button button-primary" onClick={() => onNavigate('cash')}><Plus size={16} />Fechar caixa</button>} />
      <div className="stats-grid">
        <StatCard label="Entradas do caixa" value={formatCurrency(summary.cashEntriesCents / 100)} detail={`${closingCount} fechamento(s) no ciclo`} tone="positive" icon={ArrowDownRight} />
        <StatCard label="Despesas do caixa" value={formatCurrency(summary.cashExitsCents / 100)} detail="Despesas registradas nos fechamentos" tone="negative" icon={ArrowUpRight} />
        <StatCard label="Saldo do caixa" value={formatCurrency(summary.cashBalanceCents / 100)} detail="Entradas menos despesas do Caixa" icon={CircleDollarSign} />
        <StatCard label="Contas em aberto" value={formatCurrency(openPayables.reduce((sum, item) => sum + Number(item.amount || 0), 0))} detail={`${openPayables.length} obrigação(ões) pendente(s)`} tone="warning" icon={ClipboardCheck} />
      </div>
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