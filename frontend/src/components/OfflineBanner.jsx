import React, { useEffect, useRef, useState } from 'react';
import './OfflineBanner.css';

// 📶 Está com internet? (atualiza sozinho quando cai ou volta)
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// Faixa no topo: some sozinha quando a internet volta (mostra "voltou" por 3 segundos)
function OfflineBanner({ text = 'Você está sem internet.' }) {
  const online = useOnline();
  const [back, setBack] = useState(false);
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBack(true);
    const timer = setTimeout(() => setBack(false), 3000);
    return () => clearTimeout(timer);
  }, [online]);

  if (online && !back) return null;
  return (
    <div className={`offline-banner ${online ? 'back' : ''}`} role="status">
      {online ? '✅ Internet de volta!' : <>📶 <b>Sem internet.</b> {text}</>}
    </div>
  );
}

export default OfflineBanner;
