import React, { useState, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import { canInstall, requestInstall } from './InstallBanner';
import ForgotPassword from './ForgotPassword';
import './Auth.css';

function Login({ onSwitchToRegister }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
  const { login } = useContext(AuthContext);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const result = await login(identifier.trim(), password);

    if (!result.success) {
      setMessage(`❌ ${result.error}`);
      setLoading(false);
    }
    // Se deu certo, o app troca de tela sozinho (não precisa recarregar)
  };

  if (forgot) return <ForgotPassword initialLogin={identifier.trim()} onBack={() => setForgot(false)} />;

  return (
    <div className="auth-container">
      <div className="auth-box">
        <img src="/logo-eb.svg" alt="" className="auth-logo" />
        <h1>EMPÓRIO BRUMADO</h1>
        <p className="auth-tagline">Seu delivery de supermercado</p>
        <h2>Login</h2>

        {canInstall() && (
          <button type="button" className="auth-install" onClick={requestInstall}>
            📲 Baixar o app no celular
          </button>
        )}

        {message && <div className={`auth-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Usuário ou e-mail"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="auth-input"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoComplete="username"
            required
          />

          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              autoComplete="current-password"
              style={{ paddingRight: '48px' }}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <button type="button" className="auth-link" onClick={() => setForgot(true)}>
            🔑 Esqueci minha senha
          </button>
        </form>

        <div className="auth-signup">
          <span>Primeira vez aqui?</span>
          <button type="button" onClick={onSwitchToRegister}>
            🛒 Cadastre-se e faça seu pedido
          </button>
          <small>Leva 1 minuto. Depois é só escolher e receber suas compras em casa!</small>
        </div>
        <p className="auth-legal">
          Veja os{' '}<a href="/termos.html" target="_blank" rel="noopener noreferrer">Termos de uso</a> e a{' '}
          <a href="/privacidade.html" target="_blank" rel="noopener noreferrer">Política de privacidade</a>.
        </p>
      </div>
    </div>
  );
}

export default Login;