-- Migração aditiva do Control_med.
-- Segurança: não altera nem remove businesses/business_state e não executa DROP,
-- DELETE ou TRUNCATE. Pode ser executada novamente com segurança.

CREATE TABLE IF NOT EXISTS business_profiles (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Meu negócio',
  document TEXT NOT NULL DEFAULT '',
  goal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  owner_name TEXT NOT NULL DEFAULT 'Administrador',
  accounting_first_cycle_start DATE,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Operador',
  access_code TEXT,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('entrada', 'saida')),
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT,
  register_legacy_id TEXT,
  collaborator_legacy_id TEXT,
  reconciled BOOLEAN NOT NULL DEFAULT false,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  owner_legacy_id TEXT,
  file_name TEXT NOT NULL DEFAULT '',
  content_type TEXT,
  storage_url TEXT,
  content BYTEA,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS cash_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  opening_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  register_legacy_id TEXT,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS cash_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  closing_date DATE NOT NULL,
  register_legacy_id TEXT,
  actual_amount NUMERIC(14, 2),
  expected_amount NUMERIC(14, 2),
  difference_amount NUMERIC(14, 2),
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS cash_closing_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  closing_legacy_id TEXT NOT NULL,
  expense_date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS payable_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  due_date DATE,
  paid_at DATE,
  paid BOOLEAN NOT NULL DEFAULT false,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS pharmacy_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  minimum_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14, 2),
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS convenio_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  payment_status TEXT,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS cash_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  legacy_id TEXT NOT NULL,
  closing_legacy_id TEXT,
  action TEXT NOT NULL,
  actor_legacy_id TEXT,
  source_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS financial_transactions_business_date_idx
  ON financial_transactions (business_id, transaction_date);
CREATE INDEX IF NOT EXISTS cash_closings_business_date_idx
  ON cash_closings (business_id, closing_date);
CREATE INDEX IF NOT EXISTS payable_accounts_business_due_date_idx
  ON payable_accounts (business_id, due_date);
CREATE INDEX IF NOT EXISTS cash_closing_expenses_business_date_idx
  ON cash_closing_expenses (business_id, expense_date);
