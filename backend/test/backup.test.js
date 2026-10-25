// 🧪 Backup de verdade: baixa pelo app, restaura num banco vazio com o scripts/restore-backup.js
// e confere se voltou tudo igual (dados, preços em kg, datas e a numeração dos pedidos)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const { startApp, seed, token } = require('./helpers');

let ctx, db, adminToken;
const restored = 'emporio_test_restore';

const connect = async (database) => {
  const c = new Client({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database, ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await c.connect();
  return c;
};

before(async () => {
  ctx = await startApp('backup');
  db = seed(ctx.pool);
  const cat = await db.category('Frios');
  await db.product({ name: 'Queijo minas', price: 39.9, unit: 'kg', estoque: 2.75, category_id: cat.id });
  await db.product({ name: 'Presunto', price: 29.9, promo_price: 24.9, unit: 'kg', category_id: cat.id });
  const client = await db.customer('Joana');
  await db.fee('Centro', 5);
  const res = await ctx.api('POST', '/orders', {
    items: [{ product_id: 1, quantity: 0.35 }], delivery_address: 'Rua B, 1', delivery_neighborhood: 'Centro', payment_method: 'dinheiro'
  }, token(client));
  assert.equal(res.status, 201, JSON.stringify(res.data));
  adminToken = token({ id: (await db.customer('Dono', 'admin')).id, role: 'admin' });
});

after(async () => {
  if (ctx) await ctx.close();
  const admin = await connect('postgres');
  await admin.query(`DROP DATABASE IF EXISTS ${restored} WITH (FORCE)`);
  await admin.end();
});

test('♻️ backup baixado pelo app volta inteiro num banco vazio', async () => {
  const res = await fetch(ctx.api.base + '/backup/download', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'emporio-')), 'backup.json.gz');
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));

  const admin = await connect('postgres');
  await admin.query(`DROP DATABASE IF EXISTS ${restored} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${restored}`);
  await admin.end();

  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), file], {
    env: { ...process.env, DB_NAME: restored }, stdio: 'pipe'
  });

  const copy = await connect(restored);
  try {
    for (const table of ['products', 'customers', 'orders', 'order_items', 'categories', 'delivery_fees']) {
      const a = (await ctx.pool.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
      const b = (await copy.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
      assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)), `tabela ${table} diferente`);
    }
    // o próximo pedido continua a numeração (não repete o #1)
    const next = await copy.query(
      `INSERT INTO orders (customer_id, total, status) VALUES (1, 1, 'Pendente') RETURNING id`
    );
    assert.equal(next.rows[0].id, 2);
  } finally {
    await copy.end();
  }
});

test('📅 baixar o backup anota a data (lembrete de 30 dias no admin)', async () => {
  const res = await ctx.api('GET', '/backup', undefined, adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.data.downloaded, 'data do último download');
  assert.ok(Date.now() - new Date(res.data.downloaded) < 60000);
});

test('♻️ o restaurar não mexe num banco que já tem dados', async () => {
  const res = await fetch(ctx.api.base + '/backup/download', { headers: { Authorization: `Bearer ${adminToken}` } });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'emporio-')), 'backup.json.gz');
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), file], {
    env: { ...process.env, DB_NAME: restored }, stdio: 'pipe'
  }));
});
