// 🎟️ Cupom de desconto: confere se vale e calcula o desconto sobre os produtos (sem a taxa de entrega)

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const money = (v) => Math.round(v * 100) / 100;

// Retorna { coupon, discount } ou { error }
const applyCoupon = async (db, code, subtotal, { lock = false } = {}) => {
  const result = await db.query(
    `SELECT *, expires_at::text AS expires_text FROM coupons WHERE code = $1${lock ? ' FOR UPDATE' : ''}`,
    [normalizeCode(code)]
  );
  const coupon = result.rows[0];

  if (!coupon || !coupon.active) return { error: 'Cupom inválido' };
  if (coupon.expires_text) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' });
    if (coupon.expires_text < today) return { error: 'Cupom vencido' };
  }
  if (coupon.max_uses && coupon.uses >= coupon.max_uses) {
    return { error: 'Esse cupom já atingiu o limite de usos' };
  }
  const minOrder = parseFloat(coupon.min_order) || 0;
  if (subtotal < minOrder) {
    return { error: `Esse cupom vale para compras a partir de R$ ${minOrder.toFixed(2)}` };
  }

  const value = parseFloat(coupon.value);
  const raw = coupon.type === 'fixed' ? value : subtotal * value / 100;
  return { coupon, discount: money(Math.min(raw, subtotal)) };
};

module.exports = { normalizeCode, applyCoupon };
