import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import './ProductCamera.css';

// 📷 Lê o código de barras com a câmera traseira (ou deixa digitar os números)
const FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];

function BarcodeScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let controls = null;
    let done = false;
    const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]]));
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current,
        (result, err, ctrl) => {
          if (!result || done) return;
          done = true;
          ctrl.stop();
          if (navigator.vibrate) navigator.vibrate(120);
          onResult(result.getText());
        }
      )
      .then(c => {
        controls = c;
        if (done) c.stop();
      })
      .catch(err => {
        setError(err && err.name === 'NotAllowedError'
          ? 'O celular bloqueou a câmera. Libere a permissão ou digite o código abaixo.'
          : 'Não consegui abrir a câmera. Digite o código abaixo.');
      });
    return () => {
      done = true;
      if (controls) controls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitTyped = (e) => {
    e.preventDefault();
    const digits = typed.replace(/\D/g, '');
    if (digits.length >= 6) onResult(digits);
  };

  return (
    <div className="pc-overlay">
      {error ? (
        <div className="pc-error">{error}</div>
      ) : (
        <div className="bs-view">
          <video ref={videoRef} className="pc-video" autoPlay playsInline muted />
          <div className="bs-guide" />
          <p className="bs-hint">Aponte para o código de barras do produto</p>
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
      </div>
    </div>
  );
}

export default BarcodeScanner;
