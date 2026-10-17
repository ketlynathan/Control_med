import { useEffect, useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import drogariaLogo from '../../assets/Drogaria Carvalhe.png';
import { AUTH_EMAIL_KEY, CONFLICT_ARCHIVE_KEY, normalizeBusinessState } from '../../state/default-state.js';
import { createId, formatDateTime } from '../../shared/format.js';
import { DataTable, Field, FormActions, PageHeading, Panel } from '../../shared/components.jsx';

function downloadJSON(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function prepareBusinessLogo(file) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 12 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 12 MB.');
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Não foi possível abrir esta imagem.'));
      image.src = source;
    });
    const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar esta imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.82);
  } finally {
    URL.revokeObjectURL(source);
  }
}

const emptyCollaborator = () => ({ id: '', name: '', role: 'Colaborador', code: '' });

export default function SettingsPage({ state, updateState, syncNow, lastSyncedAt, logout }) {
  const [business, setBusiness] = useState(state.business);
  const [collaborator, setCollaborator] = useState(null);
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const businessDraftDirty = useRef(false);
  const email = localStorage.getItem(AUTH_EMAIL_KEY) || '—';
  const conflictArchiveKey = `${CONFLICT_ARCHIVE_KEY}:${encodeURIComponent(email === '—' ? '' : email)}`;
  const hasConflictArchive = !!localStorage.getItem(conflictArchiveKey);

  useEffect(() => {
    if (!businessDraftDirty.current) setBusiness(state.business);
  }, [state.business]);

  function saveBusiness(event) {
    event.preventDefault();
    updateState(current => ({ ...current, business: { ...current.business, ...business, goal: Number(business.goal) || 0 } }));
    businessDraftDirty.current = false;
    setNotice('Dados do negócio salvos e sincronizando.');
  }

  async function selectBusinessLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const logo = await prepareBusinessLogo(file);
      businessDraftDirty.current = true;
      setBusiness(current => ({ ...current, logo }));
      setNotice('Logo selecionado. Salve os dados do negócio para sincronizar.');
    } catch (error) {
      setNotice(error.message || 'Não foi possível carregar o logo.');
    }
  }

  function removeBusinessLogo() {
    businessDraftDirty.current = true;
    setBusiness(current => ({ ...current, logo: '' }));
    setNotice('Logo removido. Salve os dados do negócio para sincronizar.');
  }

  function saveCollaborator(event) {
    event.preventDefault();
    if (!/^\d{4,8}$/.test(String(collaborator.code).trim())) return setNotice('O código deve ter de 4 a 8 dígitos.');
    const previous = state.collaborators.find(item => item.id === collaborator.id);
    const saved = { ...collaborator, id: previous?.id || createId(), name: collaborator.name.trim(), code: String(collaborator.code).trim() };
    updateState(current => ({ ...current, collaborators: previous ? current.collaborators.map(item => item.id === previous.id ? saved : item) : [...current.collaborators, saved] }));
    setCollaborator(null);
    setNotice(previous ? 'Colaborador atualizado.' : 'Colaborador adicionado.');
  }

  function removeCollaborator(person) {
    const used = state.closings.some(row => row.collaborator === person.id) || state.convenio.entries.some(row => (row.collaboratorId || row.collaborator) === person.id);
    if (used) return setNotice('Este colaborador aparece em registros existentes. Altere o código ou o nome, sem excluí-lo.');
    if (!window.confirm(`Excluir o colaborador ${person.name}?`)) return;
    updateState(current => ({ ...current, collaborators: current.collaborators.filter(item => item.id !== person.id) }));
  }

  function exportBackup() {
    downloadJSON(`fluxo-backup-${new Date().toISOString().slice(0, 10)}.json`, state);
    setNotice('Backup completo exportado.');
  }

  function exportConflictArchive() {
    const snapshot = localStorage.getItem(conflictArchiveKey);
    if (snapshot) downloadJSON(`fluxo-conflito-arquivado-${new Date().toISOString().slice(0, 10)}.json`, JSON.parse(snapshot));
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || typeof imported !== 'object' || Array.isArray(imported) || !imported.business || !Array.isArray(imported.closings) || !Array.isArray(imported.transactions)) throw new Error('Formato de backup inválido.');
      downloadJSON(`fluxo-backup-antes-restauracao-${new Date().toISOString().slice(0, 10)}.json`, state);
      if (!window.confirm('O estado do servidor será substituído pelo backup selecionado. Uma cópia do estado atual foi baixada. Deseja continuar?')) return;
      updateState(normalizeBusinessState(imported));
      setNotice('Backup carregado. A nova versão está sendo sincronizada.');
    } catch (error) {
      setNotice(error.message === 'Formato de backup inválido.' ? error.message : 'Não foi possível ler esse arquivo de backup.');
    }
  }

  async function refresh() {
    setSyncing(true);
    await syncNow();
    setSyncing(false);
  }

  return <div className="module-page">
    <PageHeading eyebrow="Sistema" title="Configurações" description="Conta, dados do negócio, colaboradores e cópias de segurança." />
    {notice && <div className="inline-message" role="status">{notice}<button className="text-action" onClick={() => setNotice('')}>Fechar</button></div>}
    <div className="settings-grid">
      <div className="settings-stack">
        <Panel title="Conta e sincronização" description="A mesma conta dá acesso aos dados em outros dispositivos."><div className="settings-metrics"><div><span>E-mail da conta</span><strong>{email}</strong></div><div><span>Estado do servidor</span><strong>Postgres · dados compartilhados</strong></div></div><div className="account-actions"><button className="button button-quiet" onClick={refresh} disabled={syncing}>{syncing ? 'Atualizando…' : '↻ Sincronizar agora'}</button><button className="button button-quiet danger-text" onClick={() => { if (window.confirm('Sair desta conta neste dispositivo? Seus dados continuam salvos no servidor.')) logout(); }}>Sair desta conta</button></div></Panel>
        <Panel title="Dados do negócio" description="Essas informações são mantidas no estado existente da empresa."><form className="form-stack" data-sync-pause={businessDraftDirty.current ? 'true' : undefined} onSubmit={saveBusiness}><div className="form-grid"><Field label="Nome do negócio"><input required maxLength={120} value={business.name || ''} onChange={event => { businessDraftDirty.current = true; setBusiness({ ...business, name: event.target.value }); }} /></Field><Field label="CNPJ ou CPF"><input value={business.doc || ''} onChange={event => { businessDraftDirty.current = true; setBusiness({ ...business, doc: event.target.value }); }} /></Field><Field label="Meta mensal de entradas"><input type="number" min="0" step="0.01" value={business.goal || 0} onChange={event => { businessDraftDirty.current = true; setBusiness({ ...business, goal: event.target.value }); }} /></Field><Field label="Responsável"><input value={business.owner || ''} onChange={event => { businessDraftDirty.current = true; setBusiness({ ...business, owner: event.target.value }); }} /></Field><Field label="Início do primeiro ciclo"><input type="date" value={business.accountingFirstCycleStart || ''} onChange={event => { businessDraftDirty.current = true; setBusiness({ ...business, accountingFirstCycleStart: event.target.value || null }); }} /></Field></div><Field label="Logo do negócio"><div className="business-logo-editor"><img className="business-logo-preview" src={business.logo || drogariaLogo} alt="Prévia do logo" /><label className="button button-quiet file-button"><Upload size={16} />Escolher imagem<input type="file" accept="image/*" onChange={selectBusinessLogo} /></label>{business.logo && <button className="button button-quiet danger-text" type="button" onClick={removeBusinessLogo}><Trash2 size={15} />Usar logo padrão</button>}</div></Field><FormActions submitLabel="Salvar dados" /></form></Panel>
        <Panel title="Colaboradores e códigos" description="O código é solicitado para confirmar fechamentos e exclusões auditadas." action={<button className="button button-quiet button-small" onClick={() => setCollaborator(emptyCollaborator())}><Plus size={15} />Adicionar</button>}>
          {collaborator && <form className="form-stack inline-editor" onSubmit={saveCollaborator}><div className="form-grid"><Field label="Nome"><input required value={collaborator.name} onChange={event => setCollaborator({ ...collaborator, name: event.target.value })} /></Field><Field label="Função"><input value={collaborator.role || ''} onChange={event => setCollaborator({ ...collaborator, role: event.target.value })} /></Field><Field label="Código"><input required inputMode="numeric" pattern="[0-9]{4,8}" minLength="4" maxLength="8" value={collaborator.code} onChange={event => setCollaborator({ ...collaborator, code: event.target.value })} /></Field></div><FormActions onCancel={() => setCollaborator(null)} submitLabel="Salvar colaborador" /></form>}
          <DataTable rows={state.collaborators} emptyTitle="Nenhum colaborador cadastrado" columns={[{ key: 'name', label: 'Nome', render: row => <span className="cell-stack"><strong>{row.name}</strong><small>{row.role || 'Colaborador'}</small></span> }, { key: 'code', label: 'Código', render: row => '••••' }, { key: 'actions', label: '', render: row => <span className="row-actions"><button className="button button-quiet button-small" onClick={() => setCollaborator({ ...row })}>Editar</button><button className="button button-quiet button-small danger-text" onClick={() => removeCollaborator(row)}>Excluir</button></span> }]} />
        </Panel>
      </div>
      <div className="settings-stack">
        <Panel title="Backup completo" description="Inclui lançamentos, fechamentos, contas, estoque, convênio e auditoria."><div className="backup-actions"><button className="button button-primary" onClick={exportBackup}><Download size={16} />Exportar backup</button><label className="button button-quiet file-button"><Upload size={16} />Restaurar backup<input type="file" accept="application/json" onChange={importBackup} /></label></div><p className="muted-copy">Antes da restauração, o estado atual é baixado como cópia de segurança. O arquivo importado substitui os dados compartilhados após confirmação.</p></Panel>
        <Panel title="Histórico de sincronização" description="A cópia local mantém o mesmo formato de dados do servidor."><p className="muted-copy">O app consulta o servidor periodicamente e ao voltar para a rede. Alterações em registros diferentes são combinadas; conflitos no mesmo campo preservam a cópia local para revisão.</p><div className="settings-metrics"><div><span>Última sincronização</span><strong>{formatDateTime(lastSyncedAt)}</strong></div><div><span>Registros preservados</span><strong>{state.closings.length} fechamentos · {state.transactions.length} lançamentos</strong></div></div>{hasConflictArchive && <button className="button button-quiet button-small" onClick={exportConflictArchive}>Baixar conflito arquivado</button>}</Panel>
      </div>
    </div>
  </div>;
}