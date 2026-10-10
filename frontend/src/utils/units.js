// ⚖️ Produto vendido por peso: unidade "kg" (ou "quilo"/"kilo")
export const isKg = (unit) => ['kg', 'quilo', 'kilo'].includes((unit || '').trim().toLowerCase());

// "250 g", "1,5 kg" para peso; "2x" para unidade
export const formatQty = (quantity, unit) => {
  const qty = parseFloat(quantity);
  if (!isKg(unit)) return `${qty}x`;
  if (qty < 1) return `${Math.round(qty * 1000)} g`;
  return `${qty.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;
};

// Arredonda para 3 casas (gramas) e evita 0.30000000000000004
export const roundQty = (qty) => Math.round(qty * 1000) / 1000;

// 🔥 Preço que vale: o de oferta, quando é menor que o normal (igual ao servidor)
export const effectivePrice = (p) => {
  const promo = parseFloat(p.promo_price);
  const price = parseFloat(p.price);
  return promo > 0 && promo < price ? promo : price;
};

export const isPromo = (p) => effectivePrice(p) < parseFloat(p.price);

// Valor do item arredondado ao centavo (igual ao cálculo do servidor)
export const lineTotal = (item) => Math.round(effectivePrice(item) * item.quantity * 100) / 100;

// "3 un" para unidade; "250 g" / "1,5 kg" para peso
export const qtyText = (q, unit) => (isKg(unit)
  ? formatQty(q, unit)
  : `${Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un`);
