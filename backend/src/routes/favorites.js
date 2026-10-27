const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyToken } = require('../middleware/authMiddleware');

// ❤️ Favoritos do cliente logado (guardados na conta: aparecem em qualquer celular)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT product_id FROM customer_favorites WHERE customer_id = $1 ORDER BY created_at DESC', [req.user.id]
    );
    res.json(rows.map(r => r.product_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar favoritos' });
  }
});

router.put('/:productId', verifyToken, async (req, res) => {
  const productId = parseInt(req.params.productId);
  if (!Number.isInteger(productId)) return res.status(400).json({ error: 'Produto inválido' });
  try {
    await pool.query(
      `INSERT INTO customer_favorites (customer_id, product_id)
       SELECT $1, id FROM products WHERE id = $2
       ON CONFLICT DO NOTHING`,
      [req.user.id, productId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao favoritar' });
  }
});

router.delete('/:productId', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM customer_favorites WHERE customer_id = $1 AND product_id = $2', [req.user.id, parseInt(req.params.productId) || 0]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao tirar dos favoritos' });
  }
});

module.exports = router;
