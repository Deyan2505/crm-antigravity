import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Login from './components/Login';
import Signup from './components/Signup';
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
                        <Route path="/login" element={<Login />} />
                        <Route path="/signup" element={<Signup />} />

                        <Route path="/app" element={
                            <ProtectedRoute>
                                <Layout />
                            </ProtectedRoute>
                        }>
                            <Route index element={<Dashboard />} />
                            <Route path="clients" element={<Clients />} />
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
