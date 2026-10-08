const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: ['https://emporium-web-lm44.onrender.com', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('public/images')); // imagens antigas (antes do Cloudinary)

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/motoboys', require('./routes/motoboys'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', app: 'EMPÓRIO BRUMADO' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 🧱 Cria colunas/tabelas novas que o banco de produção ainda não tem (não apaga nada)
require('./utils/database').query(`
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS motoboy_id INTEGER REFERENCES customers(id);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
  CREATE TABLE IF NOT EXISTS product_stock_config (
    id SERIAL PRIMARY KEY,
    product_id INTEGER UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(20) DEFAULT 'MANUAL',
    auto_quantity INTEGER DEFAULT 50,
    auto_frequency VARCHAR(20) DEFAULT 'SEMANAL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`)
  .then(() => console.log('🧱 Banco atualizado'))
  .catch(err => console.error('Erro ao atualizar banco:', err));

// 👑 Redefine a senha do usuário "admin" e garante role admin (senha vem da variável ADMIN_PASSWORD)
if (process.env.ADMIN_PASSWORD) {
  const pool = require('./utils/database');
  const bcrypt = require('bcryptjs');
  bcrypt.hash(process.env.ADMIN_PASSWORD, 10)
    .then(hash => pool.query(
      "UPDATE customers SET password = $1, role = 'admin' WHERE LOWER(username) = 'admin'",
      [hash]
    ))
    .then(r => console.log(`👑 Usuário admin atualizado (${r.rowCount})`))
    .catch(err => console.error('Erro ao atualizar admin:', err));
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🛒 EMPÓRIO BRUMADO API rodando em http://localhost:${PORT}`);
});