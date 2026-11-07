# Preview environment (Stage 2A review)

```
Vercel Preview (feature/crm-v2-stage2a-client-hub, behind Vercel Authentication)
   │  VITE_API_URL (set for this branch only)
   ▼
Render free web service  crm-server-preview   (PREVIEW_ISOLATED=1, own JWT_SECRET)
   │  DATABASE_URL
   ▼
Neon free project  crm-preview-test   (empty, Oregon, separate quotas; never a copy of production)
```

Nothing here touches production: another Render service, another Neon project, another JWT secret, test data only.

## What is blocked on the preview backend (not just "no keys configured")

| Risk | Guard | Test |
|---|---|---|
| `POST /api/webhook` and `POST /api/webhook/arie-tally` | `app.use('/api/webhook', 403)` before body parsing, any method, any sub-path | `test/isolation.test.js` (real server process) |
| mail, owner notification, Make.com, Tally signatures | the server **refuses to start** if `EMAIL_USER`, `EMAIL_PASS`, `OWNER_NOTIFY_EMAIL`, `MAKE_CRM_WEBHOOK_URL`, `TALLY_SIGNING_SECRET`, `ARIE_TALLY_SIGNING_SECRET(S)`, `ARIE_TALLY_FIELD_KEYS` is set (names are logged, values never) | same |
| public registration | refuses to start if `ALLOW_REGISTRATION=true`; the route is closed by default anyway | same |
| browsers of other sites | CORS admits only `CORS_ORIGIN` (the preview frontend); the production frontend and localhost are not admitted | same |
| the preview frontend writing to production | a Vercel Preview build fails if `VITE_API_URL` is the production API; a Preview build without its own `VITE_API_URL` runs in demo mode (no API at all). The committed `client/.env.local` has no influence when the variable is set in the Vercel project | `client/test/demo.test.js` (real builds) |
| the seed script touching a real database | refuses any database that has clients, inquiries or users; `--reset` only works on a database the script created itself (it leaves a `preview_marker` table) | `test/seed-preview.integration.test.js` |

## One-time setup (the owner does the steps that need a secret)

1. **Neon** - the empty project `crm-preview-test` already exists (Free plan, AWS US West 2). In its console press **Connect**, choose the default branch/database/role, and copy the connection string. Keep it to yourself; do not paste it into a chat.
2. **Seed the test database** (PowerShell, from the repository, `server` folder; `npm ci` once before):
   ```powershell
   $env:DATABASE_URL = '<the Neon connection string>'
   $env:PREVIEW_TEST_PASSWORD = '<a password you choose, at least 12 characters>'
   node scripts/seed-preview.mjs
   ```
   It creates the schema, runs migrations 001-003 (only on this database), one test user `preview-test@example.invalid` with your password, 8 invented clients, 7 inquiries (one client has two), and communication history. It prints counts only. Run `node scripts/seed-preview.mjs --reset` to start over.
3. **Render** - New -> **Blueprint** -> this repository -> branch `feature/crm-v2-stage2a-client-hub` -> Blueprint path `render-preview.yaml`. Render asks for `DATABASE_URL`: paste the Neon connection string there. Apply.
   Manual alternative (if the dashboard rejects a line of the blueprint): New -> Web Service, same repo and branch, Root Directory `server`, Build `npm ci`, Start `node index.js`, instance type **Free**, environment variables `PREVIEW_ISOLATED=1`, `NODE_VERSION=22`, `CORS_ORIGIN=<preview frontend address>`, `JWT_SECRET=<new long random string>`, `DATABASE_URL=<Neon connection string>`.
4. **Vercel** - project `crm-antigravity` -> Settings -> Environment Variables -> add `VITE_API_URL` = the Render service address (`https://crm-server-preview-....onrender.com`), environment **Preview** only, Git branch `feature/crm-v2-stage2a-client-hub`. Then redeploy the branch. Keep Vercel Authentication on.
5. Sign in at the Preview address with `preview-test@example.invalid` and your password.

## Limits and consumption (checked 2026-11-07)

| Resource | Plan | Limit | Used before this setup |
|---|---|---|---|
| Render | Hobby workspace, **no card on file** | 750 free instance hours / month for the whole workspace (a free service sleeps after ~15 min idle and only counts while running), 25 services, 500 pipeline minutes, 5 GB traffic | 2.72 h, 1 service, 0 min, 0 MB |
| Neon | Free | per project: 1 GB, 100 compute hours, 10 branches, scale-to-zero. A new project has its own quota | org total 1.34 CU-h, 0.06 GB |
| Vercel | Hobby | deployment protection stays on; each push builds the preview in ~15 s | - |

The preview adds hours only while someone uses it. Production (`crm-server`) used about 2.7 h in the first week. If the 750 h were ever exhausted, Render would suspend the free services of the workspace for the rest of the month, production included, so suspend or delete the preview service when the review is over.

## Teardown

Render: suspend or delete `crm-server-preview`. Neon: delete the project `crm-preview-test`. Vercel: remove the `VITE_API_URL` variable of the Preview environment (the preview then falls back to the demo mode).
