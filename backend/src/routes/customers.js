const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');

// 🔒 Lista de clientes (sem senha)
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.username, c.email, c.phone_number, c.address, c.neighborhood, c.created_at,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'Cancelado')::int AS total_orders,
        (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'Cancelado') AS last_order_at,
        (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'Cancelado') AS total_spent
      FROM customers c
      WHERE c.role = 'client'
      ORDER BY c.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// 🔒 Redefinir senha do cliente (ex: esqueceu a senha e chamou no WhatsApp)
router.put('/:id/password', verifyAdmin, async (req, res) => {
  try {
    const password = req.body.password || '';
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `UPDATE customers SET password = $1 WHERE id = $2 AND role = 'client' RETURNING id`,
      [hashed, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json({ message: 'Senha redefinida!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

// 🔑 Pedidos de senha nova (cliente tocou em "Esqueci minha senha")
router.get('/password-requests', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.status, r.created_at, r.approved_at, r.expires_at,
             c.id AS customer_id, c.name, c.username, c.phone_number, c.neighborhood,
             (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'Cancelado')::int AS total_orders
      FROM password_resets r JOIN customers c ON c.id = r.customer_id
      WHERE (r.status = 'pending' AND r.created_at > NOW() - INTERVAL '1 day')
         OR (r.status = 'approved' AND r.expires_at > NOW())
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedidos de senha' });
  }
});

// Aprovar: gera o código de 6 números (só aparece agora, para o admin passar ao cliente)
router.post('/password-requests/:id/approve', verifyAdmin, async (req, res) => {
  try {
    const result = await require('./auth').approveReset(parseInt(req.params.id) || 0);
    if (!result) return res.status(404).json({ error: 'Pedido não encontrado ou já resolvido' });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar o código' });
  }
});

router.post('/password-requests/:id/deny', verifyAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE password_resets SET status = 'denied' WHERE id = $1 AND status IN ('pending', 'approved')`, [parseInt(req.params.id) || 0]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao recusar' });
  }
});

module.exports = router;
