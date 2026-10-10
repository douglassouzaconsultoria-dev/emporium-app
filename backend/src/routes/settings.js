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

module.exports = router;
