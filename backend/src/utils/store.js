// 🏪 Configurações da loja: horário de funcionamento, pedido mínimo, aviso
// Tudo fica num JSON em app_settings (key = 'store')

const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const DEFAULT_STORE = {
  min_order: 0,
  hours_enabled: false, // desligado = loja sempre aberta (só o "fechar agora" vale)
  hours: DAYS.map((_, i) => ({ closed: i === 0, open: '07:00', close: '20:00' })),
  closed_now: false,
  notice: '',
  default_motoboy_id: null // todo pedido novo já entra com esse motoboy (dá para trocar no pedido)
};

const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');

// Junta o salvo com o padrão (campos novos/faltando não quebram)
const sanitize = (raw = {}) => {
  const hours = DEFAULT_STORE.hours.map((def, i) => {
    const h = Array.isArray(raw.hours) ? raw.hours[i] || {} : {};
    return {
      closed: typeof h.closed === 'boolean' ? h.closed : def.closed,
      open: isTime(h.open) ? h.open : def.open,
      close: isTime(h.close) ? h.close : def.close
    };
  });
  const minOrder = parseFloat(String(raw.min_order ?? 0).replace(',', '.'));
  return {
    min_order: Number.isFinite(minOrder) && minOrder > 0 ? Math.round(minOrder * 100) / 100 : 0,
    hours_enabled: raw.hours_enabled === true,
    hours,
    closed_now: raw.closed_now === true,
    notice: typeof raw.notice === 'string' ? raw.notice.trim().slice(0, 200) : '',
    default_motoboy_id: parseInt(raw.default_motoboy_id) > 0 ? parseInt(raw.default_motoboy_id) : null
  };
};

const getStore = async (db) => {
  const result = await db.query("SELECT value FROM app_settings WHERE key = 'store'");
  try {
    return sanitize(result.rows[0] ? JSON.parse(result.rows[0].value) : {});
  } catch {
    return sanitize({});
  }
};

// Dia da semana e "HH:MM" no horário da Bahia
const nowInBahia = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bahia', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type).value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, time: `${get('hour')}:${get('minute')}` };
};

const openAt = (h, time) => (h.open <= h.close
  ? time >= h.open && time < h.close
  : time >= h.open || time < h.close); // vira a madrugada (ex: 18:00 às 02:00)

// { open, message } — message explica quando abre
const storeStatus = (store, date = new Date()) => {
  if (store.closed_now) {
    return { open: false, message: 'A loja está fechada no momento.' };
  }
  if (!store.hours_enabled) return { open: true, message: '' };

  const { day, time } = nowInBahia(date);
  const today = store.hours[day];
  if (!today.closed && openAt(today, time)) {
    return { open: true, message: `Aberto até ${today.close}` };
  }
  if (!today.closed && time < today.open) {
    return { open: false, message: `Fechado agora. Abre hoje às ${today.open}.` };
  }
  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7;
    const h = store.hours[d];
    if (!h.closed) {
      const when = i === 1 ? 'amanhã' : DAYS[d];
      return { open: false, message: `Fechado agora. Abre ${when} às ${h.open}.` };
    }
  }
  return { open: false, message: 'Fechado agora.' };
};

module.exports = { DEFAULT_STORE, sanitize, getStore, storeStatus };
