import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { notify } from '../utils/dialog';

// 🎞️ Banners da vitrine: escolhidos da pasta de imagens, com botão para mostrar ou esconder
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const thumb = (url) => url.replace('/upload/', '/upload/c_limit,w_600/');

function AdminBanners({ files }) {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/settings/banners?all=1`).then(res => {
      setEnabled(res.data.enabled);
      setItems(res.data.items || []);
    }).catch(() => {});
    axios.get(`${API_URL}/categories`).then(res => setCategories(res.data)).catch(() => {});
    axios.get(`${API_URL}/products?all=1`).then(res => setProducts(res.data)).catch(() => {});
  }, []);

  const change = (next) => {
    setItems(next);
    setDirty(true);
  };

  const save = async (nextEnabled = enabled, nextItems = items) => {
    try {
      setSaving(true);
      const res = await axios.put(`${API_URL}/settings/banners`, { enabled: nextEnabled, items: nextItems }, auth());
      setEnabled(res.data.enabled);
      setItems(res.data.items);
      setDirty(false);
      notify(res.data.enabled ? '✅ Banners salvos e aparecendo na vitrine' : '✅ Banners salvos (escondidos da vitrine)');
    } catch (err) {
      notify(`❌ ${err.response?.data?.error || 'Erro ao salvar banners'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = () => save(!enabled, items);
  const images = files.filter(f => f.format !== 'pdf');
  const move = (i, dir) => {
    const next = [...items];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    change(next);
  };

  return (
    <section className="amd-card">
      <div className="amd-card-head">
        <div>
          <h3>🎞️ Banners da vitrine</h3>
          <p className="amd-help">Imagens de promoção que passam no topo da loja. Ligue só quando tiver promoção; desligado, nada aparece para o cliente.</p>
        </div>
        <button className={`amd-switch ${enabled ? 'on' : ''}`} onClick={toggle} disabled={saving}>
          {enabled ? '🟢 Aparecendo na vitrine' : '⚪ Escondido da vitrine'}
        </button>
      </div>
      <p className="amd-help small">Tamanho ideal da imagem: 1200 × 400 px (deitada, 3 por 1). Use as imagens da pasta acima.</p>

      {items.length === 0 && <p className="amd-empty">Nenhum banner ainda.</p>}
      <div className="amd-banners">
        {items.map((b, i) => (
          <div key={i} className="amd-banner">
            <img src={thumb(b.image_url)} alt="" />
            <div className="amd-banner-fields">
              <label>Ao tocar, abrir:
                <select value={b.link_type} onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, link_type: e.target.value, link_id: null } : x)))}>
                  <option value="none">Nada (só imagem)</option>
                  <option value="category">Uma categoria</option>
                  <option value="product">Um produto</option>
                </select>
              </label>
              {b.link_type === 'category' && (
                <select value={b.link_id || ''} onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, link_id: parseInt(e.target.value) || null } : x)))}>
                  <option value="">Escolha a categoria</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {b.link_type === 'product' && (
                <select value={b.link_id || ''} onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, link_id: parseInt(e.target.value) || null } : x)))}>
                  <option value="">Escolha o produto</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            <div className="amd-banner-actions">
              <button className="amd-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Subir">↑</button>
              <button className="amd-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} title="Descer">↓</button>
              <button className="amd-btn del" onClick={() => change(items.filter((_, j) => j !== i))} title="Tirar">🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {picking ? (
        <div className="amd-pick">
          <p className="amd-help"><strong>Escolha uma imagem da pasta:</strong></p>
          {images.length === 0 ? (
            <p className="amd-empty">A pasta está vazia. Guarde a imagem do banner lá em cima primeiro.</p>
          ) : (
            <div className="amd-grid">
              {images.map(f => (
                <button key={f.id} className="amd-pick-item" onClick={() => { change([...items, { image_url: f.url, link_type: 'none', link_id: null }]); setPicking(false); }}>
                  <img src={thumb(f.url)} alt={f.name} />
                  <small>{f.name}</small>
                </button>
              ))}
            </div>
          )}
          <button className="amd-btn-light" onClick={() => setPicking(false)}>Fechar</button>
        </div>
      ) : (
        items.length < 8 && <button className="amd-btn-light" onClick={() => setPicking(true)}>➕ Adicionar banner</button>
      )}

      {dirty && (
        <div className="amd-actions row">
          <button className="amd-btn-main" onClick={() => save()} disabled={saving}>{saving ? '⏳ Salvando...' : '💾 Salvar banners'}</button>
        </div>
      )}
    </section>
  );
}

export default AdminBanners;
