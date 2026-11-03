// 📱 App baixado pela Play Store (Trusted Web Activity): o Android abre o site com a origem
// "android-app://..." e o app é configurado para abrir em /?app=play. Guardado só nesta sessão
// (o Chrome do celular divide os dados com o app; abrir o site no navegador não deve contar como app).
export const detectPlayApp = () => {
  try {
    if (document.referrer.startsWith('android-app://') || new URLSearchParams(window.location.search).get('app') === 'play') {
      sessionStorage.setItem('app-play', '1');
    }
  } catch { /* sem armazenamento */ }
};

export const isPlayApp = () => {
  try { return sessionStorage.getItem('app-play') === '1'; } catch { return false; }
};
