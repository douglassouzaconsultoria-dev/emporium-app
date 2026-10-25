const { Pool, types } = require('pg');

// Colunas NUMERIC (preço, estoque, quantidade em kg) chegam como número, não texto
types.setTypeParser(1700, parseFloat);
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  // DB_SSL=false só no banco local/dos testes automáticos (o do Render usa SSL)
  ssl: process.env.DB_SSL === 'false' ? false : {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('Database error:', err);
});

module.exports = pool;