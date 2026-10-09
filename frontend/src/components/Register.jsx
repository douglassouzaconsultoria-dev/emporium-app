import React, { useState, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import './Auth.css';

// Deixa o usuário no formato certo enquanto a pessoa digita
const sanitizeUsername = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20);

function Register({ onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone_number: '',
    address: '',
    neighborhood: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useContext(AuthContext);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'username' ? sanitizeUsername(value) : value
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');

    if (formData.username.length < 3) {
      setMessage('❌ O usuário precisa ter pelo menos 3 caracteres');
      return;
    }
    if (formData.password.length < 6) {
      setMessage('❌ Senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setMessage('❌ As senhas não são iguais');
      return;
    }

    setLoading(true);

    const { confirmPassword, ...dataToSend } = formData;
    const result = await register(dataToSend);

    if (!result.success) {
      setMessage(`❌ ${result.error}`);
      setLoading(false);
    }
    // Se deu certo, o app entra sozinho
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>🛒 EMPÓRIO BRUMADO</h1>
        <h2>Cadastro</h2>

        {message && <div className={`auth-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

        <form onSubmit={handleRegister}>
          <input
            type="text"
            name="name"
            placeholder="Nome completo"
            value={formData.name}
            onChange={handleChange}
            className="auth-input"
            autoComplete="name"
            required
          />

          <input
            type="text"
            name="username"
            placeholder="Usuário (para entrar no app)"
            value={formData.username}
            onChange={handleChange}
            className="auth-input"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoComplete="username"
            required
          />
          <small style={{ display: 'block', margin: '-6px 0 10px', fontSize: '12px', color: '#888', textAlign: 'left' }}>
            Letras minúsculas, números, ponto ou _ (ex.: maria.silva)
          </small>

          <input
            type="email"
            name="email"
            placeholder="E-mail (opcional)"
            value={formData.email}
            onChange={handleChange}
            className="auth-input"
            autoCapitalize="none"
            autoComplete="email"
          />

          <input
            type="tel"
            name="phone_number"
            placeholder="Telefone / WhatsApp (ex: 34999999999)"
            value={formData.phone_number}
            onChange={handleChange}
            className="auth-input"
            autoComplete="tel"
            required
          />

          <input
            type="text"
            name="address"
            placeholder="Endereço completo (rua e número)"
            value={formData.address}
            onChange={handleChange}
            className="auth-input"
            autoComplete="street-address"
            required
          />

          <input
            type="text"
            name="neighborhood"
            placeholder="Bairro"
            value={formData.neighborhood}
            onChange={handleChange}
            className="auth-input"
            required
          />

          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Senha (mín. 6 caracteres)"
              value={formData.password}
              onChange={handleChange}
              className="auth-input"
              autoComplete="new-password"
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

          <input
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            placeholder="Confirmar senha"
            value={formData.confirmPassword}
            onChange={handleChange}
            className="auth-input"
            autoComplete="new-password"
            required
          />

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>

        <p className="auth-switch">
          Já tem conta? <button onClick={onSwitchToLogin} className="link-btn">Faça login aqui</button>
        </p>
        <p className="auth-legal">
          Ao se cadastrar, você concorda com os{' '}<a href="/termos.html" target="_blank" rel="noopener noreferrer">Termos de uso</a> e a{' '}
          <a href="/privacidade.html" target="_blank" rel="noopener noreferrer">Política de privacidade</a>.
        </p>
      </div>
    </div>
  );
}

export default Register;