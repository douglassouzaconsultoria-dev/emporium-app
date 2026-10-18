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

module.exports = { getPublicKey, notifyDelivery };
