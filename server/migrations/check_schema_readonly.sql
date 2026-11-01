-- READ ONLY. Run against production BEFORE 002_six_forms.sql to see what is there. Changes nothing:
-- the whole check runs in a read-only transaction that is rolled back at the end.
-- psql "$DATABASE_URL" -f server/migrations/check_schema_readonly.sql
BEGIN TRANSACTION READ ONLY;

-- 1. Tables the app uses
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name IN ('clients', 'leads', 'users') ORDER BY table_name;

-- 2. clients columns: which of the 001 / 002 columns already exist (missing ones show present = false)
SELECT c.col, (i.column_name IS NOT NULL) AS present, i.data_type
  FROM (VALUES ('tally_submission_id'), ('source'), ('price_range'), ('lang'),
               ('tally_form_id'), ('track'), ('project_type'), ('preferred_contact'), ('service_type'), ('notes')) AS c(col)
  LEFT JOIN information_schema.columns i ON i.table_schema = 'public' AND i.table_name = 'clients' AND i.column_name = c.col
 ORDER BY c.col;

-- 3. leads.data type (the API does JSON.parse on it: must be text, not jsonb)
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'leads' ORDER BY ordinal_position;

-- 4. Indexes on clients (the dedupe key needs ux_clients_tally_submission_id, UNIQUE)
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'clients' ORDER BY indexname;

-- 5. Would the unique index fail? Duplicate non-null submission ids (only if the column already exists; else skip this query)
-- SELECT tally_submission_id, COUNT(*) FROM clients WHERE tally_submission_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;

-- 6. Counts only, no personal data: rows per source, and Tally rows per day for the last 30 days
SELECT COALESCE(NULLIF(to_jsonb(c) ->> 'source', ''), '(none)') AS source, COUNT(*) FROM clients c GROUP BY 1 ORDER BY 2 DESC;
SELECT date_trunc('day', created_at)::date AS day, COUNT(*) FROM leads
 WHERE source = 'Tally' AND created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1;

-- 7. Rights of the app user for the migration (ALTER TABLE needs the table owner)
SELECT tableowner, current_user FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients';

ROLLBACK;
