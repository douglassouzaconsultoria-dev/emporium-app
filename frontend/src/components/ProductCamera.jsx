import React, { useEffect, useRef, useState } from 'react';
import './ProductCamera.css';

// 📷 Câmera dentro do app: abre sempre a câmera traseira (principal) do celular.
// O atributo capture="environment" do <input> é só uma sugestão e alguns celulares abrem a frontal.
const MAX_SIDE = 1600;

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

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
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
        <video ref={videoRef} className="pc-video" autoPlay playsInline muted />
      )}
      <div className="pc-bar">
        <button type="button" className="pc-btn" onClick={close}>✕ Cancelar</button>
        {!error && <button type="button" className="pc-shutter" onClick={capture} aria-label="Tirar foto" />}
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
