const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { getDeliveryFee } = require('../utils/deliveryFee');
const { isKg } = require('../utils/units');
const { getStore, storeStatus } = require('../utils/store');
const { applyCoupon } = require('../utils/coupons');

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
      SELECT oi.*, p.name as product_name, p.unit
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
  const { items, delivery_address, payment_method, delivery_neighborhood, coupon_code, change_for } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Carrinho vazio' });
  }

  if (!delivery_address || !delivery_address.trim()) {
    return res.status(400).json({ error: 'Endereço de entrega é obrigatório' });
  }

  if (!delivery_neighborhood || !delivery_neighborhood.trim()) {
    return res.status(400).json({ error: 'Informe o bairro da entrega' });
  }

  const method = payment_method || 'dinheiro';
  if (!VALID_PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Forma de pagamento inválida' });
  }

  for (const item of items) {
    const qty = parseFloat(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantidade inválida no carrinho' });
    }
  }

  // 💵 Troco: só no dinheiro. Vazio = cliente tem o valor certinho
  const changeFor = method === 'dinheiro' && change_for !== undefined && change_for !== null && change_for !== ''
    ? parseFloat(String(change_for).replace(',', '.'))
    : null;
  if (changeFor !== null && (!Number.isFinite(changeFor) || changeFor <= 0)) {
    return res.status(400).json({ error: 'Valor do troco inválido' });
  }

  const client = await pool.connect();

  try {
    // 🏪 Loja fechada não recebe pedido
    const store = await getStore(client);
    const status = storeStatus(store);
    if (!status.open) {
      return res.status(400).json({ error: status.message || 'A loja está fechada no momento' });
    }

    await client.query('BEGIN');

    let total = 0;
    const pricedItems = [];

    for (const item of items) {
      const productResult = await client.query(
        'SELECT id, name, price, promo_price, unit, estoque, active FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Um produto do carrinho não existe mais' });
      }

      const product = productResult.rows[0];

      if (product.active === false) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `"${product.name}" não está mais disponível` });
      }

      // ⚖️ Produto por kg aceita quebrado (0,250 kg); por unidade só inteiro
      const qty = isKg(product.unit)
        ? Math.round(parseFloat(item.quantity) * 1000) / 1000
        : parseFloat(item.quantity);

      if (!isKg(product.unit) && !Number.isInteger(qty)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Quantidade inválida para "${product.name}"` });
      }

      if (product.estoque < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Estoque insuficiente para "${product.name}". Disponível: ${product.estoque}`
        });
      }

      // 🔥 Preço de oferta vale quando é menor que o normal
      const promo = parseFloat(product.promo_price);
      const price = promo > 0 && promo < parseFloat(product.price) ? promo : parseFloat(product.price);
      total += Math.round(price * qty * 100) / 100;
      pricedItems.push({ product_id: product.id, quantity: qty, price });
    }

    const subtotal = Math.round(total * 100) / 100;

    if (store.min_order > 0 && subtotal < store.min_order) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `O pedido mínimo é de R$ ${store.min_order.toFixed(2)} em produtos` });
    }

    // 🎟️ Cupom (conferido de novo aqui; o navegador não decide o desconto)
    let discount = 0;
    let couponCode = null;
    if (coupon_code && String(coupon_code).trim()) {
      const applied = await applyCoupon(client, coupon_code, subtotal, { lock: true });
      if (applied.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: applied.error });
      }
      discount = applied.discount;
      couponCode = applied.coupon.code;
      await client.query('UPDATE coupons SET uses = uses + 1 WHERE id = $1', [applied.coupon.id]);
    }

    // 🛵 Taxa calculada no servidor (o navegador não decide o valor)
    const delivery = await getDeliveryFee(client, delivery_neighborhood);
    total = Math.round((subtotal - discount + delivery.fee) * 100) / 100;

    if (changeFor !== null && changeFor < total) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `O troco precisa ser para um valor maior que o total (R$ ${total.toFixed(2)})` });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, total, status, delivery_address, payment_method, delivery_fee, delivery_neighborhood, discount, coupon_code, change_for, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING id, customer_id, total, status, payment_method, delivery_fee, delivery_neighborhood, discount, coupon_code, change_for, created_at`,
      [req.user.id, total, 'Pendente', delivery_address.trim(), method, delivery.fee, delivery.neighborhood, discount, couponCode, changeFor]
    );

    const orderId = orderResult.rows[0].id;

    // 🛵 Motoboy padrão (se estiver ativo) já fica escolhido; o admin pode trocar depois
    if (store.default_motoboy_id) {
      await client.query(
        `UPDATE orders SET motoboy_id = $1 WHERE id = $2
         AND EXISTS (SELECT 1 FROM customers WHERE id = $1 AND role = 'motoboy' AND active = true)`,
        [store.default_motoboy_id, orderId]
      );
    }

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
       WHERE id = $2 AND status NOT IN ('Entregue', 'Cancelado')
       RETURNING *`,
      [motoboyId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Pedido não encontrado, já entregue ou cancelado' });
    }

    res.json({ message: 'Motoboy atualizado!', order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao definir motoboy' });
  }
});

// 🔒 PUT mudar status do pedido (APENAS ADMIN)
router.put('/:id', verifyAdmin, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Pendente', 'Preparando', 'Saído', 'Entregue', 'Cancelado'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const current = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const oldStatus = current.rows[0].status;
    if (oldStatus === 'Cancelado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Pedido cancelado não pode ser alterado' });
    }
    if (status === 'Cancelado' && oldStatus === 'Entregue') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Pedido já entregue não pode ser cancelado' });
    }

    // ❌ Cancelou → devolve os itens ao estoque e libera o motoboy
    if (status === 'Cancelado') {
      await client.query(
        `UPDATE products p SET estoque = p.estoque + oi.quantity
         FROM order_items oi
         WHERE oi.order_id = $1 AND p.id = oi.product_id`,
        [req.params.id]
      );
    }

    const result = await client.query(
      `UPDATE orders
       SET status = $1,
           delivered_at = CASE WHEN $3 THEN NOW() ELSE delivered_at END,
           motoboy_id = CASE WHEN $4 THEN NULL ELSE motoboy_id END
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id, status === 'Entregue', status === 'Cancelado']
    );

    await client.query('COMMIT');

    res.json({
      message: 'Status atualizado!',
      order: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  } finally {
    client.release();
  }
});

module.exports = router;