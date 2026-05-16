import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import {
    AlertTriangle, RefreshCw, UserCheck, Power,
    Clock, CheckCircle, AlertCircle
} from 'lucide-react';

const PendingAlertsPanel = ({ className = '' }) => {
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionInProgress, setActionInProgress] = useState(null);
    const [toast, setToast] = useState(null);

    // ── Load on mount + auto-refresh every 10s ──────────────────────────
    useEffect(() => {
        loadPending();
        const interval = setInterval(loadPendingSilent, 10000);
        return () => clearInterval(interval);
    }, []);

    const loadPending = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/api/ai-fallback/pending');
            setPending(data.data || []);
        } catch (_) { }
        finally { setLoading(false); }
    };

    const loadPendingSilent = useCallback(async () => {
        try {
            const { data } = await api.get('/api/ai-fallback/pending');
            setPending(data.data || []);
        } catch (_) { }
    }, []);

    // ── Toast ───────────────────────────────────────────────────────────
    const showToast = (type, msg) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Actions ─────────────────────────────────────────────────────────
    const handleReactivate = async (jid) => {
        setActionInProgress(`${jid}:reactivate`);
        try {
            await api.post('/api/ai-fallback/reactivate', { jid });
            setPending(prev => prev.filter(p => p.jid !== jid));
            showToast('success', `IA reactivada para ${jid.replace('@s.whatsapp.net', '')}`);
        } catch {
            showToast('error', 'Error al reactivar IA');
        } finally {
            setActionInProgress(null);
        }
    };

    const handleMarkAttended = async (jid) => {
        setActionInProgress(`${jid}:attended`);
        try {
            await api.post('/api/ai-fallback/attended', { jid });
            setPending(prev => prev.map(p =>
                p.jid === jid ? { ...p, attended: true, attendedAt: new Date().toISOString() } : p
            ));
            showToast('success', 'Marcado como atendido');
        } catch {
            showToast('error', 'Error al marcar como atendido');
        } finally {
            setActionInProgress(null);
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

    const pendingCount = pending.filter(p => !p.attended).length;

    if (loading) {
        return (
            <div className={`pending-alerts-panel ${className}`}>
                <div className="wa-section-header" style={{ marginBottom: '0.75rem' }}>
                    <AlertTriangle size={20} style={{ color: '#1a1a1a' }} />
                    <span className="wa-card-title">Alertas Pendientes</span>
                </div>
                <div className="wa-skeleton-block" style={{ height: 120, borderRadius: 12 }} />
            </div>
        );
    }

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
                <AlertTriangle size={20} style={{ color: '#1a1a1a' }} />
                <span className="wa-card-title">Alertas Pendientes</span>
                {pendingCount > 0 && (
                    <span className="wa-tab-badge" style={{ marginLeft: '0.5rem', background: '#1a1a1a' }}>
                        {pendingCount}
                    </span>
                )}
                <button
                    className="wa-refresh-btn"
                    onClick={loadPending}
                    style={{ marginLeft: 'auto' }}
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Pending list */}
            {pending.length === 0 ? (
                <div className="wa-users-empty premium-card">
                    <CheckCircle size={36} style={{ color: '#1a1a1a', marginBottom: '0.5rem' }} />
                    <p>¡No hay chats pendientes!</p>
                    <span className="wa-users-empty-hint">Todas las conversaciones están al día</span>
                </div>
            ) : (
                <div className="wa-users-list">
                    {pending.map(item => (
                        <div
                            key={item.jid}
                            className={`wa-user-card premium-card ${item.attended ? 'pc-card-attended' : 'pc-card-pending'}`}
                        >
                            {/* Info */}
                            <div className="wa-user-info">
                                <div className={`wa-user-avatar ${item.attended ? 'pc-avatar-attended' : 'pc-avatar-pending'}`}>
                                    {item.attended ? '✓' : '!'}
                                </div>
                                <div className="wa-user-details">
                                    <span className="wa-user-name">{item.displayName}</span>
                                    <span className="wa-user-msg pc-last-msg">
                                        "{item.lastMessage || 'Sin mensaje'}"
                                    </span>
                                    <span className="wa-user-time">
                                        <Clock size={10} style={{ marginRight: 4 }} />
                                        {formatDate(item.disabledAt)}
                                    </span>
                                </div>
                            </div>

                            {/* Badge */}
                            <div className="wa-user-badges">
                                <span className={`wa-badge ${item.attended ? 'pc-badge-attended' : 'pc-badge-pending'}`}>
                                    {item.attended ? '✅ Atendido' : '🔴 Pendiente'}
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="wa-user-controls">
                                {!item.attended && (
                                    <button
                                        className="pc-btn pc-btn-attended"
                                        onClick={() => handleMarkAttended(item.jid)}
                                        disabled={actionInProgress === `${item.jid}:attended`}
                                    >
                                        <UserCheck size={14} />
                                        Atendido
                                    </button>
                                )}
                                <button
                                    className="pc-btn pc-btn-reactivate"
                                    onClick={() => handleReactivate(item.jid)}
                                    disabled={actionInProgress === `${item.jid}:reactivate`}
                                >
                                    <Power size={14} />
                                    Reactivar IA
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PendingAlertsPanel;
