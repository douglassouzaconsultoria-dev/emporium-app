// 📦 Fotos guardadas no nosso próprio banco (sem depender do Cloudinary para guardar nem para entregar)
// - Cada foto tem um código (key) e o endereço /api/img/<key>
// - Guarda a foto inteira e uma versão pequena (400 px, WebP) para os cards da loja
// - O Cloudinary fica só para tirar o fundo (IA), quando o admin pedir
const crypto = require('crypto');
const sharp = require('sharp');
const axios = require('axios');
const pool = require('./database');
const { cloudinary } = require('./cloudinary');

const SMALL = 400;
const urlOf = (key) => `/api/img/${key}`;
const KEY_RE = /^\/api\/img\/([a-f0-9]{24})$/;
const keyOf = (url) => (typeof url === 'string' && KEY_RE.test(url) ? url.match(KEY_RE)[1] : null);

// Guarda o arquivo como veio (+ versão pequena se for imagem) e devolve o endereço
const saveImage = async (buffer, { mime = 'image/jpeg', source = null } = {}) => {
  let small = null;
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
    small = await sharp(buffer).rotate().resize(SMALL, SMALL, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
      .catch(() => null);
  }
  const key = crypto.randomBytes(12).toString('hex');
  await pool.query(
    'INSERT INTO images (key, mime, data, small, bytes, source) VALUES ($1, $2, $3, $4, $5, $6)',
    [key, mime, buffer, small, buffer.length, source]
  );
  return urlOf(key);
};

const deleteImage = async (url) => {
  const key = keyOf(url);
  if (key) await pool.query('DELETE FROM images WHERE key = $1', [key]);
};

// 🖼️ Foto de produto sem IA: corta o espaço vazio e centraliza em 800x800 com fundo branco (igual ao Cloudinary)
const centerOnWhite = async (buffer) => {
  const trimmed = await sharp(buffer).rotate().flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 30 }).toBuffer()
    .catch(() => sharp(buffer).rotate().flatten({ background: '#ffffff' }).toBuffer());
  return sharp(trimmed)
    .resize(740, 740, { fit: 'contain', background: '#ffffff' })
    .extend({ top: 30, bottom: 30, left: 30, right: 30, background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
};

// 🤖 Tira o fundo com a IA do Cloudinary, traz a foto pronta para cá e apaga a cópia de lá
const removeBackgroundWithCloudinary = (buffer) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({
    folder: 'emporio-brumado/produtos',
    format: 'jpg',
    transformation: [
      { effect: 'background_removal' },
      { effect: 'trim' },
      { width: 740, height: 740, crop: 'pad', background: 'white' },
      { width: 800, height: 800, crop: 'lpad', background: 'white' },
      { quality: 'auto' }
    ]
  }, async (error, result) => {
    if (error) return reject(error);
    try {
      const { data } = await axios.get(result.secure_url, { responseType: 'arraybuffer', timeout: 30000 });
      cloudinary.uploader.destroy(result.public_id, { invalidate: true }).catch(() => {});
      resolve(Buffer.from(data));
    } catch (err) {
      reject(err);
    }
  });
  stream.end(buffer);
});

// Foto de produto pronta para a loja. removeBg: tenta a IA; se o Cloudinary falhar (ex: limite estourado),
// só centraliza aqui mesmo e avisa que o fundo não saiu
const prepareProductImage = async (buffer, { removeBg = false } = {}) => {
  let ready = null;
  let removedBg = false;
  if (removeBg) {
    try {
      ready = await removeBackgroundWithCloudinary(buffer);
      removedBg = true;
    } catch (err) {
      console.error('Cloudinary (tirar fundo):', err.message || err);
    }
  }
  if (!ready) ready = await centerOnWhite(buffer);
  return { url: await saveImage(ready, { mime: 'image/jpeg', source: 'produto' }), removedBg };
};

// Foto de perfil: quadrada 400x400
const prepareAvatar = async (buffer) => {
  const img = await sharp(buffer).rotate().resize(400, 400, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
  return saveImage(img, { mime: 'image/jpeg', source: 'perfil' });
};

module.exports = { saveImage, deleteImage, keyOf, urlOf, centerOnWhite, prepareProductImage, prepareAvatar };
