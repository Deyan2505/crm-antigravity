import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientHub from './pages/ClientHub';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import Leads from './pages/Leads';
import Settings from './pages/Settings';
import Landing from './pages/Landing';

function App() {
    return (
        <AuthProvider>
            <LanguageProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        {/* preview: there is no sign-in (no credentials are ever typed into a preview), the app opens directly */}
                        <Route path="/login" element={__DEMO_PREVIEW__ ? <Navigate to="/app" replace /> : <Login />} />
                        {/* public registration is closed: the old sign-up address (and the landing page buttons that point to it) lead to the sign-in page */}
                        <Route path="/signup" element={<Navigate to="/login" replace />} />

                        <Route path="/app" element={
                            <ProtectedRoute>
                                <Layout />
                            </ProtectedRoute>
                        }>
                            <Route index element={<Dashboard />} />
                            <Route path="clients" element={<Clients />} />
                            <Route path="clients/:id" element={<ClientHub />} />
                            <Route path="leads" element={<Leads />} />
                            <Route path="settings" element={<Settings />} />
                            <Route path="*" element={<h2>Not Found</h2>} />
                        </Route>
                    </Routes>
                </BrowserRouter>
            </LanguageProvider>
        </AuthProvider>
    );
}

export default App;
