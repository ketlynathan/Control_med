const { getPool } = require('./_lib/db');
const { getAuthBusinessId } = require('./_lib/auth');

// Vercel serverless functions (Node runtime) reject request bodies above ~4.5MB.
// We keep a safety margin because anexos (attachments) are stored as base64 inside the JSON state.
const MAX_STATE_BYTES = 4 * 1024 * 1024;

module.exports = async (req, res) => {
  const businessId = getAuthBusinessId(req);
  if (!businessId) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  const pool = getPool();

  try {
    if (req.method === 'GET') {
      const result = await pool.query(
        'SELECT state, updated_at FROM business_state WHERE business_id = $1',
        [businessId]
      );
      if (!result.rows.length) {
        return res.status(200).json({ state: null, updatedAt: null });
      }
      return res.status(200).json({ state: result.rows[0].state, updatedAt: result.rows[0].updated_at });
    }

    if (req.method === 'PUT') {
      const { state } = req.body || {};
      if (!state || typeof state !== 'object') {
        return res.status(400).json({ error: 'Estado inválido.' });
      }

      const json = JSON.stringify(state);
      if (Buffer.byteLength(json, 'utf8') > MAX_STATE_BYTES) {
        return res.status(413).json({
          error: 'Os dados ficaram grandes demais para sincronizar (limite ~4MB). Isso geralmente acontece por causa de anexos (fotos/PDFs). Remova anexos antigos ou reduza o tamanho das imagens.',
        });
      }

      await pool.query(
        `INSERT INTO business_state (business_id, state, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (business_id)
         DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
        [businessId, state]
      );

      return res.status(200).json({ ok: true, updatedAt: new Date().toISOString() });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    console.error('state error:', err);
    return res.status(500).json({ error: 'Erro interno ao acessar os dados salvos.' });
  }
};
