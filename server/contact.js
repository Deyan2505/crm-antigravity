// Preferred contact channel: one stable value per channel, whatever language the client answered in.
//   Phone | Email | WhatsApp | NoPreference | Unspecified (no answer: Learning forms have no such question, or it was left empty)
// The client's own words stay in leads.data.details.answers; only these five values go into clients.preferred_contact.
export const CONTACT = ['Phone', 'Email', 'WhatsApp', 'NoPreference', 'Unspecified'];

// The exact answers of the three Portfolio forms (BG / EN / HE). Old rows hold these texts verbatim, so the one-off
// clean-up (scripts/normalize-contact.js) touches ONLY values in this table.
export const CONTACT_LABELS = {
    'по имейл': 'Email', 'по телефон': 'Phone', 'чрез whatsapp': 'WhatsApp', 'нямам предпочитания': 'NoPreference',
    'by email': 'Email', 'by phone': 'Phone', 'via whatsapp': 'WhatsApp', 'no preference': 'NoPreference',
    'באימייל': 'Email', 'בטלפון': 'Phone', 'ב־whatsapp': 'WhatsApp', 'ב-whatsapp': 'WhatsApp', 'אין לי העדפה': 'NoPreference'
};
const key = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

// Exact known answer (or an already normalized value) -> channel; anything else -> null.
export function exactContact(text) {
    const k = key(text);
    return CONTACT_LABELS[k] || CONTACT.find(c => c.toLowerCase() === k) || null;
}

const WORDS = {
    NoPreference: /няма(м)? предпочитани|no preference|nopreference|אין לי העדפה/,
    WhatsApp: /whats\s?app|уотсап|ватсап|וואטסאפ|ווטסאפ/,
    Email: /e-?mail|имейл|емейл|אימייל|מייל/,
    Phone: /phone|телефон|טלפון/
};

// Parser use: tolerant of reworded labels. Empty, unrecognised or ambiguous (two channels named) -> 'Unspecified',
// never a guess and never "Phone" just because a phone number was given.
export function normalizeContact(text) {
    const exact = exactContact(text);
    if (exact) return exact;
    const k = key(text);
    if (!k) return 'Unspecified';
    const hits = Object.keys(WORDS).filter(c => WORDS[c].test(k));
    return hits.length === 1 ? hits[0] : 'Unspecified';
}
