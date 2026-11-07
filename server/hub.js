// Client Hub 360: the whole dossier of one client in a single read, plus the hand-entered communication history.
//   GET  /api/clients/:id/hub                  profile + linked inquiries (original Tally answers) + history + what the DB supports
//   POST /api/clients/:id/activities           add a note / call / e-mail / WhatsApp / meeting (entered by hand, never synced)
//   PUT  /api/clients/:id/activities/:aid      edit one of this client's entries
// Same contract as crm.js: a success status only after the database confirmed the row; 400 input · 401 token · 404 no such row ·
// 409 MIGRATION_REQUIRED (migrations/003_client_hub.sql not applied yet) · 500 generic. Nothing here writes to leads or to Tally data.
import express from 'express';
import pg from 'pg';
import { fail, validId, isDay, parseLeadData } from './crm.js';

// DATE columns (clients.next_action_due) must reach the browser as 'YYYY-MM-DD', not as a JS Date that shifts with the server's time zone.
pg.types.setTypeParser(1082, v => v);

export const KINDS = ['note', 'call', 'email', 'whatsapp', 'meeting'];
export const MAX_BODY = 5000;

const WHEN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

// Body -> { values } or { error }. Only keys present in the body are returned (an edit never touches what it did not mention).
export function parseActivity(body, { create = false } = {}) {
    const b = body && typeof body === 'object' ? body : {};
    const values = {};
    if (b.kind !== undefined || create) {
        const kind = b.kind === undefined ? 'note' : b.kind;
        if (!KINDS.includes(kind)) return { error: `kind must be one of: ${KINDS.join(', ')}` };
        values.kind = kind;
    }
    if (b.body !== undefined || create) {
        if (typeof b.body !== 'string' || !b.body.trim()) return { error: 'text is required' };
        if (b.body.length > MAX_BODY) return { error: `text is too long (max ${MAX_BODY} characters)` };
        values.body = b.body.trim();
    }
    if (b.occurred_at !== undefined) {
        const s = b.occurred_at;
        if (typeof s !== 'string' || !WHEN.test(s) || !isDay(s.slice(0, 10)) || Number.isNaN(Date.parse(s))) return { error: 'occurred_at must be a date' };
        values.occurred_at = s;
    }
    return { values };
}

// What the connected database can do. Read on every hub request (one cheap query), so the hub keeps working, read-only,
// before migration 003 is applied and starts offering the new parts the moment it is.
const SCHEMA_SQL = `SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND (table_name = 'client_activities'
       OR (table_name = 'leads' AND column_name = 'client_id')
       OR (table_name = 'clients' AND column_name IN ('country', 'next_action', 'next_action_due')))`;
export const capabilitiesOf = rows => ({
    activities: rows.some(r => r.table_name === 'client_activities'),
    inquiryLink: rows.some(r => r.table_name === 'leads' && r.column_name === 'client_id'),
    profileFields: ['country', 'next_action', 'next_action_due'].every(c => rows.some(r => r.table_name === 'clients' && r.column_name === c))
});

// An inquiry belongs to a client only by (1) its explicit leads.client_id, or, when that is empty, (2) the exact Tally submission id
// the client row was created from. Never by e-mail, phone or name: two profiles are never merged automatically.
const SUBMISSION = `substring(l.data from '"submission_id":"([^"]+)"')`;
const ORDER = 'ORDER BY l.created_at DESC, l.id DESC LIMIT 100';
const LEADS_BY_SUBMISSION = `SELECT l.id, l.source, l.data, l.created_at, 'submission' AS link FROM leads l WHERE ${SUBMISSION} = $1 ${ORDER}`;
const LEADS_LINKED = `SELECT l.id, l.source, l.data, l.created_at, CASE WHEN l.client_id IS NULL THEN 'submission' ELSE 'explicit' END AS link
    FROM leads l WHERE l.client_id = $1 OR (l.client_id IS NULL AND ${SUBMISSION} = $2) ${ORDER}`;

const notMigrated = err => err && (err.code === '42P01' || err.code === '42703');
const dbFail = (res, err, where) => notMigrated(err)
    ? res.status(409).json({ error: 'Database migration 003 has not been applied yet', code: 'MIGRATION_REQUIRED' })
    : fail(res, err, where);
const bad = (res, error) => res.status(400).json({ error, code: 'VALIDATION' });
const notFound = (res, what) => res.status(404).json({ error: `${what} not found`, code: 'NOT_FOUND' });

export function hubRouter({ pool, auth }) {
    const r = express.Router();
    r.use(auth);

    r.get('/:id/hub', async (req, res) => {
        if (!validId(req.params.id)) return bad(res, 'invalid id');
        try {
            const found = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
            if (found.rowCount === 0) return notFound(res, 'Client');
            const client = found.rows[0];
            const capabilities = capabilitiesOf((await pool.query(SCHEMA_SQL)).rows);

            const leads = capabilities.inquiryLink
                ? await pool.query(LEADS_LINKED, [client.id, client.tally_submission_id ?? null])
                : await pool.query(LEADS_BY_SUBMISSION, [client.tally_submission_id ?? null]);
            // leads.data is TEXT with JSON, returned exactly as stored; one unreadable row is listed with empty data, never hidden.
            const inquiries = leads.rows.map(l => ({ id: l.id, source: l.source, created_at: l.created_at, link: l.link, data: parseLeadData(l.data) ?? {} }));

            let activities = [], last_contact_at = null;
            if (capabilities.activities) {
                activities = (await pool.query('SELECT * FROM client_activities WHERE client_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 500', [client.id])).rows;
                // "last contact" = last call / e-mail / WhatsApp / meeting; a private note is not a contact
                last_contact_at = (await pool.query("SELECT MAX(occurred_at) AS at FROM client_activities WHERE client_id = $1 AND kind <> 'note'", [client.id])).rows[0]?.at ?? null;
            }
            res.json({ client, inquiries, activities, last_contact_at, capabilities });
        } catch (err) { fail(res, err, 'GET /api/clients/:id/hub'); }
    });

    r.post('/:id/activities', async (req, res) => {
        if (!validId(req.params.id)) return bad(res, 'invalid id');
        const { values, error } = parseActivity(req.body, { create: true });
        if (error) return bad(res, error);
        const userId = req.user && Number.isInteger(req.user.userId) ? req.user.userId : null;
        const cols = [...Object.keys(values), 'client_id', 'created_by'];
        try {
            const result = await pool.query(
                `INSERT INTO client_activities (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`,
                [...Object.values(values), req.params.id, userId]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            if (err && err.code === '23503') return notFound(res, 'Client'); // foreign key: no such client
            dbFail(res, err, 'POST /api/clients/:id/activities');
        }
    });

    r.put('/:id/activities/:aid', async (req, res) => {
        if (!validId(req.params.id) || !validId(req.params.aid)) return bad(res, 'invalid id');
        const { values, error } = parseActivity(req.body);
        if (error) return bad(res, error);
        const cols = Object.keys(values);
        if (!cols.length) return bad(res, 'nothing to update');
        try {
            // client_id in the WHERE: an entry can only be edited through the client it belongs to
            const result = await pool.query(
                `UPDATE client_activities SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = NOW() WHERE id = $${cols.length + 1} AND client_id = $${cols.length + 2} RETURNING *`,
                [...Object.values(values), req.params.aid, req.params.id]
            );
            if (result.rowCount === 0) return notFound(res, 'Activity');
            res.json(result.rows[0]);
        } catch (err) { dbFail(res, err, 'PUT /api/clients/:id/activities/:aid'); }
    });

    return r;
}
