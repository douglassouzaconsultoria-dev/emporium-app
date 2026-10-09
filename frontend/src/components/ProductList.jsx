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

// 🔢 Escolha de quantidade para produto vendido por unidade
function UnitPicker({ product, onAddToCart }) {
  const [qty, setQty] = useState(1);
  const max = Math.floor(product.estoque);
  const price = parseFloat(product.price) * qty;

  return (
    <div className="kg-picker">
      <div className="unit-stepper">
        <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
        <input
          type="number"
          min="1"
          max={max}
          value={qty}
          onChange={(e) => setQty(Math.min(max, Math.max(1, parseInt(e.target.value) || 1)))}
        />
        <button type="button" onClick={() => setQty(Math.min(max, qty + 1))} disabled={qty >= max}>+</button>
      </div>
      <button className="add-btn" onClick={() => { onAddToCart(product, qty); setQty(1); }}>
        🛒 Adicionar {qty} — R$ {price.toFixed(2)}
      </button>
    </div>
  );
}

// row: uma fileira que rola para o lado (vitrine por categoria)
function ProductList({ products, onAddToCart, title = 'Produtos', row = false }) {
  return (
    <div className="products">
      <h2>{title}</h2>
      <div className={row ? 'product-row' : 'product-grid'}>
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

              {product.estoque <= 0 ? (
                <button className="add-btn" disabled>❌ Indisponível</button>
              ) : isKg(product.unit) ? (
                <KgPicker product={product} onAddToCart={onAddToCart} />
              ) : (
                <UnitPicker product={product} onAddToCart={onAddToCart} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProductList;
