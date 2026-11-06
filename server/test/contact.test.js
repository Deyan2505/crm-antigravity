// Preferred contact channel: normalization of the real BG/EN/HE answers, no guessing, idempotent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContact, exactContact, CONTACT, CONTACT_LABELS } from '../contact.js';
import { parseArieSubmission } from '../tally.js';
import { PORTFOLIO_TEXT, portfolioPayload, learningPayload } from './fixtures.js';
import { ARIE_FORMS } from '../arieForms.js';

const OPTIONS = ['Email', 'Phone', 'WhatsApp', 'NoPreference']; // option order of all three Portfolio forms

for (const formId of ['q54MpG', 'rD5EDo', '9NBlNE']) {
    test(`Portfolio ${formId}: every contact option is stored as the same stable value`, () => {
        OPTIONS.forEach((expected, i) => {
            const payload = portfolioPayload(formId, `s${i}`, { contactIdx: i });
            const lead = parseArieSubmission(payload);
            assert.equal(lead.contactPref, expected, PORTFOLIO_TEXT[formId].contact[1][i]);
            assert.equal(lead.answers.some(a => a.value === PORTFOLIO_TEXT[formId].contact[1][i]), true); // original wording kept in details
        });
    });
}

test('Portfolio: an unanswered contact question is Unspecified, not Phone', () => {
    for (const formId of ['q54MpG', 'rD5EDo', '9NBlNE']) {
        const lead = parseArieSubmission(portfolioPayload(formId, 'x', { omit: [ARIE_FORMS[formId].q.contactPref] }));
        assert.equal(lead.contactPref, 'Unspecified');
        assert.equal(lead.phone, '+972500000000'); // the phone is there and still means nothing about the channel
    }
});

test('Learning forms have no contact question: Unspecified even though a phone was given', () => {
    for (const formId of ['rD5KzL', 'LD90Dy', 'zEjeEk']) {
        const lead = parseArieSubmission(learningPayload(formId, 'l-' + formId));
        assert.equal(lead.contactPref, 'Unspecified');
    }
});

test('normalizeContact: known labels, reworded labels, idempotent, never a guess', () => {
    for (const [label, v] of Object.entries(CONTACT_LABELS)) assert.equal(normalizeContact(label), v, label);
    assert.equal(normalizeContact('  Чрез   WhatsApp '), 'WhatsApp');
    assert.equal(normalizeContact('ב־WhatsApp'), 'WhatsApp');
    assert.equal(normalizeContact('Prefer e-mail please'), 'Email');   // reworded label still recognised
    for (const v of CONTACT) assert.equal(normalizeContact(v), v);       // already normalized values stay
    for (const nothing of ['', '   ', null, undefined, 'whatever', 'Phone or WhatsApp', 'По имейл или телефон']) {
        assert.equal(normalizeContact(nothing), 'Unspecified', String(nothing)); // empty / unknown / two channels named
    }
});

test('exactContact (used by the clean-up script) only knows exact answers, nothing fuzzy', () => {
    assert.equal(exactContact('Via WhatsApp'), 'WhatsApp');
    assert.equal(exactContact('по телефон'), 'Phone');
    assert.equal(exactContact('Prefer e-mail please'), null);
    assert.equal(exactContact(''), null);
    assert.equal(exactContact(null), null);
});

// ---- clean-up plan (the script's decision logic; the SQL part runs only with --apply and your approval)
import { plan } from '../scripts/normalize-contact.js';
test('clean-up plan: changes only exact known answers; empty stays empty; unknown and canonical stay', () => {
    const { changes, skipped } = plan([
        { id: 1, value: 'Чрез WhatsApp' }, { id: 2, value: 'Via WhatsApp' }, { id: 3, value: 'ב־WhatsApp' }, { id: 4, value: 'By phone' },
        { id: 5, value: null }, { id: 6, value: '' }, { id: 7, value: 'WhatsApp' }, { id: 8, value: 'Phone' },
        { id: 9, value: 'call me after 5' }, { id: 10, value: 'Prefer e-mail please' }
    ]);
    assert.deepEqual(changes.map(c => [c.id, c.to]), [[1, 'WhatsApp'], [2, 'WhatsApp'], [3, 'WhatsApp'], [4, 'Phone']]);
    assert.equal(skipped.empty, 2);
    assert.equal(skipped.alreadyNormalized, 2);
    assert.deepEqual(Object.keys(skipped.unrecognized), ['call me after 5', 'Prefer e-mail please']);
    assert.ok(!changes.some(c => c.to === 'Phone' && c.from !== 'By phone')); // never invents Phone
});
