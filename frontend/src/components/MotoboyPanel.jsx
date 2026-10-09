import React, { useState, useEffect, useContext, useCallback } from 'react';
import { API_URL } from '../config';
import { AuthContext } from '../AuthContext';
import Profile from './Profile';
import './MotoboyPanel.css';

const CITY = 'Patrocínio - MG';
const REFRESH_MS = 20000; // atualiza a cada 20 segundos

function MotoboyPanel({ onLogout }) {
  const { user, token } = useContext(AuthContext);

  const [view, setView] = useState('deliveries'); // 'deliveries' | 'profile'
  const [tab, setTab] = useState('mine');         // 'mine' | 'available'
  const [mine, setMine] = useState([]);
  const [available, setAvailable] = useState([]);
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [openMapId, setOpenMapId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [lastUpdate, setLastUpdate] = useState(null);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3500);
  };

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/motoboys/me/deliveries`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        alert('Sua conta foi desativada ou o login expirou. Fale com o Empório.');
        onLogout();
        return;
      }

      if (!res.ok) throw new Error('Erro ao buscar entregas');

      const data = await res.json();
      setMine(data.mine);
      setAvailable(data.available);
      setDeliveredToday(data.delivered_today);
      setLastUpdate(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  // Carrega e atualiza sozinho
  useEffect(() => {
    fetchDeliveries();
    const timer = setInterval(fetchDeliveries, REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchDeliveries]);

  const claimDelivery = async (order) => {
    try {
      setBusyId(order.id);
      const res = await fetch(`${API_URL}/motoboys/me/deliveries/${order.id}/claim`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao pegar entrega');

      showMessage('success', `✅ Pedido #${order.id} é seu!`);
      setTab('mine');
      fetchDeliveries();
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
      fetchDeliveries();
    } finally {
      setBusyId(null);
    }
  };

  const updateStatus = async (order, status) => {
    if (status === 'Entregue' && !window.confirm(`Confirmar que o pedido #${order.id} foi ENTREGUE?`)) return;

    try {
      setBusyId(order.id);
      const res = await fetch(`${API_URL}/motoboys/me/deliveries/${order.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar');

      showMessage('success', status === 'Entregue'
        ? `✅ Pedido #${order.id} entregue! Bom trabalho 💪`
        : `🚀 Boa entrega! Pedido #${order.id} em rota`);
      fetchDeliveries();
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  // 📍 Endereço completo (com cidade) para mapa e navegação
  const fullAddress = (order) => {
    const parts = [order.delivery_address];
    if (order.customer_neighborhood && order.customer_neighborhood !== '-') {
      parts.push(order.customer_neighborhood);
    }
    parts.push(CITY);
    return parts.join(', ');
  };

  const mapsUrl = (order) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress(order))}`;

  const wazeUrl = (order) =>
    `https://waze.com/ul?q=${encodeURIComponent(fullAddress(order))}&navigate=yes`;

  const embedUrl = (order) =>
    `https://maps.google.com/maps?q=${encodeURIComponent(fullAddress(order))}&z=16&output=embed`;

  const phoneDigits = (phone) => (phone || '').replace(/\D/g, '');

  const whatsappUrl = (order) => {
    const digits = phoneDigits(order.customer_phone);
    const full = digits.startsWith('55') ? digits : `55${digits}`;
    const text = `Olá, ${(order.customer_name || '').split(' ')[0]}! Sou o motoboy do Empório Brumado e estou a caminho com seu pedido #${order.id}. 🛵`;
    return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
  };

  // 💰 O que fazer com o pagamento
  const paymentNote = (order) => {
    const total = parseFloat(order.total).toFixed(2);
    switch (order.payment_method) {
      case 'pix':
        return { cls: 'pix', text: `📱 PIX — já pago pelo app. NÃO cobrar (salvo aviso do Empório).` };
      case 'cartao':
        return { cls: 'card', text: `💳 Levar MAQUININHA — cobrar R$ ${total}` };
      default:
        return { cls: 'cash', text: `💵 DINHEIRO — cobrar R$ ${total} (levar troco)` };
    }
  };

  const firstName = (user?.name || 'Motoboy').split(' ')[0];
  const list = tab === 'mine' ? mine : available;

  return (
    <div className="mb-app">
      {/* HEADER */}
      <header className="mb-header">
        <div className="mb-brand">
          <strong>🛵 EMPÓRIO BRUMADO</strong>
          <span>Área do Motoboy</span>
        </div>
        <div className="mb-header-actions">
          <button
            className={`mb-chip ${view === 'profile' ? 'active' : ''}`}
            onClick={() => setView(view === 'profile' ? 'deliveries' : 'profile')}
          >
            {user?.avatar_url
              ? <img src={user.avatar_url} alt={firstName} />
              : <span className="mb-chip-initial">{firstName.charAt(0).toUpperCase()}</span>}
            <span className="mb-chip-name">{firstName}</span>
          </button>
          <button className="mb-logout" onClick={onLogout}>Sair</button>
        </div>
      </header>

      <main className="mb-main">
        {view === 'profile' ? (
          <Profile onClose={() => setView('deliveries')} />
        ) : (
          <>
            {/* RESUMO */}
            <div className="mb-stats">
              <div className="mb-stat">
                <strong>{deliveredToday}</strong>
                <span>Entregues hoje</span>
              </div>
              <div className="mb-stat">
                <strong>{mine.length}</strong>
                <span>Minhas</span>
              </div>
              <div className="mb-stat">
                <strong>{available.length}</strong>
                <span>Disponíveis</span>
              </div>
            </div>

            {/* ABAS */}
            <div className="mb-tabs">
              <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
                🛵 Minhas ({mine.length})
              </button>
              <button className={tab === 'available' ? 'active' : ''} onClick={() => setTab('available')}>
                📋 Disponíveis ({available.length})
              </button>
            </div>

            <div className="mb-refresh">
              <span>
                {lastUpdate ? `Atualizado às ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
              <button onClick={fetchDeliveries}>🔄 Atualizar</button>
            </div>

            {message.text && <div className={`mb-message ${message.type}`}>{message.text}</div>}

            {/* LISTA */}
            {loading ? (
              <div className="mb-empty">Carregando entregas...</div>
            ) : list.length === 0 ? (
              <div className="mb-empty">
                {tab === 'mine'
                  ? <>📭 Você não tem entregas agora.<br /><small>Veja a aba <strong>Disponíveis</strong>.</small></>
                  : <>✅ Nenhuma entrega esperando motoboy.</>}
              </div>
            ) : (
              <div className="mb-list">
                {list.map(order => {
                  const pay = paymentNote(order);
                  const busy = busyId === order.id;

                  return (
                    <div key={order.id} className="mb-card">
                      <div className="mb-card-top">
                        <strong>Pedido #{order.id}</strong>
                        <span className={`mb-status ${order.status === 'Saído' ? 'route' : 'prep'}`}>
                          {order.status === 'Saído' ? '🚀 Em rota' : '👨‍🍳 Preparando'}
                        </span>
                      </div>

                      <div className="mb-customer">
                        <strong>👤 {order.customer_name || 'Cliente'}</strong>
                        {order.customer_phone && <p>📞 {order.customer_phone}</p>}
                        <p>📍 {order.delivery_address}</p>
                        {order.customer_neighborhood && order.customer_neighborhood !== '-' && (
                          <p className="mb-neighborhood">Bairro: {order.customer_neighborhood}</p>
                        )}
                      </div>

                      <div className={`mb-pay ${pay.cls}`}>{pay.text}</div>

                      <details className="mb-items">
                        <summary>🧾 Itens ({order.items.length})</summary>
                        <ul>
                          {order.items.map((item, i) => (
                            <li key={i}>{item.quantity}x {item.name}</li>
                          ))}
                        </ul>
                      </details>

                      {/* MAPA */}
                      <button
                        className="mb-btn-map"
                        onClick={() => setOpenMapId(openMapId === order.id ? null : order.id)}
                      >
                        {openMapId === order.id ? '🗺️ Esconder mapa' : '🗺️ Ver no mapa'}
                      </button>

                      {openMapId === order.id && (
                        <div className="mb-map">
                          <iframe
                            title={`Mapa pedido ${order.id}`}
                            src={embedUrl(order)}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                      )}

                      {/* NAVEGAÇÃO E CONTATO */}
                      <div className="mb-links">
                        <a href={mapsUrl(order)} target="_blank" rel="noopener noreferrer" className="mb-link maps">📍 Google Maps</a>
                        <a href={wazeUrl(order)} target="_blank" rel="noopener noreferrer" className="mb-link waze">🚗 Waze</a>
                        <a href={`tel:${phoneDigits(order.customer_phone)}`} className="mb-link call">📞 Ligar</a>
                        <a href={whatsappUrl(order)} target="_blank" rel="noopener noreferrer" className="mb-link whats">💬 WhatsApp</a>
                      </div>

                      {/* AÇÃO PRINCIPAL */}
                      {tab === 'available' ? (
                        <button className="mb-btn-main claim" onClick={() => claimDelivery(order)} disabled={busy}>
                          {busy ? '⏳ Pegando...' : '🛵 Pegar entrega'}
                        </button>
                      ) : order.status === 'Preparando' ? (
                        <button className="mb-btn-main go" onClick={() => updateStatus(order, 'Saído')} disabled={busy}>
                          {busy ? '⏳ Salvando...' : '🚀 Saí para entrega'}
                        </button>
                      ) : (
                        <button className="mb-btn-main done" onClick={() => updateStatus(order, 'Entregue')} disabled={busy}>
                          {busy ? '⏳ Salvando...' : '✅ Entregue'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default MotoboyPanel;