// 🇧🇷 Formatação para o padrão brasileiro
export const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const int = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export const pct = (v, digits = 1) => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;

// "2026-10-09" → "09/10/2026" (sem passar por Date, para não mudar o dia pelo fuso)
export const dateBR = (iso) => {
  const [y, m, d] = (iso || '').slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : '';
};

export const shortDateBR = (iso) => dateBR(iso).slice(0, 5);

// Data local do navegador em "AAAA-MM-DD"
export const isoLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Variação contra o período anterior. invert = quando subir é ruim (ex: cancelamentos)
export const delta = (cur, prev, { invert = false } = {}) => {
  if (!prev) {
    return cur ? { text: 'sem base de comparação', tone: 'flat' } : { text: 'sem variação', tone: 'flat' };
  }
  const change = ((cur - prev) / prev) * 100;
  if (Math.abs(change) < 0.05) return { text: '0% vs. anterior', tone: 'flat' };
  const up = change > 0;
  const good = invert ? !up : up;
  return {
    text: `${up ? '▲' : '▼'} ${pct(Math.abs(change))} vs. anterior`,
    tone: good ? 'good' : 'bad'
  };
};
