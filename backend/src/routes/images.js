const express = require('express');
const axios = require('axios');
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');
const { saveImage, deleteImage } = require('../utils/imageStore');

// 🖼️ Entrega as fotos guardadas no nosso banco (/api/img/<key>; ?w=400 = versão pequena dos cards)
const img = express.Router();
img.get('/:key', async (req, res) => {
  if (!/^[a-f0-9]{24}$/.test(req.params.key)) return res.status(404).end();
  try {
    const small = parseInt(req.query.w) > 0 && parseInt(req.query.w) <= 400;
    const { rows: [row] } = await pool.query(
      `SELECT mime, ${small ? 'COALESCE(small, data) AS data, (small IS NOT NULL) AS is_small' : 'data, false AS is_small'}
       FROM images WHERE key = $1`, [req.params.key]
    );
    if (!row) return res.status(404).end();
    res.set({
      'Content-Type': row.is_small ? 'image/webp' : row.mime,
      // A foto nunca muda (foto nova = endereço novo): o celular guarda e não baixa de novo
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ...(req.query.download ? { 'Content-Disposition': 'attachment' } : {})
    });
    res.send(row.data);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// 📦 Trazer as fotos do Cloudinary para o nosso banco (produtos, banners, fotos de perfil e a aba Imagens)
// Roda em segundo plano; o admin acompanha o andamento. As fotos continuam também no Cloudinary.
const admin = express.Router();
const job = { running: false, total: 0, done: 0, failed: 0, errors: [], finished_at: null };

const CLOUD = "LIKE 'https://res.cloudinary.com/%'";
const pending = async () => {
  const [products, customers, media, banners] = await Promise.all([
    pool.query(`SELECT DISTINCT image_url AS url FROM products WHERE image_url ${CLOUD}`),
    pool.query(`SELECT DISTINCT avatar_url AS url FROM customers WHERE avatar_url ${CLOUD}`),
    pool.query(`SELECT DISTINCT url FROM media_files WHERE url ${CLOUD} AND COALESCE(resource_type, 'image') <> 'video'`),
    pool.query("SELECT value FROM app_settings WHERE key = 'banners'")
  ]);
  const urls = new Set([...products.rows, ...customers.rows, ...media.rows].map(r => r.url));
  const bannerText = banners.rows[0]?.value || '';
  for (const m of bannerText.matchAll(/https:\/\/res\.cloudinary\.com\/[^"\s]+/g)) urls.add(m[0]);
  return [...urls];
};

const copyOne = async (url) => {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 20 * 1024 * 1024 });
  const mime = String(res.headers['content-type'] || 'image/jpeg').split(';')[0];
  const newUrl = await saveImage(Buffer.from(res.data), { mime, source: 'cloudinary' });
  await pool.query('UPDATE products SET image_url = $1 WHERE image_url = $2', [newUrl, url]);
  await pool.query('UPDATE customers SET avatar_url = $1 WHERE avatar_url = $2', [newUrl, url]);
  await pool.query('UPDATE media_files SET url = $1 WHERE url = $2', [newUrl, url]);
  await pool.query(
    "UPDATE app_settings SET value = replace(value, $2, $1) WHERE key = 'banners'", [newUrl, url]
  );
};

const runJob = async () => {
  const urls = await pending();
  Object.assign(job, { running: true, total: urls.length, done: 0, failed: 0, errors: [], finished_at: null });
  for (let i = 0; i < urls.length; i += 3) {
    await Promise.all(urls.slice(i, i + 3).map(async (url) => {
      try {
        await copyOne(url);
        job.done++;
      } catch (err) {
        job.failed++;
        if (job.errors.length < 20) job.errors.push(`${url.split('/').pop()}: ${err.response ? `HTTP ${err.response.status}` : err.message}`);
      }
    }));
  }
  job.running = false;
  job.finished_at = new Date().toISOString();
};

admin.get('/migrate', verifyAdmin, async (req, res) => {
  try {
    const [left, stored] = await Promise.all([
      pending(),
      pool.query('SELECT COUNT(*)::int AS count, COALESCE(SUM(bytes), 0)::bigint AS bytes FROM images')
    ]);
    res.json({ ...job, left: left.length, stored: stored.rows[0].count, stored_bytes: Number(stored.rows[0].bytes) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao ver as fotos' });
  }
});

admin.post('/migrate', verifyAdmin, (req, res) => {
  if (job.running) return res.json({ started: false, ...job });
  runJob().catch(err => {
    job.running = false;
    console.error('Erro ao trazer as fotos:', err);
  });
  res.json({ started: true });
});

// 🧹 Apaga fotos que ninguém usa mais (prévias que não foram salvas, fotos trocadas) com mais de 1 dia
const cleanupImages = async () => {
  const { rowCount } = await pool.query(`
    DELETE FROM images i
    WHERE i.created_at < NOW() - INTERVAL '1 day'
      AND NOT EXISTS (SELECT 1 FROM products p WHERE p.image_url = '/api/img/' || i.key)
      AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.avatar_url = '/api/img/' || i.key)
      AND NOT EXISTS (SELECT 1 FROM media_files m WHERE m.url = '/api/img/' || i.key)
      AND NOT EXISTS (SELECT 1 FROM app_settings s WHERE s.key = 'banners' AND s.value LIKE '%' || i.key || '%')`);
  if (rowCount) console.log(`🧹 ${rowCount} foto(s) sem uso apagada(s)`);
  return rowCount;
};

const startImageCleanup = () => {
  const run = () => cleanupImages().catch(err => console.error('Erro na limpeza de fotos:', err.message));
  run();
  setInterval(run, 24 * 60 * 60 * 1000);
};

module.exports = { img, admin, deleteImage, cleanupImages, startImageCleanup, job };
