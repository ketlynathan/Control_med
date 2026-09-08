const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const TOKEN_EXPIRY = '30d';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET não está configurada nas variáveis de ambiente da Vercel.');
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
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

/** Extracts and validates the business id from the Authorization: Bearer header. */
function getAuthBusinessId(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const decoded = verifyToken(token);
    return decoded.businessId || null;
  } catch (err) {
    return null;
  }
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken, getAuthBusinessId };
