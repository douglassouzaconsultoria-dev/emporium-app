const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/authMiddleware');
const backup = require('../utils/backup');

const sendFile = (res, name, buffer) => {
  res.set({
    'Content-Type': 'application/gzip',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Access-Control-Expose-Headers': 'Content-Disposition' // o app (outro domínio) lê o nome do arquivo
  });
  res.send(buffer);
};

// 🔒 GET - Apenas ADMIN (baixar um backup feito agora)
router.get('/download', verifyAdmin, async (req, res) => {
  try {
    const { buffer } = await backup.createBackup();
    sendFile(res, backup.fileName(), buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar o backup' });
  }
});

// 🔒 GET - Apenas ADMIN (cópias automáticas guardadas no Cloudinary)
router.get('/', verifyAdmin, async (req, res) => {
  try {
    if (!backup.cloudReady()) return res.json({ cloud: false, keep: backup.KEEP, last: null, items: [] });
    const [items, last] = await Promise.all([backup.listCloud(), backup.lastBackupAt()]);
    res.json({ cloud: true, keep: backup.KEEP, last, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar os backups' });
  }
});

// 🔒 POST - Apenas ADMIN (guardar uma cópia no Cloudinary agora)
router.post('/', verifyAdmin, async (req, res) => {
  try {
    if (!backup.cloudReady()) return res.status(400).json({ error: 'Cloudinary não configurado' });
    res.json(await backup.saveToCloud());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao guardar o backup' });
  }
});

// 🔒 GET - Apenas ADMIN (baixar uma das cópias guardadas)
router.get('/cloud/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  if (!/^backup-[\d-]+\.json\.gz$/.test(id)) return res.status(400).json({ error: 'Backup inválido' });
  try {
    sendFile(res, id, await backup.downloadCloud(id));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Erro ao baixar o backup' });
  }
});

module.exports = router;
