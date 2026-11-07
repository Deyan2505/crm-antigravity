-- Stage 2A: Client Hub 360. Review only: the owner runs it once on the production DB (take a backup first) BEFORE deploying the API
-- that uses it. The API also works without it (see /api/clients/:id/hub "capabilities"): the hub then shows a notice instead of
-- the timeline / next action. Additive and idempotent: only new nullable columns, one new table, two indexes.
-- No existing row is changed and no backfill runs. leads.data (the original Tally answers) is never touched.

-- 1. Profile fields the Google Sheet has and the CRM did not: country, next action (+ optional due date).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS country         TEXT,
  ADD COLUMN IF NOT EXISTS next_action     TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due DATE;

-- 2. Explicit link inquiry -> client (one client, many inquiries). NULL = not linked explicitly; the API then falls back to the
--    exact Tally submission id (clients.tally_submission_id = the "submission_id" inside leads.data). Never matched by e-mail/phone.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_client_id ON leads (client_id);

-- 3. Communication history, entered by hand: note, call, e-mail, WhatsApp, meeting. Nothing is synced from anywhere.
--    RESTRICT: a client that has history cannot be deleted by accident (the API answers 409 HAS_HISTORY).
CREATE TABLE IF NOT EXISTS client_activities (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  kind        TEXT NOT NULL CHECK (kind IN ('note', 'call', 'email', 'whatsapp', 'meeting')),
  body        TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_activities_client ON client_activities (client_id, occurred_at DESC);

-- Check afterwards (expect 3, 1, 1):
--   SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'clients' AND column_name IN ('country','next_action','next_action_due');
--   SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'client_id';
--   SELECT COUNT(*) FROM information_schema.tables  WHERE table_name = 'client_activities';
-- Rollback (only if nothing was entered yet; it drops the history):
--   DROP TABLE IF EXISTS client_activities;
--   DROP INDEX IF EXISTS idx_leads_client_id;
--   ALTER TABLE leads   DROP COLUMN IF EXISTS client_id;
--   ALTER TABLE clients DROP COLUMN IF EXISTS country, DROP COLUMN IF EXISTS next_action, DROP COLUMN IF EXISTS next_action_due;
