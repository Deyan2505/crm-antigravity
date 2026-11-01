import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';
import express from 'express';
import pg from 'pg';
import { saveRawBody, makeArieTallyHandler, ARIE_PATH } from '../arieWebhook.js';
import { ARIE_FORMS } from '../arieForms.js';
import { payloadFor, portfolioPayload, SAMPLE, PORTFOLIO_TEXT } from './fixtures.js';

// Safety: only ever run against a throwaway local database.
const DB_URL = process.env.TEST_DATABASE_URL;
assert.ok(DB_URL && /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL), 'TEST_DATABASE_URL must point to localhost');

const SECRET = 'int-test-secret';
const sign = raw => crypto.createHmac('sha256', SECRET).update(raw).digest('base64');
const pool = new pg.Pool({ connectionString: DB_URL });

const SCHEMA = fs.readFileSync(new URL('./legacy_schema.sql', import.meta.url), 'utf8');
const MIGRATION_001 = fs.readFileSync(new URL('../migrations/001_tally_submission.sql', import.meta.url), 'utf8');
const MIGRATION_002 = fs.readFileSync(new URL('../migrations/002_six_forms.sql', import.meta.url), 'utf8');

const body = (submissionId, extra = []) => ({
    eventType: 'FORM_RESPONSE',
    data: {
        formId: 'q54MpG', submissionId,
        fields: [
            { key: 'question_61yQMY', label: 'Как да се обръщаме към вас?', type: 'INPUT_TEXT', value: 'Тест Клиент' },
            { key: 'question_7Jz9M0', label: 'На какъв имейл можем да се свържем с вас?', type: 'INPUT_EMAIL', value: 'pii-test@example.invalid' },
            { key: 'question_b2y4v1', label: 'На какъв телефон можем да се свържем с вас?', type: 'INPUT_PHONE_NUMBER', value: '+359000000000' },
            { key: 'question_96yJM5', label: 'Какви допълнителни възможности бихте искали за вашия сайт?', type: 'CHECKBOXES', value: ['a'], options: [{ id: 'a', text: 'Онлайн резервации' }] },
            { key: 'k5', label: 'lang', type: 'HIDDEN_FIELDS', value: 'bg' },
            { key: 'k6', label: 'price_range', type: 'HIDDEN_FIELDS', value: '500-1000' },
            { key: 'question_ajgrvX', label: 'Има ли нещо друго, което бихте искали да ни разкажете за проекта си?', type: 'TEXTAREA', value: 'Бележка' },
            ...extra
        ]
    }
});

// ---------- handler-level: real Postgres, injected notify ----------
let notified, server, base, logs;
const origLog = console.log, origErr = console.error, origWarn = console.warn;

async function startHandlerServer(poolArg = pool, notify = async lead => { notified.push(lead); }) {
    const app = express();
    app.use(express.json({ verify: saveRawBody }));
    app.post(ARIE_PATH, makeArieTallyHandler({ pool: poolArg, notify }));
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${server.address().port}${ARIE_PATH}`;
}
const post = (obj, { raw = JSON.stringify(obj), sig = sign(raw) } = {}) =>
    fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'tally-signature': sig } : {}) }, body: raw });
const count = async t => Number((await pool.query(`SELECT COUNT(*) c FROM ${t}`)).rows[0].c);
const tick = () => new Promise(r => setTimeout(r, 50));

// Migrations run over a database that already has CRM data, like production: legacy rows must survive unchanged.
let legacyBefore, legacyAfter, legacyCols;
const LEGACY_SNAPSHOT = "SELECT id, name, email, phone, company, service_type, preferred_contact, notes, status, created_at FROM clients WHERE email LIKE '%@legacy.invalid' ORDER BY id";
before(async () => {
    await pool.query(SCHEMA);
    await pool.query("DELETE FROM clients WHERE email LIKE '%@legacy.invalid'");
    await pool.query(`INSERT INTO clients (name, email, phone, service_type, preferred_contact, notes, status) VALUES
        ('Legacy One', 'one@legacy.invalid', '1', 'Site', 'Phone', 'old note', 'Won'),
        ('Legacy Two', 'two@legacy.invalid', '2', NULL, NULL, NULL, 'New')`);
    await pool.query(`INSERT INTO leads (source, data) VALUES ('Tally', '{"name":"Legacy One"}')`);
    legacyBefore = (await pool.query(LEGACY_SNAPSHOT)).rows;
    await pool.query(MIGRATION_001);
    await pool.query(MIGRATION_002);
    await pool.query(MIGRATION_002); // idempotent: a second run changes nothing and does not fail
    legacyAfter = (await pool.query(LEGACY_SNAPSHOT)).rows;
    legacyCols = (await pool.query("SELECT tally_submission_id, tally_form_id, track, project_type FROM clients WHERE email LIKE '%@legacy.invalid'")).rows;
    process.env.ARIE_TALLY_SIGNING_SECRET = SECRET;
    await startHandlerServer();
});
after(async () => { server.close(); await pool.end(); });
beforeEach(async () => {
    notified = []; logs = [];
    await pool.query('TRUNCATE clients, leads RESTART IDENTITY'); // throwaway test database only (asserted localhost above)
    console.log = console.error = console.warn = (...a) => logs.push(a.join(' '));
});
test.afterEach(() => { if (process.env.SHOW_LOGS) origLog('LOGS:', logs.join(' | ')); console.log = origLog; console.error = origErr; console.warn = origWarn; });

test('migrations 001 + 002 (+ 002 again) over existing CRM rows: rows unchanged, new columns empty, unique index present', async () => {
    assert.equal(legacyBefore.length, 2);
    assert.deepEqual(legacyAfter, legacyBefore);
    assert.ok(legacyCols.every(r => r.tally_submission_id === null && r.tally_form_id === null && r.track === null && r.project_type === null));
    await pool.query(MIGRATION_001);
    await pool.query(MIGRATION_002);
    const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'clients'")).rows.map(r => r.column_name);
    for (const c of ['tally_submission_id', 'source', 'price_range', 'lang', 'tally_form_id', 'track', 'project_type', 'preferred_contact']) assert.ok(cols.includes(c), c);
    const idx = (await pool.query("SELECT indexdef FROM pg_indexes WHERE tablename = 'clients' AND indexname = 'ux_clients_tally_submission_id'")).rows;
    assert.equal(idx.length, 1);
    assert.match(idx[0].indexdef, /CREATE UNIQUE INDEX .* \(tally_submission_id\)/);
    // the database itself refuses a second row with the same submission id (not only the application)
    await pool.query("INSERT INTO clients (name, tally_submission_id) VALUES ('a', 'uniq-1')");
    await assert.rejects(pool.query("INSERT INTO clients (name, tally_submission_id) VALUES ('b', 'uniq-1')"), { code: '23505' });
});

test('all six forms (Portfolio + Learning, BG/EN/HE) are stored in clients and leads with the right fields', async () => {
    for (const id of Object.keys(ARIE_FORMS)) {
        const r = await post(payloadFor(id, 'pg-' + id));
        assert.equal(r.status, 200, id);
    }
    const rows = (await pool.query('SELECT * FROM clients ORDER BY id')).rows;
    assert.equal(rows.length, 6);
    assert.equal(await count('leads'), 6);
    for (const row of rows) {
        const f = ARIE_FORMS[row.tally_form_id], s = SAMPLE[f.lang];
        assert.equal(row.tally_submission_id, 'pg-' + row.tally_form_id);
        assert.equal(row.track, f.track);
        assert.equal(row.lang, f.lang);
        assert.equal(row.name, s.name);
        assert.match(row.email, /@example\.invalid$/);
        assert.equal(row.notes, s.notes);
        assert.equal(row.source, 'Tally'); assert.equal(row.status, 'New');
        if (f.track === 'portfolio') {
            assert.equal(row.project_type, PORTFOLIO_TEXT[row.tally_form_id].project[1][4]); // AI chatbot in the form's language
            assert.equal(row.company, s.company);
            assert.equal(row.price_range, '€600 – €850');
            assert.equal(row.service_type, 'Smart landing page, WhatsApp ordering');
            assert.equal(row.preferred_contact, PORTFOLIO_TEXT[row.tally_form_id].contact[1][2]);
        } else {
            assert.equal(row.project_type, s.topic);
            assert.equal(row.price_range, '');
        }
    }
    assert.equal(rows.find(r => r.tally_form_id === '9NBlNE').name, 'דנה כהן'); // Hebrew stored as Hebrew
    // leads.data stays TEXT with JSON that /api/leads can JSON.parse
    const lead = JSON.parse((await pool.query("SELECT data FROM leads WHERE data LIKE '%zEjeEk%'")).rows[0].data);
    assert.equal(lead.track, 'learning'); assert.equal(lead.form_id, 'zEjeEk'); assert.ok(lead.details.answers.length >= 6);
    await tick();
    assert.equal(notified.length, 6);
});

test('per-form signing secret on Postgres: own secret accepted, shared secret refused for that form', async () => {
    process.env.ARIE_TALLY_SIGNING_SECRETS = JSON.stringify({ LD90Dy: 'own-ld90dy-secret' });
    try {
        const raw = JSON.stringify(payloadFor('LD90Dy', 'own-1'));
        assert.equal((await post(null, { raw, sig: sign(raw) })).status, 401);
        const own = crypto.createHmac('sha256', 'own-ld90dy-secret').update(raw).digest('base64');
        assert.equal((await post(null, { raw, sig: own })).status, 200);
        assert.equal((await post(payloadFor('q54MpG', 'own-2'))).status, 200); // other forms keep the shared secret
        assert.equal(await count('clients'), 2);
    } finally { delete process.env.ARIE_TALLY_SIGNING_SECRETS; }
});

test('10 concurrent deliveries of a real form submission: one row, nine duplicates', async () => {
    const p = portfolioPayload('9NBlNE', 'burst-he');
    const rs = await Promise.all(Array.from({ length: 10 }, () => post(p)));
    const st = (await Promise.all(rs.map(r => r.json()))).map(j => j.status);
    assert.equal(st.filter(x => x === 'success').length, 1);
    assert.equal(st.filter(x => x === 'duplicate').length, 9);
    assert.equal(await count('clients'), 1);
    assert.equal(await count('leads'), 1);
});

test('valid lead: stored with all fields, leads row, one owner notification', async () => {
    const r = await post(body('s1'));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: 'success' });
    const c = (await pool.query('SELECT * FROM clients')).rows;
    assert.equal(c.length, 1);
    assert.equal(c[0].tally_submission_id, 's1');
    assert.equal(c[0].source, 'Tally');
    assert.equal(c[0].lang, 'bg');
    assert.equal(c[0].price_range, '500-1000');
    assert.equal(c[0].service_type, 'Онлайн резервации');
    assert.equal(c[0].notes, 'Бележка');
    assert.equal(c[0].email, 'pii-test@example.invalid');
    assert.equal(c[0].name, 'Тест Клиент'); // by question id, not by label
    assert.equal(c[0].tally_form_id, 'q54MpG');
    assert.equal(c[0].track, 'portfolio');
    assert.equal(await count('leads'), 1);
    await tick();
    assert.equal(notified.length, 1);
    assert.equal(notified[0].submissionId, 's1');
});

test('replay of the same submission: duplicate, no new rows, no second notification', async () => {
    await post(body('s2'));
    const r = await post(body('s2'));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: 'duplicate' });
    assert.equal(await count('clients'), 1);
    assert.equal(await count('leads'), 1);
    await tick();
    assert.equal(notified.length, 1);
});

test('10 concurrent identical submissions: exactly one row and one notification', async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => post(body('s3'))));
    const statuses = (await Promise.all(rs.map(r => r.json()))).map(j => j.status).sort();
    assert.equal(statuses.filter(s => s === 'success').length, 1);
    assert.equal(statuses.filter(s => s === 'duplicate').length, 9);
    assert.equal(await count('clients'), 1);
    assert.equal(await count('leads'), 1);
    await tick();
    assert.equal(notified.length, 1);
});

test('invalid / missing / malformed signature: 401, nothing stored, no notification', async () => {
    const raw = JSON.stringify(body('s4'));
    for (const sig of [sign(raw + ' '), null, 'garbage', crypto.createHmac('sha256', SECRET).update(raw).digest('hex')]) {
        const r = await post(null, { raw, sig });
        assert.equal(r.status, 401);
    }
    assert.equal(await count('clients'), 0);
    await tick();
    assert.equal(notified.length, 0);
});

test('signature is checked over raw bytes, not re-serialized JSON', async () => {
    const raw = JSON.stringify(body('s5'), null, 4); // pretty-printed, non-ASCII
    const r = await post(null, { raw });
    assert.equal(r.status, 200);
});

test('secret not configured: 503 and nothing stored', async () => {
    delete process.env.ARIE_TALLY_SIGNING_SECRET;
    try {
        const r = await post(body('s6'));
        assert.equal(r.status, 503);
        assert.equal(await count('clients'), 0);
    } finally { process.env.ARIE_TALLY_SIGNING_SECRET = SECRET; }
});

test('missing submission id: 400; missing optional fields: stored with Unknown name', async () => {
    const noId = body('x'); delete noId.data.submissionId;
    assert.equal((await post(noId)).status, 400);
    assert.equal(await count('clients'), 0);

    const r = await post({ data: { submissionId: 's7', fields: [] } });
    assert.equal(r.status, 200);
    const c = (await pool.query('SELECT name, email, phone, lang FROM clients')).rows[0];
    assert.deepEqual(c, { name: 'Unknown', email: '', phone: '', lang: '' });
});

test('existing client with same email: new inquiry row, old row untouched', async () => {
    await pool.query("INSERT INTO clients (name, email, phone, status) VALUES ('Стар Клиент', 'pii-test@example.invalid', '111', 'Confirmed')");
    const before = JSON.stringify((await pool.query('SELECT * FROM clients WHERE id = 1')).rows[0]);
    const r = await post(body('s8'));
    assert.equal(r.status, 200);
    assert.equal(await count('clients'), 2);
    assert.equal(JSON.stringify((await pool.query('SELECT * FROM clients WHERE id = 1')).rows[0]), before);
    await tick();
    assert.equal(notified.length, 1);
});

test('notification failure does not affect stored lead or response', async () => {
    server.close();
    await startHandlerServer(pool, async () => { throw Object.assign(new Error('smtp down pii-test@example.invalid'), { code: 'ECONNECTION' }); });
    const r = await post(body('s9'));
    assert.equal(r.status, 200);
    assert.equal(await count('clients'), 1);
    await tick();
    assert.ok(logs.some(l => l.includes('Owner notification failed: ECONNECTION')));
    assert.ok(!logs.join('\n').includes('smtp down'), 'error message text must not be logged');
});

test('leads insert failure rolls back the client row (atomic), generic 500, no notification', async () => {
    await pool.query('ALTER TABLE leads RENAME TO leads_x');
    try {
        const r = await post(body('s10'));
        assert.equal(r.status, 500);
        assert.deepEqual(await r.json(), { status: 'error' });
        assert.equal(await count('clients'), 0);
        await tick();
        assert.equal(notified.length, 0);
    } finally { await pool.query('ALTER TABLE leads_x RENAME TO leads'); }
    // the same submission can then be retried successfully
    assert.equal((await post(body('s10'))).status, 200);
    assert.equal(await count('clients'), 1);
});

test('internal DB errors are not returned to the client', async () => {
    const bad = { connect: async () => ({ query: async q => { if (/INSERT INTO clients/.test(q)) throw Object.assign(new Error('relation secret_internal missing'), { code: '42P01' }); }, release() {} }) };
    server.close();
    await startHandlerServer(bad);
    const r = await post(body('s11'));
    const text = await r.text();
    assert.equal(r.status, 500);
    assert.equal(text, '{"status":"error"}');
});

test('no personal data in logs', async () => {
    await post(body('s12'));
    await post(body('s12'));
    await post(body('s13'), { sig: 'bad' });
    const all = logs.join('\n');
    for (const pii of ['pii-test@example.invalid', '+359000000000', 'Тест Клиент', 'Бележка']) {
        assert.ok(!all.includes(pii), `log contains PII: ${pii.slice(0, 4)}…`);
    }
});

// ---------- app-level: spawn the real index.js against the same throwaway DB ----------
function startApp(port, env = {}) {
    const child = spawn(process.execPath, ['index.js'], {
        cwd: new URL('..', import.meta.url),
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: String(port), DATABASE_URL: DB_URL + '?sslmode=disable', JWT_SECRET: 'x'.repeat(40),
               ARIE_TALLY_SIGNING_SECRET: SECRET, ...env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const out = []; child.stdout.on('data', d => out.push(String(d))); child.stderr.on('data', d => out.push(String(d)));
    return { child, out };
}
const waitUp = async port => {
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('app did not start');
};

test('app wiring: new route works, legacy /api/webhook untouched, registration closed, manual add works', async () => {
    await pool.query('TRUNCATE clients, leads, users RESTART IDENTITY');
    const closed = startApp(3991);
    const open = startApp(3992, { ALLOW_REGISTRATION: 'true' });
    try {
        await Promise.all([waitUp(3991), waitUp(3992)]);
        const url = p => `http://127.0.0.1:3991${p}`;
        const j = (u, init) => fetch(u, init).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

        // new signed route through the real middleware stack
        const raw = JSON.stringify(body('app1'));
        let r = await j(url(ARIE_PATH), { method: 'POST', headers: { 'content-type': 'application/json', 'tally-signature': sign(raw) }, body: raw });
        assert.deepEqual([r.status, r.body.status], [200, 'success']);
        r = await j(url(ARIE_PATH), { method: 'POST', headers: { 'content-type': 'application/json', 'tally-signature': sign(raw) }, body: raw });
        assert.deepEqual([r.status, r.body.status], [200, 'duplicate']);
        r = await j(url(ARIE_PATH), { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw });
        assert.equal(r.status, 401);

        // legacy flat-format webhook still accepts unsigned requests exactly as before
        r = await j(url('/api/webhook'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Legacy Flow', phone: '1' }) });
        assert.deepEqual([r.status, r.body.status], [200, 'success']);

        // registration closed by default; login endpoint unchanged
        r = await j(url('/api/auth/register'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A', email: 'a@example.invalid', password: 'password123' }) });
        assert.equal(r.status, 403);

        // with the flag on: register -> login -> manual client add -> list shows both sources
        const u2 = p => `http://127.0.0.1:3992${p}`;
        r = await j(u2('/api/auth/register'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Admin', email: 'admin@example.invalid', password: 'password123' }) });
        assert.equal(r.status, 201);
        r = await j(u2('/api/auth/login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.invalid', password: 'password123' }) });
        assert.equal(r.status, 200);
        const auth = { 'content-type': 'application/json', authorization: `Bearer ${r.body.token}` };
        r = await j(u2('/api/clients'), { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Manual Client', email: 'm@example.invalid' }) });
        assert.equal(r.status, 201);
        r = await j(u2('/api/clients'), { headers: auth });
        assert.equal(r.status, 200);
        assert.equal(r.body.total, 3);
        assert.ok(r.body.data.some(c => c.source === 'Tally' && c.tally_submission_id === 'app1'));
        r = await j(u2('/api/leads'), { headers: auth });
        assert.equal(r.status, 200);
        assert.equal(r.body.length, 2);
    } finally { closed.child.kill(); open.child.kill(); }
});
