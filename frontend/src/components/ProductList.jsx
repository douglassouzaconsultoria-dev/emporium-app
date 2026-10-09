import './ProductList.css';
import React, { useState } from 'react';
import { getImageUrl } from '../utils/imageUrl';
import { isKg } from '../utils/units';

const GRAM_PRESETS = [100, 250, 500, 1000];

// ⚖️ Escolha de gramas para produto vendido por kg
function KgPicker({ product, onAddToCart }) {
  const [grams, setGrams] = useState(500);
  const price = parseFloat(product.price) * grams / 1000;
  const valid = grams >= 50;

  return (
    <div className="kg-picker">
      <div className="kg-presets">
        {GRAM_PRESETS.map(g => (
          <button
            key={g}
            type="button"
            className={`kg-preset ${grams === g ? 'active' : ''}`}
            onClick={() => setGrams(g)}
          >
            {g < 1000 ? `${g} g` : '1 kg'}
          </button>
        ))}
      </div>
      <label className="kg-custom">
        Outra quantidade:
        <input
          type="number"
          min="50"
          step="50"
          value={grams}
          onChange={(e) => setGrams(parseInt(e.target.value) || 0)}
        />
        g
      </label>
      <button
        className="add-btn"
        onClick={() => onAddToCart(product, grams / 1000)}
        disabled={!valid}
      >
        {valid ? `🛒 Adicionar ${grams} g — R$ ${price.toFixed(2)}` : 'Mínimo 50 g'}
      </button>
    </div>
  );
}

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
              <p className="price">R$ {parseFloat(product.price).toFixed(2)}{isKg(product.unit) && ' / kg'}</p>
              {!isKg(product.unit) && <p className="unit">{product.unit}</p>}

              {/* Estoque indicator */}
              <div className="stock-indicator">
                {product.estoque > 10 ? (
                  <span className="stock-good">🟢 Disponível</span>
                ) : product.estoque > 0 ? (
                  <span className="stock-low">🟡 Estoque Baixo ({product.estoque}{isKg(product.unit) && ' kg'})</span>
                ) : (
                  <span className="stock-empty">🔴 Fora de Estoque</span>
                )}
              </div>

              {isKg(product.unit) && product.estoque > 0 ? (
                <KgPicker product={product} onAddToCart={onAddToCart} />
              ) : (
                <button
                  className="add-btn"
                  onClick={() => onAddToCart(product)}
                  disabled={product.estoque === 0}
                >
                  {product.estoque === 0 ? '❌ Indisponível' : '🛒 Adicionar ao Carrinho'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProductList;
