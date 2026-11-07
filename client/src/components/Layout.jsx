import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LogOut, User } from 'lucide-react';

const routeTitleKey = {
    app: 'dashboard',
    clients: 'clients',
    leads: 'leads',
    settings: 'settings',
};

const Layout = () => {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();

    // /app, /app/clients, /app/clients/12 ... : the section is the segment after "app" (the last one would be the client id)
    const titleKey = routeTitleKey[location.pathname.split('/').filter(Boolean)[1]] || 'dashboard';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {__DEMO_PREVIEW__ && <div className="demo-banner" role="status">{t('demo_banner')}</div>}
                <header className="top-header">
                    <h2 className="page-title">{t(titleKey)}</h2>
                    <div className="header-actions">
                        <div className="user-profile">
                            <User size={18} className="text-gray-400" />
                            <span className="user-name">{user?.name}</span>
                        </div>
                        <button className="btn-logout" onClick={handleLogout} title="Logout">
                            <LogOut size={18} />
                        </button>
                    </div>
                </header>
                <div className="content-scroll">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
