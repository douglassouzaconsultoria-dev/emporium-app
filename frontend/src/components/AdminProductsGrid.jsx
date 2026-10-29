import React, { useState, useMemo, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { confirmDialog, notify } from '../utils/dialog';
import { prepareImage } from '../utils/prepareImage';
import ProductCamera from './ProductCamera';

const COLS = [
  { key: 'nome', label: 'Nome *', width: 240 },
  { key: 'preco', label: 'Preço *', width: 90, num: true },
  { key: 'unidade', label: 'Unidade', width: 90, list: 'grid-units' },
  { key: 'categoria', label: 'Categoria *', width: 150, list: 'grid-cats' },
  { key: 'subcategoria', label: 'Subcategoria', width: 140, list: 'grid-subcats' },
  { key: 'estoque', label: 'Estoque', width: 80, num: true },
  { key: 'preco_oferta', label: 'Oferta', width: 90, num: true },
  { key: 'descricao', label: 'Descrição', width: 220 },
  { key: 'codigo_barras', label: 'Código de barras', width: 140, inputMode: 'numeric' },
  { key: 'acrescimo_cartao', label: '💳 Acrésc. cartão', width: 110, num: true }
];

const UNITS = ['un', 'kg', 'pacote', 'caixa', 'litro', 'garrafa', 'lata', 'dúzia', 'bandeja', 'fardo'];

let nextUid = 1;
const blank = () => ({
  uid: nextUid++, id: null, nome: '', preco: '', unidade: 'un', categoria: '', subcategoria: '', estoque: '',
  preco_oferta: '', descricao: '', codigo_barras: '', acrescimo_cartao: '', ativo: true, foto: '', apagar: false
});

const money = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
const qty = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
// "1.234,56" / "R$ 5,99" → número (igual ao servidor); vazio = null; inválido = NaN
const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = parseFloat(String(v).replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

const isEmpty = (r) => !r.foto && COLS.every(c => c.key === 'unidade' || String(r[c.key] ?? '').trim() === '');

// ❗ Células com erro (ficam vermelhas na hora)
const errorsOf = (r) => {
  const e = new Set();
  if (r.apagar || isEmpty(r)) return e;
  const price = num(r.preco);
  const promo = num(r.preco_oferta);
  const stock = num(r.estoque);
  if (!String(r.nome).trim()) e.add('nome');
  if (!(price > 0)) e.add('preco');
  if (!String(r.categoria).trim()) e.add('categoria');
  if (Number.isNaN(stock) || stock < 0) e.add('estoque');
  if (Number.isNaN(promo) || (promo !== null && promo > 0 && price > 0 && promo >= price)) e.add('preco_oferta');
  const extra = num(r.acrescimo_cartao);
  if (Number.isNaN(extra) || extra < 0) e.add('acrescimo_cartao');
  const code = String(r.codigo_barras || '').replace(/\D/g, '');
  if (String(r.codigo_barras || '').trim() && (code.length < 6 || code.length > 14)) e.add('codigo_barras');
  return e;
};

const FILTERS = [
  ['all', 'Todos'], ['nophoto', '📷 Sem foto'], ['nocode', '🏷️ Sem código'], ['nostock', '🔴 Sem estoque'],
  ['promo', '🔥 Em oferta'], ['hidden', '🙈 Ocultos'], ['changed', '✏️ Alterados'], ['errors', '❗ Com erro']
];

const MASS = [
  ['price_pct', 'Preço: aumentar/baixar %', '% (ex: 10 ou -5)'],
  ['price_set', 'Preço: definir valor', 'R$'],
  ['promo_set', 'Oferta: definir (vazio tira)', 'R$'],
  ['card_set', '💳 Acréscimo no cartão (vazio tira)', 'R$ (ex: 1,00)'],
  ['categoria', 'Categoria', 'nome da categoria'],
  ['subcategoria', 'Subcategoria', 'nome (vazio tira)'],
  ['unidade', 'Unidade', 'un, kg...'],
  ['estoque', 'Estoque', 'quantidade'],
  ['show', 'Mostrar na loja', null],
  ['hide', 'Ocultar da loja', null],
  ['delete', 'Apagar', null]
];

const DRAFT_KEY = 'ap-grid-draft';
const readDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
};

// 🔄 Gira a foto 90°
const rotateFile = (file, degrees) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => resolve(blob ? new File([blob], 'produto.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.92);
  };
  img.src = url;
});

// 📷 Foto de uma linha: tirar/escolher, girar, ver como fica (sem fundo, 800x800) e usar
function GridPhoto({ row, onUse, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ready, setReady] = useState(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const cameraInput = useRef(null);

  useEffect(() => {
    setReady(null);
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = async (f) => f && setFile(await prepareImage(f));

  const prepare = async () => {
    try {
      setBusy(true);
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await axios.post(`${API_URL}/products/image-preview`, fd, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      setReady(data.url);
    } catch (err) {
      notify(`❌ ${err.response?.data?.error || 'Não consegui tratar a foto'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const shown = ready || preview || row.foto;
  // stopPropagation: clique aqui não pode chegar na planilha por trás (ela fecharia)
  return (
    <div onClick={(e) => e.stopPropagation()}>
    <div className="ap-overlay gp-overlay" onClick={onClose}>
      <div className="ap-modal gp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ap-modal-header">
          <h3>📷 {row.nome || 'Foto do produto'}</h3>
          <button className="ap-close" onClick={onClose}>✕</button>
        </div>
        <div className="gp-body">
          <div className={`gp-img ${ready ? 'ready' : ''}`}>{shown ? <img src={shown} alt="" /> : <span>📦</span>}</div>
          {ready && <p className="gp-ok">✅ Assim vai aparecer na loja</p>}
          <div className="gp-btns">
            <button type="button" onClick={() => setCamera(true)} disabled={busy}>📷 Tirar foto</button>
            <label>
              🖼️ Galeria
              <input type="file" accept="image/*" onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
            </label>
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
          {file && (
            <div className="gp-btns">
              <button type="button" onClick={async () => setFile(await rotateFile(file, -90))} disabled={busy}>↺ Girar</button>
              <button type="button" onClick={async () => setFile(await rotateFile(file, 90))} disabled={busy}>↻ Girar</button>
            </div>
          )}
          {file && !ready && (
            <button type="button" className="gp-prepare" onClick={prepare} disabled={busy}>
              {busy ? '⏳ Tirando o fundo...' : '✨ Ver como vai ficar'}
            </button>
          )}
          {ready && <button type="button" className="gp-use" onClick={() => onUse(ready)}>✅ Usar esta foto</button>}
          {!file && row.foto && (
            <button type="button" className="gp-remove" onClick={() => onUse('')}>🗑️ Tirar a foto do produto</button>
          )}
        </div>
      </div>
    </div>
      {camera && (
        <ProductCamera
          onCapture={(f) => { setFile(f); setCamera(false); }}
          onClose={() => setCamera(false)}
          onUnavailable={() => { setCamera(false); cameraInput.current && cameraInput.current.click(); }}
        />
      )}
    </div>
  );
}

// 📝 Planilha dentro do app: edita os produtos existentes e cadastra novos linha a linha
function AdminProductsGrid({ products, categories, onClose, onDone }) {
  const catName = (id) => categories.find(c => c.id === id)?.name || '';

  const original = useMemo(() => Object.fromEntries(products.map(p => [p.id, {
    id: p.id,
    nome: p.name,
    preco: money(p.price),
    unidade: p.unit || 'un',
    categoria: catName(p.category_id),
    subcategoria: p.subcategory || '',
    estoque: qty(p.estoque),
    preco_oferta: money(p.promo_price),
    descricao: p.description || '',
    codigo_barras: p.barcode || '',
    acrescimo_cartao: parseFloat(p.card_extra) > 0 ? money(p.card_extra) : '',
    ativo: p.active !== false,
    foto: p.image_url || '',
    apagar: false
  }])), [products, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState(() => [
    ...Object.values(original).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(r => ({ ...r, uid: nextUid++ })),
    ...Array.from({ length: 10 }, blank)
  ]);
  const [filter, setFilter] = useState('');
  const [quick, setQuick] = useState('all');
  const [sort, setSort] = useState(null); // { key, dir }
  const [selected, setSelected] = useState(() => new Set());
  const [mass, setMass] = useState({ action: 'price_pct', value: '' });
  const [active, setActive] = useState(null); // célula com o cursor: { uid, key }
  const [photoFor, setPhotoFor] = useState(null);
  const [draft, setDraft] = useState(() => readDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);
  const history = useRef([]);
  const lastPush = useRef({ at: 0, cell: null });

  const changed = (r) => (r.id
    ? r.apagar || r.ativo !== original[r.id].ativo || r.foto !== original[r.id].foto ||
      COLS.some(c => String(r[c.key] ?? '').trim() !== String(original[r.id][c.key] ?? '').trim())
    : !isEmpty(r));

  const toSave = rows.filter(changed);
  const withErrors = rows.filter(r => errorsOf(r).size > 0);

  // ↶ Desfazer: guarda a planilha antes de cada mudança (digitação na mesma célula conta como uma só)
  const commit = (updater, cell = null) => {
    setRows(list => {
      const now = Date.now();
      const sameTyping = cell && lastPush.current.cell === cell && now - lastPush.current.at < 1500;
      if (!sameTyping) history.current = [...history.current.slice(-49), list];
      lastPush.current = { at: now, cell };
      return updater(list);
    });
  };

  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      setRows(prev);
      lastPush.current = { at: 0, cell: null };
    }
  };

  const setCell = (uid, key, value) => commit(list => list.map(r => (r.uid === uid ? { ...r, [key]: value } : r)), `${uid}-${key}`);
  const setRow = (uid, patch) => commit(list => list.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  // 💾 Rascunho no aparelho (se a internet cair ou a página fechar, dá para recuperar)
  useEffect(() => {
    if (draft) return; // ainda decidindo se recupera o rascunho antigo
    const t = setTimeout(() => {
      try {
        if (toSave.length) localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), rows: toSave }));
        else localStorage.removeItem(DRAFT_KEY);
      } catch { /* sem armazenamento */ }
    }, 500);
    return () => clearTimeout(t);
  }, [rows, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aviso do navegador ao fechar/recarregar a página com alteração sem salvar
  useEffect(() => {
    if (!toSave.length) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [toSave.length]);

  // Ctrl+Z em qualquer lugar da planilha
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const restoreDraft = () => {
    commit(list => {
      const byId = new Map(draft.rows.filter(r => r.id && original[r.id]).map(r => [r.id, r]));
      const fresh = draft.rows.filter(r => !r.id).map(r => ({ ...r, uid: nextUid++ }));
      const kept = list.map(r => (r.id && byId.has(r.id) ? { ...byId.get(r.id), uid: r.uid } : r)).filter(r => r.id || !isEmpty(r));
      return [...kept, ...fresh, ...Array.from({ length: 10 }, blank)];
    });
    setDraft(null);
    notify('✅ Rascunho recuperado. Confira e salve.');
  };

  const discardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* sem armazenamento */ }
    setDraft(null);
  };

  // 🔎 Filtro de texto + filtros rápidos + ordenação
  const term = filter.trim().toLowerCase();
  const passQuick = (r) => {
    if (quick === 'all') return true;
    if (!r.id && isEmpty(r)) return false;
    if (quick === 'nophoto') return !r.foto;
    if (quick === 'nocode') return !String(r.codigo_barras).trim();
    if (quick === 'nostock') return !(num(r.estoque) > 0);
    if (quick === 'promo') return num(r.preco_oferta) > 0;
    if (quick === 'hidden') return !r.ativo;
    if (quick === 'changed') return changed(r);
    if (quick === 'errors') return errorsOf(r).size > 0;
    return true;
  };
  let visible = rows.filter(r => passQuick(r) && (!term || !r.id || `${r.nome} ${r.categoria} ${r.codigo_barras}`.toLowerCase().includes(term)));
  if (sort) {
    const col = COLS.find(c => c.key === sort.key);
    const val = (r) => (col.num ? (num(r[sort.key]) ?? -Infinity) : String(r[sort.key] || '').toLowerCase());
    const filled = visible.filter(r => !isEmpty(r)).sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp = col.num ? x - y : x.localeCompare(y, 'pt-BR');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    visible = [...filled, ...visible.filter(isEmpty)];
  }
  const toggleSort = (key) => setSort(s => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  // ☑️ Seleção
  const toggleSelect = (uid) => setSelected(s => {
    const n = new Set(s);
    if (n.has(uid)) n.delete(uid); else n.add(uid);
    return n;
  });
  const selectable = visible.filter(r => !isEmpty(r));
  const allSelected = selectable.length > 0 && selectable.every(r => selected.has(r.uid));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map(r => r.uid)));

  // ⚡ Alterar em massa as linhas marcadas
  const applyMass = async () => {
    const { action, value } = mass;
    if (action === 'delete') {
      const names = rows.filter(r => selected.has(r.uid)).map(r => r.nome || '(sem nome)');
      const ok = await confirmDialog(
        `Marcar ${names.length} produto(s) para apagar?\n${names.slice(0, 8).map(n => `• ${n}`).join('\n')}${names.length > 8 ? '\n...' : ''}\n\nSó apaga de verdade quando salvar.`,
        { okText: '🗑️ Marcar para apagar', danger: true }
      );
      if (!ok) return;
    }
    const v = String(value).trim();
    if (['price_pct', 'price_set', 'estoque', 'categoria', 'unidade'].includes(action) && !v) {
      return notify('❌ Coloque o valor', 'error');
    }
    if (['price_pct', 'price_set', 'promo_set', 'estoque'].includes(action) && v && Number.isNaN(num(v))) {
      return notify('❌ Valor inválido', 'error');
    }
    commit(list => list.map(r => {
      if (!selected.has(r.uid)) return r;
      switch (action) {
        case 'price_pct': {
          const p = num(r.preco);
          return p > 0 ? { ...r, preco: money(Math.round(p * (1 + num(v) / 100) * 100) / 100) } : r;
        }
        case 'price_set': return { ...r, preco: money(num(v)) };
        case 'promo_set': return { ...r, preco_oferta: v ? money(num(v)) : '' };
        case 'card_set': return { ...r, acrescimo_cartao: v ? money(num(v)) : '' };
        case 'estoque': return { ...r, estoque: qty(num(v)) };
        case 'categoria': case 'subcategoria': case 'unidade': return { ...r, [action]: v };
        case 'show': return { ...r, ativo: true };
        case 'hide': return { ...r, ativo: false };
        case 'delete': return r.id ? { ...r, apagar: true } : blank();
        default: return r;
      }
    }));
    notify(`✅ Aplicado em ${selected.size} linha(s). Confira e salve.`);
  };

  // ⤓ Copia a célula com o cursor para as linhas marcadas
  const fillSelected = () => {
    if (!active) return notify('ℹ️ Toque primeiro na célula que quer copiar');
    const from = rows.find(r => r.uid === active.uid);
    if (!from) return;
    commit(list => list.map(r => (selected.has(r.uid) && r.uid !== from.uid ? { ...r, [active.key]: from[active.key] } : r)));
    notify(`✅ Copiado para ${selected.size} linha(s)`);
  };

  // ⧉ Duplicar linha (variações: 1kg, 5kg...)
  const duplicate = (row) => commit(list => {
    const i = list.findIndex(r => r.uid === row.uid);
    const copy = { ...row, uid: nextUid++, id: null, nome: `${row.nome} (cópia)`, codigo_barras: '', apagar: false };
    return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
  });

  // 🗑️ Pede confirmação para não apagar por engano (desmarcar o apagar não pergunta)
  const removeRow = async (row) => {
    if (row.apagar) return setRow(row.uid, { apagar: false });
    if (!(await confirmDialog(`Apagar "${row.nome || 'esta linha'}"?${row.id ? ' Só apaga de verdade quando salvar.' : ''}`, { okText: '🗑️ Apagar', danger: true }))) return;
    if (row.id) setRow(row.uid, { apagar: true });
    else commit(list => list.filter(r => r.uid !== row.uid));
  };

  // 📋 Colar do Excel: várias linhas/colunas a partir da célula clicada
  const onPaste = (e, vi, colIndex) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return; // texto simples: cola normal
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l, idx, arr) => l !== '' || idx < arr.length - 1);
    const startUid = visible[vi].uid;
    commit(list => {
      const next = [...list];
      const start = next.findIndex(r => r.uid === startUid);
      lines.forEach((line, li) => {
        const target = start + li;
        while (next.length <= target) next.push(blank());
        const row = { ...next[target] };
        line.split('\t').forEach((cell, ci) => {
          const col = COLS[colIndex + ci];
          if (col) row[col.key] = cell.trim();
        });
        next[target] = row;
      });
      return next;
    });
  };

  // Enter desce (como no Excel); Ctrl+D copia o valor da linha de cima
  const onKeyDown = (e, vi, colIndex, row) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const above = visible[vi - 1];
      if (above) setCell(row.uid, COLS[colIndex].key, above[COLS[colIndex].key]);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = document.querySelector(`[data-cell="${vi + 1}-${colIndex}"]`);
    if (next) next.focus();
    else if (!term && quick === 'all') {
      commit(list => [...list, blank()]);
      setTimeout(() => document.querySelector(`[data-cell="${vi + 1}-${colIndex}"]`)?.focus(), 0);
    }
  };

  // ⬇️ Baixar a planilha inteira (CSV que abre no Excel; dá para colar de volta aqui), ignora os filtros
  const download = () => {
    const esc = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    const header = 'nome;preco;unidade;categoria;subcategoria;estoque;preco_oferta;descricao;codigo_barras;acrescimo_cartao';
    const lines = rows.filter(r => !isEmpty(r) && !r.apagar).map(r => COLS.map(c => esc(r[c.key])).join(';'));
    const blob = new Blob(['﻿' + [header, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `produtos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const save = async () => {
    if (withErrors.length) {
      setQuick('errors');
      return setError(`Corrija as ${withErrors.length} linha(s) com célula vermelha antes de salvar`);
    }
    const toDelete = rows.filter(r => r.id && r.apagar);
    if (toDelete.length && !(await confirmDialog(
      `Apagar ${toDelete.length} produto(s)? Não dá para desfazer.\n${toDelete.slice(0, 5).map(r => `• ${r.nome}`).join('\n')}`,
      { okText: '🗑️ Apagar e salvar', danger: true }
    ))) return;
    setSaving(true);
    setError('');
    setDetails([]);
    const auth = { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } };
    try {
      const payload = rows
        .map((r, i) => ({ ...r, linha: i + 1 }))
        .filter(r => changed(r) && !r.apagar)
        .map(({ id, linha, uid, apagar, foto, ativo, ...r }) => {
          const o = id ? original[id] : null;
          return {
            ...r,
            ...(id ? { id } : {}),
            linha,
            ...(!o || o.ativo !== ativo ? { ativo } : {}),
            ...((!o && foto) || (o && o.foto !== foto) ? { foto } : {})
          };
        });
      let created = 0;
      let updated = 0;
      let newCategories = 0;
      if (payload.length) {
        const res = await axios.post(`${API_URL}/products/import`, { rows: payload }, auth);
        ({ created, updated, new_categories: newCategories } = res.data);
      }
      let deleted = 0;
      const hidden = [];
      for (const r of toDelete) {
        try {
          await axios.delete(`${API_URL}/products/${r.id}`, auth);
          deleted++;
        } catch (err) {
          if (!err.response?.data?.has_orders) throw err;
          // Já tem pedidos: não dá para apagar, então some da loja
          await axios.put(`${API_URL}/products/${r.id}/active`, { active: false }, auth);
          hidden.push(r.nome);
        }
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* sem armazenamento */ }
      onDone(`✅ Planilha salva: ${created} novo(s), ${updated} alterado(s)` +
        (deleted ? `, ${deleted} apagado(s)` : '') +
        (hidden.length ? `. ${hidden.join(', ')} já tem pedidos: foi ocultado da loja em vez de apagado` : '') +
        (newCategories ? `, ${newCategories} categoria(s) nova(s)` : '') + '.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar');
      setDetails(err.response?.data?.details || []);
    } finally {
      setSaving(false);
    }
  };

  const close = async () => {
    if (saving) return;
    if (toSave.length && !(await confirmDialog('Tem alterações sem salvar. Fechar mesmo assim? (fica um rascunho guardado neste aparelho)', { okText: 'Fechar sem salvar', danger: true }))) return;
    onClose();
  };

  const massDef = MASS.find(m => m[0] === mass.action);
  const position = new Map(rows.map((r, i) => [r.uid, i + 1]));

  return (
    <div className="ap-overlay" onClick={close}>
      <div className="ap-modal ap-grid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ap-modal-header">
          <h3>📝 Planilha de produtos</h3>
          <button className="ap-close" onClick={close} disabled={saving}>✕</button>
        </div>

        {draft && draft.rows?.length > 0 && (
          <div className="ap-grid-draft">
            💾 Tem um rascunho de {new Date(draft.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} com {draft.rows.length} linha(s) não salvas.
            <button type="button" onClick={restoreDraft}>Recuperar</button>
            <button type="button" className="ghost" onClick={discardDraft}>Descartar</button>
          </div>
        )}

        <div className="ap-grid-toolbar">
          <input
            className="ap-input"
            placeholder="🔍 Filtrar pelo nome, categoria ou código..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button type="button" className="ap-btn-icon" onClick={undo} disabled={!history.current.length} title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
          <button type="button" className="ap-btn-icon" onClick={download} title="Baixar para abrir no Excel">⬇️ Baixar</button>
          <button type="button" className="ap-btn-icon" onClick={() => commit(list => [...list, ...Array.from({ length: 10 }, blank)])}>
            ➕ 10 linhas
          </button>
        </div>

        <div className="ap-grid-chips">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={quick === key ? 'active' : ''} onClick={() => setQuick(key)}>
              {label}{key === 'errors' && withErrors.length ? ` (${withErrors.length})` : ''}{key === 'changed' && toSave.length ? ` (${toSave.length})` : ''}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="ap-grid-mass">
            <strong>{selected.size} marcada(s):</strong>
            <select value={mass.action} onChange={(e) => setMass({ action: e.target.value, value: '' })}>
              {MASS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            {massDef[2] && (
              <input
                value={mass.value}
                placeholder={massDef[2]}
                list={mass.action === 'categoria' ? 'grid-cats' : mass.action === 'subcategoria' ? 'grid-subcats' : mass.action === 'unidade' ? 'grid-units' : undefined}
                inputMode={['price_pct', 'price_set', 'promo_set', 'estoque'].includes(mass.action) ? 'decimal' : undefined}
                onChange={(e) => setMass(m => ({ ...m, value: e.target.value }))}
              />
            )}
            <button type="button" className="apply" onClick={applyMass}>Aplicar</button>
            <button type="button" onClick={fillSelected} title="Copia a célula com o cursor para as linhas marcadas">⤓ Copiar célula</button>
            <button type="button" className="ghost" onClick={() => setSelected(new Set())}>Desmarcar</button>
          </div>
        )}

        <p className="ap-grid-help">
          <b>Enter</b> desce, <b>Tab</b> vai para o lado, <b>Ctrl+D</b> copia o de cima, <b>Ctrl+Z</b> desfaz. Pode <b>colar do Excel</b>.
          Toque no título para ordenar. Marque linhas para alterar várias de uma vez.
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
                <th className="ap-grid-sel sticky-0"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Marcar todas" /></th>
                <th className="ap-grid-n sticky-1">#</th>
                {COLS.map((c, ci) => (
                  <th
                    key={c.key}
                    style={{ minWidth: c.width }}
                    className={`sortable ${ci === 0 ? 'sticky-2' : ''}`}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th className="ap-grid-photo">Foto</th>
                <th className="ap-grid-flag">Na loja</th>
                <th className="ap-grid-actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r, vi) => {
                const errs = errorsOf(r);
                const state = r.apagar ? 'deleted' : changed(r) ? (r.id ? 'edited' : 'new') : '';
                const filled = !isEmpty(r);
                return (
                  <tr key={r.uid} className={state}>
                    <td className="ap-grid-sel sticky-0">
                      {filled && <input type="checkbox" checked={selected.has(r.uid)} onChange={() => toggleSelect(r.uid)} aria-label="Marcar" />}
                    </td>
                    <td className="ap-grid-n sticky-1">{position.get(r.uid)}</td>
                    {COLS.map((c, ci) => (
                      <td key={c.key} className={`${ci === 0 ? 'sticky-2' : ''} ${errs.has(c.key) ? 'bad' : ''}`}>
                        <input
                          data-cell={`${vi}-${ci}`}
                          value={r[c.key] ?? ''}
                          list={c.list}
                          inputMode={c.inputMode || (c.num ? 'decimal' : undefined)}
                          disabled={r.apagar}
                          onFocus={() => setActive({ uid: r.uid, key: c.key })}
                          onChange={(e) => setCell(r.uid, c.key, e.target.value)}
                          onPaste={(e) => onPaste(e, vi, ci)}
                          onKeyDown={(e) => onKeyDown(e, vi, ci, r)}
                          className={c.num ? 'num' : ''}
                        />
                      </td>
                    ))}
                    <td className="ap-grid-photo">
                      {filled && (
                        <button type="button" onClick={() => setPhotoFor(r.uid)} disabled={r.apagar} title="Foto">
                          {r.foto ? <img src={r.foto} alt="" /> : '📷'}
                        </button>
                      )}
                    </td>
                    <td className="ap-grid-flag">
                      {filled && <input type="checkbox" checked={r.ativo} disabled={r.apagar} onChange={() => setRow(r.uid, { ativo: !r.ativo })} aria-label="Mostrar na loja" />}
                    </td>
                    <td className="ap-grid-actions">
                      {filled && (
                        <>
                          <button type="button" onClick={() => duplicate(r)} title="Duplicar linha" disabled={r.apagar}>⧉</button>
                          <button type="button" onClick={() => removeRow(r)} title={r.apagar ? 'Não apagar' : 'Apagar'} className={r.apagar ? 'undo' : 'del'}>
                            {r.apagar ? '↩' : '🗑️'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="grid-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
          <datalist id="grid-cats">{categories.map(c => <option key={c.id} value={c.name} />)}</datalist>
          <datalist id="grid-subcats">
            {[...new Set(products.map(p => p.subcategory).filter(Boolean))].sort().map(s => <option key={s} value={s} />)}
          </datalist>
        </div>

        <div className="ap-modal-footer">
          <span className="ap-grid-count">
            {toSave.length ? `${toSave.length} linha(s) para salvar` : 'Nenhuma alteração'}
            {withErrors.length > 0 && <b className="ap-grid-bad"> · {withErrors.length} com erro</b>}
          </span>
          <button className="ap-btn-cancel" onClick={close} disabled={saving}>Fechar</button>
          <button className="ap-btn-save" onClick={save} disabled={saving || toSave.length === 0}>
            {saving ? '⏳ Salvando...' : '💾 Salvar planilha'}
          </button>
        </div>
      </div>

      {photoFor && (
        <GridPhoto
          row={rows.find(r => r.uid === photoFor)}
          onClose={() => setPhotoFor(null)}
          onUse={(url) => { setRow(photoFor, { foto: url }); setPhotoFor(null); }}
        />
      )}
    </div>
  );
}

export default AdminProductsGrid;
