// PREVIEW ONLY (build-time flag __DEMO_PREVIEW__, vite.config.js): a stand-in for the CRM API so the owner can click through the new screens on a public Preview URL
// without any backend or database. Sample data lives in memory of this browser tab and is reset by a reload. It answers the same
// routes and response shapes as server/crm.js + server/hub.js, but it is a SIMULATION: nothing here proves database behaviour
// (that is covered by the PostgreSQL tests in server/test). All people, e-mails and phones are invented (.invalid addresses).

export const DEMO_USER = { id: 1, name: 'Demo Owner', email: 'demo-preview@example.invalid' };

const STATUSES = ['New', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost'];
const KINDS = ['note', 'call', 'email', 'whatsapp', 'meeting'];
const TEXT = ['email', 'phone', 'company', 'social_platform', 'preferred_contact', 'service_type', 'notes', 'lost_reason', 'country', 'next_action'];
const WHEN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const HOUR = 36e5;
const ago = h => new Date(Date.now() - h * HOUR).toISOString();
const day = off => new Date(Date.now() + off * 24 * HOUR).toISOString().slice(0, 10);
const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

// ---- sample data -----------------------------------------------------------------------------------------------------------------------
function seed() {
    let clientId = 1, leadId = 1, actId = 1;
    const clients = [], leads = [], activities = [];
    const client = (daysAgo, c) => {
        const row = { id: clientId++, name: '', email: '', phone: '', company: '', service_type: '', social_platform: '', preferred_contact: 'Unspecified', notes: '', lost_reason: null,
            meeting_date: null, deal_value: null, status: 'New', created_at: ago(daysAgo * 24), updated_at: ago(daysAgo * 24), tally_submission_id: null, source: null, price_range: '',
            lang: null, tally_form_id: null, track: null, project_type: '', country: null, next_action: null, next_action_due: null, ...c };
        clients.push(row);
        return row;
    };
    // an inquiry as the six-form webhook stores it: flat fields + details.answers (label/value, as the form sent them)
    const lead = (hoursAgo, clientIdOrNull, d, answers) => {
        const { timing, siteLang, role, materials, ...flat } = d; // as stored by the webhook: these four live only inside details
        leads.push({ id: leadId++, source: 'Tally', client_id: clientIdOrNull, created_at: ago(hoursAgo), data: { ...flat, details: { features: flat.service_type, timing, siteLang, role, materials, answers } } });
    };
    const act = (clientIdOf, kind, body, hoursAgo) => activities.push({ id: actId++, client_id: clientIdOf, kind, body, occurred_at: ago(hoursAgo), created_by: 1, created_at: ago(hoursAgo), updated_at: ago(hoursAgo) });
    const qa = pairs => pairs.map(([label, value]) => ({ label, value }));

    const maria = client(9, { name: 'Мария Иванова', company: 'Иванова ЕООД', email: 'maria.ivanova@example.invalid', phone: '+359 88 100 2001', preferred_contact: 'WhatsApp', status: 'Proposal',
        tally_submission_id: 'demo-sub-maria', source: 'Tally', lang: 'bg', tally_form_id: 'q54MpG', track: 'portfolio', project_type: 'AI чатбот', service_type: 'Връзка с WhatsApp, AI чатбот за посетителите',
        price_range: '€600 – €850', notes: 'Искаме чатбот за резервации в салон за красота.', country: 'BG', next_action: 'Изпращане на оферта за чатбот за резервации', next_action_due: day(-3) });
    const mariaCourse = client(7, { name: 'Мария Иванова', company: 'Иванова ЕООД', email: 'maria.ivanova@example.invalid', phone: '+359 88 100 2001', preferred_contact: 'Email', status: 'New',
        tally_submission_id: 'demo-sub-maria-course', source: 'Tally', lang: 'bg', tally_form_id: 'rD5KzL', track: 'learning', project_type: 'Математика за 7. клас', service_type: 'Тестове с автоматична проверка, Проследяване на напредъка',
        notes: 'Искам курс по математика с тестове.' });
    const jane = client(20, { name: 'Jane Doe', company: 'Doe Ltd', email: 'jane.doe@example.invalid', phone: '+972 50 100 2002', preferred_contact: 'Email', status: 'Meeting', meeting_date: new Date(Date.now() + 48 * HOUR).toISOString(),
        tally_submission_id: 'demo-sub-jane', source: 'Tally', lang: 'en', tally_form_id: 'LD90Dy', track: 'learning', project_type: 'Excel for beginners', service_type: 'Tests with automatic grading, AI tutor or assistant',
        notes: 'Self-paced Excel course with auto-graded tests.', country: 'IL', next_action: 'Demo call: course platform walkthrough', next_action_due: day(5) });
    const dana = client(35, { name: 'דנה כהן', company: 'כהן בע״מ', email: 'dana.cohen@example.invalid', phone: '+972 52 100 2003', preferred_contact: 'WhatsApp', status: 'New',
        tally_submission_id: 'demo-sub-dana', source: 'Tally', lang: 'he', tally_form_id: '9NBlNE', track: 'portfolio', project_type: 'צ׳אטבוט AI', service_type: 'חיבור ל־WhatsApp, צ׳אטבוט AI למבקרים באתר',
        price_range: '€600 – €850', notes: 'אנחנו צריכים צ׳אטבוט להזמנות.', country: 'IL', next_action: 'לשלוח הצעת מחיר', next_action_due: day(0) });
    const georgi = client(80, { name: 'Георги Димитров', company: 'Димитров Строй', email: 'georgi.dimitrov@example.invalid', phone: '+359 88 100 2004', preferred_contact: 'Phone', status: 'Won', deal_value: 1200,
        tally_submission_id: 'demo-sub-georgi', source: 'Tally', lang: 'bg', tally_form_id: 'q54MpG', track: 'portfolio', project_type: 'Бизнес уебсайт', service_type: 'Форма за запитвания и контакт, Галерия със снимки',
        price_range: '€900 – €1 300', notes: 'Сайт за строителна фирма с галерия на обектите.', country: 'BG' });
    const sarah = client(120, { name: 'Sarah Levi', company: 'Levi Studio', email: 'sarah.levi@example.invalid', phone: '+972 54 100 2005', preferred_contact: 'Email', status: 'Lost', lost_reason: 'Budget was too low for the requested online store.',
        tally_submission_id: 'demo-sub-sarah', source: 'Tally', lang: 'en', tally_form_id: 'rD5EDo', track: 'portfolio', project_type: 'Online store', service_type: 'Online bookings or appointments',
        price_range: '€1 500 – €2 500', notes: 'Online store for handmade ceramics.', country: 'IL' });
    const ivan = client(150, { name: 'Иван Петров', company: 'Петров и синове', email: 'ivan.petrov@example.invalid', phone: '+359 88 100 2006', preferred_contact: 'Phone', status: 'Contacted',
        service_type: 'Онлайн магазин', notes: 'Въведен ръчно след телефонно обаждане. Иска магазин за инструменти.', country: 'BG' });

    const bgPortfolio = (name, email, phone, company, project, features, notes, contact) => qa([['services', features], ['price_range', '€600 – €850'], ['lang', 'bg'],
        ['Какъв проект искате да реализирате?', project], ['Какви допълнителни възможности бихте искали за вашия сайт?', features], ['На какъв език искате да бъде вашият сайт?', 'Български'],
        ['Кога бихте искали да започнем работа по проекта?', 'До месец'], ['Има ли нещо друго, което бихте искали да ни разкажете за проекта си?', notes],
        ['Как да се обръщаме към вас?', name], ['На какъв имейл можем да се свържем с вас?', email], ['На какъв телефон можем да се свържем с вас?', phone],
        ['Как предпочитате да се свържем с вас?', contact], ['Как се казва вашата фирма или бизнес?', company]]);
    lead(216, null, { submission_id: 'demo-sub-maria', form_id: 'q54MpG', track: 'portfolio', lang: 'bg', name: maria.name, email: maria.email, phone: maria.phone, company: maria.company, project_type: maria.project_type,
        service_type: maria.service_type, price_range: maria.price_range, preferred_contact: 'WhatsApp', notes: maria.notes, timing: 'До месец', siteLang: 'Български' },
        bgPortfolio(maria.name, maria.email, maria.phone, maria.company, 'AI чатбот', maria.service_type, maria.notes, 'Чрез WhatsApp'));
    // Maria's second inquiry created its own profile (the webhook never merges); here it is linked to the first one explicitly
    lead(168, maria.id, { submission_id: 'demo-sub-maria-course', form_id: 'rD5KzL', track: 'learning', lang: 'bg', name: mariaCourse.name, email: mariaCourse.email, phone: mariaCourse.phone, project_type: mariaCourse.project_type,
        service_type: mariaCourse.service_type, preferred_contact: 'Email', notes: mariaCourse.notes, timing: 'След 2 месеца', role: 'Частен учител', materials: 'PDF и документи, Презентации' },
        qa([['Вие сте:', 'Частен учител'], ['Каква е темата на обучението?', 'Математика за 7. клас'], ['Какви учебни материали имате?', 'PDF и документи, Презентации'],
            ['Какви функционалности бихте искали?', mariaCourse.service_type], ['Кога бихте искали да започне проектът?', 'След 2 месеца'], ['Опишете накратко проекта си.', mariaCourse.notes],
            ['Име и фамилия', mariaCourse.name], ['Имейл адрес', mariaCourse.email], ['Телефон или WhatsApp', mariaCourse.phone]]));
    lead(480, null, { submission_id: 'demo-sub-jane', form_id: 'LD90Dy', track: 'learning', lang: 'en', name: jane.name, email: jane.email, phone: jane.phone, project_type: jane.project_type, service_type: jane.service_type,
        preferred_contact: 'Email', notes: jane.notes, timing: 'Next month', role: 'A company', materials: 'PDFs and documents' },
        qa([['You are:', 'A company'], ['What is the subject of the course?', 'Excel for beginners'], ['What learning materials do you have?', 'PDFs and documents'], ['Which features would you like?', jane.service_type],
            ['When would you like the project to start?', 'Next month'], ['Briefly describe your project.', jane.notes], ['Full name', jane.name], ['Email address', jane.email], ['Phone or WhatsApp', jane.phone]]));
    lead(840, null, { submission_id: 'demo-sub-dana', form_id: '9NBlNE', track: 'portfolio', lang: 'he', name: dana.name, email: dana.email, phone: dana.phone, company: dana.company, project_type: dana.project_type, service_type: dana.service_type,
        price_range: dana.price_range, preferred_contact: 'WhatsApp', notes: dana.notes, timing: 'בחודש הקרוב', siteLang: 'עברית' },
        qa([['services', dana.service_type], ['price_range', '€600 – €850'], ['lang', 'he'], ['איזה פרויקט תרצו לממש?', 'צ׳אטבוט AI'], ['אילו אפשרויות נוספות תרצו באתר שלכם?', dana.service_type], ['באיזו שפה תרצו שהאתר יהיה?', 'עברית'],
            ['מתי תרצו שנתחיל לעבוד על הפרויקט?', 'בחודש הקרוב'], ['יש עוד משהו שתרצו לספר לנו על הפרויקט שלכם?', dana.notes], ['איך לפנות אליכם?', dana.name], ['לאיזו כתובת אימייל נוכל לפנות אליכם?', dana.email],
            ['לאיזה מספר טלפון נוכל לפנות אליכם?', dana.phone], ['איך תעדיפו שניצור איתכם קשר?', 'ב־WhatsApp'], ['מה שם החברה או העסק שלכם?', dana.company]]));
    lead(1920, null, { submission_id: 'demo-sub-georgi', form_id: 'q54MpG', track: 'portfolio', lang: 'bg', name: georgi.name, email: georgi.email, phone: georgi.phone, company: georgi.company, project_type: georgi.project_type,
        service_type: georgi.service_type, price_range: georgi.price_range, preferred_contact: 'Phone', notes: georgi.notes, timing: 'Веднага', siteLang: 'Български' },
        bgPortfolio(georgi.name, georgi.email, georgi.phone, georgi.company, 'Бизнес уебсайт', georgi.service_type, georgi.notes, 'По телефон'));
    lead(2880, null, { submission_id: 'demo-sub-sarah', form_id: 'rD5EDo', track: 'portfolio', lang: 'en', name: sarah.name, email: sarah.email, phone: sarah.phone, company: sarah.company, project_type: sarah.project_type,
        service_type: sarah.service_type, price_range: sarah.price_range, preferred_contact: 'Email', notes: sarah.notes, timing: 'In 2-3 months', siteLang: 'English' },
        qa([['What kind of project would you like to create?', 'Online store'], ['What additional features would you like for your website?', sarah.service_type], ['In which language would you like your website to be?', 'English'],
            ['When would you like us to start working on the project?', 'In 2-3 months'], ['Is there anything else you would like to tell us about your project?', sarah.notes], ['How should we address you?', sarah.name],
            ['What email address can we use to contact you?', sarah.email], ['How would you prefer us to contact you?', 'By email']]));
    // an old flat inquiry that nobody linked: listed under Leads, shown in no client's dossier
    leads.push({ id: leadId++, source: 'Tally', client_id: null, created_at: ago(3500), data: { name: 'Петър Стоянов', email: 'petar.stoyanov@example.invalid', phone: '+359 88 100 2007', notes: 'Стар запис от формата, още несвързан с клиент.' } });

    act(maria.id, 'note', 'Дошла от калкулатора на сайта. Иска чатбот за резервации в салон.', 200);
    act(maria.id, 'call', 'Първи разговор (12 мин.): салон за красота, 3 служители, сега приемат записвания по Viber. Бюджет около 700 EUR.', 150);
    act(maria.id, 'whatsapp', 'Изпратих 2 примера за чатбот за резервации. Каза, че ще ги покаже на съдружничката си.', 100);
    act(maria.id, 'email', 'Изпратено кратко описание на обхвата и срок за изработка (3 седмици). Чакам отговор.', 52);
    act(maria.id, 'meeting', 'Видео среща: уточнихме функционалностите - онлайн запис, напомняне по SMS, WhatsApp бутон.', 20);
    act(jane.id, 'call', 'Intro call: wants an Excel-for-beginners course with auto-graded tests.', 30);
    act(jane.id, 'note', 'Has PDFs and slides ready, no video yet. Demo scheduled.', 29);
    act(dana.id, 'whatsapp', 'ענתה בווטסאפ - מעוניינת בצ׳אטבוט להזמנות.', 8);
    act(georgi.id, 'call', 'Обсъдихме структурата на сайта: начало, услуги, галерия, контакти.', 1700);
    act(georgi.id, 'email', 'Изпратена оферта 1 200 EUR. Приета.', 1500);
    act(georgi.id, 'meeting', 'Среща при клиента: снимки на обектите и логото.', 1300);
    act(ivan.id, 'note', 'Иска магазин за инструменти (около 200 артикула). Да се обадя след седмица.', 3000);
    return { clients, leads, activities, next: { client: clientId, lead: leadId, act: actId } };
}

let db = null, latency = 120;
export const resetDemo = (ms = 120) => { db = null; latency = ms; };
const state = () => db || (db = seed());

// ---- validation (same rules as server/crm.js and server/hub.js) -------------------------------------------------------------------------
function parseClient(b, create) {
    b = b && typeof b === 'object' ? b : {};
    const v = {};
    if (b.name !== undefined || create) { if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'name is required' }; v.name = b.name.trim(); }
    for (const k of TEXT) {
        if (b[k] === undefined) continue;
        if (b[k] !== null && typeof b[k] !== 'string') return { error: `${k} must be text` };
        v[k] = b[k] === null || b[k].trim() === '' ? null : b[k];
    }
    if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return { error: `status must be one of: ${STATUSES.join(', ')}` }; v.status = b.status; } else if (create) v.status = 'New';
    if (b.deal_value !== undefined) {
        if (b.deal_value === null || b.deal_value === '') v.deal_value = null;
        else { const n = Number(String(b.deal_value).trim().replace(',', '.')); if (!Number.isFinite(n) || n < 0) return { error: 'deal_value must be a number' }; v.deal_value = n; }
    }
    if (b.meeting_date !== undefined) {
        if (b.meeting_date === null || b.meeting_date === '') v.meeting_date = null;
        else if (typeof b.meeting_date === 'string' && !Number.isNaN(Date.parse(b.meeting_date))) v.meeting_date = new Date(b.meeting_date).toISOString();
        else return { error: 'meeting_date must be a date' };
    }
    if (b.next_action_due !== undefined) {
        if (b.next_action_due === null || b.next_action_due === '') v.next_action_due = null;
        else if (isDay(b.next_action_due)) v.next_action_due = b.next_action_due;
        else return { error: 'next_action_due must be a date (YYYY-MM-DD)' };
    }
    return { values: v };
}
function parseActivity(b, create) {
    b = b && typeof b === 'object' ? b : {};
    const v = {};
    if (b.kind !== undefined || create) { const kind = b.kind === undefined ? 'note' : b.kind; if (!KINDS.includes(kind)) return { error: `kind must be one of: ${KINDS.join(', ')}` }; v.kind = kind; }
    if (b.body !== undefined || create) {
        if (typeof b.body !== 'string' || !b.body.trim()) return { error: 'text is required' };
        if (b.body.length > 5000) return { error: 'text is too long (max 5000 characters)' };
        v.body = b.body.trim();
    }
    if (b.occurred_at !== undefined) {
        const s = b.occurred_at;
        if (typeof s !== 'string' || !WHEN.test(s) || !isDay(s.slice(0, 10)) || Number.isNaN(Date.parse(s))) return { error: 'occurred_at must be a date' };
        v.occurred_at = new Date(s).toISOString();
    }
    return { values: v };
}

// ---- the API ---------------------------------------------------------------------------------------------------------------------------
// a copy, like a response that crossed the network: callers can never mutate the demo state by holding on to what they got
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });
const bad = error => reply(400, { error, code: 'VALIDATION' });
const missing = what => reply(404, { error: `${what} not found`, code: 'NOT_FOUND' });
const idOf = s => (/^[1-9]\d{0,9}$/.test(s) ? Number(s) : null);
const byNewest = (a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : b.id - a.id);

// Same link rule as the server: explicit client_id, else the exact Tally submission id (never e-mail / phone).
const inquiriesOf = (s, c) => s.leads.filter(l => l.client_id === c.id || (l.client_id === null && c.tally_submission_id && l.data.submission_id === c.tally_submission_id))
    .map(l => ({ id: l.id, source: l.source, created_at: l.created_at, link: l.client_id === null ? 'submission' : 'explicit', data: l.data }))
    .sort(byNewest);

export async function demoFetch(url, init = {}) {
    if (latency) await new Promise(r => setTimeout(r, latency));
    const s = state();
    const { pathname: p, searchParams } = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    let body;
    try { body = init.body ? JSON.parse(init.body) : undefined; } catch { return bad('invalid JSON'); }
    let m;

    if (method === 'GET' && p === '/api/clients') {
        const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit')) || 50));
        const rows = [...s.clients].sort(byNewest);
        return reply(200, { data: rows.slice(0, limit), total: rows.length, page: 1, limit });
    }
    if (method === 'POST' && p === '/api/clients') {
        const { values, error } = parseClient(body, true);
        if (error) return bad(error);
        const now = new Date().toISOString();
        const row = { id: s.next.client++, name: '', email: null, phone: null, company: null, service_type: null, social_platform: null, preferred_contact: null, notes: null, lost_reason: null, meeting_date: null,
            deal_value: null, status: 'New', created_at: now, updated_at: now, tally_submission_id: null, source: null, price_range: null, lang: null, tally_form_id: null, track: null, project_type: null,
            country: null, next_action: null, next_action_due: null, ...values };
        s.clients.push(row);
        return reply(201, row);
    }
    if ((m = p.match(/^\/api\/clients\/(\d+)$/))) {
        const id = idOf(m[1]);
        const c = id && s.clients.find(x => x.id === id);
        if (method === 'PUT') {
            if (!id) return bad('invalid id');
            const { values, error } = parseClient(body, false);
            if (error) return bad(error);
            if (!Object.keys(values).length) return bad('nothing to update');
            if (!c) return missing('Client');
            Object.assign(c, values, { updated_at: new Date().toISOString() });
            return reply(200, { message: 'Client updated successfully', id: c.id, client: c });
        }
        if (method === 'DELETE') {
            if (!id) return bad('invalid id');
            if (!c) return missing('Client');
            if (c.tally_submission_id) return reply(409, { error: 'Clients created from Tally forms cannot be deleted yet (archive comes next)', code: 'ARCHIVE_REQUIRED' });
            if (s.activities.some(a => a.client_id === id)) return reply(409, { error: 'This client has communication history and cannot be deleted', code: 'HAS_HISTORY' });
            s.clients.splice(s.clients.indexOf(c), 1);
            return reply(200, { message: 'Client deleted successfully', id });
        }
    }
    if (method === 'GET' && (m = p.match(/^\/api\/clients\/(\d+)\/hub$/))) {
        const id = idOf(m[1]);
        if (!id) return bad('invalid id');
        const c = s.clients.find(x => x.id === id);
        if (!c) return missing('Client');
        const activities = s.activities.filter(a => a.client_id === id).sort((a, b) => (b.occurred_at > a.occurred_at ? 1 : b.occurred_at < a.occurred_at ? -1 : b.id - a.id));
        const contacts = activities.filter(a => a.kind !== 'note');
        return reply(200, { client: c, inquiries: inquiriesOf(s, c), activities, last_contact_at: contacts.length ? contacts[0].occurred_at : null, capabilities: { activities: true, inquiryLink: true, profileFields: true } });
    }
    if (method === 'POST' && (m = p.match(/^\/api\/clients\/(\d+)\/activities$/))) {
        const id = idOf(m[1]);
        if (!id) return bad('invalid id');
        const { values, error } = parseActivity(body, true);
        if (error) return bad(error);
        if (!s.clients.some(x => x.id === id)) return missing('Client');
        const now = new Date().toISOString();
        const row = { id: s.next.act++, client_id: id, occurred_at: now, created_by: DEMO_USER.id, created_at: now, updated_at: now, ...values };
        s.activities.push(row);
        return reply(201, row);
    }
    if (method === 'PUT' && (m = p.match(/^\/api\/clients\/(\d+)\/activities\/(\d+)$/))) {
        const id = idOf(m[1]), aid = idOf(m[2]);
        if (!id || !aid) return bad('invalid id');
        const { values, error } = parseActivity(body, false);
        if (error) return bad(error);
        if (!Object.keys(values).length) return bad('nothing to update');
        const a = s.activities.find(x => x.id === aid && x.client_id === id); // an entry is only reachable through its own client
        if (!a) return missing('Activity');
        Object.assign(a, values, { updated_at: new Date().toISOString() });
        return reply(200, a);
    }
    if (method === 'GET' && p === '/api/leads') return reply(200, [...s.leads].sort(byNewest));
    if (method === 'GET' && p === '/api/users') return reply(200, [{ ...DEMO_USER, created_at: ago(24 * 200) }]);
    if (method === 'GET' && p === '/api/dashboard/stats') {
        const cutoff = Date.now() - 30 * 24 * HOUR;
        return reply(200, { totalClients: s.clients.length, totalLeads: s.leads.length, newClients: s.clients.filter(c => c.status === 'New').length, meetingsCount: s.clients.filter(c => c.meeting_date && Date.parse(c.meeting_date) > cutoff).length });
    }
    if (method === 'GET' && p === '/api/dashboard/monthly-stats') {
        const months = [];
        for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleString('en', { month: 'short' }) }); }
        return reply(200, { labels: months.map(x => x.label), counts: months.map(x => s.clients.filter(c => { const d = new Date(c.created_at); return d.getFullYear() === x.y && d.getMonth() === x.m; }).length) });
    }
    return reply(404, { error: 'Not found', code: 'NOT_FOUND' });
}
