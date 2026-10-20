import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { API_URL } from '../config';
import { formatQty } from '../utils/units';
import { AuthContext } from '../AuthContext';
import Profile from './Profile';
import './MotoboyPanel.css';

const CITY = 'Patrocínio - MG';
const REFRESH_MS = 20000; // atualiza a cada 20 segundos
const ALERT_REPEAT_MS = 10000; // repete o alerta até o motoboy tocar na tela
const ALERT_MAX_REPEATS = 6;
const LOCATION_EVERY_MS = 15000; // manda a localização a cada 15 s enquanto tem entrega em rota
const CONFIRM_MS = 5000;

const brl = (v) => `R$ ${(parseFloat(v) || 0).toFixed(2).replace('.', ',')}`;

// 🔔 Notificação com o app fechado (Web Push)
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const keyToBytes = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};

const PROBLEMS = [
  { id: 'ausente', label: '🚪 Cliente ausente' },
  { id: 'endereco', label: '📍 Endereço não encontrado' },
  { id: 'recusou', label: '🙅 Cliente recusou' },
  { id: 'outro', label: '✏️ Outro' }
];

const HISTORY_PERIODS = [
  { days: 1, label: 'Hoje' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' }
];

const PAY_ICON = { pix: '📱', cartao: '💳', dinheiro: '💵' };

// 🔔 Três bipes fortes (diferente do admin) + vibração
const playAlert = (ctx) => {
  if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    [0, 0.35, 0.7].forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1046;
      gain.gain.value = 0.5;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.22);
    });
  } catch (err) {
    console.error('Sem som:', err);
  }
};

// asAdmin = { id, name }: o admin abrindo o painel de um motoboy (Admin → Motoboys)
function MotoboyPanel({ onLogout, asAdmin, onClose }) {
  const { user, token } = useContext(AuthContext);
  const base = asAdmin ? `${API_URL}/motoboys/${asAdmin.id}/panel` : `${API_URL}/motoboys/me`;
  const exit = asAdmin ? onClose : onLogout;

  const [view, setView] = useState('deliveries'); // 'deliveries' | 'profile'
  const [tab, setTab] = useState('mine');         // 'mine' | 'available' | 'history'
  const [mine, setMine] = useState([]);
  const [available, setAvailable] = useState([]);
  const [online, setOnline] = useState(null);
  const [money, setMoney] = useState({ delivered_today: 0, fees_today: 0, cash_pending: 0, cash_orders: 0 });
  const [confirmId, setConfirmId] = useState(null);
  const [problem, setProblem] = useState(null);   // { id, reason, details }
  const [history, setHistory] = useState(null);
  const [historyDays, setHistoryDays] = useState(1);
  const [pushState, setPushState] = useState('off'); // 'off' | 'on' | 'denied' | 'unsupported' | 'ios-install'
  const [locationError, setLocationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [openMapId, setOpenMapId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [lastUpdate, setLastUpdate] = useState(null);

  // 🔔 Alerta de entrega nova
  const audioRef = useRef(null);          // o celular só libera som depois de um toque na tela
  const [soundOn, setSoundOn] = useState(false);
  const [newAlert, setNewAlert] = useState(null); // { text, tab }
  const knownRef = useRef(null);          // ids já vistos (disponíveis + minhas)
  const mineRef = useRef(new Set());
  const claimedRef = useRef(new Set());   // pegas pelo próprio motoboy: não apitam

  const enableSound = () => {
    try {
      const ctx = audioRef.current || new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
      audioRef.current = ctx;
      setSoundOn(true);
      playAlert(ctx); // toca uma vez para ele saber como é
    } catch (err) {
      console.error('Sem som:', err);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3500);
  };

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await fetch(`${base}/deliveries`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        if (!asAdmin) alert('Sua conta foi desativada ou o login expirou. Fale com o Empório.');
        exit();
        return;
      }

      if (!res.ok) throw new Error('Erro ao buscar entregas');

      const data = await res.json();

      const availIds = data.available.map(o => o.id);
      const mineIds = data.mine.map(o => o.id);
      if (knownRef.current) {
        const newAvail = availIds.filter(id => !knownRef.current.has(id));
        const newMine = mineIds.filter(id => !mineRef.current.has(id) && !claimedRef.current.has(id));
        if (newMine.length) {
          setNewAlert({ text: `🛵 ${newMine.length > 1 ? `${newMine.length} entregas novas` : 'Entrega nova'} para você!`, tab: 'mine' });
        } else if (newAvail.length) {
          setNewAlert({ text: `📋 ${newAvail.length > 1 ? `${newAvail.length} entregas disponíveis` : 'Nova entrega disponível'}!`, tab: 'available' });
        }
      }
      knownRef.current = new Set([...availIds, ...mineIds]);
      mineRef.current = new Set(mineIds);

      setMine(data.mine);
      setAvailable(data.available);
      setOnline(data.online);
      setMoney({
        delivered_today: data.delivered_today,
        fees_today: data.fees_today,
        cash_pending: data.cash_pending,
        cash_orders: data.cash_orders
      });
      setLastUpdate(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, base, exit, asAdmin]);

  // Carrega e atualiza sozinho
  useEffect(() => {
    fetchDeliveries();
    const timer = setInterval(fetchDeliveries, REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchDeliveries]);

  // Toca e repete até o motoboy tocar no aviso
  useEffect(() => {
    if (!newAlert) return;
    document.title = `🔔 ${newAlert.text}`;
    let count = 1;
    playAlert(audioRef.current);
    const timer = setInterval(() => {
      if (count++ >= ALERT_MAX_REPEATS) return clearInterval(timer);
      playAlert(audioRef.current);
    }, ALERT_REPEAT_MS);
    return () => {
      clearInterval(timer);
      document.title = 'EMPÓRIO BRUMADO - Motoboy';
    };
  }, [newAlert]);

  const openAlert = () => {
    setTab(newAlert.tab);
    setView('deliveries');
    setNewAlert(null);
  };

  const api = (path, method = 'GET', body) => fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });

  // 🟢 Disponível / ⚪ Offline
  const toggleOnline = async () => {
    try {
      setBusyId('online');
      const res = await api('/online', 'PUT', { online: !online });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao mudar disponibilidade');
      setOnline(data.online);
      showMessage('success', data.online
        ? '🟢 Você está disponível. Vai receber as entregas novas.'
        : '⚪ Turno encerrado. Entregas que ainda não saíram voltaram para a fila.');
      fetchDeliveries();
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  // 🔔 Liga as notificações do celular (silent = só renova, sem pedir permissão)
  const enablePush = useCallback(async (silent = false) => {
    if (!pushSupported()) {
      setPushState(isIOS() && !isStandalone() ? 'ios-install' : 'unsupported');
      return;
    }
    try {
      let permission = Notification.permission;
      if (permission === 'default' && !silent) permission = await Notification.requestPermission();
      if (permission === 'denied') return setPushState('denied');
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch(`${base}/push-key`, { headers: { 'Authorization': `Bearer ${token}` } });
      const { key } = await keyRes.json();
      const sub = (await reg.pushManager.getSubscription())
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
      const res = await fetch(`${base}/push-subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
      if (!res.ok) throw new Error('Erro ao ativar notificações');
      setPushState('on');
      if (!silent) showMessage('success', '🔔 Notificações ativadas! Você será avisado mesmo com o app fechado.');
    } catch (err) {
      console.error('Push:', err);
      if (!silent) showMessage('error', '❌ Não foi possível ativar as notificações neste celular.');
    }
  }, [token, base]);

  useEffect(() => {
    if (!asAdmin) enablePush(true);
  }, [enablePush, asAdmin]);

  // Sair = encerra o turno e para de receber notificações neste celular
  const handleLogout = async () => {
    try {
      if (online) await api('/online', 'PUT', { online: false });
      if (pushSupported()) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        // Só tira o motoboy da lista: o celular pode continuar recebendo os avisos do admin
        if (sub) await api('/push-unsubscribe', 'POST', { endpoint: sub.endpoint });
      }
    } catch (err) {
      console.error(err);
    }
    onLogout();
  };

  // 📍 Com entrega em rota, manda a localização para o cliente acompanhar
  const hasRoute = mine.some(o => o.status === 'Saído');
  useEffect(() => {
    if (asAdmin || !hasRoute || !navigator.geolocation) return undefined;
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationError('');
        if (Date.now() - lastSent < LOCATION_EVERY_MS) return;
        lastSent = Date.now();
        api('/location', 'PUT', { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
      },
      () => setLocationError('Libere a localização do celular para o cliente acompanhar a entrega.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoute, token, asAdmin]);

  // 📜 Histórico
  const fetchHistory = useCallback(async (days) => {
    try {
      setHistory(null);
      const res = await fetch(`${base}/history?days=${days}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Erro ao buscar histórico');
      setHistory(await res.json());
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    }
  }, [token, base]);

  useEffect(() => {
    if (tab === 'history') fetchHistory(historyDays);
  }, [tab, historyDays, fetchHistory]);

  // 🚫 Problema na entrega
  const sendProblem = async (order) => {
    try {
      setBusyId(order.id);
      const res = await api(`/deliveries/${order.id}/problem`, 'PUT', { reason: problem.reason, details: problem.details });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
      setProblem(null);
      showMessage('success', `⚠️ Pedido #${order.id} voltou para o Empório. Leve as mercadorias de volta para a loja.`);
      fetchDeliveries();
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const claimDelivery = async (order) => {
    try {
      setBusyId(order.id);
      claimedRef.current.add(order.id);
      const res = await fetch(`${base}/deliveries/${order.id}/claim`, {
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
    // ✅ Confirma tocando de novo (sem janelinha do navegador)
    if (status === 'Entregue' && confirmId !== order.id) {
      setConfirmId(order.id);
      setTimeout(() => setConfirmId(id => (id === order.id ? null : id)), CONFIRM_MS);
      return;
    }
    setConfirmId(null);

    try {
      setBusyId(order.id);
      const res = await fetch(`${base}/deliveries/${order.id}/status`, {
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

  // 🏘️ Bairro escolhido no pedido (ou o do cadastro, em pedidos antigos)
  const neighborhoodOf = (order) => {
    const n = order.delivery_neighborhood || order.customer_neighborhood;
    return n && n !== '-' ? n : '';
  };

  // 📍 Endereço completo (com cidade) para mapa e navegação
  const fullAddress = (order) => {
    const parts = [order.delivery_address];
    if (neighborhoodOf(order)) {
      parts.push(neighborhoodOf(order));
    }
    parts.push(CITY);
    return parts.join(', ');
  };

  const mapsUrl = (order) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress(order))}`;

  const wazeUrl = (order) =>
    `https://waze.com/ul?q=${encodeURIComponent(fullAddress(order))}&navigate=yes`;

  // 🗺️ Todas as minhas entregas numa rota só (o Google Maps sai da posição atual)
  const routeUrl = (orders) => {
    const stops = orders.map(fullAddress);
    const waypoints = stops.slice(0, -1).slice(0, 9);
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stops[stops.length - 1])}`
      + (waypoints.length ? `&waypoints=${encodeURIComponent(waypoints.join('|'))}` : '')
      + '&travelmode=driving';
  };

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
    const total = brl(order.total);
    switch (order.payment_method) {
      case 'pix':
        return { cls: 'pix', text: `📱 PIX — já pago pelo app. NÃO cobrar (salvo aviso do Empório).` };
      case 'cartao':
        return { cls: 'card', text: `💳 Levar MAQUININHA — cobrar ${total}` };
      default:
        return parseFloat(order.change_for) > 0
          ? { cls: 'cash', text: `💵 DINHEIRO — cobrar ${total}. Troco para ${brl(order.change_for)}: levar ${brl(parseFloat(order.change_for) - parseFloat(order.total))}` }
          : { cls: 'cash', text: `💵 DINHEIRO — cobrar ${total} (cliente tem trocado)` };
    }
  };

  const firstName = ((asAdmin ? asAdmin.name : user?.name) || 'Motoboy').split(' ')[0];
  const list = tab === 'mine' ? mine : tab === 'available' ? available : [];

  return (
    <div className="mb-app">
      {/* HEADER */}
      <header className="mb-header">
        <div className="mb-brand">
          <strong>🛵 EMPÓRIO BRUMADO</strong>
          <span>Área do Motoboy</span>
        </div>
        {asAdmin ? (
          <div className="mb-header-actions">
            <span className="mb-chip mb-chip-static">
              <span className="mb-chip-initial">{firstName.charAt(0).toUpperCase()}</span>
              <span className="mb-chip-name">{firstName}</span>
            </span>
            <button className="mb-logout" onClick={onClose}>← Voltar ao Admin</button>
          </div>
        ) : (
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
          <button className="mb-logout" onClick={handleLogout}>Sair</button>
        </div>
        )}
      </header>

      {newAlert && (
        <button className="mb-alert" onClick={openAlert}>
          <strong>{newAlert.text}</strong>
          <span>Toque para ver</span>
        </button>
      )}

      {asAdmin && (
        <div className="mb-admin-view">
          👁️ Você está vendo o painel de <strong>{asAdmin.name}</strong>. O que fizer aqui vale como se fosse ele.
        </div>
      )}

      {online !== null && (
        <div className={`mb-online ${online ? 'on' : 'off'}`}>
          <div>
            <strong>{online ? '🟢 Disponível' : '⚪ Offline'}</strong>
            <span>{online ? 'Recebendo entregas novas' : 'Você não recebe entregas novas'}</span>
          </div>
          <button onClick={toggleOnline} disabled={busyId === 'online'}>
            {online ? 'Encerrar turno' : '🟢 Ficar disponível'}
          </button>
        </div>
      )}

      {!asAdmin && pushState === 'off' && (
        <button className="mb-push" onClick={() => enablePush(false)}>
          📲 Ativar notificações
          <small>Avisa de entrega nova mesmo com o app fechado ou a tela bloqueada.</small>
        </button>
      )}
      {!asAdmin && pushState === 'denied' && (
        <div className="mb-push-info">🔕 Notificações bloqueadas. Libere em Configurações do celular → Notificações → navegador/app do Empório.</div>
      )}
      {!asAdmin && pushState === 'ios-install' && (
        <div className="mb-push-info">📲 No iPhone, para receber notificações com o app fechado, adicione o app à Tela de Início e abra por lá.</div>
      )}

      {asAdmin ? null : !soundOn ? (
        <button className="mb-sound" onClick={enableSound}>
          🔔 Toque aqui para ativar o som dos alertas de entrega
          <small>Deixe este app aberto e a tela ligada para ouvir quando chegar entrega.</small>
        </button>
      ) : (
        <div className="mb-sound-on">
          🔔 Som ativado. Mantenha o app aberto e a tela ligada para receber os alertas.
        </div>
      )}

      <main className="mb-main">
        {view === 'profile' && !asAdmin ? (
          <Profile onClose={() => setView('deliveries')} />
        ) : (
          <>
            {/* 💰 RESUMO DO DIA */}
            <div className="mb-stats">
              <div className="mb-stat">
                <strong>{money.delivered_today}</strong>
                <span>Entregues hoje</span>
              </div>
              <div className="mb-stat">
                <strong className="mb-money">{brl(money.fees_today)}</strong>
                <span>Taxas hoje</span>
              </div>
              <div className={`mb-stat ${money.cash_pending > 0 ? 'mb-stat-cash' : ''}`}>
                <strong className="mb-money">{brl(money.cash_pending)}</strong>
                <span>Dinheiro p/ devolver</span>
              </div>
            </div>
            {money.cash_pending > 0 && (
              <p className="mb-cash-note">
                💵 Dinheiro em espécie de {money.cash_orders} {money.cash_orders === 1 ? 'entrega' : 'entregas'} ainda não acertado no caixa do Empório.
              </p>
            )}

            {/* ABAS */}
            <div className="mb-tabs">
              <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
                🛵 Minhas ({mine.length})
              </button>
              <button className={tab === 'available' ? 'active' : ''} onClick={() => setTab('available')}>
                📋 Livres ({available.length})
              </button>
              <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
                📜 Histórico
              </button>
            </div>

            {message.text && <div className={`mb-message ${message.type}`}>{message.text}</div>}

            {tab === 'history' ? (
              <div className="mb-history">
                <div className="mb-periods">
                  {HISTORY_PERIODS.map(p => (
                    <button key={p.days} className={historyDays === p.days ? 'active' : ''} onClick={() => setHistoryDays(p.days)}>
                      {p.label}
                    </button>
                  ))}
                </div>
                {!history ? (
                  <div className="mb-empty">Carregando...</div>
                ) : (
                  <>
                    <div className="mb-stats">
                      <div className="mb-stat"><strong>{history.deliveries}</strong><span>Entregas</span></div>
                      <div className="mb-stat"><strong className="mb-money">{brl(history.fees)}</strong><span>Taxas</span></div>
                      <div className="mb-stat">
                        <strong>{history.avg_route_min !== null ? `${history.avg_route_min} min` : '—'}</strong>
                        <span>Tempo médio</span>
                      </div>
                    </div>
                    {history.orders.length === 0 ? (
                      <div className="mb-empty">Nenhuma entrega nesse período.</div>
                    ) : (
                      <ul className="mb-history-list">
                        {history.orders.map(o => {
                          const cash = (o.payment_method || 'dinheiro') === 'dinheiro';
                          return (
                            <li key={o.id}>
                              <div>
                                <strong>#{o.id}</strong> {o.neighborhood && <span>· {o.neighborhood}</span>}
                                <small>
                                  {new Date(o.delivered_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  {o.route_min !== null && o.route_min >= 0 && ` · ⏱️ ${o.route_min} min`}
                                </small>
                              </div>
                              <div className="mb-history-values">
                                <strong>{brl(o.delivery_fee)}</strong>
                                <small>
                                  {PAY_ICON[o.payment_method] || '💵'} {brl(o.total)}
                                  {cash && (o.settled_at ? ' · ✅ acertado' : ' · a devolver')}
                                </small>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="mb-refresh">
                  <span>
                    {lastUpdate ? `Atualizado às ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                  <button onClick={fetchDeliveries}>🔄 Atualizar</button>
                </div>

                {tab === 'mine' && hasRoute && !asAdmin && (
                  <div className={`mb-location ${locationError ? 'err' : ''}`}>
                    {locationError || '📍 O cliente acompanha sua localização enquanto a entrega está em rota (com o app aberto).'}
                  </div>
                )}

                {tab === 'mine' && mine.length >= 2 && (
                  <a href={routeUrl(mine)} target="_blank" rel="noopener noreferrer" className="mb-route">
                    🗺️ Rota com todas as entregas ({mine.length})
                  </a>
                )}

                {/* LISTA */}
                {loading ? (
                  <div className="mb-empty">Carregando entregas...</div>
                ) : list.length === 0 ? (
                  <div className="mb-empty">
                    {tab === 'mine'
                      ? <>📭 Você não tem entregas agora.<br /><small>Veja a aba <strong>Livres</strong>.</small></>
                      : online
                        ? <>✅ Nenhuma entrega esperando motoboy.</>
                        : <>⚪ Você está offline.<br /><small>Toque em <strong>Ficar disponível</strong> para ver e pegar entregas.</small></>}
                  </div>
                ) : (
                  <div className="mb-list">
                    {list.map(order => {
                      const pay = paymentNote(order);
                      const busy = busyId === order.id;
                      const confirming = confirmId === order.id;
                      const reporting = problem && problem.id === order.id;

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
                            {neighborhoodOf(order) && (
                              <p className="mb-neighborhood">Bairro: {neighborhoodOf(order)}</p>
                            )}
                          </div>

                          <div className={`mb-pay ${pay.cls}`}>{pay.text}</div>
                          {order.notes && <div className="mb-notes">📝 {order.notes}</div>}

                          <details className="mb-items">
                            <summary>🧾 Itens ({order.items.length})</summary>
                            <ul>
                              {order.items.map((item, i) => (
                                <li key={i}>{formatQty(item.quantity, item.unit)} {item.name}</li>
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
                            <button
                              className={`mb-btn-main ${confirming ? 'confirm' : 'done'}`}
                              onClick={() => updateStatus(order, 'Entregue')}
                              disabled={busy}
                            >
                              {busy ? '⏳ Salvando...' : confirming ? '👆 Toque de novo para confirmar' : '✅ Entregue'}
                            </button>
                          )}

                          {/* 🚫 PROBLEMA NA ENTREGA */}
                          {tab === 'mine' && (reporting ? (
                            <div className="mb-problem">
                              <strong>O que aconteceu?</strong>
                              <div className="mb-problem-reasons">
                                {PROBLEMS.map(p => (
                                  <button
                                    key={p.id}
                                    className={problem.reason === p.id ? 'active' : ''}
                                    onClick={() => setProblem({ ...problem, reason: p.id })}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="text"
                                maxLength={200}
                                value={problem.details}
                                onChange={(e) => setProblem({ ...problem, details: e.target.value })}
                                placeholder={problem.reason === 'outro' ? 'Escreva o que aconteceu' : 'Detalhes (opcional)'}
                              />
                              <div className="mb-problem-actions">
                                <button className="mb-problem-cancel" onClick={() => setProblem(null)} disabled={busy}>Voltar</button>
                                <button
                                  className="mb-problem-send"
                                  onClick={() => sendProblem(order)}
                                  disabled={busy || !problem.reason || (problem.reason === 'outro' && !problem.details.trim())}
                                >
                                  {busy ? '⏳ Enviando...' : 'Avisar o Empório'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button className="mb-btn-problem" onClick={() => setProblem({ id: order.id, reason: '', details: '' })}>
                              🚫 Problema na entrega
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default MotoboyPanel;