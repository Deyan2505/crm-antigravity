# Six ARIE Tally forms → Universal CRM

Route: `POST /api/webhook/arie-tally` (server/arieWebhook.js). The legacy `POST /api/webhook` is unchanged.

| Direction | BG | EN | HE |
|---|---|---|---|
| ARIE Portfolio (business) | q54MpG | rD5EDo | 9NBlNE |
| ARIE Learning | rD5KzL | LD90Dy | zEjeEk |

Answers are mapped by the stable Tally question ids in `server/arieForms.js`, not by labels.
If a form gets a new or replaced question, add its id there; until then the log shows
`ARIE webhook <formId>: question ids not in payload (form changed?): <roles>` and e-mail, phone and the
description still fall back to the field type.

## Stored per submission

`clients`: name, email, phone, company, notes (description), service_type (calculator services or the ticked
features), price_range, lang (language of the form), preferred_contact, project_type (Portfolio: project kind;
Learning: course subject), track (`portfolio` / `learning` / `unknown`), tally_form_id, tally_submission_id,
source `Tally`, status `New`.
`leads.data`: the same plus `details` (every answer with its label, role, materials, timing, …).
One submission id is stored once (unique index); retries answer `200 duplicate`.

## Secrets (Render → Environment; values never in the repo or logs)

| Variable | Meaning |
|---|---|
| `ARIE_TALLY_SIGNING_SECRET` | shared signing secret (already set) — used by every form without its own secret |
| `ARIE_TALLY_SIGNING_SECRETS` | optional JSON map `{"<formId>":"<secret>", …}` for forms whose Tally webhook has its own secret. A form listed here accepts only its own secret |
| `DATABASE_URL` | already set |
| `OWNER_NOTIFY_EMAIL`, `EMAIL_USER`, `EMAIL_PASS` | owner notification (optional; skipped with a warning if missing) |

No secret at all for a form → `503`. Wrong or missing signature → `401`. Nothing is stored in either case.

## Production rollout (in this order)

1. Backup the production database (Render → PostgreSQL → Backups, or `pg_dump`).
2. Check the schema (read-only):
   `SELECT column_name FROM information_schema.columns WHERE table_name='clients';` and
   `SELECT indexname FROM pg_indexes WHERE tablename='clients';`
3. Run `server/migrations/002_six_forms.sql` once (idempotent; includes 001). Re-run step 2: the 7 columns and
   `ux_clients_tally_submission_id` must exist.
4. Merge the branch to `main`, let Render deploy (Root Directory `server`, `node index.js`). Check `GET /api/health`.
5. Tally, for each of the six forms → Integrations → Webhooks: URL
   `https://crm-server-w6ye.onrender.com/api/webhook/arie-tally`, signing secret = the shared one, or set the form's
   own secret and add it to `ARIE_TALLY_SIGNING_SECRETS` **before** enabling the webhook (Render redeploys on env change).
   Do not point these forms at the legacy `/api/webhook`.
6. One real test submission per direction (e.g. EN Portfolio, BG Learning) with clearly marked test data: Tally webhook
   log shows `200`, the client appears in Clients and Leads with the right track, one owner e-mail; then delete the test
   rows in the CRM.
7. Watch the Render log for `401`, `503`, `500` or `question ids not in payload` during the first days.

## Recovering submissions that never reached the CRM

Tally keeps every submission (q54MpG and rD5KzL had submissions when this was written).
After step 4, replay them through the same parser so they get the same ids and dedupe:

* Dry run first: export the submissions (Tally API `GET /forms/{id}/submissions` or the CSV export), build the
  webhook-shaped body (`data.formId`, `data.submissionId`, `data.fields` with `key: "question_<id>"`) and print what
  `parseArieSubmission` returns — no database writes, no e-mails.
* Before importing, check by e-mail and date which of them already exist from the legacy `/api/webhook` (those rows have
  no `tally_submission_id`) and skip them by hand.
* Import with the original submission id in `tally_submission_id` and `ON CONFLICT (tally_submission_id) DO NOTHING`,
  so re-running is harmless; no owner notification during the import. Alternative without new code: Tally's
  "Resend" on each submission in the webhook log, which goes through the signed route and the same dedupe.

## Tests

`npm test` — parser and signatures (tally.test.js) and the six forms over HTTP with an in-memory database
(sixforms.test.js): every form, BG/EN/HE text, new project types, per-form secrets, retries, concurrency, bad bodies,
DB failure, changed forms, no personal data in logs.
`TEST_DATABASE_URL=postgres://…@localhost/… npm run test:integration` — the same against a throwaway local Postgres,
including both migrations and the full app (legacy webhook, registration, manual clients).
