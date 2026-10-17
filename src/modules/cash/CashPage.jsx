import { useMemo, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { createId, formatCurrency, formatDate, monthlyRange, withinRange } from '../../shared/format.js';
import { DataTable, Field, FormActions, PageHeading, Panel, StatCard } from '../../shared/components.jsx';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function emptyClosing(register = '1') {
  return { id: '', date: today(), register, collaborator: '', code: '', pix: '', debit: '', credit: '', cash: '', actual: '', notes: '', expenses: [{ description: '', amount: '', paymentMethod: 'nao_informado' }] };
}

export default function CashPage({ state, updateState }) {
  const [closing, setClosing] = useState(null);
  const [opening, setOpening] = useState(null);
  const [message, setMessage] = useState('');
  const range = useMemo(() => window.AccountingPeriod.range(state.currentMonth, { initialStart: state.business.accountingFirstCycleStart }), [state.currentMonth, state.business.accountingFirstCycleStart]);
  const summary = window.FinanceAnalytics.buildRegisterSummary(state, { range });
  const closings = state.closings.filter(row => withinRange(row.date, range)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.closedAt || '').localeCompare(String(a.closedAt || '')));
  const openings = state.openings.filter(row => withinRange(row.date, range)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const auditRows = [...state.auditLog].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  const registers = Object.keys(state.registers || {}).length ? Object.keys(state.registers) : ['1'];
  const cashEstimate = closing ? window.FinanceAnalytics.calculateClosingCashReconciliation(state, { ...closing, expenses: closing.expenses.map(row => ({ ...row, amount: Number(row.amount) || 0 })) }).expectedCents / 100 : null;

  function changeClosing(key, value) {
    setClosing(previous => ({ ...previous, [key]: value }));
  }

  function updateExpense(index, key, value) {
    setClosing(previous => ({ ...previous, expenses: previous.expenses.map((expense, current) => current === index ? { ...expense, [key]: value } : expense) }));
  }

  function startEdit(row) {
    if (!window.FinanceAnalytics.canEditClosing(row)) return setMessage('Este fechamento não pode ser editado porque não tem ID ou data válidos.');
    setClosing({ ...emptyClosing(row.register), ...row, code: '', expenses: Array.isArray(row.expenses) && row.expenses.length ? row.expenses : [{ description: '', amount: '', paymentMethod: 'nao_informado' }] });
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function saveClosing(event) {
    event.preventDefault();
    const previous = state.closings.find(row => row.id === closing.id);
    if (previous && !closing.reason?.trim()) return setMessage('Informe o motivo da retificação.');
    const collaborator = state.collaborators.find(item => item.id === closing.collaborator);
    if (!collaborator || String(collaborator.code) !== String(closing.code).trim()) return setMessage('Código de fechamento inválido para este colaborador.');
    const duplicate = state.closings.find(row => row.id !== closing.id && String(row.register) === String(closing.register) && row.date === closing.date);
    if (duplicate) return setMessage('Já existe um fechamento deste caixa nesta data. Edite o registro existente.');
    const timestamp = new Date().toISOString();
    const expenses = closing.expenses.filter(item => item.description.trim() || Number(item.amount)).map(item => ({ ...item, id: item.id || createId(), amount: Number(item.amount) || 0, description: item.description.trim() }));
    const { code, reason, ...closingData } = closing;
    const draft = { ...closingData, expenses, pix: Number(closing.pix) || 0, debit: Number(closing.debit) || 0, credit: Number(closing.credit) || 0, cash: Number(closing.cash) || 0, actual: Number(closing.actual) || 0 };
    const reconciliation = window.FinanceAnalytics.calculateClosingCashReconciliation({ ...state, closings: state.closings.filter(row => row.id !== closing.id) }, draft);
    const saved = {
      ...draft,
      id: previous?.id || createId(),
      expected: reconciliation.expectedCents / 100,
      diff: reconciliation.differenceCents / 100,
      cashBaseSource: reconciliation.baseSource,
      cashBaseDate: reconciliation.baseDate,
      cashBaseId: reconciliation.baseId,
      cashBaseAmount: reconciliation.baseCents / 100,
      cashBaseFundAdded: reconciliation.confirmedFundCents / 100,
      cashBaseFundPending: reconciliation.pendingFundsCents / 100,
      cashExpenseTotal: reconciliation.cashExpenseCents / 100,
      unclassifiedExpenseTotal: reconciliation.unknownOutflowCents / 100,
      expectedProvisional: reconciliation.provisional,
      entryTotal: (Number(closing.pix) || 0) + (Number(closing.debit) || 0) + (Number(closing.credit) || 0) + (Number(closing.cash) || 0),
      exitTotal: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      collaborator: collaborator.id,
      notes: closing.notes.trim(),
      createdAt: previous?.createdAt || timestamp,
      closedAt: previous?.closedAt || timestamp,
      updatedAt: timestamp,
    };
    updateState(current => {
      const next = { ...current, closings: previous ? current.closings.map(row => row.id === previous.id ? saved : row) : [saved, ...current.closings] };
      if (previous) {
        const revision = window.FinanceAnalytics.buildClosingRevision(previous, saved, timestamp);
        next.auditLog = [...current.auditLog, { id: createId(), timestamp, action: 'edit', actionLabel: 'Fechamento retificado', originalDate: previous.date, entryTotal: previous.entryTotal || 0, newEntryTotal: saved.entryTotal, performedBy: collaborator.name, reason: reason?.trim() || 'Retificação registrada no aplicativo React', before: revision.before, after: revision.after, closingBefore: revision.before, closingAfter: revision.after }];
      }
      return next;
    });
    setClosing(null);
    setMessage(reconciliation.provisional ? 'Fechamento salvo. O saldo esperado está provisório por haver dados históricos pendentes.' : 'Fechamento salvo e sincronizando.');
  }

  function saveOpening(event) {
    event.preventDefault();
    const timestamp = new Date().toISOString();
    const previous = state.openings.find(row => row.id === opening.id);
    const reason = opening.reason?.trim();
    const performer = previous && state.collaborators.find(person => String(person.code) === String(opening.auditCode || '').trim());
    if (previous && !reason) return setMessage('Informe o motivo da edição do fundo.');
    if (previous && !performer) return setMessage('Código de confirmação inválido; o fundo não foi alterado.');
    const { reason: ignoredReason, auditCode, ...openingData } = opening;
    const saved = { ...openingData, id: previous?.id || createId(), amount: Number(opening.amount) || 0, notes: opening.notes.trim(), createdAt: previous?.createdAt || timestamp, updatedAt: timestamp };
    updateState(current => ({
      ...current,
      openings: previous ? current.openings.map(row => row.id === previous.id ? saved : row) : [saved, ...current.openings],
      auditLog: previous ? [...current.auditLog, { id: createId(), timestamp, action: 'edit-opening', actionLabel: 'Fundo de caixa editado', originalDate: previous.date, entryTotal: previous.amount || 0, newEntryTotal: saved.amount, performedBy: performer.name, reason, before: previous, after: saved }] : current.auditLog,
    }));
    setOpening(null);
    setMessage(previous ? 'Fundo atualizado e sincronizando.' : 'Fundo registrado e sincronizando.');
  }

  function deleteOpening(row) {
    const reason = window.prompt(`Motivo para excluir o fundo de ${formatDate(row.date)}:`);
    if (!reason?.trim()) return;
    const code = window.prompt('Informe o código do colaborador para confirmar:');
    const person = state.collaborators.find(item => String(item.code) === String(code || '').trim());
    if (!person) return setMessage('Código inválido; o fundo não foi excluído.');
    updateState(current => ({ ...current, openings: current.openings.filter(item => item.id !== row.id), auditLog: [...current.auditLog, { id: createId(), timestamp: new Date().toISOString(), action: 'delete-opening', actionLabel: 'Fundo de caixa apagado', originalDate: row.date, entryTotal: row.amount || 0, performedBy: person.name, reason: reason.trim(), before: row, after: null }] }));
  }

  function deleteClosing(row) {
    if (!window.FinanceAnalytics.canEditClosing(row)) return setMessage('Este fechamento não pode ser excluído porque não tem ID ou data válidos.');
    const reason = window.prompt(`Motivo para excluir o fechamento de ${formatDate(row.date)}:`);
    if (!reason?.trim()) return;
    const code = window.prompt('Informe o código do colaborador para confirmar:');
    const person = state.collaborators.find(item => String(item.code) === String(code || '').trim());
    if (!person) return setMessage('Código inválido; o fechamento não foi excluído.');
    const timestamp = new Date().toISOString();
    updateState(current => ({
      ...current,
      closings: current.closings.filter(item => item.id !== row.id),
      auditLog: [...current.auditLog, { id: createId(), timestamp, action: 'delete-closing', actionLabel: 'Fechamento excluído', originalDate: row.date, entryTotal: row.entryTotal || 0, newEntryTotal: 0, performedBy: person.name, reason: reason.trim(), before: row, after: null, closingBefore: row, closingAfter: null }],
    }));
    setMessage('Fechamento excluído e exclusão registrada na auditoria.');
  }

  const closeColumns = [
    { key: 'date', label: 'Data', render: row => formatDate(row.date) },
    { key: 'register', label: 'Caixa', render: row => state.registers?.[row.register]?.name || `Caixa ${row.register}` },
    { key: 'collaborator', label: 'Responsável', render: row => state.collaborators.find(person => person.id === row.collaborator)?.name || 'Não informado' },
    { key: 'entryTotal', label: 'Entradas', numeric: true, className: 'text-positive', render: row => formatCurrency(row.entryTotal) },
    { key: 'exitTotal', label: 'Despesas', numeric: true, className: 'text-negative', render: row => formatCurrency(row.exitTotal) },
    { key: 'actual', label: 'Contado', numeric: true, render: row => formatCurrency(row.actual) },
    { key: 'actions', label: '', render: row => <span className="row-actions"><button className="button button-quiet button-small" onClick={() => startEdit(row)}>Editar</button><button className="button button-quiet button-small danger-text" disabled={!window.FinanceAnalytics.canEditClosing(row)} title={window.FinanceAnalytics.canEditClosing(row) ? 'Excluir com registro de motivo e responsável' : 'Fechamento sem ID ou data válidos'} onClick={() => deleteClosing(row)}>Excluir</button></span> },
  ];

  return (
    <div className="module-page">
      <PageHeading eyebrow="Operação" title="Caixa" description="Fechamentos e fundos com histórico de retificações preservado." actions={<><button className="button button-quiet" onClick={() => { setOpening({ id: '', date: today(), register: registers[0], amount: '', collaborator: '', ledgerDisposition: 'contribution', notes: '' }); setClosing(null); }}><Plus size={16} />Fundo</button><button className="button button-primary" onClick={() => { setClosing(emptyClosing(registers[0])); setOpening(null); setMessage(''); }}><Plus size={16} />Fechar caixa</button></>} />
      <div className="stats-grid"><StatCard label="Entradas" value={formatCurrency(summary.cashEntriesCents / 100)} detail="No ciclo selecionado" tone="positive" /><StatCard label="Despesas" value={formatCurrency(summary.cashExitsCents / 100)} detail="Itens registrados nos fechamentos" tone="negative" /><StatCard label="Saldo do caixa" value={formatCurrency(summary.cashBalanceCents / 100)} detail="Não inclui fundos pendentes" /><StatCard label="Fundos confirmados" value={formatCurrency(summary.fundsCents / 100)} detail={summary.filteredLedger.pendingFundCents ? `${formatCurrency(summary.filteredLedger.pendingFundCents / 100)} pendentes de classificação` : 'Sem fundos pendentes'} tone="warning" /></div>

      {message && <div className="inline-message" role="status">{message}<button type="button" className="icon-button" aria-label="Dispensar mensagem" onClick={() => setMessage('')}><X size={15} /></button></div>}

      {closing && <Panel title={closing.id ? 'Retificar fechamento' : 'Novo fechamento'} description="Os cálculos usam a última contagem, fundos classificados e despesas em dinheiro." className="editor-panel"><form className="form-stack" onSubmit={saveClosing}>
        <div className="form-grid"><Field label="Caixa"><select value={closing.register} onChange={event => changeClosing('register', event.target.value)} disabled={!!closing.id}>{registers.map(id => <option key={id} value={id}>{state.registers?.[id]?.name || `Caixa ${id}`}</option>)}</select></Field><Field label="Data"><input type="date" required value={closing.date} onChange={event => changeClosing('date', event.target.value)} disabled={!!closing.id} /></Field><Field label="Responsável"><select required value={closing.collaborator} onChange={event => changeClosing('collaborator', event.target.value)}><option value="">Selecione</option>{state.collaborators.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Código de confirmação"><input type="password" inputMode="numeric" required value={closing.code} onChange={event => changeClosing('code', event.target.value)} /></Field></div>
        <div className="section-title"><h3>Entradas</h3><span>Valores recebidos por forma de pagamento</span></div><div className="form-grid form-grid-four">{[['pix', 'Pix'], ['debit', 'Débito'], ['credit', 'Crédito'], ['cash', 'Dinheiro']].map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" step="0.01" value={closing[key]} onChange={event => changeClosing(key, event.target.value)} /></Field>)}</div>
        <div className="section-title"><h3>Despesas</h3><span>Registre o método real de pagamento</span></div><div className="expense-rows">{closing.expenses.map((expense, index) => <div className="expense-row" key={expense.id || index}><Field label="Descrição"><input value={expense.description} onChange={event => updateExpense(index, 'description', event.target.value)} /></Field><Field label="Pagamento"><select value={expense.paymentMethod || 'nao_informado'} onChange={event => updateExpense(index, 'paymentMethod', event.target.value)}><option value="nao_informado">Não informado</option><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="debit">Débito</option><option value="credit">Crédito</option><option value="outro">Outro</option></select></Field><Field label="Valor"><input type="number" min="0" step="0.01" value={expense.amount} onChange={event => updateExpense(index, 'amount', event.target.value)} /></Field><button className="icon-button danger-icon" type="button" aria-label="Remover despesa" onClick={() => changeClosing('expenses', closing.expenses.filter((_, current) => current !== index))}><X size={16} /></button></div>)}</div><button type="button" className="button button-quiet button-small" onClick={() => changeClosing('expenses', [...closing.expenses, { description: '', amount: '', paymentMethod: 'nao_informado' }])}><Plus size={15} />Adicionar despesa</button>
        <div className="form-grid"><Field label="Valor contado em dinheiro"><input type="number" min="0" step="0.01" required value={closing.actual} onChange={event => changeClosing('actual', event.target.value)} /></Field><Field label="Observação"><input value={closing.notes} onChange={event => changeClosing('notes', event.target.value)} /></Field>{closing.id && <Field label="Motivo da retificação"><input required value={closing.reason || ''} onChange={event => changeClosing('reason', event.target.value)} /></Field>}</div>
        {cashEstimate !== null && <div className="expected-preview"><span>Esperado físico estimado</span><strong>{formatCurrency(cashEstimate)}</strong><small>O cálculo é atualizado ao salvar com os dados do servidor.</small></div>}
        <FormActions onCancel={() => setClosing(null)} submitLabel={closing.id ? 'Salvar retificação' : 'Confirmar fechamento'} />
      </form></Panel>}

      {opening && <Panel title={opening.id ? 'Editar fundo' : 'Registrar fundo'} description="Informe se o valor é um aporte novo ou saldo carregado." className="editor-panel"><form className="form-stack" onSubmit={saveOpening}><div className="form-grid"><Field label="Caixa"><select value={opening.register} disabled={!!opening.id} onChange={event => setOpening({ ...opening, register: event.target.value })}>{registers.map(id => <option key={id} value={id}>{state.registers?.[id]?.name || `Caixa ${id}`}</option>)}</select></Field><Field label="Data"><input type="date" required value={opening.date} onChange={event => setOpening({ ...opening, date: event.target.value })} /></Field><Field label="Valor"><input type="number" min="0" step="0.01" required value={opening.amount} onChange={event => setOpening({ ...opening, amount: event.target.value })} /></Field><Field label="Natureza"><select value={opening.ledgerDisposition} onChange={event => setOpening({ ...opening, ledgerDisposition: event.target.value })}><option value="carry-forward">Saldo que já estava no caixa</option><option value="contribution">Aporte novo</option></select></Field><Field label="Colaborador"><select value={opening.collaborator} onChange={event => setOpening({ ...opening, collaborator: event.target.value })}><option value="">Não informado</option>{state.collaborators.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Observação"><input value={opening.notes} onChange={event => setOpening({ ...opening, notes: event.target.value })} /></Field>{opening.id && <><Field label="Motivo da edição"><input required value={opening.reason || ''} onChange={event => setOpening({ ...opening, reason: event.target.value })} /></Field><Field label="Código de confirmação"><input required type="password" inputMode="numeric" value={opening.auditCode || ''} onChange={event => setOpening({ ...opening, auditCode: event.target.value })} /></Field></>}</div><FormActions onCancel={() => setOpening(null)} submitLabel="Salvar fundo" /></form></Panel>}

      <Panel title="Histórico de fechamentos" description="Somente registros do ciclo financeiro selecionado."><DataTable rows={closings} columns={closeColumns} emptyTitle="Nenhum fechamento neste ciclo" emptyDescription="Registre um fechamento para iniciar o histórico." /></Panel>
      <Panel title="Fundos do ciclo" description="Aportes e saldos carregados, com classificação explícita."><DataTable rows={openings} columns={[{ key: 'date', label: 'Data', render: row => formatDate(row.date) }, { key: 'register', label: 'Caixa', render: row => state.registers?.[row.register]?.name || `Caixa ${row.register}` }, { key: 'amount', label: 'Valor', numeric: true, render: row => formatCurrency(row.amount) }, { key: 'ledgerDisposition', label: 'Natureza', render: row => ({ contribution: 'Aporte novo', 'carry-forward': 'Saldo carregado' }[row.ledgerDisposition] || 'Pendente de classificação') }, { key: 'collaborator', label: 'Responsável', render: row => state.collaborators.find(person => person.id === row.collaborator)?.name || 'Não informado' }, { key: 'actions', label: '', render: row => <span className="row-actions"><button className="button button-quiet button-small" onClick={() => { setOpening({ ...row, amount: String(row.amount), reason: '', auditCode: '' }); setClosing(null); }}>Editar</button><button className="button button-quiet button-small danger-text" onClick={() => deleteOpening(row)}>Excluir</button></span> }]} emptyTitle="Nenhum fundo neste ciclo" emptyDescription="Fundos classificados aparecerão aqui." /></Panel>
      <Panel title="Auditoria" description="Retificações e exclusões mantêm cópias dos dados anteriores e atuais."><DataTable rows={auditRows} emptyTitle="Nenhuma alteração auditada" emptyDescription="As retificações e exclusões aparecerão aqui." columns={[{ key: 'timestamp', label: 'Data', render: row => formatDate(row.timestamp) }, { key: 'actionLabel', label: 'Ação', render: row => row.actionLabel || row.action || 'Alteração' }, { key: 'performedBy', label: 'Responsável', render: row => row.performedBy || 'Administrador' }, { key: 'reason', label: 'Motivo', render: row => row.reason || '—' }, { key: 'snapshot', label: 'Versões', render: row => <details className="audit-details"><summary>Ver registros</summary><div><b>Antes</b><pre>{JSON.stringify(row.closingBefore || row.before || null, null, 2)}</pre><b>Depois</b><pre>{JSON.stringify(row.closingAfter || row.after || null, null, 2)}</pre></div></details> }]} /></Panel>
    </div>
  );
}