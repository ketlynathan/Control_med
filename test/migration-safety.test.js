const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(__dirname, '../migrations/20261008101500_add_normalized_tables.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const executableSql = migration.replace(/^\s*--.*$/gm, '');

// Comentários também são verificados de propósito: a política de migração deve
// permanecer evidente para quem revisar o SQL no futuro.
test('migração normalizada é aditiva e não destrutiva', () => {
  assert.doesNotMatch(executableSql, /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i);
  assert.doesNotMatch(executableSql, /\b(TRUNCATE|DELETE\s+FROM)\b/i);
  assert.match(executableSql, /CREATE TABLE IF NOT EXISTS business_profiles/i);
  assert.match(executableSql, /CREATE TABLE IF NOT EXISTS financial_transactions/i);
  assert.match(executableSql, /CREATE TABLE IF NOT EXISTS cash_closings/i);
  assert.match(executableSql, /CREATE TABLE IF NOT EXISTS payable_accounts/i);
  assert.match(executableSql, /UNIQUE \(business_id, legacy_id\)/i);
});

test('migração mantém o legado fora do escopo de alteração', () => {
  assert.doesNotMatch(executableSql, /ALTER\s+TABLE\s+(businesses|business_state)\b/i);
  assert.doesNotMatch(executableSql, /INSERT\s+INTO\s+(businesses|business_state)\b/i);
});
