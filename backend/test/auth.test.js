// 🧪 Login: senha errada bloqueia, admin com login mais curto, renovação
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { startApp, token } = require('./helpers');

let ctx;

before(async () => {
  ctx = await startApp('auth');
  const hash = await bcrypt.hash('senha-certa', 4);
  await ctx.pool.query(
    `INSERT INTO customers (name, username, password, role, active) VALUES
     ('Dono', 'dono', $1, 'admin', true), ('Ana', 'ana', $1, 'client', true), ('Ex', 'ex', $1, 'client', false)`,
    [hash]
  );
});

after(async () => ctx && ctx.close());

const login = (user, password) => ctx.api('POST', '/auth/login', { login: user, password });
const daysValid = (t) => {
  const { iat, exp } = jwt.decode(t);
  return Math.round((exp - iat) / 86400);
};

test('login certo: admin vale 7 dias e cliente 30', async () => {
  const admin = await login('dono', 'senha-certa');
  assert.equal(admin.status, 200);
  assert.equal(daysValid(admin.data.token), 7);
  const client = await login('ANA', 'senha-certa');
  assert.equal(client.status, 200);
  assert.equal(daysValid(client.data.token), 30);
  assert.equal(client.data.user.password, undefined); // senha nunca vai para o navegador
});

test('5 senhas erradas bloqueiam esse usuário por 15 minutos (até com a senha certa)', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login('ana', 'errada')).status, 401);
  const blocked = await login('ana', 'senha-certa');
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /15 minutos/);
  // outro usuário continua entrando
  assert.equal((await login('dono', 'senha-certa')).status, 200);
});

test('acertar a senha zera as erradas', async () => {
  for (let i = 0; i < 4; i++) await login('dono', 'errada');
  assert.equal((await login('dono', 'senha-certa')).status, 200);
  for (let i = 0; i < 4; i++) await login('dono', 'errada');
  assert.equal((await login('dono', 'senha-certa')).status, 200);
});

test('usuário que não existe também conta como tentativa errada', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login('fantasma', 'x')).status, 401);
  assert.equal((await login('fantasma', 'x')).status, 429);
});

test('conta desativada não entra', async () => {
  assert.equal((await login('ex', 'senha-certa')).status, 403);
});

test('🔄 renovar: devolve um login novo; conta desativada ou login inválido não renova', async () => {
  const { rows } = await ctx.pool.query("SELECT id, role FROM customers WHERE username IN ('dono', 'ex') ORDER BY username");
  const [dono, ex] = rows;
  const res = await ctx.api('POST', '/auth/refresh', undefined, token(dono));
  assert.equal(res.status, 200);
  assert.equal(res.data.user.role, 'admin');
  assert.equal(daysValid(res.data.token), 7);
  assert.equal((await ctx.api('POST', '/auth/refresh', undefined, token(ex))).status, 403);
  assert.equal((await ctx.api('POST', '/auth/refresh', undefined, 'token-falso')).status, 403);
  const expired = jwt.sign({ id: dono.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: -10 });
  assert.equal((await ctx.api('POST', '/auth/refresh', undefined, expired)).status, 403);
});
