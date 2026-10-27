// 🔎 Busca do jeito que o cliente escreve: sem acento, sem maiúscula, singular ou plural
// "acucar" acha "Açúcar" · "feijoes" acha "Feijão" · "tomates" acha "Tomate" · "paes" acha "Pão"

export const normalizeText = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Plural → singular (português, o suficiente para nome de produto)
const singular = (w) => {
  if (w.length <= 3) return w;
  if (/(oes|aes)$/.test(w)) return w.slice(0, -3) + 'ao'; // limoes → limao, paes → pao
  if (/eis$/.test(w)) return w.slice(0, -3) + 'el'; // pasteis → pastel, papeis → papel
  if (/ns$/.test(w)) return w.slice(0, -2) + 'm'; // bombons → bombom
  if (/(r|z)es$/.test(w)) return w.slice(0, -2); // flores → flor, arrozes → arroz
  if (/s$/.test(w)) return w.slice(0, -1); // tomates → tomate
  return w;
};

// Todas as palavras digitadas precisam aparecer (em qualquer ordem) no nome, descrição, categoria...
export const matchesSearch = (term, ...fields) => {
  const words = normalizeText(term).split(' ').filter(Boolean).map(singular);
  if (!words.length) return true;
  const text = ` ${normalizeText(fields.join(' '))} `;
  return words.every(w => text.includes(w));
};
