import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Moon, Sun, Globe, Users, PlusCircle } from 'lucide-react';
import { API_URL, authHeaders } from '../utils/api';

const Settings = () => {
    const { t, language, setLanguage } = useLanguage();
    const [theme, setTheme] = useState(localStorage.getItem('crm_theme') || 'dark');
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showModal, setShowModal] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });

    useEffect(() => {
        document.body.className = theme === 'light' ? 'light-theme' : '';
        localStorage.setItem('crm_theme', theme);
    }, [theme]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_URL}/api/users`, {
                headers: authHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (e) {
            console.error('Fetch users error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });

            if (res.ok) {
                setShowModal(false);
                setNewUser({ name: '', email: '', password: '' });
                fetchUsers();
                alert('User added successfully');
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to add user');
            }
        } catch (error) {
            console.error('Add user error:', error);
            alert('Error adding user');
        }
    };

    return (
        <div className="page-container" style={{ maxWidth: '800px' }}>
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
                    <button
                        className="btn btn-primary btn-sm"
                        style={{ padding: '0.5rem 1rem' }}
                        onClick={() => setShowModal(true)}
                    >
                        <PlusCircle size={16} />
                        {t('add_user')}
                    </button>
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

            {/* Add User Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
                        <h3>{t('add_user')}</h3>
                        <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                            <input
                                type="text"
                                placeholder={t('name')}
                                value={newUser.name}
                                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                required
                                className="input-field"
                            />
                            <input
                                type="email"
                                placeholder={t('email')}
                                value={newUser.email}
                                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                required
                                className="input-field"
                            />
                            <input
                                type="password"
                                placeholder={t('password')}
                                value={newUser.password}
                                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                required
                                className="input-field"
                            />
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ flex: 1 }}>
                                    {t('cancel')}
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    {t('save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
