import React, { useState, useEffect } from 'react';
import './InstallBanner.css';

const DISMISS_KEY = 'installDismissedAt';
const DISMISS_DAYS = 3;

const ua = navigator.userAgent || '';
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Pode instalar? (celular e ainda não instalado)
export const canInstall = () => (isIOS || isAndroid) && !isInstalled();

// Botão em outras telas (ex: login) chama a mesma instalação
export const requestInstall = () => window.dispatchEvent(new Event('request-install'));

const dismissedRecently = () => {
  try {
    const at = parseInt(localStorage.getItem(DISMISS_KEY), 10);
    return at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

// 📲 Faixa "Baixe o app" no celular: Android instala direto; iPhone mostra o passo a passo
function InstallBanner() {
  const [visible, setVisible] = useState(() => canInstall() && !dismissedRecently());
  const [prompt, setPrompt] = useState(() => window.__installPrompt || null);
  const [showHelp, setShowHelp] = useState(false);

  const install = async () => {
    const p = prompt || window.__installPrompt;
    if (p) {
      p.prompt();
      const { outcome } = await p.userChoice;
      window.__installPrompt = null;
      setPrompt(null);
      if (outcome === 'accepted') setVisible(false);
    } else {
      setShowHelp(true); // iPhone ou navegador sem instalação direta
    }
  };

  useEffect(() => {
    const onAvailable = () => setPrompt(window.__installPrompt);
    const onInstalled = () => setVisible(false);
    const onRequest = () => install();
    window.addEventListener('install-available', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('request-install', onRequest);
    return () => {
      window.removeEventListener('install-available', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('request-install', onRequest);
    };
  });

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // sem armazenamento: só esconde agora
    }
    setVisible(false);
  };

  return (
    <>
      {visible && (
      <div className="install-banner">
        <img src="/icon-192.png" alt="" />
        <div className="install-text">
          <strong>Baixe o app do Empório</strong>
          <span>Compre mais rápido, direto da tela do celular</span>
        </div>
        <button className="install-btn" onClick={install}>📲 Instalar</button>
        <button className="install-close" onClick={dismiss} aria-label="Fechar">✕</button>
      </div>
      )}

      {showHelp && (
        <div className="install-overlay" onClick={() => setShowHelp(false)}>
          <div className="install-modal" onClick={(e) => e.stopPropagation()}>
            <button className="install-modal-close" onClick={() => setShowHelp(false)} aria-label="Fechar">✕</button>
            <h3>📲 Instale o app em 3 passos</h3>
            {isIOS ? (
              <ol>
                <li>Abra este site no <b>Safari</b>.</li>
                <li>Toque em <b>Compartilhar</b> <span className="install-icon">⬆️</span> (na barra de baixo).</li>
                <li>Toque em <b>"Adicionar à Tela de Início"</b> e depois em <b>Adicionar</b>.</li>
              </ol>
            ) : (
              <ol>
                <li>Abra este site no <b>Chrome</b>.</li>
                <li>Toque nos <b>três pontinhos ⋮</b> (no canto de cima).</li>
                <li>Toque em <b>"Instalar app"</b> ou <b>"Adicionar à tela inicial"</b>.</li>
              </ol>
            )}
            <p className="install-done">Pronto! O Empório fica na tela do seu celular, como qualquer outro app.</p>
            <video
              src="/videos/baixar-app.mp4"
              poster="/videos/baixar-app-capa.jpg"
              controls
              playsInline
              muted
              preload="none"
            />
          </div>
        </div>
      )}
    </>
  );
}

export default InstallBanner;
