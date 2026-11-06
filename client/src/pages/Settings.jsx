import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Moon, Sun, Globe, Users } from 'lucide-react';
import ErrorBanner from '../components/ErrorBanner';
import { apiFetch } from '../utils/api';

const Settings = () => {
    const { t, language, setLanguage } = useLanguage();
    const [theme, setTheme] = useState(localStorage.getItem('crm_theme') || 'dark');
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        document.body.className = theme === 'light' ? 'light-theme' : '';
        localStorage.setItem('crm_theme', theme);
    }, [theme]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const list = await apiFetch('/api/users');
            setUsers(Array.isArray(list) ? list : []);
            setError(null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container" style={{ maxWidth: '800px' }}>
            <ErrorBanner error={error} onClose={() => setError(null)} />
            {/* Appearance Section */}
            <section className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <Sun size={20} className="text-accent" />
                    <h3 style={{ margin: 0 }}>{t('appearance')}</h3>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => setTheme('light')}
                    >
                        <Sun size={18} />
                        {t('theme_light')}
                    </button>
                    <button
                        className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => setTheme('dark')}
                    >
                        <Moon size={18} />
                        {t('theme_dark')}
                    </button>
                </div>
            </section>

            {/* Language Section */}
            <section className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <Globe size={20} className="text-accent" />
                    <h3 style={{ margin: 0 }}>{t('language')}</h3>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['bg', 'en', 'he'].map(lang => (
                        <button
                            key={lang}
                            className={`btn ${language === lang ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setLanguage(lang)}
                            style={{ minWidth: '80px', justifyContent: 'center', textTransform: 'uppercase' }}
                        >
                            {lang}
                        </button>
                    ))}
                </div>
            </section>

            {/* User Management Section */}
            <section className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Users size={20} className="text-accent" />
                        <h3 style={{ margin: 0 }}>{t('user_management')}</h3>
                    </div>
                </div>

                <div className="table-container" style={{ background: 'var(--bg-primary)' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('name')}</th>
                                <th>{t('email')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td>{u.name}</td>
                                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

        </div>
    );
};

export default Settings;
