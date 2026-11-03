const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');
const sharp = require('sharp');
const { cloudinary } = require('../utils/cloudinary');
const { saveImage, deleteImage, keyOf } = require('../utils/imageStore');

// 🖼️ Pasta de imagens do negócio (propagandas, outdoor, adesivos): guardadas no nosso banco sem alteração
// (as antigas podem estar no Cloudinary)
const MAX_MB = 10;
const FORMAT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Envie imagens (JPG, PNG, SVG...) ou PDF'));
  }
});

const receiveFiles = (req, res, next) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Cada arquivo pode ter no máximo ${MAX_MB} MB` : err.message;
      return res.status(400).json({ error: msg });
    }
    next();
  });
};

// Nome legível (sem extensão, até 120 caracteres)
const cleanName = (name) => (name || 'imagem').replace(/\.[a-z0-9]+$/i, '').replace(/[\r\n]/g, ' ').trim().slice(0, 120) || 'imagem';

router.get('/', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM media_files ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar imagens' });
  }
});

router.post('/', verifyAdmin, receiveFiles, async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Escolha pelo menos um arquivo' });
  }
  try {
    const saved = [];
    for (const file of req.files) {
      const url = await saveImage(file.buffer, { mime: file.mimetype, source: 'midia' });
      const meta = file.mimetype.startsWith('image/') ? await sharp(file.buffer).metadata().catch(() => ({})) : {};
      const { rows } = await pool.query(
        `INSERT INTO media_files (name, url, public_id, resource_type, format, bytes, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [cleanName(file.originalname), url, null, file.mimetype === 'application/pdf' ? 'raw' : 'image',
          FORMAT[file.mimetype] || null, file.size, meta.width || null, meta.height || null]
      );
      saved.push(rows[0]);
    }
    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao guardar o arquivo' });
  }
});

router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM media_files WHERE id = $1 RETURNING url, public_id, resource_type', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Arquivo não encontrado' });
    // Já saiu da lista; se apagar o arquivo falhar, só registra (não deixa o admin sem resposta)
    try {
      if (keyOf(rows[0].url)) await deleteImage(rows[0].url);
      if (rows[0].public_id) await cloudinary.uploader.destroy(rows[0].public_id, { resource_type: rows[0].resource_type || 'image', invalidate: true });
    } catch (err) {
      console.error('Apagar arquivo:', err.message);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao apagar o arquivo' });
  }
});

module.exports = router;
