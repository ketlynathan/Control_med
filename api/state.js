const { getPool } = require('./_lib/db');
const { getAuthBusinessId } = require('./_lib/auth');
const { buildFinancialLedger } = require('../analytics-domain');

const MAX_STATE_BYTES = 4 * 1024 * 1024;
const MAX_VERSION = 9223372036854775807n;

function validVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(version)) return false;
  try { return BigInt(version) <= MAX_VERSION; } catch { return false; }
}

module.exports = async (req, res) => {
  const businessId = getAuthBusinessId(req);
  if (!businessId) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });

  try {
    const pool = getPool();
    if (req.method === 'GET') {
      const result = await pool.query(
        'SELECT state, updated_at, version::text AS version FROM business_state WHERE business_id = $1',
        [businessId]
      );
      if (!result.rows.length) return res.status(200).json({ state: null, updatedAt: null, version: null });
      const state = result.rows[0].state || {};
      const synchronizedState = { ...state, financialMovements: buildFinancialLedger(state).records };
      return res.status(200).json({ state: synchronizedState, updatedAt: result.rows[0].updated_at, version: result.rows[0].version });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const { state, version } = body;
      if (!state || typeof state !== 'object' || Array.isArray(state)) {
        return res.status(400).json({ error: 'Estado inválido.' });
      }
      if (!Object.prototype.hasOwnProperty.call(body, 'version')) {
        return res.status(409).json({ error: 'Esta versão do aplicativo não informa a versão dos dados. Recarregue a página para sincronizar com segurança.' });
      }
      if (version !== null && !validVersion(version)) {
        return res.status(400).json({ error: 'Versão de sincronização inválida.' });
      }

      const synchronizedState = { ...state, financialMovements: buildFinancialLedger(state).records };
      if (Buffer.byteLength(JSON.stringify(synchronizedState), 'utf8') > MAX_STATE_BYTES) {
        return res.status(413).json({ error: 'Os dados ficaram grandes demais para sincronizar (limite ~4MB). Remova anexos antigos ou reduza o tamanho das imagens.' });
      }

      // Application-owned BIGINT avoids relying on PostgreSQL's xmin transaction ID as a durable version.
      const result = version === null
        ? await pool.query(
          'INSERT INTO business_state (business_id, state, version, updated_at) VALUES ($1, $2, 1, now()) ON CONFLICT (business_id) DO NOTHING RETURNING version::text AS version, updated_at',
          [businessId, synchronizedState]
        )
        : await pool.query(
          'UPDATE business_state SET state = $2, version = version + 1, updated_at = now() WHERE business_id = $1 AND version = $3::bigint RETURNING version::text AS version, updated_at',
          [businessId, synchronizedState, version]
        );

      if (!result.rows.length) {
        const current = await pool.query('SELECT version::text AS version FROM business_state WHERE business_id = $1', [businessId]);
        return res.status(409).json({
          error: 'Os dados foram atualizados em outro dispositivo. Sua versão local foi preservada neste navegador; carregue a versão mais recente antes de continuar.',
          version: current.rows[0]?.version || null,
        });
      }
      return res.status(200).json({ ok: true, updatedAt: result.rows[0].updated_at, version: result.rows[0].version });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    console.error('state error:', err);
    return res.status(500).json({ error: 'Erro interno ao acessar os dados salvos.' });
  }
};
