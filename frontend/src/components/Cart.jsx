import React from 'react';
import { isKg, formatQty, lineTotal } from '../utils/units';

function Cart({ cart, onRemove, onUpdateQuantity, onCheckout }) {
  const total = cart.reduce((sum, item) => sum + lineTotal(item), 0);

  return (
    <div className="cart">
      <h2>Seu Carrinho</h2>
      {cart.length === 0 ? (
        <p>Carrinho vazio</p>
      ) : (
        <>
          <div className="cart-items">
            {cart.map(item => {
              const step = isKg(item.unit) ? 0.05 : 1;
              return (
              <div key={item.id} className="cart-item">
                <div className="item-info">
                  <h4>{item.name}</h4>
                  <p>
                    {isKg(item.unit)
                      ? `R$ ${parseFloat(item.price).toFixed(2)}/kg × ${formatQty(item.quantity, item.unit)} = R$ ${lineTotal(item).toFixed(2)}`
                      : `R$ ${parseFloat(item.price).toFixed(2)} x ${item.quantity}`}
                  </p>
                </div>
                <div className="item-controls">
                  <button onClick={() => onUpdateQuantity(item.id, item.quantity - step)}>-</button>
                  <span>{isKg(item.unit) ? formatQty(item.quantity, item.unit) : item.quantity}</span>
                  <button onClick={() => onUpdateQuantity(item.id, item.quantity + step)}>+</button>
                  <button className="remove-btn" onClick={() => onRemove(item.id)}>Remover</button>
                </div>
              </div>
              );
            })}
          </div>
          <div className="cart-summary">
            <h3>Total: R$ {total.toFixed(2)}</h3>
            <button className="checkout-btn" onClick={onCheckout}>Finalizar Pedido</button>
          </div>
        </>
      )}
    </div>
  );
}

export default Cart;