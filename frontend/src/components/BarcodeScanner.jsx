import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import './ProductCamera.css';

// 📷 Lê o código de barras com a câmera traseira (ou numa foto, ou digitado)
// - Usa o leitor do próprio celular (BarcodeDetector) quando existe: mais rápido e preciso; senão o ZXing
// - Pede foco automático contínuo, resolução alta, zoom e lanterna quando a câmera permite
const ZXING_FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

const makeZxing = () => new BrowserMultiFormatReader(new Map([
  [DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS],
  [DecodeHintType.TRY_HARDER, true]
]));

// Leitor nativo do celular (Android/Chrome), se suportar os formatos de supermercado
const makeNative = async () => {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter(f => supported.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : null;
  } catch {
    return null;
  }
};

function BarcodeScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const doneRef = useRef(false);
  const photoRef = useRef(null);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [zoom, setZoom] = useState(null); // { min, max, step, value }
  const [torch, setTorch] = useState(null); // null = sem lanterna; true/false = ligada/desligada
  const [readingPhoto, setReadingPhoto] = useState(false);

  const finish = (code) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (navigator.vibrate) navigator.vibrate(120);
    onResult(code);
  };

  useEffect(() => {
    let stream = null;
    let controls = null;
    let timer = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' }]
          }
        });
        if (cancelled) return stream.getTracks().forEach(t => t.stop());

        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        // 🔍 Foco automático contínuo (o que mais ajuda a não embaçar)
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        // Zoom: começa em 2x para o celular ficar mais longe (onde o foco funciona)
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          const start = Math.min(Math.max(2, caps.zoom.min), caps.zoom.max);
          track.applyConstraints({ advanced: [{ zoom: start }] }).catch(() => {});
          setZoom({ min: caps.zoom.min, max: Math.min(caps.zoom.max, 8), step: caps.zoom.step || 0.1, value: start });
        }
        if (caps.torch) setTorch(false);

        const video = videoRef.current;
        const native = await makeNative();
        if (native) {
          video.srcObject = stream;
          await video.play().catch(() => {});
          // Procura o código várias vezes por segundo
          const scan = async () => {
            if (cancelled || doneRef.current) return;
            try {
              if (video.readyState >= 2) {
                const found = await native.detect(video);
                if (found.length) return finish(found[0].rawValue);
              }
            } catch { /* tenta de novo */ }
            timer = setTimeout(scan, 150);
          };
          scan();
        } else {
          controls = await makeZxing().decodeFromStream(stream, video, (result) => {
            if (result) finish(result.getText());
          });
        }
      } catch (err) {
        if (cancelled) return;
        setError(err && err.name === 'NotAllowedError'
          ? 'O celular bloqueou a câmera. Libere a permissão, tire uma foto do código ou digite os números.'
          : 'Não consegui abrir a câmera. Tire uma foto do código ou digite os números.');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (controls) controls.stop();
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeZoom = (value) => {
    setZoom(z => ({ ...z, value }));
    trackRef.current?.applyConstraints({ advanced: [{ zoom: value }] }).catch(() => {});
  };

  const toggleTorch = () => {
    const next = !torch;
    setTorch(next);
    trackRef.current?.applyConstraints({ advanced: [{ torch: next }] }).catch(() => setTorch(null));
  };

  // 📸 Foto com a câmera normal do celular (foco dela) e lê o código na foto
  const readPhoto = async (file) => {
    if (!file) return;
    setReadingPhoto(true);
    const url = URL.createObjectURL(file);
    try {
      const native = await makeNative();
      if (native) {
        const bitmap = await createImageBitmap(file);
        const found = await native.detect(bitmap);
        if (found.length) return finish(found[0].rawValue);
      }
      const result = await makeZxing().decodeFromImageUrl(url);
      finish(result.getText());
    } catch {
      setError('Não achei o código na foto. Tente de novo mais de perto, com o código reto e bem iluminado, ou digite os números.');
    } finally {
      URL.revokeObjectURL(url);
      setReadingPhoto(false);
    }
  };

  const submitTyped = (e) => {
    e.preventDefault();
    const digits = typed.replace(/\D/g, '');
    if (digits.length >= 6) finish(digits);
  };

  return (
    <div className="pc-overlay">
      <div className="bs-view">
        <video ref={videoRef} className="pc-video" autoPlay playsInline muted />
        {!error && <div className="bs-guide" />}
        {error
          ? <p className="bs-error">{error}</p>
          : <p className="bs-hint">Afaste uns 20 cm e use o zoom, com o código dentro do quadro</p>}
      </div>

      {(zoom || torch !== null) && !error && (
        <div className="bs-tools">
          {zoom && (
            <label className="bs-zoom">
              🔍
              <input
                type="range"
                min={zoom.min}
                max={zoom.max}
                step={zoom.step}
                value={zoom.value}
                onChange={(e) => changeZoom(parseFloat(e.target.value))}
              />
              <span>{zoom.value.toFixed(1)}x</span>
            </label>
          )}
          {torch !== null && (
            <button type="button" className={`bs-torch ${torch ? 'on' : ''}`} onClick={toggleTorch}>
              {torch ? '🔦 Lanterna ligada' : '🔦 Lanterna'}
            </button>
          )}
        </div>
      )}

      <form className="bs-manual" onSubmit={submitTyped}>
        <input
          inputMode="numeric"
          placeholder="ou digite os números do código"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="submit" disabled={typed.replace(/\D/g, '').length < 6}>Buscar</button>
      </form>
      <div className="pc-bar">
        <button type="button" className="pc-btn" onClick={onClose}>✕ Cancelar</button>
        <button type="button" className="pc-btn bs-photo" onClick={() => photoRef.current?.click()} disabled={readingPhoto}>
          {readingPhoto ? '⏳ Lendo...' : '📸 Tirar foto do código'}
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => { readPhoto(e.target.files[0]); e.target.value = ''; }}
        />
      </div>
    </div>
  );
}

export default BarcodeScanner;
