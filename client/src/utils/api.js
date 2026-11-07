import { createApi } from './apiCore';
import { demoFetch } from './demoApi';

// Preview builds (see vite.config.js) never talk to a real API: the address cannot resolve (.invalid) and every call is answered by demoApi.js.
// __DEMO_PREVIEW__ is replaced by the literal true/false at build time, right here, so the bundler can drop the demo code in production.
export const API_URL = __DEMO_PREVIEW__ ? 'https://demo.invalid' : (import.meta.env.VITE_API_URL || 'https://crm-server-w6ye.onrender.com');

let unauthorizedHandler = () => {};
// AuthContext registers its logout here: any 401 signs the user out and ProtectedRoute sends them to /login.
export const setUnauthorizedHandler = fn => { unauthorizedHandler = fn; };

export const apiFetch = createApi({
    baseUrl: API_URL,
    getToken: () => localStorage.getItem('token'),
    onUnauthorized: () => unauthorizedHandler(),
    ...(__DEMO_PREVIEW__ ? { fetchImpl: demoFetch } : {})
});
