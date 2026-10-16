-- Apply once to existing deployments before deploying code that uses version.
-- Back up the database first. Existing rows start at version 1.
ALTER TABLE business_state
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_state_version_positive'
  ) THEN
    ALTER TABLE business_state ADD CONSTRAINT business_state_version_positive CHECK (version > 0);
  END IF;
END $$;
