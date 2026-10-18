import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import './AdminCategories.css';

function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState('all'); // 'all' | 'away' | 'never'
  const [resetId, setResetId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 4000);
  };

  useEffect(() => {
    axios.get(`${API_URL}/customers`, authHeaders())
      .then(res => setCustomers(res.data))
      .catch(err => console.error('Erro ao buscar clientes:', err));
  }, []);

  // 💤 Clientes sumidos: compraram, mas não pedem há 30 dias ou mais
  const AWAY_DAYS = 30;
  const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : null);
  const isAway = (c) => c.last_order_at && daysSince(c.last_order_at) >= AWAY_DAYS;
  const awayCount = customers.filter(isAway).length;
  const neverCount = customers.filter(c => !c.last_order_at).length;

  const term = searchTerm.toLowerCase();
  const filtered = customers
    .filter(c => (view === 'away' ? isAway(c) : view === 'never' ? !c.last_order_at : true))
    .filter(c => [c.name, c.username, c.phone_number, c.neighborhood].some(v => (v || '').toLowerCase().includes(term)))
    .sort((a, b) => (view === 'away' ? daysSince(b.last_order_at) - daysSince(a.last_order_at) : 0));

  const whatsappLink = (phone) => {
    const digits = (phone || '').replace(/\D/g, '');
    return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
  };

  const resetPassword = async (customer) => {
    if (newPassword.length < 6) {
      showMessage('❌ A senha precisa ter pelo menos 6 caracteres');
      return;
    }
    try {
      await axios.put(`${API_URL}/customers/${customer.id}/password`, { password: newPassword }, authHeaders());
      showMessage(`✅ Senha de ${customer.name} redefinida! Passe a nova senha para o cliente.`);
      setResetId(null);
      setNewPassword('');
    } catch (error) {
      showMessage(`❌ ${error.response?.data?.error || 'Erro ao redefinir senha'}`);
    }
  };

  return (
    <div className="admin-categories">
      <div className="admin-header">
        <h2>👥 Clientes</h2>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-label">Total</span>
            <span className="stat-value">{customers.length}</span>
          </div>
        </div>
      </div>

      {message && <div className={`admin-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

      <div className="cu-views">
        <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>Todos ({customers.length})</button>
        <button className={view === 'away' ? 'active' : ''} onClick={() => setView('away')}>💤 Sumidos há {AWAY_DAYS}+ dias ({awayCount})</button>
        <button className={view === 'never' ? 'active' : ''} onClick={() => setView('never')}>🆕 Nunca pediram ({neverCount})</button>
      </div>
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Buscar por nome, usuário, telefone ou bairro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="results-info">
          Mostrando <strong>{filtered.length}</strong> de <strong>{customers.length}</strong> clientes
        </div>
      </div>

      <div className="categories-container">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>📭 Nenhum cliente encontrado</p>
          </div>
        ) : (
          <div className="categories-grid">
            {filtered.map(c => (
              <div key={c.id} className="category-card">
                <div className="category-display">
                  <h3 className="category-name">{c.name}</h3>
                  <p className="category-id">@{c.username}</p>
                  <p>📞 {c.phone_number}</p>
                  <p>🏘️ {c.neighborhood}</p>
                  <p>📦 {c.total_orders} {c.total_orders === 1 ? 'pedido' : 'pedidos'}
                    {parseFloat(c.total_spent) > 0 && ` · R$ ${parseFloat(c.total_spent).toFixed(2).replace('.', ',')}`}</p>
                  <p className={isAway(c) ? 'cu-away' : ''}>
                    🕒 {c.last_order_at
                      ? `Último pedido: ${new Date(c.last_order_at).toLocaleDateString('pt-BR')} (${daysSince(c.last_order_at) === 0 ? 'hoje' : `há ${daysSince(c.last_order_at)} ${daysSince(c.last_order_at) === 1 ? 'dia' : 'dias'}`})`
                      : 'Ainda não fez pedido'}
                  </p>

                  {resetId === c.id ? (
                    <div className="edit-form">
                      <div className="form-group">
                        <label>Nova senha (mín. 6 caracteres)</label>
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="form-input"
                          autoFocus
                        />
                      </div>
                      <div className="form-buttons">
                        <button onClick={() => resetPassword(c)} className="btn-save">💾 Salvar</button>
                        <button onClick={() => { setResetId(null); setNewPassword(''); }} className="btn-cancel">❌ Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="category-actions">
                      <a href={whatsappLink(c.phone_number)} target="_blank" rel="noopener noreferrer" className="btn-edit">
                        💬 WhatsApp
                      </a>
                      <button onClick={() => { setResetId(c.id); setNewPassword(''); }} className="btn-delete">
                        🔑 Redefinir senha
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminCustomers;
