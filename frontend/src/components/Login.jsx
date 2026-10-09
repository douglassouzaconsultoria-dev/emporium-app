import React, { useState, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import './Auth.css';

function Login({ onSwitchToRegister }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="auth-container">
      <div className="auth-box">
        <img src="/logo-eb.svg" alt="" className="auth-logo" />
        <h1>EMPÓRIO BRUMADO</h1>
        <h2>Login</h2>

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
        </form>

        <p className="auth-switch">
          Não tem conta? <button onClick={onSwitchToRegister} className="link-btn">Cadastre-se aqui</button>
        </p>
        <p className="auth-legal">
          Veja os{' '}<a href="/termos.html" target="_blank" rel="noopener noreferrer">Termos de uso</a> e a{' '}
          <a href="/privacidade.html" target="_blank" rel="noopener noreferrer">Política de privacidade</a>.
        </p>
      </div>
    </div>
  );
}

export default Login;