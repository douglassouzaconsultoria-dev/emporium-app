const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');
const { sanitize, getStore, storeStatus } = require('../utils/store');

// 🔓 GET - configurações da loja + se está aberta agora (vitrine e checkout usam)
router.get('/store', async (req, res) => {
  try {
    const { default_motoboy_id, ...store } = await getStore(pool); // motoboy padrão é só do admin
    res.json({ ...store, status: storeStatus(store) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar configurações da loja' });
  }
});

// 🔒 GET - configurações completas (painel admin)
router.get('/store/admin', verifyAdmin, async (req, res) => {
  try {
    const store = await getStore(pool);
    res.json({ ...store, status: storeStatus(store) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar configurações da loja' });
  }
});

// 🔒 PUT - salvar configurações da loja
router.put('/store', verifyAdmin, async (req, res) => {
  try {
    const store = sanitize(req.body);
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('store', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(store)]
    );
    res.json({ ...store, status: storeStatus(store) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar configurações da loja' });
  }
});

// 🔒 Ordem das abas do painel admin (lista de ids; a primeira abre ao entrar)
router.get('/admin-tabs', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'admin_tabs'");
    let order = [];
    try {
      order = result.rows[0] ? JSON.parse(result.rows[0].value) : [];
    } catch {
      order = [];
    }
    res.json({ order: Array.isArray(order) ? order : [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar ordem das abas' });
  }
});

router.put('/admin-tabs', verifyAdmin, async (req, res) => {
  try {
    const order = Array.isArray(req.body.order)
      ? req.body.order.filter(id => typeof id === 'string' && /^[a-z]{1,30}$/.test(id)).slice(0, 50)
      : [];
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('admin_tabs', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(order)]
    );
    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar ordem das abas' });
  }
});

module.exports = router;
