export const API_URL = import.meta.env.VITE_API_URL || 'https://crm-server-w6ye.onrender.com';

export const authHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
});
