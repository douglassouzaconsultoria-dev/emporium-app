import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { notify } from '../utils/dialog';

// 🔔 Aviso de pedido novo no celular do admin (mesmo com o app fechado)
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const keyToBytes = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

function AdminPushButton() {
  const [state, setState] = useState('loading'); // 'on' | 'off' | 'denied' | 'unsupported' | 'ios-install' | 'loading'
  const [busy, setBusy] = useState(false);

  const subscribe = async (ask) => {
    let permission = Notification.permission;
    if (permission === 'default' && ask) permission = await Notification.requestPermission();
    if (permission === 'denied') return setState('denied');
    if (permission !== 'granted') return setState('off');
    const reg = await navigator.serviceWorker.ready;
    const { key } = await (await fetch(`${API_URL}/settings/push-key`, { headers: auth() })).json();
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
    const res = await fetch(`${API_URL}/settings/push-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (!res.ok) throw new Error('Erro ao ativar');
    setState('on');
  };

  // Se já deu permissão antes, renova a inscrição sozinho
  useEffect(() => {
    if (!supported()) {
      setState(isIOS() && !isStandalone() ? 'ios-install' : 'unsupported');
      return;
    }
    subscribe(false).catch(() => setState('off'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turnOn = async () => {
    try {
      setBusy(true);
      await subscribe(true);
      if (Notification.permission === 'granted') notify('🔔 Pronto! Este aparelho vai avisar quando chegar pedido novo.');
    } catch (err) {
      notify('❌ Não foi possível ativar os avisos neste aparelho.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    try {
      setBusy(true);
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API_URL}/settings/push-unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth() },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
      }
      setState('off');
      notify('🔕 Avisos de pedido desligados neste aparelho.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading' || state === 'unsupported') return null;
  if (state === 'ios-install') {
    return <span className="admin-push-info">📲 No iPhone, instale o app na Tela de Início para receber avisos de pedido.</span>;
  }
  if (state === 'denied') {
    return <span className="admin-push-info">🔕 Avisos bloqueados neste aparelho. Libere as notificações do site nas configurações.</span>;
  }
  return state === 'on' ? (
    <button className="admin-push-btn on" onClick={turnOff} disabled={busy} title="Desligar avisos neste aparelho">
      🔔 Avisos de pedido ligados
    </button>
  ) : (
    <button className="admin-push-btn" onClick={turnOn} disabled={busy}>
      📲 Receber aviso de pedido novo neste aparelho
    </button>
  );
}

export default AdminPushButton;
