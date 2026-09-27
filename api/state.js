const { getPool } = require('./_lib/db');
const { getAuthBusinessId } = require('./_lib/auth');
const { buildFinancialLedger } = require('../analytics-domain');

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
        `SELECT state, updated_at,
                xmin::text AS version
         FROM business_state WHERE business_id = $1`,
        [businessId]
      );
      if (!result.rows.length) {
        return res.status(200).json({ state: null, updatedAt: null, version: null });
      }
      const state = result.rows[0].state || {};
      const synchronizedState = { ...state, financialMovements: buildFinancialLedger(state).records };
      return res.status(200).json({ state: synchronizedState, updatedAt: result.rows[0].updated_at, version: result.rows[0].version });
    }

    if (req.method === 'PUT') {
      const { state, version } = req.body || {};
      if (!state || typeof state !== 'object') {
        return res.status(400).json({ error: 'Estado inválido.' });
      }
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'version')) {
        return res.status(409).json({ error: 'Esta versão do aplicativo não informa a versão dos dados. Recarregue a página para sincronizar com segurança.' });
      }
      if (version !== null && (typeof version !== 'string' || !/^\d{1,10}$/.test(version))) {
        return res.status(400).json({ error: 'Versão de sincronização inválida.' });
      }

      // Keep the historical module arrays intact, but derive one canonical movement layer
      // on every write so every device reads the same links, types, and integer-cent values.
      const synchronizedState = { ...state, financialMovements: buildFinancialLedger(state).records };
      const json = JSON.stringify(synchronizedState);
      if (Buffer.byteLength(json, 'utf8') > MAX_STATE_BYTES) {
        return res.status(413).json({
          error: 'Os dados ficaram grandes demais para sincronizar (limite ~4MB). Isso geralmente acontece por causa de anexos (fotos/PDFs). Remova anexos antigos ou reduza o tamanho das imagens.',
        });
      }

      const result = version === null
        ? await pool.query(
          `INSERT INTO business_state (business_id, state, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (business_id) DO NOTHING
           RETURNING xmin::text AS version`,
          [businessId, synchronizedState]
        )
        : await pool.query(
          `UPDATE business_state SET state = $2, updated_at = now()
           WHERE business_id = $1 AND xmin::text = $3
           RETURNING xmin::text AS version`,
          [businessId, synchronizedState, version]
        );

      if (!result.rows.length) {
        const current = await pool.query(
          `SELECT xmin::text AS version
           FROM business_state WHERE business_id = $1`,
          [businessId]
        );
        return res.status(409).json({ error: 'Os dados foram atualizados em outro dispositivo. Sua versão local foi preservada neste navegador; carregue a versão mais recente antes de continuar.', version: current.rows[0]?.version || null });
      }

      return res.status(200).json({ ok: true, updatedAt: result.rows[0].version, version: result.rows[0].version });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    console.error('state error:', err);
    return res.status(500).json({ error: 'Erro interno ao acessar os dados salvos.' });
  }
};
