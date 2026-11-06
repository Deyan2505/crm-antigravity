// The one place that talks to the CRM API. No import.meta here so it can be tested with plain node.
// Contract: resolves only for a 2xx response with a JSON body; everything else throws an ApiError, so a caller can
// never show "saved" for something the server did not confirm.
//   status 0 = no connection · 400 validation · 401 signed out/expired · 403 forbidden · 404 not found · 5xx server
export class ApiError extends Error {
    constructor(status, code, message) {
        super(message || `HTTP ${status}`);
        this.name = 'ApiError';
        this.status = status;
        this.code = code || '';
    }
}

// Translation key for the message the user sees (the server's own text is only shown for 400, where it names the field).
export const errorKey = err => ({ 0: 'err_network', 400: 'err_validation', 401: 'err_session', 403: 'err_forbidden', 404: 'err_not_found' }[err && err.status] || 'err_server');

export function createApi({ baseUrl, getToken, onUnauthorized = () => {}, fetchImpl = (...a) => fetch(...a) }) {
    return async function apiFetch(path, { method = 'GET', body } = {}) {
        let res;
        try {
            res = await fetchImpl(baseUrl + path, {
                method,
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        } catch {
            throw new ApiError(0, 'NETWORK');
        }
        let data = null;
        try { data = await res.json(); } catch { /* not JSON */ }
        if (res.ok) {
            if (data === null) throw new ApiError(res.status, 'BAD_RESPONSE'); // 2xx without JSON (proxy/error page): not a confirmed save
            return data;
        }
        if (res.status === 401) onUnauthorized();
        throw new ApiError(res.status, data && data.code, data && data.error);
    };
}
