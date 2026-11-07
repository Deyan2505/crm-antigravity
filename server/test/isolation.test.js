// The preview backend must not be able to reach the real world (Tally, Make.com, e-mail) and must not be reachable from the production
// frontend. This starts the REAL server (index.js) as a child process, with no database, and checks the guard. No PostgreSQL needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { isolationProblems, isIsolated, FORBIDDEN_ENV, previewOrigins } from '../isolation.js';

const SERVER_DIR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const BASE_ENV = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, JWT_SECRET: 'isolation-test-secret-isolation-test-secret', PGHOST: '127.0.0.1', PGPORT: '9', PGCONNECT_TIMEOUT: '1' };
const PROD_FRONTEND = 'https://crm-antigravity-nine.vercel.app';
const PREVIEW_FRONTEND = 'https://preview-frontend.example.invalid';

// starts index.js; resolves with { port, stop, output() } once it listens, or { exitCode, output() } if it exits first
async function start(env) {
    const port = await freePort();
    const child = spawn(process.execPath, ['index.js'], { cwd: SERVER_DIR, env: { ...BASE_ENV, PORT: String(port), ...env } });
    let out = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    const result = await new Promise(resolve => {
        child.on('exit', code => resolve({ exitCode: code }));
        const t = setInterval(() => { if (/Server running/.test(out)) { clearInterval(t); resolve({ port }); } }, 25);
        setTimeout(() => { clearInterval(t); resolve({ timeout: true }); }, 8000);
    });
    return { ...result, output: () => out, stop: () => new Promise(r => { if (child.exitCode !== null) return r(); child.on('exit', r); child.kill(); }) };
}
const post = (port, path, headers = {}) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{"data":{"formId":"q54MpG"}}' });
const ISOLATED = { PREVIEW_ISOLATED: '1', CORS_ORIGIN: PREVIEW_FRONTEND };

test('isolationProblems: nothing is checked unless PREVIEW_ISOLATED=1; then every channel to the real world is a problem', () => {
    assert.deepEqual(isolationProblems({}), []);
    assert.deepEqual(isolationProblems({ MAKE_CRM_WEBHOOK_URL: 'x', EMAIL_USER: 'x', ALLOW_REGISTRATION: 'true' }), [], 'production configuration is never judged');
    assert.equal(isIsolated({ PREVIEW_ISOLATED: '1' }), true); assert.equal(isIsolated({ PREVIEW_ISOLATED: 'true' }), false);
    assert.deepEqual(isolationProblems({ PREVIEW_ISOLATED: '1', CORS_ORIGIN: 'https://a.invalid' }), []);
    for (const k of FORBIDDEN_ENV) {
        const p = isolationProblems({ PREVIEW_ISOLATED: '1', CORS_ORIGIN: 'https://a.invalid', [k]: 'secret-value' });
        assert.equal(p.length, 1, k); assert.ok(p[0].includes(k) && !p[0].includes('secret-value'), 'names the variable, never its value');
    }
    assert.equal(isolationProblems({ PREVIEW_ISOLATED: '1', CORS_ORIGIN: 'https://a.invalid', ALLOW_REGISTRATION: 'true' }).length, 1);
    assert.equal(isolationProblems({ PREVIEW_ISOLATED: '1' }).length, 1, 'CORS_ORIGIN is required');
    assert.deepEqual(previewOrigins({ CORS_ORIGIN: ' https://a.invalid , https://b.invalid,, ' }), ['https://a.invalid', 'https://b.invalid']);
    for (const k of ['TALLY_SIGNING_SECRET', 'ARIE_TALLY_SIGNING_SECRET', 'ARIE_TALLY_SIGNING_SECRETS', 'MAKE_CRM_WEBHOOK_URL', 'EMAIL_USER', 'EMAIL_PASS', 'OWNER_NOTIFY_EMAIL']) assert.ok(FORBIDDEN_ENV.includes(k), k);
});

test('real server, PREVIEW_ISOLATED=1: both webhook routes (and anything below them) answer 403 before any parsing, with or without a signature', async () => {
    const s = await start(ISOLATED);
    try {
        assert.ok(s.port, 'server started: ' + s.output());
        for (const path of ['/api/webhook', '/api/webhook/arie-tally', '/api/webhook/anything/else']) {
            for (const headers of [{}, { 'tally-signature': 'AAAA' }]) {
                const r = await post(s.port, path, headers);
                assert.equal(r.status, 403, path);
                assert.deepEqual(await r.json(), { error: 'Disabled in the preview environment', code: 'PREVIEW_DISABLED' });
            }
        }
        assert.equal((await fetch(`http://127.0.0.1:${s.port}/api/webhook`)).status, 403, 'every method, not only POST');
        assert.equal((await fetch(`http://127.0.0.1:${s.port}/api/health`)).status, 200, 'the rest of the API is alive');
        assert.equal((await post(s.port, '/api/auth/register')).status, 403, 'registration closed');
        assert.equal((await fetch(`http://127.0.0.1:${s.port}/api/clients`)).status, 401, 'data routes still need a token');
    } finally { await s.stop(); }
});

test('real server, PREVIEW_ISOLATED=1: CORS admits only the configured preview frontend, not the production one', async () => {
    const s = await start(ISOLATED);
    try {
        const allow = async origin => (await fetch(`http://127.0.0.1:${s.port}/api/health`, { headers: { Origin: origin } })).headers.get('access-control-allow-origin');
        assert.equal(await allow(PREVIEW_FRONTEND), PREVIEW_FRONTEND);
        assert.equal(await allow(PROD_FRONTEND), null);
        assert.equal(await allow('http://localhost:5173'), null);
    } finally { await s.stop(); }
});

test('real server: PREVIEW_ISOLATED=1 with any real-world variable configured refuses to start and names it (never its value)', async () => {
    for (const k of ['MAKE_CRM_WEBHOOK_URL', 'ARIE_TALLY_SIGNING_SECRET', 'TALLY_SIGNING_SECRET', 'EMAIL_USER', 'EMAIL_PASS', 'OWNER_NOTIFY_EMAIL']) {
        const s = await start({ ...ISOLATED, [k]: 'super-secret-value' });
        assert.equal(s.exitCode, 1, `${k}: exit code`);
        assert.ok(s.output().includes(k), `${k}: named`);
        assert.ok(!s.output().includes('super-secret-value'), `${k}: value not printed`);
    }
    const open = await start({ ...ISOLATED, ALLOW_REGISTRATION: 'true' });
    assert.equal(open.exitCode, 1);
    const noCors = await start({ PREVIEW_ISOLATED: '1' });
    assert.equal(noCors.exitCode, 1);
});

test('real server WITHOUT PREVIEW_ISOLATED (production): the webhooks are untouched and the production frontend is still admitted', async () => {
    const s = await start({ ARIE_TALLY_SIGNING_SECRET: '', CORS_ORIGIN: '' });
    try {
        assert.ok(s.port, 'server started: ' + s.output());
        const legacy = await post(s.port, '/api/webhook');
        assert.notEqual(legacy.status, 403, 'legacy webhook is not blocked (it fails later, on the missing database)');
        const arie = await post(s.port, '/api/webhook/arie-tally');
        assert.equal(arie.status, 503, 'the signed route still answers 503 when no signing secret is configured, as before');
        const h = await fetch(`http://127.0.0.1:${s.port}/api/health`, { headers: { Origin: PROD_FRONTEND } });
        assert.equal(h.headers.get('access-control-allow-origin'), PROD_FRONTEND);
    } finally { await s.stop(); }
});
