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
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'Cancelado')::int AS total_orders
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

module.exports = router;
