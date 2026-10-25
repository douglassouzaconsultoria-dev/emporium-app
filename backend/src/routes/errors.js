const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');

// ⚠️ Erros recentes do servidor (só o admin vê)
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, method, path, status, message, stack FROM error_logs ORDER BY id DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar os erros' });
  }
});

// 🧹 Limpar a lista (depois de conferir)
router.delete('/', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM error_logs');
    res.json({ message: 'Lista de erros limpa' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao limpar' });
  }
});

module.exports = router;
