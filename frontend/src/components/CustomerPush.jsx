import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { notify } from '../utils/dialog';
import './CustomerPush.css';

// 🔔 Avisos do pedido no celular do cliente (só do pedido dele: pagamento confirmado, saiu, entregue, cancelado)
// Só liga se o cliente tocar em "Ativar" e permitir; dá para desligar quando quiser.
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const keyToBytes = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

// variant 'card' (Meus Pedidos / Perfil) ou 'sheet' (logo depois de fazer o pedido, com botão de fechar)
function CustomerPush({ variant = 'card', onClose }) {
  const [state, setState] = useState('loading'); // 'on' | 'off' | 'denied' | 'unsupported' | 'ios-install' | 'loading'
  const [busy, setBusy] = useState(false);

  const subscribe = async (ask) => {
    let permission = Notification.permission;
    if (permission === 'default' && ask) permission = await Notification.requestPermission();
    if (permission === 'denied') return setState('denied');
    if (permission !== 'granted') return setState('off');
    const reg = await navigator.serviceWorker.ready;
    const { key } = await (await fetch(`${API_URL}/auth/push-key`, { headers: auth() })).json();
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
    const res = await fetch(`${API_URL}/auth/push-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (!res.ok) throw new Error('Erro ao ativar');
    setState('on');
  };

  // Já permitiu antes: renova sozinho (sem perguntar de novo)
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
      if (Notification.permission === 'granted') {
        notify('🔔 Pronto! Você vai ser avisado quando seu pedido sair e quando for entregue.');
        if (onClose) onClose();
      }
    } catch {
      notify('❌ Não foi possível ativar os avisos neste celular.', 'error');
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
        await fetch(`${API_URL}/auth/push-unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth() },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
      }
      setState('off');
      notify('🔕 Avisos do pedido desligados neste celular.');
    } finally {
      setBusy(false);
    }
  };

  // Logo depois do pedido: só aparece para quem ainda não ativou (e pode ativar)
  if (variant === 'sheet') {
    if (state !== 'off') return null;
    return (
      <div className="cpush-sheet" role="dialog" aria-label="Avisos do pedido">
        <button type="button" className="cpush-close" onClick={onClose} aria-label="Fechar">✕</button>
        <strong>🔔 Quer saber quando seu pedido sair?</strong>
        <p>A gente avisa aqui no celular quando ele sair para entrega e quando for entregue.</p>
        <button type="button" className="cpush-on" onClick={turnOn} disabled={busy}>
          {busy ? 'Ativando...' : '🔔 Sim, me avise'}
        </button>
        <button type="button" className="cpush-later" onClick={onClose}>Agora não</button>
      </div>
    );
  }

  if (state === 'loading' || state === 'unsupported') return null;
  return (
    <div className={`cpush-card ${state === 'on' ? 'on' : ''}`}>
      {state === 'on' ? (
        <>
          <span>🔔 Avisos do pedido ligados neste celular</span>
          <button type="button" onClick={turnOff} disabled={busy}>Desligar</button>
        </>
      ) : state === 'off' ? (
        <>
          <span>🔔 Receba um aviso quando seu pedido <b>sair para entrega</b> e quando for <b>entregue</b>.</span>
          <button type="button" className="cpush-on" onClick={turnOn} disabled={busy}>{busy ? 'Ativando...' : 'Ativar avisos'}</button>
        </>
      ) : state === 'ios-install' ? (
        <span>📲 No iPhone, adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) para receber avisos do pedido.</span>
      ) : (
        <span>🔕 Os avisos estão bloqueados neste celular. Para receber, libere as notificações do site nas configurações do navegador.</span>
      )}
    </div>
  );
}

export default CustomerPush;
