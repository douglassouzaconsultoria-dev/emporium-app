import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AdminStockConfig.css';

function AdminStockConfig() {
  const [products, setProducts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const API_URL = 'http://localhost:3001/api';

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/products`);
      
      // Busca a configuração de estoque para cada produto
      const productsWithConfig = await Promise.all(
        response.data.map(async (product) => {
          try {
            const configResponse = await axios.get(`${API_URL}/products/${product.id}/stock-config`);
            return { ...product, config: configResponse.data };
          } catch (error) {
            return { ...product, config: { type: 'MANUAL', auto_quantity: 0, auto_frequency: 'SEMANAL' } };
          }
        })
      );
      
      setProducts(productsWithConfig);
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
      setMessage('❌ Erro ao buscar produtos');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const startEdit = (product) => {
    setEditingId(product.id);
    setEditData({ ...product.config });
  };

  const saveEdit = async () => {
    try {
      if (!editData.type || !editData.auto_frequency) {
        setMessage('❌ Preencha todos os campos');
        return;
      }

      const token = localStorage.getItem('authToken');
      await axios.put(`${API_URL}/products/${editingId}/stock-config`, editData, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setMessage('✅ Configuração atualizada com sucesso!');
      setEditingId(null);
      fetchProducts();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('❌ Erro ao atualizar configuração');
      console.error(error);
    }
  };

  return (
    <div className="admin-stock-config">
      <div className="admin-header">
        <h2>⚙️ Configuração de Estoque</h2>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-label">Total</span>
            <span className="stat-value">{products.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Automáticos</span>
            <span className="stat-value" style={{ color: '#3b82f6' }}>
              {products.filter(p => p.config?.type === 'AUTOMÁTICO').length}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Manuais</span>
            <span className="stat-value" style={{ color: '#f59e0b' }}>
              {products.filter(p => p.config?.type === 'MANUAL').length}
            </span>
          </div>
        </div>
      </div>

      {message && <div className={`admin-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Buscar produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <button onClick={() => fetchProducts()} className="btn-refresh">
          🔄 Atualizar
        </button>

        <div className="results-info">
          Mostrando <strong>{filteredProducts.length}</strong> de <strong>{products.length}</strong> produtos
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Carregando...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-state">
          <p>📭 Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="stock-config-table">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Tipo</th>
                <th>Quantidade Auto</th>
                <th>Frequência</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => (
                <tr key={product.id}>
                  <td className="product-name">
                    <strong>{product.name}</strong>
                  </td>
                  <td>
                    <span className={`type-badge ${product.config?.type === 'AUTOMÁTICO' ? 'auto' : 'manual'}`}>
                      {product.config?.type === 'AUTOMÁTICO' ? '🤖 AUTOMÁTICO' : '✋ MANUAL'}
                    </span>
                  </td>
                  <td>{product.config?.auto_quantity || 0} un</td>
                  <td>{product.config?.auto_frequency || 'N/A'}</td>
                  <td>
                    <button 
                      onClick={() => startEdit(product)} 
                      className="btn-config"
                      title="Configurar"
                    >
                      ⚙️ Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {editingId && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚙️ Configurar Estoque</h3>
              <button className="close-modal" onClick={() => setEditingId(null)}>✕</button>
            </div>

            <div className="modal-body">
              <p className="product-info">
                <strong>Produto:</strong> {products.find(p => p.id === editingId)?.name}
              </p>

              <div className="form-group">
                <label>Tipo de Estoque</label>
                <select
                  value={editData.type || 'MANUAL'}
                  onChange={(e) => setEditData({...editData, type: e.target.value})}
                  className="form-input"
                >
                  <option value="MANUAL">✋ MANUAL (Admin controla)</option>
                  <option value="AUTOMÁTICO">🤖 AUTOMÁTICO (Repõe sozinho)</option>
                </select>
              </div>

              {editData.type === 'AUTOMÁTICO' && (
                <>
                  <div className="form-group">
                    <label>Quantidade a Repor</label>
                    <input
                      type="number"
                      value={editData.auto_quantity || 0}
                      onChange={(e) => setEditData({...editData, auto_quantity: parseInt(e.target.value) || 0})}
                      className="form-input"
                      placeholder="Ex: 50"
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label>Frequência de Reposição</label>
                    <select
                      value={editData.auto_frequency || 'SEMANAL'}
                      onChange={(e) => setEditData({...editData, auto_frequency: e.target.value})}
                      className="form-input"
                    >
                      <option value="DIÁRIA">📅 DIÁRIA</option>
                      <option value="SEMANAL">📆 SEMANAL</option>
                      <option value="QUINZENAL">📊 QUINZENAL</option>
                      <option value="MENSAL">📋 MENSAL</option>
                    </select>
                  </div>

                  <div className="info-box">
                    <p>📌 <strong>Como funciona:</strong></p>
                    <p>O sistema reporá automaticamente {editData.auto_quantity} unidades {editData.auto_frequency?.toLowerCase()} neste produto.</p>
                  </div>
                </>
              )}

              {editData.type === 'MANUAL' && (
                <div className="info-box">
                  <p>📌 <strong>Como funciona:</strong></p>
                  <p>Admin edita o estoque manualmente sempre que necessário.</p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={saveEdit} className="btn-save">💾 Salvar Configuração</button>
              <button onClick={() => setEditingId(null)} className="btn-cancel">❌ Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminStockConfig;