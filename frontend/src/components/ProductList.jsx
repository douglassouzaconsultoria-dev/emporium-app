import './ProductList.css';
import React, { useState } from 'react';
import { getImageUrl } from '../utils/imageUrl';
import { isKg, effectivePrice, isPromo, qtyText } from '../utils/units';

const GRAM_PRESETS = [100, 250, 500, 1000];

// ⚖️ Escolha de gramas para produto vendido por kg
function KgPicker({ product, onAddToCart }) {
  const [grams, setGrams] = useState(500);
  const price = effectivePrice(product) * grams / 1000;
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
        {valid ? `Adicionar · R$ ${price.toFixed(2)}` : 'Mínimo 50 g'}
      </button>
    </div>
  );
}

// 🔢 Escolha de quantidade para produto vendido por unidade
function UnitPicker({ product, onAddToCart }) {
  const [qty, setQty] = useState(1);
  const max = Math.floor(product.estoque);
  const price = effectivePrice(product) * qty;

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
        Adicionar · R$ {price.toFixed(2)}
      </button>
    </div>
  );
}

// row: uma fileira que rola para o lado (vitrine por categoria)
// inCart: { [productId]: quantidade } para mostrar o que já está no carrinho
function ProductList({ products, onAddToCart, title = 'Produtos', row = false, inCart = {} }) {
  return (
    <div className="products">
      <h2>{title}</h2>
      <div className={row ? 'product-row' : 'product-grid'}>
        {products.map(product => {
          const promo = isPromo(product);
          const off = promo ? Math.round((1 - effectivePrice(product) / parseFloat(product.price)) * 100) : 0;
          const qtyInCart = inCart[product.id];
          return (
          <div key={product.id} className={`product-card ${product.estoque <= 0 ? 'sold-out' : ''}`}>
            <div className="product-media">
              {product.image_url ? (
                <img
                  src={getImageUrl(product.image_url)}
                  alt={product.name}
                  className="product-image"
                  loading="lazy"
                />
              ) : (
                <div className="product-image product-image-empty">🛒</div>
              )}
              {promo && <span className="promo-badge">-{off}%</span>}
              {qtyInCart > 0 && (
                <span className="in-cart-badge">✓ {qtyText(qtyInCart, product.unit)} no carrinho</span>
              )}
            </div>

            <div className="product-info">
              <h3>{product.name}</h3>
              {product.description && <p className="product-desc">{product.description}</p>}
              <div className="price-line">
                {promo && (
                  <span className="old-price">R$ {parseFloat(product.price).toFixed(2)}</span>
                )}
                <span className={`price ${promo ? 'price-promo' : ''}`}>
                  R$ {effectivePrice(product).toFixed(2)}{isKg(product.unit) && <small> /kg</small>}
                </span>
              </div>
              {!isKg(product.unit) && <p className="unit">{product.unit}</p>}

              {product.estoque > 0 && product.estoque <= 10 && (
                <div className="stock-indicator">
                  <span className="stock-low">Últimas {isKg(product.unit) ? `${product.estoque} kg` : `${product.estoque} un`}</span>
                </div>
              )}

              {product.estoque <= 0 ? (
                <button className="add-btn" disabled>Esgotado</button>
              ) : isKg(product.unit) ? (
                <KgPicker product={product} onAddToCart={onAddToCart} />
              ) : (
                <UnitPicker product={product} onAddToCart={onAddToCart} />
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProductList;
