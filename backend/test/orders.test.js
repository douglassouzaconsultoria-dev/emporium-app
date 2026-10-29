// 🧪 Contas do pedido: preço, kg, oferta, oferta programada, cupom, taxa, troco e estoque
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, seed, token } = require('./helpers');

let ctx, db, cat, client, clientToken, adminToken;

before(async () => {
  ctx = await startApp('orders');
  db = seed(ctx.pool);
  cat = await db.category();
  client = await db.customer('Maria');
  clientToken = token(client);
  adminToken = token({ id: (await db.customer('Dono', 'admin')).id, role: 'admin' });
  await db.fee('Centro', 5);
  await db.setting('default_delivery_fee', '8');
});

after(async () => ctx && ctx.close());

const product = (p) => db.product({ category_id: cat.id, ...p });
const order = (items, extra = {}) => ctx.api('POST', '/orders', {
  items: items.map(([p, quantity]) => ({ product_id: p.id, quantity })),
  delivery_address: 'Rua A, 10',
  delivery_neighborhood: 'Centro',
  payment_method: 'dinheiro',
  ...extra
}, clientToken);
const stockOf = async (p) => parseFloat((await ctx.pool.query('SELECT estoque FROM products WHERE id = $1', [p.id])).rows[0].estoque);
const itemsOf = async (orderId) => (await ctx.pool.query('SELECT product_id, quantity, price FROM order_items WHERE order_id = $1 ORDER BY product_id', [orderId])).rows;

test('produto por unidade: preço × quantidade + taxa do bairro, e baixa o estoque', async () => {
  const arroz = await product({ name: 'Arroz', price: 4.99, estoque: 10 });
  const res = await order([[arroz, 3]]);
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.data.order.total, 19.97); // 14,97 + 5,00
  assert.equal(res.data.order.delivery_fee, 5);
  assert.equal(await stockOf(arroz), 7);
});

test('vários produtos somam certo', async () => {
  const a = await product({ name: 'Feijão', price: 8.49 });
  const b = await product({ name: 'Óleo', price: 7.9 });
  const res = await order([[a, 2], [b, 1]]);
  assert.equal(res.status, 201);
  assert.equal(res.data.order.total, 29.88); // 16,98 + 7,90 + 5,00
});

test('produto por kg aceita gramas e cobra proporcional', async () => {
  const queijo = await product({ name: 'Queijo', price: 39.9, unit: 'kg', estoque: 5 });
  const res = await order([[queijo, 0.25]]);
  assert.equal(res.status, 201);
  assert.equal(res.data.order.total, 14.98); // 9,98 (250 g) + 5,00
  assert.equal(await stockOf(queijo), 4.75);
  const [item] = await itemsOf(res.data.id);
  assert.equal(parseFloat(item.quantity), 0.25);
});

test('produto por unidade não aceita quantidade quebrada', async () => {
  const p = await product({ name: 'Sabão', price: 3 });
  const res = await order([[p, 1.5]]);
  assert.equal(res.status, 400);
  assert.equal(await stockOf(p), 100);
});

test('quantidade zero ou negativa é recusada', async () => {
  const p = await product({ name: 'Sal', price: 2 });
  assert.equal((await order([[p, 0]])).status, 400);
  assert.equal((await order([[p, -2]])).status, 400);
});

test('preço de oferta vale quando é menor que o normal', async () => {
  const p = await product({ name: 'Café', price: 20, promo_price: 15.5 });
  const res = await order([[p, 2]]);
  assert.equal(res.data.order.total, 36); // 31,00 + 5,00
  assert.equal((await itemsOf(res.data.id))[0].price, 15.5);
});

test('oferta maior ou igual ao preço normal é ignorada', async () => {
  const p = await product({ name: 'Açúcar', price: 5, promo_price: 6 });
  const res = await order([[p, 1]]);
  assert.equal(res.data.order.total, 10);
});

test('🗓️ oferta programada valendo agora entra no preço', async () => {
  const p = await product({ name: 'Cerveja', price: 6 });
  await db.schedule({ product_id: p.id, kind: 'promo', promo_price: 4.5 });
  const res = await order([[p, 4]]);
  assert.equal(res.data.order.total, 23); // 18,00 + 5,00
});

test('🗓️ oferta programada que ainda não começou não entra', async () => {
  const p = await product({ name: 'Refrigerante', price: 9 });
  await db.schedule({ product_id: p.id, kind: 'promo', promo_price: 7, start_at: '2999-01-01T00:00' });
  const res = await order([[p, 1]]);
  assert.equal(res.data.order.total, 14);
});

test('🗓️ produto fora do horário programado não pode ser pedido', async () => {
  const p = await product({ name: 'Pão de queijo', price: 1 });
  await db.schedule({ product_id: p.id, kind: 'available', start_at: '2999-01-01T00:00' });
  const res = await order([[p, 2]]);
  assert.equal(res.status, 400);
  assert.match(res.data.error, /só está disponível/);
  assert.equal(await stockOf(p), 100);
});

test('produto oculto não pode ser pedido', async () => {
  const p = await product({ name: 'Antigo', price: 1, active: false });
  assert.equal((await order([[p, 1]])).status, 400);
});

test('sem estoque suficiente: recusa e não mexe em nada', async () => {
  const a = await product({ name: 'Leite', price: 5, estoque: 10 });
  const b = await product({ name: 'Manteiga', price: 12, estoque: 1 });
  const res = await order([[a, 2], [b, 3]]);
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Estoque insuficiente/);
  assert.equal(await stockOf(a), 10); // o primeiro item também volta
  assert.equal(await stockOf(b), 1);
});

test('🛵 taxa: bairro escrito diferente acha o mesmo; bairro fora da lista usa a taxa padrão', async () => {
  const p = await product({ name: 'Biscoito', price: 3 });
  const a = await order([[p, 1]], { delivery_neighborhood: '  CENTRO ' });
  assert.equal(a.data.order.delivery_fee, 5);
  assert.equal(a.data.order.delivery_neighborhood, 'Centro');
  const b = await order([[p, 1]], { delivery_neighborhood: 'Bairro Novo' });
  assert.equal(b.data.order.delivery_fee, 8);
  assert.equal(b.data.order.total, 11);
});

test('🎟️ cupom de porcentagem desconta só dos produtos (não da taxa)', async () => {
  const p = await product({ name: 'Carne', price: 50 });
  await db.coupon({ code: 'DEZ', value: 10 });
  const res = await order([[p, 1]], { coupon_code: 'dez' });
  assert.equal(res.status, 201);
  assert.equal(res.data.order.discount, 5);
  assert.equal(res.data.order.total, 50); // 50 - 5 + 5
  const { rows: [c] } = await ctx.pool.query("SELECT uses FROM coupons WHERE code = 'DEZ'");
  assert.equal(c.uses, 1);
});

test('🎟️ cupom de valor fixo nunca passa do valor dos produtos', async () => {
  const p = await product({ name: 'Bala', price: 2 });
  await db.coupon({ code: 'VINTE', type: 'fixed', value: 20 });
  const res = await order([[p, 1]], { coupon_code: 'VINTE' });
  assert.equal(res.data.order.discount, 2);
  assert.equal(res.data.order.total, 5); // só a taxa
});

test('🎟️ cupom: pedido abaixo do mínimo, esgotado ou inexistente é recusado', async () => {
  const p = await product({ name: 'Chocolate', price: 10 });
  await db.coupon({ code: 'MIN100', value: 10, min_order: 100 });
  await db.coupon({ code: 'UMAVEZ', value: 10, max_uses: 1 });
  assert.equal((await order([[p, 1]], { coupon_code: 'MIN100' })).status, 400);
  assert.equal((await order([[p, 1]], { coupon_code: 'UMAVEZ' })).status, 201);
  assert.equal((await order([[p, 1]], { coupon_code: 'UMAVEZ' })).status, 400);
  assert.equal((await order([[p, 1]], { coupon_code: 'NAOEXISTE' })).status, 400);
});

test('💵 troco menor que o total é recusado; troco certo é salvo', async () => {
  const p = await product({ name: 'Frango', price: 20 });
  assert.equal((await order([[p, 1]], { change_for: '20' })).status, 400); // total 25
  const res = await order([[p, 1]], { change_for: '50,00' });
  assert.equal(res.status, 201);
  assert.equal(res.data.order.change_for, 50);
});

test('📝 recado do pagamento só é guardado no dinheiro', async () => {
  const p = await product({ name: 'Ovos', price: 12 });
  const cash = await order([[p, 1]], { payment_note: 'anotar na notinha' });
  assert.equal(cash.data.order.payment_note, 'anotar na notinha');
  const pix = await order([[p, 1]], { payment_method: 'pix', payment_note: 'anotar' });
  assert.equal(pix.data.order.payment_note, null);
});

test('PIX espera conferência (Pendente); dinheiro e cartão já vão para Preparando', async () => {
  const p = await product({ name: 'Macarrão', price: 4 });
  assert.equal((await order([[p, 1]], { payment_method: 'pix' })).data.order.status, 'Pendente');
  assert.equal((await order([[p, 1]], { payment_method: 'cartao' })).data.order.status, 'Preparando');
  assert.equal((await order([[p, 1]], { payment_method: 'cheque' })).status, 400);
});

test('🏪 pedido mínimo e loja fechada', async () => {
  const p = await product({ name: 'Chiclete', price: 1 });
  await db.setting('store', { min_order: 30 });
  const small = await order([[p, 2]]);
  assert.equal(small.status, 400);
  assert.match(small.data.error, /pedido mínimo/);
  await db.setting('store', { closed_now: true });
  assert.equal((await order([[p, 40]])).status, 400);
  await db.setting('store', {});
  assert.equal((await order([[p, 40]])).status, 201);
});

test('❌ cancelar devolve os itens ao estoque', async () => {
  const p = await product({ name: 'Detergente', price: 2.5, estoque: 10 });
  const res = await order([[p, 4]]);
  assert.equal(await stockOf(p), 6);
  const cancel = await ctx.api('PUT', `/orders/${res.data.id}`, { status: 'Cancelado' }, adminToken);
  assert.equal(cancel.status, 200);
  assert.equal(await stockOf(p), 10);
  // cancelado não volta
  assert.equal((await ctx.api('PUT', `/orders/${res.data.id}`, { status: 'Preparando' }, adminToken)).status, 400);
});

test('✏️ admin edita os itens: mantém o preço antigo, ajusta o estoque e recalcula o total', async () => {
  const p = await product({ name: 'Iogurte', price: 3, estoque: 20 });
  const novo = await product({ name: 'Granola', price: 10, estoque: 20 });
  const res = await order([[p, 2]]);
  await ctx.pool.query('UPDATE products SET price = 4 WHERE id = $1', [p.id]); // preço mudou depois do pedido
  const edit = await ctx.api('PUT', `/orders/${res.data.id}/items`, {
    items: [{ product_id: p.id, quantity: 5 }, { product_id: novo.id, quantity: 1 }]
  }, adminToken);
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(edit.data.order.total, 30); // 5 × 3,00 (preço do pedido) + 10,00 + 5,00 de taxa
  assert.equal(await stockOf(p), 15);
  assert.equal(await stockOf(novo), 19);
});

test('🔒 cliente não vê pedido de outro cliente', async () => {
  const p = await product({ name: 'Vela', price: 1 });
  const res = await order([[p, 1]]);
  const other = token(await db.customer('Outro'));
  assert.equal((await ctx.api('GET', `/orders/${res.data.id}`, undefined, other)).status, 403);
  assert.equal((await ctx.api('GET', `/orders/${res.data.id}`, undefined, clientToken)).status, 200);
});

test('🔒 cliente não acessa rotas do admin', async () => {
  assert.equal((await ctx.api('GET', '/orders', undefined, clientToken)).status, 403);
  assert.equal((await ctx.api('GET', '/orders')).status, 401);
});

test('💳 acréscimo no cartão: cigarro +R$ 1,00 cada só no cartão, fora do cupom e do pedido mínimo', async () => {
  const cigarro = await product({ name: 'Cigarro X', price: 12 });
  const leite = await product({ name: 'Leite Y', price: 5 });
  await ctx.pool.query('UPDATE products SET card_extra = 1 WHERE id = $1', [cigarro.id]);

  const card = await order([[cigarro, 3], [leite, 2]], { payment_method: 'cartao' });
  assert.equal(card.status, 201, JSON.stringify(card.data));
  assert.equal(card.data.order.card_extra, 3); // 3 maços × R$ 1,00
  assert.equal(card.data.order.total, 54); // 36 + 10 + 5 de taxa + 3
  assert.equal((await itemsOf(card.data.id)).find(i => i.product_id === cigarro.id).price, 12); // preço do item não muda

  const cash = await order([[cigarro, 3]], { payment_method: 'dinheiro' });
  assert.equal(cash.data.order.card_extra, 0);
  assert.equal(cash.data.order.total, 41);
  const pix = await order([[cigarro, 3]], { payment_method: 'pix' });
  assert.equal(pix.data.order.card_extra, 0);

  // cupom de 10% vale só sobre os produtos (36), não sobre o acréscimo
  await db.coupon({ code: 'CIG10', value: 10 });
  const withCoupon = await order([[cigarro, 3]], { payment_method: 'cartao', coupon_code: 'CIG10' });
  assert.equal(withCoupon.data.order.discount, 3.6);
  assert.equal(withCoupon.data.order.total, 40.4); // 36 - 3,60 + 5 + 3

  // editar itens recalcula o acréscimo
  const edit = await ctx.api('PUT', `/orders/${card.data.id}/items`, {
    items: [{ product_id: cigarro.id, quantity: 1 }, { product_id: leite.id, quantity: 2 }]
  }, adminToken);
  assert.equal(edit.status, 200);
  assert.equal(edit.data.order.card_extra, 1);
  assert.equal(edit.data.order.total, 28); // 12 + 10 + 5 + 1
});

test('💳 cadastro aceita o acréscimo e recusa valor negativo', async () => {
  const fd = (extra) => {
    const f = new FormData();
    f.append('name', 'Cigarro Z'); f.append('price', '10'); f.append('unit', 'un'); f.append('category_id', String(cat.id));
    if (extra !== undefined) f.append('card_extra', extra);
    return f;
  };
  const post = async (body, url = '/products', method = 'POST') => {
    const res = await fetch(ctx.api.base + url, { method, body, headers: { Authorization: `Bearer ${adminToken}` } });
    return { status: res.status, data: await res.json() };
  };
  const created = await post(fd('1,00'));
  assert.equal(created.status, 201);
  assert.equal(parseFloat(created.data.card_extra), 1);
  assert.equal((await post(fd('-1'))).status, 400);
  // editar sem o campo mantém o acréscimo
  const kept = await post(fd(), `/products/${created.data.id}`, 'PUT');
  assert.equal(parseFloat(kept.data.card_extra), 1);
  // planilha: coluna acrescimo_cartao
  const imp = await ctx.api('POST', '/products/import', { rows: [{ id: created.data.id, nome: 'Cigarro Z', preco: '10', categoria: 'Mercearia', acrescimo_cartao: '' }] }, adminToken);
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  const { rows: [p] } = await ctx.pool.query('SELECT card_extra FROM products WHERE id = $1', [created.data.id]);
  assert.equal(parseFloat(p.card_extra), 0);
});
