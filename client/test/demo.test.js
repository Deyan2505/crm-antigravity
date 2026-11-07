// Preview-only demo mode (src/utils/demo*.js). The two things that matter most:
//   1. a PRODUCTION build contains none of it and still talks to the real API;
//   2. a PREVIEW build can not reach any real API (no production address inside, sign-in disabled).
// Plus: the simulated API keeps the same contract and the same inquiry-linking rule as the real server.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createApi, ApiError } from '../src/utils/apiCore.js';
import { demoFetch, resetDemo, DEMO_USER } from '../src/utils/demoApi.js';
import { translations } from '../src/utils/translations.js';

const api = createApi({ baseUrl: 'https://demo.invalid', getToken: () => null, fetchImpl: demoFetch });
beforeEach(() => resetDemo(0));
const fails = (p, status, code) => assert.rejects(p, e => e instanceof ApiError && e.status === status && (!code || e.code === code));
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

// ---- the simulated API ---------------------------------------------------------------------------------------------------------------
test('demo API: list, hub shape, dashboard, leads and users answer like the real server', async () => {
    const list = await api('/api/clients?limit=200');
    assert.equal(list.total, 7); assert.equal(list.data.length, 7);
    assert.ok(list.data.every(c => /\.invalid$/.test(c.email) || c.email === null), 'only invented .invalid addresses');
    const hub = await api(`/api/clients/${list.data.find(c => c.name === 'Мария Иванова' && c.track === 'portfolio').id}/hub`);
    assert.deepEqual(Object.keys(hub).sort(), ['activities', 'capabilities', 'client', 'inquiries', 'last_contact_at']);
    assert.deepEqual(hub.capabilities, { activities: true, inquiryLink: true, profileFields: true });
    assert.deepEqual(Object.keys(hub.activities[0]).sort(), ['body', 'client_id', 'created_at', 'created_by', 'id', 'kind', 'occurred_at', 'updated_at'], 'same columns as client_activities');
    assert.ok(hub.inquiries[0].data.details.answers.length >= 6, 'original answers as label/value');
    const stats = await api('/api/dashboard/stats');
    assert.deepEqual(Object.keys(stats).sort(), ['meetingsCount', 'newClients', 'totalClients', 'totalLeads']);
    assert.equal(stats.totalClients, 7);
    const monthly = await api('/api/dashboard/monthly-stats');
    assert.equal(monthly.labels.length, 6); assert.equal(monthly.counts.length, 6);
    assert.ok((await api('/api/leads')).length >= 7);
    assert.equal((await api('/api/users'))[0].email, DEMO_USER.email);
    await fails(api('/api/nope'), 404, 'NOT_FOUND');
});

test('demo API: inquiries belong to a client only by explicit link or exact submission id, never by e-mail/phone/name', async () => {
    const clients = (await api('/api/clients?limit=200')).data;
    const maria = clients.find(c => c.tally_submission_id === 'demo-sub-maria');
    const course = clients.find(c => c.tally_submission_id === 'demo-sub-maria-course');
    assert.equal(maria.email, course.email, 'same e-mail on two profiles (a real duplicate case)');
    const hm = await api(`/api/clients/${maria.id}/hub`), hc = await api(`/api/clients/${course.id}/hub`);
    assert.deepEqual(hm.inquiries.map(i => [i.data.submission_id, i.link]).sort(), [['demo-sub-maria', 'submission'], ['demo-sub-maria-course', 'explicit']]);
    assert.deepEqual(hc.inquiries, [], 'its own inquiry was linked to the other profile explicitly');
    const ivan = clients.find(c => c.name === 'Иван Петров');
    assert.deepEqual((await api(`/api/clients/${ivan.id}/hub`)).inquiries, [], 'a manual client has none');
    const unlinked = (await api('/api/leads')).find(l => !l.data.submission_id);
    for (const c of clients) assert.ok(!(await api(`/api/clients/${c.id}/hub`)).inquiries.some(i => i.id === unlinked.id), 'an unlinked lead is shown in no dossier');
});

test('demo API: history entries can be added and edited, ordered newest first, last contact ignores notes, entries stay with their client', async () => {
    const clients = (await api('/api/clients?limit=200')).data;
    const jane = clients.find(c => c.name === 'Jane Doe'), georgi = clients.find(c => c.name === 'Георги Димитров');
    const added = await api(`/api/clients/${jane.id}/activities`, { method: 'POST', body: { kind: 'note', body: ' Private note ', occurred_at: new Date(Date.now() + 1000).toISOString() } });
    assert.equal(added.body, 'Private note'); assert.equal(added.client_id, jane.id);
    let hub = await api(`/api/clients/${jane.id}/hub`);
    assert.equal(hub.activities[0].id, added.id, 'newest first');
    assert.notEqual(hub.last_contact_at, added.occurred_at, 'a note is not a contact');
    const edited = await api(`/api/clients/${jane.id}/activities/${added.id}`, { method: 'PUT', body: { kind: 'call', body: 'Called back' } });
    assert.deepEqual([edited.kind, edited.body, edited.occurred_at], ['call', 'Called back', added.occurred_at]);
    hub = await api(`/api/clients/${jane.id}/hub`);
    assert.equal(hub.last_contact_at, added.occurred_at, 'now it is a call');
    await fails(api(`/api/clients/${georgi.id}/activities/${added.id}`, { method: 'PUT', body: { body: 'hijack' } }), 404, 'NOT_FOUND');
    await fails(api(`/api/clients/${jane.id}/activities`, { method: 'POST', body: { body: '   ' } }), 400, 'VALIDATION');
    await fails(api(`/api/clients/${jane.id}/activities`, { method: 'POST', body: { kind: 'sms', body: 'x' } }), 400);
    await fails(api(`/api/clients/${jane.id}/activities`, { method: 'POST', body: { body: 'x', occurred_at: '2026-02-31' } }), 400);
    await fails(api('/api/clients/999999/activities', { method: 'POST', body: { body: 'x' } }), 404);
    await fails(api(`/api/clients/${jane.id}/activities/${added.id}`, { method: 'PUT', body: {} }), 400);
});

test('demo API: profile, next action and delete rules behave like the real server', async () => {
    const clients = (await api('/api/clients?limit=200')).data;
    const dana = clients.find(c => c.name === 'דנה כהן'), ivan = clients.find(c => c.name === 'Иван Петров'), georgi = clients.find(c => c.name === 'Георги Димитров');
    const saved = await api(`/api/clients/${dana.id}`, { method: 'PUT', body: { next_action: 'Call back', next_action_due: '2026-12-01', country: 'IL', preferred_contact: 'Phone' } });
    assert.equal(saved.client.next_action_due, '2026-12-01'); assert.equal(saved.client.status, 'New');
    assert.equal((await api(`/api/clients/${dana.id}`, { method: 'PUT', body: { next_action: '', next_action_due: '' } })).client.next_action_due, null);
    for (const bad of ['2026-02-31', '2026-13-01', 'soon']) await fails(api(`/api/clients/${dana.id}`, { method: 'PUT', body: { next_action_due: bad } }), 400);
    await fails(api(`/api/clients/${dana.id}`, { method: 'PUT', body: { status: 'Bogus' } }), 400);
    await fails(api(`/api/clients/${dana.id}`, { method: 'PUT', body: {} }), 400);
    await fails(api('/api/clients/999999', { method: 'PUT', body: { name: 'x' } }), 404);
    const created = await api('/api/clients', { method: 'POST', body: { name: 'New Person', email: 'new@example.invalid' } });
    assert.equal(created.status, 'New'); assert.equal((await api('/api/clients?limit=200')).total, 8);
    await fails(api('/api/clients', { method: 'POST', body: { email: 'x@example.invalid' } }), 400);
    await fails(api(`/api/clients/${georgi.id}`, { method: 'DELETE' }), 409, 'ARCHIVE_REQUIRED');
    await fails(api(`/api/clients/${ivan.id}`, { method: 'DELETE' }), 409, 'HAS_HISTORY');
    assert.equal((await api(`/api/clients/${created.id}`, { method: 'DELETE' })).id, created.id);
    await fails(api(`/api/clients/${created.id}`, { method: 'DELETE' }), 404);
});

test('demo data is per tab and resets: a changed state does not survive resetDemo()', async () => {
    const [first] = (await api('/api/clients?limit=200')).data;
    await api(`/api/clients/${first.id}`, { method: 'PUT', body: { name: 'Changed' } });
    assert.equal((await api('/api/clients?limit=200')).data.find(c => c.id === first.id).name, 'Changed');
    resetDemo(0);
    assert.equal((await api('/api/clients?limit=200')).data.find(c => c.id === first.id).name, first.name);
});

// ---- wiring --------------------------------------------------------------------------------------------------------------------------
test('preview wiring: no sign-in in the preview, a banner in three languages, the real code path untouched', () => {
    const auth = read('../src/context/AuthContext.jsx');
    assert.ok(auth.indexOf('if (__DEMO_PREVIEW__) return { success: false') > -1 && auth.indexOf('if (__DEMO_PREVIEW__) return { success: false') < auth.indexOf('await fetch('), 'demo login returns before any network call');
    assert.match(read('../src/App.jsx'), /__DEMO_PREVIEW__ \? <Navigate to="\/app" replace \/> : <Login \/>/);
    assert.match(read('../src/components/Layout.jsx'), /\{__DEMO_PREVIEW__ && <div className="demo-banner" role="status">\{t\('demo_banner'\)\}<\/div>\}/);
    for (const lang of ['en', 'bg', 'he']) assert.ok(String(translations[lang].demo_banner || '').length > 30, `${lang} banner`);
    assert.match(read('../vite.config.js'), /process\.env\.VERCEL_ENV !== 'production' &&/, 'a production build can never switch the demo on');
});

// ---- real builds ---------------------------------------------------------------------------------------------------------------------
const VITE = new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
function bundle(env) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-build-'));
    const e = { ...process.env }; delete e.VERCEL_ENV; delete e.DEMO_PREVIEW; Object.assign(e, env);
    try {
        execFileSync(process.execPath, [VITE, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, env: e, stdio: 'pipe' });
        const assets = path.join(out, 'assets');
        return fs.readdirSync(assets).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
}
const MARKER = 'demo-preview@example.invalid';   // the demo user: exists only in demo code
const PROD_API = 'crm-server-w6ye.onrender.com';  // the real API address

test('PRODUCTION build (also a local build, and production even if DEMO_PREVIEW=1 is set) has no demo code and still uses the real API', { timeout: 180000 }, () => {
    for (const env of [{ VERCEL_ENV: 'production' }, {}, { VERCEL_ENV: 'production', DEMO_PREVIEW: '1' }]) {
        const js = bundle(env);
        assert.ok(!js.includes(MARKER), `demo data leaked into the build ${JSON.stringify(env)}`);
        assert.ok(!js.includes('demo.invalid'), 'no demo address');
        assert.ok(!js.includes('demo-sub-maria') && !js.includes('Sign-in is disabled'), 'no sample data, no demo code paths');
        assert.ok(js.includes(PROD_API), 'the real API address is still there');
    }
});

const PREVIEW_API = 'https://crm-preview-backend.example.invalid';

test('PREVIEW build with its own VITE_API_URL talks to that backend only: demo off, the committed .env.local (production API) has no influence', { timeout: 120000 }, () => {
    const js = bundle({ VERCEL_ENV: 'preview', VITE_API_URL: PREVIEW_API });
    assert.ok(js.includes(PREVIEW_API), 'the preview backend address is in the bundle');
    assert.ok(!js.includes(PROD_API), 'the production API address is NOT in the bundle although client/.env.local contains it');
    assert.ok(!js.includes(MARKER) && !js.includes('demo.invalid') && !js.includes('demo-sub-maria'), 'the demo mode is off: no sample data, real sign-in');
    assert.ok(js.includes('/api/auth/login'), 'the real sign-in code is there');
});

test('a PREVIEW build whose VITE_API_URL is the production API (the Vercel "Production and Preview" variable) falls back to the demo: it can not reach production', { timeout: 120000 }, () => {
    const js = bundle({ VERCEL_ENV: 'preview', VITE_API_URL: 'https://' + PROD_API });
    assert.ok(js.includes(MARKER) && js.includes('demo.invalid'), 'runs on sample data');
    assert.ok(!js.includes(PROD_API), 'the production API address is not in the preview bundle');
    // the same variable in a production build is just the normal configuration
    const prod = bundle({ VERCEL_ENV: 'production', VITE_API_URL: 'https://' + PROD_API });
    assert.ok(prod.includes(PROD_API) && !prod.includes(MARKER));
});

test('PREVIEW build (VERCEL_ENV=preview) runs on sample data and contains no address of the real API', { timeout: 120000 }, () => {
    const js = bundle({ VERCEL_ENV: 'preview' });
    assert.ok(js.includes(MARKER), 'demo data is in the preview build');
    assert.ok(js.includes('demo.invalid'), 'the API address is unresolvable on purpose');
    assert.ok(!js.includes(PROD_API), 'the preview bundle cannot reach the production API');
    assert.ok(!js.includes('/api/auth/login') || !js.includes(PROD_API), 'no real login target');
});
