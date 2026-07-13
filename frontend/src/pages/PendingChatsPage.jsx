import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
    AlertTriangle, RefreshCw, Search, UserCheck, Power,
    Clock, CheckCircle, AlertCircle, Settings2, Save, Phone, Edit2, Check, X
} from 'lucide-react';
import Avatar from '../components/ui/Avatar';

const PendingChatsPage = () => {
    // ── Config ──────────────────────────────────────────────────────────
    const [adminNumber, setAdminNumber] = useState('');
    const [savingConfig, setSavingConfig] = useState(false);

    // ── Pending list ────────────────────────────────────────────────────
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [actionInProgress, setActionInProgress] = useState(null);
    const [toast, setToast] = useState(null);

    // Editing states for contact name
    const [editingJid, setEditingJid] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');
    const [savingName, setSavingName] = useState(false);

    // ── Load ────────────────────────────────────────────────────────────
    useEffect(() => {
        loadAll();
    }, []);

    // Auto-refresh every 10 seconds
    useEffect(() => {
        const interval = setInterval(loadPending, 10000);
        return () => clearInterval(interval);
    }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [configRes, pendingRes] = await Promise.all([
                api.get('/api/ai-fallback/config'),
                api.get('/api/ai-fallback/pending')
            ]);
            const cfg = configRes.data.data;
            setAdminNumber(cfg.adminJid?.replace('@s.whatsapp.net', '') || '');
            setPending(pendingRes.data.data || []);
        } catch (err) {
            showToast('error', 'Error cargando datos');
        } finally {
            setLoading(false);
        }
    };

    const loadPending = useCallback(async () => {
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

    // ── Save config ─────────────────────────────────────────────────────
    const handleSaveConfig = async () => {
        if (savingConfig) return;
        setSavingConfig(true);
        try {
            const jid = adminNumber.includes('@')
                ? adminNumber
                : `${adminNumber.replace(/\D/g, '')}@s.whatsapp.net`;
            await api.put('/api/ai-fallback/config', { adminJid: jid });
            showToast('success', 'Número de admin guardado');
        } catch {
            showToast('error', 'Error al guardar');
        } finally {
            setSavingConfig(false);
        }
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
            showToast('success', `Marcado como atendido`);
        } catch {
            showToast('error', 'Error al marcar como atendido');
        } finally {
            setActionInProgress(null);
        }
    };

    const handleSaveName = async (jid) => {
        if (!editNameValue.trim() || savingName) return;
        const newName = editNameValue.trim();
        setSavingName(true);
        try {
            await api.put(`/api/chat/conversations/${encodeURIComponent(jid)}/name`, { name: newName });
            setPending(prev => prev.map(p => p.jid === jid ? { ...p, displayName: newName } : p));
            setEditingJid(null);
            showToast('success', 'Nombre de contacto actualizado');
        } catch (err) {
            showToast('error', 'Error al guardar nombre');
        } finally {
            setSavingName(false);
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

    const filtered = pending.filter(p => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return p.displayName.toLowerCase().includes(term) ||
            p.jid.toLowerCase().includes(term) ||
            (p.lastMessage && p.lastMessage.toLowerCase().includes(term));
    });

    const pendingCount = pending.filter(p => !p.attended).length;
    const attendedCount = pending.filter(p => p.attended).length;

    // ── Loading ─────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="dashboard-content">
                <div className="wa-skeleton-block" style={{ height: 80, borderRadius: 16, marginBottom: 16 }} />
                <div className="wa-skeleton-block" style={{ height: 300, borderRadius: 16 }} />
            </div>
        );
    }

    return (
        <div className="dashboard-content pc-page">
            {/* Toast */}
            {toast && (
                <div className={`wa-toast ${toast.type === 'success' ? 'wa-toast-ok' : 'wa-toast-err'}`}>
                    {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {toast.msg}
                </div>
            )}

            {/* ── Header ── */}
            <header className="analytics-page-header">
                <div>
                    <h1 className="analytics-page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <AlertTriangle size={28} />
                        Chats Pendientes
                    </h1>
                    <p className="analytics-page-sub">
                        Conversaciones donde la IA no pudo responder — requieren atención manual
                    </p>
                </div>
            </header>

            {/* ── Stats bar ── */}
            <div className="wa-stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="wa-stat-card premium-card">
                    <AlertTriangle size={20} style={{ color: '#1a1a1a' }} />
                    <div>
                        <span className="wa-stat-value">{pendingCount}</span>
                        <span className="wa-stat-label">Pendientes</span>
                    </div>
                </div>
                <div className="wa-stat-card premium-card">
                    <CheckCircle size={20} style={{ color: '#1a1a1a' }} />
                    <div>
                        <span className="wa-stat-value">{attendedCount}</span>
                        <span className="wa-stat-label">Atendidos</span>
                    </div>
                </div>
                <div className="wa-stat-card premium-card">
                    <Phone size={20} style={{ color: '#1a1a1a' }} />
                    <div>
                        <span className="wa-stat-value" style={{ fontSize: '0.85rem' }}>
                            {adminNumber || 'Sin configurar'}
                        </span>
                        <span className="wa-stat-label">Admin notificado</span>
                    </div>
                </div>
            </div>

            {/* ── Admin config ── */}
            <div className="premium-card pc-config-card">
                <div className="wa-card-header">
                    <Settings2 size={18} style={{ color: '#1a1a1a' }} />
                    <span className="wa-card-title">Número del Administrador</span>
                </div>
                <p className="wa-card-desc">
                    Cuando la IA no sepa responder, se enviará una notificación a este número por WhatsApp.
                </p>
                <div className="pc-admin-row">
                    <input
                        type="text"
                        className="wa-search-input"
                        placeholder="Ej: 573028599105"
                        value={adminNumber}
                        onChange={e => setAdminNumber(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <button
                        className="wa-save-btn pc-save-btn"
                        onClick={handleSaveConfig}
                        disabled={savingConfig}
                    >
                        <Save size={16} />
                        {savingConfig ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>

            {/* ── Search & refresh ── */}
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
                <button className="wa-refresh-btn" onClick={loadPending}>
                    <RefreshCw size={16} />
                    Actualizar
                </button>
            </div>

            {/* ── Pending list ── */}
            {filtered.length === 0 ? (
                <div className="wa-users-empty premium-card">
                    <CheckCircle size={40} style={{ color: '#1a1a1a', marginBottom: '0.5rem' }} />
                    <p>{searchTerm ? 'No se encontraron resultados' : '¡No hay chats pendientes!'}</p>
                    <span className="wa-users-empty-hint">
                        {searchTerm
                            ? 'Intenta con otro término'
                            : 'Todas las conversaciones están al día'
                        }
                    </span>
                </div>
            ) : (
                <div className="wa-users-list">
                    {filtered.map(item => (
                        <div
                            key={item.jid}
                            className={`wa-user-card premium-card ${item.attended ? 'pc-card-attended' : 'pc-card-pending'}`}
                        >
                            {/* Info */}
                            <div className="wa-user-info">
                                <Avatar
                                    jid={item.jid}
                                    name={item.displayName}
                                    isGroup={item.jid?.includes('@g.us')}
                                    className={`wa-user-avatar ${item.attended ? 'pc-avatar-attended' : 'pc-avatar-pending'}`}
                                    size={30}
                                />
                                <div className="wa-user-details">
                                    {editingJid === item.jid ? (
                                        <div className="wa-user-name-edit-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0' }}>
                                            <input
                                                type="text"
                                                className="wa-user-name-input"
                                                value={editNameValue}
                                                onChange={e => setEditNameValue(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveName(item.jid);
                                                    if (e.key === 'Escape') setEditingJid(null);
                                                }}
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.1)',
                                                    border: '1px solid rgba(26, 26, 26, 0.2)',
                                                    borderRadius: '4px',
                                                    color: '#1a1a1a',
                                                    padding: '2px 6px',
                                                    fontSize: '0.9rem',
                                                    outline: 'none',
                                                    width: '150px'
                                                }}
                                                disabled={savingName}
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => handleSaveName(item.jid)}
                                                style={{ background: 'none', border: 'none', color: '#00aa55', cursor: 'pointer', padding: '2px' }}
                                                disabled={savingName}
                                                title="Guardar"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                onClick={() => setEditingJid(null)}
                                                style={{ background: 'none', border: 'none', color: '#ff3333', cursor: 'pointer', padding: '2px' }}
                                                disabled={savingName}
                                                title="Cancelar"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span 
                                                className="wa-user-name" 
                                                onClick={() => {
                                                    setEditNameValue(item.displayName);
                                                    setEditingJid(item.jid);
                                                }}
                                                style={{ cursor: 'pointer' }}
                                                title="Editar nombre"
                                            >
                                                {item.displayName}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setEditNameValue(item.displayName);
                                                    setEditingJid(item.jid);
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'rgba(26, 26, 26, 0.4)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: '2px',
                                                    borderRadius: '4px'
                                                }}
                                                title="Editar nombre"
                                            >
                                                <Edit2 size={11} />
                                            </button>
                                        </div>
                                    )}
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

export default PendingChatsPage;
