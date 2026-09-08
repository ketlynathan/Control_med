-- Execute este script uma vez no seu banco Postgres (Neon, Supabase, Vercel Postgres, etc.)
-- antes do primeiro deploy. A maioria dos provedores tem um "SQL editor" no painel
-- onde você pode colar e rodar isso diretamente.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_state (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_state_updated_at_idx ON business_state (updated_at);
