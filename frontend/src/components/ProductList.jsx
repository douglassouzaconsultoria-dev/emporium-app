import './ProductList.css';
import React, { useState } from 'react';
import { getImageUrl } from '../utils/imageUrl';
import { isKg, effectivePrice, isPromo, qtyText, roundQty } from '../utils/units';
import { brl } from '../utils/format';

const GRAM_PRESETS = [100, 250, 500, 1000];
const KG_STEP = 0.1; // − / + do produto por peso no carrinho: de 100 em 100 g

// ⚖️ Escolha de gramas para produto vendido por kg (abre ao tocar no +)
function KgPicker({ product, onAdd, onClose }) {
  const [grams, setGrams] = useState(500);
  const price = effectivePrice(product) * grams / 1000;
  const valid = grams >= 50 && grams / 1000 <= product.estoque;

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
        <span>Outra:</span>
        <input
          type="number"
          inputMode="numeric"
          min="50"
          step="50"
          value={grams}
          onChange={(e) => setGrams(parseInt(e.target.value) || 0)}
        />
        <span>g</span>
      </label>
      <button type="button" className="add-btn" onClick={() => onAdd(grams / 1000)} disabled={!valid}>
        {grams < 50 ? 'Mínimo 50 g' : !valid ? 'Sem estoque' : <>Adicionar<small>{brl(price)}</small></>}
      </button>
      <button type="button" className="kg-cancel" onClick={onClose}>Cancelar</button>
    </div>
  );
}

// row: uma fileira que rola para o lado (vitrine por categoria)
// inCart: { [productId]: quantidade } — o + vira "− quantidade +" que mexe direto no carrinho
// best: ids dos mais vendidos (selo ⭐)
// subcats: mostra as abinhas de subcategoria (na ordem em que aparecem nos produtos)
// subOrder: ordem das abinhas definida no admin (🗂️ Organizar → subcategorias)
function ProductList({
  products, onAddToCart, onUpdateQuantity, title = 'Produtos', row = false, inCart = {}, best = null,
  subcats = false, subOrder = null
}) {
  const [activeSub, setActiveSub] = useState(null);
  const [picking, setPicking] = useState(null); // produto por kg com a escolha de gramas aberta
  const present = [...new Set(products.map(p => p.subcategory).filter(Boolean))];
  const subs = !subcats ? [] : subOrder
    ? [...subOrder.filter(s => present.includes(s)), ...present.filter(s => !subOrder.includes(s))]
    : present;
  const current = subs.includes(activeSub) ? activeSub : null; // a busca pode ter tirado a subcategoria
  const visible = current ? products.filter(p => p.subcategory === current) : products;

  const step = (product, direction) => {
    const qty = inCart[product.id] || 0;
    const delta = isKg(product.unit) ? KG_STEP : 1;
    const next = roundQty(qty + direction * delta);
    if (direction > 0 && next > product.estoque) return;
    onUpdateQuantity(product.id, next < (isKg(product.unit) ? 0.05 : 1) ? 0 : next);
  };

  return (
    <div className="products">
      {title && <h2>{title}</h2>}
      {subs.length > 0 && (
        <div className="subcat-chips">
          <button className={!current ? 'active' : ''} onClick={() => setActiveSub(null)}>Todos</button>
          {subs.map(sub => (
            <button key={sub} className={current === sub ? 'active' : ''} onClick={() => setActiveSub(sub)}>
              {sub}
            </button>
          ))}
        </div>
      )}
      <div className={row ? 'product-row' : 'product-grid'}>
        {visible.map(product => {
          const promo = isPromo(product);
          const off = promo ? Math.round((1 - effectivePrice(product) / parseFloat(product.price)) * 100) : 0;
          const qtyInCart = inCart[product.id] || 0;
          const kg = isKg(product.unit);
          const soldOut = product.estoque <= 0;
          const lastOnes = !soldOut && product.estoque <= (kg ? 2 : 5);
          const unitLabel = !kg && product.unit && product.unit !== 'un' ? product.unit : null;
          return (
          <div key={product.id} data-product-id={product.id} className={`product-card ${soldOut ? 'sold-out' : ''}`}>
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

              {/* 🏷️ Selos */}
              <div className="product-badges">
                {promo && <span className="pbadge pbadge-promo">🔥 -{off}%</span>}
                {best && best.has(product.id) && <span className="pbadge pbadge-best">⭐ Mais vendido</span>}
                {lastOnes && <span className="pbadge pbadge-last">Últimas unidades</span>}
                {soldOut && <span className="pbadge pbadge-out">Esgotado</span>}
              </div>

              {/* ➕ Adicionar / − quantidade + */}
              {!soldOut && (qtyInCart > 0 ? (
                <div className="qty-pill">
                  <button type="button" onClick={() => step(product, -1)} aria-label="Tirar um">−</button>
                  <span>{qtyText(qtyInCart, product.unit).replace(' un', '')}</span>
                  <button
                    type="button"
                    onClick={() => step(product, 1)}
                    disabled={roundQty(qtyInCart + (kg ? KG_STEP : 1)) > product.estoque}
                    aria-label="Mais um"
                  >+</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="plus-btn"
                  onClick={() => (kg ? setPicking(picking === product.id ? null : product.id) : onAddToCart(product, 1))}
                  aria-label={`Adicionar ${product.name}`}
                >+</button>
              ))}
            </div>

            <div className="product-info">
              <div className="price-line">
                <span className={`price ${promo ? 'price-promo' : ''}`}>
                  {brl(effectivePrice(product))}
                  {kg && <small> /kg</small>}
                  {unitLabel && <small> /{unitLabel}</small>}
                </span>
                {promo && <span className="old-price">{brl(parseFloat(product.price))}</span>}
              </div>
              <h3>{product.name}</h3>
              {product.description && <p className="product-desc">{product.description}</p>}

              {kg && picking === product.id && qtyInCart === 0 && (
                <KgPicker
                  product={product}
                  onAdd={(qty) => { onAddToCart(product, qty); setPicking(null); }}
                  onClose={() => setPicking(null)}
                />
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

// 💀 Cards cinza enquanto os produtos carregam
export function ProductSkeleton({ rows = 2 }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="products">
          <div className="sk-title sk-shine" />
          <div className="product-row">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="product-card sk-card">
                <div className="sk-img sk-shine" />
                <div className="sk-line sk-shine" />
                <div className="sk-line short sk-shine" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ProductList;
