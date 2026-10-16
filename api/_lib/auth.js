const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const TOKEN_EXPIRY = '30d';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET deve estar configurada com pelo menos 32 bytes aleatórios.');
  }
  return secret;
}

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_EXPIRY, algorithm: 'HS256' });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
}

/** Extracts and validates the business id from the Authorization: Bearer header. */
function getAuthBusinessId(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return null;
  try {
    const decoded = verifyToken(match[1]);
    return typeof decoded.businessId === 'string' && decoded.businessId ? decoded.businessId : null;
  } catch (err) {
    return null;
  }
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken, getAuthBusinessId };
