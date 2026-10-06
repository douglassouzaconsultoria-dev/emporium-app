const jwt = require('jsonwebtoken');
const pool = require('../utils/database');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seu_segredo_super_seguro_aqui_2024');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Token inválido' });
  }
};

// 🔐 Apenas ADMIN
const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: apenas administradores' });
    }
    next();
  });
};

// 🛵 Apenas MOTOBOY ativo
const verifyMotoboy = (req, res, next) => {
  verifyToken(req, res, async () => {
    if (req.user.role !== 'motoboy') {
      return res.status(403).json({ error: 'Acesso negado: apenas motoboys' });
    }
    try {
      const result = await pool.query('SELECT active FROM customers WHERE id = $1', [req.user.id]);
      if (result.rows.length === 0 || result.rows[0].active === false) {
        return res.status(403).json({ error: 'Conta de motoboy desativada' });
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao verificar motoboy' });
    }
  });
};

module.exports = { verifyToken, verifyAdmin, verifyMotoboy };