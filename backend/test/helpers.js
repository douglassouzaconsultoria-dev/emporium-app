// 🧪 Ajudantes dos testes automáticos (npm test)
// Cada arquivo de teste ganha um banco novo e vazio (emporio_test_<nome>), cria o que precisa e apaga no fim.
// Usa as variáveis DB_HOST, DB_PORT, DB_USER, DB_PASSWORD do ambiente (no GitHub vêm do .github/workflows/tests.yml).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-dos-testes';
process.env.DB_SSL = process.env.DB_SSL || 'false';

const adminDb = () => new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'postgres',
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

const resetDatabase = async (name) => {
  const client = adminDb();
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${name}`);
  await client.end();
};

const dropDatabase = async (name) => {
  const client = adminDb();
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await client.end();
};

// Sobe o app num banco novo. Retorna { pool, api, token, close, ... }
const startApp = async (name) => {
  const database = `emporio_test_${name}`;
  await resetDatabase(database);
  process.env.DB_NAME = database;

  const pool = require('../src/utils/database');
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const { app, migrate } = require('../src/server');
  await migrate();

  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://localhost:${server.address().port}/api`;

  const api = async (method, url, body, token) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };

  api.base = base;

  const close = async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => setTimeout(resolve, 200)); // avisos (push) que ainda estão terminando
    await pool.end();
    await dropDatabase(database);
  };

  return { pool, api, close, database };
};

const token = (user) => jwt.sign({ id: user.id, role: user.role || 'client' }, process.env.JWT_SECRET);

// 🏗️ Cadastros rápidos para os testes
const seed = (pool) => ({
  category: async (name = 'Mercearia', extra = {}) => (await pool.query(
    'INSERT INTO categories (name, adult) VALUES ($1, $2) RETURNING *', [name, extra.adult === true]
  )).rows[0],
  product: async (p) => (await pool.query(
    `INSERT INTO products (name, price, promo_price, unit, category_id, estoque, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [p.name, p.price, p.promo_price ?? null, p.unit || 'un', p.category_id, p.estoque ?? 100, p.active !== false]
  )).rows[0],
  customer: async (name = 'Cliente', role = 'client') => (await pool.query(
    `INSERT INTO customers (name, username, phone_number, role) VALUES ($1, $2, '34999990000', $3) RETURNING *`,
    [name, `${name.toLowerCase().replace(/\s+/g, '')}${Date.now()}${Math.random().toString(36).slice(2, 6)}`, role]
  )).rows[0],
  fee: async (neighborhood, fee) => pool.query('INSERT INTO delivery_fees (neighborhood, fee) VALUES ($1, $2)', [neighborhood, fee]),
  setting: async (key, value) => pool.query(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, typeof value === 'string' ? value : JSON.stringify(value)]
  ),
  coupon: async (c) => (await pool.query(
    'INSERT INTO coupons (code, type, value, min_order, max_uses) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [c.code, c.type || 'percent', c.value, c.min_order || 0, c.max_uses ?? null]
  )).rows[0],
  schedule: async (s) => (await pool.query(
    `INSERT INTO product_schedules (product_id, kind, promo_price, start_at, end_at, weekdays, time_from, time_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [s.product_id, s.kind, s.promo_price ?? null, s.start_at ?? null, s.end_at ?? null, s.weekdays ?? null, s.time_from ?? null, s.time_to ?? null]
  )).rows[0]
});

module.exports = { startApp, seed, token };
