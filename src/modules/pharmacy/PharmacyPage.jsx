import { useMemo, useState } from 'react';
import { Boxes, Plus, Search } from 'lucide-react';
import { createId, formatCurrency, formatDate } from '../../shared/format.js';
import { DataTable, Field, FormActions, PageHeading, Panel, StatCard } from '../../shared/components.jsx';

function emptyProduct() { return { id: '', name: '', presentation: '', batch: '', expiryDate: '', currentStock: 0, minimumStock: 1, supplier: '', costPrice: '', notes: '', purchased: false }; }

export default function PharmacyPage({ state, updateState }) {
  const [editor, setEditor] = useState(null);
  const [configEditor, setConfigEditor] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const products = state.drogaria.products || [];
  const attentionPercent = Number(state.drogaria.config?.attentionPercent || 130);
  const low = products.filter(item => Number(item.currentStock) <= Number(item.minimumStock));
  const attention = products.filter(item => Number(item.currentStock) <= Number(item.minimumStock) * attentionPercent / 100 && Number(item.currentStock) > Number(item.minimumStock));
  const expired = products.filter(item => item.expiryDate && item.expiryDate < new Date().toISOString().slice(0, 10));
  const visible = useMemo(() => products.filter(item => {
    const matchesQuery = `${item.name} ${item.batch || ''} ${item.supplier || ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
    const status = item.purchased ? 'purchased' : Number(item.currentStock) <= Number(item.minimumStock) ? 'low' : Number(item.currentStock) <= Number(item.minimumStock) * attentionPercent / 100 ? 'attention' : 'normal';
    return matchesQuery && (filter === 'all' || filter === status || (filter === 'expired' && item.expiryDate && item.expiryDate < new Date().toISOString().slice(0, 10)));
  }), [products, query, filter, attentionPercent]);

  function save(event) {
    event.preventDefault();
    const old = products.find(item => item.id === editor.id);
    const now = new Date().toISOString();
    const saved = { ...old, ...editor, id: old?.id || createId(), currentStock: Number(editor.currentStock) || 0, minimumStock: Number(editor.minimumStock) || 0, costPrice: editor.costPrice === '' ? null : Number(editor.costPrice), updatedAt: now, createdAt: old?.createdAt || now };
    updateState(current => ({ ...current, drogaria: { ...current.drogaria, products: old ? current.drogaria.products.map(item => item.id === old.id ? saved : item) : [saved, ...current.drogaria.products] } }));
    setEditor(null);
  }

  function remove(product) {
    if (!window.confirm(`Excluir “${product.name}” do estoque?`)) return;
    updateState(current => ({ ...current, drogaria: { ...current.drogaria, products: current.drogaria.products.filter(item => item.id !== product.id) } }));
  }

  function markPurchased() {
    if (!selectedIds.length) return;
    updateState(current => ({ ...current, drogaria: { ...current.drogaria, products: current.drogaria.products.map(item => selectedIds.includes(item.id) ? { ...item, purchased: true, updatedAt: new Date().toISOString() } : item) } }));
    setSelectedIds([]);
  }

  const statusFor = product => product.purchased ? 'Comprado' : Number(product.currentStock) <= Number(product.minimumStock) ? 'Comprar' : Number(product.currentStock) <= Number(product.minimumStock) * attentionPercent / 100 ? 'Atenção' : 'Normal';

  function saveConfig(event) {
    event.preventDefault();
    const config = { ...state.drogaria.config, attentionPercent: Math.min(300, Math.max(100, Number(configEditor.attentionPercent) || 130)), preExpiryDays: Math.min(365, Math.max(1, Number(configEditor.preExpiryDays) || 90)) };
    updateState(current => ({ ...current, drogaria: { ...current.drogaria, config } }));
    setConfigEditor(false);
  }

  async function copyPurchaseList() {
    const items = products.filter(item => !item.purchased && ['Comprar', 'Atenção'].includes(statusFor(item)));
    if (!items.length) return;
    const text = items.map(item => `${item.name}${item.presentation ? ` — ${item.presentation}` : ''} — comprar ${Math.max(Number(item.minimumStock || 0) - Number(item.currentStock || 0), 0)}${item.supplier ? ` — ${item.supplier}` : ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); } catch { window.prompt('Copie a lista de compras:', text); }
  }

  return <div className="module-page">
    <PageHeading eyebrow="Operação" title="Estoque" description="Produtos, lotes, validade e níveis de reposição." actions={<><button className="button button-quiet" onClick={() => { setConfigEditor({ attentionPercent, preExpiryDays: Number(state.drogaria.config?.preExpiryDays || 90) }); setEditor(null); }}>Configurar alertas</button><button className="button button-quiet" onClick={copyPurchaseList}>Copiar lista</button><button className="button button-primary" onClick={() => setEditor(emptyProduct())}><Plus size={16} />Adicionar produto</button></>} />
    <div className="stats-grid"><StatCard label="Produtos cadastrados" value={String(products.length)} icon={Boxes} /><StatCard label="Para comprar" value={String(low.length)} tone="negative" /><StatCard label="Em atenção" value={String(attention.length)} tone="warning" /><StatCard label="Vencidos" value={String(expired.length)} tone="negative" /></div>
    {configEditor && <Panel title="Alertas do estoque" description="Ajuste os limites usados para classificar os produtos." className="editor-panel"><form className="form-stack" onSubmit={saveConfig}><div className="form-grid"><Field label="Nível de atenção (%)"><input type="number" min="100" max="300" value={configEditor.attentionPercent} onChange={event => setConfigEditor({ ...configEditor, attentionPercent: event.target.value })} /></Field><Field label="Aviso de validade (dias)"><input type="number" min="1" max="365" value={configEditor.preExpiryDays} onChange={event => setConfigEditor({ ...configEditor, preExpiryDays: event.target.value })} /></Field></div><FormActions onCancel={() => setConfigEditor(false)} submitLabel="Salvar alertas" /></form></Panel>}
    {editor && <Panel title={editor.id ? 'Editar produto' : 'Novo produto'} description="Os campos existentes do cadastro são mantidos ao editar." className="editor-panel"><form className="form-stack" onSubmit={save}><div className="form-grid"><Field label="Medicamento / produto"><input required maxLength={120} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></Field><Field label="Apresentação"><input value={editor.presentation || ''} onChange={event => setEditor({ ...editor, presentation: event.target.value })} /></Field><Field label="Lote"><input value={editor.batch || ''} onChange={event => setEditor({ ...editor, batch: event.target.value })} /></Field><Field label="Validade"><input type="date" value={editor.expiryDate || ''} onChange={event => setEditor({ ...editor, expiryDate: event.target.value })} /></Field><Field label="Estoque atual"><input type="number" min="0" step="1" required value={editor.currentStock} onChange={event => setEditor({ ...editor, currentStock: event.target.value })} /></Field><Field label="Estoque mínimo"><input type="number" min="0" step="1" required value={editor.minimumStock} onChange={event => setEditor({ ...editor, minimumStock: event.target.value })} /></Field><Field label="Fornecedor"><input value={editor.supplier || ''} onChange={event => setEditor({ ...editor, supplier: event.target.value })} /></Field><Field label="Custo unitário"><input type="number" min="0" step="0.01" value={editor.costPrice ?? ''} onChange={event => setEditor({ ...editor, costPrice: event.target.value })} /></Field><Field label="Observações"><input value={editor.notes || ''} onChange={event => setEditor({ ...editor, notes: event.target.value })} /></Field></div><FormActions onCancel={() => setEditor(null)} submitLabel="Salvar produto" /></form></Panel>}
    <Panel title="Produtos" description="Acompanhe quantidade disponível, lote e validade."><div className="toolbar-row"><label className="search-field"><Search size={16} /><input placeholder="Buscar produto, lote ou fornecedor" value={query} onChange={event => setQuery(event.target.value)} /></label><select className="toolbar-select" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos</option><option value="low">Para comprar</option><option value="attention">Atenção</option><option value="normal">Normal</option><option value="purchased">Comprados</option><option value="expired">Vencidos</option></select><button className="button button-quiet button-small" onClick={markPurchased} disabled={!selectedIds.length}>Marcar selecionados como comprados</button></div><DataTable rows={visible} emptyTitle="Nenhum produto encontrado" emptyDescription="Adicione itens ao estoque ou ajuste a busca." columns={[{ key: 'select', label: '', render: row => <input type="checkbox" aria-label={`Selecionar ${row.name}`} checked={selectedIds.includes(row.id)} onChange={event => setSelectedIds(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))} /> }, { key: 'name', label: 'Produto', render: row => <span className="cell-stack"><strong>{row.name}</strong><small>{row.presentation || row.supplier || 'Sem apresentação'}</small></span> }, { key: 'batch', label: 'Lote', render: row => row.batch || '—' }, { key: 'expiryDate', label: 'Validade', render: row => formatDate(row.expiryDate) }, { key: 'currentStock', label: 'Disponível', numeric: true, render: row => `${Number(row.currentStock) || 0} un.` }, { key: 'costPrice', label: 'Custo', numeric: true, render: row => row.costPrice == null ? 'Não informado' : formatCurrency(row.costPrice) }, { key: 'status', label: 'Status', render: row => <span className={`status-tag ${statusFor(row) === 'Comprar' ? 'negative' : statusFor(row) === 'Atenção' ? 'warning' : statusFor(row) === 'Comprado' ? 'positive' : 'positive'}`}>{statusFor(row)}</span> }, { key: 'actions', label: '', render: row => <span className="row-actions"><button className="button button-quiet button-small" onClick={() => setEditor({ ...row, costPrice: row.costPrice ?? '' })}>Editar</button><button className="button button-quiet button-small danger-text" onClick={() => remove(row)}>Excluir</button></span> }]} /></Panel>
  </div>;
}