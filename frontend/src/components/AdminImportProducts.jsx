import React, { useState } from 'react';
import axios from 'axios';
import readXlsxFile from 'read-excel-file';
import { API_URL } from '../config';

// Colunas aceitas (o cabeçalho pode ter acento, maiúscula ou espaço)
const COLUMNS = {
  nome: ['nome', 'produto', 'nome_do_produto'],
  preco: ['preco', 'valor', 'preco_normal'],
  unidade: ['unidade', 'un', 'medida'],
  categoria: ['categoria', 'secao', 'setor'],
  estoque: ['estoque', 'quantidade', 'qtd'],
  preco_oferta: ['preco_oferta', 'oferta', 'promocao', 'preco_promocional'],
  descricao: ['descricao', 'detalhes', 'observacao']
};

const keyOf = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const TEMPLATE = [
  'nome;preco;unidade;categoria;estoque;preco_oferta;descricao',
  'Arroz Tipo 1 5kg;29,90;un;Mercearia;20;;Pacote 5kg',
  'Queijo Mussarela;45,00;kg;Frios;8;39,90;Fatiado na hora',
  'Refrigerante Cola 2L;9,99;garrafa;Bebidas;30;;'
].join('\r\n');

// CSV simples: aceita ; ou , e campos entre aspas
const parseCsv = (text) => {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
};

// Linhas da planilha → [{ nome, preco, ... }]
const toObjects = (rows) => {
  const [header = [], ...body] = rows;
  const index = {};
  header.forEach((h, i) => {
    const k = keyOf(h);
    const field = Object.keys(COLUMNS).find(f => COLUMNS[f].includes(k));
    if (field && index[field] === undefined) index[field] = i;
  });
  if (index.nome === undefined || index.preco === undefined || index.categoria === undefined) {
    throw new Error('A planilha precisa ter as colunas: nome, preco e categoria (baixe o modelo)');
  }
  return body
    .filter(r => r.some(v => String(v ?? '').trim() !== ''))
    .map(r => Object.fromEntries(Object.entries(index).map(([f, i]) => [f, r[i] ?? ''])));
};

// 📥 Importar produtos de planilha (Excel .xlsx ou .csv). Fotos: depois, no ✏️ Editar.
function AdminImportProducts({ products, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);
  const [importing, setImporting] = useState(false);

  const existing = new Set(products.map(p => keyOf(p.name)));

  const downloadTemplate = () => {
    const blob = new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-produtos-emporio.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file) => {
    setError('');
    setDetails([]);
    setRows(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const raw = /\.xlsx$/i.test(file.name)
        ? await readXlsxFile(file)
        : parseCsv((await file.text()).replace(/^﻿/, ''));
      const data = toObjects(raw);
      if (data.length === 0) throw new Error('Nenhum produto encontrado na planilha');
      setRows(data);
    } catch (err) {
      setError(err.message || 'Não consegui ler o arquivo. Use .xlsx ou .csv');
    }
  };

  const runImport = async () => {
    setImporting(true);
    setError('');
    setDetails([]);
    try {
      const res = await axios.post(`${API_URL}/products/import`, { rows }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      const r = res.data;
      onDone(`✅ Importado: ${r.created} novo(s), ${r.updated} atualizado(s)` +
        (r.new_categories ? `, ${r.new_categories} categoria(s) nova(s)` : '') +
        '. Agora é só colocar as fotos (filtro 📷 Sem foto).');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao importar');
      setDetails(err.response?.data?.details || []);
    } finally {
      setImporting(false);
    }
  };

  const newCount = rows ? rows.filter(r => !existing.has(keyOf(r.nome))).length : 0;

  return (
    <div className="ap-overlay" onClick={() => !importing && onClose()}>
      <div className="ap-modal ap-import" onClick={(e) => e.stopPropagation()}>
        <div className="ap-modal-header">
          <h3>📥 Importar produtos por planilha</h3>
          <button className="ap-close" onClick={onClose} disabled={importing}>✕</button>
        </div>

        <div className="ap-modal-body">
          <ol className="ap-import-steps">
            <li>
              Baixe o modelo e preencha no Excel (uma linha por produto).
              <button type="button" className="ap-btn-icon" onClick={downloadTemplate}>⬇️ Baixar modelo</button>
            </li>
            <li>Colunas: <b>nome</b>, <b>preco</b>, <b>categoria</b> (obrigatórias), unidade, estoque, preco_oferta, descricao.</li>
            <li>Produto com o <b>mesmo nome</b> de um já cadastrado é <b>atualizado</b>. Categoria que não existe é criada.</li>
            <li>Salve como <b>.xlsx</b> ou <b>.csv</b> e escolha o arquivo abaixo.</li>
          </ol>

          <input
            type="file"
            accept=".xlsx,.csv"
            className="ap-input"
            onChange={(e) => readFile(e.target.files[0])}
            disabled={importing}
          />

          {error && (
            <div className="ap-message error">
              ❌ {error}
              {details.length > 0 && <ul>{details.map(d => <li key={d}>{d}</li>)}</ul>}
            </div>
          )}

          {rows && (
            <>
              <p className="ap-import-summary">
                <b>{fileName}</b>: {rows.length} produto(s) — <span className="ap-tag ap-tag-new">{newCount} novo(s)</span>
                <span className="ap-tag ap-tag-promo">{rows.length - newCount} vai(ão) atualizar</span>
              </p>
              <div className="ap-import-table">
                <table>
                  <thead>
                    <tr><th></th><th>Nome</th><th>Preço</th><th>Un.</th><th>Categoria</th><th>Estoque</th><th>Oferta</th></tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td>{existing.has(keyOf(r.nome)) ? '🔄' : '🆕'}</td>
                        <td>{String(r.nome)}</td>
                        <td>{String(r.preco)}</td>
                        <td>{String(r.unidade || 'un')}</td>
                        <td>{String(r.categoria)}</td>
                        <td>{String(r.estoque ?? '')}</td>
                        <td>{String(r.preco_oferta ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 100 && <small>... e mais {rows.length - 100} produto(s)</small>}
              </div>
            </>
          )}
        </div>

        <div className="ap-modal-footer">
          <button className="ap-btn-cancel" onClick={onClose} disabled={importing}>Cancelar</button>
          <button className="ap-btn-save" onClick={runImport} disabled={!rows || importing}>
            {importing ? '⏳ Importando...' : `📥 Importar ${rows ? rows.length : ''} produto(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminImportProducts;
