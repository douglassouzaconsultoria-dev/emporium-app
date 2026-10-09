// 💡 Alertas e oportunidades calculados com regras fixas (sem IA)
// Cada regra só dispara com base mínima de dados e descreve fatos — nunca inventa causas.
const { isKg } = require('./units');

const brl = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v, unit) => (isKg(unit)
  ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
  : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un`);
const pct = (v) => `${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const change = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// "#3, #4, #5, #6, #7 e mais 27" — evita listas enormes
const ids = (orders) => orders.slice(0, 5).map(o => `#${o.id}`).join(', ')
  + (orders.length > 5 ? ` e mais ${orders.length - 5}` : '');

const PRIORITY = { alta: 0, media: 1, baixa: 2 };

const buildInsights = (data, products) => {
  const { current: cur, previous: prev, period } = data;
  const out = [];
  const add = (i) => out.push(i);

  // 1) Reposição: produto que vende e está acabando (ritmo dos últimos 30 dias)
  products
    .filter(p => p.sold_30d > 0 && p.estoque <= 10)
    .map(p => ({ ...p, daysLeft: p.estoque <= 0 ? 0 : p.estoque / (p.sold_30d / 30) }))
    .filter(p => p.daysLeft < 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5)
    .forEach(p => add({
      id: `estoque-${p.id}`,
      type: 'alerta',
      priority: p.daysLeft < 2 ? 'alta' : 'media',
      title: p.estoque <= 0 ? `${p.name} está sem estoque` : `${p.name} deve acabar em breve`,
      fact: p.estoque <= 0
        ? `Vendeu ${qty(p.sold_30d, p.unit)} nos últimos 30 dias e o estoque está zerado.`
        : `Restam ${qty(p.estoque, p.unit)}. No ritmo dos últimos 30 dias (${qty(p.sold_30d, p.unit)}), dura cerca de ${plural(Math.max(1, Math.round(p.daysLeft)), 'dia', 'dias')}.`,
      recommendation: 'Priorize a reposição deste produto.'
    }));

  // 2) Pedidos parados agora (não depende do período)
  const stalePix = data.open_orders.filter(o => o.status === 'Pendente' && o.payment_method === 'pix' && o.minutes >= 30);
  const stale = data.open_orders.filter(o => o.status === 'Pendente' && o.payment_method !== 'pix' && o.minutes >= 30);
  if (stalePix.length) {
    add({
      id: 'pix-pendente',
      type: 'operacao',
      priority: 'alta',
      title: `${plural(stalePix.length, 'pedido PIX aguardando', 'pedidos PIX aguardando')} há mais de 30 min`,
      fact: `${stalePix.length === 1 ? 'Pedido' : 'Pedidos'} ${ids(stalePix)} em Pendente.`,
      recommendation: 'Confira no app do banco se o PIX caiu e mude o status, ou fale com o cliente.'
    });
  }
  if (stale.length) {
    add({
      id: 'pedido-parado',
      type: 'operacao',
      priority: 'alta',
      title: `${plural(stale.length, 'pedido', 'pedidos')} em Pendente há mais de 30 min`,
      fact: `${stale.length === 1 ? 'Pedido' : 'Pedidos'} ${ids(stale)} ainda sem ir para Preparando.`,
      recommendation: 'Abra a aba Pedidos e dê andamento.'
    });
  }

  // 3) Cancelamentos acima do normal
  if (cur.orders_total >= 5 && cur.status.Cancelado >= 2 && cur.cancel_rate >= 10) {
    add({
      id: 'cancelamentos',
      type: 'alerta',
      priority: cur.cancel_rate >= 20 ? 'alta' : 'media',
      title: `${pct(cur.cancel_rate)} dos pedidos foram cancelados`,
      fact: `${cur.status.Cancelado} de ${cur.orders_total} pedidos do período foram cancelados.`,
      recommendation: 'Veja os pedidos cancelados na aba Pedidos para entender o que se repete.'
    });
  }

  // 4) Vendas subindo ou caindo (base mínima de 5 pedidos no período anterior)
  const revChange = change(cur.revenue, prev.revenue);
  if (revChange !== null && prev.orders_valid >= 5 && Math.abs(revChange) >= 20) {
    const deltas = data.categories
      .map(c => ({ name: c.name, diff: c.revenue - c.previous }))
      .sort((a, b) => (revChange > 0 ? b.diff - a.diff : a.diff - b.diff));
    const top = deltas[0];
    const catNote = top && Math.abs(top.diff) > 0
      ? ` A categoria que mais ${revChange > 0 ? 'cresceu' : 'caiu'} foi ${top.name} (${top.diff > 0 ? '+' : '−'}${brl(Math.abs(top.diff))}).`
      : '';
    add({
      id: 'vendas',
      type: revChange > 0 ? 'oportunidade' : 'alerta',
      priority: revChange > 0 ? 'baixa' : 'media',
      title: `Vendas ${revChange > 0 ? 'subiram' : 'caíram'} ${pct(revChange)} em relação ao período anterior`,
      fact: `${brl(cur.revenue)} em produtos contra ${brl(prev.revenue)} no período anterior.${catNote}`,
      recommendation: revChange > 0
        ? 'Mantenha em estoque os produtos que puxaram o crescimento.'
        : 'Compare os produtos mais vendidos dos dois períodos para ver o que deixou de sair.'
    });
  }

  // 5) Bairro pagando taxa padrão com frequência → cadastrar com o valor certo
  data.neighborhoods
    .filter(n => !n.in_list && n.name !== 'Não informado' && n.orders >= 3)
    .slice(0, 3)
    .forEach(n => add({
      id: `bairro-${n.name}`,
      type: 'oportunidade',
      priority: 'media',
      title: `${n.name} não está na lista de taxas`,
      fact: `${n.orders} pedidos de ${n.name} no período pagaram a taxa padrão (${brl(n.fees)} em taxas).`,
      recommendation: 'Cadastre o bairro na aba Taxas de entrega com o valor que faz sentido pela distância.'
    }));

  // 6) Clientes que se cadastraram e ainda não compraram
  if (cur.new_without_orders >= 3) {
    add({
      id: 'cadastro-sem-pedido',
      type: 'oportunidade',
      priority: 'media',
      title: `${plural(cur.new_without_orders, 'cliente novo ainda não fez', 'clientes novos ainda não fizeram')} pedido`,
      fact: `Dos ${cur.new_customers} cadastros do período, ${cur.new_without_orders} nunca compraram.`,
      recommendation: 'Mande uma mensagem pelo WhatsApp (aba Clientes) convidando para o primeiro pedido.'
    });
  }

  // 7) Cadastros caindo (base mínima de 5 no período anterior)
  const custChange = change(cur.new_customers, prev.new_customers);
  if (custChange !== null && prev.new_customers >= 5 && custChange <= -30) {
    add({
      id: 'cadastros',
      type: 'alerta',
      priority: 'baixa',
      title: `Novos cadastros caíram ${pct(custChange)}`,
      fact: `${cur.new_customers} cadastros contra ${prev.new_customers} no período anterior.`,
      recommendation: 'Divulgue o link do app nos grupos e no balcão da loja.'
    });
  }

  // 8) Vendas concentradas em um produto
  const leader = data.top_products[0];
  if (leader && cur.orders_valid >= 10 && cur.revenue > 0) {
    const share = (leader.revenue / cur.revenue) * 100;
    if (share >= 40) {
      add({
        id: 'concentracao',
        type: 'tendencia',
        priority: 'baixa',
        title: `${leader.name} responde por ${pct(share)} das vendas`,
        fact: `${brl(leader.revenue)} de ${brl(cur.revenue)} em produtos no período.`,
        recommendation: 'Não deixe faltar este produto e avalie destacar outros itens na loja.'
      });
    }
  }

  // 9) Produtos com estoque que não venderam (período de pelo menos 7 dias)
  const idle = data.stock.no_sales;
  if (period.days >= 7 && cur.orders_valid >= 5 && idle.length > 0) {
    add({
      id: 'sem-venda',
      type: 'tendencia',
      priority: 'baixa',
      title: `${plural(idle.length, 'produto com estoque não vendeu', 'produtos com estoque não venderam')} no período`,
      fact: `${idle.slice(0, 5).map(p => p.name).join(', ')}${idle.length > 5 ? ' e outros' : ''}.`,
      recommendation: 'Confira se estão visíveis na loja e com preço competitivo.'
    });
  }

  return out.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]);
};

module.exports = { buildInsights };
