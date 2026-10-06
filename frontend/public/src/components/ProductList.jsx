import React from 'react';

function ProductList({ products, onAddToCart }) {
  return (
    <div className="products">
      <h2>Produtos</h2>
      <div className="product-grid">
        {products.map(product => (
          <div key={product.id} className="product-card">
            <h3>{product.name}</h3>
            <p className="price">R$ {product.price.toFixed(2)}</p>
            <p className="unit">{product.unit}</p>
            <button 
              className="add-btn"
              onClick={() => onAddToCart(product)}
            >
              Adicionar ao Carrinho
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProductList;