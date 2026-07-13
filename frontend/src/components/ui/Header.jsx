import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, QrCode, BrainCircuit, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import logo from '../../Logo/repuestos-logo.jpeg';
import './Header.css';

const Header = () => {
    const { logout } = useAuth();

    return (
        <header className="top-header">
            <div className="header-logo-mobile">
                <img src={logo} alt="Chat Repuestos" className="header-logo-img" />
            </div>

            {/* Visual cyber status badges - desktop only */}
            <div className="header-cyber-badges">
                <span className="cyber-badge system-online">
                    <span className="cyber-badge-dot"></span>
                    System Online
                </span>
                <span className="cyber-badge ai-active">
                    <span className="cyber-badge-dot"></span>
                    AI Active
                </span>
            </div>

            <nav className="header-nav">
                <NavLink to="/" className={({ isActive }) => `header-nav-item ${isActive ? 'active' : ''}`} end>
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                </NavLink>

                <NavLink to="/whatsapp" className={({ isActive }) => `header-nav-item ${isActive ? 'active' : ''}`}>
                    <QrCode size={18} />
                    <span>WhatsApp</span>
                </NavLink>

                <NavLink to="/ai-providers" className={({ isActive }) => `header-nav-item ${isActive ? 'active' : ''}`}>
                    <BrainCircuit size={18} />
                    <span>IA Providers</span>
                </NavLink>
            </nav>

            <button className="logout-btn" onClick={logout} title="Cerrar Sesión">
                <LogOut size={20} />
                <span className="logout-text">Salir</span>
            </button>
        </header>

    );
};

export default Header;
