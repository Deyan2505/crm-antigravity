-- Review only. Run once on the production DB BEFORE deploying the six-form webhook (take a backup first).
-- Idempotent: safe to run again, and safe whether or not 001_tally_submission.sql was already applied
-- (it repeats 001's statements with IF NOT EXISTS). Only adds nullable columns and one index; no existing row changes.

-- from 001: submission id (dedupe key), source, price range, language
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tally_submission_id TEXT,
  ADD COLUMN IF NOT EXISTS source      TEXT,
  ADD COLUMN IF NOT EXISTS price_range TEXT,
  ADD COLUMN IF NOT EXISTS lang        TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_clients_tally_submission_id ON clients (tally_submission_id);

-- new: which Tally form, which direction (portfolio / learning / unknown), what kind of project
-- (preferred_contact already exists in the original clients table)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tally_form_id TEXT,
  ADD COLUMN IF NOT EXISTS track         TEXT,
  ADD COLUMN IF NOT EXISTS project_type  TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_track ON clients (track);

-- Check afterwards (expect 7 rows):
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'clients'
--     AND column_name IN ('tally_submission_id','source','price_range','lang','tally_form_id','track','project_type');
-- Rollback (only the additions of this file; 001's columns stay):
--   DROP INDEX IF EXISTS idx_clients_track;
--   ALTER TABLE clients DROP COLUMN IF EXISTS tally_form_id, DROP COLUMN IF EXISTS track, DROP COLUMN IF EXISTS project_type;
