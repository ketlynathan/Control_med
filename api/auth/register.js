const { getPool } = require('../_lib/db');
const { hashPassword, signToken } = require('../_lib/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { email, password, businessName } = req.body || {};

    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM businesses WHERE email = $1', [normalizedEmail]);
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
      }

      const passwordHash = await hashPassword(password);

      const insert = await client.query(
        'INSERT INTO businesses (email, password_hash) VALUES ($1, $2) RETURNING id',
        [normalizedEmail, passwordHash]
      );
      const businessId = insert.rows[0].id;

    const initialState = {
      business: {
        name: (businessName && String(businessName).trim()) || 'Meu negócio',
        doc: '',
        goal: 0,
        owner: 'Administrador',
      },
    };

      await client.query(
        'INSERT INTO business_state (business_id, state) VALUES ($1, $2)',
        [businessId, initialState]
      );

      const token = signToken({ businessId });
      await client.query('COMMIT');
      return res.status(201).json({ token });
    } catch (transactionError) {
      await client.query('ROLLBACK').catch(() => {});
      throw transactionError;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Erro interno ao criar a conta.' });
  }
};
