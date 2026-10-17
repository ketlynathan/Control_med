import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createId, formatCurrency, formatDate } from '../../shared/format.js';
import { DataTable, Field, FormActions, PageHeading, Panel, StatCard } from '../../shared/components.jsx';

export default function AgreementPage({ state, updateState }) {
  const [formOpen, setFormOpen] = useState(false);
  const [collaborator, setCollaborator] = useState('all');
  const entries = state.convenio.entries || [];
  const filtered = entries.filter(row => collaborator === 'all' || String(row.collaboratorId || row.collaborator) === collaborator).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = filtered.reduce((sum, row) => sum + Number(row.total ?? Number(row.quantity || 0) * Number(row.unitPrice || 0)), 0);
  const people = [...new Set(entries.map(row => String(row.collaboratorId || row.collaborator || '')).filter(Boolean))];

  function add(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get('quantity')) || 1;
    const unitPrice = Number(data.get('unitPrice')) || 0;
    const entry = { id: createId(), collaboratorId: String(data.get('collaborator')), productName: String(data.get('productName')).trim(), quantity, unitPrice, total: quantity * unitPrice, date: String(data.get('date')), notes: String(data.get('notes') || '').trim(), createdAt: new Date().toISOString() };
    updateState(current => ({ ...current, convenio: { ...current.convenio, entries: [entry, ...current.convenio.entries] } }));
    setFormOpen(false);
  }

  function remove(entry) {
    if (!window.confirm(`Remover a retirada “${entry.productName}”?`)) return;
    updateState(current => ({ ...current, convenio: { ...current.convenio, entries: current.convenio.entries.filter(row => row.id !== entry.id) } }));
  }

  const nameOf = id => state.collaborators.find(person => person.id === id)?.name || 'Não informado';

  return <div className="module-page">
    <PageHeading eyebrow="Operação" title="Convênio" description="Retiradas de colaboradores e extratos individuais." actions={<button className="button button-primary" onClick={() => setFormOpen(!formOpen)}><Plus size={16} />Registrar retirada</button>} />
    <div className="stats-grid"><StatCard label="Total do filtro" value={formatCurrency(total)} detail="Valor registrado, não recebido" tone="warning" /><StatCard label="Retiradas" value={String(filtered.length)} /><StatCard label="Colaboradores" value={String(people.length)} /></div>
    {formOpen && <Panel title="Nova retirada" description="O convênio não altera o estoque de produtos." className="editor-panel"><form className="form-stack" onSubmit={add}><div className="form-grid"><Field label="Colaborador"><select name="collaborator" required defaultValue=""><option value="">Selecione</option>{state.collaborators.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Data"><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Produto ou medicamento"><input name="productName" required maxLength={160} /></Field><Field label="Quantidade"><input name="quantity" type="number" min="1" step="1" required defaultValue="1" /></Field><Field label="Valor unitário"><input name="unitPrice" type="number" min="0" step="0.01" required /></Field><Field label="Observação"><input name="notes" /></Field></div><FormActions onCancel={() => setFormOpen(false)} submitLabel="Registrar retirada" /></form></Panel>}
    <Panel title="Extrato" description="Filtre por colaborador para conferir valores e lançamentos."><div className="toolbar-row"><Field label="Colaborador"><select value={collaborator} onChange={event => setCollaborator(event.target.value)}><option value="all">Todos</option>{state.collaborators.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field></div><DataTable rows={filtered} emptyTitle="Nenhuma retirada registrada" emptyDescription="As retiradas serão listadas aqui por colaborador." columns={[{ key: 'date', label: 'Data', render: row => formatDate(row.date) }, { key: 'collaborator', label: 'Colaborador', render: row => nameOf(row.collaboratorId || row.collaborator) }, { key: 'productName', label: 'Produto', render: row => row.productName || row.product || row.description }, { key: 'quantity', label: 'Quantidade', numeric: true }, { key: 'unitPrice', label: 'Unitário', numeric: true, render: row => formatCurrency(row.unitPrice) }, { key: 'total', label: 'Total', numeric: true, render: row => formatCurrency(row.total ?? Number(row.quantity) * Number(row.unitPrice)) }, { key: 'actions', label: '', render: row => <button className="icon-button danger-icon" title="Excluir retirada" aria-label="Excluir retirada" onClick={() => remove(row)}><Trash2 size={15} /></button> }]} /></Panel>
  </div>;
}