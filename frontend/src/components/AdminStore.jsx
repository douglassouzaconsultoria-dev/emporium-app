import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import { getAutoPrint, setAutoPrint } from '../utils/printOrder';
import './AdminStore.css';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// 🏪 Loja: aberto/fechado, horários, pedido mínimo, aviso, motoboy padrão e impressora
function AdminStore() {
  const [store, setStore] = useState(null);
  const [motoboys, setMotoboys] = useState([]);
  const [autoPrint, setAutoPrintState] = useState(getAutoPrint());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });

  useEffect(() => {
    axios.get(`${API_URL}/settings/store/admin`, authHeaders())
      .then(res => setStore(res.data))
      .catch(err => console.error('Erro ao buscar dados da loja:', err));
    axios.get(`${API_URL}/motoboys`, authHeaders())
      .then(res => setMotoboys(res.data.filter(m => m.active)))
      .catch(err => console.error('Erro ao buscar motoboys:', err));
  }, []);

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const save = async (next = store) => {
    try {
      setSaving(true);
      const res = await axios.put(`${API_URL}/settings/store`, next, authHeaders());
      setStore(res.data);
      showMessage('✅ Salvo!');
    } catch (error) {
      showMessage(`❌ ${error.response?.data?.error || 'Erro ao salvar'}`);
    } finally {
      setSaving(false);
    }
  };

  const setDay = (i, field, value) => {
    setStore({ ...store, hours: store.hours.map((h, idx) => (idx === i ? { ...h, [field]: value } : h)) });
  };

  const toggleAutoPrint = () => {
    setAutoPrint(!autoPrint);
    setAutoPrintState(!autoPrint);
  };

  if (!store) return <div className="as-loading">Carregando...</div>;

  return (
    <div className="as-container">
      <h2>🏪 Loja</h2>
      {message && <div className={`as-message ${message.includes('✅') ? 'ok' : 'err'}`}>{message}</div>}

      {/* ABERTO / FECHADO */}
      <div className={`as-status ${store.status.open ? 'open' : 'closed'}`}>
        <div>
          <strong>{store.status.open ? '🟢 Loja aberta' : '🔴 Loja fechada'}</strong>
          <span>{store.status.message || 'Recebendo pedidos'}</span>
        </div>
        <button
          onClick={() => save({ ...store, closed_now: !store.closed_now })}
          disabled={saving}
          className={store.closed_now ? 'as-btn-open' : 'as-btn-close'}
        >
          {store.closed_now ? '🔓 Reabrir loja' : '🔒 Fechar agora'}
        </button>
      </div>

      <div className="as-grid">
        {/* PEDIDO MÍNIMO + AVISO */}
        <div className="as-card">
          <h3>💰 Pedido mínimo</h3>
          <p className="as-help">Valor mínimo em produtos (sem a taxa de entrega). Use 0 para não ter mínimo.</p>
          <div className="as-money">
            <span>R$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={store.min_order}
              onChange={(e) => setStore({ ...store, min_order: e.target.value })}
            />
          </div>

          <h3>📢 Aviso na loja</h3>
          <p className="as-help">Aparece no topo para os clientes. Ex: "Frete grátis hoje!" (deixe vazio para não mostrar).</p>
          <input
            type="text"
            maxLength={200}
            className="as-input"
            placeholder="Escreva um aviso..."
            value={store.notice}
            onChange={(e) => setStore({ ...store, notice: e.target.value })}
          />
        </div>

        {/* MOTOBOY PADRÃO + IMPRESSORA */}
        <div className="as-card">
          <h3>🛵 Motoboy padrão</h3>
          <p className="as-help">Todo pedido novo já entra com esse motoboy. Você pode trocar em cada pedido.</p>
          <select
            className="as-input"
            value={store.default_motoboy_id || ''}
            onChange={(e) => setStore({ ...store, default_motoboy_id: e.target.value ? parseInt(e.target.value) : null })}
          >
            <option value="">— Nenhum (escolho em cada pedido) —</option>
            {motoboys.map(m => (
              <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>
            ))}
          </select>

          <h3>🖨️ Impressora</h3>
          <label className="as-switch">
            <input type="checkbox" checked={autoPrint} onChange={toggleAutoPrint} />
            <span>Imprimir pedidos novos automaticamente <em>neste computador</em></span>
          </label>
          <p className="as-help">
            Deixe o painel Admin aberto. Para imprimir sem a janela de confirmação, abra o Chrome com o atalho
            que tem <code>--kiosk-printing</code> e deixe a impressora (ex: Bematech MP-4200 TH) como padrão do Windows.
          </p>
        </div>
      </div>

      {/* HORÁRIOS */}
      <div className="as-card">
        <div className="as-card-head">
          <h3>🕒 Horário de funcionamento</h3>
          <label className="as-switch">
            <input
              type="checkbox"
              checked={store.hours_enabled}
              onChange={(e) => setStore({ ...store, hours_enabled: e.target.checked })}
            />
            <span>Usar horário (fora dele, a loja não aceita pedidos)</span>
          </label>
        </div>

        <div className={`as-hours ${store.hours_enabled ? '' : 'disabled'}`}>
          {store.hours.map((h, i) => (
            <div key={i} className="as-day">
              <strong>{DAYS[i]}</strong>
              <label className="as-day-open">
                <input type="checkbox" checked={!h.closed} onChange={(e) => setDay(i, 'closed', !e.target.checked)} />
                {h.closed ? 'Fechado' : 'Aberto'}
              </label>
              <input type="time" value={h.open} disabled={h.closed} onChange={(e) => setDay(i, 'open', e.target.value)} />
              <span>às</span>
              <input type="time" value={h.close} disabled={h.closed} onChange={(e) => setDay(i, 'close', e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <button className="as-save" onClick={() => save()} disabled={saving}>
        {saving ? '⏳ Salvando...' : '💾 Salvar configurações'}
      </button>
    </div>
  );
}

export default AdminStore;
