#!/usr/bin/env node
// Fills a NEW, EMPTY PostgreSQL test database for the preview backend (see server/docs/preview-environment.md):
// production schema + migrations 001-003, one test user, and invented clients / inquiries / history for visual and functional review.
//
//   DATABASE_URL=<test database>  PREVIEW_TEST_PASSWORD=<12+ characters, chosen by you>  node scripts/seed-preview.mjs [--reset]
//
// Safety: it refuses any database that already contains clients, inquiries or users (a real CRM database is never touched).
// --reset only works on a database that this script created itself (it leaves a `preview_marker` table) and then wipes and refills it.
// Never prints the password or the connection string. Inquiries are created by the real signed Tally handler on an in-process
// server with a random one-off secret, so the stored shapes are exactly what production produces. Nothing is sent anywhere.
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { saveRawBody, makeArieTallyHandler, ARIE_PATH } from '../arieWebhook.js';
import { ARIE_FORMS } from '../arieForms.js';
import { payloadFor } from '../test/fixtures.js';

const refuse = msg => { console.error(`seed-preview: ${msg}`); process.exit(2); };
const url = process.env.DATABASE_URL;
const password = process.env.PREVIEW_TEST_PASSWORD || '';
const email = (process.env.PREVIEW_TEST_EMAIL || 'preview-test@example.invalid').trim().toLowerCase();
const reset = process.argv.includes('--reset');
if (!url) refuse('DATABASE_URL (the TEST database) is required');
if (password.length < 12) refuse('PREVIEW_TEST_PASSWORD must be set to at least 12 characters (choose it yourself; it is never printed)');

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 3 });
const sql = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const exists = async t => (await pool.query('SELECT to_regclass($1) AS r', ['public.' + t])).rows[0].r !== null;
const count = async t => ((await exists(t)) ? Number((await pool.query(`SELECT COUNT(*) AS c FROM ${t}`)).rows[0].c) : 0);

// ---- the people (all invented; .invalid addresses) -------------------------------------------------------------------------------------
const PEOPLE = [
    { key: 'maria', form: 'q54MpG', sub: 'preview-maria', name: 'Мария Иванова', email: 'maria.ivanova@example.invalid', phone: '+359 88 100 2001', company: 'Иванова ЕООД',
      notes: 'Искаме чатбот за резервации в салон за красота.', days: 9, status: 'Proposal', country: 'BG', next: ['Изпращане на оферта за чатбот за резервации', -3] },
    // the same person asks for a course: the webhook creates a second profile (it never merges); it is then linked to the first one explicitly
    { key: 'course', form: 'rD5KzL', sub: 'preview-maria-course', name: 'Мария Иванова', email: 'maria.ivanova@example.invalid', phone: '+359 88 100 2001',
      topic: 'Математика за 7. клас', notes: 'Искам курс по математика с тестове.', days: 7, status: 'New', linkTo: 'maria' },
    { key: 'jane', form: 'LD90Dy', sub: 'preview-jane', name: 'Jane Doe', email: 'jane.doe@example.invalid', phone: '+972 50 100 2002', topic: 'Excel for beginners',
      notes: 'Self-paced Excel course with auto-graded tests.', days: 20, status: 'Meeting', country: 'IL', meetingInDays: 2, next: ['Demo call: course platform walkthrough', 5] },
    { key: 'dana', form: '9NBlNE', sub: 'preview-dana', name: 'דנה כהן', email: 'dana.cohen@example.invalid', phone: '+972 52 100 2003', company: 'כהן בע״מ',
      notes: 'אנחנו צריכים צ׳אטבוט להזמנות.', days: 35, status: 'New', country: 'IL', next: ['לשלוח הצעת מחיר', 0] },
    { key: 'georgi', form: 'q54MpG', sub: 'preview-georgi', name: 'Георги Димитров', email: 'georgi.dimitrov@example.invalid', phone: '+359 88 100 2004', company: 'Димитров Строй',
      notes: 'Сайт за строителна фирма с галерия на обектите.', days: 80, status: 'Won', country: 'BG', deal: 1200 },
    { key: 'sarah', form: 'rD5EDo', sub: 'preview-sarah', name: 'Sarah Levi', email: 'sarah.levi@example.invalid', phone: '+972 54 100 2005', company: 'Levi Studio',
      notes: 'Online store for handmade ceramics.', days: 120, status: 'Lost', country: 'IL', lost: 'Budget was too low for the requested online store.' },
    { key: 'yossi', form: 'zEjeEk', sub: 'preview-yossi', name: 'יוסי לוי', email: 'yossi.levi@example.invalid', phone: '+972 53 100 2008', topic: 'אקסל למתחילים',
      notes: 'קורס אקסל עם מבחנים אוטומטיים.', days: 3, status: 'Contacted', country: 'IL' }
];
const HISTORY = {
    maria: [['note', 'Дошла от калкулатора на сайта. Иска чатбот за резервации в салон.', 200], ['call', 'Първи разговор (12 мин.): салон за красота, 3 служители, сега приемат записвания по Viber. Бюджет около 700 EUR.', 150],
        ['whatsapp', 'Изпратих 2 примера за чатбот за резервации. Каза, че ще ги покаже на съдружничката си.', 100], ['email', 'Изпратено кратко описание на обхвата и срок за изработка (3 седмици). Чакам отговор.', 52],
        ['meeting', 'Видео среща: уточнихме функционалностите - онлайн запис, напомняне по SMS, WhatsApp бутон.', 20]],
    jane: [['call', 'Intro call: wants an Excel-for-beginners course with auto-graded tests.', 30], ['note', 'Has PDFs and slides ready, no video yet. Demo scheduled.', 29]],
    dana: [['whatsapp', 'ענתה בווטסאפ - מעוניינת בצ׳אטבוט להזמנות.', 8]],
    georgi: [['call', 'Обсъдихме структурата на сайта: начало, услуги, галерия, контакти.', 1700], ['email', 'Изпратена оферта 1 200 EUR. Приета.', 1500], ['meeting', 'Среща при клиента: снимки на обектите и логото.', 1300]]
};

async function main() {
    const marker = await exists('preview_marker');
    const existing = (await count('clients')) + (await count('leads')) + (await count('users'));
    if (existing > 0 && !(reset && marker)) {
        refuse(existing > 0 && reset ? 'this database was not created by this script (no preview_marker): refusing --reset' : 'the database is not empty (it has clients, inquiries or users). This script only fills a NEW, EMPTY test database.');
    }
    if (existing > 0) {
        const tables = [];
        for (const t of ['client_activities', 'leads', 'clients', 'users']) if (await exists(t)) tables.push(t);
        await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    }

    // schema exactly as production creates it, then the three migrations (the same files the owner runs with psql)
    for (const f of ['../test/legacy_schema.sql', '../migrations/001_tally_submission.sql', '../migrations/002_six_forms.sql', '../migrations/003_client_hub.sql']) await pool.query(sql(f));
    await pool.query('CREATE TABLE IF NOT EXISTS preview_marker (created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    if (!marker) await pool.query('INSERT INTO preview_marker DEFAULT VALUES');

    await pool.query('INSERT INTO users (name, email, password) VALUES ($1, $2, $3)', ['Preview Tester', email, await bcrypt.hash(password, 10)]);

    // inquiries through the real signed handler (in-process, random one-off secret, nothing leaves this machine)
    const secret = crypto.randomBytes(16).toString('hex');
    process.env.ARIE_TALLY_SIGNING_SECRET = secret;
    const app = express();
    app.use(express.json({ verify: saveRawBody }));
    app.post(ARIE_PATH, makeArieTallyHandler({ pool, notify: async () => {} }));
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}${ARIE_PATH}`;
    const log = console.log; console.log = () => {};
    try {
        for (const p of PEOPLE) {
            const payload = payloadFor(p.form, p.sub), q = ARIE_FORMS[p.form].q;
            for (const f of payload.data.fields) {
                const set = { [`question_${q.name}`]: p.name, [`question_${q.email}`]: p.email, [`question_${q.phone}`]: p.phone, [`question_${q.notes}`]: p.notes };
                if (q.company) set[`question_${q.company}`] = p.company || '';
                if (q.topic) set[`question_${q.topic}`] = p.topic || '';
                if (f.key in set) f.value = set[f.key];
            }
            const raw = JSON.stringify(payload);
            const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'tally-signature': crypto.createHmac('sha256', secret).update(raw).digest('base64') }, body: raw });
            if (r.status !== 200) throw new Error(`inquiry ${p.key} was not stored (HTTP ${r.status})`);
        }
    } finally { console.log = log; await new Promise(r => server.close(r)); }

    const idOf = async sub => (await pool.query('SELECT id FROM clients WHERE tally_submission_id = $1', [sub])).rows[0].id;
    const ids = {};
    for (const p of PEOPLE) {
        ids[p.key] = await idOf(p.sub);
        await pool.query(`UPDATE clients SET status = $1, country = $2, deal_value = $3, lost_reason = $4, next_action = $5, next_action_due = CURRENT_DATE + $6::int,
                          meeting_date = CASE WHEN $7::int IS NULL THEN NULL ELSE NOW() + make_interval(days => $7::int) END,
                          created_at = NOW() - make_interval(days => $8::int), updated_at = NOW() - make_interval(days => $8::int) WHERE id = $9`,
            [p.status, p.country || null, p.deal ?? null, p.lost || null, p.next ? p.next[0] : null, p.next ? p.next[1] : 0, p.meetingInDays ?? null, p.days, ids[p.key]]);
        if (!p.next) await pool.query('UPDATE clients SET next_action_due = NULL WHERE id = $1', [ids[p.key]]);
        await pool.query(`UPDATE leads SET created_at = NOW() - make_interval(days => $1::int) WHERE data LIKE $2`, [p.days, `%"submission_id":"${p.sub}"%`]);
    }
    // one client, many inquiries: the course inquiry belongs explicitly to the first profile (the second profile stays, nothing is merged)
    for (const p of PEOPLE.filter(x => x.linkTo)) await pool.query('UPDATE leads SET client_id = $1 WHERE data LIKE $2', [ids[p.linkTo], `%"submission_id":"${p.sub}"%`]);

    await pool.query(`INSERT INTO clients (name, email, phone, company, service_type, preferred_contact, notes, status, country, created_at, updated_at)
                      VALUES ('Иван Петров', 'ivan.petrov@example.invalid', '+359 88 100 2006', 'Петров и синове', 'Онлайн магазин', 'Phone', 'Въведен ръчно след телефонно обаждане. Иска магазин за инструменти.', 'Contacted', 'BG', NOW() - interval '150 days', NOW() - interval '150 days')`);
    const ivan = (await pool.query("SELECT id FROM clients WHERE email = 'ivan.petrov@example.invalid'")).rows[0].id;
    HISTORY.ivan = [['note', 'Иска магазин за инструменти (около 200 артикула). Да се обадя след седмица.', 3000]];
    ids.ivan = ivan;
    // an old flat inquiry that nobody linked: listed under Leads, shown in no client's file
    await pool.query(`INSERT INTO leads (source, data, created_at) VALUES ('Tally', $1, NOW() - interval '145 days')`, [JSON.stringify({ name: 'Петър Стоянов', email: 'petar.stoyanov@example.invalid', phone: '+359 88 100 2007', notes: 'Стар запис от формата, още несвързан с клиент.' })]);

    for (const [key, rows] of Object.entries(HISTORY)) {
        for (const [kind, body, hoursAgo] of rows) {
            await pool.query(`INSERT INTO client_activities (client_id, kind, body, occurred_at, created_at, updated_at) VALUES ($1, $2, $3, NOW() - make_interval(hours => $4::int), NOW() - make_interval(hours => $4::int), NOW() - make_interval(hours => $4::int))`, [ids[key], kind, body, hoursAgo]);
        }
    }

    const n = async t => await count(t);
    console.log(`seed-preview: done. clients=${await n('clients')} inquiries=${await n('leads')} history=${await n('client_activities')} users=${await n('users')} (test login: ${email})`);
}

main().then(() => pool.end()).catch(async err => { console.error('seed-preview failed:', err.code || err.message); await pool.end().catch(() => {}); process.exit(1); });
