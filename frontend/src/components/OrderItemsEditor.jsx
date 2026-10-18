import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { isKg, effectivePrice } from '../utils/units';
import { notify } from '../utils/dialog';

// ✏️ Editar os itens de um pedido (faltou produto, cliente pediu mais alguma coisa...)
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const brl = (v) => `R$ ${(Math.round(v * 100) / 100).toFixed(2).replace('.', ',')}`;

function OrderItemsEditor({ order, items, onSaved, onCancel }) {
  const [rows, setRows] = useState(() => items.map(i => ({
    product_id: i.product_id,
    name: i.product_name,
    unit: i.unit,
    price: parseFloat(i.price),
    quantity: String(parseFloat(i.quantity))
  })));
  const [products, setProducts] = useState([]);
  const [term, setTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/products?all=1`).then(res => setProducts(res.data)).catch(() => setProducts([]));
  }, []);

  const qtyOf = (r) => parseFloat(String(r.quantity).replace(',', '.')) || 0;
  const subtotal = rows.reduce((s, r) => s + Math.round(r.price * qtyOf(r) * 100) / 100, 0);
  const discount = Math.min(parseFloat(order.discount) || 0, subtotal);
  const total = subtotal - discount + (parseFloat(order.delivery_fee) || 0);

  const q = term.trim().toLowerCase();
  const matches = useMemo(() => (q.length < 2 ? [] : products
    .filter(p => !rows.some(r => r.product_id === p.id))
    .filter(p => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q))
    .slice(0, 8)), [q, products, rows]);

  const add = (p) => {
    setRows(list => [...list, { product_id: p.id, name: p.name, unit: p.unit, price: effectivePrice(p), quantity: '1', isNew: true }]);
    setTerm('');
  };

  const setQty = (id, value) => setRows(list => list.map(r => (r.product_id === id ? { ...r, quantity: value } : r)));
  const remove = (id) => setRows(list => list.filter(r => r.product_id !== id));

  const save = async () => {
    if (rows.length === 0) {
      notify('❌ O pedido precisa de pelo menos um item. Para tirar tudo, cancele o pedido.', 'error');
      return;
    }
    const bad = rows.find(r => qtyOf(r) <= 0 || (!isKg(r.unit) && !Number.isInteger(qtyOf(r))));
    if (bad) {
      notify(`❌ Quantidade inválida para "${bad.name}"`, 'error');
      return;
    }
    try {
      setSaving(true);
      const res = await axios.put(`${API_URL}/orders/${order.id}/items`,
        { items: rows.map(r => ({ product_id: r.product_id, quantity: qtyOf(r) })) }, auth());
      notify(`✅ Pedido #${order.id} atualizado. Novo total: ${brl(parseFloat(res.data.order.total))}`);
      onSaved(res.data.order);
    } catch (err) {
      notify(`❌ ${err.response?.data?.error || 'Erro ao salvar'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeFor = parseFloat(order.change_for) || 0;

  return (
    <div className="oie">
      {rows.map(r => (
        <div key={r.product_id} className="oie-row">
          <span className="oie-name">{r.name}{r.isNew && <em> (novo)</em>}</span>
          <input
            type="number"
            inputMode="decimal"
            min={isKg(r.unit) ? '0.05' : '1'}
            step={isKg(r.unit) ? '0.05' : '1'}
            value={r.quantity}
            onChange={(e) => setQty(r.product_id, e.target.value)}
          />
          <span className="oie-unit">{r.unit}</span>
          <span className="oie-price">{brl(r.price * qtyOf(r))}</span>
          <button type="button" className="oie-remove" onClick={() => remove(r.product_id)} title="Tirar do pedido">✕</button>
        </div>
      ))}

      <div className="oie-add">
        <input
          type="search"
          placeholder="➕ Adicionar produto: digite o nome"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {matches.length > 0 && (
          <ul>
            {matches.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)}>
                  {p.name} <small>{brl(effectivePrice(p))} / {p.unit} · estoque {parseFloat(p.estoque)}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="oie-total">
        <span>Produtos: {brl(subtotal)}</span>
        {discount > 0 && <span>Desconto: − {brl(discount)}</span>}
        {parseFloat(order.delivery_fee) > 0 && <span>Entrega: {brl(parseFloat(order.delivery_fee))}</span>}
        <strong>Novo total: {brl(total)}</strong>
      </div>
      {order.payment_method === 'dinheiro' && changeFor > 0 && changeFor < total && (
        <p className="oie-warn">⚠️ O cliente pediu troco para {brl(changeFor)}, menos que o novo total. Combine com ele.</p>
      )}
      {order.payment_method === 'pix' && Math.abs(total - parseFloat(order.total)) > 0.009 && (
        <p className="oie-warn">⚠️ Pedido em PIX: o valor mudou. Combine com o cliente a diferença.</p>
      )}

      <div className="oie-actions">
        <button type="button" className="oie-cancel" onClick={onCancel} disabled={saving}>Voltar</button>
        <button type="button" className="oie-save" onClick={save} disabled={saving}>{saving ? '⏳ Salvando...' : '💾 Salvar itens'}</button>
      </div>
      <small className="oie-help">Itens que já estavam ficam com o preço do pedido; itens novos entram com o preço de hoje. O estoque é ajustado sozinho.</small>
    </div>
  );
}

export default OrderItemsEditor;
