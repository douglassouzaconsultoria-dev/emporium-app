import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import './AdminCategories.css';

function AdminDeliveryFees() {
  const [fees, setFees] = useState([]);
  const [defaultFee, setDefaultFee] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [newFee, setNewFee] = useState({ neighborhood: '', fee: '' });
  const [message, setMessage] = useState('');

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const errorText = (error, fallback) => `❌ ${error.response?.data?.error || fallback}`;

  useEffect(() => {
    fetchFees();
  }, []);

  const fetchFees = async () => {
    try {
      const response = await axios.get(`${API_URL}/delivery-fees`);
      setFees(response.data.fees);
      setDefaultFee(String(response.data.default_fee));
    } catch (error) {
      console.error('Erro ao buscar taxas:', error);
    }
  };

  const saveDefault = async () => {
    try {
      await axios.put(`${API_URL}/delivery-fees/default`, { default_fee: defaultFee }, authHeaders());
      showMessage('✅ Taxa padrão atualizada!');
      fetchFees();
    } catch (error) {
      showMessage(errorText(error, 'Erro ao salvar taxa padrão'));
    }
  };

  const createFee = async () => {
    try {
      await axios.post(`${API_URL}/delivery-fees`, newFee, authHeaders());
      showMessage('✅ Bairro adicionado!');
      setNewFee({ neighborhood: '', fee: '' });
      fetchFees();
    } catch (error) {
      showMessage(errorText(error, 'Erro ao adicionar bairro'));
    }
  };

  const saveEdit = async () => {
    try {
      await axios.put(`${API_URL}/delivery-fees/${editingId}`, editData, authHeaders());
      showMessage('✅ Bairro atualizado!');
      setEditingId(null);
      fetchFees();
    } catch (error) {
      showMessage(errorText(error, 'Erro ao atualizar bairro'));
    }
  };

  const deleteFee = async (fee) => {
    if (!window.confirm(`Remover "${fee.neighborhood}" da lista? Ele passa a pagar a taxa padrão.`)) return;
    try {
      await axios.delete(`${API_URL}/delivery-fees/${fee.id}`, authHeaders());
      showMessage('✅ Bairro removido!');
      fetchFees();
    } catch (error) {
      showMessage(errorText(error, 'Erro ao remover bairro'));
    }
  };

  return (
    <div className="admin-categories">
      <div className="admin-header">
        <h2>🛵 Taxas de Entrega por Bairro</h2>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-label">Bairros</span>
            <span className="stat-value">{fees.length}</span>
          </div>
        </div>
      </div>

      {message && <div className={`admin-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

      <div className="new-category-form">
        <div className="form-group">
          <label>Taxa padrão (bairros fora da lista) — R$</label>
          <input
            type="number"
            min="0"
            step="0.50"
            value={defaultFee}
            onChange={(e) => setDefaultFee(e.target.value)}
            className="form-input"
          />
        </div>
        <div className="form-buttons">
          <button onClick={saveDefault} className="btn-save">💾 Salvar taxa padrão</button>
        </div>
      </div>

      <div className="new-category-form">
        <div className="form-group">
          <label>Novo bairro</label>
          <input
            type="text"
            placeholder="Ex: Morada Nova"
            value={newFee.neighborhood}
            onChange={(e) => setNewFee({ ...newFee, neighborhood: e.target.value })}
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label>Taxa — R$</label>
          <input
            type="number"
            min="0"
            step="0.50"
            placeholder="Ex: 2"
            value={newFee.fee}
            onChange={(e) => setNewFee({ ...newFee, fee: e.target.value })}
            className="form-input"
          />
        </div>
        <div className="form-buttons">
          <button onClick={createFee} className="btn-save">➕ Adicionar bairro</button>
        </div>
      </div>

      <div className="categories-container">
        {fees.length === 0 ? (
          <div className="empty-state">
            <p>📭 Nenhum bairro cadastrado — todos pagam a taxa padrão</p>
          </div>
        ) : (
          <div className="categories-grid">
            {fees.map(fee => (
              <div key={fee.id} className="category-card">
                {editingId === fee.id ? (
                  <div className="edit-form">
                    <div className="form-group">
                      <label>Bairro</label>
                      <input
                        type="text"
                        value={editData.neighborhood}
                        onChange={(e) => setEditData({ ...editData, neighborhood: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Taxa — R$</label>
                      <input
                        type="number"
                        min="0"
                        step="0.50"
                        value={editData.fee}
                        onChange={(e) => setEditData({ ...editData, fee: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-buttons">
                      <button onClick={saveEdit} className="btn-save">💾 Salvar</button>
                      <button onClick={() => setEditingId(null)} className="btn-cancel">❌ Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="category-display">
                    <div className="category-icon">🏘️</div>
                    <h3 className="category-name">{fee.neighborhood}</h3>
                    <p className="category-id">R$ {parseFloat(fee.fee).toFixed(2)}</p>
                    <div className="category-actions">
                      <button
                        onClick={() => { setEditingId(fee.id); setEditData({ neighborhood: fee.neighborhood, fee: fee.fee }); }}
                        className="btn-edit"
                      >
                        ✏️ Editar
                      </button>
                      <button onClick={() => deleteFee(fee)} className="btn-delete">🗑️ Remover</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDeliveryFees;
