import React, { useEffect, useRef, useState } from 'react';
import './ProductCamera.css';

// 📷 Câmera dentro do app: abre sempre a câmera traseira (principal) do celular.
// O atributo capture="environment" do <input> é só uma sugestão e alguns celulares abrem a frontal.
// ⚡ Flash (lanterna do celular, quando ele deixa): desligado → só na hora da foto → sempre ligado
// # Linhas: grade de terços + quadrado do meio (a foto final da loja é quadrada) para centralizar o produto
const MAX_SIDE = 1600;
const FLASH_MODES = ['off', 'shot', 'on'];
const FLASH_LABEL = { off: '⚡ Flash: não', shot: '⚡ Flash: na foto', on: '🔦 Luz ligada' };
const FLASH_WARMUP_MS = 700; // a lanterna demora um pouco para acender por completo
const pref = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const savePref = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* sem armazenamento: só não lembra */ }
};
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isBackLabel = (label) => /back|rear|traseira|environment|trás/i.test(label || '');

async function openStream(deviceId) {
  if (deviceId) {
    return navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  }
}

function ProductCamera({ onCapture, onClose, onUnavailable }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameras, setCameras] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [error, setError] = useState('');
  const [hasTorch, setHasTorch] = useState(false);
  const [flash, setFlash] = useState(() => pref('camera-flash', 'off'));
  const [grid, setGrid] = useState(() => pref('camera-linhas', 'on') === 'on');
  const [frame, setFrame] = useState(null); // onde o vídeo aparece na tela (para as linhas ficarem em cima dele)
  const [shooting, setShooting] = useState(false);

  const setTorch = (on) => {
    const track = streamRef.current?.getVideoTracks()[0];
    return track ? track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}) : Promise.resolve();
  };

  // Linhas: calcula o retângulo do vídeo dentro da área (o vídeo fica com faixas pretas para caber inteiro)
  const measure = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(v.clientWidth / v.videoWidth, v.clientHeight / v.videoHeight);
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    setFrame({ left: v.offsetLeft + (v.clientWidth - w) / 2, top: v.offsetTop + (v.clientHeight - h) / 2, width: w, height: h });
  };
  useEffect(() => {
    const v = videoRef.current;
    const observer = window.ResizeObserver && v ? new ResizeObserver(measure) : null;
    if (observer) observer.observe(v);
    window.addEventListener('resize', measure);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onUnavailable();
      return undefined;
    }
    (async () => {
      try {
        stop();
        let stream = await openStream(deviceId);
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());

        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        if (!cancelled) setCameras(devices);

        // Se ainda assim veio a frontal, troca para uma câmera traseira pelo nome
        const settings = stream.getVideoTracks()[0]?.getSettings() || {};
        if (!deviceId && settings.facingMode === 'user') {
          const back = devices.find((d) => isBackLabel(d.label));
          if (back) {
            stream.getTracks().forEach((t) => t.stop());
            stream = await openStream(back.deviceId);
          }
        }
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setError('');

        // Foco automático contínuo e lanterna (nem todo celular deixa; no iPhone o navegador não libera a lanterna)
        const track = stream.getVideoTracks()[0];
        const caps = track && track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        setHasTorch(!!caps.torch);
        if (caps.torch && pref('camera-flash', 'off') === 'on') setTorch(true);
      } catch (err) {
        if (cancelled) return;
        if (err && err.name === 'NotAllowedError') {
          setError('O celular bloqueou a câmera. Libere a permissão de câmera para o site e tente de novo.');
        } else {
          onUnavailable();
        }
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const currentId = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
    const idx = cameras.findIndex((c) => c.deviceId === currentId);
    setDeviceId(cameras[(idx + 1) % cameras.length].deviceId);
  };

  const changeFlash = () => {
    const next = FLASH_MODES[(FLASH_MODES.indexOf(flash) + 1) % FLASH_MODES.length];
    setFlash(next);
    savePref('camera-flash', next);
    setTorch(next === 'on');
  };

  const toggleGrid = () => {
    setGrid(!grid);
    savePref('camera-linhas', grid ? 'off' : 'on');
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || shooting) return;
    // ⚡ Flash "na foto": acende, espera clarear, tira e apaga
    if (hasTorch && flash === 'shot') {
      setShooting(true);
      await setTorch(true);
      await wait(FLASH_WARMUP_MS);
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    if (hasTorch && flash === 'shot') setTorch(false);
    setShooting(false);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stop();
      onCapture(new File([blob], 'produto.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  const close = () => {
    stop();
    onClose();
  };

  return (
    <div className="pc-overlay">
      {error ? (
        <div className="pc-error">{error}</div>
      ) : (
        <div className="pc-view">
          <video ref={videoRef} className="pc-video" autoPlay playsInline muted onLoadedMetadata={measure} onResize={measure} />
          {grid && frame && (
            <div className="pc-grid" style={frame} aria-hidden="true">
              <span className="pc-line v" style={{ left: '33.33%' }} />
              <span className="pc-line v" style={{ left: '66.66%' }} />
              <span className="pc-line h" style={{ top: '33.33%' }} />
              <span className="pc-line h" style={{ top: '66.66%' }} />
              <span className="pc-square" style={{ width: Math.min(frame.width, frame.height) * 0.8, height: Math.min(frame.width, frame.height) * 0.8 }} />
              <span className="pc-hint">Centralize o produto no quadrado</span>
            </div>
          )}
          {shooting && <div className="pc-flashing">⚡</div>}
        </div>
      )}
      {!error && (
        <div className="pc-tools">
          {hasTorch && (
            <button type="button" className={`pc-tool ${flash !== 'off' ? 'on' : ''}`} onClick={changeFlash}>
              {FLASH_LABEL[flash]}
            </button>
          )}
          <button type="button" className={`pc-tool ${grid ? 'on' : ''}`} onClick={toggleGrid}>
            # Linhas
          </button>
        </div>
      )}
      <div className="pc-bar">
        <button type="button" className="pc-btn" onClick={close}>✕ Cancelar</button>
        {!error && <button type="button" className="pc-shutter" onClick={capture} disabled={shooting} aria-label="Tirar foto" />}
        {!error && cameras.length > 1 ? (
          <button type="button" className="pc-btn" onClick={switchCamera}>🔄 Trocar</button>
        ) : (
          <span className="pc-spacer" />
        )}
      </div>
    </div>
  );
}

export default ProductCamera;
