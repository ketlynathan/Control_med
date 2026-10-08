const test = require('node:test');
const assert = require('node:assert/strict');
const { User } = require('../../../src/domain/entities/user');

test('cria um utilizador normalizando o e-mail', () => {
  const user = User.create({
    id: 'user-1',
    email: '  ADMIN@EXEMPLO.COM ',
    passwordHash: 'hash-seguro',
    businessName: 'Clínica Control Med',
    createdAt: '2026-10-08T12:00:00.000Z',
  });

  assert.equal(user.email, 'admin@exemplo.com');
  assert.equal(user.businessName, 'Clínica Control Med');
  assert.equal(user.role, User.ROLES.ADMIN);
  assert.equal(user.isAdmin(), true);
  assert.equal(user.canManageUsers(), true);
});

test('não expõe o hash da palavra-passe na serialização pública', () => {
  const user = User.create({
    id: 'user-2',
    email: 'operador@exemplo.com',
    passwordHash: 'hash-seguro',
    businessName: 'Clínica Control Med',
    role: User.ROLES.OPERATOR,
  });

  assert.deepEqual(user.toJSON(), {
    id: 'user-2',
    email: 'operador@exemplo.com',
    businessName: 'Clínica Control Med',
    role: 'operator',
    createdAt: user.createdAt.toISOString(),
  });
  assert.equal(user.canManageUsers(), false);
});

test('rejeita dados essenciais inválidos', () => {
  assert.throws(
    () => User.create({ id: 'user-3', email: 'invalido', passwordHash: 'hash', businessName: 'Clínica' }),
    /e-mail.*inválido/i,
  );
  assert.throws(
    () => User.create({ id: 'user-3', email: 'user@exemplo.com', passwordHash: 'hash', businessName: '' }),
    /nome do negócio.*obrigatório/i,
  );
  assert.throws(
    () => User.create({ id: 'user-3', email: 'user@exemplo.com', passwordHash: 'hash', businessName: 'Clínica', role: 'unknown' }),
    /perfil.*inválido/i,
  );
});
