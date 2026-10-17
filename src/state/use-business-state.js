import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/api.js';
import { mergeBusinessState, statesEqual } from './merge-business-state.js';
import {
  AUTH_EMAIL_KEY,
  AUTH_TOKEN_KEY,
  CONFLICT_DRAFT_KEY,
  defaultBusinessState,
  loadCachedBusinessState,
  loadServerBaseState,
  normalizeBusinessState,
  persistBusinessState,
  persistServerBaseState,
} from './default-state.js';

const POLL_INTERVAL_MS = 8000;
const RETRY_INTERVAL_MS = 5000;

function readSession() {
  return {
    token: localStorage.getItem(AUTH_TOKEN_KEY),
    email: localStorage.getItem(AUTH_EMAIL_KEY) || '',
  };
}

function preserveConflictDraft(localState, paths = []) {
  const snapshot = { savedAt: new Date().toISOString(), conflicts: paths, state: localState };
  try { localStorage.setItem(CONFLICT_DRAFT_KEY, JSON.stringify(snapshot)); } catch { /* A cópia principal também permanece no cache local. */ }
}

function readConflictPaths() {
  try { return JSON.parse(localStorage.getItem(CONFLICT_DRAFT_KEY) || 'null')?.conflicts || []; } catch { return []; }
}

function normalizeRemoteState(value) {
  const remote = normalizeBusinessState(value);
  if (!Array.isArray(value?.collaborators) || value.collaborators.length === 0) remote.collaborators = [];
  return remote;
}

export function useBusinessState() {
  const [businessState, setBusinessState] = useState(() => loadCachedBusinessState() || defaultBusinessState());
  const [session, setSession] = useState(readSession);
  const [syncStatus, setSyncStatus] = useState(() => readSession().token ? localStorage.getItem(CONFLICT_DRAFT_KEY) ? 'conflict' : 'loading' : 'signed-out');
  const [syncError, setSyncError] = useState('');
  const [conflictPaths, setConflictPaths] = useState(readConflictPaths);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const conflictPathsRef = useRef(conflictPaths);

  const stateRef = useRef(businessState);
  const sessionRef = useRef(session);
  const baseStateRef = useRef(null);
  const serverVersionRef = useRef(null);
  const serverReadyRef = useRef(false);
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const bootstrapInFlightRef = useRef(false);
  const localRevisionRef = useRef(0);
  const retryTimerRef = useRef(null);
  const syncRef = useRef(null);
  const pullRef = useRef(null);

  function expireSession(message) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionRef.current = { token: null, email: sessionRef.current.email };
    serverReadyRef.current = false;
    setSession(sessionRef.current);
    setSyncStatus('signed-out');
    setSyncError(message);
  }

  function setCurrentState(value, persist = true) {
    const next = normalizeBusinessState(value);
    stateRef.current = next;
    setBusinessState(next);
    if (persist) {
      try { persistBusinessState(next); } catch { setSyncError('Armazenamento local sem espaço. Exporte um backup antes de continuar.'); }
    }
    return next;
  }

  function scheduleSync(delay = 650) {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => syncRef.current?.(), delay);
  }

  function addConflictPaths(paths) {
    const next = [...new Set([...conflictPathsRef.current, ...paths])];
    conflictPathsRef.current = next;
    setConflictPaths(next);
  }

  function recordMerge(local, remote, base) {
    const result = mergeBusinessState(base || defaultBusinessState(), local, remote);
    if (result.conflicts.length) {
      preserveConflictDraft(local, result.conflicts);
      addConflictPaths(result.conflicts);
    }
    baseStateRef.current = remote;
    persistServerBaseState(remote);
    return result;
  }

  async function syncToServer() {
    const token = sessionRef.current.token;
    if (!token || !serverReadyRef.current || inFlightRef.current || !dirtyRef.current) return;
    inFlightRef.current = true;
    setSyncStatus('saving');
    setSyncError('');

    try {
      for (let attempt = 0; attempt < 4 && dirtyRef.current; attempt++) {
        const snapshot = stateRef.current;
        try {
          const result = await apiRequest('/api/state', token, {
            method: 'PUT',
            body: JSON.stringify({ state: snapshot, version: serverVersionRef.current }),
          });
          if (sessionRef.current.token !== token) return;
          serverVersionRef.current = result.version || null;
          baseStateRef.current = snapshot;
          persistServerBaseState(snapshot);
          dirtyRef.current = !statesEqual(stateRef.current, snapshot);
          if (!dirtyRef.current) {
            setLastSyncedAt(result.updatedAt || new Date().toISOString());
            setSyncStatus(conflictPathsRef.current.length ? 'conflict' : 'synced');
          }
        } catch (error) {
          if (error.status !== 409) throw error;
          const current = await apiRequest('/api/state', token);
          if (sessionRef.current.token !== token) return;
          if (!current.state) throw error;
          const remote = normalizeRemoteState(current.state);
          const merged = recordMerge(snapshot, remote, baseStateRef.current);
          serverVersionRef.current = current.version;
          baseStateRef.current = remote;
          const mergedState = setCurrentState(merged.state);
          dirtyRef.current = !statesEqual(mergedState, remote);
          if (!dirtyRef.current) {
            setLastSyncedAt(current.updatedAt || new Date().toISOString());
            setSyncStatus(merged.conflicts.length ? 'conflict' : 'synced');
          }
        }
      }
      if (dirtyRef.current) scheduleSync(0);
    } catch (error) {
      if (error.status === 401) {
        expireSession('Sua sessão expirou. Entre novamente para continuar sincronizando.');
      } else if (error.status >= 400 && error.status < 500) {
        setSyncStatus('error');
        setSyncError(error.message || 'Os dados não puderam ser salvos.');
      } else {
        setSyncStatus('offline');
        setSyncError(error.message || 'Sem conexão com o servidor.');
        scheduleSync(RETRY_INTERVAL_MS);
      }
    } finally {
      inFlightRef.current = false;
    }
  }
  syncRef.current = syncToServer;

  async function bootstrap(token) {
    if (bootstrapInFlightRef.current) return;
    bootstrapInFlightRef.current = true;
    serverReadyRef.current = false;
    setSyncStatus('loading');
    setSyncError('');
    const revisionAtStart = localRevisionRef.current;
    let bootstrapConflicts = [];
    try {
      const remoteResponse = await apiRequest('/api/state', token);
      if (sessionRef.current.token !== token) return;
      const cached = loadCachedBusinessState();
      const localChangedDuringLoad = localRevisionRef.current !== revisionAtStart;
      const localAtResponse = stateRef.current;
      if (!remoteResponse.state) {
        const initialState = localChangedDuringLoad ? localAtResponse : cached || localAtResponse || defaultBusinessState();
        baseStateRef.current = defaultBusinessState();
        serverVersionRef.current = null;
        setCurrentState(initialState);
        serverReadyRef.current = true;
        dirtyRef.current = true;
        await syncToServer();
        return;
      }

      const remote = normalizeRemoteState(remoteResponse.state);
      let next = remote;
      const localSnapshot = localChangedDuringLoad ? localAtResponse : cached;
      if (localSnapshot) {
        const mergeBase = loadServerBaseState() || defaultBusinessState();
        const merge = recordMerge(localSnapshot, remote, mergeBase);
        bootstrapConflicts = merge.conflicts;
        next = merge.state;
      }
      baseStateRef.current = remote;
      serverVersionRef.current = remoteResponse.version || null;
      persistServerBaseState(remote);
      setCurrentState(next);
      serverReadyRef.current = true;
      dirtyRef.current = !statesEqual(next, remote);
      if (dirtyRef.current) await syncToServer();
      else {
        setLastSyncedAt(remoteResponse.updatedAt || new Date().toISOString());
        setSyncStatus(bootstrapConflicts.length || conflictPathsRef.current.length ? 'conflict' : 'synced');
      }
    } catch (error) {
      setSyncStatus(error.status === 401 ? 'signed-out' : 'offline');
      setSyncError(error.message || 'Não foi possível carregar os dados do servidor.');
      if (error.status === 401) {
        expireSession('Sua sessão expirou. Entre novamente para sincronizar.');
      }
    } finally {
      bootstrapInFlightRef.current = false;
    }
  }

  async function pullFromServer() {
    const token = sessionRef.current.token;
    if (!token || inFlightRef.current || document.visibilityState === 'hidden') return;
    const focusedEditor = document.activeElement?.matches('input,select,textarea');
    const openEditor = document.querySelector('.editor-panel, .inline-editor, [data-sync-pause="true"]');
    if (focusedEditor || openEditor) return;
    if (!serverReadyRef.current) {
      await bootstrap(token);
      return;
    }
    try {
      const response = await apiRequest('/api/state', token);
      if (sessionRef.current.token !== token) return;
      if (!response.state || String(response.version) === String(serverVersionRef.current)) {
        if (dirtyRef.current) await syncToServer();
        return;
      }
      const remote = normalizeRemoteState(response.state);
      if (!dirtyRef.current) {
        baseStateRef.current = remote;
        serverVersionRef.current = response.version;
        persistServerBaseState(remote);
        setCurrentState(remote);
        setLastSyncedAt(response.updatedAt || new Date().toISOString());
        setSyncStatus(conflictPathsRef.current.length ? 'conflict' : 'synced');
        return;
      }
      const merge = recordMerge(stateRef.current, remote, baseStateRef.current);
      baseStateRef.current = remote;
      serverVersionRef.current = response.version;
      const merged = setCurrentState(merge.state);
      dirtyRef.current = !statesEqual(merged, remote);
      if (dirtyRef.current) await syncToServer();
      else setSyncStatus(merge.conflicts.length ? 'conflict' : 'synced');
    } catch (error) {
      if (error.status === 401) {
        expireSession('Sua sessão expirou. Entre novamente para continuar sincronizando.');
      } else setSyncStatus('offline');
    }
  }
  pullRef.current = pullFromServer;

  useEffect(() => {
    if (!session.token) return undefined;
    let active = true;
    bootstrap(session.token).finally(() => { if (!active) return; });
    const poll = setInterval(() => pullRef.current?.(), POLL_INTERVAL_MS);
    const online = () => pullRef.current?.();
    const visible = () => { if (document.visibilityState === 'visible') pullRef.current?.(); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearInterval(poll);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
      clearTimeout(retryTimerRef.current);
    };
  }, [session.token]);

  function updateBusinessState(updater) {
    const current = stateRef.current;
    const next = typeof updater === 'function' ? updater(current) : updater;
    const normalized = setCurrentState(next);
    localRevisionRef.current++;
    if (sessionRef.current.token) {
      dirtyRef.current = true;
      setSyncStatus('saving');
      scheduleSync();
    }
    return normalized;
  }

  async function login({ email, password, createAccount = false, businessName = '' }) {
    setAuthBusy(true);
    setAuthError('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await apiRequest(createAccount ? '/api/auth/register' : '/api/auth/login', null, {
        method: 'POST',
        body: JSON.stringify(createAccount ? { email: normalizedEmail, password, businessName } : { email: normalizedEmail, password }),
      });
      const previousEmail = localStorage.getItem(AUTH_EMAIL_KEY) || '';
      if (previousEmail && previousEmail !== normalizedEmail) {
        const cached = loadCachedBusinessState();
        if (cached) localStorage.setItem(`fluxo-account-archive-v1:${encodeURIComponent(previousEmail)}`, JSON.stringify({ email: previousEmail, archivedAt: new Date().toISOString(), state: cached }));
        localStorage.removeItem(SERVER_BASE_KEY);
        localStorage.removeItem(CONFLICT_DRAFT_KEY);
        baseStateRef.current = null;
        serverVersionRef.current = null;
        dirtyRef.current = false;
        localRevisionRef.current = 0;
        conflictPathsRef.current = [];
        setConflictPaths([]);
        setCurrentState(defaultBusinessState());
      }
      localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      localStorage.setItem(AUTH_EMAIL_KEY, normalizedEmail);
      const nextSession = { token: response.token, email: normalizedEmail };
      sessionRef.current = nextSession;
      serverReadyRef.current = false;
      setSession(nextSession);
      return true;
    } catch (error) {
      setAuthError(error.message || 'Não foi possível autenticar.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }

  function logout() {
    clearTimeout(retryTimerRef.current);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionRef.current = { token: null, email: sessionRef.current.email };
    serverReadyRef.current = false;
    dirtyRef.current = false;
    setSession(sessionRef.current);
    setSyncStatus('signed-out');
  }

  async function syncNow() {
    await pullFromServer();
    if (dirtyRef.current) await syncToServer();
  }

  async function restoreLocalConflictCopy() {
    const raw = localStorage.getItem(CONFLICT_DRAFT_KEY);
    let draft;
    try { draft = JSON.parse(raw || 'null'); } catch { draft = null; }
    if (!draft?.state) {
      setSyncError('A cópia local do conflito não foi encontrada neste dispositivo.');
      return;
    }
    if (!window.confirm('A cópia local será enviada ao servidor e prevalecerá sobre os dados conflitantes. Deseja continuar?')) return;

    const token = sessionRef.current.token;
    if (!token) {
      setSyncError('Entre novamente nesta conta antes de restaurar a cópia local.');
      return;
    }

    setSyncStatus('loading');
    try {
      const response = await apiRequest('/api/state', token);
      if (sessionRef.current.token !== token) return;
      const remote = normalizeRemoteState(response.state || defaultBusinessState());
      const mergeBase = baseStateRef.current || loadServerBaseState() || defaultBusinessState();
      const merged = mergeBusinessState(mergeBase, draft.state, remote);

      const archiveKey = `${CONFLICT_ARCHIVE_KEY}:${encodeURIComponent(sessionRef.current.email || '')}`;
      localStorage.setItem(archiveKey, raw);
      localStorage.removeItem(CONFLICT_DRAFT_KEY);
      serverVersionRef.current = response.version || null;
      baseStateRef.current = remote;
      persistServerBaseState(remote);
      conflictPathsRef.current = [];
      setConflictPaths([]);
      setSyncError('');
      setCurrentState(merged.state);
      localRevisionRef.current++;
      dirtyRef.current = !statesEqual(merged.state, remote);
      if (dirtyRef.current) {
        setSyncStatus('saving');
        scheduleSync(0);
      } else {
        setLastSyncedAt(response.updatedAt || new Date().toISOString());
        setSyncStatus('synced');
      }
    } catch (error) {
      setSyncStatus(error.status === 401 ? 'signed-out' : 'offline');
      setSyncError(error.message || 'Não foi possível recuperar a cópia mais recente do servidor.');
    }
  }

  function downloadConflictCopy() {
    const archiveKey = `${CONFLICT_ARCHIVE_KEY}:${encodeURIComponent(sessionRef.current.email || '')}`;
    const raw = localStorage.getItem(CONFLICT_DRAFT_KEY) || localStorage.getItem(archiveKey);
    if (!raw) return;
    const blob = new Blob([raw], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fluxo-copia-conflito-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function clearConflictNotice() {
    const draft = localStorage.getItem(CONFLICT_DRAFT_KEY);
    const archiveKey = `${CONFLICT_ARCHIVE_KEY}:${encodeURIComponent(sessionRef.current.email || '')}`;
    if (draft) localStorage.setItem(archiveKey, draft);
    localStorage.removeItem(CONFLICT_DRAFT_KEY);
    conflictPathsRef.current = [];
    setConflictPaths([]);
    if (sessionRef.current.token) setSyncStatus(dirtyRef.current ? 'saving' : 'synced');
  }

  return {
    state: businessState,
    updateState: updateBusinessState,
    session,
    authenticated: !!session.token,
    syncStatus,
    syncError,
    conflictPaths,
    lastSyncedAt,
    authBusy,
    authError,
    login,
    logout,
    syncNow,
    restoreLocalConflictCopy,
    downloadConflictCopy,
    clearConflictNotice,
  };
}