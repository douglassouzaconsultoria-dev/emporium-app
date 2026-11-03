// 🧪 Fotos no nosso banco: tratar, entregar, trazer do Cloudinary e limpar as sem uso
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const axios = require('axios');
const { startApp, seed, token } = require('./helpers');

let ctx, db, cat, adminToken;

// Foto de teste: produto vermelho no meio de um fundo branco
const photo = () => sharp({ create: { width: 1200, height: 900, channels: 3, background: '#ffffff' } })
  .composite([{ input: { create: { width: 300, height: 500, channels: 3, background: '#c41e3a' } }, top: 200, left: 450 }])
  .jpeg().toBuffer();

before(async () => {
  ctx = await startApp('images');
  db = seed(ctx.pool);
  cat = await db.category();
  adminToken = token({ id: (await db.customer('Dono', 'admin')).id, role: 'admin' });
});

after(async () => ctx && ctx.close());

const upload = async (path, fields, method = 'POST') => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Buffer) fd.append(k, new Blob([v], { type: 'image/jpeg' }), 'foto.jpg');
    else fd.append(k, v);
  }
  const res = await fetch(ctx.api.base + path, { method, body: fd, headers: { Authorization: `Bearer ${adminToken}` } });
  return { status: res.status, data: await res.json() };
};
const getImg = async (url) => {
  const res = await fetch(ctx.api.base.replace('/api', '') + url);
  return { status: res.status, type: res.headers.get('content-type'), cache: res.headers.get('cache-control'), buf: Buffer.from(await res.arrayBuffer()) };
};

test('📷 "Ver como vai ficar" sem tirar o fundo: centraliza 800x800 aqui mesmo e guarda no nosso banco', async () => {
  const res = await upload('/products/image-preview', { image: await photo(), remove_bg: 'false' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.match(res.data.url, /^\/api\/img\/[a-f0-9]{24}$/);
  assert.equal(res.data.removed_bg, false);

  const full = await getImg(res.data.url);
  assert.equal(full.status, 200);
  assert.equal(full.type, 'image/jpeg');
  assert.match(full.cache, /immutable/);
  const meta = await sharp(full.buf).metadata();
  assert.deepEqual([meta.width, meta.height], [800, 800]);

  const small = await getImg(res.data.url + '?w=400');
  assert.equal(small.type, 'image/webp');
  const sm = await sharp(small.buf).metadata();
  assert.ok(sm.width <= 400 && sm.height <= 400);
  assert.ok(small.buf.length < full.buf.length);
});

test('📷 tirar o fundo com o Cloudinary fora do ar: não trava, só centraliza e avisa', async () => {
  const res = await upload('/products/image-preview', { image: await photo(), remove_bg: 'true' });
  assert.equal(res.status, 200);
  assert.equal(res.data.removed_bg, false);
  assert.match(res.data.url, /^\/api\/img\//);
});

test('🛍️ produto salvo com a foto pronta e com foto enviada direto', async () => {
  const prev = await upload('/products/image-preview', { image: await photo(), remove_bg: 'false' });
  const a = await upload('/products', { name: 'Arroz', price: '10', unit: 'un', category_id: String(cat.id), image_url: prev.data.url });
  assert.equal(a.status, 201);
  assert.equal(a.data.image_url, prev.data.url);
  const b = await upload('/products', { name: 'Feijão', price: '8', unit: 'un', category_id: String(cat.id), image: await photo() });
  assert.equal(b.status, 201);
  assert.match(b.data.image_url, /^\/api\/img\//);
  assert.equal((await getImg(b.data.image_url)).status, 200);
});

test('🖼️ código inválido ou inexistente não quebra', async () => {
  assert.equal((await getImg('/api/img/xyz')).status, 404);
  assert.equal((await getImg('/api/img/' + 'a'.repeat(24))).status, 404);
});

test('📦 trazer as fotos do Cloudinary: copia, troca os endereços (produto, banner, perfil, mídia) e não repete', async () => {
  const cloud = (name) => `https://res.cloudinary.com/teste/image/upload/v1/emporio-brumado/produtos/${name}.jpg`;
  const img = await photo();
  // Simula o Cloudinary: uma foto existe, a outra está bloqueada
  const realGet = axios.get;
  axios.get = async (url, opts) => {
    if (url === cloud('bloqueada')) { const e = new Error('blocked'); e.response = { status: 401 }; throw e; }
    if (url.startsWith('https://res.cloudinary.com/')) return { data: img, headers: { 'content-type': 'image/jpeg' } };
    return realGet(url, opts);
  };
  try {
    const p = await db.product({ name: 'Leite', price: 5, category_id: cat.id });
    await ctx.pool.query('UPDATE products SET image_url = $1 WHERE id = $2', [cloud('leite'), p.id]);
    const p2 = await db.product({ name: 'Café', price: 15, category_id: cat.id });
    await ctx.pool.query('UPDATE products SET image_url = $1 WHERE id = $2', [cloud('bloqueada'), p2.id]);
    const cli = await db.customer('Ana');
    await ctx.pool.query('UPDATE customers SET avatar_url = $1 WHERE id = $2', [cloud('leite'), cli.id]);
    await db.setting('banners', { enabled: true, items: [{ image_url: cloud('leite'), link_type: 'none' }] });
    await ctx.pool.query(`INSERT INTO media_files (name, url, resource_type, format) VALUES ('arte', $1, 'image', 'jpg')`, [cloud('leite')]);

    const before = await ctx.api('GET', '/images/migrate', undefined, adminToken);
    assert.equal(before.data.left, 2);
    assert.equal((await ctx.api('POST', '/images/migrate', undefined, adminToken)).data.started, true);
    let st;
    for (let i = 0; i < 50; i++) {
      st = (await ctx.api('GET', '/images/migrate', undefined, adminToken)).data;
      if (!st.running) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(st.done, 1);
    assert.equal(st.failed, 1);
    assert.equal(st.left, 1); // a bloqueada continua no Cloudinary para tentar de novo

    const { rows: [leite] } = await ctx.pool.query('SELECT image_url FROM products WHERE id = $1', [p.id]);
    assert.match(leite.image_url, /^\/api\/img\//);
    const { rows: [ana] } = await ctx.pool.query('SELECT avatar_url FROM customers WHERE id = $1', [cli.id]);
    assert.equal(ana.avatar_url, leite.image_url); // mesma foto → mesma cópia
    const { rows: [ban] } = await ctx.pool.query("SELECT value FROM app_settings WHERE key = 'banners'");
    assert.equal(JSON.parse(ban.value).items[0].image_url, leite.image_url);
    const { rows: [media] } = await ctx.pool.query("SELECT url FROM media_files WHERE name = 'arte'");
    assert.equal(media.url, leite.image_url);
    assert.equal((await getImg(leite.image_url)).status, 200);
  } finally {
    axios.get = realGet;
  }
});

test('🧹 limpeza apaga só as fotos sem uso e antigas', async () => {
  const { cleanupImages } = require('../src/routes/images');
  const unused = await upload('/products/image-preview', { image: await photo(), remove_bg: 'false' });
  const key = unused.data.url.split('/').pop();
  await ctx.pool.query("UPDATE images SET created_at = NOW() - INTERVAL '2 days'"); // todas ficam "antigas"
  await cleanupImages();
  assert.equal((await getImg(unused.data.url)).status, 404, 'prévia não usada foi apagada');
  const { rows } = await ctx.pool.query('SELECT image_url FROM products WHERE image_url LIKE $1', ['/api/img/%']);
  for (const r of rows) assert.equal((await getImg(r.image_url)).status, 200, 'foto em uso continua');
  assert.ok(key);
});

test('🔒 cliente não mexe na cópia das fotos', async () => {
  const cli = token(await db.customer('Zé'));
  assert.equal((await ctx.api('POST', '/images/migrate', undefined, cli)).status, 403);
});
