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
app.use('/api/delivery-fees', require('./routes/deliveryFees'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', app: 'EMPÓRIO BRUMADO' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 🔎 Confere variáveis de ambiente obrigatórias (mostra só os nomes, nunca os valores)
const missingEnv = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_PORT', 'JWT_SECRET',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter(v => !process.env[v]);
console.log(missingEnv.length ? `🔎 Variáveis faltando: ${missingEnv.join(', ')}` : '🔎 Variáveis OK');
if ((process.env.JWT_SECRET || '').startsWith('GERE_UMA_CHAVE')) {
  console.log('⚠️ JWT_SECRET ainda é o valor de exemplo — troque por uma chave secreta');
}

// 🧱 Cria colunas/tabelas novas que o banco de produção ainda não tem (não apaga nada)
require('./utils/database').query(`
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS motoboy_id INTEGER REFERENCES customers(id);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'dinheiro';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_neighborhood TEXT;
  CREATE TABLE IF NOT EXISTS delivery_fees (
    id SERIAL PRIMARY KEY,
    neighborhood VARCHAR(100) UNIQUE NOT NULL,
    fee NUMERIC(10,2) NOT NULL
  );
  ALTER TABLE products ALTER COLUMN estoque TYPE NUMERIC(10,3);
  ALTER TABLE product_stock_config ALTER COLUMN auto_quantity TYPE NUMERIC(10,3);
  ALTER TABLE product_stock_config ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMPTZ;
  UPDATE product_stock_config SET last_restocked_at = NOW() WHERE type = 'AUTOMÁTICO' AND last_restocked_at IS NULL;
  ALTER TABLE order_items ALTER COLUMN quantity TYPE NUMERIC(10,3);
  CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR(50) PRIMARY KEY, value TEXT);
  INSERT INTO app_settings (key, value) VALUES ('default_delivery_fee', '5') ON CONFLICT (key) DO NOTHING;
  INSERT INTO delivery_fees (neighborhood, fee)
    SELECT * FROM (VALUES ('Morada Nova', 1.00), ('Enéas', 2.00), ('Dona Diva', 2.00)) AS v(neighborhood, fee)
    WHERE NOT EXISTS (SELECT 1 FROM delivery_fees);
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
  .then(() => require('./utils/stockRestock').startStockRestock())
  .then(() => {
    // 🔎 Confere se o banco tem todas as colunas que o código usa (só leitura)
    const expected = {
      customers: ['id', 'name', 'username', 'email', 'password', 'phone_number', 'address', 'neighborhood', 'role', 'active', 'avatar_url', 'created_at'],
      orders: ['id', 'customer_id', 'total', 'status', 'delivery_address', 'payment_method', 'created_at', 'motoboy_id', 'delivered_at', 'delivery_fee', 'delivery_neighborhood'],
      order_items: ['order_id', 'product_id', 'quantity', 'price'],
      products: ['id', 'name', 'price', 'unit', 'category_id', 'image_url', 'estoque'],
      categories: ['id', 'name', 'created_at'],
      product_stock_config: ['product_id', 'type', 'auto_quantity', 'auto_frequency', 'updated_at']
    };
    return require('./utils/database').query(
      "SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public'"
    ).then(({ rows }) => {
      const required = rows
        .filter(r => r.is_nullable === 'NO' && !r.column_default && expected[r.table_name])
        .map(r => `${r.table_name}.${r.column_name}`);
      console.log(`🔎 Colunas obrigatórias: ${required.join(', ')}`);
      const have = new Set(rows.map(r => `${r.table_name}.${r.column_name}`));
      const missing = Object.entries(expected)
        .flatMap(([t, cols]) => cols.map(c => `${t}.${c}`))
        .filter(tc => !have.has(tc));
      console.log(missing.length ? `🔎 Faltando no banco: ${missing.join(', ')}` : '🔎 Banco completo: todas as colunas OK');
    });
  })
  .catch(err => console.error('Erro ao atualizar banco:', err));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🛒 EMPÓRIO BRUMADO API rodando em http://localhost:${PORT}`);
});