'use strict';

/**
 * Entidade de utilizador do sistema Control_med.
 *
 * Esta camada não conhece HTTP, PostgreSQL, JWT ou qualquer framework.
 * As regras aqui são regras de negócio puras e podem ser reutilizadas
 * por controllers, casos de uso e testes.
 */
class User {
  static ROLES = Object.freeze({
    ADMIN: 'admin',
    OPERATOR: 'operator',
  });

  constructor({ id, email, passwordHash, businessName, role = User.ROLES.ADMIN, createdAt } = {}) {
    this.id = User.#requiredText(id, 'id');
    this.email = User.normalizeEmail(email);
    this.passwordHash = User.#requiredText(passwordHash, 'passwordHash');
    this.businessName = User.#businessName(businessName);
    this.role = User.#role(role);
    this.createdAt = User.#date(createdAt, 'createdAt');

    Object.freeze(this);
  }

  static create({ id, email, passwordHash, businessName, role, createdAt } = {}) {
    return new User({ id, email, passwordHash, businessName, role, createdAt });
  }

  static normalizeEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error('O e-mail do utilizador é inválido.');
    }
    return normalized;
  }

  isAdmin() {
    return this.role === User.ROLES.ADMIN;
  }

  canManageUsers() {
    return this.isAdmin();
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      businessName: this.businessName,
      role: this.role,
      createdAt: this.createdAt.toISOString(),
    };
  }

  static #requiredText(value, field) {
    const text = String(value || '').trim();
    if (!text) throw new Error(`O campo ${field} é obrigatório.`);
    return text;
  }

  static #businessName(value) {
    const name = String(value || '').trim();
    if (!name) throw new Error('O nome do negócio é obrigatório.');
    if (name.length > 120) throw new Error('O nome do negócio não pode exceder 120 caracteres.');
    return name;
  }

  static #role(value) {
    if (!Object.values(User.ROLES).includes(value)) {
      throw new Error('O perfil do utilizador é inválido.');
    }
    return value;
  }

  static #date(value, field) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) throw new Error(`O campo ${field} contém uma data inválida.`);
    return date;
  }
}

module.exports = { User };
