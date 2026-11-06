// CRM API helpers and the clients/leads routes (kept out of index.js so they can be tested without a database server).
// Contract for every route here: a success status is sent only after the database confirmed the row.
//   400 invalid input · 401 no/expired/invalid token · 404 no such row · 409 not allowed for this row · 500 database/server (no internals leaked)
import express from 'express';
import jwt from 'jsonwebtoken';

export const STATUSES = ['New', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost'];

// Generic 500: the log gets the error class/code, the client never gets database messages.
export const fail = (res, err, where) => {
    console.error(`${where} failed:`, (err && (err.code || err.name)) || 'error');
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
};

// Bearer JWT. Missing, invalid or expired -> 401 (the browser then signs the user out); 403 is not used for tokens.
export const makeAuth = secret => (req, res, next) => {
    const header = req.headers['authorization'];
    const token = header && header.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    jwt.verify(token, secret, { algorithms: ['HS256'] }, (err, user) => {
        if (err) return res.status(401).json({ error: err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token', code: 'AUTH_INVALID' });
        req.user = user;
        next();
    });
};

const TEXT = ['email', 'phone', 'company', 'social_platform', 'preferred_contact', 'service_type', 'notes', 'lost_reason'];

// Body -> { values: {column: value} } or { error }. Only keys present in the body are returned, so an update never
// touches what it did not mention; '' clears a field (NULL). `name` is required on create and never empty.
export function parseClient(body, { create = false } = {}) {
    const b = body && typeof body === 'object' ? body : {};
    const values = {};
    if (b.name !== undefined || create) {
        if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'name is required' };
        values.name = b.name.trim();
    }
    for (const k of TEXT) {
        if (b[k] === undefined) continue;
        if (b[k] !== null && typeof b[k] !== 'string') return { error: `${k} must be text` };
        values[k] = b[k] === null || b[k].trim() === '' ? null : b[k];
    }
    if (b.status !== undefined) {
        if (!STATUSES.includes(b.status)) return { error: `status must be one of: ${STATUSES.join(', ')}` };
        values.status = b.status;
    } else if (create) values.status = 'New';
    if (b.deal_value !== undefined) {
        if (b.deal_value === null || b.deal_value === '') values.deal_value = null;
        else {
            const n = typeof b.deal_value === 'number' ? b.deal_value : Number(String(b.deal_value).trim().replace(',', '.'));
            if (!Number.isFinite(n) || n < 0) return { error: 'deal_value must be a number' };
            values.deal_value = n;
        }
    }
    if (b.meeting_date !== undefined) {
        if (b.meeting_date === null || b.meeting_date === '') values.meeting_date = null;
        else if (typeof b.meeting_date === 'string' && !Number.isNaN(Date.parse(b.meeting_date))) values.meeting_date = b.meeting_date;
        else return { error: 'meeting_date must be a date' };
    }
    return { values };
}

const validId = s => /^[1-9]\d{0,9}$/.test(String(s));
const pageOf = q => {
    const page = Math.max(1, parseInt(q.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(q.limit) || 50));
    return { page, limit, offset: (page - 1) * limit };
};

export function clientsRouter({ pool, auth, onCreated = () => {} }) {
    const r = express.Router();
    r.use(auth);

    r.get('/', async (req, res) => {
        try {
            const { page, limit, offset } = pageOf(req.query);
            const rows = await pool.query('SELECT * FROM clients ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
            const total = await pool.query('SELECT COUNT(*) as count FROM clients');
            res.json({ data: rows.rows, total: Number(total.rows[0].count), page, limit });
        } catch (err) { fail(res, err, 'GET /api/clients'); }
    });

    r.post('/', async (req, res) => {
        const { values, error } = parseClient(req.body, { create: true });
        if (error) return res.status(400).json({ error, code: 'VALIDATION' });
        const cols = Object.keys(values);
        try {
            const result = await pool.query(
                `INSERT INTO clients (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`,
                cols.map(c => values[c])
            );
            const client = result.rows[0];
            res.status(201).json(client);
            onCreated(client);
        } catch (err) { fail(res, err, 'POST /api/clients'); }
    });

    r.put('/:id', async (req, res) => {
        if (!validId(req.params.id)) return res.status(400).json({ error: 'invalid id', code: 'VALIDATION' });
        const { values, error } = parseClient(req.body);
        if (error) return res.status(400).json({ error, code: 'VALIDATION' });
        const cols = Object.keys(values);
        if (!cols.length) return res.status(400).json({ error: 'nothing to update', code: 'VALIDATION' });
        try {
            const result = await pool.query(
                `UPDATE clients SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = NOW() WHERE id = $${cols.length + 1} RETURNING *`,
                [...cols.map(c => values[c]), req.params.id]
            );
            if (result.rowCount === 0) return res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND' });
            res.json({ message: 'Client updated successfully', id: result.rows[0].id, client: result.rows[0] });
        } catch (err) { fail(res, err, 'PUT /api/clients/:id'); }
    });

    // A client that came from a Tally form keeps its row: deleting it would drop the key that stops the same submission
    // being imported again. They stay until the archive feature (Stage 2) replaces physical deletion.
    r.delete('/:id', async (req, res) => {
        if (!validId(req.params.id)) return res.status(400).json({ error: 'invalid id', code: 'VALIDATION' });
        try {
            const del = await pool.query('DELETE FROM clients WHERE id = $1 AND tally_submission_id IS NULL RETURNING id', [req.params.id]);
            if (del.rowCount === 1) return res.json({ message: 'Client deleted successfully', id: del.rows[0].id });
            const exists = await pool.query('SELECT 1 FROM clients WHERE id = $1', [req.params.id]);
            if (exists.rowCount === 0) return res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND' });
            res.status(409).json({ error: 'Clients created from Tally forms cannot be deleted yet (archive comes next)', code: 'ARCHIVE_REQUIRED' });
        } catch (err) { fail(res, err, 'DELETE /api/clients/:id'); }
    });
    return r;
}

// leads.data is TEXT with JSON: one unreadable row must not take the whole list down.
export const parseLeadData = text => { try { return JSON.parse(text); } catch { return null; } };

export function leadsRouter({ pool, auth }) {
    const r = express.Router();
    r.use(auth);
    r.get('/', async (req, res) => {
        try {
            const { limit, offset } = pageOf(req.query);
            const rows = await pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
            res.json(rows.rows.map(l => ({ ...l, data: parseLeadData(l.data) ?? {} })));
        } catch (err) { fail(res, err, 'GET /api/leads'); }
    });
    return r;
}
