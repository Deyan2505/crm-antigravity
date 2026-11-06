// One-off clean-up of already stored preferred-contact texts ("Чрез WhatsApp", "Via WhatsApp", "ב־WhatsApp", ...)
// to the stable values Phone | Email | WhatsApp | NoPreference.
//
//   DATABASE_URL=... node scripts/normalize-contact.js            DRY RUN (default): reads, prints counts, writes nothing
//   DATABASE_URL=... node scripts/normalize-contact.js --apply    writes, in ONE transaction, after you approved the dry run
//
// Safety: only values that exactly equal one of the six known form answers (see contact.js) are changed. Empty values stay
// empty (never Phone), unknown/manual texts stay as they are, and only clients.preferred_contact and
// leads.data.preferred_contact are touched: no other column, no updated_at. Output has counts and ids, no personal data.
import pg from 'pg';
import { pathToFileURL } from 'url';
import { exactContact } from '../contact.js';

// rows: [{ id, value }] -> what would change and what is left alone
export function plan(rows) {
    const changes = [], skipped = { empty: 0, alreadyNormalized: 0, unrecognized: {} };
    for (const { id, value } of rows) {
        if (value == null || String(value).trim() === '') { skipped.empty++; continue; }
        const to = exactContact(value);
        if (!to) { const k = String(value).slice(0, 40); skipped.unrecognized[k] = (skipped.unrecognized[k] || 0) + 1; continue; }
        if (to === value) { skipped.alreadyNormalized++; continue; }
        changes.push({ id, from: value, to });
    }
    return { changes, skipped };
}

const leadValue = data => { try { const v = JSON.parse(data).preferred_contact; return typeof v === 'string' ? v : null; } catch { return null; } };
const summary = (label, { changes, skipped }) => {
    const groups = {};
    for (const c of changes) groups[`${c.from} -> ${c.to}`] = (groups[`${c.from} -> ${c.to}`] || 0) + 1;
    console.log(`\n${label}: ${changes.length} to change, ${skipped.alreadyNormalized} already normalized, ${skipped.empty} empty (left empty)`);
    for (const [k, n] of Object.entries(groups)) console.log(`  ${n} x ${k}`);
    for (const [k, n] of Object.entries(skipped.unrecognized)) console.log(`  ${n} x "${k}" not a known form answer: left untouched`);
    if (changes.length) console.log(`  ids: ${changes.map(c => c.id).join(', ')}`);
};

async function main() {
    if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL in this shell first (it is not read from any file).'); process.exit(1); }
    const apply = process.argv.includes('--apply');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const clients = plan((await db.query('SELECT id, preferred_contact AS value FROM clients ORDER BY id')).rows);
        const leadRows = (await db.query('SELECT id, data FROM leads ORDER BY id')).rows;
        const leads = plan(leadRows.map(r => ({ id: r.id, value: leadValue(r.data) })));
        summary('clients.preferred_contact', clients);
        summary('leads.data.preferred_contact', leads);

        if (!apply) { await db.query('ROLLBACK'); console.log('\nDRY RUN: nothing was written. Re-run with --apply to write.'); return; }
        for (const c of clients.changes) {
            await db.query('UPDATE clients SET preferred_contact = $1 WHERE id = $2 AND preferred_contact = $3', [c.to, c.id, c.from]);
        }
        const byId = new Map(leadRows.map(r => [r.id, r.data]));
        for (const c of leads.changes) {
            const obj = JSON.parse(byId.get(c.id));
            obj.preferred_contact = c.to;
            await db.query('UPDATE leads SET data = $1 WHERE id = $2 AND data = $3', [JSON.stringify(obj), c.id, byId.get(c.id)]);
        }
        await db.query('COMMIT');
        console.log(`\nAPPLIED: ${clients.changes.length} clients, ${leads.changes.length} leads.`);
    } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('Failed, nothing written:', err.code || err.name);
        process.exitCode = 1;
    } finally { db.release(); await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
