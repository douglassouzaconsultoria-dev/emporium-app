import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { isKg } from '../utils/units';
import axios from 'axios';
import './AdminProducts.css';
import { getImageUrl } from '../utils/imageUrl';

const emptyForm = { name: '', price: '', unit: '', category_id: '', estoque: '' };

function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [stockFilter, setStockFilter] = useState(''); // '' | 'low' | 'out'
  const [modalMode, setModalMode] = useState(null); // null | 'create' | 'edit'
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  // Prévia da imagem nova escolhida
  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

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
      const response = await axios.get(`${API_URL}/products`);
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
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === '' || p.category_id === parseInt(filterCategory);
    const matchesStock =
      stockFilter === '' ||
      (stockFilter === 'low' && p.estoque > 0 && p.estoque <= 10) ||
      (stockFilter === 'out' && p.estoque === 0);
    return matchesSearch && matchesCategory && matchesStock;
  });

  // 📊 STATS
  const lowStockCount = products.filter(p => p.estoque > 0 && p.estoque <= 10).length;
  const outOfStockCount = products.filter(p => p.estoque === 0).length;

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
      unit: product.unit,
      category_id: product.category_id,
      estoque: product.estoque ?? 0
    });
    setImageFile(null);
    setFormError('');
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

    try {
      setSaving(true);
      setFormError('');
      const token = localStorage.getItem('authToken');

      const fd = new FormData();
      fd.append('name', formData.name);
      fd.append('price', parseFloat(formData.price));
      fd.append('unit', formData.unit);
      fd.append('category_id', parseInt(formData.category_id));
      if (imageFile) fd.append('image', imageFile);

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
      setFormError('❌ Erro ao salvar produto. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Deletar "${product.name}"? Essa ação não pode ser desfeita.`)) return;
    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(`${API_URL}/products/${product.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchProducts();
      showMessage('✅ Produto deletado com sucesso!');
    } catch (error) {
      console.error(error);
      showMessage('❌ Erro ao deletar produto');
    }
  };

  const modalImage = previewUrl || (editingProduct && getImageUrl(editingProduct.image_url));

  return (
    <div className="ap-container">
      {/* HEADER */}
      <div className="ap-header">
        <h2>🛍️ Gerenciar Produtos</h2>
        <button className="ap-btn-new" onClick={openCreate}>➕ Novo Produto</button>
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
              <div key={product.id} className="ap-row" onClick={() => openEdit(product)}>
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
                    <span className="ap-cat">{getCategoryName(product.category_id)}</span>
                  </div>
                </div>

                <div className="ap-cell-price">
                  <strong>R$ {parseFloat(product.price).toFixed(2)}</strong>
                  <span>/ {product.unit}</span>
                </div>

                <div className="ap-cell-stock">
                  <span className={`ap-stock ap-stock-${status.key}`}>
                    {status.icon} {product.estoque} {isKg(product.unit) ? 'kg' : 'un'}
                  </span>
                </div>

                <div className="ap-cell-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="ap-btn-edit" onClick={() => openEdit(product)}>✏️ Editar</button>
                  <button className="ap-btn-delete" onClick={() => deleteProduct(product)} title="Deletar">🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* JANELA DE CRIAR/EDITAR */}
      {modalMode && (
        <div className="ap-overlay" onClick={() => !saving && closeModal()}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3>{modalMode === 'create' ? '➕ Novo Produto' : '✏️ Editar Produto'}</h3>
              <button className="ap-close" onClick={closeModal} disabled={saving}>✕</button>
            </div>

            <div className="ap-modal-body">
              {/* Foto + nome do produto */}
              <div className="ap-modal-product">
                <div className="ap-modal-thumb">
                  {modalImage ? <img src={modalImage} alt="Prévia" /> : <span>📦</span>}
                </div>
                <div>
                  <strong>{formData.name || 'Novo produto'}</strong>
                  <span>{formData.category_id ? getCategoryName(formData.category_id) : 'Sem categoria'}</span>
                  {previewUrl && <em>Nova imagem selecionada</em>}
                </div>
              </div>

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
                  <label>Unidade *</label>
                  <input
                    type="text"
                    placeholder="Ex: kg, L, un"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="ap-input"
                  />
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
                </div>
              </div>

              <div className="ap-form-group">
                <label>{modalMode === 'create' ? 'Imagem (800x800, fundo branco)' : 'Trocar Imagem (opcional)'}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files[0] || null)}
                  className="ap-input"
                />
              </div>
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
    </div>
  );
}

export default AdminProducts;