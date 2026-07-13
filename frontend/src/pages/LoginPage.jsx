import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Mail, Lock, Loader2, Zap, Eye, EyeOff } from 'lucide-react';
import logo from '../Logo/repuestos-logo.jpeg';
import './LoginPage.css';

const LoginPage = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Remember user: load saved email from localStorage on mount
    const [rememberUser, setRememberUser] = useState(() => {
        return !!localStorage.getItem('rememberedUser');
    });

    useEffect(() => {
        const savedEmail = localStorage.getItem('rememberedUser');
        const savedPassword = localStorage.getItem('rememberedPass');
        if (savedEmail) {
            setEmail(savedEmail);
        }
        if (savedPassword) {
            setPassword(savedPassword);
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const result = await login(email, password);
        if (result.success) {
            // Remember user: save or clear credentials in localStorage
            if (rememberUser) {
                localStorage.setItem('rememberedUser', email);
                localStorage.setItem('rememberedPass', password);
            } else {
                localStorage.removeItem('rememberedUser');
                localStorage.removeItem('rememberedPass');
            }
            navigate('/', { replace: true });
        } else {
            setError(result.message);
            setLoading(false);
        }
    };

    return (
        <div className="login-wrapper">
            <div className="login-card premium-card glow-blue">
                <div className="login-header">
                    <img src={logo} alt="Chat Repuestos Logo" className="login-logo-img" />
                    <p>Login Administrativo</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="input-field">
                        <Mail size={18} />
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-field">
                        <Lock size={18} />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Contraseña"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    {error && <p className="error-msg">{error}</p>}

                    {/* Remember user checkbox */}
                    <div className="remember-user">
                        <input
                            type="checkbox"
                            id="rememberUser"
                            checked={rememberUser}
                            onChange={(e) => setRememberUser(e.target.checked)}
                        />
                        <label htmlFor="rememberUser">Recordar usuario</label>
                    </div>

                    <button type="submit" className="login-btn" disabled={loading}>
                        {loading ? <Loader2 className="spin" /> : 'Ingresar'}
                    </button>
                </form>

                <div className="login-footer">
                    <span className="version">Chat Repuestos v1.0</span>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
