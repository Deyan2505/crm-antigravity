import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendWelcomeEmail } from './services/email.js';
import { notifyOwner } from './services/notify.js';
import { ARIE_PATH, saveRawBody, makeArieTallyHandler } from './arieWebhook.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { makeAuth, fail, clientsRouter, leadsRouter } from './crm.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
    console.warn('⚠️  WARNING: JWT_SECRET is not set in .env. Using insecure default — set a strong secret in production!');
}
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-antigravity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const PRODUCTION_FRONTEND = 'https://crm-antigravity-nine.vercel.app';
const allowedOrigins = [
    'http://localhost:5173', 'http://localhost:4173', PRODUCTION_FRONTEND,
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean) : [])
];

app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin))
}));
app.use(express.json({ verify: saveRawBody }));

// Rate limiting for auth routes (10 attempts per 15 min per IP)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

// ==========================================
// PostgreSQL Database Setup
// ==========================================
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});



async function initializeDB() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      service_type TEXT,
      social_platform TEXT,
      preferred_contact TEXT,
      notes TEXT,
      lost_reason TEXT,
      meeting_date TIMESTAMP,
      deal_value REAL,
      status TEXT DEFAULT 'New',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      source TEXT,
      data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
    CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
    CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

    console.log('PostgreSQL database connected and initialized');
}

initializeDB().catch(err => {
    console.error('Database initialization failed:', err);
});

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'CRM Server is running' });
});

// Authentication Routes
app.post('/api/auth/register', authLimiter, async (req, res) => {
    // Closed by default: every user can read ALL clients/leads (no per-user scoping). Set ALLOW_REGISTRATION=true to reopen.
    if (process.env.ALLOW_REGISTRATION !== 'true') {
        return res.status(403).json({ error: 'Registration is closed' });
    }
    const { name, email, password } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
            [name.trim(), email.toLowerCase().trim(), hashedPassword]
        );
        res.status(201).json({ message: 'User registered successfully', userId: result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        fail(res, err, 'POST /api/auth/register');
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (err) {
        fail(res, err, 'POST /api/auth/login');
    }
});

// Auth middleware and the clients/leads routes live in crm.js
const authenticateToken = makeAuth(JWT_SECRET);

app.use('/api/clients', clientsRouter({
    pool,
    auth: authenticateToken,
    // Trigger Make.com Webhook for manual entries (only if configured)
    onCreated: client => {
        const MAKE_WEBHOOK_URL = process.env.MAKE_CRM_WEBHOOK_URL;
        if (!MAKE_WEBHOOK_URL) return;
        fetch(MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'CRM_Manual', ...client })
        }).catch(e => console.error('Make.com Webhook failed:', e.message));
    }
}));
app.use('/api/leads', leadsRouter({ pool, auth: authenticateToken }));

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, created_at FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        fail(res, err, '/api/users');
    }
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const totalClients = await pool.query('SELECT COUNT(*) as count FROM clients');
        const totalLeads = await pool.query('SELECT COUNT(*) as count FROM leads');
        const newClients = await pool.query("SELECT COUNT(*) as count FROM clients WHERE status = 'New'");

        const meetings = await pool.query("SELECT meeting_date FROM clients WHERE meeting_date IS NOT NULL AND meeting_date > NOW() - INTERVAL '30 days'");

        res.json({
            totalClients: parseInt(totalClients.rows[0].count),
            totalLeads: parseInt(totalLeads.rows[0].count),
            newClients: parseInt(newClients.rows[0].count),
            meetingsCount: meetings.rows.length
        });
    } catch (err) {
        fail(res, err, '/api/dashboard/stats');
    }
});

app.get('/api/dashboard/monthly-stats', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as label,
                COUNT(*) as count
            FROM clients
            WHERE created_at >= NOW() - INTERVAL '6 months'
            GROUP BY DATE_TRUNC('month', created_at), label
            ORDER BY DATE_TRUNC('month', created_at)
        `);

        res.json({
            labels: result.rows.map(r => r.label),
            counts: result.rows.map(r => parseInt(r.count))
        });
    } catch (err) {
        fail(res, err, '/api/dashboard/monthly-stats');
    }
});

// Webhook for Tally Forms
app.post('/api/webhook', async (req, res) => {
    // Tally webhook signature verification
    const TALLY_SECRET = process.env.TALLY_SIGNING_SECRET;
    if (TALLY_SECRET) {
        const signature = req.headers['tally-signature'];
        if (!signature) {
            return res.status(401).json({ status: 'error', error: 'Missing signature' });
        }
        const rawBody = JSON.stringify(req.body);
        const expected = crypto.createHmac('sha256', TALLY_SECRET).update(rawBody).digest('hex');
        if (signature !== expected) {
            return res.status(401).json({ status: 'error', error: 'Invalid signature' });
        }
    }

    console.log('--- Webhook Received ---');
    console.log('Timestamp:', new Date().toISOString());
    console.log('RAW BODY:', JSON.stringify(req.body, null, 2));

    try {
        const body = req.body;
        const { data } = body;

        let clientData = {
            name: 'Unknown',
            email: '',
            company: '',
            phone: '',
            status: 'New'
        };

        if (data && data.fields) {
            // Native Tally webhook format
            data.fields.forEach(field => {
                const label = field.label || field.key || '';
                let value = field.value;

                // Multiple choice fields return array — take first item's text
                if (Array.isArray(value)) {
                    value = value.map(v => v.text || v).join(', ');
                }
                if (!value) return;

                if (label.includes('Име на Клиента') || label === 'Name') {
                    clientData.name = value;
                } else if (clientData.name === 'Unknown' && (label.includes('Name') || label.includes('Име'))) {
                    clientData.name = value;
                }
                if (label.includes('E-mail') || label.includes('Email') || label.includes('Поща') || label.includes('e-mail')) clientData.email = value;
                if (label.includes('Компания') || label.includes('Организация') || label.includes('Company') || label.includes('Фирма')) clientData.company = value;
                if (label.includes('Телефон') || label.includes('Phone')) clientData.phone = value;
                if (label.includes('списък с опции') || label.includes('Услуга') || label.includes('Service')) clientData.service_type = value;
                if (label.includes('Разкажи') || label.includes('повече') || label.includes('Note') || label.includes('Message') || label.includes('Описание') || label.includes('Бележк')) clientData.notes = value;
            });
        } else {
            // Flat format (Make.com HTTP module sends parsed fields directly)
            clientData.name = body.name || body['Име на Клиента'] || body.Name || 'Unknown';
            clientData.email = body.email || body['E-mail'] || body.Email || '';
            clientData.phone = body.phone || body['Телефон'] || body.Phone || '';
            clientData.company = body.company || body['Име на Компания / Организация'] || body.Company || '';
            clientData.service_type = body.service_type || body['Кратък списък с опции'] || '';
            clientData.notes = body.notes || body['Разкажи ми малко повече'] || '';
        }

        // Save to Database
        const result = await pool.query(
            'INSERT INTO clients (name, email, phone, company, status, notes, service_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [clientData.name, clientData.email, clientData.phone, clientData.company, clientData.status, clientData.notes, clientData.service_type]
        );

        // Save structured data to leads table
        await pool.query(
            'INSERT INTO leads (source, data) VALUES ($1, $2)',
            ['Tally', JSON.stringify({
                name: clientData.name,
                email: clientData.email,
                phone: clientData.phone,
                company: clientData.company,
                service_type: clientData.service_type,
                notes: clientData.notes
            })]
        );

        console.log(`New lead created from Webhook: ${clientData.name}`);

        if (clientData.email) {
            console.log(`Attempting to send email to ${clientData.email}...`);
            const serviceType = clientData.notes && clientData.notes.length < 50 ? clientData.notes : 'Professional Services';
            sendWelcomeEmail(clientData.email, clientData.name, serviceType).catch(err => console.error('Email fail:', err));
        }

        res.status(200).json({ status: 'success', id: result.rows[0].id });

    } catch (err) {
        console.error('Webhook Error:', err);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Signed, deduplicated Tally webhook for the ARIE form (separate from the legacy /api/webhook above)
app.post(ARIE_PATH, makeArieTallyHandler({ pool, notify: notifyOwner }));

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
