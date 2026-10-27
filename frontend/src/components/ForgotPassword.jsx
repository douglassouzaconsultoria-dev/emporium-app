import React, { useState, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import { API_URL } from '../config';
import './Auth.css';

// 🔑 Esqueci minha senha: o cliente pede → o Empório confere e aprova → chega um código de 6 números
// (por notificação, se o cliente ativou os avisos, ou o Empório passa) → senha nova e já entra
function ForgotPassword({ initialLogin = '', onBack }) {
  const { saveSession } = useContext(AuthContext);
  const [step, setStep] = useState('ask'); // 'ask' | 'code'
  const [login, setLogin] = useState(initialLogin);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const post = async (path, body) => {
    const res = await fetch(`${API_URL}/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não deu certo. Tente de novo.');
    return data;
  };

  const ask = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await post('forgot', { login: login.trim() });
      setStep('code');
      setMessage('✅ Pedido enviado!');
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const data = await post('reset', { login: login.trim(), code, password });
      saveSession(data.token, data.user); // já entra na conta
    } catch (err) {
      setMessage(`❌ ${err.message}`);
      setBusy(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <img src="/logo-eb.svg" alt="" className="auth-logo" />
        <h1>EMPÓRIO BRUMADO</h1>
        <h2>🔑 Criar senha nova</h2>

        {message && <div className={`auth-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

        {step === 'ask' ? (
          <form onSubmit={ask}>
            <p className="forgot-help">
              Digite seu <b>usuário, e-mail ou telefone</b>. O Empório confere que é você e libera um
              <b> código de 6 números</b> para você criar a senha nova.
            </p>
            <input
              type="text"
              placeholder="Usuário, e-mail ou telefone"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="auth-input"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
            />
            <button type="submit" className="auth-btn" disabled={busy}>
              {busy ? 'Enviando...' : 'Pedir código'}
            </button>
            <button type="button" className="auth-link" onClick={() => { setStep('code'); setMessage(''); }}>
              Já tenho o código
            </button>
          </form>
        ) : (
          <form onSubmit={reset}>
            <div className="forgot-steps">
              <p><b>Como recebo o código?</b></p>
              <ul>
                <li>🔔 Chega como <b>notificação</b> neste celular, se você ativou os avisos do pedido;</li>
                <li>📞 ou o Empório te passa assim que conferir.</li>
              </ul>
              <small>O código vale 30 minutos depois de liberado.</small>
            </div>
            <input
              type="text"
              placeholder="Usuário, e-mail ou telefone"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="auth-input"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
            />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Código de 6 números"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="auth-input forgot-code"
              required
            />
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Senha nova (mínimo 6)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                autoComplete="new-password"
                minLength={6}
                style={{ paddingRight: '48px' }}
                required
              />
              <button type="button" className="forgot-eye" onClick={() => setShowPassword(!showPassword)} title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            <button type="submit" className="auth-btn" disabled={busy || code.length !== 6}>
              {busy ? 'Salvando...' : 'Criar senha e entrar'}
            </button>
            <button type="button" className="auth-link" onClick={() => { setStep('ask'); setMessage(''); }}>
              Pedir outro código
            </button>
          </form>
        )}

        <button type="button" className="auth-link" onClick={onBack}>← Voltar para o login</button>
      </div>
    </div>
  );
}

export default ForgotPassword;
