import React, { useState } from 'react';
import { formatQty } from '../utils/units';
import './OrderPicking.css';

// 🧺 Separação: lista do pedido por categoria (corredor) para ir marcando o que já está na sacola
// O que foi marcado fica guardado neste aparelho (fechar e abrir o pedido não perde)
const keyOf = (orderId) => `separacao-${orderId}`;
const load = (orderId) => {
  try { return new Set(JSON.parse(localStorage.getItem(keyOf(orderId))) || []); } catch { return new Set(); }
};

function OrderPicking({ orderId, items }) {
  const [done, setDone] = useState(() => load(orderId));

  const toggle = (productId) => {
    const next = new Set(done);
    if (next.has(productId)) next.delete(productId); else next.add(productId);
    setDone(next);
    try { localStorage.setItem(keyOf(orderId), JSON.stringify([...next])); } catch { /* sem espaço: só não guarda */ }
  };

  const groups = {};
  [...items]
    .sort((a, b) => (a.category_name || '').localeCompare(b.category_name || '') || a.product_name.localeCompare(b.product_name))
    .forEach(item => {
      const g = item.category_name || 'Sem categoria';
      groups[g] = groups[g] || [];
      groups[g].push(item);
    });
  const count = items.filter(i => done.has(i.product_id)).length;
  const all = count === items.length;

  return (
    <div className="picking">
      <div className={`picking-progress ${all ? 'done' : ''}`}>
        {all ? '✅ Tudo separado!' : `🧺 ${count} de ${items.length} separados`}
        <span style={{ width: `${(count / items.length) * 100}%` }} />
      </div>
      {Object.entries(groups).map(([category, list]) => (
        <div key={category} className="picking-group">
          <h5>{category}</h5>
          {list.map(item => (
            <label key={item.product_id} className={`picking-item ${done.has(item.product_id) ? 'checked' : ''}`}>
              <input type="checkbox" checked={done.has(item.product_id)} onChange={() => toggle(item.product_id)} />
              <b>{formatQty(item.quantity, item.unit)}</b>
              <span>{item.product_name}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

export default OrderPicking;
