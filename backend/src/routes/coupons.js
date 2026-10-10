const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { normalizeCode, applyCoupon } = require('../utils/coupons');

const parseMoney = (value) => {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

// Lê e confere o corpo do cupom (criar/editar)
const readCoupon = (body) => {
  const code = normalizeCode(body.code);
  const type = body.type === 'fixed' ? 'fixed' : 'percent';
  const value = parseMoney(body.value);
  const minOrder = parseMoney(body.min_order) || 0;
  const maxUses = body.max_uses ? parseInt(body.max_uses) : null;
  const expiresAt = body.expires_at || null;

  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    return { error: 'Código: 3 a 30 letras/números, sem espaço' };
  }
  if (!value || value <= 0) return { error: 'Informe o valor do desconto' };
  if (type === 'percent' && value > 100) return { error: 'Porcentagem máxima é 100%' };
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    return { error: 'Limite de usos inválido' };
  }
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return { error: 'Data de validade inválida' };

  return { code, type, value, min_order: minOrder, max_uses: maxUses, expires_at: expiresAt, active: body.active !== false };
};

// 👤 POST - cliente confere o cupom no checkout (o desconto de verdade é calculado no pedido)
router.post('/validate', verifyToken, async (req, res) => {
  try {
    const subtotal = parseFloat(req.body.subtotal) || 0;
    const result = await applyCoupon(pool, req.body.code, subtotal);
    if (result.error) return res.status(400).json({ error: result.error });
    const { coupon, discount } = result;
    res.json({ code: coupon.code, type: coupon.type, value: parseFloat(coupon.value), discount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao conferir cupom' });
  }
});

// 🔒 GET - lista de cupons
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT *, expires_at::text AS expires_at FROM coupons ORDER BY active DESC, created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cupons' });
  }
});

// 🔒 POST - novo cupom
router.post('/', verifyAdmin, async (req, res) => {
  const c = readCoupon(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  try {
    const result = await pool.query(
      `INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [c.code, c.type, c.value, c.min_order, c.max_uses, c.expires_at, c.active]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Já existe um cupom com esse código' });
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cupom' });
  }
});

// 🔒 PUT - editar cupom
router.put('/:id', verifyAdmin, async (req, res) => {
  const c = readCoupon(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  try {
    const result = await pool.query(
      `UPDATE coupons SET code = $1, type = $2, value = $3, min_order = $4, max_uses = $5, expires_at = $6, active = $7
       WHERE id = $8 RETURNING *`,
      [c.code, c.type, c.value, c.min_order, c.max_uses, c.expires_at, c.active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cupom não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Já existe um cupom com esse código' });
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar cupom' });
  }
});

// 🔒 DELETE - remover cupom (pedidos antigos guardam o código, não dependem dele)
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM coupons WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cupom não encontrado' });
    res.json({ message: 'Cupom removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover cupom' });
  }
});

module.exports = router;
