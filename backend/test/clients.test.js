// 🧪 Favoritos, senha nova com aprovação do admin e avisos do pedido no celular do cliente
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');
const { startApp, seed, token } = require('./helpers');

// Notificações: em vez de mandar de verdade, guarda o que seria enviado
const sent = [];
webpush.sendNotification = async (sub, payload) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); };

let ctx, db, cat, ana, anaToken, adminToken, otherToken;

before(async () => {
  ctx = await startApp('clients');
  db = seed(ctx.pool);
  cat = await db.category();
  const hash = await bcrypt.hash('senha-antiga', 4);
  ana = (await ctx.pool.query(
    `INSERT INTO customers (name, username, email, phone_number, password, role)
     VALUES ('Ana Souza', 'ana', 'ana@email.com', '(34) 99876-5432', $1, 'client') RETURNING *`, [hash]
  )).rows[0];
  anaToken = token(ana);
  adminToken = token({ id: (await db.customer('Dono', 'admin')).id, role: 'admin' });
  otherToken = token(await db.customer('Outro'));
  await db.fee('Centro', 5);
});

after(async () => ctx && ctx.close());

const wait = () => new Promise(resolve => setTimeout(resolve, 300));
const subscribe = (t, name) => ctx.api('POST', '/auth/push-subscribe', {
  subscription: { endpoint: `https://push.example.com/${name}`, keys: { p256dh: 'x', auth: 'y' } }
}, t);

// ---------- ❤️ Favoritos ----------

test('❤️ favoritar, listar (mais recente primeiro) e tirar', async () => {
  const a = await db.product({ name: 'Café', price: 10, category_id: cat.id });
  const b = await db.product({ name: 'Leite', price: 5, category_id: cat.id });
  assert.equal((await ctx.api('PUT', `/favorites/${a.id}`, undefined, anaToken)).status, 200);
  await ctx.api('PUT', `/favorites/${b.id}`, undefined, anaToken);
  await ctx.api('PUT', `/favorites/${b.id}`, undefined, anaToken); // repetir não duplica
  assert.deepEqual((await ctx.api('GET', '/favorites', undefined, anaToken)).data, [b.id, a.id]);
  // cada cliente tem os seus
  assert.deepEqual((await ctx.api('GET', '/favorites', undefined, otherToken)).data, []);
  await ctx.api('DELETE', `/favorites/${a.id}`, undefined, anaToken);
  assert.deepEqual((await ctx.api('GET', '/favorites', undefined, anaToken)).data, [b.id]);
  // produto que não existe é ignorado; sem login não entra
  await ctx.api('PUT', '/favorites/999999', undefined, anaToken);
  assert.deepEqual((await ctx.api('GET', '/favorites', undefined, anaToken)).data, [b.id]);
  assert.equal((await ctx.api('GET', '/favorites')).status, 401);
});

// ---------- 🔑 Esqueci a senha ----------

test('🔑 pedido → admin aprova → código cria a senha nova e já entra', async () => {
  await subscribe(adminToken, 'admin-cel');
  sent.length = 0;
  const ask = await ctx.api('POST', '/auth/forgot', { login: '34 99876-5432' }); // pelo telefone
  assert.equal(ask.status, 200);
  await wait();
  assert.ok(sent.some(n => n.endpoint.endsWith('admin-cel') && /Ana Souza/.test(n.body)), 'admin avisado');

  // sem aprovação, nenhum código vale
  assert.equal((await ctx.api('POST', '/auth/reset', { login: 'ana', code: '123456', password: 'nova123' })).status, 400);

  const list = await ctx.api('GET', '/customers/password-requests', undefined, adminToken);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].username, 'ana');
  const approve = await ctx.api('POST', `/customers/password-requests/${list.data[0].id}/approve`, undefined, adminToken);
  assert.equal(approve.status, 200);
  assert.match(approve.data.code, /^\d{6}$/);

  const reset = await ctx.api('POST', '/auth/reset', { login: 'ANA', code: approve.data.code, password: 'senha-nova' });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.ok(reset.data.token);
  assert.equal(reset.data.user.username, 'ana');

  // senha nova entra, antiga não; o código não serve duas vezes
  assert.equal((await ctx.api('POST', '/auth/login', { login: 'ana', password: 'senha-nova' })).status, 200);
  assert.equal((await ctx.api('POST', '/auth/login', { login: 'ana', password: 'senha-antiga' })).status, 401);
  assert.equal((await ctx.api('POST', '/auth/reset', { login: 'ana', code: approve.data.code, password: 'outra123' })).status, 400);
});

test('🔑 conta que não existe recebe a mesma resposta (não entrega quem tem conta)', async () => {
  const real = await ctx.api('POST', '/auth/forgot', { login: 'ana@email.com' });
  const fake = await ctx.api('POST', '/auth/forgot', { login: 'ninguem' });
  assert.equal(fake.status, real.status);
  assert.equal(fake.data.message, real.data.message);
});

test('🔑 5 códigos errados: o código para de valer', async () => {
  const { data: [req] } = await ctx.api('GET', '/customers/password-requests', undefined, adminToken);
  const { data: { code } } = await ctx.api('POST', `/customers/password-requests/${req.id}/approve`, undefined, adminToken);
  const wrongCode = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) {
    assert.equal((await ctx.api('POST', '/auth/reset', { login: 'ana', code: wrongCode, password: 'x123456' })).status, 400);
  }
  const fifth = await ctx.api('POST', '/auth/reset', { login: 'ana', code: wrongCode, password: 'x123456' });
  assert.match(fifth.data.error, /5 vezes/);
  assert.equal((await ctx.api('POST', '/auth/reset', { login: 'ana', code, password: 'x123456' })).status, 400);
});

test('🔑 recusar pedido e cliente comum não aprova nada', async () => {
  await ctx.api('POST', '/auth/forgot', { login: 'ana' });
  const { data: [req] } = await ctx.api('GET', '/customers/password-requests', undefined, adminToken);
  assert.equal((await ctx.api('POST', `/customers/password-requests/${req.id}/approve`, undefined, anaToken)).status, 403);
  assert.equal((await ctx.api('GET', '/customers/password-requests', undefined, anaToken)).status, 403);
  await ctx.api('POST', `/customers/password-requests/${req.id}/deny`, undefined, adminToken);
  assert.equal((await ctx.api('GET', '/customers/password-requests', undefined, adminToken)).data.length, 0);
});

// ---------- 🔔 Avisos do pedido ----------

test('🔔 cliente com aviso ligado recebe: pagamento confirmado, saiu para entrega, entregue', async () => {
  await subscribe(anaToken, 'ana-cel');
  const p = await db.product({ name: 'Arroz', price: 20, category_id: cat.id });
  const res = await ctx.api('POST', '/orders', {
    items: [{ product_id: p.id, quantity: 1 }], delivery_address: 'Rua A', delivery_neighborhood: 'Centro', payment_method: 'pix'
  }, anaToken);
  const id = res.data.id;
  sent.length = 0;
  const mine = () => sent.filter(n => n.endpoint.endsWith('ana-cel'));

  await ctx.api('PUT', `/orders/${id}`, { status: 'Preparando' }, adminToken);
  await wait();
  assert.equal(mine().at(-1).title, '✅ Pagamento confirmado!');

  await ctx.api('POST', '/orders/bulk-status', { ids: [id], status: 'Saído' }, adminToken);
  await wait();
  assert.equal(mine().at(-1).title, '🛵 Seu pedido saiu para entrega!');
  assert.match(mine().at(-1).body, new RegExp(`#${id}`));

  await ctx.api('PUT', `/orders/${id}`, { status: 'Entregue' }, adminToken);
  await wait();
  assert.equal(mine().at(-1).title, '✅ Pedido entregue!');
  assert.equal(mine().length, 3);
  assert.equal(mine().at(-1).url, '/?ver=pedidos');
  // ninguém mais recebe o aviso do pedido da Ana (o admin só recebe "pedido novo")
  assert.ok(!sent.some(n => !n.endpoint.endsWith('ana-cel') && /Pedido #/.test(n.body) && /entreg|confirmado/i.test(n.title)));
});

test('🔔 pedido no dinheiro não avisa "pagamento confirmado"; cancelado avisa', async () => {
  const p = await db.product({ name: 'Feijão', price: 9, category_id: cat.id });
  const res = await ctx.api('POST', '/orders', {
    items: [{ product_id: p.id, quantity: 1 }], delivery_address: 'Rua A', delivery_neighborhood: 'Centro', payment_method: 'dinheiro'
  }, anaToken);
  sent.length = 0;
  await ctx.api('PUT', `/orders/${res.data.id}`, { status: 'Cancelado' }, adminToken);
  await wait();
  const mine = sent.filter(n => n.endpoint.endsWith('ana-cel'));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].title, '❌ Pedido cancelado');
});

test('🔔 motoboy marcando "saiu" e "entregue" também avisa o cliente', async () => {
  const moto = await db.customer('Zé Moto', 'motoboy');
  const motoToken = token({ id: moto.id, role: 'motoboy' });
  const p = await db.product({ name: 'Óleo', price: 8, category_id: cat.id });
  const res = await ctx.api('POST', '/orders', {
    items: [{ product_id: p.id, quantity: 1 }], delivery_address: 'Rua A', delivery_neighborhood: 'Centro', payment_method: 'cartao'
  }, anaToken);
  await ctx.pool.query('UPDATE orders SET motoboy_id = $1 WHERE id = $2', [moto.id, res.data.id]);
  sent.length = 0;
  assert.equal((await ctx.api('PUT', `/motoboys/me/deliveries/${res.data.id}/status`, { status: 'Saído' }, motoToken)).status, 200);
  assert.equal((await ctx.api('PUT', `/motoboys/me/deliveries/${res.data.id}/status`, { status: 'Entregue' }, motoToken)).status, 200);
  await wait();
  assert.deepEqual(sent.filter(n => n.endpoint.endsWith('ana-cel')).map(n => n.title), ['🛵 Seu pedido saiu para entrega!', '✅ Pedido entregue!']);
});

test('🔔 aprovar senha nova também manda o código para o celular do cliente', async () => {
  await ctx.api('POST', '/auth/forgot', { login: 'ana' });
  const { data: [req] } = await ctx.api('GET', '/customers/password-requests', undefined, adminToken);
  sent.length = 0;
  const { data: { code } } = await ctx.api('POST', `/customers/password-requests/${req.id}/approve`, undefined, adminToken);
  await wait();
  const mine = sent.filter(n => n.endpoint.endsWith('ana-cel'));
  assert.equal(mine.length, 1);
  assert.match(mine[0].body, new RegExp(code));
});
