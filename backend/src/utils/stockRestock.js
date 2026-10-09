// 🔄 Estoque AUTOMÁTICO: no início de cada período o estoque VOLTA a ser a quantidade configurada
// (não soma: automático 50 com 12 sobrando → 50). Períodos no horário de Brasília:
// DIÁRIA = todo dia · SEMANAL = toda segunda · QUINZENAL = dias 1 e 16 · MENSAL = dia 1
const pool = require('./database');

// Início do período em que o horário `ts` cai, para a frequência da configuração
const periodStart = (ts) => `
  CASE c.auto_frequency
    WHEN 'DIÁRIA' THEN date_trunc('day', ${ts})
    WHEN 'SEMANAL' THEN date_trunc('week', ${ts})
    WHEN 'QUINZENAL' THEN date_trunc('month', ${ts})
      + CASE WHEN EXTRACT(DAY FROM ${ts}) >= 16 THEN INTERVAL '15 days' ELSE INTERVAL '0 days' END
    ELSE date_trunc('month', ${ts})
  END`;

const NOW_BR = "(NOW() AT TIME ZONE 'America/Sao_Paulo')";
const LAST_BR = "(c.last_restocked_at AT TIME ZONE 'America/Sao_Paulo')";

const restockDue = async () => {
  const result = await pool.query(`
    WITH due AS (
      UPDATE product_stock_config c
      SET last_restocked_at = NOW()
      WHERE c.type = 'AUTOMÁTICO'
        AND (c.last_restocked_at IS NULL OR ${periodStart(LAST_BR)} < ${periodStart(NOW_BR)})
      RETURNING c.product_id, c.auto_quantity
    )
    UPDATE products p SET estoque = due.auto_quantity
    FROM due
    WHERE p.id = due.product_id
    RETURNING p.name, p.estoque
  `);
  if (result.rowCount > 0) {
    console.log(`🔄 Estoque renovado: ${result.rows.map(r => `${r.name} = ${r.estoque}`).join(', ')}`);
  }
};

// Confere ao ligar e a cada hora (se o servidor dormiu, renova assim que acordar)
const startStockRestock = () => {
  const run = () => restockDue().catch(err => console.error('Erro ao renovar estoque:', err));
  run();
  setInterval(run, 60 * 60 * 1000);
};

module.exports = { startStockRestock, restockDue };
