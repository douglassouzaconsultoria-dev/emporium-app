import React from 'react';

function Cart({ cart, onRemove, onUpdateQuantity, onCheckout }) {
  const total = cart.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);

  return (
    <div className="cart">
      <h2>Seu Carrinho</h2>
      {cart.length === 0 ? (
        <p>Carrinho vazio</p>
      ) : (
        <>
          <div className="cart-items">
            {cart.map(item => (
              <div key={item.id} className="cart-item">
                <div className="item-info">
                  <h4>{item.name}</h4>
                  <p>R$ {parseFloat(item.price).toFixed(2)} x {item.quantity}</p>
                </div>
                <div className="item-controls">
                  <button onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}>-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}>+</button>
                  <button className="remove-btn" onClick={() => onRemove(item.id)}>Remover</button>
                </div>
              </div>
            ))}
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