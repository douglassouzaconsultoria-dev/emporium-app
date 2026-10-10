// 🏪 Ordem da vitrine (a mesma regra na loja e na tela "Organizar" do admin)

const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });

// Posição salva primeiro; sem posição vai para o fim (em ordem alfabética)
const bySortOrder = (a, b) => {
  const pa = a.sort_order ?? Infinity;
  const pb = b.sort_order ?? Infinity;
  return pa !== pb ? pa - pb : byName(a, b);
};

// mode: 'manual' (ordem do admin) | 'az'
export const sortCategories = (categories, mode) =>
  [...categories].sort(mode === 'az' ? byName : (a, b) => {
    const pa = a.sort_order ?? Infinity;
    const pb = b.sort_order ?? Infinity;
    return pa !== pb ? pa - pb : a.id - b.id;
  });

// mode: 'bestsellers' (mais pedidos nos últimos 30 dias) | 'az' | 'manual'
export const sortProducts = (products, mode) => {
  if (mode === 'manual') return [...products].sort(bySortOrder);
  if (mode === 'bestsellers') return [...products].sort((a, b) => (b.sold || 0) - (a.sold || 0) || byName(a, b));
  return [...products].sort(byName);
};

export const PRODUCT_SORT_LABELS = {
  bestsellers: '🔥 Mais vendidos primeiro',
  az: '🔤 A a Z',
  manual: '✋ Do meu jeito (manual)'
};
