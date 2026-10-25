require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const multer = require('multer');
const { loadSchedules, applySchedules } = require('../utils/schedules');
const cloudinary = require('cloudinary').v2;
const { verifyAdmin } = require('../middleware/authMiddleware');
const axios = require('axios');

// ☁️ CONFIGURAÇÃO CLOUDINARY (lê do .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 📦 MULTER: guarda a imagem na MEMÓRIA (não salva mais no disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // máximo 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

// ☁️ FUNÇÃO: envia a imagem para o Cloudinary e devolve a URL
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'emporio-brumado/produtos',
        format: 'jpg', // JPG: a área sem fundo vira branca
        transformation: [
          // 🤖 IA do Cloudinary tira o fundo (mesa, prateleira, mão...), deixando só o produto
          { effect: 'background_removal' },
          // ✂️ Corta o espaço vazio em volta do produto
          { effect: 'trim' },
          // 🎯 Centraliza o produto inteiro (sem cortar nem distorcer) em 740x740...
          { width: 740, height: 740, crop: 'pad', background: 'white' },
          // ...e completa até 800x800 com fundo branco (30px de margem em volta)
          { width: 800, height: 800, crop: 'lpad', background: 'white' },
          { quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
};

// Foto já pronta (do "Ver como vai ficar"): só aceita imagem da nossa pasta no Cloudinary
const isOurImage = (url) => typeof url === 'string' &&
  url.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`) &&
  url.includes('/emporio-brumado/produtos/');

// Preço de oferta: vazio/zero = sem oferta
const parsePromo = (value) => {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

// Subcategoria (opcional): texto livre, ex: "Refrigerantes"
const parseSub = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 60) || null;

// Vem do formulário (multipart) como texto
const parseActive = (value) => value === undefined || value === true || value === 'true';

// Código de barras: só números (EAN-8 a EAN-14 / GTIN); qualquer outra coisa = sem código
const parseBarcode = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 14 ? digits : null;
};

// Outro produto já usa esse código?
const barcodeOwner = async (barcode, exceptId = null) => {
  if (!barcode) return null;
  const { rows } = await pool.query('SELECT id, name FROM products WHERE barcode = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1', [barcode, exceptId]);
  return rows[0] || null;
};

// 🔓 GET - Públicos (cliente pode ver). ?all=1 traz também os ocultos (admin)
router.get('/', async (req, res) => {
  try {
    // sold = em quantos pedidos (não cancelados) o produto saiu nos últimos 30 dias → "mais vendidos"
    const result = await pool.query(
      `SELECT p.id, p.name, p.price, p.promo_price, p.description, p.active, p.unit, p.category_id,
              p.image_url, p.estoque, p.sort_order, p.subcategory, p.barcode, p.adult, COALESCE(s.sold, 0)::int AS sold
       FROM products p
       LEFT JOIN (
         SELECT oi.product_id, COUNT(DISTINCT oi.order_id) AS sold
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'Cancelado' AND o.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY oi.product_id
       ) s ON s.product_id = p.id
       ${req.query.all ? '' : 'WHERE p.active IS NOT FALSE'}
       ORDER BY p.name`
    );
    // 🗓️ Loja: oferta programada e "disponível só em..." valendo agora (o admin vê o cadastro como está)
    res.json(req.query.all ? result.rows : applySchedules(result.rows, await loadSchedules(pool)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// 🔒 📷 Código de barras: já está cadastrado? Senão, busca nome e foto na base aberta Open Food Facts
const OFF_HOST = /^https:\/\/([a-z0-9-]+\.)*openfoodfacts\.org\//i;

router.get('/barcode/image', verifyAdmin, async (req, res) => {
  const url = String(req.query.url || '');
  if (!OFF_HOST.test(url)) return res.status(400).json({ error: 'Imagem inválida' });
  try {
    const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000, maxContentLength: 8 * 1024 * 1024 });
    res.set('Content-Type', img.headers['content-type'] || 'image/jpeg');
    res.send(Buffer.from(img.data));
  } catch (err) {
    res.status(502).json({ error: 'Não consegui baixar a foto' });
  }
});

router.get('/barcode/:code', verifyAdmin, async (req, res) => {
  const code = parseBarcode(req.params.code);
  if (!code) return res.status(400).json({ error: 'Código de barras inválido' });
  try {
    const existing = await pool.query('SELECT * FROM products WHERE barcode = $1 LIMIT 1', [code]);
    if (existing.rows[0]) return res.json({ barcode: code, existing: existing.rows[0] });

    let info = null;
    try {
      const { data } = await axios.get(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
        params: { fields: 'product_name_pt,product_name,generic_name_pt,brands,quantity,image_front_url,image_url' },
        headers: { 'User-Agent': 'EmporioBrumado/1.0 (emporiobrumado.com)' },
        timeout: 8000
      });
      if (data && data.status === 1 && data.product) info = data.product;
    } catch (err) {
      console.error('Open Food Facts:', err.message);
    }
    if (!info) return res.json({ barcode: code, found: false });

    const base = (info.product_name_pt || info.product_name || info.generic_name_pt || '').trim();
    const brand = (info.brands || '').split(',')[0].trim();
    // "16 g - 0.56 oz" → "16 g" (tira a medida americana)
    const qty = (info.quantity || '').split(/\s*[-–(/]\s*/)[0].trim();
    const has = (txt) => base.toLowerCase().includes(txt.toLowerCase());
    const name = [base, brand && !has(brand) ? brand : '', qty && !has(qty) ? qty : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 120);
    res.json({
      barcode: code,
      found: Boolean(name),
      name,
      image_url: name ? info.image_front_url || info.image_url || null : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar o código' });
  }
});

// Buscar produtos por categoria
router.get('/category/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE category_id = $1 ORDER BY name', [categoryId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produtos da categoria' });
  }
});

// Buscar produto por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

// 🔒 POST - Apenas ADMIN (criar produto)
router.post('/', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, price, unit, category_id, estoque, promo_price, description, active, subcategory } = req.body;
    if (!name || !price || !unit || !category_id) {
      return res.status(400).json({ error: 'Todos os campos obrigatórios não foram preenchidos' });
    }
    const barcode = parseBarcode(req.body.barcode);
    const owner = await barcodeOwner(barcode);
    if (owner) return res.status(400).json({ error: `Esse código de barras já é do produto "${owner.name}"` });

    const promo = parsePromo(promo_price);
    if (promo !== null && promo >= parseFloat(price)) {
      return res.status(400).json({ error: 'O preço de oferta precisa ser menor que o preço normal' });
    }

    let imageUrl = req.body.image_url || null; // "Duplicar" reaproveita a foto do original
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer);
    }

    const estoqueInicial = parseFloat(estoque) || 0;

    const result = await pool.query(
      `INSERT INTO products (name, price, unit, category_id, image_url, estoque, promo_price, description, active, subcategory, barcode, adult)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [name, price, unit, category_id, imageUrl, estoqueInicial, promo, (description || '').trim() || null, parseActive(active), parseSub(subcategory), barcode,
        req.body.adult === 'true']
    );

    // ⚙️ Produto novo com estoque já nasce AUTOMÁTICO (renova toda semana para a quantidade cadastrada).
    // Sem estoque → MANUAL. Dá para trocar depois na aba Estoque.
    const auto = estoqueInicial > 0;
    await pool.query(
      `INSERT INTO product_stock_config (product_id, type, auto_quantity, auto_frequency, last_restocked_at)
       VALUES ($1, $2, $3, 'SEMANAL', NOW())
       ON CONFLICT (product_id) DO NOTHING`,
      [result.rows[0].id, auto ? 'AUTOMÁTICO' : 'MANUAL', auto ? estoqueInicial : 50]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// 🔒 POST - Apenas ADMIN (✨ "Ver como vai ficar": trata a foto agora e devolve o link já pronto,
// tirando o fundo e centralizando em 800x800; ao salvar o produto essa mesma foto é usada)
router.post('/image-preview', verifyAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie a foto' });
  try {
    res.json({ url: await uploadToCloudinary(req.file.buffer) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Não consegui tratar a foto. Tente de novo.' });
  }
});

// 🔒 PUT - Apenas ADMIN (ordem manual dos produtos dentro da categoria) — ids na ordem desejada
router.put('/order', verifyAdmin, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'Lista vazia' });
  try {
    await pool.query(
      `UPDATE products p SET sort_order = o.pos
       FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos)
       WHERE p.id = o.id`,
      [ids]
    );
    res.json({ message: 'Ordem salva' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar ordem dos produtos' });
  }
});

// 🔒 PUT - Apenas ADMIN (editar produto)
router.put('/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, unit, category_id, promo_price, description, active, subcategory } = req.body;

    if (!name || !price || !unit || !category_id) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    const barcode = parseBarcode(req.body.barcode);
    const owner = await barcodeOwner(barcode, parseInt(id));
    if (owner) return res.status(400).json({ error: `Esse código de barras já é do produto "${owner.name}"` });

    const promo = parsePromo(promo_price);
    if (promo !== null && promo >= parseFloat(price)) {
      return res.status(400).json({ error: 'O preço de oferta precisa ser menor que o preço normal' });
    }

    let imageUrl = null;

    if (req.file) {
      // Nova imagem → envia pro Cloudinary
      imageUrl = await uploadToCloudinary(req.file.buffer);
    } else if (isOurImage(req.body.image_url)) {
      // Foto que já foi tratada e conferida no "Ver como vai ficar"
      imageUrl = req.body.image_url;
    } else {
      // Sem nova imagem → mantém a anterior
      const oldProduct = await pool.query('SELECT image_url FROM products WHERE id = $1', [id]);
      if (oldProduct.rows.length === 0) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      imageUrl = oldProduct.rows[0].image_url;
    }

    const result = await pool.query(
      `UPDATE products SET name = $1, price = $2, unit = $3, category_id = $4, image_url = $5,
              promo_price = $6, description = $7, active = $8,
              subcategory = CASE WHEN $11 THEN $10 ELSE subcategory END,
              barcode = CASE WHEN $13 THEN $12 ELSE barcode END,
              adult = CASE WHEN $15 THEN $14 ELSE adult END
       WHERE id = $9 RETURNING *`,
      [name, price, unit, category_id, imageUrl, promo, (description || '').trim() || null, parseActive(active), id,
        parseSub(subcategory), subcategory !== undefined, barcode, req.body.barcode !== undefined,
        req.body.adult === 'true', req.body.adult !== undefined]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// 📥 POST - Apenas ADMIN (importar produtos de planilha)
// rows: [{ nome, preco, unidade, categoria, estoque?, preco_oferta?, descricao? }]
// Mesmo nome de produto já cadastrado → atualiza; categoria que não existe → cria.
// A planilha do app manda também id (permite renomear) e linha (para a mensagem de erro).
// Foto fica para depois (no ✏️ Editar do produto).
router.post('/import', verifyAdmin, async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({ error: 'A planilha está vazia' });
  if (rows.length > 2000) return res.status(400).json({ error: 'Máximo de 2000 produtos por vez' });

  const num = (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = parseFloat(String(v).replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };
  const key = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

  // Confere tudo antes de gravar (ou grava tudo, ou nada)
  const errors = [];
  const clean = rows.map((r, i) => {
    const line = parseInt(r.linha) || i + 2; // linha 1 da planilha é o cabeçalho
    const name = String(r.nome || '').trim();
    const price = num(r.preco);
    const unit = String(r.unidade || '').trim() || 'un';
    const category = String(r.categoria || '').trim();
    const stock = num(r.estoque);
    const promo = num(r.preco_oferta);
    if (!name) errors.push(`Linha ${line}: falta o nome`);
    if (!(price > 0)) errors.push(`Linha ${line}: preço inválido`);
    if (!category) errors.push(`Linha ${line}: falta a categoria`);
    if (Number.isNaN(stock) || stock < 0) errors.push(`Linha ${line}: estoque inválido`);
    if (Number.isNaN(promo) || (promo !== null && promo >= price)) errors.push(`Linha ${line}: preço de oferta precisa ser menor que o preço`);
    const barcode = parseBarcode(r.codigo_barras);
    if (String(r.codigo_barras ?? '').trim() && !barcode) errors.push(`Linha ${line}: código de barras inválido (6 a 14 números)`);
    return {
      name, price: Math.round(price * 100) / 100, unit, category,
      stock, promo: promo > 0 ? Math.round(promo * 100) / 100 : null,
      hasPromo: Object.prototype.hasOwnProperty.call(r, 'preco_oferta'), // sem a coluna → não mexe na oferta
      hasDesc: Object.prototype.hasOwnProperty.call(r, 'descricao'), // coluna vazia → apaga a descrição
      description: String(r.descricao || '').trim() || null,
      hasSub: Object.prototype.hasOwnProperty.call(r, 'subcategoria'), // sem a coluna → não mexe
      subcategory: parseSub(r.subcategoria),
      hasBarcode: Object.prototype.hasOwnProperty.call(r, 'codigo_barras'), // sem a coluna → não mexe
      barcode,
      // 👁️ Mostrar na loja (planilha do app); sem a coluna → não mexe
      hasActive: typeof r.ativo === 'boolean',
      active: r.ativo !== false,
      // 📷 Foto já tratada (planilha do app): só da nossa pasta do Cloudinary; vazio = tirar a foto
      hasImage: r.foto === '' || isOurImage(r.foto),
      image: isOurImage(r.foto) ? r.foto : null,
      line,
      id: parseInt(r.id) || null
    };
  });
  // O mesmo código em duas linhas da planilha
  const seen = new Map();
  for (const r of clean) {
    if (!r.barcode) continue;
    if (seen.has(r.barcode)) errors.push(`Linha ${r.line}: código de barras ${r.barcode} repetido (linha ${seen.get(r.barcode)})`);
    else seen.set(r.barcode, r.line);
  }
  if (errors.length) return res.status(400).json({ error: 'Corrija a planilha', details: errors.slice(0, 30) });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cats = new Map((await client.query('SELECT id, name FROM categories')).rows.map(c => [key(c.name), c.id]));
    const all = (await client.query('SELECT id, name FROM products')).rows;
    const prods = new Map(all.map(p => [key(p.name), p.id]));
    const ids = new Set(all.map(p => p.id));
    let created = 0;
    let updated = 0;
    let newCategories = 0;

    for (const r of clean) {
      let categoryId = cats.get(key(r.category));
      if (!categoryId) {
        categoryId = (await client.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [r.category])).rows[0].id;
        cats.set(key(r.category), categoryId);
        newCategories++;
      }

      const existingId = r.id && ids.has(r.id) ? r.id : prods.get(key(r.name));
      if (existingId) {
        await client.query(
          `UPDATE products SET name = $10, price = $1, unit = $2, category_id = $3,
                  promo_price = CASE WHEN $8 THEN $4 ELSE promo_price END,
                  description = CASE WHEN $9 THEN $5 ELSE COALESCE($5, description) END,
                  estoque = COALESCE($6, estoque),
                  subcategory = CASE WHEN $12 THEN $11 ELSE subcategory END,
                  barcode = CASE WHEN $14 THEN $13 ELSE barcode END,
                  active = CASE WHEN $16 THEN $15 ELSE active END,
                  image_url = CASE WHEN $18 THEN $17 ELSE image_url END
           WHERE id = $7`,
          [r.price, r.unit, categoryId, r.promo, r.description, r.stock, existingId, r.hasPromo, r.hasDesc, r.name,
            r.subcategory, r.hasSub, r.barcode, r.hasBarcode, r.active, r.hasActive, r.image, r.hasImage]
        );
        prods.set(key(r.name), existingId);
        updated++;
      } else {
        const stock = r.stock || 0;
        const id = (await client.query(
          `INSERT INTO products (name, price, unit, category_id, estoque, promo_price, description, active, subcategory, barcode, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $10, $8, $9, $11) RETURNING id`,
          [r.name, r.price, r.unit, categoryId, stock, r.promo, r.description, r.subcategory, r.barcode, r.active, r.image]
        )).rows[0].id;
        // Igual ao cadastro manual: com estoque já entra no automático (renova toda semana)
        await client.query(
          `INSERT INTO product_stock_config (product_id, type, auto_quantity, auto_frequency, last_restocked_at)
           VALUES ($1, $2, $3, 'SEMANAL', NOW())
           ON CONFLICT (product_id) DO NOTHING`,
          [id, stock > 0 ? 'AUTOMÁTICO' : 'MANUAL', stock > 0 ? stock : 50]
        );
        prods.set(key(r.name), id);
        created++;
      }
    }

    // Código de barras que ficou em mais de um produto → desfaz tudo
    const dup = (await client.query(
      `SELECT barcode, string_agg(name, '", "' ORDER BY name) AS names FROM products
       WHERE barcode = ANY($1::text[]) GROUP BY barcode HAVING COUNT(*) > 1`,
      [[...seen.keys()]]
    )).rows;
    if (dup.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Corrija a planilha',
        details: dup.map(d => `Linha ${seen.get(d.barcode)}: o código de barras ${d.barcode} ficaria em mais de um produto ("${d.names}")`)
      });
    }

    await client.query('COMMIT');
    res.json({ created, updated, new_categories: newCategories });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao importar produtos' });
  } finally {
    client.release();
  }
});

// 🔒 PUT - Apenas ADMIN (colocar o produto numa subcategoria; vazio = sem subcategoria)
router.put('/:id/subcategory', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE products SET subcategory = $1 WHERE id = $2 RETURNING *',
      [parseSub(req.body.subcategory), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao mudar subcategoria' });
  }
});

// 🔒 POST - Apenas ADMIN (renomear ou apagar uma subcategoria da categoria; to vazio = apagar)
router.post('/subcategories/rename', verifyAdmin, async (req, res) => {
  const categoryId = parseInt(req.body.category_id);
  const from = parseSub(req.body.from);
  const to = parseSub(req.body.to);
  if (!categoryId || !from) return res.status(400).json({ error: 'Dados inválidos' });
  try {
    const result = await pool.query(
      'UPDATE products SET subcategory = $1 WHERE category_id = $2 AND subcategory = $3',
      [to, categoryId, from]
    );
    res.json({ updated: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao renomear subcategoria' });
  }
});

// 🔒 PUT - Apenas ADMIN (mover o produto para outra categoria)
router.put('/:id/category', verifyAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.body.category_id);
    const cat = await pool.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
    if (cat.rows.length === 0) return res.status(400).json({ error: 'Categoria inválida' });
    // Vai para o fim da ordem manual da nova categoria
    const result = await pool.query(
      'UPDATE products SET category_id = $1, sort_order = NULL, subcategory = NULL WHERE id = $2 RETURNING *',
      [categoryId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao mover produto' });
  }
});

// 🔒 PUT - Apenas ADMIN (mostrar/ocultar na loja com um toque)
router.put('/:id/active', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE products SET active = $1 WHERE id = $2 RETURNING *',
      [req.body.active === true, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// 🔒 PUT - Apenas ADMIN (atualizar estoque)
router.put('/:id/estoque', verifyAdmin, async (req, res) => {
  try {
    const { estoque } = req.body;

    if (estoque === undefined || estoque < 0) {
      return res.status(400).json({ error: 'Estoque inválido' });
    }

    const result = await pool.query(
      'UPDATE products SET estoque = $1 WHERE id = $2 RETURNING *',
      [estoque, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json({
      message: 'Estoque atualizado!',
      product: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar estoque' });
  }
});

// 🔒 DELETE - Apenas ADMIN
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json({ message: 'Produto deletado com sucesso' });
  } catch (err) {
    // Produto que já saiu em pedido não pode sumir (o histórico dos pedidos depende dele)
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Esse produto já tem pedidos e não pode ser apagado. Use 👁️ para ocultar da loja.', has_orders: true });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

// 🔧 ESTOQUE AVANÇADO - GET configuração
router.get('/:id/stock-config', async (req, res) => {
  try {
    const query = 'SELECT * FROM product_stock_config WHERE product_id = $1';
    const result = await pool.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configuração de estoque' });
  }
});

// 🔧 ESTOQUE AVANÇADO - PUT configuração
router.put('/:id/stock-config', verifyAdmin, async (req, res) => {
  try {
    const { type, auto_frequency } = req.body;
    const auto_quantity = parseFloat(req.body.auto_quantity) || 0;

    if (!['MANUAL', 'AUTOMÁTICO'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido (MANUAL ou AUTOMÁTICO)' });
    }
    if (!['DIÁRIA', 'SEMANAL', 'QUINZENAL', 'MENSAL'].includes(auto_frequency)) {
      return res.status(400).json({ error: 'Frequência inválida' });
    }
    if (type === 'AUTOMÁTICO' && auto_quantity <= 0) {
      return res.status(400).json({ error: 'Informe a quantidade do estoque automático' });
    }

    const query = `
      UPDATE product_stock_config
      SET type = $1, auto_quantity = $2, auto_frequency = $3, updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $4
      RETURNING *
    `;

    let result = await pool.query(query, [type, auto_quantity, auto_frequency, req.params.id]);

    // Produtos antigos podem não ter configuração ainda → cria
    if (result.rows.length === 0) {
      const product = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
      if (product.rows.length === 0) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      result = await pool.query(
        `INSERT INTO product_stock_config (product_id, type, auto_quantity, auto_frequency)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.params.id, type, auto_quantity, auto_frequency]
      );
    }

    // 🔄 Automático: o estoque já vira a quantidade configurada e o período começa agora
    if (type === 'AUTOMÁTICO') {
      await pool.query('UPDATE products SET estoque = $1 WHERE id = $2', [auto_quantity, req.params.id]);
      await pool.query('UPDATE product_stock_config SET last_restocked_at = NOW() WHERE product_id = $1', [req.params.id]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar configuração de estoque' });
  }
});

module.exports = router;