import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { getImageUrl } from '../utils/imageUrl';
import { sortCategories } from '../utils/storefront';

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const NONE = '__sem__';

const savedOrder = (cat) => {
  try {
    return JSON.parse(cat?.subcategory_order || '[]');
  } catch {
    return [];
  }
};

// 🏷️ Quadro de subcategorias: arrastar os produtos entre as colunas
function AdminSubcategoryBoard({ categorySort }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [catId, setCatId] = useState(null);
  const [columns, setColumns] = useState([]); // nomes das subcategorias, na ordem das abinhas
  const [names, setNames] = useState({});     // edição do nome de cada coluna
  const [newName, setNewName] = useState('');
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [message, setMessage] = useState('');

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };
  const fail = (err, fallback) => showMessage(`❌ ${err.response?.data?.error || fallback}`);

  const load = async () => {
    try {
      const [c, p] = await Promise.all([axios.get(`${API_URL}/categories`), axios.get(`${API_URL}/products?all=1`)]);
      setCategories(c.data);
      setProducts(p.data);
      setCatId(current => current || c.data[0]?.id || null);
    } catch (err) {
      console.error('Erro ao carregar subcategorias:', err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const category = categories.find(c => c.id === catId);
  const catProducts = products.filter(p => p.category_id === catId);

  // Colunas: ordem salva (inclusive as vazias) + as que só existem nos produtos
  useEffect(() => {
    if (!category) return;
    const saved = savedOrder(category);
    const present = [...new Set(catProducts.map(p => p.subcategory).filter(Boolean))];
    const cols = [...saved, ...present.filter(s => !saved.includes(s))];
    setColumns(cols);
    setNames(Object.fromEntries(cols.map(c => [c, c])));
  }, [catId, categories, products]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveOrder = async (cols) => {
    setColumns(cols);
    try {
      await axios.put(`${API_URL}/categories/${catId}/display`, { subcategory_order: cols }, auth());
      setCategories(list => list.map(c => (c.id === catId ? { ...c, subcategory_order: JSON.stringify(cols) } : c)));
    } catch (err) {
      fail(err, 'Erro ao salvar a ordem');
    }
  };

  const moveProduct = async (productId, sub) => {
    const product = products.find(p => p.id === productId);
    const target = sub === NONE ? null : sub;
    if (!product || (product.subcategory || null) === target) return;
    setProducts(list => list.map(p => (p.id === productId ? { ...p, subcategory: target } : p))); // já mostra na coluna nova
    try {
      await axios.put(`${API_URL}/products/${productId}/subcategory`, { subcategory: target || '' }, auth());
    } catch (err) {
      fail(err, 'Erro ao mover produto');
      load();
    }
  };

  const addColumn = () => {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (columns.some(c => c.toLowerCase() === name.toLowerCase())) {
      showMessage('❌ Essa subcategoria já existe');
      return;
    }
    setNewName('');
    saveOrder([...columns, name]);
    showMessage(`✅ "${name}" criada. Arraste os produtos para ela.`);
  };

  const rename = async (col) => {
    const to = (names[col] || '').trim().replace(/\s+/g, ' ');
    if (!to || to === col) {
      setNames({ ...names, [col]: col });
      return;
    }
    if (columns.some(c => c !== col && c.toLowerCase() === to.toLowerCase())) {
      showMessage('❌ Já existe uma subcategoria com esse nome');
      setNames({ ...names, [col]: col });
      return;
    }
    try {
      await axios.post(`${API_URL}/products/subcategories/rename`, { category_id: catId, from: col, to }, auth());
      setProducts(list => list.map(p => (p.category_id === catId && p.subcategory === col ? { ...p, subcategory: to } : p)));
      await saveOrder(columns.map(c => (c === col ? to : c)));
      showMessage('✅ Nome atualizado');
    } catch (err) {
      fail(err, 'Erro ao renomear');
    }
  };

  const remove = async (col) => {
    const count = catProducts.filter(p => p.subcategory === col).length;
    if (count && !window.confirm(`Apagar "${col}"? Os ${count} produto(s) dela voltam para "Sem subcategoria".`)) return;
    try {
      if (count) await axios.post(`${API_URL}/products/subcategories/rename`, { category_id: catId, from: col, to: '' }, auth());
      setProducts(list => list.map(p => (p.category_id === catId && p.subcategory === col ? { ...p, subcategory: null } : p)));
      await saveOrder(columns.filter(c => c !== col));
      showMessage(`✅ "${col}" apagada`);
    } catch (err) {
      fail(err, 'Erro ao apagar');
    }
  };

  const moveColumn = (i, step) => {
    const j = i + step;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  };

  const dropProps = (col) => ({
    onDragOver: (e) => { e.preventDefault(); setOver(col); },
    onDragLeave: () => setOver(o => (o === col ? null : o)),
    onDrop: (e) => {
      e.preventDefault();
      setOver(null);
      const id = parseInt(e.dataTransfer.getData('text/plain'));
      if (id) moveProduct(id, col);
    }
  });

  const card = (p) => (
    <div
      key={p.id}
      className={`sb-card ${dragId === p.id ? 'dragging' : ''} ${p.active === false ? 'off' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(p.id)); setDragId(p.id); }}
      onDragEnd={() => { setDragId(null); setOver(null); }}
      title="Arraste para outra subcategoria"
    >
      <span className="sb-thumb">{p.image_url ? <img src={getImageUrl(p.image_url)} alt="" /> : '📦'}</span>
      <span className="sb-name">{p.name}</span>
      <select
        className="sb-move"
        value=""
        onChange={(e) => e.target.value && moveProduct(p.id, e.target.value)}
        title="Mover para…"
      >
        <option value="">↪</option>
        <option value={NONE}>Sem subcategoria</option>
        {columns.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );

  return (
    <div className="sb-container">
      {message && <div className={`as-message ${message.includes('✅') ? 'ok' : 'err'}`}>{message}</div>}

      <div className="sb-head">
        <div>
          <strong>🏷️ Subcategorias da vitrine</strong>
          <span>Arraste os produtos para dentro das subcategorias. Elas viram abinhas na loja, nesta ordem (◀ ▶).</span>
        </div>
        <select className="as-input sb-cat" value={catId || ''} onChange={(e) => setCatId(parseInt(e.target.value))}>
          {sortCategories(categories, categorySort).map(c => (
            <option key={c.id} value={c.id}>{c.name} ({products.filter(p => p.category_id === c.id).length})</option>
          ))}
        </select>
      </div>

      <div className="sb-new">
        <input
          className="as-input"
          placeholder="Nova subcategoria (ex: Refrigerantes)"
          maxLength={60}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addColumn()}
        />
        <button className="ate-save" onClick={addColumn} disabled={!newName.trim()}>+ Criar</button>
      </div>

      <div className="sb-board">
        <div className={`sb-col sb-col-none ${over === NONE ? 'over' : ''}`} {...dropProps(NONE)}>
          <div className="sb-col-head">
            <strong>Sem subcategoria</strong>
            <small>{catProducts.filter(p => !p.subcategory).length}</small>
          </div>
          <div className="sb-list">
            {catProducts.filter(p => !p.subcategory).map(card)}
            {!catProducts.some(p => !p.subcategory) && <p className="sb-empty">Todos os produtos já têm subcategoria 👏</p>}
          </div>
        </div>

        {columns.map((col, i) => {
          const items = catProducts.filter(p => p.subcategory === col);
          return (
            <div key={col} className={`sb-col ${over === col ? 'over' : ''}`} {...dropProps(col)}>
              <div className="sb-col-head">
                <input
                  className="sb-col-name"
                  value={names[col] ?? col}
                  onChange={(e) => setNames({ ...names, [col]: e.target.value })}
                  onBlur={() => rename(col)}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                  title="Clique para renomear"
                />
                <small>{items.length}</small>
              </div>
              <div className="sb-col-tools">
                <button onClick={() => moveColumn(i, -1)} disabled={i === 0} title="Mais para a esquerda na loja">◀</button>
                <button onClick={() => moveColumn(i, 1)} disabled={i === columns.length - 1} title="Mais para a direita na loja">▶</button>
                <button onClick={() => remove(col)} title="Apagar subcategoria">🗑️</button>
              </div>
              <div className="sb-list">
                {items.map(card)}
                {items.length === 0 && <p className="sb-empty">Arraste produtos para cá</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdminSubcategoryBoard;
