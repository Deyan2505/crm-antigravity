// apiFetch contract (Stage 1): a success is only ever a 2xx response with a JSON body; every failure throws an ApiError with
// the right status, a 401 signs the user out, and a request that never reached the server is not a "saved" request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError, errorKey } from '../src/utils/apiCore.js';

const reply = (status, body, { raw } = {}) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (raw) throw new SyntaxError('not json'); return body; } });
const make = (fetchImpl, extra = {}) => { const calls = []; const api = createApi({ baseUrl: 'http://api.test', getToken: () => 'tok', fetchImpl: (...a) => { calls.push(a); return fetchImpl(...a); }, ...extra }); return { api, calls }; };
const status = p => p.then(() => 'resolved', e => e.status);

test('2xx with JSON resolves with the data; request carries the bearer token and the JSON body', async () => {
    const { api, calls } = make(reply(201, { id: 7 }));
    assert.deepEqual(await api('/api/clients', { method: 'POST', body: { name: 'A' } }), { id: 7 });
    assert.equal(calls[0][0], 'http://api.test/api/clients');
    assert.equal(calls[0][1].method, 'POST');
    assert.equal(calls[0][1].headers.Authorization, 'Bearer tok');
    assert.equal(calls[0][1].body, '{"name":"A"}');
});

test('400, 403, 404 and 500 reject with their status, server code and message', async () => {
    for (const [st, code] of [[400, 'VALIDATION'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [500, 'SERVER_ERROR'], [409, 'ARCHIVE_REQUIRED']]) {
        const { api } = make(reply(st, { error: 'msg ' + st, code }));
        await assert.rejects(api('/x'), e => e instanceof ApiError && e.status === st && e.code === code && e.message === 'msg ' + st);
    }
});

test('401 rejects AND signs the user out; other errors do not', async () => {
    let signedOut = 0;
    const { api } = make(reply(401, { error: 'Session expired', code: 'AUTH_INVALID' }), { onUnauthorized: () => signedOut++ });
    assert.equal(await status(api('/api/clients')), 401);
    assert.equal(signedOut, 1);
    const other = make(reply(500, { error: 'x' }), { onUnauthorized: () => signedOut++ });
    await status(other.api('/x'));
    assert.equal(signedOut, 1);
});

test('no connection rejects with status 0 (nothing was saved)', async () => {
    const { api } = make(async () => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(api('/x', { method: 'POST', body: {} }), e => e.status === 0 && e.code === 'NETWORK');
});

test('a 2xx that is not JSON (proxy or error page) is NOT a confirmed save', async () => {
    const { api } = make(reply(200, null, { raw: true }));
    await assert.rejects(api('/x', { method: 'PUT', body: {} }), e => e.status === 200 && e.code === 'BAD_RESPONSE');
});

test('error body without JSON still rejects with the status (e.g. an HTML 502 page)', async () => {
    const { api } = make(reply(502, null, { raw: true }));
    await assert.rejects(api('/x'), e => e.status === 502);
});

test('every status maps to a message key the user sees', () => {
    assert.deepEqual([0, 400, 401, 403, 404, 500, 502].map(s => errorKey({ status: s })), ['err_network', 'err_validation', 'err_session', 'err_forbidden', 'err_not_found', 'err_server', 'err_server']);
});

// Guard against the old behaviour coming back: pages must not call fetch themselves (they would skip the res.ok check)
// and nothing may keep clients in localStorage (Demo Mode).
import fs from 'node:fs';
import path from 'node:path';
const sources = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sources(path.join(dir, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []);

test('no Demo Mode: nothing stores clients in the browser, and only apiCore/AuthContext(login) call fetch directly', () => {
    for (const file of sources(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
        const code = fs.readFileSync(file, 'utf8');
        const name = path.basename(file);
        assert.ok(!/setItem\(\s*['"]crm_clients_demo/.test(code), `${name} writes demo clients to localStorage`);
        assert.ok(!/authHeaders/.test(code), `${name} uses the old unchecked authHeaders`);
        if (!['apiCore.js', 'AuthContext.jsx'].includes(name)) assert.ok(!/\bfetch\(/.test(code), `${name} calls fetch() directly`);
    }
});
