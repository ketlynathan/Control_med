import { lazy, Suspense, useState } from 'react';
import drogariaLogo from '../assets/Drogaria Carvalhe.png';
import {
  Activity, Boxes, BriefcaseBusiness, CalendarDays, CircleDollarSign, ClipboardList, FileChartColumn,
  LayoutDashboard, LogOut, Menu, RefreshCw, Settings, X,
} from 'lucide-react';
import CashPage from '../modules/cash/CashPage.jsx';
import PayablesPage from '../modules/payables/PayablesPage.jsx';
import PharmacyPage from '../modules/pharmacy/PharmacyPage.jsx';
import AgreementPage from '../modules/agreement/AgreementPage.jsx';
import ReportsPage from '../modules/reports/ReportsPage.jsx';
import SettingsPage from '../modules/settings/SettingsPage.jsx';

const pages = [
  { id: 'dashboard', label: 'Visão geral', group: 'Operação', icon: LayoutDashboard },
  { id: 'cash', label: 'Caixa', group: 'Operação', icon: CircleDollarSign },
  { id: 'payables', label: 'Contas a pagar', group: 'Operação', icon: ClipboardList },
  { id: 'pharmacy', label: 'Estoque', group: 'Operação', icon: Boxes },
  { id: 'agreement', label: 'Convênio', group: 'Operação', icon: BriefcaseBusiness },
  { id: 'reports', label: 'Relatórios', group: 'Análise', icon: FileChartColumn },
  { id: 'settings', label: 'Configurações', group: 'Sistema', icon: Settings },
];

const DashboardPage = lazy(() => import('../modules/dashboard/DashboardPage.jsx'));
const pageComponents = { dashboard: DashboardPage, cash: CashPage, payables: PayablesPage, pharmacy: PharmacyPage, agreement: AgreementPage, reports: ReportsPage, settings: SettingsPage };
const statusLabels = { loading: 'Carregando dados', saving: 'Salvando', synced: 'Sincronizado', offline: 'Sem conexão', error: 'Falha ao salvar', conflict: 'Revisar conflito', 'signed-out': 'Desconectado' };

export default function AppShell(props) {
  const { state, updateState, session, page, onNavigate, syncStatus, syncError, conflictPaths, lastSyncedAt, syncNow, logout, restoreLocalConflictCopy, downloadConflictCopy, clearConflictNotice } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const currentPage = pages.find(item => item.id === page) || pages[0];
  const Page = pageComponents[currentPage.id];
  const syncIcon = syncStatus === 'saving' || syncStatus === 'loading' ? <RefreshCw size={14} className="spin" /> : <Activity size={14} />;
  const groups = [...new Set(pages.map(item => item.group))];

  function navigate(id) {
    onNavigate(id);
    setMenuOpen(false);
  }

  function changeMonth(event) {
    updateState(previous => ({ ...previous, currentMonth: event.target.value }));
  }

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <a className="brand" href="#inicio" onClick={event => { event.preventDefault(); navigate('dashboard'); }}><span className="brand-mark"><img src={state.business.logo || drogariaLogo} alt="" /></span><span className="brand-copy"><strong>Fluxo</strong><small>Gestão financeira</small></span></a>
        <div className="sidebar-business"><span className="business-dot" /><span>{state.business.name || 'Meu negócio'}</span></div>
        <nav className="main-nav" aria-label="Navegação principal">
          {groups.map(group => <div className="nav-group" key={group}><span className="nav-label">{group}</span>{pages.filter(item => item.group === group).map(item => {
            const Icon = item.icon;
            return <button type="button" key={item.id} className={`nav-link ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span></button>;
          })}</div>)}
        </nav>
        <div className="sidebar-bottom"><span>Conta conectada</span><strong>{session.email}</strong></div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-title"><button type="button" className="icon-button mobile-menu" aria-label={menuOpen ? 'Fechar navegação' : 'Abrir navegação'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><div><span className="breadcrumb">{currentPage.group}</span><h1>{currentPage.label}</h1></div></div>
          <div className="topbar-actions">
            <label className="cycle-select"><CalendarDays size={16} /><span className="sr-only">Ciclo financeiro</span><input type="month" value={state.currentMonth} onChange={changeMonth} /></label>
            <button type="button" className={`sync-pill status-${syncStatus}`} onClick={syncNow} title={syncError || `Última sincronização: ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('pt-BR') : 'ainda não sincronizado'}`} aria-label={`${statusLabels[syncStatus] || 'Sincronização'}; atualizar agora`}>{syncIcon}<span>{statusLabels[syncStatus] || 'Sincronização'}</span></button>
            <button type="button" className="icon-button signout-button" aria-label="Sair da conta" title="Sair" onClick={() => { if (window.confirm('Sair desta conta neste dispositivo? Seus dados continuam salvos no servidor.')) logout(); }}><LogOut size={17} /></button>
          </div>
        </header>

        {syncStatus === 'conflict' && <section className="sync-banner" role="alert"><div><strong>Há alterações concorrentes.</strong><span>{conflictPaths.length ? ` Campos afetados: ${conflictPaths.slice(0, 3).join(', ')}${conflictPaths.length > 3 ? '…' : ''}. A cópia local completa está guardada neste dispositivo.` : 'A cópia local foi guardada neste dispositivo.'}</span></div><div className="banner-actions"><button className="button button-quiet button-small" onClick={restoreLocalConflictCopy}>Restaurar cópia local</button><button className="button button-quiet button-small" onClick={downloadConflictCopy}>Baixar cópia local</button><button className="button button-quiet button-small" onClick={clearConflictNotice}>Entendi</button></div></section>}
        {(syncStatus === 'offline' || syncStatus === 'error') && <div className="offline-banner" role="status"><span>{syncError || (syncStatus === 'offline' ? 'Sem conexão. Alterações ficam guardadas neste dispositivo e serão reenviadas ao reconectar.' : 'Não foi possível salvar os dados no servidor. A cópia local permanece neste dispositivo.')}</span><button className="button button-quiet button-small" onClick={syncNow}>Tentar novamente</button></div>}

        <main className="page-content" key={currentPage.id}><Suspense fallback={<div className="module-page" aria-busy="true">Carregando visão geral…</div>}><Page state={state} updateState={updateState} onNavigate={navigate} syncNow={syncNow} lastSyncedAt={lastSyncedAt} session={session} logout={logout} /></Suspense></main>
      </div>
    </div>
  );
}