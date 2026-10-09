const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');
const { normalize } = require('../utils/deliveryFee');
const { buildInsights } = require('../utils/insights');

// 🕒 Datas gravadas sem fuso, no horário da sessão do banco → convertidas para Brasília
const BR = (col) => `(${col}::timestamptz AT TIME ZONE 'America/Sao_Paulo')`;
const IN_PERIOD = (col) => `${BR(col)}::date BETWEEN $1::date AND $2::date`;
const VALID = `o.status <> 'Cancelado'`;

const DAY = 864e5;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
const addDays = (s, n) => new Date(Date.parse(s) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;

// Hoje=por hora · até 2 meses=por dia · até ~6 meses=por semana · mais=por mês
const pickGranularity = (days) => (days === 1 ? 'hour' : days <= 62 ? 'day' : days <= 200 ? 'week' : 'month');

// Todas as "caixinhas" do gráfico, inclusive as sem venda (para não sumir dia sem pedido)
const bucketKeys = (from, to, granularity) => {
  const keys = [];
  if (granularity === 'hour') {
    for (let h = 0; h < 24; h++) keys.push(`${from}T${String(h).padStart(2, '0')}`);
    return keys;
  }
  if (granularity === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d);
    return keys;
  }
  if (granularity === 'week') {
    const dow = (new Date(Date.parse(from)).getUTCDay() + 6) % 7; // segunda = 0
    for (let d = addDays(from, -dow); d <= to; d = addDays(d, 7)) keys.push(d);
    return keys;
  }
  for (let d = `${from.slice(0, 7)}-01`; d <= to;) {
    keys.push(d);
    const [y, m] = d.split('-').map(Number);
    d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  }
  return keys;
};

const num = (v) => parseFloat(v) || 0;
const money = (v) => Math.round(num(v) * 100) / 100;

const summary = async (from, to) => {
  const [orders, customers] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS orders_total,
        COUNT(*) FILTER (WHERE ${VALID})::int AS orders_valid,
        COUNT(*) FILTER (WHERE o.status = 'Pendente')::int AS pendente,
        COUNT(*) FILTER (WHERE o.status = 'Preparando')::int AS preparando,
        COUNT(*) FILTER (WHERE o.status = 'Saído')::int AS saido,
        COUNT(*) FILTER (WHERE o.status = 'Entregue')::int AS entregue,
        COUNT(*) FILTER (WHERE o.status = 'Cancelado')::int AS cancelado,
        COALESCE(SUM(o.total) FILTER (WHERE ${VALID}), 0) AS gross,
        COALESCE(SUM(COALESCE(o.delivery_fee, 0)) FILTER (WHERE ${VALID}), 0) AS fees,
        COUNT(DISTINCT o.customer_id) FILTER (WHERE ${VALID})::int AS buyers,
        COUNT(DISTINCT o.customer_id) FILTER (WHERE ${VALID} AND EXISTS (
          SELECT 1 FROM orders prev
          WHERE prev.customer_id = o.customer_id AND prev.status <> 'Cancelado'
            AND ${BR('prev.created_at')}::date < $1::date
        ))::int AS returning_buyers
      FROM orders o
      WHERE ${IN_PERIOD('o.created_at')}
    `, [from, to]),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE ${IN_PERIOD('c.created_at')})::int AS new_customers,
        COUNT(*) FILTER (WHERE c.created_at IS NULL OR ${BR('c.created_at')}::date <= $2::date)::int AS total_customers,
        COUNT(*) FILTER (WHERE ${IN_PERIOD('c.created_at')}
          AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id))::int AS new_without_orders
      FROM customers c
      WHERE c.role = 'client'
    `, [from, to])
  ]);

  const o = orders.rows[0];
  const c = customers.rows[0];
  const productsRevenue = money(num(o.gross) - num(o.fees));
  return {
    revenue: productsRevenue,
    fees: money(o.fees),
    gross: money(o.gross),
    orders_total: o.orders_total,
    orders_valid: o.orders_valid,
    avg_ticket: o.orders_valid > 0 ? money(productsRevenue / o.orders_valid) : 0,
    cancel_rate: o.orders_total > 0 ? Math.round((o.cancelado / o.orders_total) * 1000) / 10 : 0,
    status: { Pendente: o.pendente, Preparando: o.preparando, 'Saído': o.saido, Entregue: o.entregue, Cancelado: o.cancelado },
    buyers: o.buyers,
    returning_buyers: o.returning_buyers,
    new_customers: c.new_customers,
    total_customers: c.total_customers,
    new_without_orders: c.new_without_orders
  };
};

const categoryRevenue = (from, to) => pool.query(`
  SELECT COALESCE(c.name, 'Sem categoria') AS name,
         SUM(oi.price * oi.quantity) AS revenue,
         COUNT(DISTINCT o.id)::int AS orders
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  LEFT JOIN products p ON p.id = oi.product_id
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE ${VALID} AND ${IN_PERIOD('o.created_at')}
  GROUP BY 1
  ORDER BY 2 DESC
`, [from, to]);

// 🔒 GET /api/dashboard?from=AAAA-MM-DD&to=AAAA-MM-DD (datas de Brasília, inclusivas)
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!isDate(from) || !isDate(to) || from > to) {
      return res.status(400).json({ error: 'Período inválido' });
    }
    const days = daysBetween(from, to);
    if (days > 1100) {
      return res.status(400).json({ error: 'Escolha um período de até 3 anos' });
    }

    // Período anterior de mesma duração, logo antes
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days - 1));
    const granularity = pickGranularity(days);
    const bucketFormat = granularity === 'hour' ? `'YYYY-MM-DD"T"HH24'` : `'YYYY-MM-DD'`;

    const [
      current, previous, orderSeries, customerSeries, topProducts, categories, prevCategories,
      payments, neighborhoods, fees, products, openOrders
    ] = await Promise.all([
      summary(from, to),
      summary(prevFrom, prevTo),
      pool.query(`
        SELECT to_char(date_trunc('${granularity}', ${BR('o.created_at')}), ${bucketFormat}) AS bucket,
               COUNT(*) FILTER (WHERE ${VALID})::int AS orders,
               COALESCE(SUM(o.total - COALESCE(o.delivery_fee, 0)) FILTER (WHERE ${VALID}), 0) AS revenue
        FROM orders o
        WHERE ${IN_PERIOD('o.created_at')}
        GROUP BY 1
      `, [from, to]),
      pool.query(`
        SELECT to_char(date_trunc('${granularity}', ${BR('c.created_at')}), ${bucketFormat}) AS bucket,
               COUNT(*)::int AS customers
        FROM customers c
        WHERE c.role = 'client' AND ${IN_PERIOD('c.created_at')}
        GROUP BY 1
      `, [from, to]),
      pool.query(`
        SELECT p.id, COALESCE(p.name, 'Produto removido') AS name, p.unit,
               SUM(oi.quantity) AS quantity,
               SUM(oi.price * oi.quantity) AS revenue,
               COUNT(DISTINCT o.id)::int AS orders
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE ${VALID} AND ${IN_PERIOD('o.created_at')}
        GROUP BY p.id, p.name, p.unit
        ORDER BY revenue DESC
        LIMIT 10
      `, [from, to]),
      categoryRevenue(from, to),
      categoryRevenue(prevFrom, prevTo),
      pool.query(`
        SELECT COALESCE(o.payment_method, 'dinheiro') AS method,
               COUNT(*)::int AS orders, SUM(o.total) AS total
        FROM orders o
        WHERE ${VALID} AND ${IN_PERIOD('o.created_at')}
        GROUP BY 1
        ORDER BY 2 DESC
      `, [from, to]),
      pool.query(`
        SELECT COALESCE(NULLIF(TRIM(o.delivery_neighborhood), ''), NULLIF(TRIM(c.neighborhood), ''), 'Não informado') AS name,
               COUNT(*)::int AS orders,
               SUM(o.total - COALESCE(o.delivery_fee, 0)) AS revenue,
               SUM(COALESCE(o.delivery_fee, 0)) AS fees
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ${VALID} AND ${IN_PERIOD('o.created_at')}
        GROUP BY 1
      `, [from, to]),
      pool.query('SELECT neighborhood FROM delivery_fees'),
      pool.query(`
        SELECT p.id, p.name, p.unit, p.estoque,
               COALESCE(s30.qty, 0) AS sold_30d,
               COALESCE(sp.qty, 0) AS sold_period
        FROM products p
        LEFT JOIN (
          SELECT oi.product_id, SUM(oi.quantity) AS qty
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE ${VALID} AND o.created_at::timestamptz >= NOW() - INTERVAL '30 days'
          GROUP BY 1
        ) s30 ON s30.product_id = p.id
        LEFT JOIN (
          SELECT oi.product_id, SUM(oi.quantity) AS qty
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE ${VALID} AND ${IN_PERIOD('o.created_at')}
          GROUP BY 1
        ) sp ON sp.product_id = p.id
        ORDER BY p.name
      `, [from, to]),
      pool.query(`
        SELECT o.id, o.status, o.payment_method, o.total,
               ROUND(EXTRACT(EPOCH FROM (NOW() - o.created_at::timestamptz)) / 60)::int AS minutes
        FROM orders o
        WHERE o.status IN ('Pendente', 'Preparando', 'Saído')
        ORDER BY o.created_at
      `)
    ]);

    // 📈 Série completa (dias sem venda = 0)
    const byBucket = Object.fromEntries(orderSeries.rows.map(r => [r.bucket, r]));
    const custByBucket = Object.fromEntries(customerSeries.rows.map(r => [r.bucket, r.customers]));
    const series = bucketKeys(from, to, granularity).map(key => ({
      key,
      revenue: money(byBucket[key]?.revenue),
      orders: byBucket[key]?.orders || 0,
      customers: custByBucket[key] || 0
    }));

    // 🏘️ Junta "morada nova" e "Morada Nova"; marca quem está fora da lista de taxas
    const listed = new Set(fees.rows.map(f => normalize(f.neighborhood)));
    const hoods = {};
    neighborhoods.rows.forEach(r => {
      const k = normalize(r.name);
      const h = hoods[k] || (hoods[k] = { name: r.name, orders: 0, revenue: 0, fees: 0, in_list: listed.has(k) });
      h.orders += r.orders;
      h.revenue += num(r.revenue);
      h.fees += num(r.fees);
    });
    const neighborhoodList = Object.values(hoods)
      .map(h => ({ ...h, revenue: money(h.revenue), fees: money(h.fees) }))
      .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);

    const prevCat = Object.fromEntries(prevCategories.rows.map(r => [r.name, money(r.revenue)]));
    const categoryList = categories.rows.map(r => ({
      name: r.name,
      revenue: money(r.revenue),
      orders: r.orders,
      previous: prevCat[r.name] || 0
    }));

    const productList = products.rows.map(p => ({
      id: p.id, name: p.name, unit: p.unit, estoque: num(p.estoque),
      sold_30d: num(p.sold_30d), sold_period: num(p.sold_period)
    }));
    const stock = {
      out: productList.filter(p => p.estoque <= 0),
      low: productList.filter(p => p.estoque > 0 && p.estoque <= 10),
      no_sales: productList.filter(p => p.estoque > 0 && p.sold_period === 0),
      total_products: productList.length
    };

    const data = {
      period: { from, to, days, granularity, previous: { from: prevFrom, to: prevTo } },
      current,
      previous,
      series,
      top_products: topProducts.rows.map(r => ({
        id: r.id, name: r.name, unit: r.unit,
        quantity: num(r.quantity), revenue: money(r.revenue), orders: r.orders
      })),
      categories: categoryList,
      payments: payments.rows.map(r => ({ method: r.method, orders: r.orders, total: money(r.total) })),
      neighborhoods: neighborhoodList,
      stock,
      open_orders: openOrders.rows.map(r => ({ ...r, total: money(r.total) })),
      generated_at: new Date().toISOString()
    };
    data.insights = buildInsights(data, productList);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao montar o dashboard' });
  }
});

module.exports = router;
