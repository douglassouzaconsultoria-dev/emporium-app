import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import axios from 'axios';
import './AdminStore.css';

const emptyCoupon = { code: '', type: 'percent', value: '', min_order: '', max_uses: '', expires_at: '', active: true };

const describe = (c) => (c.type === 'fixed'
  ? `R$ ${parseFloat(c.value).toFixed(2)} de desconto`
  : `${parseFloat(c.value)}% de desconto`);

// 🎟️ Cupons de desconto
function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(null); // null = fechado
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const fetchCoupons = async () => {
    try {
      const res = await axios.get(`${API_URL}/coupons`, authHeaders());
      setCoupons(res.data);
    } catch (error) {
      console.error('Erro ao buscar cupons:', error);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyCoupon);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      type: c.type,
      value: c.value,
      min_order: parseFloat(c.min_order) || '',
      max_uses: c.max_uses || '',
      expires_at: c.expires_at ? String(c.expires_at).slice(0, 10) : '',
      active: c.active
    });
  };

  const save = async () => {
    try {
      if (editingId) {
        await axios.put(`${API_URL}/coupons/${editingId}`, form, authHeaders());
      } else {
        await axios.post(`${API_URL}/coupons`, form, authHeaders());
      }
      setForm(null);
      showMessage('✅ Cupom salvo!');
      fetchCoupons();
    } catch (error) {
      showMessage(`❌ ${error.response?.data?.error || 'Erro ao salvar cupom'}`);
    }
  };

  const toggle = async (c) => {
    try {
      await axios.put(`${API_URL}/coupons/${c.id}`, {
        ...c, expires_at: c.expires_at ? String(c.expires_at).slice(0, 10) : '', active: !c.active
      }, authHeaders());
      fetchCoupons();
    } catch (error) {
      showMessage(`❌ ${error.response?.data?.error || 'Erro ao atualizar cupom'}`);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Apagar o cupom ${c.code}?`)) return;
    try {
      await axios.delete(`${API_URL}/coupons/${c.id}`, authHeaders());
      fetchCoupons();
    } catch (error) {
      showMessage(`❌ ${error.response?.data?.error || 'Erro ao apagar cupom'}`);
    }
  };

  return (
    <div className="as-container">
      <div className="as-card-head">
        <h2>🎟️ Cupons de desconto</h2>
        <button className="as-save as-inline" onClick={openNew}>➕ Novo cupom</button>
      </div>
      {message && <div className={`as-message ${message.includes('✅') ? 'ok' : 'err'}`}>{message}</div>}

      {form && (
        <div className="as-card">
          <h3>{editingId ? '✏️ Editar cupom' : '➕ Novo cupom'}</h3>
          <div className="as-form">
            <label>Código
              <input className="as-input" placeholder="Ex: BEMVINDO10" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '') })} />
            </label>
            <label>Tipo
              <select className="as-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="percent">% (porcentagem)</option>
                <option value="fixed">R$ (valor fixo)</option>
              </select>
            </label>
            <label>Desconto {form.type === 'percent' ? '(%)' : '(R$)'}
              <input className="as-input" type="number" min="0" step="0.01" value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </label>
            <label>Compra mínima (R$)
              <input className="as-input" type="number" min="0" step="0.01" placeholder="Sem mínimo" value={form.min_order}
                onChange={(e) => setForm({ ...form, min_order: e.target.value })} />
            </label>
            <label>Limite de usos
              <input className="as-input" type="number" min="1" placeholder="Sem limite" value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
            </label>
            <label>Válido até
              <input className="as-input" type="date" value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </label>
          </div>
          <label className="as-switch">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Cupom ativo</span>
          </label>
          <div className="as-actions">
            <button className="as-btn-light" onClick={() => setForm(null)}>Cancelar</button>
            <button className="as-save as-inline" onClick={save}>💾 Salvar</button>
          </div>
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="as-empty">Nenhum cupom ainda. Crie um para atrair clientes! 🎉</div>
      ) : (
        <div className="as-coupons">
          {coupons.map(c => (
            <div key={c.id} className={`as-coupon ${c.active ? '' : 'off'}`}>
              <div className="as-coupon-code">{c.code}</div>
              <div className="as-coupon-info">
                <strong>{describe(c)}</strong>
                <span>
                  {parseFloat(c.min_order) > 0 ? `Compra mín. R$ ${parseFloat(c.min_order).toFixed(2)} · ` : ''}
                  Usado {c.uses}{c.max_uses ? `/${c.max_uses}` : ''}x
                  {c.expires_at ? ` · até ${String(c.expires_at).slice(0, 10).split('-').reverse().join('/')}` : ''}
                </span>
              </div>
              <div className="as-coupon-actions">
                <button className="as-btn-light" onClick={() => toggle(c)}>{c.active ? '⏸️ Pausar' : '▶️ Ativar'}</button>
                <button className="as-btn-light" onClick={() => openEdit(c)}>✏️</button>
                <button className="as-btn-light danger" onClick={() => remove(c)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminCoupons;
