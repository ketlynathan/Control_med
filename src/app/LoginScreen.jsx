import { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginScreen({ onLogin, busy, error }) {
  const [createAccount, setCreateAccount] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onLogin({
      email: String(form.get('email') || ''),
      password: String(form.get('password') || ''),
      businessName: String(form.get('businessName') || ''),
      createAccount,
    });
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <div className="auth-wordmark"><span className="brand-mark">F</span><span>Fluxo <small>Gestão financeira</small></span></div>
        <div className="auth-message">
          <span className="eyebrow">Sua operação, em ordem</span>
          <h1>O caixa do negócio acompanha você.</h1>
          <p>Fechamentos, estoque e contas ficam na mesma conta para continuar de onde parou, em qualquer dispositivo.</p>
          <div className="auth-trust"><ShieldCheck size={17} /><span>Acesso protegido e dados salvos no seu banco</span></div>
        </div>
        <span className="auth-footer">FLUXO · CONTROLE OPERACIONAL</span>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-heading"><span className="eyebrow">Bem-vindo</span><h2>{createAccount ? 'Criar conta' : 'Entrar no Fluxo'}</h2><p>Use o mesmo acesso em todos os seus dispositivos.</p></div>
          <div className="auth-tabs" role="tablist" aria-label="Acesso">
            <button type="button" role="tab" aria-selected={!createAccount} className={!createAccount ? 'selected' : ''} onClick={() => setCreateAccount(false)}>Entrar</button>
            <button type="button" role="tab" aria-selected={createAccount} className={createAccount ? 'selected' : ''} onClick={() => setCreateAccount(true)}>Criar conta</button>
          </div>
          <form className="form-stack" onSubmit={submit}>
            {createAccount && <label className="field"><span>Nome do negócio</span><input name="businessName" autoComplete="organization" placeholder="Ex.: Mercado da Praça" /></label>}
            <label className="field"><span>E-mail</span><input name="email" type="email" autoComplete="username" required placeholder="voce@seunegocio.com" /></label>
            <label className="field"><span>Senha</span><input name="password" type="password" minLength={8} autoComplete={createAccount ? 'new-password' : 'current-password'} required placeholder="Mínimo 8 caracteres" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-wide" disabled={busy} type="submit">{busy ? 'Conectando…' : createAccount ? 'Criar minha conta' : 'Entrar'}<ArrowRight size={16} /></button>
          </form>
        </div>
      </section>
    </main>
  );
}