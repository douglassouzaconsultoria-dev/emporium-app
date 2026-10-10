import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const COLS = [
  { key: 'nome', label: 'Nome *', width: 240 },
  { key: 'preco', label: 'Preço *', width: 90, num: true },
  { key: 'unidade', label: 'Unidade', width: 90, list: 'grid-units' },
  { key: 'categoria', label: 'Categoria *', width: 150, list: 'grid-cats' },
  { key: 'estoque', label: 'Estoque', width: 80, num: true },
  { key: 'preco_oferta', label: 'Oferta', width: 90, num: true },
  { key: 'descricao', label: 'Descrição', width: 220 }
];

const UNITS = ['un', 'kg', 'pacote', 'caixa', 'litro', 'garrafa', 'lata', 'dúzia', 'bandeja', 'fardo'];

const blank = () => ({ id: null, nome: '', preco: '', unidade: 'un', categoria: '', estoque: '', preco_oferta: '', descricao: '' });

const money = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
const qty = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));

const isEmpty = (r) => COLS.every(c => c.key === 'unidade' || String(r[c.key] ?? '').trim() === '');

// 📝 Planilha dentro do app: edita os produtos existentes e cadastra novos linha a linha
function AdminProductsGrid({ products, categories, onClose, onDone }) {
  const catName = (id) => categories.find(c => c.id === id)?.name || '';

  const original = useMemo(() => Object.fromEntries(products.map(p => [p.id, {
    id: p.id,
    nome: p.name,
    preco: money(p.price),
    unidade: p.unit || 'un',
    categoria: catName(p.category_id),
    estoque: qty(p.estoque),
    preco_oferta: money(p.promo_price),
    descricao: p.description || ''
  }])), [products, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState(() => [
    ...Object.values(original).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    ...Array.from({ length: 10 }, blank)
  ]);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);

  const changed = (r) => (r.id
    ? COLS.some(c => String(r[c.key] ?? '').trim() !== String(original[r.id][c.key] ?? '').trim())
    : !isEmpty(r));

  const toSave = rows.filter(changed);

  const setCell = (i, key, value) => {
    setRows(list => list.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  };

  // 📋 Colar do Excel: várias linhas/colunas a partir da célula clicada
  const onPaste = (e, i, colIndex) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return; // texto simples: cola normal
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l, idx, arr) => l !== '' || idx < arr.length - 1);
    setRows(list => {
      const next = [...list];
      lines.forEach((line, li) => {
        const target = i + li;
        while (next.length <= target) next.push(blank());
        const cells = line.split('\t');
        const row = { ...next[target] };
        cells.forEach((cell, ci) => {
          const col = COLS[colIndex + ci];
          if (col) row[col.key] = cell.trim();
        });
        next[target] = row;
      });
      return next;
    });
  };

  // Enter desce para a linha de baixo (como no Excel)
  const onKeyDown = (e, i, colIndex) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = document.querySelector(`[data-cell="${i + 1}-${colIndex}"]`);
    if (next) next.focus();
    else {
      setRows(list => [...list, blank()]);
      setTimeout(() => document.querySelector(`[data-cell="${i + 1}-${colIndex}"]`)?.focus(), 0);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setDetails([]);
    try {
      const payload = rows
        .map((r, i) => ({ ...r, linha: i + 1 }))
        .filter(changed)
        .map(({ id, linha, ...r }) => ({ ...r, ...(id ? { id } : {}), linha }));
      const res = await axios.post(`${API_URL}/products/import`, { rows: payload }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      const r = res.data;
      onDone(`✅ Planilha salva: ${r.created} novo(s), ${r.updated} alterado(s)` +
        (r.new_categories ? `, ${r.new_categories} categoria(s) nova(s)` : '') + '.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar');
      setDetails(err.response?.data?.details || []);
    } finally {
      setSaving(false);
    }
  };

  const term = filter.trim().toLowerCase();

  const close = () => {
    if (saving) return;
    if (toSave.length && !window.confirm('Tem alterações sem salvar. Fechar mesmo assim?')) return;
    onClose();
  };

  return (
    <div className="ap-overlay" onClick={close}>
      <div className="ap-modal ap-grid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ap-modal-header">
          <h3>📝 Planilha de produtos</h3>
          <button className="ap-close" onClick={close} disabled={saving}>✕</button>
        </div>

        <div className="ap-grid-toolbar">
          <input
            className="ap-input"
            placeholder="🔍 Filtrar pelo nome ou categoria..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button type="button" className="ap-btn-icon" onClick={() => setRows(list => [...list, ...Array.from({ length: 10 }, blank)])}>
            ➕ 10 linhas
          </button>
        </div>
        <p className="ap-grid-help">
          Digite direto nas células. <b>Enter</b> desce, <b>Tab</b> vai para o lado. Pode <b>colar do Excel</b> (Ctrl+V) várias linhas de uma vez.
          Categoria nova é criada sozinha. As linhas alteradas ficam amarelas e as novas, verdes.
        </p>

        {error && (
          <div className="ap-message error ap-grid-error">
            ❌ {error}
            {details.length > 0 && <ul>{details.map(d => <li key={d}>{d}</li>)}</ul>}
          </div>
        )}

        <div className="ap-grid-wrap">
          <table className="ap-grid">
            <thead>
              <tr>
                <th className="ap-grid-n">#</th>
                {COLS.map(c => <th key={c.key} style={{ minWidth: c.width }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                if (term && r.id && !`${r.nome} ${r.categoria}`.toLowerCase().includes(term)) return null;
                const state = changed(r) ? (r.id ? 'edited' : 'new') : '';
                return (
                  <tr key={i} className={state}>
                    <td className="ap-grid-n">{i + 1}</td>
                    {COLS.map((c, ci) => (
                      <td key={c.key}>
                        <input
                          data-cell={`${i}-${ci}`}
                          value={r[c.key] ?? ''}
                          list={c.list}
                          inputMode={c.num ? 'decimal' : undefined}
                          onChange={(e) => setCell(i, c.key, e.target.value)}
                          onPaste={(e) => onPaste(e, i, ci)}
                          onKeyDown={(e) => onKeyDown(e, i, ci)}
                          className={c.num ? 'num' : ''}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="grid-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
          <datalist id="grid-cats">{categories.map(c => <option key={c.id} value={c.name} />)}</datalist>
        </div>

        <div className="ap-modal-footer">
          <span className="ap-grid-count">{toSave.length ? `${toSave.length} linha(s) para salvar` : 'Nenhuma alteração'}</span>
          <button className="ap-btn-cancel" onClick={close} disabled={saving}>Fechar</button>
          <button className="ap-btn-save" onClick={save} disabled={saving || toSave.length === 0}>
            {saving ? '⏳ Salvando...' : '💾 Salvar planilha'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminProductsGrid;
