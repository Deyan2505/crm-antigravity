import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, LogIn, ArrowRight } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showWakeUpMessage, setShowWakeUpMessage] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        setShowWakeUpMessage(false);

        // Show wake-up message if request takes more than 2 seconds
        const wakeUpTimer = setTimeout(() => {
            setShowWakeUpMessage(true);
        }, 2000);

        try {
            const result = await login(email, password);
            if (result.success) {
                navigate('/app');
            } else {
                setError(result.error || 'Login failed');
            }
        } catch (err) {
            setError('Could not connect to server. Please try again.');
        } finally {
            clearTimeout(wakeUpTimer);
            setIsLoading(false);
            setShowWakeUpMessage(false);
        }
    };

    return (
        <div className="auth-container">
            {/* Animated Background Shapes */}
            <div className="auth-bg-shape shape-1" />
            <div className="auth-bg-shape shape-2" />
            <div className="auth-bg-shape shape-3" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="glass-card"
            >
                <div>
                    <h2 className="auth-title">Welcome Back</h2>
                    <p className="auth-subtitle">
                        Enter your credentials to access your workspace
                    </p>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Mail className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="glass-input block w-full pl-11 px-4 rounded-xl focus:outline-none placeholder-gray-500"
                            placeholder="Email address"
                        />
                    </div>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="glass-input block w-full pl-11 px-4 rounded-xl focus:outline-none placeholder-gray-500"
                            placeholder="Password"
                        />
                    </div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center"
                        >
                            {error}
                        </motion.div>
                    )}

                    {showWakeUpMessage && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs text-center animate-pulse"
                        >
                            🚀 Сървърът се събужда... Моля изчакайте (до 30 сек).
                        </motion.div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="glass-button flex items-center justify-center gap-2 group"
                    >
                        {isLoading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                Sign In
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-sm text-gray-400">
                        Don't have an account?{' '}
                        <Link to="/signup" className="glass-link">
                            Create free account
                        </Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;
