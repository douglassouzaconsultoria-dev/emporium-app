const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

const VALID_PAYMENT_METHODS = ['dinheiro', 'cartao', 'pix'];

// 🔒 GET todos os pedidos (APENAS ADMIN)
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, c.name, c.phone_number, c.address,
             m.name AS motoboy_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN customers m ON o.motoboy_id = m.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

// 👤 GET pedidos do cliente logado
router.get('/my-orders', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM orders
      WHERE customer_id = $1
      ORDER BY created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

// 🔒 GET pedido específico (dono do pedido ou admin)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, c.name, c.phone_number, c.address,
             m.name AS motoboy_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN customers m ON o.motoboy_id = m.id
      WHERE o.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const order = result.rows[0];

    if (req.user.role !== 'admin' && order.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const items = await pool.query(`
      SELECT oi.*, p.name as product_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `, [req.params.id]);

    res.json({ ...order, items: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// 👤 POST criar novo pedido (cliente autenticado)
router.post('/', verifyToken, async (req, res) => {
  const { items, delivery_address, payment_method } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Carrinho vazio' });
  }

  if (!delivery_address || !delivery_address.trim()) {
    return res.status(400).json({ error: 'Endereço de entrega é obrigatório' });
  }

  const method = payment_method || 'dinheiro';
  if (!VALID_PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Forma de pagamento inválida' });
  }

  for (const item of items) {
    const qty = parseInt(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantidade inválida no carrinho' });
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let total = 0;
    const pricedItems = [];

    for (const item of items) {
      const qty = parseInt(item.quantity);

      const productResult = await client.query(
        'SELECT id, name, price, estoque FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Um produto do carrinho não existe mais' });
      }

      const product = productResult.rows[0];

      if (product.estoque < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Estoque insuficiente para "${product.name}". Disponível: ${product.estoque}`
        });
      }

      const price = parseFloat(product.price);
      total += price * qty;
      pricedItems.push({ product_id: product.id, quantity: qty, price });
    }

    total = Math.round(total * 100) / 100;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, total, status, delivery_address, payment_method, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, customer_id, total, status, payment_method, created_at`,
      [req.user.id, total, 'Pendente', delivery_address.trim(), method]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price]
      );

      await client.query(
        'UPDATE products SET estoque = estoque - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      id: orderId,
      message: 'Pedido criado com sucesso!',
      order: orderResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  } finally {
    client.release();
  }
});

// 🔒 PUT escolher/remover motoboy do pedido (APENAS ADMIN)
router.put('/:id/motoboy', verifyAdmin, async (req, res) => {
  try {
    const motoboyId = req.body.motoboy_id ? parseInt(req.body.motoboy_id) : null;

    if (motoboyId) {
      const check = await pool.query(
        `SELECT id FROM customers WHERE id = $1 AND role = 'motoboy' AND active = true`,
        [motoboyId]
      );
      if (check.rows.length === 0) {
        return res.status(400).json({ error: 'Motoboy inválido ou desativado' });
      }
    }

    const result = await pool.query(
      `UPDATE orders SET motoboy_id = $1
       WHERE id = $2 AND status <> 'Entregue'
       RETURNING *`,
      [motoboyId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Pedido não encontrado ou já entregue' });
    }

    res.json({ message: 'Motoboy atualizado!', order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao definir motoboy' });
  }
});

// 🔒 PUT mudar status do pedido (APENAS ADMIN)
router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pendente', 'Preparando', 'Saído', 'Entregue'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           delivered_at = CASE WHEN $3 THEN NOW() ELSE delivered_at END
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id, status === 'Entregue']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    res.json({
      message: 'Status atualizado!',
      order: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

module.exports = router;