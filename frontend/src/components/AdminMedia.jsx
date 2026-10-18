import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { API_URL } from '../config';
import './AdminMedia.css';

// 📲 Para onde o QR code leva: o site abre e já oferece "Instalar o app"
const APP_URL = 'https://emporiobrumado.com';
const RED = '#C41E3A';
const DARK_RED = '#8f1229';
const YELLOW = '#ffd23f';
const FONT = "'Arial Black', 'Arial', 'Helvetica', sans-serif";
const DPI = 300;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

const formatSize = (bytes) => {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(bytes / 1024)} KB`;
};

// Cloudinary: miniatura e link que força o download
const thumbUrl = (f) => (f.format === 'svg' ? f.url : f.url.replace('/upload/', '/upload/c_limit,w_400/'));
const downloadUrl = (f) => f.url.replace('/upload/', '/upload/fl_attachment/');

// ---------- Arquivos gerados (SVG → PNG em alta resolução) ----------
const svgToString = (svgEl) => {
  const clone = svgEl.cloneNode(true);
  clone.querySelectorAll('.cut-guide').forEach(el => el.remove()); // guia de corte só aparece na tela
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
};

const svgToPngBlob = (svgEl, widthPx, heightPx) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(new Blob([svgToString(svgEl)], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    canvas.getContext('2d').drawImage(img, 0, 0, widthPx, heightPx);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem'))), 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Não foi possível gerar a imagem'));
  };
  img.src = url;
});

const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// 🏪 Dados do mercado usados no adesivo e no cartão
const STORE = {
  phones: ['(34) 3831-8572', '(34) 98861-1448'],
  street: 'Alameda das Imbuias, 776',
  district: 'Morada Nova · Patrocínio - MG'
};

// 🛵 Adesivo do baú: medidas em milímetros (1 unidade do SVG = 1 mm)
// Texto à esquerda (nome, delivery, telefones, endereço) e QR "Baixe o app" num cartão branco
function BoxSticker({ svgRef, widthCm, heightCm, radiusCm }) {
  const W = widthCm * 10;
  const H = heightCm * 10;
  const R = Math.min(radiusCm * 10, W / 2, H / 2);
  const landscape = W >= H * 1.15;
  const pad = Math.max(R * 0.55, Math.min(W, H) * 0.07);

  // Áreas: texto e QR lado a lado (deitado) ou um embaixo do outro (em pé)
  const text = landscape
    ? { x: pad, y: pad, w: W * 0.58 - pad * 1.3, h: H - pad * 2 }
    : { x: pad, y: pad, w: W - pad * 2, h: H * 0.5 - pad };
  const qrArea = landscape
    ? { x: W * 0.58, y: pad, w: W * 0.42 - pad, h: H - pad * 2 }
    : { x: pad, y: H * 0.52, w: W - pad * 2, h: H * 0.48 - pad };

  const ARIAL = 'Arial, Helvetica, sans-serif';
  const lines = [
    { t: 'EMPÓRIO BRUMADO', rel: 1, k: 0.74, font: FONT, color: '#ffffff', stretch: true },
    { t: 'DELIVERY DE SUPERMERCADO', rel: 0.5, k: 0.66, font: FONT, color: YELLOW, stretch: true, gap: 0.9 },
    { t: 'TELEFONE', rel: 0.3, k: 0.62, font: ARIAL, bold: true, color: YELLOW },
    { t: STORE.phones[0], rel: 0.72, k: 0.6, font: FONT, color: '#ffffff' },
    { t: STORE.phones[1], rel: 0.72, k: 0.6, font: FONT, color: '#ffffff', gap: 0.6 },
    { t: STORE.street, rel: 0.42, k: 0.55, font: ARIAL, bold: true, color: '#ffffff' },
    { t: STORE.district, rel: 0.42, k: 0.52, font: ARIAL, color: '#ffffff' }
  ];
  const LEAD = 1.25;
  const unit = text.h / lines.reduce((sum, l) => sum + l.rel * LEAD + (l.gap || 0), 0);
  const sized = lines.map(l => {
    const byWidth = text.w / (l.t.length * l.k);
    return { ...l, size: Math.min(l.rel * unit, byWidth), fits: byWidth <= l.rel * unit };
  });
  const totalH = sized.reduce((sum, l) => sum + l.size * LEAD + (l.gap ? l.gap * unit * (l.size / (l.rel * unit)) : 0), 0);
  let cursor = text.y + (text.h - totalH) / 2;
  const anchor = landscape ? 'start' : 'middle';
  const tx = landscape ? text.x : text.x + text.w / 2;

  // Cartão branco com o QR
  const qrSize = Math.min(qrArea.w * 0.72, qrArea.h * (landscape ? 0.62 : 0.6));
  const title = Math.min(qrSize * 0.17, qrArea.w * 0.85 / (11 * 0.72));
  const caption = title * 0.48;
  const cardW = Math.max(qrSize, title * 11 * 0.72) + qrSize * 0.2;
  const cardH = title * 1.6 + qrSize + caption * 2.6 + qrSize * 0.1;
  const cardX = qrArea.x + (qrArea.w - cardW) / 2;
  const cardY = qrArea.y + (qrArea.h - cardH) / 2;
  const cx = cardX + cardW / 2;

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={`${widthCm}cm`}
      height={`${heightCm}cm`}
      viewBox={`0 0 ${W} ${H}`}
      className="amd-preview-svg"
    >
      <defs>
        <clipPath id="bau-shape"><rect width={W} height={H} rx={R} ry={R} /></clipPath>
        <linearGradient id="bau-red" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={RED} />
          <stop offset="1" stopColor={DARK_RED} />
        </linearGradient>
      </defs>
      <g clipPath="url(#bau-shape)">
        <rect width={W} height={H} fill="url(#bau-red)" />

        {sized.map((l, i) => {
          const y = cursor + l.size;
          cursor += l.size * LEAD + (l.gap ? l.gap * unit * (l.size / (l.rel * unit)) : 0);
          return (
            <text key={i} x={tx} y={y} textAnchor={anchor} fill={l.color} fontFamily={l.font}
              fontWeight={l.font === FONT || l.bold ? '900' : '400'} fontSize={l.size}
              {...(l.stretch && l.fits ? { textLength: text.w, lengthAdjust: 'spacingAndGlyphs' } : {})}>
              {l.t}
            </text>
          );
        })}

        <rect x={cardX} y={cardY} width={cardW} height={cardH} rx={qrSize * 0.08} fill="#ffffff" />
        <text x={cx} y={cardY + title * 1.25} textAnchor="middle" fill={RED} fontFamily={FONT} fontWeight="900" fontSize={title}>
          BAIXE O APP
        </text>
        <QRCodeSVG
          value={APP_URL}
          size={qrSize}
          x={cx - qrSize / 2}
          y={cardY + title * 1.6}
          level="M"
          marginSize={0}
          fgColor="#1a1a1a"
          bgColor="#ffffff"
        />
        <text x={cx} y={cardY + title * 1.6 + qrSize + caption * 1.7} textAnchor="middle" fill="#333"
          fontFamily={ARIAL} fontWeight="700" fontSize={caption}>
          Aponte a câmera do celular
        </text>
      </g>
    </svg>
  );
}

// 💳 Cartão de visita: 9 × 5 cm + 3 mm de sangria em cada lado (a gráfica corta na linha tracejada)
const CARD = { w: 90, h: 50, bleed: 3 };

function BusinessCard({ svgRef, side, logo }) {
  const B = CARD.bleed;
  const W = CARD.w + B * 2;
  const H = CARD.h + B * 2;
  const cut = (
    <rect className="cut-guide" x={B} y={B} width={CARD.w} height={CARD.h}
      fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="0.25" strokeDasharray="1.2 1" />
  );
  const svgProps = {
    ref: svgRef,
    xmlns: 'http://www.w3.org/2000/svg',
    width: `${W}mm`,
    height: `${H}mm`,
    viewBox: `0 0 ${W} ${H}`,
    className: 'amd-preview-svg amd-card-svg'
  };

  if (side === 'front') {
    const col = 43; // início da coluna de texto
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id="card-red" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={RED} />
            <stop offset="1" stopColor={DARK_RED} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#card-red)" />
        <circle cx={B + 19} cy={H / 2} r={14} fill="#ffffff" />
        {logo && <image href={logo} x={B + 19 - 12.5} y={H / 2 - 12.5} width={25} height={25} />}

        <text x={col} y={B + 13} fill="#ffffff" fontFamily={FONT} fontWeight="900" fontSize="5"
          textLength={CARD.w + B - col - 4} lengthAdjust="spacingAndGlyphs">EMPÓRIO BRUMADO</text>
        <text x={col} y={B + 18.2} fill={YELLOW} fontFamily={FONT} fontWeight="900" fontSize="2.7"
          textLength={CARD.w + B - col - 4} lengthAdjust="spacingAndGlyphs">DELIVERY DE SUPERMERCADO</text>
        <line x1={col} x2={CARD.w + B - 4} y1={B + 21.5} y2={B + 21.5} stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.3" />

        <text x={col} y={B + 25.2} fill={YELLOW} fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="2">TELEFONE</text>
        <text x={col} y={B + 29.6} fill="#ffffff" fontFamily={FONT} fontWeight="900" fontSize="3.9">{STORE.phones[0]}</text>
        <text x={col} y={B + 34.2} fill="#ffffff" fontFamily={FONT} fontWeight="900" fontSize="3.9">{STORE.phones[1]}</text>
        <text x={col} y={B + 39.4} fill="#ffffff" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="2.6">{STORE.street}</text>
        <text x={col} y={B + 42.9} fill="#ffffff" fontFamily="Arial, Helvetica, sans-serif" fontSize="2.6">{STORE.district}</text>
        {cut}
      </svg>
    );
  }

  const qr = 29;
  const qx = B + 5;
  const qy = B + 4;
  const col = B + 40;
  return (
    <svg {...svgProps}>
      <rect width={W} height={H} fill="#ffffff" />
      <rect x="0" y={H - B - 6} width={W} height={B + 6} fill={RED} />
      <text x={W / 2} y={H - B - 1.9} textAnchor="middle" fill="#ffffff" fontFamily={FONT} fontWeight="900" fontSize="2.8">
        emporiobrumado.com
      </text>

      <rect x={qx - 1} y={qy - 1} width={qr + 2} height={qr + 2} rx="1.2" fill="#ffffff" stroke={RED} strokeWidth="0.4" />
      <QRCodeSVG value={APP_URL} size={qr} x={qx} y={qy} level="M" marginSize={0} fgColor="#1a1a1a" bgColor="#ffffff" />
      <text x={qx + qr / 2} y={qy + qr + 4.6} textAnchor="middle" fill={RED} fontFamily={FONT} fontWeight="900" fontSize="3"
        textLength={qr} lengthAdjust="spacingAndGlyphs">BAIXE O APP</text>
      <text x={qx + qr / 2} y={qy + qr + 7.4} textAnchor="middle" fill="#555" fontFamily="Arial, Helvetica, sans-serif" fontSize="1.9">
        aponte a câmera do celular
      </text>

      <text x={col} y={B + 19} fill={RED} fontFamily={FONT} fontWeight="900" fontSize="5.2">Peça pelo app</text>
      <text x={col} y={B + 26} fill={RED} fontFamily={FONT} fontWeight="900" fontSize="5.2">e receba</text>
      <text x={col} y={B + 33} fill={RED} fontFamily={FONT} fontWeight="900" fontSize="5.2">em casa!</text>
      {cut}
    </svg>
  );
}

function AdminMedia() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [deleteId, setDeleteId] = useState(null);
  const [logo, setLogo] = useState(null);

  // Medidas do baú (cm): o padrão é a tampa traseira de um baú de 80 litros; ajuste com a fita métrica
  const [size, setSize] = useState({ width: 42, height: 32, radius: 5 });
  const stickerRef = useRef(null);
  const cardFrontRef = useRef(null);
  const cardBackRef = useRef(null);
  const qrRef = useRef(null);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${API_URL}/media`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Erro ao buscar imagens');
      setFiles(await res.json());
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    // Logo embutida no desenho (assim o arquivo baixado já leva a logo junto)
    fetch('/logo-eb.svg')
      .then(res => res.text())
      .then(text => setLogo(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`))
      .catch(() => setLogo(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFiles = async (list, okText) => {
    if (!list.length) return;
    const form = new FormData();
    list.forEach(f => form.append('files', f));
    try {
      setUploading(true);
      const res = await fetch(`${API_URL}/media`, { method: 'POST', headers: authHeaders(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao guardar');
      setFiles(prev => [...data, ...prev]);
      showMessage('success', okText || `✅ ${data.length === 1 ? 'Arquivo guardado' : `${data.length} arquivos guardados`} na pasta`);
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (f) => {
    if (deleteId !== f.id) {
      setDeleteId(f.id);
      setTimeout(() => setDeleteId(id => (id === f.id ? null : id)), 5000);
      return;
    }
    try {
      setDeleteId(null);
      const res = await fetch(`${API_URL}/media/${f.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao apagar');
      setFiles(prev => prev.filter(x => x.id !== f.id));
      showMessage('success', '🗑️ Arquivo apagado');
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    }
  };

  const copyLink = async (f) => {
    try {
      await navigator.clipboard.writeText(f.url);
      showMessage('success', '🔗 Link copiado');
    } catch {
      window.prompt('Copie o link:', f.url);
    }
  };

  // ---------- Downloads do material ----------
  const cmToPx = (cm) => Math.round((cm / 2.54) * DPI);
  const stickerName = `adesivo-bau-${size.width}x${size.height}cm`;

  const downloadSticker = async (type) => {
    try {
      if (type === 'svg') {
        saveBlob(new Blob([svgToString(stickerRef.current)], { type: 'image/svg+xml' }), `${stickerName}.svg`);
        return;
      }
      const blob = await svgToPngBlob(stickerRef.current, cmToPx(size.width), cmToPx(size.height));
      if (type === 'png') saveBlob(blob, `${stickerName}.png`);
      else await uploadFiles([new File([blob], `${stickerName}.png`, { type: 'image/png' })], '✅ Adesivo guardado na pasta');
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    }
  };

  const downloadQr = async (type) => {
    try {
      const svg = qrRef.current.querySelector('svg');
      if (type === 'svg') {
        saveBlob(new Blob([svgToString(svg)], { type: 'image/svg+xml' }), 'qrcode-app-emporio.svg');
        return;
      }
      const blob = await svgToPngBlob(svg, 2000, 2000);
      if (type === 'png') saveBlob(blob, 'qrcode-app-emporio.png');
      else await uploadFiles([new File([blob], 'qrcode-app-emporio.png', { type: 'image/png' })], '✅ QR code guardado na pasta');
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    }
  };

  const downloadCard = async (type) => {
    try {
      const sides = [['frente', cardFrontRef.current], ['verso', cardBackRef.current]];
      const wPx = Math.round(((CARD.w + CARD.bleed * 2) / 25.4) * DPI);
      const hPx = Math.round(((CARD.h + CARD.bleed * 2) / 25.4) * DPI);
      if (type === 'svg') {
        sides.forEach(([name, el]) => saveBlob(new Blob([svgToString(el)], { type: 'image/svg+xml' }), `cartao-${name}.svg`));
        return;
      }
      const pngs = [];
      for (const [name, el] of sides) pngs.push([name, await svgToPngBlob(el, wPx, hPx)]);
      if (type === 'png') pngs.forEach(([name, blob]) => saveBlob(blob, `cartao-${name}.png`));
      else await uploadFiles(pngs.map(([name, blob]) => new File([blob], `cartao-${name}.png`, { type: 'image/png' })), '✅ Cartão (frente e verso) guardado na pasta');
    } catch (err) {
      showMessage('error', `❌ ${err.message}`);
    }
  };

  const setMeasure = (field, value) => {
    const n = parseFloat(String(value).replace(',', '.'));
    setSize(s => ({ ...s, [field]: Number.isFinite(n) ? n : s[field] }));
  };
  const validSize = size.width >= 10 && size.width <= 200 && size.height >= 10 && size.height <= 200 && size.radius >= 0;

  return (
    <div className="amd-container">
      <h2>🖼️ Imagens e divulgação</h2>
      {message && <div className={`amd-message ${message.type}`}>{message.text}</div>}

      {/* 📁 PASTA */}
      <section className="amd-card">
        <div className="amd-card-head">
          <div>
            <h3>📁 Pasta de imagens do Empório</h3>
            <p className="amd-help">Guarde artes de propaganda, outdoor, adesivos e fotos. Ficam na nuvem: baixe de qualquer celular ou computador entrando no Admin.</p>
          </div>
          <label className={`amd-btn-upload ${uploading ? 'busy' : ''}`}>
            {uploading ? '⏳ Enviando...' : '⬆️ Guardar imagens'}
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              disabled={uploading}
              onChange={(e) => { uploadFiles([...e.target.files]); e.target.value = ''; }}
            />
          </label>
        </div>
        <p className="amd-help small">JPG, PNG, SVG ou PDF · até 10 MB por arquivo · até 10 de uma vez.</p>

        {loading ? (
          <p className="amd-empty">Carregando...</p>
        ) : files.length === 0 ? (
          <p className="amd-empty">📭 Nenhuma imagem guardada ainda.</p>
        ) : (
          <div className="amd-grid">
            {files.map(f => (
              <div key={f.id} className="amd-file">
                <a className="amd-thumb" href={f.url} target="_blank" rel="noopener noreferrer" title="Abrir em tamanho real">
                  {f.format === 'pdf' ? <span className="amd-pdf">📄 PDF</span> : <img src={thumbUrl(f)} alt={f.name} loading="lazy" />}
                </a>
                <strong title={f.name}>{f.name}</strong>
                <small>
                  {[f.width && f.height ? `${f.width}×${f.height}` : '', formatSize(f.bytes), new Date(f.created_at).toLocaleDateString('pt-BR')].filter(Boolean).join(' · ')}
                </small>
                <div className="amd-file-actions">
                  <a className="amd-btn dl" href={downloadUrl(f)}>⬇️ Baixar</a>
                  <button className="amd-btn" onClick={() => copyLink(f)} title="Copiar link">🔗</button>
                  <button className={`amd-btn del ${deleteId === f.id ? 'confirm' : ''}`} onClick={() => removeFile(f)} title="Apagar">
                    {deleteId === f.id ? 'Apagar?' : '🗑️'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 📲 QR CODE */}
      <section className="amd-card">
        <h3>📲 QR code para baixar o app</h3>
        <p className="amd-help">
          Quem apontar a câmera do celular abre <strong>{APP_URL.replace('https://', '')}</strong> e o app oferece o botão de instalar.
          Use em panfleto, balcão, sacola, adesivo...
        </p>
        <div className="amd-qr-row">
          <div className="amd-qr" ref={qrRef}>
            <QRCodeSVG value={APP_URL} size={220} level="M" marginSize={4} fgColor="#1a1a1a" bgColor="#ffffff" />
          </div>
          <div className="amd-actions">
            <button className="amd-btn-main" onClick={() => downloadQr('png')}>⬇️ Baixar PNG (alta resolução)</button>
            <button className="amd-btn-light" onClick={() => downloadQr('svg')}>⬇️ Baixar SVG (para gráfica)</button>
            <button className="amd-btn-light" onClick={() => downloadQr('save')} disabled={uploading}>📁 Guardar na pasta</button>
          </div>
        </div>
      </section>

      {/* 🛵 ADESIVO DO BAÚ */}
      <section className="amd-card">
        <h3>🛵 Adesivo para o baú da moto</h3>
        <p className="amd-help">
          Meça com uma fita métrica a parte do baú onde vai o adesivo (largura × altura) e o arredondado das bordas.
          O desenho já sai com os cantos arredondados e no tamanho certo para a gráfica imprimir.
        </p>

        <div className="amd-measures">
          <label>Largura (cm)
            <input type="number" min="10" max="200" step="0.5" value={size.width} onChange={(e) => setMeasure('width', e.target.value)} />
          </label>
          <label>Altura (cm)
            <input type="number" min="10" max="200" step="0.5" value={size.height} onChange={(e) => setMeasure('height', e.target.value)} />
          </label>
          <label>Canto arredondado (cm)
            <input type="number" min="0" max="50" step="0.5" value={size.radius} onChange={(e) => setMeasure('radius', e.target.value)} />
          </label>
        </div>

        {validSize ? (
          <>
            <div className="amd-preview">
              <BoxSticker svgRef={stickerRef} widthCm={size.width} heightCm={size.height} radiusCm={size.radius} />
            </div>
            <div className="amd-actions row">
              <button className="amd-btn-main" onClick={() => downloadSticker('png')}>⬇️ Baixar PNG ({DPI} DPI)</button>
              <button className="amd-btn-light" onClick={() => downloadSticker('svg')}>⬇️ Baixar SVG (para gráfica)</button>
              <button className="amd-btn-light" onClick={() => downloadSticker('save')} disabled={uploading}>📁 Guardar na pasta</button>
            </div>
            <p className="amd-help small">
              💡 Na gráfica, peça <strong>adesivo vinil com recorte no formato</strong> (cantos arredondados) e laminação, que aguenta sol e chuva.
              O SVG mantém a qualidade em qualquer tamanho. Antes de imprimir, teste o QR code com o celular.
            </p>
          </>
        ) : (
          <p className="amd-empty">Use medidas entre 10 e 200 cm.</p>
        )}
      </section>

      {/* 💳 CARTÃO DE VISITA */}
      <section className="amd-card">
        <h3>💳 Cartãozinho para os clientes</h3>
        <p className="amd-help">
          Para entregar a quem pede o telefone do mercado: frente com telefone e endereço, verso com o QR code do app.
          Tamanho padrão de cartão de visita (9 × 5 cm).
        </p>
        <div className="amd-cards">
          <div className="amd-preview"><small>Frente</small>
            <BusinessCard svgRef={cardFrontRef} side="front" logo={logo} />
          </div>
          <div className="amd-preview"><small>Verso</small>
            <BusinessCard svgRef={cardBackRef} side="back" logo={logo} />
          </div>
        </div>
        <div className="amd-actions row">
          <button className="amd-btn-main" onClick={() => downloadCard('png')}>⬇️ Baixar PNG (frente e verso)</button>
          <button className="amd-btn-light" onClick={() => downloadCard('svg')}>⬇️ Baixar SVG (para gráfica)</button>
          <button className="amd-btn-light" onClick={() => downloadCard('save')} disabled={uploading}>📁 Guardar na pasta</button>
        </div>
        <p className="amd-help small">
          💡 O arquivo já vem com 3 mm de sangria (a cor passa da borda): a linha tracejada mostra onde a gráfica corta e não sai na impressão.
          Peça <strong>cartão 9 × 5 cm, frente e verso colorido (4×4)</strong>, papel couchê 300 g.
        </p>
      </section>
    </div>
  );
}

export default AdminMedia;
