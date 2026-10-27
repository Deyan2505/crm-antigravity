import crypto from 'crypto';

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
