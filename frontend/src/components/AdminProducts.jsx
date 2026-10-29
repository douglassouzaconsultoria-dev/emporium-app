import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { confirmDialog, notify } from '../utils/dialog';
import { isKg, isPromo } from '../utils/units';
import axios from 'axios';
import './AdminProducts.css';
import { getImageUrl } from '../utils/imageUrl';
import AdminImportProducts from './AdminImportProducts';
import AdminProductsGrid from './AdminProductsGrid';
import ProductCamera from './ProductCamera';
import BarcodeScanner from './BarcodeScanner';
import { brl } from '../utils/format';
import { prepareImage } from '../utils/prepareImage';

const emptyForm = { name: '', price: '', promo_price: '', description: '', unit: '', category_id: '', subcategory: '', estoque: '', active: true, barcode: '', adult: false, card_extra: '' };

// Sugestões de unidade (pode digitar outra)
const UNIT_SUGGESTIONS = ['un', 'kg', 'pacote', 'caixa', 'litro', 'garrafa', 'lata', 'dúzia', 'bandeja', 'fardo'];

function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [stockFilter, setStockFilter] = useState(''); // '' | 'low' | 'out' | 'hidden' | 'promo' | 'nophoto'
  const [modalMode, setModalMode] = useState(null); // null | 'create' | 'edit'
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [readyUrl, setReadyUrl] = useState(null); // ✨ foto já tratada (sem fundo, 800x800) e conferida
  const [preparing, setPreparing] = useState(false);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  // Prévia da imagem nova escolhida
  useEffect(() => {
    setReadyUrl(null); // foto nova ou girada: precisa conferir de novo
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // ✨ Trata a foto agora (tira o fundo, centraliza em 800x800) para conferir antes de salvar
  const preparePhoto = async () => {
    try {
      setPreparing(true);
      setFormError('');
      const fd = new FormData();
      fd.append('image', imageFile);
      const { data } = await axios.post(`${API_URL}/products/image-preview`, fd, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      setReadyUrl(data.url);
    } catch (err) {
      setFormError(`❌ ${err.response?.data?.error || 'Não consegui tratar a foto'}`);
    } finally {
      setPreparing(false);
    }
  };

  // 🔄 Gira a foto escolhida 90° (para produto que saiu deitado)
  const rotateImage = (degrees) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      canvas.toBlob((blob) => {
        if (blob) setImageFile(new File([blob], 'produto.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.92);
    };
    img.src = previewUrl;
  };

  // Tecla ESC fecha a janela
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving]);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API_URL}/products?all=1`);
      setProducts(response.data);
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
    }
  };

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const getCategoryName = (categoryId) => {
    const cat = categories.find(c => c.id === parseInt(categoryId));
    return cat ? cat.name : 'Sem categoria';
  };

  const getStockStatus = (estoque) => {
    if (estoque > 10) return { key: 'ok', icon: '🟢', text: 'OK' };
    if (estoque > 0) return { key: 'low', icon: '🟡', text: 'BAIXO' };
    return { key: 'out', icon: '🔴', text: 'VAZIO' };
  };

  // 🔍 FILTROS
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
      || (searchTerm.trim().length >= 4 && (p.barcode || '').includes(searchTerm.trim()));
    const matchesCategory = filterCategory === '' || p.category_id === parseInt(filterCategory);
    const matchesStock =
      stockFilter === '' ||
      (stockFilter === 'low' && p.estoque > 0 && p.estoque <= 10) ||
      (stockFilter === 'out' && p.estoque === 0) ||
      (stockFilter === 'hidden' && p.active === false) ||
      (stockFilter === 'promo' && isPromo(p)) ||
      (stockFilter === 'nophoto' && !p.image_url);
    return matchesSearch && matchesCategory && matchesStock;
  });

  // 📊 STATS
  const lowStockCount = products.filter(p => p.estoque > 0 && p.estoque <= 10).length;
  const outOfStockCount = products.filter(p => p.estoque === 0).length;
  const hiddenCount = products.filter(p => p.active === false).length;
  const promoCount = products.filter(p => isPromo(p)).length;
  const noPhotoCount = products.filter(p => !p.image_url).length;

  // 🪟 JANELA (MODAL)
  const openCreate = () => {
    setModalMode('create');
    setEditingProduct(null);
    setFormData(emptyForm);
    setImageFile(null);
    setFormError('');
  };

  const openEdit = (product) => {
    setModalMode('edit');
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price,
      promo_price: product.promo_price ?? '',
      description: product.description ?? '',
      unit: product.unit,
      category_id: product.category_id,
      subcategory: product.subcategory || '',
      estoque: product.estoque ?? 0,
      active: product.active !== false,
      barcode: product.barcode || '',
      adult: product.adult === true,
      card_extra: parseFloat(product.card_extra) > 0 ? product.card_extra : ''
    });
    setImageFile(null);
    setFormError('');
  };

  // 📷 Código de barras: já cadastrado → abre para editar; senão busca nome e foto na base aberta
  const [scanFor, setScanFor] = useState(null); // null | 'new' | 'form'
  const [lookingUp, setLookingUp] = useState(false);

  const lookupBarcode = async (code, fromForm) => {
    setScanFor(null);
    const auth = { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } };
    try {
      setLookingUp(true);
      const { data } = await axios.get(`${API_URL}/products/barcode/${encodeURIComponent(code)}`, auth);
      if (data.existing && !(fromForm && editingProduct && data.existing.id === editingProduct.id)) {
        openEdit(data.existing);
        notify(`ℹ️ Esse código já é do produto "${data.existing.name}". Abri ele para você.`);
        return;
      }
      if (!fromForm) openCreate();
      setFormData(f => ({ ...f, barcode: data.barcode, name: fromForm && f.name ? f.name : (data.name || f.name) }));
      if (data.existing) return;
      notify(data.found
        ? `✅ Achei: ${data.name}. Confira preço, unidade e categoria.`
        : 'ℹ️ Não achei esse código na base. Preencha o nome e tire a foto.');
      // Foto do produto: entra como se você tivesse escolhido o arquivo (o fundo é tirado ao salvar)
      const needsPhoto = !fromForm || (!imageFile && !editingProduct?.image_url);
      if (data.image_url && needsPhoto) {
        const img = await axios.get(`${API_URL}/products/barcode/image`, { ...auth, params: { url: data.image_url }, responseType: 'blob' });
        setImageFile(await prepareImage(new File([img.data], 'produto.jpg', { type: img.data.type || 'image/jpeg' })));
      }
    } catch (err) {
      notify(`❌ ${err.response?.data?.error || 'Erro ao buscar o código de barras'}`, 'error');
    } finally {
      setLookingUp(false);
    }
  };

  // 📄 Duplicar: abre "Novo produto" já preenchido (útil para variações: 1kg, 5kg...)
  const openDuplicate = (product) => {
    openEdit(product);
    setModalMode('create');
    setEditingProduct({ ...product, duplicateOf: product.id });
    setFormData(f => ({ ...f, name: `${product.name} (cópia)` }));
  };

  // 👁️ Mostrar/ocultar na loja com um toque
  const toggleActive = async (product) => {
    try {
      await axios.put(`${API_URL}/products/${product.id}/active`, { active: product.active === false }, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      fetchProducts();
      showMessage(product.active === false ? '✅ Produto visível na loja' : '✅ Produto oculto da loja');
    } catch (error) {
      console.error(error);
      showMessage('❌ Erro ao atualizar produto');
    }
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingProduct(null);
    setImageFile(null);
    setFormError('');
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price || !formData.unit || !formData.category_id) {
      setFormError('❌ Preencha nome, preço, unidade e categoria');
      return;
    }
    if (formData.promo_price !== '' && parseFloat(formData.promo_price) >= parseFloat(formData.price)) {
      setFormError('❌ O preço de oferta precisa ser menor que o preço normal');
      return;
    }

    try {
      setSaving(true);
      setFormError('');
      const token = localStorage.getItem('authToken');

      const fd = new FormData();
      fd.append('name', formData.name);
      fd.append('price', parseFloat(formData.price));
      fd.append('unit', formData.unit);
      fd.append('category_id', parseInt(formData.category_id));
      fd.append('promo_price', formData.promo_price === '' ? '' : parseFloat(formData.promo_price));
      fd.append('description', formData.description || '');
      fd.append('subcategory', formData.subcategory || '');
      fd.append('active', formData.active ? 'true' : 'false');
      fd.append('barcode', formData.barcode || '');
      fd.append('adult', formData.adult ? 'true' : 'false');
      fd.append('card_extra', formData.card_extra === '' ? '' : parseFloat(formData.card_extra));
      if (readyUrl) fd.append('image_url', readyUrl); // já tratada e conferida: não trata de novo
      else if (imageFile) fd.append('image', imageFile);
      else if (modalMode === 'create' && editingProduct?.image_url) fd.append('image_url', editingProduct.image_url);

      const multipartHeaders = {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}`
      };

      if (modalMode === 'create') {
        fd.append('estoque', parseFloat(formData.estoque) || 0);
        await axios.post(`${API_URL}/products`, fd, { headers: multipartHeaders });
        showMessage('✅ Produto criado com sucesso!');
      } else {
        await axios.put(`${API_URL}/products/${editingProduct.id}`, fd, { headers: multipartHeaders });

        if (formData.estoque !== '' && formData.estoque !== undefined) {
          await axios.put(`${API_URL}/products/${editingProduct.id}/estoque`, {
            estoque: parseFloat(formData.estoque)
          }, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }
        showMessage('✅ Produto atualizado com sucesso!');
      }

      closeModal();
      fetchProducts();
    } catch (error) {
      console.error(error);
      setFormError(`❌ ${error.response?.data?.error || 'Erro ao salvar produto. Tente novamente.'}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!(await confirmDialog(`Apagar "${product.name}"? Não dá para desfazer.`, { okText: '🗑️ Apagar', danger: true }))) return;
    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(`${API_URL}/products/${product.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchProducts();
      showMessage('✅ Produto deletado com sucesso!');
    } catch (error) {
      console.error(error);
      showMessage(`❌ ${error.response?.data?.error || 'Erro ao deletar produto'}`);
    }
  };

  const modalImage = readyUrl || previewUrl || (editingProduct && getImageUrl(editingProduct.image_url));

  return (
    <div className="ap-container">
      {/* HEADER */}
      <div className="ap-header">
        <h2>🛍️ Gerenciar Produtos</h2>
        <div className="ap-header-actions">
          <button className="ap-btn-import" onClick={() => setShowGrid(true)}>📝 Editar em planilha</button>
          <button className="ap-btn-import" onClick={() => setShowImport(true)}>📥 Importar arquivo</button>
          <button className="ap-btn-import ap-btn-barcode" onClick={() => setScanFor('new')} disabled={lookingUp}>
            {lookingUp ? '⏳ Buscando...' : '📷 Cadastrar pelo código de barras'}
          </button>
          <button className="ap-btn-new" onClick={openCreate}>➕ Novo Produto</button>
        </div>
      </div>

      {/* STATS (clicáveis = filtro) */}
      <div className="ap-stats">
        <button
          className={`ap-stat ${stockFilter === '' ? 'active' : ''}`}
          onClick={() => setStockFilter('')}
        >
          <span className="ap-stat-label">Todos</span>
          <span className="ap-stat-value">{products.length}</span>
        </button>
        <button
          className={`ap-stat ap-stat-low ${stockFilter === 'low' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'low' ? '' : 'low')}
        >
          <span className="ap-stat-label">🟡 Baixo Estoque</span>
          <span className="ap-stat-value">{lowStockCount}</span>
        </button>
        <button
          className={`ap-stat ap-stat-out ${stockFilter === 'out' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'out' ? '' : 'out')}
        >
          <span className="ap-stat-label">🔴 Sem Estoque</span>
          <span className="ap-stat-value">{outOfStockCount}</span>
        </button>
        <button
          className={`ap-stat ${stockFilter === 'promo' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'promo' ? '' : 'promo')}
        >
          <span className="ap-stat-label">🔥 Em Oferta</span>
          <span className="ap-stat-value">{promoCount}</span>
        </button>
        <button
          className={`ap-stat ${stockFilter === 'hidden' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'hidden' ? '' : 'hidden')}
        >
          <span className="ap-stat-label">🙈 Ocultos</span>
          <span className="ap-stat-value">{hiddenCount}</span>
        </button>
        <button
          className={`ap-stat ${stockFilter === 'nophoto' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'nophoto' ? '' : 'nophoto')}
        >
          <span className="ap-stat-label">📷 Sem foto</span>
          <span className="ap-stat-value">{noPhotoCount}</span>
        </button>
      </div>

      {message && (
        <div className={`ap-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>
      )}

      {/* BUSCA + FILTRO */}
      <div className="ap-toolbar">
        <input
          type="text"
          placeholder="🔍 Buscar produto pelo nome..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ap-search"
          autoFocus
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="ap-select"
        >
          <option value="">📁 Todas as categorias</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div className="ap-results">
        Mostrando <strong>{filteredProducts.length}</strong> de <strong>{products.length}</strong> produtos
        {(searchTerm || filterCategory || stockFilter) && (
          <button
            className="ap-clear"
            onClick={() => { setSearchTerm(''); setFilterCategory(''); setStockFilter(''); }}
          >
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {/* LISTA */}
      {filteredProducts.length === 0 ? (
        <div className="ap-empty">📭 Nenhum produto encontrado</div>
      ) : (
        <div className="ap-list">
          <div className="ap-list-head">
            <span>Produto</span>
            <span>Preço</span>
            <span>Estoque</span>
            <span>Ações</span>
          </div>

          {filteredProducts.map(product => {
            const status = getStockStatus(product.estoque);
            return (
              <div key={product.id} className={`ap-row ${product.active === false ? 'ap-row-hidden' : ''}`} onClick={() => openEdit(product)}>
                <div className="ap-cell-product">
                  <div className="ap-thumb">
                    {product.image_url ? (
                      <img src={getImageUrl(product.image_url)} alt={product.name} />
                    ) : (
                      <span>📦</span>
                    )}
                  </div>
                  <div className="ap-product-text">
                    <strong className="ap-name">{product.name}</strong>
                    <span className="ap-cat">
                      {getCategoryName(product.category_id)}
                      {product.active === false && <em className="ap-tag ap-tag-hidden">Oculto</em>}
                      {product.adult && <em className="ap-tag ap-tag-hidden">🔞 18+</em>}
                      {isPromo(product) && <em className="ap-tag ap-tag-promo">Oferta</em>}
                    </span>
                  </div>
                </div>

                <div className="ap-cell-price">
                  {isPromo(product) ? (
                    <>
                      <s>{brl(parseFloat(product.price))}</s>
                      <strong>{brl(parseFloat(product.promo_price))}</strong>
                    </>
                  ) : (
                    <strong>{brl(parseFloat(product.price))}</strong>
                  )}
                  <span>/ {product.unit}</span>
                </div>

                <div className="ap-cell-stock">
                  <span className={`ap-stock ap-stock-${status.key}`}>
                    {status.icon} {product.estoque} {isKg(product.unit) ? 'kg' : 'un'}
                  </span>
                </div>

                <div className="ap-cell-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="ap-btn-edit" onClick={() => openEdit(product)}>✏️ Editar</button>
                  <button
                    className="ap-btn-icon"
                    onClick={() => toggleActive(product)}
                    title={product.active === false ? 'Mostrar na loja' : 'Ocultar da loja'}
                  >
                    {product.active === false ? '🙈' : '👁️'}
                  </button>
                  <button className="ap-btn-icon" onClick={() => openDuplicate(product)} title="Duplicar">📄</button>
                  <button className="ap-btn-delete" onClick={() => deleteProduct(product)} title="Deletar">🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showGrid && (
        <AdminProductsGrid
          products={products}
          categories={categories}
          onClose={() => setShowGrid(false)}
          onDone={(text) => {
            setShowGrid(false);
            fetchProducts();
            fetchCategories();
            setMessage(text);
            setTimeout(() => setMessage(''), 8000);
          }}
        />
      )}

      {showImport && (
        <AdminImportProducts
          products={products}
          onClose={() => setShowImport(false)}
          onDone={(text) => {
            setShowImport(false);
            fetchProducts();
            fetchCategories();
            setMessage(text);
            setTimeout(() => setMessage(''), 8000);
          }}
        />
      )}

      {/* JANELA DE CRIAR/EDITAR */}
      {modalMode && (
        <div className="ap-overlay" onClick={() => !saving && closeModal()}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>{modalMode === 'create' ? (editingProduct?.duplicateOf ? '📄 Duplicar Produto' : '➕ Novo Produto') : '✏️ Editar Produto'}</h3>
              <button className="ap-close" onClick={closeModal} disabled={saving}>✕</button>
            </div>

            <div className="ap-modal-body">
              {/* Foto + nome do produto */}
              <div className="ap-modal-product">
                {/* 📷 Toque na foto para tirar outra (a câmera também fica lá embaixo) */}
                <button type="button" className="ap-modal-thumb" onClick={() => setShowCamera(true)} disabled={saving} title="Tirar foto">
                  {modalImage ? <img src={modalImage} alt="Prévia" /> : <span>📦</span>}
                  <b className="ap-thumb-cam">📷</b>
                </button>
                <div>
                  <strong>{formData.name || 'Novo produto'}</strong>
                  <span>{formData.category_id ? getCategoryName(formData.category_id) : 'Sem categoria'}</span>
                  {previewUrl && <em>{readyUrl ? '✅ Foto pronta e conferida' : 'Nova foto (ainda sem tratar)'}</em>}
                  <button type="button" className="ap-thumb-btn" onClick={() => setShowCamera(true)} disabled={saving || preparing}>
                    📷 {modalImage ? 'Trocar foto' : 'Tirar foto'}
                  </button>
                </div>
              </div>

              {/* 🔄 Girar e ✨ ver como fica, logo abaixo da foto */}
              {previewUrl && (
                <div className="ap-photo-check">
                  <div className="ap-rotate">
                    <span>Produto deitado?</span>
                    <button type="button" onClick={() => rotateImage(-90)} disabled={saving || preparing}>↺ Girar</button>
                    <button type="button" onClick={() => rotateImage(90)} disabled={saving || preparing}>↻ Girar</button>
                  </div>
                  {readyUrl ? (
                    <div className="ap-ready">
                      <img src={readyUrl} alt="Foto pronta" />
                      <span>✅ Assim vai aparecer na loja. Ao salvar, é esta foto que fica.</span>
                    </div>
                  ) : (
                    <button type="button" className="ap-prepare" onClick={preparePhoto} disabled={saving || preparing}>
                      {preparing ? '⏳ Tirando o fundo...' : '✨ Ver como vai ficar'}
                    </button>
                  )}
                </div>
              )}

              {formError && <div className="ap-message error">{formError}</div>}

              <div className="ap-form-group">
                <label>Nome do Produto *</label>
                <input
                  type="text"
                  placeholder="Ex: Arroz 5kg"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="ap-input"
                />
              </div>

              <div className="ap-form-group">
                <label>Código de barras (opcional)</label>
                <div className="ap-barcode-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ex: 7891000100103"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value.replace(/\D/g, '').slice(0, 14) })}
                    className="ap-input"
                  />
                  <button type="button" className="ap-btn-scan" onClick={() => setScanFor('form')} disabled={saving || lookingUp}>
                    {lookingUp ? '⏳' : '📷 Ler'}
                  </button>
                </div>
              </div>

              <div className="ap-form-group">
                <label>Descrição (opcional)</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  placeholder="Ex: Tipo 1, pacote econômico. Aparece no card do produto."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="ap-input"
                />
              </div>

              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Preço (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 25.50"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="ap-input"
                  />
                </div>
                <div className="ap-form-group">
                  <label>🔥 Preço de oferta (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Vazio = sem oferta"
                    value={formData.promo_price}
                    onChange={(e) => setFormData({ ...formData, promo_price: e.target.value })}
                    className="ap-input"
                  />
                  {formData.promo_price !== '' && parseFloat(formData.promo_price) < parseFloat(formData.price) && (
                    <small>Aparece na loja com {Math.round((1 - formData.promo_price / formData.price) * 100)}% OFF e na seção 🔥 Ofertas.</small>
                  )}
                </div>
              </div>

              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>💳 Acréscimo no cartão (R$ por unidade)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Vazio = sem acréscimo (ex: cigarro 1.00)"
                    value={formData.card_extra}
                    onChange={(e) => setFormData({ ...formData, card_extra: e.target.value })}
                    className="ap-input"
                  />
                  {parseFloat(formData.card_extra) > 0 && (
                    <small>Quem pagar no cartão paga + R$ {parseFloat(formData.card_extra).toFixed(2).replace('.', ',')} em cada um. Aparece no card da loja e no pedido.</small>
                  )}
                </div>
              </div>

              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Unidade *</label>
                  <input
                    type="text"
                    placeholder="Ex: kg, L, un"
                    list="ap-units"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="ap-input"
                  />
                  <datalist id="ap-units">
                    {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
                  </datalist>
                  <small>Use <strong>kg</strong> para vender por peso: o cliente escolhe as gramas e o preço é por kg.</small>
                </div>
              </div>

              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Categoria *</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="ap-input"
                  >
                    <option value="">Selecione...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Subcategoria (opcional)</label>
                  <input
                    type="text"
                    maxLength={60}
                    list="ap-subcats"
                    placeholder="Ex: Refrigerantes"
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    className="ap-input"
                  />
                  <datalist id="ap-subcats">
                    {[...new Set(products
                      .filter(p => p.category_id === parseInt(formData.category_id) && p.subcategory)
                      .map(p => p.subcategory))].map(sub => <option key={sub} value={sub} />)}
                  </datalist>
                  <small>Vira uma abinha dentro da categoria na loja (ex: Bebidas → Refrigerantes, Sucos).</small>
                </div>
                <div className="ap-form-group">
                  <label>Estoque{isKg(formData.unit) ? ' (em kg, ex: 2.5)' : ''}</label>
                  <input
                    type="number"
                    min="0"
                    step={isKg(formData.unit) ? '0.001' : '1'}
                    placeholder="Ex: 50"
                    value={formData.estoque}
                    onChange={(e) => setFormData({ ...formData, estoque: e.target.value })}
                    className="ap-input"
                  />
                  {modalMode === 'create' && (
                    <small>Com estoque, o produto já entra no automático: renova para essa quantidade toda segunda. Para mudar, use a aba Estoque.</small>
                  )}
                </div>
              </div>

              <div className="ap-form-group">
                <label>{modalMode === 'create' ? 'Imagem' : 'Trocar Imagem (opcional)'}</label>
                <div className="ap-photo-buttons">
                  <button type="button" className="ap-photo-btn ap-photo-camera" onClick={() => setShowCamera(true)} disabled={saving}>
                    📷 Tirar foto
                  </button>
                  {/* Reserva: se o navegador não deixar abrir a câmera dentro do app */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="ap-photo-hidden"
                    onChange={async (e) => { setImageFile(await prepareImage(e.target.files[0])); e.target.value = ''; }}
                  />
                  <label className="ap-photo-btn">
                    🖼️ Escolher arquivo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => { setImageFile(await prepareImage(e.target.files[0])); e.target.value = ''; }}
                      disabled={saving}
                    />
                  </label>
                </div>
                <small>No celular, "Tirar foto" abre a câmera traseira (🔄 troca de câmera, se precisar). Pode ser qualquer foto: o fundo é removido e o produto fica centralizado em 800x800 com fundo branco.</small>
                {showCamera && (
                  <ProductCamera
                    onCapture={(file) => { setImageFile(file); setShowCamera(false); }}
                    onClose={() => setShowCamera(false)}
                    onUnavailable={() => { setShowCamera(false); cameraInputRef.current && cameraInputRef.current.click(); }}
                  />
                )}
              </div>
            </div>

            <div className="ap-modal-visible">
              <label>
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                />
                <span>👁️ Mostrar este produto na loja</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formData.adult}
                  onChange={(e) => setFormData({ ...formData, adult: e.target.checked })}
                />
                <span>🔞 Venda proibida para menores de 18 anos</span>
              </label>
            </div>

            <div className="ap-modal-footer">
              <button className="ap-btn-cancel" onClick={closeModal} disabled={saving}>Cancelar</button>
              <button className="ap-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Salvando...' : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {scanFor && (
        <BarcodeScanner onResult={(code) => lookupBarcode(code, scanFor === 'form')} onClose={() => setScanFor(null)} />
      )}
    </div>
  );
}

export default AdminProducts;