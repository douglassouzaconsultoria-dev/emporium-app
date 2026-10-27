const webpush = require('web-push');
const pool = require('./database');

// 🔔 Notificação no celular do motoboy mesmo com o app fechado (Web Push)
// As chaves VAPID vêm do ambiente ou são criadas uma vez e guardadas no banco.
let keyPromise = null;

const loadKeys = async () => {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const generated = webpush.generateVAPIDKeys();
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(generated)]
  );
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'vapid'`);
  return JSON.parse(rows[0].value);
};

const getPublicKey = () => {
  if (!keyPromise) {
    keyPromise = loadKeys()
      .then((keys) => {
        webpush.setVapidDetails('https://emporiobrumado.com', keys.publicKey, keys.privateKey);
        return keys.publicKey;
      })
      .catch((err) => {
        keyPromise = null;
        throw err;
      });
  }
  return keyPromise;
};

const sendTo = async (customerIds, payload) => {
  if (!customerIds.length) return;
  await getPublicKey();
  const { rows } = await pool.query(
    'SELECT id, endpoint, keys FROM push_subscriptions WHERE customer_id = ANY($1::int[])',
    [customerIds]
  );
  await Promise.all(rows.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) },
        JSON.stringify(payload),
        { TTL: 600, urgency: 'high' }
      );
    } catch (err) {
      // Celular desinstalou o app ou tirou a permissão: apaga a inscrição
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      } else {
        console.error('Push:', err.statusCode || err.message);
      }
    }
  }));
};

// Avisa sobre um pedido pronto para entrega: o motoboy escolhido ou todos os disponíveis
const notifyDelivery = async (orderId) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.motoboy_id, o.problem,
              COALESCE(NULLIF(o.delivery_neighborhood, ''), c.neighborhood) AS neighborhood
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1`,
      [orderId]
    );
    const order = rows[0];
    if (!order || order.status !== 'Preparando' || order.problem) return;

    const where = order.motoboy_id
      ? { sql: 'id = $1', params: [order.motoboy_id] }
      : { sql: 'online = true', params: [] };
    const moto = await pool.query(
      `SELECT id FROM customers WHERE role = 'motoboy' AND active = true AND ${where.sql}`,
      where.params
    );
    const place = order.neighborhood && order.neighborhood !== '-' ? ` · ${order.neighborhood}` : '';
    await sendTo(moto.rows.map(m => m.id), {
      title: order.motoboy_id ? '🛵 Entrega nova para você!' : '📋 Nova entrega disponível!',
      body: `Pedido #${order.id}${place}. Toque para abrir.`,
      tag: `pedido-${order.id}`
    });
  } catch (err) {
    console.error('Erro ao enviar notificação:', err.message);
  }
};

// 🛒 Avisa os admins (pedido novo, entrega que voltou...)
const notifyAdmins = async (payload) => {
  try {
    const { rows } = await pool.query(`SELECT id FROM customers WHERE role = 'admin'`);
    await sendTo(rows.map(r => r.id), payload);
  } catch (err) {
    console.error('Erro ao avisar o admin:', err.message);
  }
};

const PAY = { pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro' };

const notifyNewOrder = async (orderId) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.total, o.payment_method, c.name,
              COALESCE(NULLIF(o.delivery_neighborhood, ''), c.neighborhood) AS neighborhood
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1`,
      [orderId]
    );
    const o = rows[0];
    if (!o) return;
    const place = o.neighborhood && o.neighborhood !== '-' ? ` · ${o.neighborhood}` : '';
    await notifyAdmins({
      title: `🛒 Pedido novo #${o.id}`,
      body: `R$ ${parseFloat(o.total).toFixed(2).replace('.', ',')} · ${PAY[o.payment_method] || 'Dinheiro'} · ${(o.name || '').split(' ')[0]}${place}`,
      tag: `admin-pedido-${o.id}`
    });
  } catch (err) {
    console.error('Erro ao avisar pedido novo:', err.message);
  }
};

// 🔔 Avisos para o celular do cliente (só sobre o pedido dele, só se ele ativou)
const notifyCustomer = async (customerId, payload) => {
  try {
    await sendTo([customerId], { url: '/?ver=pedidos', ...payload });
  } catch (err) {
    console.error('Erro ao avisar o cliente:', err.message);
  }
};

const STATUS_MESSAGES = {
  Preparando: (id) => ({ title: '✅ Pagamento confirmado!', body: `Pedido #${id}: já estamos separando suas compras.` }),
  'Saído': (id) => ({ title: '🛵 Seu pedido saiu para entrega!', body: `Pedido #${id} está a caminho.` }),
  Entregue: (id) => ({ title: '✅ Pedido entregue!', body: `Pedido #${id}. Obrigado por comprar no Empório Brumado!` }),
  Cancelado: (id) => ({ title: '❌ Pedido cancelado', body: `Pedido #${id} foi cancelado. Qualquer dúvida, fale com o Empório.` })
};

// Mudou a situação do pedido → avisa o cliente.
// "Preparando" só avisa quando vem do PIX conferido (no dinheiro/cartão o pedido já nasce assim).
const notifyOrderStatus = async (orderId, status, oldStatus) => {
  if (!STATUS_MESSAGES[status] || status === oldStatus) return;
  if (status === 'Preparando' && oldStatus !== 'Pendente') return;
  try {
    const { rows } = await pool.query('SELECT customer_id FROM orders WHERE id = $1', [orderId]);
    if (!rows[0]) return;
    await notifyCustomer(rows[0].customer_id, { ...STATUS_MESSAGES[status](orderId), tag: `meu-pedido-${orderId}` });
  } catch (err) {
    console.error('Erro ao avisar o cliente:', err.message);
  }
};

// Rotas de inscrição (motoboy e admin usam as mesmas): o mesmo celular pode receber avisos de duas contas
const subscribeHandler = async (req, res) => {
  const sub = req.body.subscription || {};
  if (typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: 'Inscrição inválida' });
  }
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (customer_id, endpoint, keys) VALUES ($1, $2, $3)
       ON CONFLICT (endpoint, customer_id) DO UPDATE SET keys = $3`,
      [req.user.id, sub.endpoint, JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth })]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao ativar notificações' });
  }
};

const unsubscribeHandler = async (req, res) => {
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
};

const keyHandler = async (req, res) => {
  try {
    res.json({ key: await getPublicKey() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Notificações indisponíveis' });
  }
};

module.exports = {
  getPublicKey, notifyDelivery, notifyAdmins, notifyNewOrder, notifyCustomer, notifyOrderStatus,
  subscribeHandler, unsubscribeHandler, keyHandler
};
