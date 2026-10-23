// 🗓️ Programação de produtos (tudo no horário de Brasília)
// kind 'promo'     → preço de oferta que só vale dentro da programação
// kind 'available' → o produto só pode ser pedido dentro da programação (fora dela aparece com o horário)
// Cada regra pode ter: período (start_at/end_at "AAAA-MM-DDTHH:MM"), dias da semana ("0,6" = dom e sáb)
// e horário do dia (time_from/time_to "HH:MM"). O que ficar vazio não limita.

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Agora em Brasília: { stamp: "2026-10-23T14:05", weekday: 5, time: "14:05" }
const nowBR = (date = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
  }).formatToParts(date).map(p => [p.type, p.value]));
  const time = `${parts.hour}:${parts.minute}`;
  return {
    stamp: `${parts.year}-${parts.month}-${parts.day}T${time}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    time
  };
};

const weekdaysOf = (rule) => String(rule.weekdays || '').split(',').filter(d => d !== '').map(Number);

const ruleActive = (rule, now = nowBR()) => {
  if (rule.active === false) return false;
  if (rule.start_at && now.stamp < rule.start_at) return false;
  if (rule.end_at && now.stamp >= rule.end_at) return false;
  const days = weekdaysOf(rule);
  if (days.length && !days.includes(now.weekday)) return false;
  if (rule.time_from && rule.time_to) {
    // Horário que vira a noite (ex: 22:00–02:00) também funciona
    return rule.time_from <= rule.time_to
      ? now.time >= rule.time_from && now.time < rule.time_to
      : now.time >= rule.time_from || now.time < rule.time_to;
  }
  if (rule.time_from && now.time < rule.time_from) return false;
  if (rule.time_to && now.time >= rule.time_to) return false;
  return true;
};

// "Sáb e Dom, 8h–12h" / "Seg a Sex" / "todo dia, 6h–11h"
const hour = (t) => (t.endsWith(':00') ? `${parseInt(t)}h` : t.replace(':', 'h'));
const describe = (rule) => {
  const days = weekdaysOf(rule).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // semana começando na segunda
  const parts = [];
  if (days.length && days.length < 7) {
    parts.push(days.join() === '1,2,3,4,5' ? 'Seg a Sex' : days.map(d => DAYS[d]).join(days.length === 2 ? ' e ' : ', '));
  }
  if (rule.time_from || rule.time_to) parts.push(`${hour(rule.time_from || '00:00')}–${hour(rule.time_to || '23:59')}`);
  let text = parts.join(', ') || 'todo dia';
  const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  if (rule.start_at && rule.end_at) text += ` (${dm(rule.start_at)} a ${dm(rule.end_at)})`;
  else if (rule.start_at) text += ` (a partir de ${dm(rule.start_at)})`;
  else if (rule.end_at) text += ` (até ${dm(rule.end_at)})`;
  return text;
};

const loadSchedules = async (db) => (await db.query(
  `SELECT id, product_id, kind, promo_price, start_at, end_at, weekdays, time_from, time_to, active
   FROM product_schedules WHERE active`
)).rows;

// Aplica as programações valendo agora na lista de produtos (não altera o banco)
// - oferta programada vira o promo_price (a menor que estiver valendo)
// - produto com "disponível só em..." ganha available_now e available_label
const applySchedules = (products, rules, now = nowBR()) => products.map(p => {
  const mine = rules.filter(r => r.product_id === p.id);
  if (!mine.length) return p;
  const out = { ...p };
  const promos = mine.filter(r => r.kind === 'promo' && ruleActive(r, now))
    .map(r => parseFloat(r.promo_price))
    .filter(v => v > 0 && v < parseFloat(p.price));
  if (promos.length) {
    const best = Math.min(...promos);
    const own = parseFloat(p.promo_price);
    out.promo_price = own > 0 && own < best ? own : best;
  }
  const avail = mine.filter(r => r.kind === 'available');
  if (avail.length) {
    out.available_now = avail.some(r => ruleActive(r, now));
    out.available_label = avail.map(describe).join(' · ');
  }
  return out;
});

module.exports = { nowBR, ruleActive, describe, loadSchedules, applySchedules };
