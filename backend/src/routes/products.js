require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { verifyAdmin } = require('../middleware/authMiddleware');

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

// Preço de oferta: vazio/zero = sem oferta
const parsePromo = (value) => {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

// Vem do formulário (multipart) como texto
const parseActive = (value) => value === undefined || value === true || value === 'true';

// 🔓 GET - Públicos (cliente pode ver). ?all=1 traz também os ocultos (admin)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, price, promo_price, description, active, unit, category_id, image_url, estoque
       FROM products ${req.query.all ? '' : 'WHERE active IS NOT FALSE'} ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
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
    const { name, price, unit, category_id, estoque, promo_price, description, active } = req.body;
    if (!name || !price || !unit || !category_id) {
      return res.status(400).json({ error: 'Todos os campos obrigatórios não foram preenchidos' });
    }

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
      `INSERT INTO products (name, price, unit, category_id, image_url, estoque, promo_price, description, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, price, unit, category_id, imageUrl, estoqueInicial, promo, (description || '').trim() || null, parseActive(active)]
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

// 🔒 PUT - Apenas ADMIN (editar produto)
router.put('/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, unit, category_id, promo_price, description, active } = req.body;

    if (!name || !price || !unit || !category_id) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const promo = parsePromo(promo_price);
    if (promo !== null && promo >= parseFloat(price)) {
      return res.status(400).json({ error: 'O preço de oferta precisa ser menor que o preço normal' });
    }

    let imageUrl = null;

    if (req.file) {
      // Nova imagem → envia pro Cloudinary
      imageUrl = await uploadToCloudinary(req.file.buffer);
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
              promo_price = $6, description = $7, active = $8
       WHERE id = $9 RETURNING *`,
      [name, price, unit, category_id, imageUrl, promo, (description || '').trim() || null, parseActive(active), id]
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
    const line = i + 2; // linha 1 da planilha é o cabeçalho
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
    return {
      name, price: Math.round(price * 100) / 100, unit, category,
      stock, promo: promo > 0 ? Math.round(promo * 100) / 100 : null,
      hasPromo: Object.prototype.hasOwnProperty.call(r, 'preco_oferta'), // sem a coluna → não mexe na oferta
      description: String(r.descricao || '').trim() || null
    };
  });
  if (errors.length) return res.status(400).json({ error: 'Corrija a planilha', details: errors.slice(0, 30) });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cats = new Map((await client.query('SELECT id, name FROM categories')).rows.map(c => [key(c.name), c.id]));
    const prods = new Map((await client.query('SELECT id, name FROM products')).rows.map(p => [key(p.name), p.id]));
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

      const existingId = prods.get(key(r.name));
      if (existingId) {
        await client.query(
          `UPDATE products SET price = $1, unit = $2, category_id = $3,
                  promo_price = CASE WHEN $8 THEN $4 ELSE promo_price END,
                  description = COALESCE($5, description), estoque = COALESCE($6, estoque)
           WHERE id = $7`,
          [r.price, r.unit, categoryId, r.promo, r.description, r.stock, existingId, r.hasPromo]
        );
        updated++;
      } else {
        const stock = r.stock || 0;
        const id = (await client.query(
          `INSERT INTO products (name, price, unit, category_id, estoque, promo_price, description, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`,
          [r.name, r.price, r.unit, categoryId, stock, r.promo, r.description]
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