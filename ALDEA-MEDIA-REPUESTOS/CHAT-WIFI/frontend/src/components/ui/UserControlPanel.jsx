import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import {
    Power, Clock, Users, Search, RefreshCw,
    RotateCcw, CheckCircle, AlertCircle, UserCheck
} from 'lucide-react';

const UserControlPanel = () => {
    // ── Users state ─────────────────────────────────────────────────────
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [togglingUser, setTogglingUser] = useState(null);
    const [toast, setToast] = useState(null);

    // ── Load users on mount + auto-refresh every 10s ─────────────────
    useEffect(() => {
        loadUsers();
        const interval = setInterval(loadUsers, 10000);
        return () => clearInterval(interval);
    }, []);

    const loadUsers = useCallback(async () => {
        try {
            setUsersLoading(true);
            const { data } = await api.get('/api/welcome-automation/users');
            setUsers(data.data || []);
        } catch (err) {
            console.error('Error loading users:', err);
        } finally {
            setUsersLoading(false);
        }
    }, []);

    // ── Toast helper ────────────────────────────────────────────────────
    const showToast = (type, msg) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Per-user actions ────────────────────────────────────────────────
    const toggleUserAI = async (jid, currentVal) => {
        const key = `${jid}:ai`;
        setTogglingUser(key);
        try {
            await api.put(`/api/welcome-automation/users/${encodeURIComponent(jid)}/ai`, {
                enabled: !currentVal
            });
            setUsers(prev => prev.map(u =>
                u.jid === jid ? { ...u, aiEnabled: !currentVal } : u
            ));
            showToast('success', `IA ${!currentVal ? 'activada' : 'desactivada'} para ${jid.replace('@s.whatsapp.net', '')}`);
        } catch {
            showToast('error', 'Error al cambiar estado IA');
        } finally {
            setTogglingUser(null);
        }
    };

    const toggleUserCooldown = async (jid, currentVal) => {
        const key = `${jid}:cooldown`;
        setTogglingUser(key);
        try {
            await api.put(`/api/welcome-automation/users/${encodeURIComponent(jid)}/cooldown`, {
                enabled: !currentVal
            });
            setUsers(prev => prev.map(u =>
                u.jid === jid ? { ...u, cooldownEnabled: !currentVal } : u
            ));
            showToast('success', `Cooldown ${!currentVal ? 'activado' : 'desactivado'} para ${jid.replace('@s.whatsapp.net', '')}`);
        } catch {
            showToast('error', 'Error al cambiar cooldown');
        } finally {
            setTogglingUser(null);
        }
    };

    const resetUserCooldown = async (jid) => {
        const key = `${jid}:reset`;
        setTogglingUser(key);
        try {
            await api.post('/api/welcome-automation/reset-user', { jid });
            setUsers(prev => prev.map(u =>
                u.jid === jid ? { ...u, cooldownStatus: 'expired', lastWelcomeSentAt: null, aiEnabled: true } : u
            ));
            showToast('success', `Reset exitoso para ${jid.replace('@s.whatsapp.net', '')}`);
        } catch {
            showToast('error', 'Error al resetear cooldown');
        } finally {
            setTogglingUser(null);
        }
    };

    // ── Helpers ──────────────────────────────────────────────────────────
    const formatDate = (isoStr) => {
        if (!isoStr) return '—';
        const d = new Date(isoStr);
        return d.toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const filteredUsers = users.filter(u => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return u.displayName.toLowerCase().includes(term) ||
            u.jid.toLowerCase().includes(term) ||
            (u.lastMessageText && u.lastMessageText.toLowerCase().includes(term));
    });

    return (
        <div className="wa-users-panel">
            {/* Toast */}
            {toast && (
                <div className={`wa-toast ${toast.type === 'success' ? 'wa-toast-ok' : 'wa-toast-err'}`}>
                    {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {toast.msg}
                </div>
            )}

            {/* Section header */}
            <div className="wa-card-header" style={{ marginBottom: '0.75rem' }}>
                <UserCheck size={20} style={{ color: '#1a1a1a' }} />
                <span className="wa-card-title">Control de Usuarios</span>
                <span className="wa-tab-badge" style={{ marginLeft: '0.5rem' }}>{users.length}</span>
            </div>

            {/* Search & refresh bar */}
            <div className="wa-users-toolbar">
                <div className="wa-search-wrapper">
                    <Search size={16} className="wa-search-icon" />
                    <input
                        type="text"
                        className="wa-search-input"
                        placeholder="Buscar por número o mensaje..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    className="wa-refresh-btn"
                    onClick={loadUsers}
                    disabled={usersLoading}
                >
                    <RefreshCw size={16} className={usersLoading ? 'wa-spin' : ''} />
                    Actualizar
                </button>
            </div>

            {/* User list */}
            {filteredUsers.length === 0 ? (
                <div className="wa-users-empty premium-card">
                    <Users size={40} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                    <p>{searchTerm ? 'No se encontraron usuarios' : 'Aún no hay usuarios registrados'}</p>
                    <span className="wa-users-empty-hint">
                        {searchTerm
                            ? 'Intenta con otro término de búsqueda'
                            : 'Los usuarios aparecerán aquí cuando escriban al bot'
                        }
                    </span>
                </div>
            ) : (
                <div className="wa-users-list">
                    {filteredUsers.map(user => (
                        <div key={user.jid} className="wa-user-card premium-card">
                            {/* User info */}
                            <div className="wa-user-info">
                                <div className="wa-user-avatar">
                                    {user.displayName.charAt(0).toUpperCase()}
                                </div>
                                <div className="wa-user-details">
                                    <span className="wa-user-name">{user.displayName}</span>
                                    <span className="wa-user-msg">
                                        {user.lastMessageText
                                            ? (user.lastMessageText.length > 60
                                                ? user.lastMessageText.substring(0, 60) + '...'
                                                : user.lastMessageText)
                                            : 'Sin mensaje registrado'
                                        }
                                    </span>
                                    <span className="wa-user-time">
                                        {user.lastMessageAt ? formatDate(user.lastMessageAt) : '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Status badges */}
                            <div className="wa-user-badges">
                                <span className={`wa-badge ${user.cooldownStatus === 'active' ? 'wa-badge-active' : 'wa-badge-expired'}`}>
                                    <Clock size={12} />
                                    {user.cooldownStatus === 'active' ? 'Cooldown Activo' : 'Cooldown Expirado'}
                                </span>
                                <span className={`wa-badge ${user.aiEnabled ? 'wa-badge-ai-on' : 'wa-badge-ai-off'}`}>
                                    <Power size={12} />
                                    {user.aiEnabled ? 'IA Activa' : 'IA Desactivada'}
                                </span>
                            </div>

                            {/* Controls */}
                            <div className="wa-user-controls">
                                {/* AI toggle */}
                                <div className="wa-user-toggle-group">
                                    <span className="wa-user-toggle-label">IA</span>
                                    <button
                                        className={`wa-toggle-sm ${user.aiEnabled ? 'wa-toggle-sm-on' : 'wa-toggle-sm-off'}`}
                                        onClick={() => toggleUserAI(user.jid, user.aiEnabled)}
                                        disabled={togglingUser === `${user.jid}:ai`}
                                    >
                                        <span className="wa-toggle-sm-thumb" />
                                    </button>
                                </div>

                                {/* Cooldown toggle */}
                                <div className="wa-user-toggle-group">
                                    <span className="wa-user-toggle-label">24H</span>
                                    <button
                                        className={`wa-toggle-sm ${user.cooldownEnabled ? 'wa-toggle-sm-on' : 'wa-toggle-sm-off'}`}
                                        onClick={() => toggleUserCooldown(user.jid, user.cooldownEnabled)}
                                        disabled={togglingUser === `${user.jid}:cooldown`}
                                    >
                                        <span className="wa-toggle-sm-thumb" />
                                    </button>
                                </div>

                                {/* Reset cooldown button */}
                                <button
                                    className="wa-user-reset-btn"
                                    onClick={() => resetUserCooldown(user.jid)}
                                    disabled={togglingUser === `${user.jid}:reset`}
                                    title="Resetear cooldown"
                                >
                                    <RotateCcw size={14} />
                                    Reset
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default UserControlPanel;
