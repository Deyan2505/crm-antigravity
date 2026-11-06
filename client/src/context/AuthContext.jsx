import React, { createContext, useState, useContext, useEffect } from 'react';
import { API_URL, setUnauthorizedHandler } from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (storedUser && token) {
            try { setUser(JSON.parse(storedUser)); } catch { localStorage.removeItem('user'); localStorage.removeItem('token'); }
        }
        setLoading(false);
    }, []);

    // Any 401 from the API (expired or invalid token) signs the user out; ProtectedRoute then shows /login.
    useEffect(() => {
        setUnauthorizedHandler(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
        });
    }, []);

    const login = async (email, password) => {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            setUser(data.user);
            return { success: true };
        } else {
            const error = await response.json();
            return { success: false, error: error.error };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
