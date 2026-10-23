import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { confirmDialog, notify } from '../utils/dialog';
import { brl } from '../utils/format';
import './AdminSchedules.css';

// 🗓️ Programação: escolhe produtos e coloca numa regra
// 🔥 Oferta programada (preço que começa e termina sozinho) ou 🕒 Disponível só em certos dias/horários
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const DAYS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];
const STATUS = {
  on: ['✅ Valendo agora', 'on'],
  off: ['⏳ Fora do horário', 'off'],
  scheduled: ['📅 Agendada', 'off'],
  ended: ['⌛ Encerrada', 'ended'],
  paused: ['⏸ Pausada', 'ended']
};
const empty = { kind: 'promo', promo_price: '', weekdays: [], time_from: '', time_to: '', start_at: '', end_at: '' };

function AdminSchedules() {
  const [rules, setRules] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(empty);
  const [picked, setPicked] = useState([]);
  const [term, setTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => axios.get(`${API_URL}/schedules`, auth()).then(res => setRules(res.data)).catch(() => setRules([]));

  useEffect(() => {
    load();
    axios.get(`${API_URL}/products?all=1`).then(res => setProducts(res.data)).catch(() => setProducts([]));
  }, []);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const toggleDay = (d) => set('weekdays', form.weekdays.includes(d) ? form.weekdays.filter(x => x !== d) : [...form.weekdays, d]);

  const q = term.trim().toLowerCase();
  const matches = q.length < 2 ? [] : products
    .filter(p => !picked.some(x => x.id === p.id))
    .filter(p => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q))
    .slice(0, 8);

  const save = async () => {
    setError('');
    if (!picked.length) return setError('Escolha pelo menos um produto');
    try {
      setSaving(true);
      const { data } = await axios.post(`${API_URL}/schedules`, { ...form, product_ids: picked.map(p => p.id) }, auth());
      notify(`✅ Programação salva para ${data.created} produto(s)`);
      setForm(empty);
      setPicked([]);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule) => {
    await axios.put(`${API_URL}/schedules/${rule.id}/active`, { active: !rule.active }, auth()).catch(() => notify('❌ Erro ao atualizar', 'error'));
    load();
  };

  const remove = async (rule) => {
    if (!(await confirmDialog(`Apagar a programação de "${rule.product_name}"?`, { okText: '🗑️ Apagar', danger: true }))) return;
    await axios.delete(`${API_URL}/schedules/${rule.id}`, auth()).catch(() => notify('❌ Erro ao apagar', 'error'));
    load();
  };

  const oneProductPrice = picked.length === 1 ? parseFloat(picked[0].price) : null;

  return (
    <div className="sch">
      <h2>🗓️ Programação</h2>
      <p className="sch-help">
        Escolha produtos e coloque numa regra: a <b>oferta</b> começa e termina sozinha, ou o produto só fica
        <b> disponível</b> em certos dias e horários (fora disso aparece na loja com o horário, sem dar para pedir).
      </p>

      <section className="sch-card">
        <h3>➕ Nova programação</h3>

        <div className="sch-kind">
          <button type="button" className={form.kind === 'promo' ? 'active' : ''} onClick={() => set('kind', 'promo')}>🔥 Oferta programada</button>
          <button type="button" className={form.kind === 'available' ? 'active' : ''} onClick={() => set('kind', 'available')}>🕒 Disponível só em...</button>
        </div>

        <label className="sch-label">Produtos</label>
        <div className="sch-picked">
          {picked.map(p => (
            <span key={p.id}>
              {p.name}
              <button type="button" onClick={() => setPicked(list => list.filter(x => x.id !== p.id))} aria-label="Tirar">✕</button>
            </span>
          ))}
        </div>
        <div className="sch-search">
          <input type="search" placeholder="🔎 Digite o nome ou o código de barras" value={term} onChange={(e) => setTerm(e.target.value)} />
          {matches.length > 0 && (
            <ul>
              {matches.map(p => (
                <li key={p.id}>
                  <button type="button" onClick={() => { setPicked(list => [...list, p]); setTerm(''); }}>
                    {p.name} <small>{brl(p.price)}{p.unit === 'kg' ? '/kg' : ''}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {form.kind === 'promo' && (
          <>
            <label className="sch-label">Preço da oferta (R$)</label>
            <input className="sch-input" inputMode="decimal" placeholder="0,00" value={form.promo_price} onChange={(e) => set('promo_price', e.target.value)} />
            {oneProductPrice && <small className="sch-note">Preço normal: {brl(oneProductPrice)}</small>}
          </>
        )}

        <label className="sch-label">Dias da semana <small>(nenhum marcado = todo dia)</small></label>
        <div className="sch-days">
          {DAYS.map(([d, name]) => (
            <button key={d} type="button" className={form.weekdays.includes(d) ? 'active' : ''} onClick={() => toggleDay(d)}>{name}</button>
          ))}
        </div>
        <div className="sch-shortcuts">
          <button type="button" onClick={() => set('weekdays', [1, 2, 3, 4, 5])}>Seg a Sex</button>
          <button type="button" onClick={() => set('weekdays', [6, 0])}>Fim de semana</button>
          <button type="button" onClick={() => set('weekdays', [])}>Todo dia</button>
        </div>

        <label className="sch-label">Horário <small>(opcional)</small></label>
        <div className="sch-row">
          <label>das <input type="time" value={form.time_from} onChange={(e) => set('time_from', e.target.value)} /></label>
          <label>até <input type="time" value={form.time_to} onChange={(e) => set('time_to', e.target.value)} /></label>
        </div>

        <label className="sch-label">Período <small>(opcional: começa e termina sozinha)</small></label>
        <div className="sch-row">
          <label>começa <input type="datetime-local" value={form.start_at} onChange={(e) => set('start_at', e.target.value)} /></label>
          <label>termina <input type="datetime-local" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} /></label>
        </div>

        {error && <div className="sch-error">❌ {error}</div>}
        <button type="button" className="sch-save" onClick={save} disabled={saving}>
          {saving ? '⏳ Salvando...' : '💾 Salvar programação'}
        </button>
      </section>

      <h3 className="sch-list-title">Programações ({rules.length})</h3>
      {rules.length === 0 && <p className="sch-empty">Nenhuma programação ainda.</p>}
      <div className="sch-list">
        {rules.map(r => {
          const [statusText, statusCls] = STATUS[r.status] || STATUS.off;
          return (
            <div key={r.id} className={`sch-item ${statusCls}`}>
              <div className="sch-item-main">
                <strong>{r.product_name}</strong>
                <span>
                  {r.kind === 'promo'
                    ? <>🔥 Oferta <b>{brl(r.promo_price)}</b> <s>{brl(r.price)}</s></>
                    : <>🕒 Disponível</>}
                  {' · '}{r.label}
                </span>
                <em className={`sch-status ${statusCls}`}>{statusText}</em>
              </div>
              <div className="sch-item-actions">
                <button type="button" onClick={() => toggleActive(r)}>{r.active ? '⏸ Pausar' : '▶️ Voltar'}</button>
                <button type="button" className="danger" onClick={() => remove(r)}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdminSchedules;
