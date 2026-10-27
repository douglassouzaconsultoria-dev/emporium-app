const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../utils/database');
const { verifyToken } = require('../middleware/authMiddleware');
const { cloudinary, uploadBuffer } = require('../utils/cloudinary');
const { notifyAdmins, notifyCustomer, keyHandler, subscribeHandler, unsubscribeHandler } = require('../utils/push');

const JWT_SECRET = process.env.JWT_SECRET || 'seu_segredo_super_seguro_aqui_2024';

// ✅ Validações
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidUsername = (username) => /^[a-z0-9._]{3,20}$/.test(username);
const USERNAME_RULE = 'Usuário deve ter de 3 a 20 caracteres: letras minúsculas, números, ponto ou _ (sem espaço e sem acento)';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

// 📸 Upload da foto de perfil (em memória, máx. 5MB, só imagens)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  }
});

const uploadAvatar = (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Imagem muito grande (máximo 5MB)'
        : (err.message || 'Erro no envio da imagem');
      return res.status(400).json({ error: msg });
    }
    next();
  });
};

// Uma foto por cliente (substitui a anterior, sem acumular lixo)
const avatarPublicId = (customerId) => `emporio-brumado/avatars/customer_${customerId}`;

// 🔐 Admin fica logado 7 dias (o app renova sozinho enquanto estiver sendo usado); cliente e motoboy, 30 dias
const generateToken = (user) => jwt.sign(
  { id: user.id, username: user.username, email: user.email, role: user.role },
  JWT_SECRET,
  { expiresIn: user.role === 'admin' ? '7d' : '30d' }
);

// 🚫 Muitas senhas erradas: bloqueia por 15 minutos
// - 5 erradas no mesmo usuário (vindo do mesmo aparelho/internet)
// - 20 erradas no total vindo da mesma internet (alguém testando vários usuários)
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map(); // chave → { count, first }
const failCount = (key, now = Date.now()) => {
  const f = failures.get(key);
  if (!f || now - f.first > LOCK_MS) return 0;
  return f.count;
};
const addFailure = (key, now = Date.now()) => {
  const count = failCount(key, now);
  failures.set(key, { count: count + 1, first: count ? failures.get(key).first : now });
  if (failures.size > 10000) { // nunca cresce sem limite: tira as que já venceram
    for (const [k, f] of failures) if (now - f.first > LOCK_MS) failures.delete(k);
  }
};

// Dados do usuário que vão para o frontend (NUNCA a senha)
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: u.email,
  phone_number: u.phone_number,
  address: u.address,
  neighborhood: u.neighborhood,
  role: u.role,
  avatar_url: u.avatar_url || null
});

// ===================== CADASTRO =====================
router.post('/register', async (req, res) => {
  try {
    const name = clean(req.body.name);
    const username = clean(req.body.username).toLowerCase();
    const email = clean(req.body.email).toLowerCase();
    const password = req.body.password || '';
    const phone = clean(req.body.phone_number);
    const address = clean(req.body.address);
    const neighborhood = clean(req.body.neighborhood);

    if (!name || !username || !password || !phone || !address || !neighborhood) {
      return res.status(400).json({ error: 'Preencha nome, usuário, senha, telefone, endereço e bairro' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: USERNAME_RULE });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido. Exemplo: nome@gmail.com (ou deixe em branco)' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const userExists = await pool.query('SELECT id FROM customers WHERE LOWER(username) = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Este usuário já existe. Escolha outro.' });
    }

    if (email) {
      const emailExists = await pool.query('SELECT id FROM customers WHERE LOWER(email) = $1', [email]);
      if (emailExists.rows.length > 0) {
        return res.status(400).json({ error: 'E-mail já cadastrado' });
      }
    }

    const phoneExists = await pool.query('SELECT id FROM customers WHERE phone_number = $1', [phone]);
    if (phoneExists.rows.length > 0) {
      return res.status(400).json({ error: 'Telefone já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO customers (name, username, email, password, phone_number, address, neighborhood, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'client')
       RETURNING *`,
      [name, username, email || null, hashedPassword, phone, address, neighborhood]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'Cadastro realizado com sucesso!',
      token: generateToken(user),
      user: publicUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar cliente' });
  }
});

// ===================== LOGIN (usuário OU e-mail) =====================
router.post('/login', async (req, res) => {
  try {
    const identifier = clean(req.body.login || req.body.email).toLowerCase();
    const password = req.body.password || '';

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Informe usuário (ou e-mail) e senha' });
    }

    const userKey = `${req.ip}|${identifier}`;
    const ipKey = `${req.ip}|*`;
    if (failCount(userKey) >= 5 || failCount(ipKey) >= 20) {
      return res.status(429).json({ error: 'Muitas tentativas com a senha errada. Espere 15 minutos e tente de novo.' });
    }
    const wrong = () => {
      addFailure(userKey);
      addFailure(ipKey);
      return res.status(401).json({ error: 'Usuário ou senha incorretos' });
    };

    const result = await pool.query(
      'SELECT * FROM customers WHERE LOWER(username) = $1 OR LOWER(email) = $1 LIMIT 1',
      [identifier]
    );

    if (result.rows.length === 0) return wrong();

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return wrong();
    failures.delete(userKey);

    if (user.active === false) {
      return res.status(403).json({ error: 'Conta desativada. Fale com o Empório.' });
    }

    res.json({
      message: 'Login realizado com sucesso!',
      token: generateToken(user),
      user: publicUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// ===================== RENOVAR LOGIN =====================
// O app chama ao abrir e de tempos em tempos: quem está usando não precisa entrar de novo.
// Conta desativada ou apagada não renova.
router.post('/refresh', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user || user.active === false) return res.status(403).json({ error: 'Conta desativada' });
    res.json({ token: generateToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao renovar login' });
  }
});

// ===================== VER PERFIL =====================
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(publicUser(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

// ===================== EDITAR PERFIL (+ foto opcional) =====================
router.put('/profile', verifyToken, uploadAvatar, async (req, res) => {
  try {
    const name = clean(req.body.name);
    const username = clean(req.body.username).toLowerCase();
    const email = clean(req.body.email).toLowerCase();
    const phone = clean(req.body.phone_number);
    const address = clean(req.body.address);
    const neighborhood = clean(req.body.neighborhood);

    if (!name || !username || !phone || !address || !neighborhood) {
      return res.status(400).json({ error: 'Nome, usuário, telefone, endereço e bairro são obrigatórios' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: USERNAME_RULE });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido. Exemplo: nome@gmail.com (ou deixe em branco)' });
    }

    const userExists = await pool.query(
      'SELECT id FROM customers WHERE LOWER(username) = $1 AND id <> $2',
      [username, req.user.id]
    );
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Este usuário já está em uso. Escolha outro.' });
    }

    if (email) {
      const emailExists = await pool.query(
        'SELECT id FROM customers WHERE LOWER(email) = $1 AND id <> $2',
        [email, req.user.id]
      );
      if (emailExists.rows.length > 0) {
        return res.status(400).json({ error: 'Este e-mail já está em uso por outra conta' });
      }
    }

    const phoneExists = await pool.query(
      'SELECT id FROM customers WHERE phone_number = $1 AND id <> $2',
      [phone, req.user.id]
    );
    if (phoneExists.rows.length > 0) {
      return res.status(400).json({ error: 'Este telefone já está em uso por outra conta' });
    }

    // 📸 Nova foto (opcional): recorte quadrado focado no ROSTO
    let avatarUrl = null;
    if (req.file) {
      const uploaded = await uploadBuffer(req.file.buffer, {
        public_id: avatarPublicId(req.user.id),
        overwrite: true,
        invalidate: true,
        transformation: [
          { width: 400, height: 400, crop: 'thumb', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      });
      avatarUrl = uploaded.secure_url;
    }

    // ⚠️ role NUNCA é alterado aqui
    const result = await pool.query(
      `UPDATE customers
       SET name = $1, username = $2, email = $3, phone_number = $4, address = $5, neighborhood = $6,
           avatar_url = COALESCE($7, avatar_url)
       WHERE id = $8
       RETURNING *`,
      [name, username, email || null, phone, address, neighborhood, avatarUrl, req.user.id]
    );

    const user = result.rows[0];

    res.json({
      message: 'Perfil atualizado com sucesso!',
      token: generateToken(user),
      user: publicUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// ===================== REMOVER FOTO =====================
router.delete('/profile/avatar', verifyToken, async (req, res) => {
  try {
    try {
      await cloudinary.uploader.destroy(avatarPublicId(req.user.id), { invalidate: true });
    } catch (e) {
      console.error('Aviso: não foi possível apagar a foto no Cloudinary', e.message);
    }

    const result = await pool.query(
      'UPDATE customers SET avatar_url = NULL WHERE id = $1 RETURNING *',
      [req.user.id]
    );

    res.json({
      message: 'Foto removida!',
      user: publicUser(result.rows[0])
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover foto' });
  }
});

// ===================== TROCAR SENHA =====================
router.put('/password', verifyToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
    }

    const result = await pool.query('SELECT password FROM customers WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const match = await bcrypt.compare(current_password, result.rows[0].password);
    if (!match) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE customers SET password = $1 WHERE id = $2', [hashed, req.user.id]);

    res.json({ message: 'Senha alterada com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// ===================== EXCLUIR MINHA CONTA (exigido pelas lojas e pela LGPD) =====================
// Apaga os dados pessoais e desativa a conta. Os pedidos ficam no histórico do Empório, sem o nome do cliente.
router.delete('/account', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'motoboy') {
      return res.status(403).json({ error: 'Só contas de cliente podem ser excluídas por aqui' });
    }

    const result = await pool.query('SELECT password FROM customers WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const match = await bcrypt.compare(req.body.password || '', result.rows[0].password);
    if (!match) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    const id = req.user.id;
    const lockedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    await pool.query(
      `UPDATE customers
       SET name = 'Cliente excluído', username = $2, email = NULL, phone_number = $3, phone = NULL,
           address = '', neighborhood = '', city = NULL, state = NULL, avatar_url = NULL,
           password = $4, active = false
       WHERE id = $1`,
      [id, `excluido.${id}`, `del${id}`, lockedPassword]
    );
    await pool.query('DELETE FROM customer_favorites WHERE customer_id = $1', [id]);
    await pool.query('DELETE FROM push_subscriptions WHERE customer_id = $1', [id]); // para de receber avisos

    res.json({ message: 'Conta excluída' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
});

// ===================== 🔔 AVISOS DO PEDIDO NO CELULAR DO CLIENTE =====================
router.get('/push-key', verifyToken, keyHandler);
router.post('/push-subscribe', verifyToken, subscribeHandler);
router.post('/push-unsubscribe', verifyToken, unsubscribeHandler);

// ===================== 🔑 ESQUECI A SENHA =====================
// 1) O cliente pede pelo app (usuário, e-mail ou telefone) → o admin recebe o aviso
// 2) O admin confere que é a pessoa e aprova → sai um código de 6 números (vale 30 min),
//    que o admin passa para o cliente (e que também vai como notificação, se o cliente ativou)
// 3) O cliente digita o código e a senha nova → já entra na conta
const RESET_MINUTES = 30;
const resetRequests = new Map(); // ip → { count, first } (no máximo 5 pedidos a cada 15 min)

const findClient = async (identifier) => {
  const login = clean(identifier).toLowerCase();
  const digits = login.replace(/\D/g, '');
  if (!login) return null;
  const { rows } = await pool.query(
    `SELECT id, name, username, phone_number, active FROM customers
     WHERE role = 'client' AND (LOWER(username) = $1 OR LOWER(email) = $1
       OR (length($2) >= 10 AND regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') IN ($2, '55' || $2)))
     ORDER BY id LIMIT 1`,
    [login, digits]
  );
  return rows[0] || null;
};

router.post('/forgot', async (req, res) => {
  const done = () => res.json({
    message: 'Pedido enviado! O Empório vai conferir e te passar um código de 6 números.'
  });
  try {
    const now = Date.now();
    const r = resetRequests.get(req.ip);
    if (r && now - r.first < LOCK_MS && r.count >= 5) {
      return res.status(429).json({ error: 'Muitos pedidos. Espere 15 minutos e tente de novo.' });
    }
    resetRequests.set(req.ip, r && now - r.first < LOCK_MS ? { count: r.count + 1, first: r.first } : { count: 1, first: now });
    if (resetRequests.size > 10000) resetRequests.clear();

    const user = await findClient(req.body.login);
    if (!user || user.active === false) return done(); // não conta se a conta existe

    // Já tem pedido em aberto: não duplica nem avisa o admin de novo
    const open = await pool.query(
      `SELECT id FROM password_resets WHERE customer_id = $1 AND status = 'pending' AND created_at > NOW() - INTERVAL '1 day'`,
      [user.id]
    );
    if (open.rows.length) return done();

    await pool.query(
      `UPDATE password_resets SET status = 'expired' WHERE customer_id = $1 AND status IN ('pending', 'approved')`, [user.id]
    );
    await pool.query('INSERT INTO password_resets (customer_id) VALUES ($1)', [user.id]);
    notifyAdmins({
      title: '🔑 Pedido de senha nova',
      body: `${user.name}${user.phone_number ? ` · ${user.phone_number}` : ''}. Confira em Admin → Clientes.`,
      tag: `senha-${user.id}`
    });
    done();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar o pedido' });
  }
});

router.post('/reset', async (req, res) => {
  const code = String(req.body.code || '').replace(/\D/g, '');
  const password = req.body.password || '';
  if (code.length !== 6) return res.status(400).json({ error: 'Digite o código de 6 números' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
  try {
    const user = await findClient(req.body.login);
    const wrong = { error: 'Código errado ou vencido. Confira com o Empório.' };
    if (!user || user.active === false) return res.status(400).json(wrong);

    const { rows: [request] } = await pool.query(
      `SELECT id, code_hash, attempts FROM password_resets
       WHERE customer_id = $1 AND status = 'approved' AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [user.id]
    );
    if (!request) return res.status(400).json(wrong);

    if (!(await bcrypt.compare(code, request.code_hash))) {
      // 5 erros: o código não vale mais (precisa pedir de novo)
      await pool.query(
        `UPDATE password_resets SET attempts = attempts + 1,
           status = CASE WHEN attempts + 1 >= 5 THEN 'expired' ELSE status END
         WHERE id = $1`, [request.id]
      );
      return res.status(400).json(request.attempts + 1 >= 5
        ? { error: 'Código errado 5 vezes. Peça um código novo.' }
        : wrong);
    }

    const hashed = await bcrypt.hash(password, 10);
    const { rows: [updated] } = await pool.query(
      'UPDATE customers SET password = $1 WHERE id = $2 RETURNING *', [hashed, user.id]
    );
    await pool.query(`UPDATE password_resets SET status = 'used', used_at = NOW() WHERE id = $1`, [request.id]);
    for (const key of failures.keys()) if (key.endsWith(`|${clean(req.body.login).toLowerCase()}`)) failures.delete(key);

    res.json({ message: 'Senha nova criada!', token: generateToken(updated), user: publicUser(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar a senha nova' });
  }
});

// Usado pelo admin ao aprovar (customers.js): gera o código e manda como notificação para o cliente
const approveReset = async (requestId) => {
  const code = String(crypto.randomInt(100000, 1000000));
  const { rows: [request] } = await pool.query(
    `UPDATE password_resets SET status = 'approved', code_hash = $2, attempts = 0, approved_at = NOW(),
       expires_at = NOW() + INTERVAL '${RESET_MINUTES} minutes'
     WHERE id = $1 AND status IN ('pending', 'approved') RETURNING customer_id, expires_at`,
    [requestId, await bcrypt.hash(code, 10)]
  );
  if (!request) return null;
  notifyCustomer(request.customer_id, {
    title: '🔑 Seu código do Empório',
    body: `Código para criar a senha nova: ${code} (vale ${RESET_MINUTES} minutos)`,
    tag: 'senha-nova',
    url: '/'
  });
  return { code, expires_at: request.expires_at };
};

module.exports = router;
module.exports.approveReset = approveReset;