// Client Hub 360 (Stage 2A): the pure helpers behind the page, translation completeness (BG / EN / HE) and the RTL guard of its stylesheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
    KINDS, KIND_KEYS, CONTACT_KEYS, STATUS_KEYS, TRACK_KEYS, isClientId, todayStr, nextActionState, formatDay, formatDateTime,
    toLocalInput, fromLocalInput, answersOf, inquiryFacts, projectsOf, profileNotes
} from '../src/utils/hub.js';
import { translations } from '../src/utils/translations.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

// ---- original Tally answers ---------------------------------------------------------------------------------------------------------------
test('answersOf: the six-form answers come back exactly as stored (label + value, empty ones skipped); legacy flat leads are shown field by field', () => {
    const six = { submission_id: 's1', details: { answers: [{ label: 'Какъв проект?', value: 'Сайт' }, { label: 'Бележка', value: '' }, { label: 'Email', value: 'a@example.invalid' }, null] } };
    assert.deepEqual(answersOf(six), [{ label: 'Какъв проект?', value: 'Сайт' }, { label: 'Email', value: 'a@example.invalid' }]);
    assert.deepEqual(answersOf({ answers: [{ label: 'Q', value: 'A' }] }), [{ label: 'Q', value: 'A' }], 'answers at the top level');
    assert.deepEqual(answersOf({ name: 'Legacy One', email: 'one@legacy.invalid', phone: '', nested: { a: 1 }, n: 5 }), [{ label: 'name', value: 'Legacy One' }, { label: 'email', value: 'one@legacy.invalid' }, { label: 'n', value: '5' }]);
    for (const bad of [null, undefined, {}, [], 'text', 7]) assert.deepEqual(answersOf(bad), [], String(bad));
});

test('inquiryFacts: form, language, track, project type and submission id of a stored inquiry', () => {
    const f = inquiryFacts({ id: 4, source: 'Tally', created_at: '2026-11-01T08:00:00Z', link: 'submission', data: { form_id: 'q54MpG', track: 'portfolio', lang: 'bg', project_type: 'AI чатбот', submission_id: 'sub-1' } });
    assert.deepEqual(f, { id: 4, createdAt: '2026-11-01T08:00:00Z', link: 'submission', source: 'Tally', lang: 'bg', track: 'portfolio', projectType: 'AI чатбот', formId: 'q54MpG', submissionId: 'sub-1' });
    const legacy = inquiryFacts({ id: 5, source: 'Tally', created_at: 'x', link: 'explicit', data: {} });
    assert.deepEqual([legacy.lang, legacy.track, legacy.projectType, legacy.formId], ['', '', '', '']);
});

// ---- project & requirements ---------------------------------------------------------------------------------------------------------------
test('projectsOf: one project per linked inquiry from its OWN data (a Portfolio and a Learning inquiry are never mixed); unknown stays empty', () => {
    const portfolio = { id: 1, created_at: '2026-11-01T08:00:00Z', data: { track: 'portfolio', project_type: 'AI chatbot', notes: ' We need bookings ', service_type: 'Smart landing page', price_range: '€600 – €850', details: { features: 'WhatsApp, Booking', timing: 'Next month', siteLang: 'Bulgarian' } } };
    const learning = { id: 2, created_at: '2026-11-05T08:00:00Z', data: { track: 'learning', project_type: 'Excel for beginners', notes: 'A course', details: { role: 'A teacher', materials: 'PDFs', features: 'Auto-graded tests', timing: 'Soon' } } };
    const [a, b] = projectsOf({ name: 'Maria', track: 'portfolio', project_type: 'client column', notes: 'client note' }, [learning, portfolio]);
    assert.deepEqual(a, { key: 'inquiry-2', createdAt: '2026-11-05T08:00:00Z', track: 'learning', projectType: 'Excel for beginners', description: 'A course', features: 'Auto-graded tests', budget: '', timing: 'Soon', siteLang: '', role: 'A teacher', materials: 'PDFs' });
    assert.deepEqual(b, { key: 'inquiry-1', createdAt: '2026-11-01T08:00:00Z', track: 'portfolio', projectType: 'AI chatbot', description: 'We need bookings', features: 'WhatsApp, Booking', budget: '€600 – €850', timing: 'Next month', siteLang: 'Bulgarian', role: '', materials: '' });
    assert.equal(b.role, '', 'no learning details leak into the portfolio project'); assert.equal(a.budget, '', 'no portfolio budget leaks into the learning project');
    // legacy (flat) inquiry
    assert.deepEqual(projectsOf({}, [{ id: 3, created_at: 'x', data: { name: 'Legacy', service_type: 'Site', notes: 'old' } }])[0].features, 'Site');
    // a client entered by hand has no inquiry: one project from its own columns
    const manual = projectsOf({ name: 'Manual', service_type: 'Web design', notes: 'By phone', price_range: '' }, []);
    assert.equal(manual.length, 1);
    assert.deepEqual([manual[0].key, manual[0].features, manual[0].description, manual[0].budget, manual[0].timing, manual[0].projectType], ['client', 'Web design', 'By phone', '', '', '']);
});

test('profileNotes: the client\'s own notes are listed in the profile only when no project already shows the same text', () => {
    const inq = text => ({ data: { notes: text } });
    assert.equal(profileNotes({ notes: 'We need bookings' }, [inq('We need bookings')]), '', 'already the description of the project');
    assert.equal(profileNotes({ notes: ' We need bookings ' }, [inq('We need bookings')]), '');
    assert.equal(profileNotes({ notes: 'Called, wants a discount' }, [inq('We need bookings')]), 'Called, wants a discount', 'edited by hand: shown');
    assert.equal(profileNotes({ notes: 'By phone' }, []), '', 'no inquiry: it is the description of the only project');
    assert.equal(profileNotes({ notes: null }, [inq('x')]), '');
});

// ---- dates ---------------------------------------------------------------------------------------------------------------------------------
test('nextActionState compares calendar days as text: none / overdue / today / upcoming', () => {
    assert.equal(nextActionState(null, '2026-11-07'), 'none');
    assert.equal(nextActionState('', '2026-11-07'), 'none');
    assert.equal(nextActionState('2026-11-06', '2026-11-07'), 'overdue');
    assert.equal(nextActionState('2026-11-07', '2026-11-07'), 'today');
    assert.equal(nextActionState('2026-11-08', '2026-11-07'), 'upcoming');
    assert.equal(nextActionState('2027-01-01', '2026-12-31'), 'upcoming');
    assert.equal(todayStr(new Date(2026, 0, 5)), '2026-01-05', 'local calendar day, zero padded');
});

test('formatDay shows the day it was given in every language (no time-zone shift); bad input gives an empty string', () => {
    assert.match(formatDay('2026-12-01', 'en'), /^1 Dec 2026$/);
    assert.match(formatDay('2026-12-31', 'en'), /^31 Dec 2026$/);
    for (const lang of ['bg', 'he', 'xx']) assert.match(formatDay('2026-12-01', lang), /2026/);
    for (const bad of ['', null, undefined, 'soon', '12/01/2026']) assert.equal(formatDay(bad, 'en'), '');
    assert.equal(formatDateTime('not a date', 'en'), ''); assert.equal(formatDateTime(null, 'en'), '');
    assert.match(formatDateTime('2026-11-07T10:30:00Z', 'en'), /2026/);
});

test('datetime-local <-> ISO round trip keeps the minute the user typed (local time in, instant out)', () => {
    const iso = fromLocalInput('2026-11-07T10:30');
    assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    assert.equal(toLocalInput(iso), '2026-11-07T10:30');
    assert.equal(fromLocalInput(''), null); assert.equal(fromLocalInput('garbage'), null); assert.equal(toLocalInput('garbage'), '');
    assert.match(toLocalInput(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('isClientId accepts only positive integers up to 10 digits (anything else never reaches the API)', () => {
    for (const ok of ['1', '12', '2147483647', 7]) assert.ok(isClientId(ok), String(ok));
    for (const bad of ['0', '-1', '01', '1.5', 'abc', '', '12345678901', '1/2', undefined, null]) assert.ok(!isClientId(bad), String(bad));
});

// ---- translations --------------------------------------------------------------------------------------------------------------------------
test('every text the hub shows exists in BG, EN and HE (no key falls back to its own name)', () => {
    const page = read('../src/pages/ClientHub.jsx');
    const used = new Set([...page.matchAll(/\bt\('([a-z_0-9]+)'\)/g)].map(m => m[1]));
    for (const map of [KIND_KEYS, CONTACT_KEYS, STATUS_KEYS, TRACK_KEYS]) Object.values(map).forEach(k => used.add(k));
    ['overview', 'inquiries', 'timeline'].forEach(k => used.add(`hub_tab_${k}`));
    assert.ok(used.size > 50, 'the scan found the keys of the page');
    for (const lang of ['en', 'bg', 'he']) {
        const missing = [...used].filter(k => !translations[lang][k] || !String(translations[lang][k]).trim());
        assert.deepEqual(missing, [], `${lang} is missing translations`);
    }
    const hubKeys = lang => Object.keys(translations[lang]).filter(k => k.startsWith('hub_')).sort();
    assert.deepEqual(hubKeys('bg'), hubKeys('en')); assert.deepEqual(hubKeys('he'), hubKeys('en'));
    assert.deepEqual(KINDS.map(k => KIND_KEYS[k]).length, KINDS.length, 'every kind has a label key');
});

test('the Layout title is taken from the section, so /app/clients/12 is "Clients" and not the client id', () => {
    const layout = read('../src/components/Layout.jsx');
    assert.match(layout, /split\('\/'\)\.filter\(Boolean\)\[1\]/);
    assert.ok(!/\.pop\(\)/.test(layout));
});

// ---- right-to-left guard -------------------------------------------------------------------------------------------------------------------
test('hub.css and shell-mobile.css use logical properties only, so they mirror correctly in Hebrew (RTL)', () => {
    for (const file of ['hub.css', 'shell-mobile.css']) {
        const css = read(`../src/styles/${file}`).replace(/\/\*[\s\S]*?\*\//g, '');
        const physical = css.match(/(?:^|[;{\s])(?:margin|padding|border)-(?:left|right)\b|(?:^|[;{\s])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right)|(?:border-(?:top|bottom)-(?:left|right)-radius)/g);
        assert.equal(physical, null, `${file}: physical direction used: ${physical}`);
        assert.match(css, /margin-inline|padding-inline|inset-inline|border-inline|inline-size/, `${file}: the logical equivalents are really used`);
    }
});

test('the phone layout only changes the shell at <= 768px (desktop rules stay untouched)', () => {
    const css = read('../src/styles/shell-mobile.css').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    assert.match(css, /^@media \(max-width: 768px\) \{[\s\S]*\}$/, 'everything is inside the media query');
    assert.equal(css.match(/@media/g).length, 1);
});
