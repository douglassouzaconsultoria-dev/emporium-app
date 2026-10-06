import './ProductList.css';
import React from 'react';
import { getImageUrl } from '../utils/imageUrl';

function ProductList({ products, onAddToCart }) {
  return (
    <div className="products">
      <h2>Produtos</h2>
      <div className="product-grid">
        {products.map(product => (
          <div key={product.id} className="product-card">
            {product.image_url && (
              <img
                src={getImageUrl(product.image_url)}
                alt={product.name}
                className="product-image"
              />
            )}

            <div className="product-info">
              <h3>{product.name}</h3>
              <p className="price">R$ {parseFloat(product.price).toFixed(2)}</p>
              <p className="unit">{product.unit}</p>

              {/* Estoque indicator */}
              <div className="stock-indicator">
                {product.estoque > 10 ? (
                  <span className="stock-good">🟢 Disponível</span>
                ) : product.estoque > 0 ? (
                  <span className="stock-low">🟡 Estoque Baixo ({product.estoque})</span>
                ) : (
                  <span className="stock-empty">🔴 Fora de Estoque</span>
                )}
              </div>

              <button
                className="add-btn"
                onClick={() => onAddToCart(product)}
                disabled={product.estoque === 0}
              >
                {product.estoque === 0 ? '❌ Indisponível' : '🛒 Adicionar ao Carrinho'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProductList;