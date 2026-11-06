// Stage 1 contract of the clients/leads API: no success without a confirmed row, clear 400/401/404/409/500, no leaked DB errors.
// Runs without a database: a recording fake pool returns whatever the test configures.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { makeAuth, clientsRouter, leadsRouter, parseClient, parseLeadData } from '../crm.js';

const SECRET = 'unit-test-secret-unit-test-secret';
const token = (opts = {}, secret = SECRET) => jwt.sign({ userId: 1, email: 'o@example.invalid' }, secret, { expiresIn: '1h', ...opts });

let calls = [], respond = () => ({ rows: [], rowCount: 0 }), created = [], server, base;
const pool = { query: async (sql, params) => { calls.push({ sql, params }); const r = respond(sql, params); if (r instanceof Error) throw r; return r; } };

before(async () => {
    const auth = makeAuth(SECRET);
    const app = express();
    app.use(express.json());
    app.use('/api/clients', clientsRouter({ pool, auth, onCreated: c => created.push(c) }));
    app.use('/api/leads', leadsRouter({ pool, auth }));
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = async (method, path, body, tok = token()) => {
    calls = []; created = [];
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
};

// ---- authentication: 401 for everything that is not a valid token (never 403, never a pass-through) -----------------------
test('every client/lead route answers 401 without a valid token', async () => {
    const routes = [['GET', '/api/clients'], ['POST', '/api/clients'], ['PUT', '/api/clients/1'], ['DELETE', '/api/clients/1'], ['GET', '/api/leads']];
    const bad = [null, 'abc.def.ghi', token({}, 'another-secret-another-secret-123456'), token({ expiresIn: -10 })];
    for (const [m, p] of routes) for (const t of bad) {
        const r = await call(m, p, m === 'GET' ? undefined : {}, t);
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.ok(r.body.code, `${m} ${p} has an error code`);
    }
    assert.equal(calls.length, 0, 'the database is never reached without a token');
    assert.equal((await call('GET', '/api/clients', undefined, token({ expiresIn: -10 }))).body.error, 'Session expired');
});

// ---- 400: input is checked before any SQL -------------------------------------------------------------------------------
test('parseClient: create needs a name, update only returns what was sent, empty string clears', () => {
    assert.ok(parseClient({}, { create: true }).error);
    assert.ok(parseClient({ name: '   ' }, { create: true }).error);
    assert.deepEqual(parseClient({ name: ' Ann ' }, { create: true }).values, { name: 'Ann', status: 'New' });
    assert.deepEqual(parseClient({ status: 'Won' }).values, { status: 'Won' });
    assert.deepEqual(parseClient({ deal_value: '', meeting_date: '', phone: '' }).values, { deal_value: null, meeting_date: null, phone: null });
    assert.equal(parseClient({ deal_value: '1 200,50' }).error, 'deal_value must be a number');
    assert.deepEqual(parseClient({ deal_value: '1200,5' }).values, { deal_value: 1200.5 });
    assert.ok(parseClient({ status: 'Bogus' }).error);
    assert.ok(parseClient({ meeting_date: 'not a date' }).error);
    assert.ok(parseClient({ email: 5 }).error);
    assert.deepEqual(parseClient({ id: 9, created_at: 'x', tally_submission_id: 'x', source: 'x' }).values, {}, 'columns outside the whitelist are ignored');
});

test('POST /api/clients: 400 on invalid input (no SQL), 201 with the saved row otherwise', async () => {
    let r = await call('POST', '/api/clients', { email: 'a@example.invalid' });
    assert.equal(r.status, 400); assert.equal(r.body.code, 'VALIDATION'); assert.equal(calls.length, 0);
    r = await call('POST', '/api/clients', { name: 'Ann', deal_value: 'lots' });
    assert.equal(r.status, 400); assert.equal(calls.length, 0);

    respond = () => ({ rows: [{ id: 7, name: 'Ann', status: 'New' }], rowCount: 1 });
    r = await call('POST', '/api/clients', { name: 'Ann', phone: '', status: 'Meeting', meeting_date: '2026-11-20T10:00' });
    assert.equal(r.status, 201); assert.equal(r.body.id, 7);
    assert.match(calls[0].sql, /^INSERT INTO clients \(name, phone, status, meeting_date\)/);
    assert.deepEqual(calls[0].params, ['Ann', null, 'Meeting', '2026-11-20T10:00']);
    assert.deepEqual(created.map(c => c.id), [7], 'the Make.com hook receives the stored row');
});

// ---- 404: no row changed = no success -----------------------------------------------------------------------------------
test('PUT /api/clients/:id: 400 bad id / empty update, 404 when no row matched, 200 only with the updated row', async () => {
    assert.equal((await call('PUT', '/api/clients/abc', { name: 'x' })).status, 400);
    assert.equal((await call('PUT', '/api/clients/1', {})).status, 400);
    assert.equal((await call('PUT', '/api/clients/1', { status: 'Nope' })).status, 400);
    assert.equal(calls.length, 0);

    respond = () => ({ rows: [], rowCount: 0 });
    let r = await call('PUT', '/api/clients/999', { status: 'Won' });
    assert.equal(r.status, 404); assert.equal(r.body.code, 'NOT_FOUND');

    respond = () => ({ rows: [{ id: 5, status: 'Won', deal_value: null }], rowCount: 1 });
    r = await call('PUT', '/api/clients/5', { status: 'Won', deal_value: '', name: 'Ann' });
    assert.equal(r.status, 200); assert.equal(r.body.id, 5); assert.equal(r.body.client.status, 'Won');
    assert.match(calls[0].sql, /SET name = \$1, status = \$2, deal_value = \$3, updated_at = NOW\(\) WHERE id = \$4 RETURNING \*/);
    assert.deepEqual(calls[0].params, ['Ann', 'Won', null, '5']);
});

test('PUT leaves untouched what the body does not mention (preferred_contact stays when the edit form did not change it)', async () => {
    respond = () => ({ rows: [{ id: 5 }], rowCount: 1 });
    await call('PUT', '/api/clients/5', { name: 'Ann', email: 'a@example.invalid' });
    assert.ok(!/preferred_contact/.test(calls[0].sql));
});

test('DELETE /api/clients/:id: 404 unknown, 409 for a Tally client (dedupe key must stay), 200 only when a row was deleted', async () => {
    assert.equal((await call('DELETE', '/api/clients/x')).status, 400);
    // unknown id: the guarded delete and the existence check both find nothing
    respond = () => ({ rows: [], rowCount: 0 });
    assert.equal((await call('DELETE', '/api/clients/42')).status, 404);
    // exists but is a Tally client: the guarded delete matched nothing, the existence check found the row
    respond = sql => /^DELETE/.test(sql) ? { rows: [], rowCount: 0 } : { rows: [{}], rowCount: 1 };
    let r = await call('DELETE', '/api/clients/42');
    assert.equal(r.status, 409); assert.equal(r.body.code, 'ARCHIVE_REQUIRED');
    assert.match(calls[0].sql, /DELETE FROM clients WHERE id = \$1 AND tally_submission_id IS NULL/);
    // manual client
    respond = () => ({ rows: [{ id: 42 }], rowCount: 1 });
    r = await call('DELETE', '/api/clients/42');
    assert.equal(r.status, 200); assert.equal(r.body.id, 42);
});

// ---- 500: generic body, no database internals ---------------------------------------------------------------------------
test('database errors give a generic 500 without the driver message', async () => {
    const secret = 'relation "clients" does not exist: password authentication failed for user "x"';
    respond = () => Object.assign(new Error(secret), { code: '28P01' });
    const quiet = console.error; console.error = () => {};
    try {
        for (const [m, p, b] of [['GET', '/api/clients'], ['POST', '/api/clients', { name: 'A' }], ['PUT', '/api/clients/1', { name: 'A' }], ['DELETE', '/api/clients/1'], ['GET', '/api/leads']]) {
            const r = await call(m, p, b);
            assert.equal(r.status, 500, `${m} ${p}`);
            assert.deepEqual(r.body, { error: 'Internal server error', code: 'SERVER_ERROR' });
        }
    } finally { console.error = quiet; }
});

// ---- reads --------------------------------------------------------------------------------------------------------------
test('GET /api/clients returns the rows with total, page and limit', async () => {
    respond = sql => /COUNT/.test(sql) ? { rows: [{ count: '120' }] } : { rows: [{ id: 1 }, { id: 2 }] };
    const r = await call('GET', '/api/clients?limit=200&page=2');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.data.length, r.body.total, r.body.page, r.body.limit], [2, 120, 2, 200]);
    assert.deepEqual(calls[0].params, [200, 200]);
});

test('GET /api/leads: one unreadable row does not break the list and the original data is returned unchanged', async () => {
    assert.equal(parseLeadData('{broken'), null);
    const original = JSON.stringify({ submission_id: 's1', details: { answers: [{ label: 'Q', value: 'A' }] } });
    respond = () => ({ rows: [{ id: 1, source: 'Tally', data: original }, { id: 2, source: 'Tally', data: '{broken' }] });
    const r = await call('GET', '/api/leads');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body[0].data, JSON.parse(original));
    assert.deepEqual(r.body[1].data, {});
});
