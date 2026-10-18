const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../utils/database');
const { verifyAdmin, verifyMotoboy } = require('../middleware/authMiddleware');
const { getPublicKey, notifyDelivery } = require('../utils/push');

const isValidUsername = (u) => /^[a-z0-9._]{3,20}$/.test(u);
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

// Consulta base das entregas (com cliente e itens)
const DELIVERY_SELECT = `
  SELECT o.id, o.total, o.status, o.delivery_address, o.payment_method, o.created_at, o.motoboy_id,
         o.delivery_fee, o.delivery_neighborhood, o.change_for, o.notes,
         c.name AS customer_name, c.phone_number AS customer_phone, c.neighborhood AS customer_neighborhood,
         COALESCE(
           json_agg(json_build_object('quantity', oi.quantity, 'name', p.name, 'unit', p.unit))
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

// 🛵 Rotas da área do motoboy: usadas pelo próprio motoboy (/me) e pelo admin vendo o painel dele (/:id/panel)
const me = express.Router();

// Celular do motoboy apenas (o admin não manda localização nem recebe notificações por ele)
const motoboyOnly = (req, res, next) => (req.actingAdmin
  ? res.status(403).json({ error: 'Disponível só no celular do motoboy' })
  : next());

// 🕒 Datas gravadas sem fuso → dia de Brasília (igual ao dashboard)
const BR_DATE = (col) => `(${col}::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date`;
const BR_TODAY = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;
const IS_CASH = `COALESCE(o.payment_method, 'dinheiro') = 'dinheiro'`;

// 💰 Resumo do motoboy: entregas e taxas de hoje + dinheiro em mãos ainda não acertado no caixa
const moneySummary = async (motoboyId) => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${BR_DATE('o.delivered_at')} = ${BR_TODAY})::int AS delivered_today,
       COALESCE(SUM(o.delivery_fee) FILTER (WHERE ${BR_DATE('o.delivered_at')} = ${BR_TODAY}), 0) AS fees_today,
       COALESCE(SUM(o.total) FILTER (WHERE ${IS_CASH} AND o.settled_at IS NULL), 0) AS cash_pending,
       COUNT(*) FILTER (WHERE ${IS_CASH} AND o.settled_at IS NULL)::int AS cash_orders
     FROM orders o
     WHERE o.motoboy_id = $1 AND o.status = 'Entregue'`,
    [motoboyId]
  );
  const r = rows[0];
  return {
    delivered_today: r.delivered_today,
    fees_today: parseFloat(r.fees_today),
    cash_pending: parseFloat(r.cash_pending),
    cash_orders: r.cash_orders
  };
};

// Minhas entregas + disponíveis
me.get('/deliveries', async (req, res) => {
  try {
    const me = await pool.query('SELECT online FROM customers WHERE id = $1', [req.user.id]);
    const online = me.rows[0].online === true;

    const mine = await pool.query(
      `${DELIVERY_SELECT}
       WHERE o.motoboy_id = $1 AND o.status IN ('Preparando', 'Saído')
       GROUP BY o.id, c.id
       ORDER BY o.created_at ASC`,
      [req.user.id]
    );

    // Offline não vê (nem é avisado de) entregas livres; com problema, só o admin libera de novo
    const available = online
      ? await pool.query(
        `${DELIVERY_SELECT}
         WHERE o.motoboy_id IS NULL AND o.status = 'Preparando' AND o.problem IS NULL
         GROUP BY o.id, c.id
         ORDER BY o.created_at ASC`
      )
      : { rows: [] };

    res.json({
      online,
      mine: mine.rows,
      available: available.rows,
      ...(await moneySummary(req.user.id))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar entregas' });
  }
});

// 🟢 Disponível / ⚪ Offline
me.put('/online', async (req, res) => {
  try {
    const online = req.body.online === true;
    await pool.query('UPDATE customers SET online = $1 WHERE id = $2', [online, req.user.id]);

    // Saiu do turno: entregas que ainda não saíram voltam para a fila
    if (!online) {
      const released = await pool.query(
        `UPDATE orders SET motoboy_id = NULL
         WHERE motoboy_id = $1 AND status = 'Preparando'
         RETURNING id`,
        [req.user.id]
      );
      released.rows.forEach(o => notifyDelivery(o.id));
    }

    res.json({ online });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao mudar disponibilidade' });
  }
});

// Pegar entrega (só se ainda estiver livre)
me.post('/deliveries/:id/claim', async (req, res) => {
  try {
    const me = await pool.query('SELECT online FROM customers WHERE id = $1', [req.user.id]);
    if (me.rows[0].online !== true) {
      return res.status(400).json({ error: 'Fique disponível (🟢) para pegar entregas' });
    }

    const result = await pool.query(
      `UPDATE orders SET motoboy_id = $1
       WHERE id = $2 AND motoboy_id IS NULL AND status = 'Preparando' AND problem IS NULL
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
me.put('/deliveries/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowedFrom = { 'Saído': 'Preparando', 'Entregue': 'Saído' };

    if (!allowedFrom[status]) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           delivered_at = CASE WHEN $4 THEN NOW() ELSE delivered_at END,
           out_at = CASE WHEN $1 = 'Saído' THEN NOW() ELSE out_at END
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

// 🚫 Problema na entrega: o pedido volta para o admin decidir (reenviar ou cancelar)
const PROBLEMS = {
  ausente: 'Cliente ausente',
  endereco: 'Endereço não encontrado',
  recusou: 'Cliente recusou',
  outro: 'Outro problema'
};

me.put('/deliveries/:id/problem', async (req, res) => {
  try {
    const label = PROBLEMS[req.body.reason];
    const details = clean(req.body.details).slice(0, 200);
    if (!label) {
      return res.status(400).json({ error: 'Escolha o problema' });
    }
    if (req.body.reason === 'outro' && !details) {
      return res.status(400).json({ error: 'Escreva o que aconteceu' });
    }

    const result = await pool.query(
      `UPDATE orders
       SET problem = $1, problem_at = NOW(), status = 'Preparando', motoboy_id = NULL, out_at = NULL
       WHERE id = $2 AND motoboy_id = $3 AND status IN ('Preparando', 'Saído')
       RETURNING id`,
      [details ? `${label}: ${details}` : label, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Não foi possível registrar o problema' });
    }

    res.json({ message: 'Problema enviado ao Empório' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar problema' });
  }
});

// 📜 Histórico de entregas (1, 7 ou 30 dias)
me.get('/history', async (req, res) => {
  try {
    const days = [1, 7, 30].includes(parseInt(req.query.days)) ? parseInt(req.query.days) : 7;
    const { rows } = await pool.query(
      `SELECT o.id, o.total, o.delivery_fee, o.payment_method, o.delivered_at, o.settled_at,
              COALESCE(NULLIF(o.delivery_neighborhood, ''), NULLIF(c.neighborhood, '-')) AS neighborhood,
              ROUND(EXTRACT(EPOCH FROM (o.delivered_at - o.out_at)) / 60)::int AS route_min
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.motoboy_id = $1 AND o.status = 'Entregue'
         AND ${BR_DATE('o.delivered_at')} > ${BR_TODAY} - $2::int
       ORDER BY o.delivered_at DESC
       LIMIT 500`,
      [req.user.id, days]
    );

    const isCash = (o) => (o.payment_method || 'dinheiro') === 'dinheiro';
    const times = rows.map(o => o.route_min).filter(m => m !== null && m >= 0);
    res.json({
      days,
      deliveries: rows.length,
      fees: rows.reduce((s, o) => s + parseFloat(o.delivery_fee || 0), 0),
      cash: rows.filter(isCash).reduce((s, o) => s + parseFloat(o.total || 0), 0),
      avg_route_min: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      orders: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// 📍 Localização (só enquanto o app está aberto): o cliente acompanha o pedido em rota
me.put('/location', motoboyOnly, async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'Localização inválida' });
  }
  try {
    await pool.query(
      'UPDATE customers SET last_lat = $1, last_lng = $2, last_location_at = NOW() WHERE id = $3',
      [lat, lng, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar localização' });
  }
});

// 🔔 Notificações com o app fechado
me.get('/push-key', motoboyOnly, async (req, res) => {
  try {
    res.json({ key: await getPublicKey() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Notificações indisponíveis' });
  }
});

me.post('/push-subscribe', motoboyOnly, async (req, res) => {
  const sub = req.body.subscription || {};
  if (typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: 'Inscrição inválida' });
  }
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (customer_id, endpoint, keys) VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET customer_id = $1, keys = $3`,
      [req.user.id, sub.endpoint, JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth })]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao ativar notificações' });
  }
});

me.post('/push-unsubscribe', motoboyOnly, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND customer_id = $2',
      [String(req.body.endpoint || ''), req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao desativar notificações' });
  }
});

router.use('/me', verifyMotoboy, me);

// 👁️ Admin abre o painel de um motoboy e pode agir por ele
router.use('/:motoboyId/panel', verifyAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.motoboyId);
    const { rows } = await pool.query(`SELECT id FROM customers WHERE id = $1 AND role = 'motoboy'`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Motoboy não encontrado' });
    req.user = { id, role: 'motoboy' };
    req.actingAdmin = true;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao abrir o painel do motoboy' });
  }
}, me);

// ======================================================
// 🔧 ADMIN: GERENCIAR MOTOBOYS
// ======================================================

// Listar motoboys
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.username, c.phone_number, c.active, c.avatar_url, c.created_at, c.online,
        (SELECT COUNT(*) FROM orders o WHERE o.motoboy_id = c.id AND o.status IN ('Preparando', 'Saído'))::int AS active_deliveries,
        (SELECT COUNT(*) FROM orders o WHERE o.motoboy_id = c.id AND o.status = 'Entregue')::int AS total_delivered,
        (SELECT COUNT(*) FROM orders o WHERE o.motoboy_id = c.id AND o.status = 'Entregue' AND ${BR_DATE('o.delivered_at')} = ${BR_TODAY})::int AS delivered_today,
        (SELECT COALESCE(SUM(o.delivery_fee), 0) FROM orders o WHERE o.motoboy_id = c.id AND o.status = 'Entregue' AND ${BR_DATE('o.delivered_at')} = ${BR_TODAY}) AS fees_today,
        (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.motoboy_id = c.id AND o.status = 'Entregue' AND ${IS_CASH} AND o.settled_at IS NULL) AS cash_pending
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
      `UPDATE customers SET name = $1, username = $2, phone_number = $3, active = $4,
              online = CASE WHEN $4 THEN online ELSE false END
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

// 💰 Acerto de caixa: marca o dinheiro das entregas em espécie como recebido pelo Empório
router.put('/:id/settle', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE orders o SET settled_at = NOW()
       WHERE o.motoboy_id = $1 AND o.status = 'Entregue' AND ${IS_CASH} AND o.settled_at IS NULL
       RETURNING o.total`,
      [req.params.id]
    );
    res.json({ orders: rows.length, total: rows.reduce((s, r) => s + parseFloat(r.total || 0), 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer o acerto' });
  }
});

// 📊 Relatório por motoboy no período (datas de Brasília, inclusivas)
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));

router.get('/report', verifyAdmin, async (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to) || from > to) {
    return res.status(400).json({ error: 'Período inválido' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name,
              COUNT(o.id)::int AS deliveries,
              COALESCE(SUM(o.delivery_fee), 0) AS fees,
              COALESCE(SUM(o.total) FILTER (WHERE ${IS_CASH}), 0) AS cash,
              ROUND(AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.out_at)) / 60) FILTER (WHERE o.out_at IS NOT NULL))::int AS avg_route_min,
              ROUND(AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60))::int AS avg_total_min
       FROM customers c
       JOIN orders o ON o.motoboy_id = c.id AND o.status = 'Entregue'
         AND ${BR_DATE('o.delivered_at')} BETWEEN $1::date AND $2::date
       WHERE c.role = 'motoboy'
       GROUP BY c.id, c.name
       ORDER BY deliveries DESC, c.name`,
      [from, to]
    );
    res.json(rows.map(r => ({ ...r, fees: parseFloat(r.fees), cash: parseFloat(r.cash) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao montar o relatório' });
  }
});

module.exports = router;
