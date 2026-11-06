import { createApi } from './apiCore';

export const API_URL = import.meta.env.VITE_API_URL || 'https://crm-server-w6ye.onrender.com';

let unauthorizedHandler = () => {};
// AuthContext registers its logout here: any 401 signs the user out and ProtectedRoute sends them to /login.
export const setUnauthorizedHandler = fn => { unauthorizedHandler = fn; };

export const apiFetch = createApi({
    baseUrl: API_URL,
    getToken: () => localStorage.getItem('token'),
    onUnauthorized: () => unauthorizedHandler()
});
