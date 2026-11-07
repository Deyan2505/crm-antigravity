// Pure helpers for the Client Hub page (no React, no fetch, no import.meta) so they can be tested with plain node.

export const KINDS = ['note', 'call', 'email', 'whatsapp', 'meeting'];
export const KIND_KEYS = { note: 'hub_kind_note', call: 'hub_kind_call', email: 'hub_kind_email', whatsapp: 'hub_kind_whatsapp', meeting: 'hub_kind_meeting' };
export const CONTACT_KEYS = { Phone: 'contact_method_phone', Email: 'contact_method_email', WhatsApp: 'contact_method_whatsapp', NoPreference: 'contact_method_none', Unspecified: 'contact_method_unspecified' };
export const STATUS_KEYS = { New: 'status_new', Contacted: 'status_contacted', Meeting: 'status_meeting', Proposal: 'status_proposal', Won: 'status_won', Lost: 'status_lost' };
export const TRACK_KEYS = { portfolio: 'hub_track_portfolio', learning: 'hub_track_learning' };

const LOCALES = { bg: 'bg-BG', en: 'en-GB', he: 'he-IL' };
const pad = n => String(n).padStart(2, '0');
const text = v => (v === null || v === undefined ? '' : String(v).trim());
const firstText = (...values) => values.map(text).find(Boolean) || '';

export const isClientId = s => /^[1-9]\d{0,9}$/.test(String(s));

// ---- dates -----------------------------------------------------------------------------------------------------------------------------
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// next_action_due is a plain 'YYYY-MM-DD' (a calendar day, no time zone). The day string compares correctly as text.
export const nextActionState = (due, today = todayStr()) => (!due ? 'none' : due < today ? 'overdue' : due === today ? 'today' : 'upcoming');

// A 'YYYY-MM-DD' day is formatted from its parts, never through UTC, so it can not show the previous day.
export function formatDay(day, lang) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(day));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(LOCALES[lang] || 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
export function formatDateTime(value, lang) {
    const d = new Date(value);
    return !value || Number.isNaN(d.getTime()) ? '' : d.toLocaleString(LOCALES[lang] || 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// <input type="datetime-local"> works in local time with no zone; the API takes an ISO instant.
export function toLocalInput(value = new Date()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value) {
    const d = new Date(value);
    return value && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

// ---- inquiries -------------------------------------------------------------------------------------------------------------------------
// The original answers of one inquiry exactly as the form sent them: [{ label, value }]. The six ARIE forms keep them in
// data.details.answers; older / legacy-webhook leads are flat objects, shown field by field. Nothing is translated or reworded.
export function answersOf(data) {
    const d = data && typeof data === 'object' ? data : {};
    const list = (d.details && d.details.answers) || d.answers;
    if (Array.isArray(list)) return list.filter(a => a && text(a.value)).map(a => ({ label: text(a.label), value: text(a.value) }));
    return Object.entries(d).filter(([, v]) => (typeof v === 'string' || typeof v === 'number') && text(v)).map(([label, value]) => ({ label, value: text(value) }));
}

export function inquiryFacts(inq) {
    const d = (inq && inq.data) || {};
    const det = d.details || {};
    return {
        id: inq.id, createdAt: inq.created_at, link: inq.link,
        source: firstText(inq.source, d.source), lang: firstText(d.lang, det.lang), track: firstText(d.track, det.track),
        projectType: firstText(d.project_type, det.projectType, det.project_type), formId: firstText(d.form_id, det.formId), submissionId: firstText(d.submission_id, det.submissionId)
    };
}

// ---- projects & requirements -----------------------------------------------------------------------------------------------------------
// One project per linked inquiry, each from that inquiry's OWN stored data: a client can have a Portfolio and a Learning inquiry and their
// details must never be mixed. A client without inquiries (entered by hand) gets one project from its own columns.
// An empty string means "not recorded": the page shows "Not specified", never a guess.
const factsOf = d => {
    const det = d.details || {};
    return {
        track: firstText(d.track, det.track), projectType: firstText(d.project_type, det.projectType), description: text(d.notes),
        features: firstText(det.features, d.service_type), budget: text(d.price_range), timing: text(det.timing),
        siteLang: text(det.siteLang), role: text(det.role), materials: text(det.materials)
    };
};
export function projectsOf(client, inquiries = []) {
    if (!inquiries.length) {
        return [{ key: 'client', createdAt: '', ...factsOf({ track: client.track, project_type: client.project_type, notes: client.notes, service_type: client.service_type, price_range: client.price_range }) }];
    }
    return inquiries.map(inq => ({ key: `inquiry-${inq.id}`, createdAt: inq.created_at, ...factsOf((inq && inq.data) || {}) }));
}

// The client's own (editable) notes. When the client has inquiries, a note identical to an inquiry's description is already shown there.
export function profileNotes(client, inquiries = []) {
    const own = text(client.notes);
    if (!inquiries.length) return ''; // shown as the description of the client's own project instead
    return inquiries.some(i => text(i && i.data && i.data.notes) === own) ? '' : own;
}
