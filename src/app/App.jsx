import { useState } from 'react';
import { useBusinessState } from '../state/use-business-state.js';
import AppShell from './AppShell.jsx';
import LoginScreen from './LoginScreen.jsx';

export default function App() {
  const data = useBusinessState();
  const [page, setPage] = useState('dashboard');

  if (!data.authenticated) {
    return <LoginScreen onLogin={data.login} busy={data.authBusy} error={data.authError} />;
  }

  return <AppShell {...data} page={page} onNavigate={setPage} />;
}