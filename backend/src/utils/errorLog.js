// ⚠️ Erros recentes: todo erro do servidor fica guardado para o admin ver (Admin → 🏪 Loja)
// O cliente nunca vê nada disso. Guarda os últimos 200, por no máximo 30 dias.
const { AsyncLocalStorage } = require('async_hooks');
const pool = require('./database');

const store = new AsyncLocalStorage();
const originalError = console.error.bind(console);

const save = (entry) => {
  // Se falhar ao guardar, avisa pelo console.error original (não entra em loop)
  pool.query(
    `WITH ins AS (
       INSERT INTO error_logs (method, path, status, message, stack) VALUES ($1, $2, $3, $4, $5)
     )
     DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days'
        OR id <= (SELECT id FROM error_logs ORDER BY id DESC OFFSET 199 LIMIT 1)`,
    [entry.method || null, entry.path || null, entry.status || null,
      String(entry.message || 'Erro').slice(0, 500), entry.stack ? String(entry.stack).slice(0, 3000) : null]
  )
    .catch(err => originalError('Não consegui guardar o erro:', err.message));
};

const describe = (args) => {
  const err = args.find(a => a instanceof Error);
  const text = args.filter(a => typeof a === 'string').join(' ');
  return {
    message: [text, err && err.message].filter(Boolean).join(' ') || 'Erro',
    stack: err && err.stack
  };
};

// Todo console.error passa por aqui: dentro de uma requisição, guarda para salvar junto com o endereço;
// fora (rotinas automáticas: backup, estoque), salva na hora
console.error = (...args) => {
  originalError(...args);
  const ctx = store.getStore();
  if (ctx) {
    if (!ctx.error) ctx.error = describe(args);
  } else if (args.some(a => a instanceof Error) || /erro/i.test(String(args[0]))) {
    save({ path: '(rotina automática)', ...describe(args) });
  }
};

// Middleware: quando a resposta sai com erro 500, guarda o que aconteceu
const errorLogger = (req, res, next) => {
  const ctx = {};
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      save({ method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ...(ctx.error || { message: 'Erro sem detalhe' }) });
    }
  });
  store.run(ctx, next);
};

module.exports = { errorLogger };
