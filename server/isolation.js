// Isolation guard of the PREVIEW backend (PREVIEW_ISOLATED=1), the throwaway test server used to review a feature branch.
// Production never sets this variable, and then nothing in here has any effect.
//
// The preview talks to its own empty test database and must not be able to touch the real world, so it is blocked explicitly rather than by
// the absence of keys: (1) both Tally webhook routes answer 403 before any parsing; (2) it refuses to start if anything that could send mail,
// call Make.com or verify Tally signatures is configured, or if public registration is open; (3) CORS admits only the origins in CORS_ORIGIN
// (not the production frontend).
export const WEBHOOK_PREFIX = '/api/webhook'; // covers /api/webhook (legacy) and /api/webhook/arie-tally (and anything below)

// Names only, never values. A preview server that has any of these is refused.
export const FORBIDDEN_ENV = [
    'TALLY_SIGNING_SECRET', 'ARIE_TALLY_SIGNING_SECRET', 'ARIE_TALLY_SIGNING_SECRETS', 'ARIE_TALLY_FIELD_KEYS',
    'MAKE_CRM_WEBHOOK_URL', 'EMAIL_USER', 'EMAIL_PASS', 'OWNER_NOTIFY_EMAIL'
];

export const isIsolated = (env = process.env) => env.PREVIEW_ISOLATED === '1';

export function isolationProblems(env = process.env) {
    if (!isIsolated(env)) return [];
    const problems = FORBIDDEN_ENV.filter(k => env[k]).map(k => `${k} must not be set in the preview`);
    if (env.ALLOW_REGISTRATION === 'true') problems.push('ALLOW_REGISTRATION must not be "true" in the preview');
    if (!env.CORS_ORIGIN) problems.push('CORS_ORIGIN must list the preview frontend (the production frontend is not admitted)');
    return problems;
}

// Express middleware mounted on WEBHOOK_PREFIX: nothing below it is ever reached.
export const blockWebhooks = (req, res) => res.status(403).json({ error: 'Disabled in the preview environment', code: 'PREVIEW_DISABLED' });

// Origins a preview backend admits: exactly the configured ones.
export const previewOrigins = (env = process.env) => (env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
