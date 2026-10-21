import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { notify } from '../utils/dialog';
import { brl } from '../utils/format';
import { prepareImage } from '../utils/prepareImage';
import ProductCamera from './ProductCamera';
import BarcodeScanner from './BarcodeScanner';
import './AdminQuickProduct.css';

// ➕ Cadastro rápido de produto (pensado para o celular): código de barras, foto, nome, preço,
// unidade ou quilo, categoria e estoque. Depois de salvar, já fica pronto para o próximo.
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const toNumber = (v) => parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));

function AdminQuickProduct() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('un');
  const [categoryId, setCategoryId] = useState(null);
  const [stock, setStock] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState([]); // cadastrados agora, para conferir
  const cameraInputRef = useRef(null);

  useEffect(() => {
    axios.get(`${API_URL}/categories`).then(res => setCategories(res.data)).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!imageFile) return setPreviewUrl(null);
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // 📷 Código de barras: preenche nome e foto pela base aberta (Open Food Facts)
  const lookup = async (code) => {
    setScanning(false);
    try {
      setLookingUp(true);
      const { data } = await axios.get(`${API_URL}/products/barcode/${encodeURIComponent(code)}`, auth());
      if (data.existing) {
        notify(`ℹ️ Esse código já é do produto "${data.existing.name}". Para mudar, use a aba Produtos.`);
        return;
      }
      setBarcode(data.barcode);
      if (data.name) setName(data.name);
      notify(data.found ? `✅ Achei: ${data.name}. Confira e coloque o preço.` : 'ℹ️ Não achei esse código. Preencha o nome e tire a foto.');
      if (data.image_url && !imageFile) {
        const img = await axios.get(`${API_URL}/products/barcode/image`, { ...auth(), params: { url: data.image_url }, responseType: 'blob' });
        setImageFile(await prepareImage(new File([img.data], 'produto.jpg', { type: img.data.type || 'image/jpeg' })));
      }
    } catch (err) {
      notify(`❌ ${err.response?.data?.error || 'Erro ao buscar o código de barras'}`, 'error');
    } finally {
      setLookingUp(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const value = toNumber(price);
    const qty = stock === '' ? 0 : toNumber(stock);
    if (!name.trim()) return setError('Coloque o nome do produto');
    if (!(value > 0)) return setError('Coloque o preço');
    if (!categoryId) return setError('Escolha a categoria');
    if (Number.isNaN(qty) || qty < 0) return setError('Estoque inválido');

    try {
      setSaving(true);
      setError('');
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('price', value);
      fd.append('unit', unit);
      fd.append('category_id', categoryId);
      fd.append('estoque', qty);
      fd.append('barcode', barcode);
      fd.append('active', 'true');
      if (imageFile) fd.append('image', imageFile);
      const { data } = await axios.post(`${API_URL}/products`, fd, auth());
      setDone(list => [data, ...list].slice(0, 10));
      notify(`✅ ${data.name} cadastrado!`);
      // Limpa para o próximo (categoria e unidade continuam: costuma cadastrar vários parecidos)
      setName('');
      setPrice('');
      setStock('');
      setBarcode('');
      setImageFile(null);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  const pickFile = async (file) => setImageFile(await prepareImage(file));
  const catName = (id) => categories.find(c => c.id === id)?.name || '';

  return (
    <div className="aq">
      <h2>➕ Cadastrar produto</h2>
      <p className="aq-help">Rápido, do celular. Para oferta, descrição e subcategoria use a aba 🛍️ Produtos.</p>

      <form onSubmit={save}>
        <button type="button" className="aq-scan" onClick={() => setScanning(true)} disabled={lookingUp || saving}>
          {lookingUp ? '⏳ Buscando...' : '📷 Ler código de barras'}
          <small>{barcode ? `Código ${barcode}` : 'Opcional: preenche nome e foto sozinho'}</small>
        </button>

        <div className="aq-photo">
          <div className="aq-preview">
            {previewUrl ? <img src={previewUrl} alt="" /> : <span>📦</span>}
          </div>
          <div className="aq-photo-btns">
            <button type="button" onClick={() => setShowCamera(true)} disabled={saving}>📷 Tirar foto</button>
            <label>
              🖼️ Galeria
              <input type="file" accept="image/*" onChange={(e) => { pickFile(e.target.files[0]); e.target.value = ''; }} />
            </label>
            {previewUrl && <button type="button" className="aq-photo-remove" onClick={() => setImageFile(null)}>✕ Tirar foto</button>}
            <small>O fundo é tirado sozinho (fica branco, 800x800).</small>
          </div>
          {/* Reserva: se o navegador não deixar abrir a câmera dentro do app */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => { pickFile(e.target.files[0]); e.target.value = ''; }}
          />
        </div>

        <label className="aq-field">
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Arroz Tio João 5kg" />
        </label>

        <div className="aq-row">
          <label className="aq-field">
            Preço (R$)
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </label>
          <div className="aq-field">
            Vende por
            <div className="aq-toggle">
              <button type="button" className={unit === 'un' ? 'active' : ''} onClick={() => setUnit('un')}>Unidade</button>
              <button type="button" className={unit === 'kg' ? 'active' : ''} onClick={() => setUnit('kg')}>Quilo</button>
            </div>
          </div>
        </div>

        <div className="aq-field">
          Categoria
          <div className="aq-cats">
            {categories.map(c => (
              <button key={c.id} type="button" className={categoryId === c.id ? 'active' : ''} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <label className="aq-field">
          Estoque {unit === 'kg' ? '(kg)' : '(unidades)'} <small>opcional</small>
          <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="decimal" placeholder="0" />
        </label>

        {error && <div className="aq-error">❌ {error}</div>}

        <button type="submit" className="aq-save" disabled={saving || lookingUp}>
          {saving ? '⏳ Cadastrando...' : '✅ Cadastrar produto'}
        </button>
      </form>

      {done.length > 0 && (
        <div className="aq-done">
          <strong>Cadastrados agora</strong>
          {done.map(p => (
            <div key={p.id} className="aq-done-item">
              {p.image_url ? <img src={p.image_url} alt="" /> : <span>📦</span>}
              <div>
                <b>{p.name}</b>
                <small>{brl(p.price)}{p.unit === 'kg' ? '/kg' : ''} · {catName(p.category_id)} · estoque {parseFloat(p.estoque)}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCamera && (
        <ProductCamera
          onCapture={(file) => { setImageFile(file); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
          onUnavailable={() => { setShowCamera(false); cameraInputRef.current && cameraInputRef.current.click(); }}
        />
      )}
      {scanning && <BarcodeScanner onResult={lookup} onClose={() => setScanning(false)} />}
    </div>
  );
}

export default AdminQuickProduct;
