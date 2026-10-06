const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../utils/database');
const { verifyAdmin, verifyMotoboy } = require('../middleware/authMiddleware');

const isValidUsername = (u) => /^[a-z0-9._]{3,20}$/.test(u);
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

// Consulta base das entregas (com cliente e itens)
const DELIVERY_SELECT = `
  SELECT o.id, o.total, o.status, o.delivery_address, o.payment_method, o.created_at, o.motoboy_id,
         c.name AS customer_name, c.phone_number AS customer_phone, c.neighborhood AS customer_neighborhood,
         COALESCE(
           json_agg(json_build_object('quantity', oi.quantity, 'name', p.name))
             FILTER (WHERE oi.order_id IS NOT NULL),
           '[]'
         ) AS items
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN products p ON p.id = oi.product_id
`;

// ======================================================
// 🛵 ÁREA DO MOTOBOY
// ======================================================

// Minhas entregas + disponíveis
router.get('/me/deliveries', verifyMotoboy, async (req, res) => {
  try {
    const mine = await pool.query(
      `${DELIVERY_SELECT}
       WHERE o.motoboy_id = $1 AND o.status IN ('Preparando', 'Saído')
       GROUP BY o.id, c.id
       ORDER BY o.created_at ASC`,
      [req.user.id]
    );

    const available = await pool.query(
      `${DELIVERY_SELECT}
       WHERE o.motoboy_id IS NULL AND o.status = 'Preparando'
       GROUP BY o.id, c.id
       ORDER BY o.created_at ASC`
    );

    const doneToday = await pool.query(
      `SELECT COUNT(*)::int AS total FROM orders
       WHERE motoboy_id = $1 AND status = 'Entregue' AND delivered_at::date = CURRENT_DATE`,
      [req.user.id]
    );

    res.json({
      mine: mine.rows,
      available: available.rows,
      delivered_today: doneToday.rows[0].total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar entregas' });
  }
});

// Pegar entrega (só se ainda estiver livre)
router.post('/me/deliveries/:id/claim', verifyMotoboy, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE orders SET motoboy_id = $1
       WHERE id = $2 AND motoboy_id IS NULL AND status = 'Preparando'
       RETURNING id`,
      [req.user.id, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Essa entrega já foi pega por outro motoboy ou não está mais disponível' });
    }

    res.json({ message: 'Entrega é sua! 🛵' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao pegar entrega' });
  }
});

// Atualizar status (Saído / Entregue) — só nas próprias entregas
router.put('/me/deliveries/:id/status', verifyMotoboy, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedFrom = { 'Saído': 'Preparando', 'Entregue': 'Saído' };

    if (!allowedFrom[status]) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           delivered_at = CASE WHEN $4 THEN NOW() ELSE delivered_at END
       WHERE id = $2 AND motoboy_id = $3 AND status = $5
       RETURNING id, status`,
      [status, req.params.id, req.user.id, status === 'Entregue', allowedFrom[status]]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Não foi possível atualizar essa entrega' });
    }

    res.json({ message: 'Status atualizado!', order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar entrega' });
  }
});

// ======================================================
// 🔧 ADMIN: GERENCIAR MOTOBOYS
// ======================================================

// Listar motoboys
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.username, c.phone_number, c.active, c.avatar_url, c.created_at,
        (SELECT COUNT(*) FROM orders o WHERE o.motoboy_id = c.id AND o.status IN ('Preparando', 'Saído'))::int AS active_deliveries,
        (SELECT COUNT(*) FROM orders o WHERE o.motoboy_id = c.id AND o.status = 'Entregue')::int AS total_delivered,
        (SELECT COUNT(*) FROM orders o WHERE o.motoboy_id = c.id AND o.status = 'Entregue' AND o.delivered_at::date = CURRENT_DATE)::int AS delivered_today
      FROM customers c
      WHERE c.role = 'motoboy'
      ORDER BY c.active DESC, c.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar motoboys' });
  }
});

// Cadastrar motoboy
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const name = clean(req.body.name);
    const username = clean(req.body.username).toLowerCase();
    const phone = clean(req.body.phone_number);
    const password = req.body.password || '';

    if (!name || !username || !phone || !password) {
      return res.status(400).json({ error: 'Preencha nome, usuário, telefone e senha' });
    }
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Usuário: 3 a 20 caracteres, letras minúsculas, números, ponto ou _' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const userExists = await pool.query('SELECT id FROM customers WHERE LOWER(username) = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Este usuário já existe' });
    }

    const phoneExists = await pool.query('SELECT id FROM customers WHERE phone_number = $1', [phone]);
    if (phoneExists.rows.length > 0) {
      return res.status(400).json({ error: 'Este telefone já está cadastrado' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO customers (name, username, phone_number, password, address, neighborhood, role, active)
       VALUES ($1, $2, $3, $4, 'Motoboy', '-', 'motoboy', true)
       RETURNING id, name, username, phone_number, active`,
      [name, username, phone, hashed]
    );

    res.status(201).json({ message: 'Motoboy cadastrado!', motoboy: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar motoboy' });
  }
});

// Editar motoboy (nome, usuário, telefone, ativo)
router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const name = clean(req.body.name);
    const username = clean(req.body.username).toLowerCase();
    const phone = clean(req.body.phone_number);
    const active = req.body.active !== false;

    if (!name || !username || !phone) {
      return res.status(400).json({ error: 'Preencha nome, usuário e telefone' });
    }
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Usuário: 3 a 20 caracteres, letras minúsculas, números, ponto ou _' });
    }

    const userExists = await pool.query(
      'SELECT id FROM customers WHERE LOWER(username) = $1 AND id <> $2', [username, req.params.id]
    );
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Este usuário já está em uso' });
    }

    const phoneExists = await pool.query(
      'SELECT id FROM customers WHERE phone_number = $1 AND id <> $2', [phone, req.params.id]
    );
    if (phoneExists.rows.length > 0) {
      return res.status(400).json({ error: 'Este telefone já está em uso' });
    }

    const result = await pool.query(
      `UPDATE customers SET name = $1, username = $2, phone_number = $3, active = $4
       WHERE id = $5 AND role = 'motoboy'
       RETURNING id, name, username, phone_number, active`,
      [name, username, phone, active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Motoboy não encontrado' });
    }

    // Desativado → entregas que ainda não saíram voltam para a fila
    if (!active) {
      await pool.query(
        `UPDATE orders SET motoboy_id = NULL WHERE motoboy_id = $1 AND status = 'Preparando'`,
        [req.params.id]
      );
    }

    res.json({ message: 'Motoboy atualizado!', motoboy: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar motoboy' });
  }
});

// Redefinir senha do motoboy
router.put('/:id/password', verifyAdmin, async (req, res) => {
  try {
    const password = req.body.password || '';
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `UPDATE customers SET password = $1 WHERE id = $2 AND role = 'motoboy' RETURNING id`,
      [hashed, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Motoboy não encontrado' });
    }

    res.json({ message: 'Senha redefinida!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

module.exports = router;