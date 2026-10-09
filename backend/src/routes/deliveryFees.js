const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');
const { normalize } = require('../utils/deliveryFee');

const parseFee = (value) => {
  const fee = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(fee) && fee >= 0 ? Math.round(fee * 100) / 100 : null;
};

// 🔓 GET - lista de bairros + taxa padrão (o checkout usa)
router.get('/', async (req, res) => {
  try {
    const fees = await pool.query('SELECT * FROM delivery_fees ORDER BY fee, neighborhood');
    const setting = await pool.query("SELECT value FROM app_settings WHERE key = 'default_delivery_fee'");
    res.json({
      fees: fees.rows,
      default_fee: parseFloat(setting.rows[0]?.value) || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar taxas de entrega' });
  }
});

// 🔒 PUT - taxa padrão (bairros fora da lista)
router.put('/default', verifyAdmin, async (req, res) => {
  try {
    const fee = parseFee(req.body.default_fee);
    if (fee === null) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('default_delivery_fee', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(fee)]
    );
    res.json({ default_fee: fee });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar taxa padrão' });
  }
});

// Impede bairro repetido escrito diferente ("Eneas" x "Enéas")
const isDuplicate = async (neighborhood, ignoreId) => {
  const all = await pool.query('SELECT id, neighborhood FROM delivery_fees');
  return all.rows.some(f => f.id !== ignoreId && normalize(f.neighborhood) === normalize(neighborhood));
};

// 🔒 POST - novo bairro
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const neighborhood = (req.body.neighborhood || '').trim();
    const fee = parseFee(req.body.fee);
    if (!neighborhood || fee === null) {
      return res.status(400).json({ error: 'Informe o bairro e um valor válido' });
    }
    if (await isDuplicate(neighborhood)) {
      return res.status(400).json({ error: 'Esse bairro já está na lista' });
    }
    const result = await pool.query(
      'INSERT INTO delivery_fees (neighborhood, fee) VALUES ($1, $2) RETURNING *',
      [neighborhood, fee]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar bairro' });
  }
});

// 🔒 PUT - editar bairro
router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const neighborhood = (req.body.neighborhood || '').trim();
    const fee = parseFee(req.body.fee);
    if (!neighborhood || fee === null) {
      return res.status(400).json({ error: 'Informe o bairro e um valor válido' });
    }
    if (await isDuplicate(neighborhood, id)) {
      return res.status(400).json({ error: 'Esse bairro já está na lista' });
    }
    const result = await pool.query(
      'UPDATE delivery_fees SET neighborhood = $1, fee = $2 WHERE id = $3 RETURNING *',
      [neighborhood, fee, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bairro não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar bairro' });
  }
});

// 🔒 DELETE - remover bairro
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM delivery_fees WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bairro não encontrado' });
    }
    res.json({ message: 'Bairro removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover bairro' });
  }
});

module.exports = router;
