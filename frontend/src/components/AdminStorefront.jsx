import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { getImageUrl } from '../utils/imageUrl';
import { sortCategories, sortProducts, PRODUCT_SORT_LABELS } from '../utils/storefront';

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });

// 🏪 Organizar a vitrine: ordem/nome/visibilidade das categorias e ordem dos produtos
function AdminStorefront({ section }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [store, setStore] = useState(null);
  const [catOrder, setCatOrder] = useState([]); // categorias na ordem mostrada (pode ter mudanças não salvas)
  const [catDirty, setCatDirty] = useState(false);
  const [names, setNames] = useState({});
  const [selectedCat, setSelectedCat] = useState(null);
  const [prodOrder, setProdOrder] = useState([]);
  const [prodDirty, setProdDirty] = useState(false);
  const [message, setMessage] = useState('');

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };
  const fail = (err, fallback) => showMessage(`❌ ${err.response?.data?.error || fallback}`);

  const load = async () => {
    try {
      const [c, p, s] = await Promise.all([
        axios.get(`${API_URL}/categories`),
        axios.get(`${API_URL}/products?all=1`),
        axios.get(`${API_URL}/settings/store/admin`, auth())
      ]);
      setCategories(c.data);
      setProducts(p.data);
      setStore(s.data);
      setNames(Object.fromEntries(c.data.map(cat => [cat.id, cat.name])));
      setSelectedCat(current => current || c.data[0]?.id || null);
    } catch (err) {
      console.error('Erro ao carregar vitrine:', err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const catMode = store?.category_sort || 'manual';

  // Recalcula a lista mostrada quando os dados (ou o modo) mudam
  useEffect(() => {
    setCatOrder(sortCategories(categories, catMode));
    setCatDirty(false);
  }, [categories, catMode]);

  const currentCat = categories.find(c => c.id === selectedCat);
  const prodMode = currentCat?.product_sort || 'az';

  useEffect(() => {
    if (!currentCat) return;
    setProdOrder(sortProducts(products.filter(p => p.category_id === currentCat.id), currentCat.product_sort || 'az'));
    setProdDirty(false);
  }, [products, currentCat]);

  // ===== CATEGORIAS =====
  const setCatMode = async (mode) => {
    try {
      const res = await axios.put(`${API_URL}/settings/store`, { ...store, category_sort: mode }, auth());
      setStore(res.data);
      showMessage(mode === 'az' ? '✅ Categorias em ordem de A a Z' : '✅ Categorias na sua ordem');
    } catch (err) {
      fail(err, 'Erro ao salvar');
    }
  };

  const moveCat = (i, step) => {
    const j = i + step;
    if (j < 0 || j >= catOrder.length) return;
    const next = [...catOrder];
    [next[i], next[j]] = [next[j], next[i]];
    setCatOrder(next);
    setCatDirty(true);
  };

  const saveCatOrder = async () => {
    try {
      await axios.put(`${API_URL}/categories/order`, { ids: catOrder.map(c => c.id) }, auth());
      showMessage('✅ Ordem das categorias salva');
      load();
    } catch (err) {
      fail(err, 'Erro ao salvar ordem');
    }
  };

  const rename = async (cat) => {
    const name = (names[cat.id] || '').trim();
    if (!name || name === cat.name) {
      setNames({ ...names, [cat.id]: cat.name });
      return;
    }
    try {
      await axios.put(`${API_URL}/categories/${cat.id}`, { name }, auth());
      showMessage('✅ Nome atualizado');
      load();
    } catch (err) {
      fail(err, 'Erro ao renomear');
    }
  };

  const updateDisplay = async (cat, data, text) => {
    try {
      await axios.put(`${API_URL}/categories/${cat.id}/display`, data, auth());
      showMessage(text);
      load();
    } catch (err) {
      fail(err, 'Erro ao salvar');
    }
  };

  // ===== PRODUTOS =====
  // Mexer na ordem de "mais vendidos" ou "A a Z" passa para o manual, partindo da ordem atual
  const moveProd = (i, step) => {
    const j = i + step;
    if (j < 0 || j >= prodOrder.length) return;
    const next = [...prodOrder];
    [next[i], next[j]] = [next[j], next[i]];
    setProdOrder(next);
    setProdDirty(true);
  };

  const saveProdOrder = async () => {
    try {
      await axios.put(`${API_URL}/products/order`, { ids: prodOrder.map(p => p.id) }, auth());
      if (prodMode !== 'manual') {
        await axios.put(`${API_URL}/categories/${currentCat.id}/display`, { product_sort: 'manual' }, auth());
      }
      showMessage('✅ Ordem dos produtos salva');
      load();
    } catch (err) {
      fail(err, 'Erro ao salvar ordem');
    }
  };

  const moveToCategory = async (product, categoryId) => {
    try {
      await axios.put(`${API_URL}/products/${product.id}/category`, { category_id: categoryId }, auth());
      const target = categories.find(c => c.id === parseInt(categoryId));
      showMessage(`✅ "${product.name}" foi para ${target?.name || 'outra categoria'}`);
      load();
    } catch (err) {
      fail(err, 'Erro ao mover produto');
    }
  };

  const countIn = (catId) => products.filter(p => p.category_id === catId).length;

  if (!store) return <div className="as-loading">Carregando...</div>;

  return (
    <div className="sf-container">
      {message && <div className={`as-message ${message.includes('✅') ? 'ok' : 'err'}`}>{message}</div>}

      {section === 'categories' && (
        <div className="admin-tabs-editor sf-wide">
          <div className="ate-head">
            <strong>📁 Categorias da vitrine</strong>
            <span>É a ordem da barra de categorias e das fileiras na tela inicial. Toque no nome para editar.</span>
          </div>

          <div className="sf-modes">
            <button className={catMode === 'manual' ? 'active' : ''} onClick={() => setCatMode('manual')}>✋ Do meu jeito</button>
            <button className={catMode === 'az' ? 'active' : ''} onClick={() => setCatMode('az')}>🔤 A a Z</button>
          </div>

          <ol className="ate-list">
            {catOrder.map((cat, i) => (
              <li key={cat.id} className={cat.active === false ? 'sf-off' : ''}>
                <span className="ate-pos">{i + 1}º</span>
                <input
                  className="sf-name"
                  value={names[cat.id] ?? cat.name}
                  onChange={(e) => setNames({ ...names, [cat.id]: e.target.value })}
                  onBlur={() => rename(cat)}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                  title="Editar nome"
                />
                <small className="sf-count">{countIn(cat.id)} prod.</small>
                <button
                  onClick={() => updateDisplay(cat, { active: cat.active === false },
                    cat.active === false ? '✅ Categoria aparece na loja' : '✅ Categoria escondida da loja')}
                  title={cat.active === false ? 'Mostrar na loja' : 'Esconder da loja'}
                >
                  {cat.active === false ? '🙈' : '👁️'}
                </button>
                {catMode === 'manual' && (
                  <>
                    <button onClick={() => moveCat(i, -1)} disabled={i === 0} title="Subir">▲</button>
                    <button onClick={() => moveCat(i, 1)} disabled={i === catOrder.length - 1} title="Descer">▼</button>
                  </>
                )}
              </li>
            ))}
          </ol>

          {catMode === 'az' && <p className="sf-hint">Em "A a Z" a ordem é automática. Para usar as setas, escolha "Do meu jeito".</p>}
          {catMode === 'manual' && (
            <div className="ate-actions">
              <button className="ate-cancel" onClick={() => { setCatOrder(sortCategories(categories, catMode)); setCatDirty(false); }} disabled={!catDirty}>Desfazer</button>
              <button className="ate-save" onClick={saveCatOrder} disabled={!catDirty}>💾 Salvar ordem</button>
            </div>
          )}
        </div>
      )}

      {section === 'products' && (
        <div className="admin-tabs-editor sf-wide">
          <div className="ate-head">
            <strong>🛍️ Produtos da vitrine</strong>
            <span>Escolha a categoria e como os produtos aparecem nela. Você pode mover um produto para outra categoria.</span>
          </div>

          <select className="as-input" value={selectedCat || ''} onChange={(e) => setSelectedCat(parseInt(e.target.value))}>
            {sortCategories(categories, catMode).map(c => (
              <option key={c.id} value={c.id}>{c.name} ({countIn(c.id)})</option>
            ))}
          </select>

          {currentCat && (
            <>
              <div className="sf-modes">
                {Object.entries(PRODUCT_SORT_LABELS).map(([mode, label]) => (
                  <button
                    key={mode}
                    className={prodMode === mode ? 'active' : ''}
                    onClick={() => updateDisplay(currentCat, { product_sort: mode }, `✅ ${currentCat.name}: ${label}`)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {prodMode !== 'manual' && (
                <p className="sf-hint">
                  {prodMode === 'bestsellers' ? 'Ordem automática pelos pedidos dos últimos 30 dias.' : 'Ordem automática pelo nome.'}
                  {' '}Se mover algum produto com as setas e salvar, a categoria passa para "Do meu jeito".
                </p>
              )}

              {prodOrder.length === 0 ? (
                <p className="sf-hint">Nenhum produto nesta categoria.</p>
              ) : (
                <ol className="ate-list">
                  {prodOrder.map((p, i) => (
                    <li key={p.id} className={p.active === false ? 'sf-off' : ''}>
                      <span className="ate-pos">{i + 1}º</span>
                      <span className="sf-thumb">
                        {p.image_url ? <img src={getImageUrl(p.image_url)} alt="" /> : '📦'}
                      </span>
                      <span className="ate-label sf-prod">
                        {p.name}
                        <small>{p.sold ? `${p.sold} pedido(s) em 30 dias` : 'sem pedidos em 30 dias'}{p.active === false ? ' · oculto' : ''}</small>
                      </span>
                      <select
                        className="sf-move"
                        value=""
                        onChange={(e) => e.target.value && moveToCategory(p, e.target.value)}
                        title="Mover para outra categoria"
                      >
                        <option value="">↪ Mover</option>
                        {categories.filter(c => c.id !== currentCat.id).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button onClick={() => moveProd(i, -1)} disabled={i === 0} title="Subir">▲</button>
                      <button onClick={() => moveProd(i, 1)} disabled={i === prodOrder.length - 1} title="Descer">▼</button>
                    </li>
                  ))}
                </ol>
              )}

              <div className="ate-actions">
                <button
                  className="ate-cancel"
                  onClick={() => { setProdOrder(sortProducts(products.filter(p => p.category_id === currentCat.id), prodMode)); setProdDirty(false); }}
                  disabled={!prodDirty}
                >
                  Desfazer
                </button>
                <button className="ate-save" onClick={saveProdOrder} disabled={!prodDirty}>💾 Salvar ordem</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminStorefront;
