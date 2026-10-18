import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import MotoboyPanel from './MotoboyPanel';
import { confirmDialog } from '../utils/dialog';
import './AdminMotoboys.css';

const emptyForm = { name: '', username: '', phone_number: '', password: '' };

const brl = (v) => `R$ ${(parseFloat(v) || 0).toFixed(2).replace('.', ',')}`;

// 📅 Períodos do relatório (datas locais AAAA-MM-DD)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const REPORT_PERIODS = [
  { id: 'today', label: 'Hoje', range: (t) => [t, t] },
  { id: '7d', label: '7 dias', range: (t) => [new Date(t.getFullYear(), t.getMonth(), t.getDate() - 6), t] },
  { id: 'month', label: 'Este mês', range: (t) => [new Date(t.getFullYear(), t.getMonth(), 1), t] },
  { id: 'last', label: 'Mês passado', range: (t) => [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)] }
];

const sanitizeUsername = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20);

function AdminMotoboys() {
  const [motoboys, setMotoboys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Janela: null | 'create' | 'edit' | 'password'
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [settleId, setSettleId] = useState(null);
  const [panelOf, setPanelOf] = useState(null); // 👁️ motoboy cujo painel está aberto
  const [period, setPeriod] = useState('today');
  const [report, setReport] = useState(null);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  });

  useEffect(() => {
    fetchMotoboys();
  }, []);

  // 📊 Relatório por período
  useEffect(() => {
    const [from, to] = REPORT_PERIODS.find(p => p.id === period).range(new Date());
    setReport(null);
    fetch(`${API_URL}/motoboys/report?from=${ymd(from)}&to=${ymd(to)}`, { headers: authHeaders() })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Erro ao montar o relatório'))))
      .then(setReport)
      .catch(err => { setReport([]); showMessage('error', `❌ ${err.message}`); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // 💰 Acerto de caixa: toca uma vez para confirmar, de novo para registrar
  const settle = async (m) => {
    if (settleId !== m.id) {
      setSettleId(m.id);
      setTimeout(() => setSettleId(id => (id === m.id ? null : id)), 5000);
      return;
    }
    try {
      setSettleId(null);
      const res = await fetch(`${API_URL}/motoboys/${m.id}/settle`, { method: 'PUT', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao fazer o acerto');
      showMessage('success', `✅ Acerto de ${m.name.split(' ')[0]}: ${brl(data.total)} recebidos (${data.orders} ${data.orders === 1 ? 'entrega' : 'entregas'})`);
      fetchMotoboys();
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving]);

  const fetchMotoboys = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/motoboys`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Erro ao buscar motoboys');
      setMotoboys(await res.json());
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3500);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setSelected(null);
    setFormError('');
    setModal('create');
  };

  const openEdit = (m) => {
    setSelected(m);
    setForm({ name: m.name || '', username: m.username || '', phone_number: m.phone_number || '', password: '' });
    setFormError('');
    setModal('edit');
  };

  const openPassword = (m) => {
    setSelected(m);
    setNewPassword('');
    setFormError('');
    setModal('password');
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);
    setFormError('');
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.username || !form.phone_number.trim() || !form.password) {
      setFormError('❌ Preencha todos os campos');
      return;
    }
    if (form.password.length < 6) {
      setFormError('❌ A senha precisa ter pelo menos 6 caracteres');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/motoboys`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar');

      closeModal();
      fetchMotoboys();
      showMessage('success', `✅ Motoboy ${data.motoboy.name} cadastrado! Login: ${data.motoboy.username}`);
    } catch (err) {
      setFormError(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveMotoboy = async (m, overrides = {}) => {
    const body = {
      name: m.name,
      username: m.username,
      phone_number: m.phone_number,
      active: m.active,
      ...overrides
    };

    const res = await fetch(`${API_URL}/motoboys/${m.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
    return data;
  };

  const handleEdit = async () => {
    if (!form.name.trim() || !form.username || !form.phone_number.trim()) {
      setFormError('❌ Preencha nome, usuário e telefone');
      return;
    }

    try {
      setSaving(true);
      await saveMotoboy(selected, {
        name: form.name,
        username: form.username,
        phone_number: form.phone_number
      });
      closeModal();
      fetchMotoboys();
      showMessage('success', '✅ Motoboy atualizado!');
    } catch (err) {
      setFormError(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    const willDeactivate = m.active;
    const msg = willDeactivate
      ? `Desativar ${m.name}? Ele não vai conseguir entrar no app, e as entregas que ainda não saíram voltam para a fila.`
      : `Reativar ${m.name}?`;
    if (!(await confirmDialog(msg, { okText: willDeactivate ? '⛔ Desativar' : '✅ Reativar', danger: willDeactivate }))) return;

    try {
      await saveMotoboy(m, { active: !m.active });
      fetchMotoboys();
      showMessage('success', willDeactivate ? '✅ Motoboy desativado' : '✅ Motoboy reativado');
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    }
  };

  const handlePassword = async () => {
    if (newPassword.length < 6) {
      setFormError('❌ A senha precisa ter pelo menos 6 caracteres');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/motoboys/${selected.id}/password`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha');

      closeModal();
      showMessage('success', `✅ Senha de ${selected.name} redefinida!`);
    } catch (err) {
      setFormError(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const whatsappLink = (phone) => {
    const digits = (phone || '').replace(/\D/g, '');
    const full = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${full}`;
  };

  // 📊 Resumo
  const activeCount = motoboys.filter(m => m.active).length;
  const onRouteCount = motoboys.filter(m => m.active_deliveries > 0).length;
  const onlineCount = motoboys.filter(m => m.active && m.online).length;
  const cashTotal = motoboys.reduce((sum, m) => sum + (parseFloat(m.cash_pending) || 0), 0);
  const deliveredToday = motoboys.reduce((sum, m) => sum + (m.delivered_today || 0), 0);

  return (
    <div className="am-container">
      <div className="am-header">
        <h2>🛵 Motoboys</h2>
        <button className="am-btn-new" onClick={openCreate}>➕ Cadastrar Motoboy</button>
      </div>

      <div className="am-stats">
        <div className="am-stat">
          <span className="am-stat-label">Disponíveis agora</span>
          <span className="am-stat-value am-green">{onlineCount} <small>de {activeCount}</small></span>
        </div>
        <div className="am-stat">
          <span className="am-stat-label">Com entregas</span>
          <span className="am-stat-value am-blue">{onRouteCount}</span>
        </div>
        <div className="am-stat">
          <span className="am-stat-label">Entregas hoje</span>
          <span className="am-stat-value am-green">{deliveredToday}</span>
        </div>
        <div className="am-stat">
          <span className="am-stat-label">Dinheiro a acertar</span>
          <span className="am-stat-value">{brl(cashTotal)}</span>
        </div>
      </div>

      {message.text && <div className={`am-message ${message.type}`}>{message.text}</div>}

      {loading ? (
        <div className="am-empty">Carregando...</div>
      ) : motoboys.length === 0 ? (
        <div className="am-empty">
          <p>🛵 Nenhum motoboy cadastrado ainda</p>
          <button className="am-btn-new" onClick={openCreate}>➕ Cadastrar o primeiro</button>
        </div>
      ) : (
        <div className="am-grid">
          {motoboys.map(m => (
            <div key={m.id} className={`am-card ${m.active ? '' : 'am-inactive'}`}>
              <div className="am-card-top">
                <div className="am-avatar">
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt={m.name} />
                    : <span>{(m.name || '?').charAt(0).toUpperCase()}</span>}
                </div>
                <div className="am-info">
                  <strong>{m.name}</strong>
                  <span className="am-username">@{m.username}</span>
                  <span className={`am-badge ${m.active && m.online ? 'on' : 'off'}`}>
                    {!m.active ? '⛔ Desativado' : m.online ? '🟢 Disponível' : '⚪ Offline'}
                  </span>
                </div>
              </div>

              <div className="am-numbers">
                <div>
                  <strong>{m.active_deliveries}</strong>
                  <span>em andamento</span>
                </div>
                <div>
                  <strong>{m.delivered_today}</strong>
                  <span>hoje</span>
                </div>
                <div>
                  <strong>{m.total_delivered}</strong>
                  <span>total</span>
                </div>
              </div>

              <div className="am-money">
                <div>
                  <span>Taxas hoje</span>
                  <strong>{brl(m.fees_today)}</strong>
                </div>
                <div className={parseFloat(m.cash_pending) > 0 ? 'due' : ''}>
                  <span>Dinheiro a acertar</span>
                  <strong>{brl(m.cash_pending)}</strong>
                </div>
              </div>
              {parseFloat(m.cash_pending) > 0 && (
                <button className={`am-btn-settle ${settleId === m.id ? 'confirm' : ''}`} onClick={() => settle(m)}>
                  {settleId === m.id ? `👆 Toque de novo: recebi ${brl(m.cash_pending)}` : '💰 Fazer acerto (recebi o dinheiro)'}
                </button>
              )}

              <button className="am-btn-panel" onClick={() => setPanelOf(m)}>
                👁️ Ver painel do motoboy
              </button>

              <a className="am-whats" href={whatsappLink(m.phone_number)} target="_blank" rel="noopener noreferrer">
                💬 {m.phone_number}
              </a>

              <div className="am-actions">
                <button className="am-btn-edit" onClick={() => openEdit(m)}>✏️ Editar</button>
                <button className="am-btn-light" onClick={() => openPassword(m)}>🔑 Senha</button>
                <button
                  className={m.active ? 'am-btn-danger' : 'am-btn-success'}
                  onClick={() => toggleActive(m)}
                >
                  {m.active ? '⛔ Desativar' : '✅ Reativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 👁️ PAINEL DO MOTOBOY (o mesmo que ele vê no celular) */}
      {panelOf && (
        <div className="am-panel-overlay">
          <MotoboyPanel
            asAdmin={{ id: panelOf.id, name: panelOf.name }}
            onClose={() => { setPanelOf(null); fetchMotoboys(); }}
          />
        </div>
      )}

      {/* 📊 RELATÓRIO */}
      <section className="am-report">
        <div className="am-report-head">
          <h3>📊 Relatório de entregas</h3>
          <div className="am-periods">
            {REPORT_PERIODS.map(p => (
              <button key={p.id} className={period === p.id ? 'active' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
        {!report ? (
          <p className="am-report-empty">Carregando...</p>
        ) : report.length === 0 ? (
          <p className="am-report-empty">Nenhuma entrega nesse período.</p>
        ) : (
          <div className="am-report-table">
            <table>
              <thead>
                <tr>
                  <th>Motoboy</th>
                  <th>Entregas</th>
                  <th>Taxas</th>
                  <th>Dinheiro recebido</th>
                  <th title="Da saída da loja até a entrega">Tempo na rua</th>
                  <th title="Do pedido feito até a entrega">Tempo total</th>
                </tr>
              </thead>
              <tbody>
                {report.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.deliveries}</td>
                    <td>{brl(r.fees)}</td>
                    <td>{brl(r.cash)}</td>
                    <td>{r.avg_route_min !== null ? `${r.avg_route_min} min` : '—'}</td>
                    <td>{r.avg_total_min !== null ? `${r.avg_total_min} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {report.length > 1 && (
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{report.reduce((s, r) => s + r.deliveries, 0)}</td>
                    <td>{brl(report.reduce((s, r) => s + r.fees, 0))}</td>
                    <td>{brl(report.reduce((s, r) => s + r.cash, 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      {/* JANELAS */}
      {modal && (
        <div className="am-overlay" onClick={() => !saving && closeModal()}>
          <div className="am-modal" onClick={(e) => e.stopPropagation()}>
            <div className="am-modal-header">
              <h3>
                {modal === 'create' && '➕ Cadastrar Motoboy'}
                {modal === 'edit' && `✏️ Editar ${selected?.name}`}
                {modal === 'password' && `🔑 Nova senha: ${selected?.name}`}
              </h3>
              <button className="am-close" onClick={closeModal} disabled={saving}>✕</button>
            </div>

            <div className="am-modal-body">
              {formError && <div className="am-message error">{formError}</div>}

              {(modal === 'create' || modal === 'edit') && (
                <>
                  <div className="am-field">
                    <label>Nome completo</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ex: João da Silva"
                    />
                  </div>

                  <div className="am-field">
                    <label>Usuário (login do motoboy)</label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: sanitizeUsername(e.target.value) })}
                      placeholder="Ex: joao.moto"
                      autoCapitalize="none"
                    />
                  </div>

                  <div className="am-field">
                    <label>Telefone / WhatsApp</label>
                    <input
                      type="tel"
                      value={form.phone_number}
                      onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                      placeholder="Ex: 34999999999"
                    />
                  </div>

                  {modal === 'create' && (
                    <div className="am-field">
                      <label>Senha inicial (mín. 6 caracteres)</label>
                      <input
                        type="text"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="Passe essa senha para o motoboy"
                      />
                      <small>💡 Depois ele pode trocar no perfil dele.</small>
                    </div>
                  )}
                </>
              )}

              {modal === 'password' && (
                <div className="am-field">
                  <label>Nova senha (mín. 6 caracteres)</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Digite a nova senha"
                  />
                  <small>💡 Passe a nova senha para o motoboy.</small>
                </div>
              )}
            </div>

            <div className="am-modal-footer">
              <button className="am-btn-light" onClick={closeModal} disabled={saving}>Cancelar</button>
              <button
                className="am-btn-save"
                disabled={saving}
                onClick={
                  modal === 'create' ? handleCreate :
                  modal === 'edit' ? handleEdit :
                  handlePassword
                }
              >
                {saving ? '⏳ Salvando...' : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminMotoboys;