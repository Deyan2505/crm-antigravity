-- Review only. Run once on the production DB BEFORE deploying the patch (take a backup first).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tally_submission_id TEXT,
  ADD COLUMN IF NOT EXISTS source      TEXT,
  ADD COLUMN IF NOT EXISTS price_range TEXT,
  ADD COLUMN IF NOT EXISTS lang        TEXT;

-- Plain UNIQUE index: NULLs (manual clients, old rows) never collide, so existing data is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS ux_clients_tally_submission_id ON clients (tally_submission_id);

-- Rollback: DROP INDEX IF EXISTS ux_clients_tally_submission_id;
--           ALTER TABLE clients DROP COLUMN tally_submission_id, DROP COLUMN source, DROP COLUMN price_range, DROP COLUMN lang;
