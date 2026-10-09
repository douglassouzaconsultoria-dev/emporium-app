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
        transformation: [
          { width: 800, height: 800, crop: 'pad', background: 'white' },
          { quality: 'auto', fetch_format: 'auto' }
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

// 🔓 GET - Públicos (cliente pode ver)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, price, unit, category_id, image_url, estoque FROM products ORDER BY name');
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
    const { name, price, unit, category_id, estoque } = req.body;
    if (!name || !price || !unit || !category_id) {
      return res.status(400).json({ error: 'Todos os campos obrigatórios não foram preenchidos' });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer);
    }

    const estoqueInicial = parseFloat(estoque) || 0;

    const result = await pool.query(
      'INSERT INTO products (name, price, unit, category_id, image_url, estoque) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, price, unit, category_id, imageUrl, estoqueInicial]
    );

    // ⚙️ Cria configuração de estoque padrão para o novo produto
    await pool.query(
      `INSERT INTO product_stock_config (product_id, type, auto_quantity, auto_frequency)
       VALUES ($1, 'MANUAL', 50, 'SEMANAL')
       ON CONFLICT (product_id) DO NOTHING`,
      [result.rows[0].id]
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
    const { name, price, unit, category_id } = req.body;

    if (!name || !price || !unit || !category_id) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
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
      'UPDATE products SET name = $1, price = $2, unit = $3, category_id = $4, image_url = $5 WHERE id = $6 RETURNING *',
      [name, price, unit, category_id, imageUrl, id]
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
    const { type, auto_quantity, auto_frequency } = req.body;

    if (!['MANUAL', 'AUTOMÁTICO'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido (MANUAL ou AUTOMÁTICO)' });
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

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar configuração de estoque' });
  }
});

module.exports = router;