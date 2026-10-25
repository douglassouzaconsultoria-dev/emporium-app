// 🧪 Erros recentes: erro no servidor fica anotado para o admin (e só para ele)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, seed, token } = require('./helpers');

let ctx, adminToken, clientToken;

before(async () => {
  ctx = await startApp('errors');
  const db = seed(ctx.pool);
  adminToken = token({ id: (await db.customer('Dono', 'admin')).id, role: 'admin' });
  clientToken = token(await db.customer('Ana'));
});

after(async () => ctx && ctx.close());

const wait = () => new Promise(resolve => setTimeout(resolve, 300));

test('⚠️ erro 500 fica anotado com o endereço e a mensagem', async () => {
  try {
    // simula um problema: a tabela de cupons some
    await ctx.pool.query('ALTER TABLE coupons RENAME TO coupons_x');
    const res = await ctx.api('GET', '/coupons', undefined, adminToken);
    assert.equal(res.status, 500);
    assert.doesNotMatch(JSON.stringify(res.data), /coupons_x|relation/); // o detalhe não vai para quem chamou
  } finally {
    await ctx.pool.query('ALTER TABLE coupons_x RENAME TO coupons');
  }
  await wait();
  const list = await ctx.api('GET', '/errors', undefined, adminToken);
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].path, '/api/coupons');
  assert.equal(list.data[0].method, 'GET');
  assert.match(list.data[0].message, /coupons/);
});

test('🔒 cliente não vê nem apaga os erros', async () => {
  assert.equal((await ctx.api('GET', '/errors', undefined, clientToken)).status, 403);
  assert.equal((await ctx.api('DELETE', '/errors', undefined, clientToken)).status, 403);
});

test('🧹 limpar a lista', async () => {
  assert.equal((await ctx.api('DELETE', '/errors', undefined, adminToken)).status, 200);
  assert.equal((await ctx.api('GET', '/errors', undefined, adminToken)).data.length, 0);
});

test('respostas normais (200, 400, 404) não viram erro', async () => {
  await ctx.api('GET', '/products');
  await ctx.api('POST', '/orders', { items: [] }, clientToken);
  await ctx.api('GET', '/orders/999999', undefined, adminToken);
  await wait();
  assert.equal((await ctx.api('GET', '/errors', undefined, adminToken)).data.length, 0);
});
