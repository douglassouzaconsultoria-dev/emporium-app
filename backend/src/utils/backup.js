// 💾 Backup do banco: estrutura (tabelas, índices, sequências) + todos os dados num arquivo .json.gz
// - Baixar na hora pelo Admin → Loja
// - Cópia automática 1x por dia no Cloudinary (privada), guardando as últimas KEEP
// - Para voltar um backup num banco novo: node scripts/restore-backup.js arquivo.json.gz
const zlib = require('zlib');
const { types } = require('pg');
const axios = require('axios');
const pool = require('./database');
const { cloudinary, uploadBuffer } = require('./cloudinary');

const FOLDER = 'emporio/backups';
const KEEP = 14;
const DAY = 24 * 60 * 60 * 1000;

// Datas e números (preço, estoque) vão exatamente como o banco escreve: sem perder casas nem mudar o fuso
const RAW = new Set([1082, 1083, 1114, 1184, 1266, 1700]);
const rawTypes = { getTypeParser: (oid, format) => (RAW.has(oid) ? (v) => v : types.getTypeParser(oid, format)) };

// Estrutura de cada tabela, do jeito que o próprio Postgres escreve (para recriar igual)
const readSchema = async (client) => {
  const tables = (await client.query(
    `SELECT c.oid, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`
  )).rows;
  const sequences = (await client.query(
    `SELECT sequencename AS name, data_type, start_value, increment_by FROM pg_sequences WHERE schemaname = 'public'`
  )).rows;
  const schema = [];
  for (const t of tables) {
    const columns = (await client.query(
      `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null, a.attidentity AS identity,
              pg_get_expr(d.adbin, d.adrelid) AS default
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [t.oid]
    )).rows;
    const constraints = (await client.query(
      `SELECT conname AS name, contype AS kind, pg_get_constraintdef(oid) AS def, confrelid::regclass::text AS ref
       FROM pg_constraint WHERE conrelid = $1 ORDER BY conname`, [t.oid]
    )).rows;
    const indexes = (await client.query(
      `SELECT indexdef AS def FROM pg_indexes i
       WHERE schemaname = 'public' AND tablename = $1
         AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = i.indexname AND c.conrelid = $2)`,
      [t.name, t.oid]
    )).rows.map(r => r.def);
    schema.push({ name: t.name, columns, constraints, indexes });
  }
  return { tables: schema, sequences };
};

// Monta o backup completo (estrutura + dados) já compactado
const createBackup = async () => {
  const client = await pool.connect();
  try {
    // Tudo numa "foto" só do banco, mesmo se chegar pedido durante o backup
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const schema = await readSchema(client);
    const data = {};
    for (const t of schema.tables) {
      data[t.name] = (await client.query({ text: `SELECT * FROM "${t.name}"`, types: rawTypes })).rows;
    }
    await client.query('COMMIT');
    const json = JSON.stringify({ app: 'emporio-brumado', version: 1, created_at: new Date().toISOString(), schema, data });
    const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
    return { buffer: zlib.gzipSync(json), counts };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// Nome do arquivo com data e hora de Brasília: backup-2026-10-20-0815.json.gz
const fileName = (date = new Date()) => {
  const br = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const p = (n) => String(n).padStart(2, '0');
  return `backup-${br.getFullYear()}-${p(br.getMonth() + 1)}-${p(br.getDate())}-${p(br.getHours())}${p(br.getMinutes())}.json.gz`;
};

const cloudReady = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const listCloud = async () => {
  const res = await cloudinary.api.resources({ resource_type: 'raw', type: 'private', prefix: `${FOLDER}/`, max_results: 100 });
  return res.resources
    .map(r => ({ id: r.public_id.slice(FOLDER.length + 1), bytes: r.bytes, created_at: r.created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
};

// Guarda uma cópia privada no Cloudinary e apaga as mais antigas
const saveToCloud = async () => {
  const { buffer, counts } = await createBackup();
  const id = fileName();
  await uploadBuffer(buffer, { resource_type: 'raw', type: 'private', public_id: `${FOLDER}/${id}`, overwrite: true });
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('backup_last', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [new Date().toISOString()]
  );
  const old = (await listCloud()).slice(KEEP);
  if (old.length) {
    await cloudinary.api.delete_resources(old.map(b => `${FOLDER}/${b.id}`), { resource_type: 'raw', type: 'private' });
  }
  return { id, bytes: buffer.length, counts };
};

// Baixa uma cópia do Cloudinary (link assinado, só o servidor tem a chave)
const downloadCloud = async (id) => {
  const url = cloudinary.utils.private_download_url(`${FOLDER}/${id}`, '', {
    resource_type: 'raw', type: 'private', expires_at: Math.floor(Date.now() / 1000) + 300
  });
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
};

const lastBackupAt = async () => {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'backup_last'");
  return rows[0] ? rows[0].value : null;
};

// Confere ao ligar e a cada hora: passou 1 dia desde a última cópia → faz outra
const startAutoBackup = () => {
  if (!cloudReady()) return console.log('💾 Backup automático desligado (Cloudinary não configurado)');
  const run = async () => {
    try {
      const last = await lastBackupAt();
      if (last && Date.now() - new Date(last).getTime() < DAY) return;
      const b = await saveToCloud();
      console.log(`💾 Backup automático salvo: ${b.id} (${Math.round(b.bytes / 1024)} KB)`);
    } catch (err) {
      console.error('Erro no backup automático:', err.message);
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
};

module.exports = { createBackup, fileName, cloudReady, listCloud, saveToCloud, downloadCloud, lastBackupAt, startAutoBackup, KEEP };
