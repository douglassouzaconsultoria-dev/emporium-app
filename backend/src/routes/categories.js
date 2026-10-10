const express = require('express');
const router = express.Router();
const pool = require('../utils/database');
const { verifyAdmin } = require('../middleware/authMiddleware');

// 🔓 GET - Públicos (cliente pode ver)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY sort_order NULLS LAST, id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

// 🔒 PUT - Apenas ADMIN (ordem das categorias na vitrine) — ids na ordem desejada
router.put('/order', verifyAdmin, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'Lista vazia' });
  try {
    await pool.query(
      `UPDATE categories c SET sort_order = o.pos
       FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos)
       WHERE c.id = o.id`,
      [ids]
    );
    res.json({ message: 'Ordem salva' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar ordem das categorias' });
  }
});

// 🔒 PUT - Apenas ADMIN (mostrar/ocultar na vitrine e como ordenar os produtos dela)
router.put('/:id/display', verifyAdmin, async (req, res) => {
  const { active, product_sort } = req.body;
  if (product_sort !== undefined && !['az', 'bestsellers', 'manual'].includes(product_sort)) {
    return res.status(400).json({ error: 'Ordenação inválida' });
  }
  try {
    const result = await pool.query(
      `UPDATE categories SET
         active = COALESCE($1, active),
         product_sort = COALESCE($2, product_sort)
       WHERE id = $3 RETURNING *`,
      [typeof active === 'boolean' ? active : null, product_sort || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

// Buscar categoria por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar categoria' });
  }
});

// 🔒 POST - Apenas ADMIN (criar categoria)
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }
    const result = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

// 🔒 PUT - Apenas ADMIN (editar categoria)
router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }
    const result = await pool.query(
      'UPDATE categories SET name = $1 WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

// 🔒 DELETE - Apenas ADMIN (deletar categoria)
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se há produtos nesta categoria
    const productsCheck = await pool.query('SELECT COUNT(*) FROM products WHERE category_id = $1', [id]);
    if (parseInt(productsCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Não é possível deletar categoria com produtos' });
    }

    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    res.json({ message: 'Categoria deletada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar categoria' });
  }
});

module.exports = router;