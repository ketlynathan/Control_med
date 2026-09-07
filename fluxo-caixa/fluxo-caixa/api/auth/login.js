const { getPool } = require('../_lib/db');
const { comparePassword, signToken } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const pool = getPool();

    const result = await pool.query(
      'SELECT id, password_hash FROM businesses WHERE email = $1',
      [normalizedEmail]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const business = result.rows[0];
    const valid = await comparePassword(password, business.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const token = signToken({ businessId: business.id });
    return res.status(200).json({ token });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Erro interno ao autenticar.' });
  }
};
