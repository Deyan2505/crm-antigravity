import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyTallySignature, parseTallyPayload } from '../tally.js';

const SECRET = 'test-secret';
const sign = (raw, secret = SECRET) => crypto.createHmac('sha256', secret).update(raw).digest('base64');

const payload = (fields, submissionId = 'sub_1') => ({
    eventType: 'FORM_RESPONSE',
    data: { formId: 'q54MpG', submissionId, fields }
});
const opts = [{ id: 'o1', text: 'Бизнес уебсайт' }, { id: 'o2', text: 'Онлайн магазин' }];
const full = payload([
    { key: 'k_name', label: 'Име', type: 'INPUT_TEXT', value: 'Иван Петров' },
    { key: 'k_company', label: 'Име на Компания', type: 'INPUT_TEXT', value: 'Петров ЕООД' },
    { key: 'k_mail', label: 'Имейл', type: 'INPUT_EMAIL', value: 'ivan@example.com' },
    { key: 'k_tel', label: 'Телефон', type: 'INPUT_PHONE_NUMBER', value: '+359888000000' },
    { key: 'k_type', label: 'Какъв проект искате?', type: 'MULTIPLE_CHOICE', value: ['o1'], options: opts },
    { key: 'k_extra', label: 'Какви допълнителни възможности', type: 'CHECKBOXES', value: ['o1', 'o2'], options: opts },
    { key: 'k_extra_o1', label: 'Какви допълнителни възможности (Бизнес уебсайт)', type: 'CHECKBOXES', value: true },
    { key: 'k_extra_o2', label: 'Какви допълнителни възможности (Онлайн магазин)', type: 'CHECKBOXES', value: false },
    { key: 'k_notes', label: 'Разкажи ми', type: 'TEXTAREA', value: 'Искам сайт' },
    { key: 'h_lang', label: 'lang', type: 'HIDDEN_FIELDS', value: 'bg' },
    { key: 'h_price', label: 'price_range', type: 'HIDDEN_FIELDS', value: '500-1000' }
]);

test('valid signature is accepted', () => {
    const raw = Buffer.from(JSON.stringify(full));
    assert.equal(verifyTallySignature(raw, sign(raw), SECRET), true);
});

test('invalid, tampered, missing or malformed signatures are rejected', () => {
    const raw = Buffer.from(JSON.stringify(full));
    assert.equal(verifyTallySignature(raw, sign(raw, 'other-secret'), SECRET), false);
    assert.equal(verifyTallySignature(Buffer.from(raw + ' '), sign(raw), SECRET), false);
    assert.equal(verifyTallySignature(raw, undefined, SECRET), false);
    assert.equal(verifyTallySignature(raw, 'not-base64!!', SECRET), false);
    assert.equal(verifyTallySignature(raw, sign(raw), ''), false);
    assert.equal(verifyTallySignature(undefined, sign(raw), SECRET), false);
});

test('hex signature (the old, wrong encoding) is rejected', () => {
    const raw = Buffer.from('{"a":1}');
    const hex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    assert.equal(verifyTallySignature(raw, hex, SECRET), false);
});

test('parses by type, option ids and hidden fields', () => {
    assert.deepEqual(parseTallyPayload(full), {
        submissionId: 'sub_1',
        email: 'ivan@example.com',
        phone: '+359888000000',
        company: 'Петров ЕООД',
        name: 'Иван Петров',
        services: 'Бизнес уебсайт, Онлайн магазин',
        price_range: '500-1000',
        lang: 'bg',
        notes: 'Искам сайт'
    });
});

test('pinned field keys override label guessing', () => {
    const p = payload([
        { key: 'k_a', label: 'Нещо', type: 'INPUT_TEXT', value: 'Мария' },
        { key: 'k_b', label: 'Друго', type: 'INPUT_TEXT', value: '1000 EUR' }
    ]);
    const r = parseTallyPayload(p, { name: 'k_a', price_range: 'k_b' });
    assert.equal(r.name, 'Мария');
    assert.equal(r.price_range, '1000 EUR');
});

test('missing fields give empty strings and Unknown name; missing submission id gives null', () => {
    const r = parseTallyPayload(payload([]));
    assert.equal(r.name, 'Unknown');
    assert.equal(r.email, '');
    assert.equal(r.lang, '');
    assert.equal(parseTallyPayload({ data: { fields: [] } }), null);
    assert.equal(parseTallyPayload({}), null);
    assert.equal(parseTallyPayload(null), null);
});

test('same submission id parses to the same dedupe key (retry)', () => {
    assert.equal(parseTallyPayload(full).submissionId, parseTallyPayload(structuredClone(full)).submissionId);
});

test('name question "Как да се обръщаме към вас?" maps to name, other fields unaffected', () => {
    const p = payload([
        { key: 'question_name', label: 'Как да се обръщаме към вас?', type: 'INPUT_TEXT', value: 'Тестово Име' },
        { key: 'k_company', label: 'Име на Компания', type: 'INPUT_TEXT', value: 'Тест ЕООД' },
        { key: 'k_mail', label: 'Имейл', type: 'INPUT_EMAIL', value: 'test@example.invalid' },
        { key: 'k_tel', label: 'Телефон', type: 'INPUT_PHONE_NUMBER', value: '+359000000000' },
        { key: 'k_notes', label: 'Разкажи', type: 'TEXTAREA', value: 'Описание' }
    ]);
    const r = parseTallyPayload(p);
    assert.equal(r.name, 'Тестово Име');
    assert.equal(r.company, 'Тест ЕООД');
    assert.equal(r.email, 'test@example.invalid');
    assert.equal(r.phone, '+359000000000');
    assert.equal(r.notes, 'Описание');
    assert.equal(parseTallyPayload(p, { name: 'question_name' }).name, 'Тестово Име'); // pinned key path
});

