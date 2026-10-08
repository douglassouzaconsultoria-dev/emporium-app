import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import './AdminCategories.css';

function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);


  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
    }
  };

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const startEdit = (category) => {
    setEditingId(category.id);
    setEditData({ ...category });
  };

  const saveEdit = async () => {
    try {
      if (!editData.name.trim()) {
        setMessage('❌ Nome não pode estar vazio');
        return;
      }

      const token = localStorage.getItem('authToken');
      await axios.put(`${API_URL}/categories/${editingId}`, { name: editData.name }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setMessage('✅ Categoria atualizada com sucesso!');
      setEditingId(null);
      fetchCategories();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('❌ Erro ao atualizar categoria');
      console.error(error);
    }
  };

  const createCategory = async () => {
    try {
      if (!newCategoryName.trim()) {
        setMessage('❌ Nome não pode estar vazio');
        return;
      }

      const token = localStorage.getItem('authToken');
      await axios.post(`${API_URL}/categories`, { name: newCategoryName }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setMessage('✅ Categoria criada com sucesso!');
      setNewCategoryName('');
      setShowNewForm(false);
      fetchCategories();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('❌ Erro ao criar categoria');
      console.error(error);
    }
  };

  const deleteCategory = async (id) => {
    if (window.confirm('Tem certeza que deseja deletar esta categoria?')) {
      try {
        const token = localStorage.getItem('authToken');
        await axios.delete(`${API_URL}/categories/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setMessage('✅ Categoria deletada com sucesso!');
        fetchCategories();
        setTimeout(() => setMessage(''), 3000);
      } catch (error) {
        if (error.response?.status === 400) {
          setMessage('❌ Não é possível deletar categoria com produtos!');
        } else {
          setMessage('❌ Erro ao deletar categoria');
        }
        console.error(error);
      }
    }
  };

  return (
    <div className="admin-categories">
      <div className="admin-header">
        <h2>📁 Gerenciar Categorias</h2>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-label">Total</span>
            <span className="stat-value">{categories.length}</span>
          </div>
        </div>
      </div>

      {message && <div className={`admin-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Buscar categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <button onClick={() => setShowNewForm(!showNewForm)} className="btn-new">
          {showNewForm ? '❌ Cancelar' : '➕ Nova Categoria'}
        </button>

        <div className="results-info">
          Mostrando <strong>{filteredCategories.length}</strong> de <strong>{categories.length}</strong> categorias
        </div>
      </div>

      {showNewForm && (
        <div className="new-category-form">
          <div className="form-group">
            <label>Nome da Nova Categoria</label>
            <input
              type="text"
              placeholder="Ex: Bebidas, Alimentos, Higiene..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-buttons">
            <button onClick={createCategory} className="btn-save">💾 Criar Categoria</button>
            <button onClick={() => setShowNewForm(false)} className="btn-cancel">❌ Cancelar</button>
          </div>
        </div>
      )}

      <div className="categories-container">
        {filteredCategories.length === 0 ? (
          <div className="empty-state">
            <p>📭 Nenhuma categoria encontrada</p>
          </div>
        ) : (
          <div className="categories-grid">
            {filteredCategories.map(category => (
              <div key={category.id} className="category-card">
                {editingId === category.id ? (
                  <div className="edit-modal">
                    <div className="modal-header">
                      <h3>Editar Categoria</h3>
                      <button className="close-modal" onClick={() => setEditingId(null)}>✕</button>
                    </div>

                    <div className="edit-form">
                      <div className="form-group">
                        <label>Nome da Categoria</label>
                        <input
                          type="text"
                          value={editData.name}
                          onChange={(e) => setEditData({...editData, name: e.target.value})}
                          className="form-input"
                        />
                      </div>

                      <div className="form-buttons">
                        <button onClick={saveEdit} className="btn-save">💾 Salvar Alterações</button>
                        <button onClick={() => setEditingId(null)} className="btn-cancel">❌ Cancelar</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="category-display">
                    <div className="category-icon">📁</div>
                    <h3 className="category-name">{category.name}</h3>
                    <p className="category-id">ID: {category.id}</p>

                    <div className="category-actions">
                      <button onClick={() => startEdit(category)} className="btn-edit">✏️ Editar</button>
                      <button onClick={() => deleteCategory(category.id)} className="btn-delete">🗑️ Deletar</button>
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

export default AdminCategories;