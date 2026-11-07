// The preview test database: scripts/seed-preview.mjs on real PostgreSQL, then the REAL server in isolated mode on top of it.
// Creates and drops its own throwaway databases next to TEST_DATABASE_URL; refuses to run against a non-local server.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
assert.ok(ADMIN_URL && /@(localhost|127\.0\.0\.1)[:/]/.test(ADMIN_URL), 'TEST_DATABASE_URL must point to localhost');
const u = new URL(ADMIN_URL);
const urlFor = db => ADMIN_URL.replace(/\/[^/?]+(\?.*)?$/, `/${db}`);
const SERVER_DIR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DB = { seeded: `crm_seed_${process.pid}`, real: `crm_seedreal_${process.pid}` };
const PASSWORD = 'A-test-password-12345'; // a throwaway value for a throwaway database
const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
let pool, realPool;

const seed = (db, { args = [], env = {} } = {}) => {
    const r = spawnSync(process.execPath, ['scripts/seed-preview.mjs', ...args], {
        cwd: SERVER_DIR, encoding: 'utf8', timeout: 90000,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: urlFor(db), PREVIEW_TEST_PASSWORD: PASSWORD, ...env }
    });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const n = async (p, sql) => Number((await p.query(sql)).rows[0].c);
const state = p => p.query(`SELECT (SELECT COUNT(*) FROM clients) AS clients, (SELECT COUNT(*) FROM leads) AS leads, (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM client_activities) AS activities`).then(r => Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)])));

before(async () => {
    for (const db of Object.values(DB)) { await admin.query(`DROP DATABASE IF EXISTS ${db}`); await admin.query(`CREATE DATABASE ${db}`); }
    pool = new pg.Pool({ connectionString: urlFor(DB.seeded) });
    realPool = new pg.Pool({ connectionString: urlFor(DB.real) });
});
after(async () => {
    await pool.end(); await realPool.end();
    for (const db of Object.values(DB)) await admin.query(`DROP DATABASE IF EXISTS ${db}`);
    await admin.end();
});

test('seed refuses to run without a database or with a weak/missing password (nothing is touched)', () => {
    let r = seed(DB.seeded, { env: { DATABASE_URL: '' } });
    assert.equal(r.code, 2); assert.match(r.out, /DATABASE_URL/);
    for (const PREVIEW_TEST_PASSWORD of ['', 'short']) { r = seed(DB.seeded, { env: { PREVIEW_TEST_PASSWORD } }); assert.equal(r.code, 2); assert.match(r.out, /at least 12 characters/); }
});

test('seed fills an empty database: schema + migrations 001-003, one test user, invented clients, inquiries and history; prints no secrets', async () => {
    const r = seed(DB.seeded);
    assert.equal(r.code, 0, r.out);
    assert.ok(!r.out.includes(PASSWORD) && !r.out.includes(urlFor(DB.seeded)) && !r.out.includes(u.password), 'neither the password nor the connection string is printed');
    assert.deepEqual(await state(pool), { clients: 8, leads: 8, users: 1, activities: 12 }, '7 Tally clients + 1 manual, 7 inquiries + 1 unlinked old one');
    assert.equal(await n(pool, 'SELECT COUNT(*) c FROM preview_marker'), 1);
    assert.equal(await n(pool, "SELECT COUNT(*) c FROM information_schema.columns WHERE (table_name = 'clients' AND column_name IN ('country','next_action','next_action_due')) OR (table_name = 'leads' AND column_name = 'client_id')"), 4, 'migration 003 applied');
    const user = (await pool.query('SELECT email, password FROM users')).rows[0];
    assert.equal(user.email, 'preview-test@example.invalid'); assert.notEqual(user.password, PASSWORD); assert.match(user.password, /^\$2[aby]\$/, 'bcrypt hash only');
    // everything is invented
    assert.equal(await n(pool, "SELECT COUNT(*) c FROM clients WHERE email IS NOT NULL AND email NOT LIKE '%@example.invalid'"), 0);
    // the six forms + one more portfolio: BG/EN/HE, both tracks; stored by the real handler (original answers kept, label + value)
    const tracks = (await pool.query("SELECT track, lang, COUNT(*) AS c FROM clients WHERE tally_submission_id IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2")).rows.map(x => `${x.track}/${x.lang}:${x.c}`);
    assert.deepEqual(tracks, ['learning/bg:1', 'learning/en:1', 'learning/he:1', 'portfolio/bg:2', 'portfolio/en:1', 'portfolio/he:1']);
    const lead = JSON.parse((await pool.query("SELECT data FROM leads WHERE data LIKE '%preview-maria\"%'")).rows[0].data);
    assert.ok(lead.details.answers.length >= 8 && lead.details.answers.some(a => a.value === 'maria.ivanova@example.invalid'), 'the original answers carry the same invented person as the client row');
    // one client, many inquiries: exactly one explicit link, and the duplicate profile is still there (nothing merged)
    assert.equal(await n(pool, 'SELECT COUNT(*) c FROM leads WHERE client_id IS NOT NULL'), 1);
    assert.equal(await n(pool, "SELECT COUNT(*) c FROM clients WHERE name = 'Мария Иванова'"), 2);
    assert.equal(await n(pool, 'SELECT COUNT(*) c FROM clients WHERE next_action_due < CURRENT_DATE'), 1, 'one overdue next action to look at');
    assert.equal(await n(pool, "SELECT COUNT(*) c FROM clients WHERE status = 'Won' AND deal_value = 1200"), 1);
});

test('seed refuses to run again on a filled database (nothing changes); --reset wipes and refills only a database it created itself', async () => {
    const before = await state(pool);
    const again = seed(DB.seeded);
    assert.equal(again.code, 2); assert.match(again.out, /not empty/); assert.deepEqual(await state(pool), before);
    await pool.query("UPDATE clients SET name = 'Edited during review' WHERE id = 1");
    const reset = seed(DB.seeded, { args: ['--reset'] });
    assert.equal(reset.code, 0, reset.out);
    assert.deepEqual(await state(pool), before);
    assert.equal(await n(pool, "SELECT COUNT(*) c FROM clients WHERE name = 'Edited during review'"), 0, 'refilled from scratch');
    assert.equal(await n(pool, 'SELECT MIN(id) c FROM clients'), 1, 'ids restart');
    assert.equal(await n(pool, 'SELECT COUNT(*) c FROM preview_marker'), 1);
});

test('a real-looking CRM database (data, no marker) is never touched, not even with --reset', async () => {
    await realPool.query(`CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT, status TEXT DEFAULT 'New');
        CREATE TABLE leads (id SERIAL PRIMARY KEY, source TEXT, data TEXT, created_at TIMESTAMP DEFAULT NOW());
        CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT);
        INSERT INTO clients (name, email) VALUES ('Real Client', 'real@client.example')`);
    for (const args of [[], ['--reset']]) {
        const r = seed(DB.real, { args });
        assert.equal(r.code, 2, r.out);
        assert.deepEqual((await realPool.query('SELECT name FROM clients')).rows, [{ name: 'Real Client' }]);
        assert.equal(await n(realPool, "SELECT COUNT(*) c FROM information_schema.tables WHERE table_name IN ('client_activities','preview_marker')"), 0, 'no table was added');
    }
    assert.match(seed(DB.real, { args: ['--reset'] }).out, /not created by this script/);
});

// ---- the real server on top of the seeded database, in isolated mode ----------------------------------------------------------------------
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
test('real server (isolated) on the seeded database: login works, the hub shows several inquiries of one client, webhooks are blocked', async () => {
    const port = await freePort();
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: String(port), JWT_SECRET: 'seed-test-jwt-secret-seed-test-jwt-secret', PREVIEW_ISOLATED: '1', CORS_ORIGIN: 'https://preview-frontend.example.invalid',
        PGHOST: u.hostname, PGPORT: u.port, PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: DB.seeded };
    const child = spawn(process.execPath, ['index.js'], { cwd: SERVER_DIR, env });
    let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    try {
        for (let i = 0; i < 200 && !/PostgreSQL database connected/.test(out); i++) await new Promise(r => setTimeout(r, 50));
        assert.match(out, /PostgreSQL database connected/, out);
        const base = `http://127.0.0.1:${port}`;
        const call = async (method, path, body, token) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };

        assert.equal((await call('POST', '/api/auth/login', { email: 'preview-test@example.invalid', password: 'wrong-password-xx' })).status, 401);
        const login = await call('POST', '/api/auth/login', { email: 'preview-test@example.invalid', password: PASSWORD });
        assert.equal(login.status, 200); const token = login.body.token; assert.ok(token);
        assert.equal((await call('GET', '/api/clients')).status, 401, 'no token, no data');

        const list = (await call('GET', '/api/clients?limit=200', undefined, token)).body;
        assert.equal(list.total, 8);
        const maria = list.data.find(c => c.tally_submission_id === 'preview-maria'), course = list.data.find(c => c.tally_submission_id === 'preview-maria-course');
        const hub = (await call('GET', `/api/clients/${maria.id}/hub`, undefined, token)).body;
        assert.deepEqual(hub.capabilities, { activities: true, inquiryLink: true, profileFields: true });
        assert.deepEqual(hub.inquiries.map(i => i.link).sort(), ['explicit', 'submission'], 'two inquiries of one client');
        assert.equal(hub.activities.length, 5); assert.ok(hub.last_contact_at);
        assert.ok(hub.client.next_action_due < new Date().toISOString().slice(0, 10), 'overdue');
        assert.deepEqual((await call('GET', `/api/clients/${course.id}/hub`, undefined, token)).body.inquiries, [], 'the duplicate profile keeps no inquiry: nothing was merged');

        // writes go to PostgreSQL and survive (this is what F5 shows)
        const added = await call('POST', `/api/clients/${maria.id}/activities`, { kind: 'call', body: 'Added through the real API' }, token);
        assert.equal(added.status, 201);
        assert.equal((await call('PUT', `/api/clients/${maria.id}`, { next_action: 'Saved in PostgreSQL', next_action_due: '2026-12-24' }, token)).status, 200);
        const again = (await call('GET', `/api/clients/${maria.id}/hub`, undefined, token)).body;
        assert.equal(again.activities[0].body, 'Added through the real API'); assert.equal(again.client.next_action_due, '2026-12-24');
        assert.equal((await pool.query("SELECT COUNT(*)::int AS c FROM client_activities WHERE body = 'Added through the real API'")).rows[0].c, 1, 'the row is in the database');

        for (const path of ['/api/webhook', '/api/webhook/arie-tally']) assert.equal((await call('POST', path, {}, token)).status, 403, path);
        assert.equal((await call('POST', '/api/auth/register', { name: 'x', email: 'x@example.invalid', password: 'long-enough-pass' })).status, 403);
    } finally { child.kill(); await new Promise(r => child.on('exit', r)); }
});
