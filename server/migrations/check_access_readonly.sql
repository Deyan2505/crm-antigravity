-- READ ONLY diagnostics for Stage 1 (who has access, is the legacy /api/webhook still used, what Stage 2 will have to handle).
-- Changes nothing: one read-only transaction, rolled back at the end. Counts and masked values only, no client data.
--   psql "$DATABASE_URL" -f server/migrations/check_access_readonly.sql
BEGIN TRANSACTION READ ONLY;

-- 1. Who can sign in (every row here is a valid login: any of them can read ALL clients). Emails are masked.
SELECT id, name, regexp_replace(email, '^(.).*(@.*)$', '\1***\2') AS email_masked, created_at FROM users ORDER BY id;

-- 2. Where the clients came from
SELECT COALESCE(NULLIF(source, ''), '(manual or legacy webhook)') AS source, COUNT(*) FROM clients GROUP BY 1 ORDER BY 2 DESC;

-- 3. Is the legacy POST /api/webhook still used? Its leads have no "submission_id"; the signed six-form route always writes one.
--    last_legacy_lead is the date of the newest lead that did NOT come through the signed route.
SELECT date_trunc('month', created_at)::date AS month,
       COUNT(*) FILTER (WHERE data LIKE '%"submission_id"%')     AS via_signed_route,
       COUNT(*) FILTER (WHERE data NOT LIKE '%"submission_id"%') AS other_or_legacy
  FROM leads WHERE source = 'Tally' GROUP BY 1 ORDER BY 1 DESC LIMIT 8;
SELECT MAX(created_at) AS last_legacy_lead, COUNT(*) AS legacy_leads_total FROM leads WHERE source = 'Tally' AND data NOT LIKE '%"submission_id"%';

-- 4. What the Stage 2 backfill will have to report as exceptions (nothing is linked or changed here)
SELECT COUNT(*) AS leads_total,
       COUNT(*) FILTER (WHERE data NOT LIKE '%"submission_id"%') AS no_submission_id,
       COUNT(*) FILTER (WHERE data LIKE '%"submission_id"%'
                          AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.tally_submission_id = substring(leads.data from '"submission_id":"([^"]+)"'))) AS submission_without_client,
       COUNT(*) FILTER (WHERE data !~ '^\s*\{') AS data_not_json_object
  FROM leads;
SELECT COUNT(*) AS clients_total,
       COUNT(*) FILTER (WHERE tally_submission_id IS NOT NULL) AS tally_clients,
       COUNT(*) FILTER (WHERE tally_submission_id IS NULL)     AS manual_or_legacy_clients
  FROM clients;

ROLLBACK;
