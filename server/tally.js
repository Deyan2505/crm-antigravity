import crypto from 'crypto';
import { normalizeContact } from './contact.js';
import { ARIE_FORMS } from './arieForms.js';

// Tally signs the exact raw JSON body: base64(HMAC-SHA256(rawBody, signingSecret)) in the `tally-signature` header.
export function verifyTallySignature(rawBody, header, secret) {
    if (!Buffer.isBuffer(rawBody) || !header || !secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const given = Buffer.from(String(header), 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Optional TALLY_FIELD_KEYS='{"name":"question_xxx","price_range":"question_yyy"}' pins roles to stable Tally field keys.
// Roles: name, company, services, price_range, lang, notes. Without a key we fall back to field type / hidden-field name / label.
const LABEL_FALLBACK = {
    name: /име|name/i,
    company: /компани|организаци|фирма|company/i,
    services: /services|услуг|възможности/i,
    price_range: /price_range|бюджет|цена|budget/i,
    lang: /^lang$|език|language/i,
    notes: /разкажи|повече|описание|бележк|message|note/i
};

// Choice fields carry option ids in `value`; resolve them to the option text.
function textOf(field) {
    const v = field.value;
    if (v === null || v === undefined || typeof v === 'boolean') return '';
    if (!Array.isArray(v)) return String(v).trim();
    const byId = new Map((field.options || []).map(o => [o.id, o.text]));
    return v.map(x => byId.get(x) ?? (x && x.text) ?? x).join(', ').trim();
}

export function parseTallyPayload(body, fieldKeys = {}) {
    const data = body && body.data;
    const submissionId = data && (data.submissionId || data.responseId);
    if (!submissionId || !Array.isArray(data.fields)) return null;

    // Tally also emits one boolean field per checkbox option; textOf() drops those.
    const fields = data.fields.filter(f => f && textOf(f));
    const used = new Set();
    const pick = (role, match) => {
        const f = fields.find(x => !used.has(x) && (
            (fieldKeys[role] && x.key === fieldKeys[role]) ||
            (!fieldKeys[role] && match(x))));
        if (!f) return '';
        used.add(f);
        return textOf(f);
    };
    const hidden = name => x => x.type === 'HIDDEN_FIELDS' && x.label === name;
    const byLabel = (role, types) => x => (!types || types.includes(x.type)) && LABEL_FALLBACK[role].test(x.label || '');

    return {
        submissionId: String(submissionId),
        email: pick('email', x => x.type === 'INPUT_EMAIL'),
        phone: pick('phone', x => x.type === 'INPUT_PHONE_NUMBER'),
        // company before name: "Име на Компания" would otherwise match the name label
        company: pick('company', x => hidden('company')(x) || byLabel('company', ['INPUT_TEXT'])(x)),
        name: pick('name', x => hidden('name')(x) || byLabel('name', ['INPUT_TEXT'])(x)) || 'Unknown',
        services: pick('services', x => hidden('services')(x) || byLabel('services')(x)),
        price_range: pick('price_range', x => hidden('price_range')(x) || byLabel('price_range')(x)),
        lang: pick('lang', x => hidden('lang')(x) || byLabel('lang')(x)),
        notes: pick('notes', x => x.type === 'TEXTAREA' || byLabel('notes')(x))
    };
}

// ---- the six ARIE forms (see arieForms.js) ------------------------------------------------------------
// Signing secret for a form: its own secret from ARIE_TALLY_SIGNING_SECRETS ({"<formId>":"<secret>",...}) if set,
// otherwise the shared ARIE_TALLY_SIGNING_SECRET. A form with its own secret never accepts the shared one.
// Returns null when nothing is configured (the caller answers 503); a malformed JSON map counts as not configured.
export function signingSecretFor(formId, env = process.env) {
    let perForm = {};
    if (env.ARIE_TALLY_SIGNING_SECRETS) {
        try { perForm = JSON.parse(env.ARIE_TALLY_SIGNING_SECRETS) || {}; } catch { perForm = {}; console.error('ARIE webhook: ARIE_TALLY_SIGNING_SECRETS is not valid JSON'); }
    }
    const own = typeof formId === 'string' && Object.hasOwn(perForm, formId) ? perForm[formId] : null;
    return own || env.ARIE_TALLY_SIGNING_SECRET || null;
}

// Answer of one question by its stable id: Tally sends key "question_<id>"; per-option checkbox booleans
// ("question_<id>_<option>") and empty answers are skipped by textOf().
function answerById(fields, id) {
    if (!id) return { found: false, text: '' };
    const f = fields.find(x => x && (x.key === `question_${id}` || x.key === id));
    return { found: !!f, text: f ? textOf(f) : '' };
}

// Parses a submission of one of the six ARIE forms; for any other form returns parseTallyPayload's result
// with track 'unknown'. `missing` lists roles whose question id was not in the payload (the form changed):
// those roles fall back to the field type (email, phone, long text) and the handler logs the role names only.
export function parseArieSubmission(body, fieldKeys = {}) {
    const data = body && body.data;
    const form = data && ARIE_FORMS[data.formId];
    if (!form) {
        const lead = parseTallyPayload(body, fieldKeys);
        return lead && { ...lead, formId: (data && data.formId) || '', track: 'unknown', projectType: '', contactPref: 'Unspecified', answers: answersOf(data), missing: [] };
    }
    const submissionId = data.submissionId || data.responseId;
    if (!submissionId || !Array.isArray(data.fields)) return null;

    const fields = data.fields.filter(Boolean);
    const missing = [];
    const get = (role, fallback) => {
        const a = answerById(fields, form.q[role]);
        if (!a.found && form.q[role]) missing.push(role);
        if (a.text || a.found || !fallback) return a.text;
        const f = fields.find(fallback);
        return f ? textOf(f) : '';
    };
    const hidden = name => { const f = fields.find(x => x.type === 'HIDDEN_FIELDS' && x.label === name); return f ? textOf(f) : ''; };

    const features = get('features');
    const lead = {
        submissionId: String(submissionId),
        formId: data.formId,
        track: form.track,
        lang: form.lang, // language of the form the client filled in
        name: get('name') || 'Unknown',
        email: get('email', x => x.type === 'INPUT_EMAIL'),
        phone: get('phone', x => x.type === 'INPUT_PHONE_NUMBER'),
        company: get('company'),
        notes: get('notes', x => x.type === 'TEXTAREA'),
        projectType: form.track === 'portfolio' ? get('projectType') : get('topic'),
        contactPref: normalizeContact(get('contactPref')), // one stable value; the original wording stays in answers
        // Portfolio: services chosen in the site's price calculator (hidden field), else the features ticked in the form
        services: (form.track === 'portfolio' && hidden('services')) || features,
        price_range: form.track === 'portfolio' ? hidden('price_range') : '',
        answers: answersOf(data),
        missing
    };
    if (form.track === 'learning') Object.assign(lead, { role: get('role'), materials: get('materials'), features });
    else Object.assign(lead, { features, siteLang: get('siteLang') });
    lead.timing = get('timing');
    return lead;
}

// Every answered question with its label, in form order (kept in leads.data so nothing the client wrote is lost).
function answersOf(data) {
    if (!data || !Array.isArray(data.fields)) return [];
    return data.fields.filter(f => f && textOf(f)).map(f => ({ label: String(f.label || f.key || ''), value: textOf(f) }));
}
