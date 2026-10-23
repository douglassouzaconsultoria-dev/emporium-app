const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');
const { nowBR, ruleActive, describe } = require('../utils/schedules');

// 🗓️ Programação de produtos (só admin): oferta programada e "disponível só em..."
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const status = (rule, now) => {
  if (!rule.active) return 'paused';
  if (rule.end_at && now.stamp >= rule.end_at) return 'ended';
  if (rule.start_at && now.stamp < rule.start_at) return 'scheduled';
  return ruleActive(rule, now) ? 'on' : 'off';
};

router.get('/', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, p.name AS product_name, p.price, p.unit, p.image_url
       FROM product_schedules s JOIN products p ON p.id = s.product_id
       ORDER BY p.name, s.id`
    );
    const now = nowBR();
    res.json(rows.map(r => ({ ...r, label: describe(r), status: status(r, now) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar a programação' });
  }
});

router.post('/', verifyAdmin, async (req, res) => {
  const b = req.body;
  const productIds = [...new Set((Array.isArray(b.product_ids) ? b.product_ids : [b.product_id]).map(Number).filter(Number.isInteger))];
  const kind = b.kind;
  const weekdays = [...new Set((Array.isArray(b.weekdays) ? b.weekdays : []).map(Number).filter(d => d >= 0 && d <= 6))].sort().join(',');
  const startAt = b.start_at || null;
  const endAt = b.end_at || null;
  const timeFrom = b.time_from || null;
  const timeTo = b.time_to || null;
  const promo = kind === 'promo' ? Math.round(parseFloat(String(b.promo_price).replace(',', '.')) * 100) / 100 : null;

  if (!productIds.length) return res.status(400).json({ error: 'Escolha o produto' });
  if (!['promo', 'available'].includes(kind)) return res.status(400).json({ error: 'Tipo inválido' });
  if (kind === 'promo' && !(promo > 0)) return res.status(400).json({ error: 'Coloque o preço da oferta' });
  if ((startAt && !STAMP.test(startAt)) || (endAt && !STAMP.test(endAt))) return res.status(400).json({ error: 'Data inválida' });
  if (startAt && endAt && endAt <= startAt) return res.status(400).json({ error: 'O fim precisa ser depois do início' });
  if ((timeFrom && !TIME.test(timeFrom)) || (timeTo && !TIME.test(timeTo))) return res.status(400).json({ error: 'Horário inválido' });
  if (timeFrom && timeTo && timeFrom === timeTo) return res.status(400).json({ error: 'O horário de início e de fim estão iguais' });
  if (kind === 'available' && !weekdays && !timeFrom && !timeTo && !startAt && !endAt) {
    return res.status(400).json({ error: 'Escolha os dias, o horário ou as datas em que o produto fica disponível' });
  }

  try {
    if (kind === 'promo') {
      const { rows } = await pool.query('SELECT name, price FROM products WHERE id = ANY($1::int[])', [productIds]);
      const bad = rows.find(p => promo >= parseFloat(p.price));
      if (bad) return res.status(400).json({ error: `A oferta precisa ser menor que o preço de "${bad.name}" (R$ ${parseFloat(bad.price).toFixed(2).replace('.', ',')})` });
    }
    const { rows } = await pool.query(
      `INSERT INTO product_schedules (product_id, kind, promo_price, start_at, end_at, weekdays, time_from, time_to)
       SELECT id, $2, $3, $4, $5, $6, $7, $8 FROM products WHERE id = ANY($1::int[])
       RETURNING id`,
      [productIds, kind, promo, startAt, endAt, weekdays || null, timeFrom, timeTo]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
    res.status(201).json({ created: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar a programação' });
  }
});

// Pausar / voltar
router.put('/:id/active', verifyAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('UPDATE product_schedules SET active = $1 WHERE id = $2', [req.body.active === true, req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Programação não encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM product_schedules WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao apagar' });
  }
});

module.exports = router;
