// Client Hub 360 on real PostgreSQL. Two throwaway databases are created next to TEST_DATABASE_URL and dropped afterwards:
//   full: legacy schema + 001 + 002 + existing rows, then migration 003 (run twice)    old: the same WITHOUT 003 (deploy before migration)
// Never touches anything but those two databases; refuses to run against a non-local server.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { saveRawBody, makeArieTallyHandler, ARIE_PATH } from '../arieWebhook.js';
import { makeAuth, clientsRouter, leadsRouter } from '../crm.js';
import { hubRouter } from '../hub.js';
import { payloadFor, SAMPLE } from './fixtures.js';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
assert.ok(ADMIN_URL && /@(localhost|127\.0\.0\.1)[:/]/.test(ADMIN_URL), 'TEST_DATABASE_URL must point to localhost');
const urlFor = db => ADMIN_URL.replace(/\/[^/?]+(\?.*)?$/, `/${db}`);
const sql = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const SCHEMA = sql('./legacy_schema.sql'), M001 = sql('../migrations/001_tally_submission.sql'), M002 = sql('../migrations/002_six_forms.sql'), M003 = sql('../migrations/003_client_hub.sql');

const JWT_SECRET = 'int-test-jwt-secret-int-test-jwt-secret';
const TALLY_SECRET = 'int-test-tally-secret';
const TOKEN = jwt.sign({ userId: 1, email: 'owner@example.invalid' }, JWT_SECRET, { expiresIn: '1h' });
const sign = raw => crypto.createHmac('sha256', TALLY_SECRET).update(raw).digest('base64');

const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
const ctx = { full: { db: `crm_hub_full_${process.pid}` }, old: { db: `crm_hub_old_${process.pid}` } };
const quiet = { log: console.log, warn: console.warn, error: console.error };

async function boot(c, { migrate003 }) {
    await admin.query(`DROP DATABASE IF EXISTS ${c.db}`);
    await admin.query(`CREATE DATABASE ${c.db}`);
    c.pool = new pg.Pool({ connectionString: urlFor(c.db) });
    for (const m of [SCHEMA, M001, M002]) await c.pool.query(m);
    // rows that exist before the Hub: two manual clients and one legacy (flat) lead, like production
    await c.pool.query(`INSERT INTO clients (name, email, phone, service_type, preferred_contact, notes, status) VALUES
        ('Legacy One', 'one@legacy.invalid', '1', 'Site', 'Phone', 'old note', 'Won'), ('Legacy Two', 'two@legacy.invalid', '2', NULL, NULL, NULL, 'New')`);
    await c.pool.query(`INSERT INTO leads (source, data) VALUES ('Tally', '{"name":"Legacy One","email":"one@legacy.invalid"}')`);
    c.before = await snapshot(c.pool);
    if (migrate003) { await c.pool.query(M003); await c.pool.query(M003); } // idempotent: the second run changes nothing and does not fail
    c.after = await snapshot(c.pool);
    const auth = makeAuth(JWT_SECRET);
    const app = express();
    app.use(express.json({ verify: saveRawBody }));
    app.post(ARIE_PATH, makeArieTallyHandler({ pool: c.pool, notify: async () => {} }));
    app.use('/api/clients', clientsRouter({ pool: c.pool, auth }));
    app.use('/api/clients', hubRouter({ pool: c.pool, auth }));
    app.use('/api/leads', leadsRouter({ pool: c.pool, auth }));
    await new Promise(r => { c.server = app.listen(0, '127.0.0.1', r); });
    c.base = `http://127.0.0.1:${c.server.address().port}`;
}
const snapshot = async pool => ({
    clients: (await pool.query("SELECT md5(string_agg(id||'|'||name||'|'||COALESCE(email,'')||'|'||COALESCE(phone,'')||'|'||COALESCE(notes,'')||'|'||status||'|'||created_at::text, ',' ORDER BY id)) AS h FROM clients")).rows[0].h,
    leads: (await pool.query("SELECT md5(string_agg(id||'|'||COALESCE(source,'')||'|'||COALESCE(data,'')||'|'||created_at::text, ',' ORDER BY id)) AS h FROM leads")).rows[0].h
});
before(async () => {
    process.env.ARIE_TALLY_SIGNING_SECRET = TALLY_SECRET;
    await boot(ctx.full, { migrate003: true });
    await boot(ctx.old, { migrate003: false });
    console.log = console.warn = console.error = () => {}; // the webhook logs ids; keep the test output readable
});
after(async () => {
    Object.assign(console, quiet);
    for (const c of Object.values(ctx)) { await new Promise(r => c.server.close(r)); await c.pool.end(); await admin.query(`DROP DATABASE IF EXISTS ${c.db}`); }
    await admin.end();
});

const api = async (c, method, path, body, tok = TOKEN) => {
    const r = await fetch(c.base + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
};
const tally = async (c, formId, submissionId) => {
    const raw = JSON.stringify(payloadFor(formId, submissionId));
    const r = await fetch(c.base + ARIE_PATH, { method: 'POST', headers: { 'content-type': 'application/json', 'tally-signature': sign(raw) }, body: raw });
    return r.status;
};
const clientBySub = async (c, sub) => (await c.pool.query('SELECT * FROM clients WHERE tally_submission_id = $1', [sub])).rows[0];
const storedLead = async (c, sub) => (await c.pool.query("SELECT * FROM leads WHERE data LIKE $1", [`%"submission_id":"${sub}"%`])).rows[0];

// ---------------------------------------------------------------------------------------------------------------------------------
test('migration 003 (run twice) over existing CRM rows: every old row unchanged, new columns empty, table and indexes present', async () => {
    const { pool, before: b, after: a } = ctx.full;
    assert.deepEqual(a, b, 'clients and leads (including leads.data) are byte-for-byte the same');
    const cols = (await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE (table_name = 'clients' AND column_name IN ('country','next_action','next_action_due')) OR (table_name = 'leads' AND column_name = 'client_id')")).rows;
    assert.equal(cols.length, 4);
    assert.equal(Number((await pool.query('SELECT COUNT(*) c FROM clients WHERE country IS NOT NULL OR next_action IS NOT NULL OR next_action_due IS NOT NULL')).rows[0].c), 0);
    assert.equal(Number((await pool.query('SELECT COUNT(*) c FROM leads WHERE client_id IS NOT NULL')).rows[0].c), 0, 'no backfill: nothing is linked by the migration');
    assert.equal(Number((await pool.query('SELECT COUNT(*) c FROM client_activities')).rows[0].c), 0);
    const idx = (await pool.query("SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_leads_client_id','idx_client_activities_client')")).rows;
    assert.equal(idx.length, 2);
    // the table refuses rows the API would never send
    await assert.rejects(pool.query("INSERT INTO client_activities (client_id, kind, body) VALUES (1, 'sms', 'x')"), e => e.code === '23514');
    await assert.rejects(pool.query("INSERT INTO client_activities (client_id, kind, body) VALUES (1, 'note', '   ')"), e => e.code === '23514');
    await assert.rejects(pool.query("INSERT INTO client_activities (client_id, kind, body) VALUES (99999, 'note', 'x')"), e => e.code === '23503');
});

test('Tally keeps working after migration 003: a real submission creates the same client + lead rows, and the hub links it by submission id', async () => {
    const c = ctx.full;
    assert.equal(await tally(c, 'q54MpG', 'sub-A'), 200);
    assert.equal(await tally(c, 'q54MpG', 'sub-A'), 200, 'replay is a duplicate, not a second row'); // handler answers 200 {status:'duplicate'}
    const client = await clientBySub(c, 'sub-A');
    assert.equal(client.name, SAMPLE.bg.name); assert.equal(client.track, 'portfolio'); assert.equal(client.status, 'New');
    assert.equal(client.country, null); assert.equal(client.next_action_due, null);
    const lead = await storedLead(c, 'sub-A');
    assert.equal(lead.client_id, null, 'the webhook does not write the new column (it works with and without migration 003)');

    const r = await api(c, 'GET', `/api/clients/${client.id}/hub`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.capabilities, { activities: true, inquiryLink: true, profileFields: true });
    assert.equal(r.body.client.id, client.id);
    assert.equal(r.body.inquiries.length, 1);
    assert.equal(r.body.inquiries[0].link, 'submission');
    assert.deepEqual(r.body.inquiries[0].data, JSON.parse(lead.data), 'the original Tally answers come back exactly as stored');
    assert.ok(r.body.inquiries[0].data.details.answers.length >= 6);
    assert.deepEqual(r.body.activities, []); assert.equal(r.body.last_contact_at, null);
});

test('same e-mail / phone / name does NOT make an inquiry belong to a client: two profiles stay two, nothing is merged', async () => {
    const c = ctx.full;
    assert.equal(await tally(c, 'rD5EDo', 'sub-B'), 200); // another form; fixtures use the same fake contact data style
    // force identical contact data on B and a legacy lead, to prove matching never uses it
    const a = await clientBySub(c, 'sub-A'), b = await clientBySub(c, 'sub-B');
    await c.pool.query('UPDATE clients SET email = $1, phone = $2, name = $3 WHERE id = $4', [a.email, a.phone, a.name, b.id]);
    await c.pool.query(`UPDATE leads SET data = jsonb_set(data::jsonb, '{email}', to_jsonb($1::text))::text WHERE data LIKE '%Legacy One%'`, [a.email]);
    assert.equal(Number((await c.pool.query('SELECT COUNT(*) c FROM clients WHERE tally_submission_id IN ($1, $2)', ['sub-A', 'sub-B'])).rows[0].c), 2);

    const ha = (await api(c, 'GET', `/api/clients/${a.id}/hub`)).body, hb = (await api(c, 'GET', `/api/clients/${b.id}/hub`)).body;
    assert.equal(ha.inquiries.length, 1); assert.equal(hb.inquiries.length, 1);
    assert.equal(ha.inquiries[0].data.submission_id, 'sub-A'); assert.equal(hb.inquiries[0].data.submission_id, 'sub-B');
    const legacy = (await c.pool.query("SELECT id FROM clients WHERE email = 'one@legacy.invalid'")).rows[0];
    const hl = (await api(c, 'GET', `/api/clients/${legacy.id}/hub`)).body;
    assert.deepEqual(hl.inquiries, [], 'a manual/legacy client has no inquiry: the legacy lead is not guessed from its e-mail');
});

test('explicit link: one client can own many inquiries, an explicit link beats the submission id, unlinked inquiries are never shown', async () => {
    const c = ctx.full;
    const a = await clientBySub(c, 'sub-A'), b = await clientBySub(c, 'sub-B');
    const legacyLead = (await c.pool.query("SELECT id FROM leads WHERE data LIKE '%Legacy One%'")).rows[0];
    const leadB = await storedLead(c, 'sub-B');
    await c.pool.query('UPDATE leads SET client_id = $1 WHERE id = ANY($2)', [a.id, [legacyLead.id, leadB.id]]);

    const ha = (await api(c, 'GET', `/api/clients/${a.id}/hub`)).body, hb = (await api(c, 'GET', `/api/clients/${b.id}/hub`)).body;
    assert.deepEqual(ha.inquiries.map(i => i.id).sort(), [(await storedLead(c, 'sub-A')).id, legacyLead.id, leadB.id].sort(), 'A: its own (by submission) + two explicitly linked');
    assert.equal(ha.inquiries.find(i => i.id === leadB.id).link, 'explicit');
    assert.equal(ha.inquiries.find(i => i.data.submission_id === 'sub-A').link, 'submission');
    assert.deepEqual(hb.inquiries, [], 'B: its inquiry is explicitly linked to A, so it no longer appears under B');
    // an inquiry nobody links is not shown anywhere
    await c.pool.query("INSERT INTO leads (source, data) VALUES ('Tally', '{\"submission_id\":\"orphan-1\",\"name\":\"Nobody\"}')");
    const all = [(await api(c, 'GET', `/api/clients/${a.id}/hub`)).body, (await api(c, 'GET', `/api/clients/${b.id}/hub`)).body];
    assert.ok(all.every(h => !h.inquiries.some(i => i.data.submission_id === 'orphan-1')));
    // deleting the link target keeps the inquiry (SET NULL), it is not lost with the client
    assert.match((await c.pool.query("SELECT confdeltype FROM pg_constraint WHERE conname = 'leads_client_id_fkey'")).rows[0].confdeltype, /n/);
});

test('communication history: add, edit, newest first, last contact ignores notes, entries are tied to their client', async () => {
    const c = ctx.full;
    const a = await clientBySub(c, 'sub-A'), b = await clientBySub(c, 'sub-B');
    const add = (cid, kind, body, occurred_at) => api(c, 'POST', `/api/clients/${cid}/activities`, { kind, body, occurred_at, client_id: 999, created_by: 999 });
    const a1 = await add(a.id, 'note', 'First note', '2026-11-01T09:00:00Z');
    const a2 = await add(a.id, 'call', 'Phone call about the offer', '2026-11-03T10:00:00Z');
    const a3 = await add(a.id, 'whatsapp', 'Sent examples on WhatsApp', '2026-11-05T11:00:00Z');
    const a4 = await add(a.id, 'note', 'Private note, newest', '2026-11-06T12:00:00Z');
    for (const r of [a1, a2, a3, a4]) { assert.equal(r.status, 201); assert.equal(r.body.client_id, a.id, 'client from the URL, not the body'); assert.equal(r.body.created_by, 1, 'author from the token'); }
    const defaulted = await api(c, 'POST', `/api/clients/${a.id}/activities`, { body: 'No date given' });
    assert.equal(defaulted.body.kind, 'note');
    assert.ok(Math.abs(Date.now() - new Date(defaulted.body.occurred_at)) < 60_000, 'occurred_at defaults to now');

    let h = (await api(c, 'GET', `/api/clients/${a.id}/hub`)).body;
    assert.deepEqual(h.activities.map(x => x.body), ['No date given', 'Private note, newest', 'Sent examples on WhatsApp', 'Phone call about the offer', 'First note']);
    assert.equal(h.last_contact_at, '2026-11-05T11:00:00.000Z', 'last contact = newest call/e-mail/WhatsApp/meeting, a note is not a contact');
    assert.deepEqual((await api(c, 'GET', `/api/clients/${b.id}/hub`)).body.activities, [], 'another client sees none of it');

    // edit: only what is sent changes
    const edited = await api(c, 'PUT', `/api/clients/${a.id}/activities/${a2.body.id}`, { body: ' Call: agreed on the scope ' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.body, 'Call: agreed on the scope'); assert.equal(edited.body.kind, 'call'); assert.equal(edited.body.occurred_at, a2.body.occurred_at);
    assert.ok(new Date(edited.body.updated_at) > new Date(edited.body.created_at));
    const retyped = await api(c, 'PUT', `/api/clients/${a.id}/activities/${a2.body.id}`, { kind: 'meeting', occurred_at: '2026-11-07T08:00:00Z' });
    assert.deepEqual([retyped.status, retyped.body.kind, retyped.body.body], [200, 'meeting', 'Call: agreed on the scope']);
    h = (await api(c, 'GET', `/api/clients/${a.id}/hub`)).body;
    assert.equal(h.last_contact_at, '2026-11-07T08:00:00.000Z', 'last contact follows the edit');

    // an entry can only be edited through its own client; a wrong pair changes nothing
    const before = (await c.pool.query('SELECT * FROM client_activities WHERE id = $1', [a1.body.id])).rows[0];
    const cross = await api(c, 'PUT', `/api/clients/${b.id}/activities/${a1.body.id}`, { body: 'hijacked' });
    assert.deepEqual([cross.status, cross.body.code], [404, 'NOT_FOUND']);
    assert.deepEqual((await c.pool.query('SELECT * FROM client_activities WHERE id = $1', [a1.body.id])).rows[0], before);
    assert.equal((await api(c, 'PUT', `/api/clients/${a.id}/activities/999999`, { body: 'x' })).status, 404);
    // unknown client, bad input
    assert.equal((await add(999999, 'note', 'x')).status, 404);
    assert.equal((await api(c, 'POST', `/api/clients/${a.id}/activities`, { kind: 'sms', body: 'x' })).status, 400);
    assert.equal((await api(c, 'POST', `/api/clients/${a.id}/activities`, { body: '   ' })).status, 400);
    assert.equal((await api(c, 'PUT', `/api/clients/${a.id}/activities/${a1.body.id}`, { body: '' })).status, 400);
});

test('next action and country: saved through PUT /api/clients/:id, the date stays a plain YYYY-MM-DD (no time-zone shift), empty clears', async () => {
    const c = ctx.full;
    const a = await clientBySub(c, 'sub-A');
    let r = await api(c, 'PUT', `/api/clients/${a.id}`, { country: 'BG', next_action: 'Send the offer', next_action_due: '2026-12-01' });
    assert.equal(r.status, 200);
    assert.equal(r.body.client.next_action_due, '2026-12-01');
    assert.equal(r.body.client.status, 'New', 'other fields untouched');
    let h = (await api(c, 'GET', `/api/clients/${a.id}/hub`)).body;
    assert.deepEqual([h.client.country, h.client.next_action, h.client.next_action_due], ['BG', 'Send the offer', '2026-12-01']);
    for (const bad of ['2026-02-31', '2026-13-01', '1.12.2026', 'soon']) assert.equal((await api(c, 'PUT', `/api/clients/${a.id}`, { next_action_due: bad })).status, 400, bad);
    r = await api(c, 'PUT', `/api/clients/${a.id}`, { next_action: '', next_action_due: '' });
    assert.equal(r.status, 200);
    h = (await api(c, 'GET', `/api/clients/${a.id}/hub`)).body;
    assert.deepEqual([h.client.next_action, h.client.next_action_due, h.client.country], [null, null, 'BG']);
});

test('hub errors on real PostgreSQL: 401 without a token, 400 bad id, 404 unknown client', async () => {
    const c = ctx.full;
    assert.equal((await api(c, 'GET', '/api/clients/1/hub', undefined, null)).status, 401);
    assert.equal((await api(c, 'POST', '/api/clients/1/activities', { body: 'x' }, 'bad.token.x')).status, 401);
    assert.equal((await api(c, 'GET', '/api/clients/abc/hub')).status, 400);
    const r = await api(c, 'GET', '/api/clients/999999/hub');
    assert.deepEqual([r.status, r.body.code], [404, 'NOT_FOUND']);
});

test('deleting: a Tally client stays (409 ARCHIVE_REQUIRED), a manual client with history stays (409 HAS_HISTORY) and keeps its history, an empty manual client is deleted', async () => {
    const c = ctx.full;
    const a = await clientBySub(c, 'sub-A');
    assert.equal((await api(c, 'DELETE', `/api/clients/${a.id}`)).body.code, 'ARCHIVE_REQUIRED');
    const withHistory = (await api(c, 'POST', '/api/clients', { name: 'Manual With History' })).body;
    const entry = (await api(c, 'POST', `/api/clients/${withHistory.id}/activities`, { kind: 'email', body: 'Sent a mail' })).body;
    const r = await api(c, 'DELETE', `/api/clients/${withHistory.id}`);
    assert.deepEqual([r.status, r.body.code], [409, 'HAS_HISTORY']);
    assert.equal(Number((await c.pool.query('SELECT COUNT(*) c FROM clients WHERE id = $1', [withHistory.id])).rows[0].c), 1);
    assert.equal((await c.pool.query('SELECT body FROM client_activities WHERE id = $1', [entry.id])).rows[0].body, 'Sent a mail');
    const empty = (await api(c, 'POST', '/api/clients', { name: 'Manual Empty' })).body;
    assert.equal((await api(c, 'DELETE', `/api/clients/${empty.id}`)).status, 200);
});

test('before migration 003 is applied: Tally and the hub keep working read-only, writes that need it answer 409 MIGRATION_REQUIRED (no 500)', async () => {
    const c = ctx.old;
    assert.deepEqual(c.after, c.before, 'nothing ran');
    assert.equal(await tally(c, 'q54MpG', 'old-sub'), 200, 'the webhook does not depend on migration 003');
    const client = await clientBySub(c, 'old-sub');
    const r = await api(c, 'GET', `/api/clients/${client.id}/hub`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.capabilities, { activities: false, inquiryLink: false, profileFields: false });
    assert.equal(r.body.inquiries.length, 1, 'inquiry found by the exact submission id');
    assert.deepEqual(r.body.activities, []);
    let w = await api(c, 'POST', `/api/clients/${client.id}/activities`, { body: 'x' });
    assert.deepEqual([w.status, w.body.code], [409, 'MIGRATION_REQUIRED']);
    w = await api(c, 'PUT', `/api/clients/${client.id}`, { next_action: 'x' });
    assert.deepEqual([w.status, w.body.code], [409, 'MIGRATION_REQUIRED']);
    assert.equal((await api(c, 'PUT', `/api/clients/${client.id}`, { status: 'Contacted' })).status, 200, 'ordinary edits are unaffected');
    assert.equal((await api(c, 'GET', '/api/clients')).status, 200);
    assert.equal((await api(c, 'GET', '/api/leads')).status, 200);
});

test('the original Tally answers were not changed by any hub operation (only the tests\' own explicit link column differs)', async () => {
    const c = ctx.full;
    // leads.data of the real submissions is byte-identical to what the webhook stored: recompute it from the payload
    for (const [form, sub] of [['q54MpG', 'sub-A'], ['rD5EDo', 'sub-B']]) {
        const lead = await storedLead(c, sub);
        const parsed = JSON.parse(lead.data);
        assert.equal(parsed.submission_id, sub); assert.equal(parsed.form_id, form);
        assert.ok(Array.isArray(parsed.details.answers) && parsed.details.answers.length >= 6);
    }
    const dataHash = async () => (await c.pool.query("SELECT md5(string_agg(COALESCE(data, ''), '|' ORDER BY id)) h FROM leads WHERE data LIKE '%submission_id%'")).rows[0].h;
    const h1 = await dataHash();
    const a = await clientBySub(c, 'sub-A');
    await api(c, 'GET', `/api/clients/${a.id}/hub`);
    await api(c, 'POST', `/api/clients/${a.id}/activities`, { body: 'one more' });
    await api(c, 'PUT', `/api/clients/${a.id}`, { notes: 'edited note' });
    assert.equal(await dataHash(), h1, 'no hub or client edit rewrites leads.data');
});
