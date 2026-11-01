// Six ARIE Tally forms -> CRM. Runs without a database: the handler is tested over HTTP with an in-memory pool
// that behaves like the clients/leads tables (unique tally_submission_id, transactions). The real-Postgres
// version of these checks is test/arie.integration.test.js (needs TEST_DATABASE_URL on localhost).
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import { parseArieSubmission, signingSecretFor } from '../tally.js';
import { ARIE_FORMS } from '../arieForms.js';
import { saveRawBody, makeArieTallyHandler, ARIE_PATH } from '../arieWebhook.js';
import { PORTFOLIO_TEXT, LEARNING_TEXT, SAMPLE, portfolioPayload, learningPayload, payloadFor } from './fixtures.js';

const sign = (raw, secret) => crypto.createHmac('sha256', secret).update(raw).digest('base64');

// ---- parser ------------------------------------------------------------------------------------------
test('all six forms are configured with the expected direction and language', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(ARIE_FORMS).map(([id, f]) => [id, f.track + '/' + f.lang])), {
        q54MpG: 'portfolio/bg', rD5EDo: 'portfolio/en', '9NBlNE': 'portfolio/he', rD5KzL: 'learning/bg', LD90Dy: 'learning/en', zEjeEk: 'learning/he'
    });
    // every question id is unique across the six forms (a copy-paste error would map the wrong answer)
    const ids = Object.values(ARIE_FORMS).flatMap(f => Object.values(f.q));
    assert.equal(new Set(ids).size, ids.length);
});

for (const formId of ['q54MpG', 'rD5EDo', '9NBlNE']) {
    test(`Portfolio ${formId}: name, contact, project type, calculator fields and description by question id`, () => {
        const f = ARIE_FORMS[formId], t = PORTFOLIO_TEXT[formId], s = SAMPLE[f.lang];
        const lead = parseArieSubmission(portfolioPayload(formId, 'sub-' + formId));
        assert.equal(lead.submissionId, 'sub-' + formId);
        assert.equal(lead.formId, formId);
        assert.equal(lead.track, 'portfolio');
        assert.equal(lead.lang, f.lang);
        assert.equal(lead.name, s.name); // the old label guessing gave "Unknown" for all three
        assert.equal(lead.email, 'client@example.invalid');
        assert.equal(lead.phone, '+972500000000');
        assert.equal(lead.company, s.company);
        assert.equal(lead.projectType, t.project[1][4]); // "AI chatbot" in the form's language
        assert.equal(lead.contactPref, t.contact[1][2]);
        assert.equal(lead.services, 'Smart landing page, WhatsApp ordering'); // from the calculator
        assert.equal(lead.price_range, '€600 – €850');
        assert.equal(lead.features, `${t.features[1][1]}, ${t.features[1][2]}`);
        assert.equal(lead.notes, s.notes);
        assert.deepEqual(lead.missing, []);
        // every answer is kept with its label; per-option checkbox booleans are not
        assert.ok(lead.answers.some(a => a.label === t.project[0] && a.value === t.project[1][4]));
        assert.ok(!lead.answers.some(a => a.value === 'true' || a.value === 'false'));
    });
}

test('Portfolio without the calculator: services fall back to the ticked features, no price range', () => {
    const lead = parseArieSubmission(portfolioPayload('rD5EDo', 's', { withCalculator: false }));
    assert.equal(lead.services, 'WhatsApp integration, AI chatbot for visitors');
    assert.equal(lead.price_range, '');
    assert.equal(lead.lang, 'en'); // from the form, not from a hidden field
});

test('new project types (AI automation, chatbot, business app, other) are read in all three languages', () => {
    for (const formId of ['q54MpG', 'rD5EDo', '9NBlNE']) for (const i of [3, 4, 5, 6, 7]) {
        assert.equal(parseArieSubmission(portfolioPayload(formId, 's', { projectIdx: i })).projectType, PORTFOLIO_TEXT[formId].project[1][i], formId + ' #' + i);
    }
});

for (const formId of ['rD5KzL', 'LD90Dy', 'zEjeEk']) {
    test(`Learning ${formId}: separate direction, role, topic, materials and features`, () => {
        const f = ARIE_FORMS[formId], t = LEARNING_TEXT[formId], s = SAMPLE[f.lang];
        const lead = parseArieSubmission(learningPayload(formId, 'L-' + formId));
        assert.equal(lead.track, 'learning');
        assert.equal(lead.lang, f.lang);
        assert.equal(lead.name, s.name);
        assert.equal(lead.email, 'learner@example.invalid');
        assert.equal(lead.phone, ''); // optional and left empty
        assert.equal(lead.company, '');
        assert.equal(lead.role, t.role[1][1]);
        assert.equal(lead.projectType, s.topic); // the course subject
        assert.equal(lead.materials, t.materials[1][0]);
        assert.equal(lead.services, t.features[1].join(', '));
        assert.equal(lead.price_range, '');
        assert.equal(lead.notes, s.notes);
        assert.deepEqual(lead.missing, []);
    });
}

test('a changed form (question ids missing) still stores contact data by field type and reports the roles', () => {
    const f = ARIE_FORMS.q54MpG;
    const p = portfolioPayload('q54MpG', 's', { omit: [f.q.name, f.q.email, f.q.notes] });
    // the same answers arrive under new ids
    p.data.fields.push({ key: 'question_NEW1', label: 'Имейл', type: 'INPUT_EMAIL', value: 'new@example.invalid' }, { key: 'question_NEW2', label: 'Бележка', type: 'TEXTAREA', value: 'текст' });
    const lead = parseArieSubmission(p);
    assert.equal(lead.email, 'new@example.invalid');
    assert.equal(lead.notes, 'текст');
    assert.equal(lead.name, 'Unknown');
    assert.deepEqual(lead.missing.sort(), ['email', 'name', 'notes']);
});

test('empty optional answers stay empty and are not reported as missing', () => {
    const p = portfolioPayload('9NBlNE', 's');
    for (const fld of p.data.fields) if (fld.key === `question_${ARIE_FORMS['9NBlNE'].q.company}`) fld.value = '';
    const lead = parseArieSubmission(p);
    assert.equal(lead.company, '');
    assert.deepEqual(lead.missing, []);
});

test('malformed payloads give null; forms outside the six keep the previous label-based parsing', () => {
    assert.equal(parseArieSubmission(null), null);
    assert.equal(parseArieSubmission({}), null);
    assert.equal(parseArieSubmission({ data: { formId: 'q54MpG', fields: [] } }), null); // no submission id
    assert.equal(parseArieSubmission({ data: { formId: 'q54MpG', submissionId: 's' } }), null); // no fields
    const other = parseArieSubmission({ data: { formId: 'zzzzzz', submissionId: 's', fields: [{ key: 'a', label: 'Име', type: 'INPUT_TEXT', value: 'Иван' }] } });
    assert.equal(other.track, 'unknown');
    assert.equal(other.name, 'Иван');
});

// ---- secrets ---------------------------------------------------------------------------------------
test('signing secret: own secret per form, otherwise the shared one; own secret excludes the shared one', () => {
    const env = { ARIE_TALLY_SIGNING_SECRET: 'shared', ARIE_TALLY_SIGNING_SECRETS: JSON.stringify({ rD5KzL: 'learn-bg', LD90Dy: 'learn-en' }) };
    assert.equal(signingSecretFor('rD5KzL', env), 'learn-bg');
    assert.equal(signingSecretFor('LD90Dy', env), 'learn-en');
    assert.equal(signingSecretFor('q54MpG', env), 'shared');
    assert.equal(signingSecretFor(undefined, env), 'shared');
    assert.equal(signingSecretFor('__proto__', env), 'shared'); // no prototype tricks
    assert.equal(signingSecretFor('q54MpG', { ARIE_TALLY_SIGNING_SECRETS: JSON.stringify({ rD5KzL: 'x' }) }), null);
    assert.equal(signingSecretFor('q54MpG', {}), null);
    const err = console.error; console.error = () => {};
    try { assert.equal(signingSecretFor('rD5KzL', { ARIE_TALLY_SIGNING_SECRET: 'shared', ARIE_TALLY_SIGNING_SECRETS: '{bad' }), 'shared'); } finally { console.error = err; }
});

// ---- handler over HTTP, in-memory tables -------------------------------------------------------------
function fakePool() {
    const t = { clients: [], leads: [], failLeads: false };
    const pool = {
        tables: t,
        async connect() {
            let pending = null;
            return {
                release() {},
                async query(sql, params = []) {
                    if (sql === 'BEGIN') { pending = { clients: [], leads: [] }; return {}; }
                    if (sql === 'COMMIT') { t.clients.push(...pending.clients); t.leads.push(...pending.leads); pending = null; return {}; }
                    if (sql === 'ROLLBACK') { pending = null; return {}; }
                    if (/^\s*INSERT INTO clients/.test(sql)) {
                        const cols = sql.match(/\(([^)]+)\)\s*VALUES/)[1].split(',').map(s => s.trim());
                        const vals = []; let p = 0;
                        for (const v of sql.match(/VALUES \(([^)]+)\)/)[1].split(',').map(s => s.trim())) vals.push(v.startsWith('$') ? params[p++] : v.replace(/'/g, ''));
                        const row = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
                        const taken = [...t.clients, ...(pending ? pending.clients : [])].some(r => r.tally_submission_id === row.tally_submission_id);
                        if (taken) return { rowCount: 0, rows: [] };
                        pending.clients.push(row);
                        return { rowCount: 1, rows: [{ id: t.clients.length + pending.clients.length }] };
                    }
                    if (/^INSERT INTO leads/.test(sql)) {
                        if (t.failLeads) throw Object.assign(new Error('relation "leads" is broken: client@example.invalid'), { code: '42P01' });
                        pending.leads.push({ source: params[0], data: JSON.parse(params[1]) });
                        return { rowCount: 1 };
                    }
                    throw new Error('unexpected SQL: ' + sql);
                }
            };
        }
    };
    return pool;
}

const SHARED = 'shared-secret', OWN = { rD5KzL: 'learning-bg-secret', zEjeEk: 'learning-he-secret' };
let server, base, pool, notified, logs;
const orig = { log: console.log, error: console.error, warn: console.warn };
before(async () => {
    const app = express();
    app.use(express.json({ verify: saveRawBody }));
    app.post(ARIE_PATH, (req, res) => makeArieTallyHandler({ pool, notify: async lead => { notified.push(lead); } })(req, res));
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${server.address().port}${ARIE_PATH}`;
});
after(() => server.close());
beforeEach(() => {
    pool = fakePool(); notified = []; logs = [];
    process.env.ARIE_TALLY_SIGNING_SECRET = SHARED;
    process.env.ARIE_TALLY_SIGNING_SECRETS = JSON.stringify(OWN);
    console.log = console.error = console.warn = (...a) => logs.push(a.join(' '));
});
test.afterEach(() => Object.assign(console, orig));
const secretOf = id => OWN[id] || SHARED;
const post = (obj, { raw = JSON.stringify(obj), sig = sign(raw, secretOf(obj.data && obj.data.formId)) } = {}) =>
    fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'tally-signature': sig } : {}) }, body: raw });
const tick = () => new Promise(r => setTimeout(r, 30));

test('each of the six forms, signed with its own (or the shared) secret, is stored once in clients and leads', async () => {
    for (const id of Object.keys(ARIE_FORMS)) {
        const r = await post(payloadFor(id, 'live-' + id));
        assert.equal(r.status, 200, id);
        assert.deepEqual(await r.json(), { status: 'success' });
    }
    await tick();
    const c = pool.tables.clients;
    assert.equal(c.length, 6);
    assert.equal(pool.tables.leads.length, 6);
    assert.equal(notified.length, 6);
    const byForm = Object.fromEntries(c.map(r => [r.tally_form_id, r]));
    assert.equal(byForm.q54MpG.track, 'portfolio'); assert.equal(byForm.zEjeEk.track, 'learning');
    assert.equal(byForm['9NBlNE'].name, 'דנה כהן'); assert.equal(byForm['9NBlNE'].lang, 'he');
    assert.equal(byForm.rD5EDo.project_type, 'AI chatbot');
    assert.equal(byForm.rD5EDo.preferred_contact, 'Via WhatsApp');
    assert.equal(byForm.LD90Dy.project_type, 'Excel for beginners');
    assert.equal(byForm.q54MpG.status, 'New'); assert.equal(byForm.q54MpG.source, 'Tally');
    const lead = pool.tables.leads.find(l => l.data.form_id === 'q54MpG').data;
    assert.equal(lead.track, 'portfolio'); assert.equal(lead.project_type, 'AI чатбот');
    assert.ok(Array.isArray(lead.details.answers) && lead.details.answers.length >= 8);
});

test('retry of the same submission: 200 duplicate, no second row, no second notification', async () => {
    const p = payloadFor('9NBlNE', 'retry-1');
    assert.equal((await post(p)).status, 200);
    const r = await post(p);
    assert.deepEqual(await r.json(), { status: 'duplicate' });
    await tick();
    assert.equal(pool.tables.clients.length, 1); assert.equal(pool.tables.leads.length, 1); assert.equal(notified.length, 1);
});

test('10 concurrent deliveries of one submission: exactly one row', async () => {
    const p = payloadFor('rD5KzL', 'burst-1');
    const res = await Promise.all(Array.from({ length: 10 }, () => post(p)));
    assert.ok(res.every(r => r.status === 200));
    await tick();
    assert.equal(pool.tables.clients.length, 1); assert.equal(notified.length, 1);
});

test('signatures: missing, wrong, another form\'s secret, shared secret on a form with its own secret, tampered body: all 401', async () => {
    const p = payloadFor('rD5KzL', 'sig-1'), raw = JSON.stringify(p);
    for (const sig of [null, 'bogus', sign(raw, 'wrong'), sign(raw, OWN.zEjeEk), sign(raw, SHARED), crypto.createHmac('sha256', OWN.rD5KzL).update(raw).digest('hex')]) {
        const r = await post(p, { raw, sig });
        assert.equal(r.status, 401, String(sig));
    }
    // body changed after signing (e.g. another form id swapped in to pick an easier secret)
    const swapped = raw.replace('"rD5KzL"', '"q54MpG"');
    assert.equal((await post(null, { raw: swapped, sig: sign(raw, OWN.rD5KzL) })).status, 401);
    assert.equal(pool.tables.clients.length, 0); assert.equal(notified.length, 0);
});

test('no secret configured at all: 503 and nothing stored; a form with its own secret still works without the shared one', async () => {
    delete process.env.ARIE_TALLY_SIGNING_SECRET; delete process.env.ARIE_TALLY_SIGNING_SECRETS;
    assert.equal((await post(payloadFor('q54MpG', 'n1'), { sig: 'x' })).status, 503);
    process.env.ARIE_TALLY_SIGNING_SECRETS = JSON.stringify(OWN);
    assert.equal((await post(payloadFor('q54MpG', 'n2'), { sig: sign('x', SHARED) })).status, 503); // no shared secret
    assert.equal((await post(payloadFor('rD5KzL', 'n3'))).status, 200);
    assert.equal(pool.tables.clients.length, 1);
});

test('signed but malformed bodies: 400, nothing stored', async () => {
    for (const p of [{ eventType: 'FORM_RESPONSE' }, { data: { formId: 'q54MpG', fields: [] } }, { data: { formId: 'q54MpG', submissionId: 'x' } }]) {
        assert.equal((await post(p, { sig: sign(JSON.stringify(p), SHARED) })).status, 400);
    }
    assert.equal(pool.tables.clients.length, 0);
});

test('a database failure rolls back both tables and returns a generic 500 without details', async () => {
    pool.tables.failLeads = true;
    const r = await post(payloadFor('LD90Dy', 'fail-1'));
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { status: 'error' });
    await tick();
    assert.equal(pool.tables.clients.length, 0); assert.equal(notified.length, 0);
    // Tally retries later; once the database is fine the same submission is stored
    pool.tables.failLeads = false;
    assert.equal((await post(payloadFor('LD90Dy', 'fail-1'))).status, 200);
    assert.equal(pool.tables.clients.length, 1);
});

test('logs carry ids only, never names, e-mails, phones or answers', async () => {
    const f = ARIE_FORMS.rD5EDo;
    await post(portfolioPayload('rD5EDo', 'log-1', { omit: [f.q.timing] }));
    await post(portfolioPayload('rD5EDo', 'log-1'));
    pool.tables.failLeads = true;
    await post(portfolioPayload('rD5EDo', 'log-2'));
    await tick();
    const all = logs.join('\n');
    assert.match(all, /ARIE webhook rD5EDo: question ids not in payload \(form changed\?\): timing/);
    for (const pii of ['Jane Doe', 'client@example.invalid', '+972500000000', 'Doe Ltd', 'booking chatbot', 'example.invalid']) assert.ok(!all.includes(pii), 'log leaks ' + pii);
});
