import { verifyTallySignature, parseArieSubmission, signingSecretFor } from './tally.js';

export const ARIE_PATH = '/api/webhook/arie-tally';

// express.json `verify` hook: the Tally signature covers the exact raw bytes.
export const saveRawBody = (req, _res, buf) => {
    if (req.originalUrl === ARIE_PATH) req.rawBody = buf;
};

// Signed Tally webhook for the six ARIE forms (Portfolio BG/EN/HE, Learning BG/EN/HE), one Tally webhook per form.
// Each form may have its own signing secret (ARIE_TALLY_SIGNING_SECRETS, a JSON map formId -> secret); forms without
// one use the shared ARIE_TALLY_SIGNING_SECRET. Nothing is stored without a valid signature.
// `notify` runs only for a newly committed lead, never for duplicates.
export function makeArieTallyHandler({ pool, notify }) {
    return async (req, res) => {
        // The form id only selects which secret to check; the signature then proves the whole body, form id included.
        const formId = req.body && req.body.data && req.body.data.formId;
        const secret = signingSecretFor(formId);
        if (!secret) {
            console.error('ARIE webhook rejected: no signing secret configured');
            return res.status(503).json({ status: 'error' });
        }
        if (!verifyTallySignature(req.rawBody, req.headers['tally-signature'], secret)) {
            return res.status(401).json({ status: 'error' });
        }

        let fieldKeys = {};
        try { fieldKeys = JSON.parse(process.env.ARIE_TALLY_FIELD_KEYS || '{}'); } catch { /* ponytail: bad JSON = label fallback (forms outside arieForms.js only) */ }
        const lead = parseArieSubmission(req.body, fieldKeys);
        if (!lead) return res.status(400).json({ status: 'error' });
        // No PII in logs: only ids and role names.
        if (lead.missing.length) console.warn(`ARIE webhook ${lead.formId}: question ids not in payload (form changed?): ${lead.missing.join(', ')}`);

        const db = await pool.connect().catch(() => null);
        if (!db) return res.status(500).json({ status: 'error' });
        try {
            await db.query('BEGIN');
            const inserted = await db.query(
                `INSERT INTO clients (name, email, phone, company, status, notes, service_type, price_range, lang, source, tally_submission_id,
                                      tally_form_id, track, project_type, preferred_contact)
                 VALUES ($1, $2, $3, $4, 'New', $5, $6, $7, $8, 'Tally', $9, $10, $11, $12, $13)
                 ON CONFLICT (tally_submission_id) DO NOTHING
                 RETURNING id`,
                [lead.name, lead.email, lead.phone, lead.company, lead.notes, lead.services, lead.price_range, lead.lang, lead.submissionId,
                 lead.formId, lead.track, lead.projectType, lead.contactPref]
            );
            if (inserted.rowCount === 0) {
                await db.query('ROLLBACK');
                console.log(`ARIE webhook duplicate ignored: ${lead.submissionId}`);
                return res.status(200).json({ status: 'duplicate' });
            }
            const { missing, ...stored } = lead;
            await db.query('INSERT INTO leads (source, data) VALUES ($1, $2)', [
                'Tally',
                JSON.stringify({
                    submission_id: lead.submissionId, form_id: lead.formId, track: lead.track, name: lead.name, email: lead.email,
                    phone: lead.phone, company: lead.company, project_type: lead.projectType, service_type: lead.services,
                    price_range: lead.price_range, lang: lead.lang, preferred_contact: lead.contactPref, notes: lead.notes,
                    details: stored
                })
            ]);
            await db.query('COMMIT');
        } catch (err) {
            await db.query('ROLLBACK').catch(() => {});
            console.error('ARIE webhook error:', err.code || err.name);
            return res.status(500).json({ status: 'error' });
        } finally {
            db.release();
        }

        console.log(`ARIE webhook lead stored: ${lead.submissionId} (${lead.formId}, ${lead.track})`);
        res.status(200).json({ status: 'success' });
        // Separate action after commit; a mail failure must not affect the stored lead or the response.
        Promise.resolve().then(() => notify(lead)).catch(err => console.error('Owner notification failed:', err.code || err.name));
    };
}
