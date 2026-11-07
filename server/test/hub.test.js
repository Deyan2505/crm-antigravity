// Client Hub 360 API contract (Stage 2A). Runs without a database: a recording fake pool returns whatever the test configures.
// The same behaviour is repeated against real PostgreSQL in hub.integration.test.js.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { makeAuth, clientsRouter, parseClient } from '../crm.js';
import { hubRouter, parseActivity, capabilitiesOf, KINDS, MAX_BODY } from '../hub.js';

const SECRET = 'unit-test-secret-unit-test-secret';
const token = (opts = {}, secret = SECRET, payload = { userId: 7, email: 'o@example.invalid' }) => jwt.sign(payload, secret, { expiresIn: '1h', ...opts });

let calls = [], respond = () => ({ rows: [], rowCount: 0 }), server, base;
const pool = { query: async (sql, params) => { calls.push({ sql, params }); const r = respond(sql, params); if (r instanceof Error) throw r; return r; } };

before(async () => {
    const auth = makeAuth(SECRET);
    const app = express();
    app.use(express.json());
    app.use('/api/clients', clientsRouter({ pool, auth }));   // same order as server/index.js
    app.use('/api/clients', hubRouter({ pool, auth }));
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = async (method, path, body, tok = token()) => {
    calls = [];
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
};

const ALL_COLUMNS = [{ table_name: 'client_activities', column_name: 'id' }, { table_name: 'leads', column_name: 'client_id' },
    ...['country', 'next_action', 'next_action_due'].map(c => ({ table_name: 'clients', column_name: c }))];
// a database that answers the hub's queries; `schema` = rows of information_schema.columns
const hubDb = ({ client = { id: 5, name: 'Ann', tally_submission_id: 'sub-1' }, schema = ALL_COLUMNS, leads = [], activities = [], lastContact = null } = {}) => sql => {
    if (/FROM clients WHERE id/.test(sql)) return client ? { rows: [client], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (/information_schema/.test(sql)) return { rows: schema };
    if (/FROM leads l/.test(sql)) return { rows: leads };
    if (/MAX\(occurred_at\)/.test(sql)) return { rows: [{ at: lastContact }] };
    if (/FROM client_activities/.test(sql)) return { rows: activities };
    return { rows: [], rowCount: 0 };
};

// ---- access --------------------------------------------------------------------------------------------------------------------------
test('every hub route answers 401 without a valid token and never reaches the database', async () => {
    const routes = [['GET', '/api/clients/5/hub'], ['POST', '/api/clients/5/activities'], ['PUT', '/api/clients/5/activities/1']];
    const bad = [null, 'abc.def.ghi', token({}, 'another-secret-another-secret-123456'), token({ expiresIn: -10 })];
    for (const [m, p] of routes) for (const t of bad) {
        const r = await call(m, p, m === 'GET' ? undefined : { body: 'x' }, t);
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.ok(r.body.code, 'has an error code');
    }
    assert.equal(calls.length, 0);
});

// ---- input ---------------------------------------------------------------------------------------------------------------------------
test('parseActivity: create needs text, kind defaults to note, edit returns only what was sent', () => {
    assert.deepEqual(parseActivity({ body: ' Called back ' }, { create: true }).values, { kind: 'note', body: 'Called back' });
    assert.deepEqual(parseActivity({ kind: 'whatsapp', body: 'x', occurred_at: '2026-11-07T10:30' }, { create: true }).values, { kind: 'whatsapp', body: 'x', occurred_at: '2026-11-07T10:30' });
    assert.deepEqual(parseActivity({ kind: 'call' }).values, { kind: 'call' });
    assert.deepEqual(parseActivity({}).values, {});
    for (const k of KINDS) assert.ok(parseActivity({ kind: k, body: 'x' }, { create: true }).values);
    assert.ok(parseActivity({}, { create: true }).error, 'text required');
    assert.ok(parseActivity({ body: '   ' }, { create: true }).error);
    assert.ok(parseActivity({ body: 5 }, { create: true }).error);
    assert.ok(parseActivity({ body: 'x'.repeat(MAX_BODY + 1) }, { create: true }).error);
    assert.ok(!parseActivity({ body: 'x'.repeat(MAX_BODY) }, { create: true }).error);
    assert.ok(parseActivity({ kind: 'sms', body: 'x' }, { create: true }).error);
    assert.ok(parseActivity({ body: '' }).error, 'an edit may not blank the text');
    for (const bad of ['yesterday', '2026-02-31', '2026-13-01T10:00', '', null, 20261107, '2026-11-07T25:00']) assert.ok(parseActivity({ occurred_at: bad }).error, `occurred_at ${bad}`);
    for (const ok of ['2026-11-07', '2026-11-07T10:30', '2026-11-07T10:30:15.123Z', '2026-11-07 10:30', '2026-11-07T10:30:00+02:00']) assert.ok(!parseActivity({ occurred_at: ok }).error, `occurred_at ${ok}`);
    assert.deepEqual(parseActivity({ client_id: 9, created_by: 9, id: 3, body: 'x' }, { create: true }).values, { kind: 'note', body: 'x' }, 'owner/ids can not be set from the body');
});

test('parseClient: country and next_action are text, next_action_due is a real calendar day or empty', () => {
    assert.deepEqual(parseClient({ country: 'BG', next_action: 'Send offer', next_action_due: '2026-12-01' }).values, { country: 'BG', next_action: 'Send offer', next_action_due: '2026-12-01' });
    assert.deepEqual(parseClient({ country: '', next_action: '  ', next_action_due: '' }).values, { country: null, next_action: null, next_action_due: null });
    assert.deepEqual(parseClient({ next_action_due: null }).values, { next_action_due: null });
    for (const bad of ['2026-02-31', '01/12/2026', 'soon', 20261201, '2026-12-01T10:00']) assert.ok(parseClient({ next_action_due: bad }).error, String(bad));
    assert.ok(parseClient({ country: 5 }).error);
});

// ---- GET /:id/hub --------------------------------------------------------------------------------------------------------------------
test('GET hub: 400 for a bad id (no SQL), 404 for an unknown client', async () => {
    for (const id of ['abc', '0', '-1', '1.5', '99999999999']) { const r = await call('GET', `/api/clients/${id}/hub`); assert.equal(r.status, 400, id); assert.equal(r.body.code, 'VALIDATION'); }
    assert.equal(calls.length, 0);
    respond = hubDb({ client: null });
    const r = await call('GET', '/api/clients/999/hub');
    assert.equal(r.status, 404); assert.equal(r.body.code, 'NOT_FOUND');
    assert.equal(calls.length, 1, 'stops after the client lookup');
});

test('GET hub: returns client, linked inquiries with the original data unchanged, history and capabilities', async () => {
    const original = JSON.stringify({ submission_id: 'sub-1', form_id: 'q54MpG', track: 'portfolio', details: { answers: [{ label: 'Какъв проект?', value: 'Сайт' }] } });
    const when = new Date('2026-11-07T10:00:00Z');
    respond = hubDb({
        leads: [{ id: 11, source: 'Tally', data: original, created_at: '2026-11-01T08:00:00.000Z', link: 'submission' }, { id: 12, source: 'Tally', data: '{broken', created_at: '2026-11-02T08:00:00.000Z', link: 'explicit' }],
        activities: [{ id: 3, client_id: 5, kind: 'call', body: 'Talked', occurred_at: when }],
        lastContact: when
    });
    const r = await call('GET', '/api/clients/5/hub');
    assert.equal(r.status, 200);
    assert.equal(r.body.client.id, 5);
    assert.deepEqual(r.body.capabilities, { activities: true, inquiryLink: true, profileFields: true });
    assert.deepEqual(r.body.inquiries[0].data, JSON.parse(original), 'original Tally answers come back exactly as stored');
    assert.equal(r.body.inquiries[0].link, 'submission');
    assert.deepEqual(r.body.inquiries[1].data, {}, 'an unreadable row is still listed, with empty data');
    assert.equal(r.body.inquiries[1].link, 'explicit');
    assert.equal(r.body.activities.length, 1);
    assert.equal(r.body.last_contact_at, when.toISOString());
});

test('GET hub: inquiries are looked up by explicit client_id OR the exact submission id only (never e-mail, phone or name)', async () => {
    respond = hubDb({ client: { id: 5, name: 'Ann', email: 'ann@example.invalid', phone: '+359 1', tally_submission_id: 'sub-1' } });
    await call('GET', '/api/clients/5/hub');
    const q = calls.find(c => /FROM leads l/.test(c.sql));
    assert.match(q.sql, /l\.client_id = \$1 OR \(l\.client_id IS NULL AND substring\(l\.data from '"submission_id":"\(\[\^"\]\+\)"'\) = \$2\)/);
    assert.deepEqual(q.params, [5, 'sub-1']);
    assert.ok(!/email|phone|name/i.test(q.sql), 'no fuzzy matching');
});

test('GET hub before migration 003: still works read-only, by submission id, with capabilities false and no history queries', async () => {
    respond = hubDb({ schema: [], leads: [{ id: 11, source: 'Tally', data: '{"submission_id":"sub-1"}', created_at: 'x', link: 'submission' }] });
    const r = await call('GET', '/api/clients/5/hub');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.capabilities, { activities: false, inquiryLink: false, profileFields: false });
    assert.deepEqual(r.body.activities, []); assert.equal(r.body.last_contact_at, null);
    assert.equal(r.body.inquiries.length, 1);
    assert.ok(!calls.some(c => /client_activities/.test(c.sql) && !/information_schema/.test(c.sql)), 'client_activities is not queried');
    const q = calls.find(c => /FROM leads l/.test(c.sql));
    assert.ok(!/client_id/.test(q.sql), 'leads.client_id is not referenced');
    assert.deepEqual(q.params, ['sub-1']);
});

test('GET hub: a client without a Tally submission id gets no inquiries by submission (null parameter, not a guess)', async () => {
    respond = hubDb({ client: { id: 8, name: 'Manual', tally_submission_id: null } });
    await call('GET', '/api/clients/8/hub');
    assert.deepEqual(calls.find(c => /FROM leads l/.test(c.sql)).params, [8, null]);
});

test('capabilitiesOf needs all three client columns for profileFields', () => {
    assert.deepEqual(capabilitiesOf([]), { activities: false, inquiryLink: false, profileFields: false });
    assert.equal(capabilitiesOf(ALL_COLUMNS.filter(r => r.column_name !== 'next_action_due')).profileFields, false);
    assert.equal(capabilitiesOf(ALL_COLUMNS).profileFields, true);
});

// ---- POST activity -------------------------------------------------------------------------------------------------------------------
test('POST activity: 400 on invalid input (no SQL); 201 with the saved row, created_by from the token, client from the path', async () => {
    for (const body of [{}, { body: '  ' }, { kind: 'sms', body: 'x' }, { body: 'x', occurred_at: 'tomorrow' }]) assert.equal((await call('POST', '/api/clients/5/activities', body)).status, 400);
    assert.equal((await call('POST', '/api/clients/abc/activities', { body: 'x' })).status, 400);
    assert.equal(calls.length, 0);

    respond = () => ({ rows: [{ id: 9, client_id: 5, kind: 'email', body: 'Sent the offer' }], rowCount: 1 });
    const r = await call('POST', '/api/clients/5/activities', { kind: 'email', body: ' Sent the offer ', occurred_at: '2026-11-07T09:00', client_id: 99, created_by: 99 });
    assert.equal(r.status, 201); assert.equal(r.body.id, 9);
    assert.match(calls[0].sql, /^INSERT INTO client_activities \(kind, body, occurred_at, client_id, created_by\) VALUES \(\$1, \$2, \$3, \$4, \$5\) RETURNING \*/);
    assert.deepEqual(calls[0].params, ['email', 'Sent the offer', '2026-11-07T09:00', '5', 7], 'client_id from the URL, created_by from the JWT, never from the body');
});

test('POST activity: 404 when the client does not exist (FK), 409 MIGRATION_REQUIRED without migration 003, generic 500 otherwise', async () => {
    respond = () => Object.assign(new Error('insert or update violates foreign key constraint "client_activities_client_id_fkey"'), { code: '23503' });
    let r = await call('POST', '/api/clients/999/activities', { body: 'x' });
    assert.equal(r.status, 404); assert.equal(r.body.code, 'NOT_FOUND');

    respond = () => Object.assign(new Error('relation "client_activities" does not exist'), { code: '42P01' });
    r = await call('POST', '/api/clients/5/activities', { body: 'x' });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'MIGRATION_REQUIRED');
    assert.ok(!/client_activities/.test(JSON.stringify(r.body)), 'no table names leak');

    respond = () => Object.assign(new Error('password authentication failed for user "x"'), { code: '28P01' });
    const quiet = console.error; console.error = () => {};
    try { r = await call('POST', '/api/clients/5/activities', { body: 'x' }); } finally { console.error = quiet; }
    assert.deepEqual([r.status, r.body], [500, { error: 'Internal server error', code: 'SERVER_ERROR' }]);
});

// ---- PUT activity --------------------------------------------------------------------------------------------------------------------
test('PUT activity: 400 bad ids / empty edit, 404 when the entry is not this client\'s, 200 only with the updated row', async () => {
    assert.equal((await call('PUT', '/api/clients/5/activities/x', { body: 'a' })).status, 400);
    assert.equal((await call('PUT', '/api/clients/x/activities/1', { body: 'a' })).status, 400);
    assert.equal((await call('PUT', '/api/clients/5/activities/1', {})).status, 400);
    assert.equal((await call('PUT', '/api/clients/5/activities/1', { body: '' })).status, 400);
    assert.equal(calls.length, 0);

    respond = () => ({ rows: [], rowCount: 0 });
    let r = await call('PUT', '/api/clients/5/activities/1', { body: 'edited' });
    assert.equal(r.status, 404); assert.equal(r.body.code, 'NOT_FOUND');

    respond = () => ({ rows: [{ id: 1, client_id: 5, kind: 'call', body: 'edited' }], rowCount: 1 });
    r = await call('PUT', '/api/clients/5/activities/1', { kind: 'call', body: ' edited ', client_id: 99 });
    assert.equal(r.status, 200); assert.equal(r.body.body, 'edited');
    assert.match(calls[0].sql, /SET kind = \$1, body = \$2, updated_at = NOW\(\) WHERE id = \$3 AND client_id = \$4 RETURNING \*/);
    assert.deepEqual(calls[0].params, ['call', 'edited', '1', '5'], 'the entry is matched together with the client from the URL');
});

// ---- DELETE client with history ------------------------------------------------------------------------------------------------------
test('DELETE client that has entered history: 409 HAS_HISTORY instead of a 500 (the foreign key blocks it)', async () => {
    respond = sql => /^DELETE/.test(sql) ? Object.assign(new Error('update or delete violates foreign key constraint'), { code: '23503' }) : { rows: [], rowCount: 0 };
    const r = await call('DELETE', '/api/clients/5');
    assert.equal(r.status, 409); assert.equal(r.body.code, 'HAS_HISTORY');
});

// ---- Stage 1 behaviour is unchanged --------------------------------------------------------------------------------------------------
test('Stage 1 PUT /api/clients/:id still returns the updated row and still ignores columns outside the whitelist', async () => {
    respond = () => ({ rows: [{ id: 5, next_action: 'Call', next_action_due: '2026-12-01' }], rowCount: 1 });
    const r = await call('PUT', '/api/clients/5', { next_action: 'Call', next_action_due: '2026-12-01', tally_submission_id: 'hack', source: 'x' });
    assert.equal(r.status, 200); assert.equal(r.body.client.next_action_due, '2026-12-01');
    assert.match(calls[0].sql, /SET next_action = \$1, next_action_due = \$2, updated_at = NOW\(\) WHERE id = \$3 RETURNING \*/);
    assert.equal((await call('PUT', '/api/clients/5', { next_action_due: '2026-02-31' })).status, 400);
});
