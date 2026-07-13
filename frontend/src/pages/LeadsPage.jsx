import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
    Target, Filter, Search, RefreshCw, MessageSquare,
    Phone, User, Tag, ChevronDown, ChevronRight,
    Clock, Send, Loader2, CheckCircle, XCircle, AlertCircle,
    MapPin, Building, Boxes, Settings, AlertTriangle, Layers
} from 'lucide-react';

const SCORE_CONFIG = {
    frio: { label: 'Frío', emoji: '🔵', color: '#2563eb', bg: '#eff6ff', textColor: '#1d4ed8' },
    tibio: { label: 'Tibio', emoji: '🟡', color: '#d97706', bg: '#fffbeb', textColor: '#92400e' },
    caliente: { label: 'Caliente', emoji: '🔴', color: '#dc2626', bg: '#fef2f2', textColor: '#991b1b' }
};

const STATUS_CONFIG = {
    nuevo: { label: 'Nuevo', color: '#7c3aed', bg: '#f5f3ff' },
    contactado: { label: 'Contactado', color: '#0369a1', bg: '#e0f2fe' },
    cerrado: { label: 'Cerrado', color: '#166534', bg: '#f0fdf4' }
};

const LeadsPage = () => {
    const [leads, setLeads] = useState([]);
    const [stats, setStats] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedLead, setSelectedLead] = useState(null);
    const [chatHistory, setChatHistory] = useState(null);
    const [chatLoading, setChatLoading] = useState(false);

    // Filters
    const [filterScore, setFilterScore] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterCampaign, setFilterCampaign] = useState('');
    const [search, setSearch] = useState('');
    const [updatingId, setUpdatingId] = useState(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [leadsRes, statsRes, campaignsRes] = await Promise.all([
                api.get('/api/leads', { params: { score: filterScore || undefined, status: filterStatus || undefined, campaignId: filterCampaign || undefined, search: search || undefined } }),
                api.get('/api/leads/stats'),
                api.get('/api/campaigns')
            ]);
            setLeads(leadsRes.data.data || []);
            setStats(statsRes.data.data || null);
            setCampaigns(campaignsRes.data.data || []);
        } catch (err) {
            console.error('Error loading leads:', err);
        } finally {
            setLoading(false);
        }
    }, [filterScore, filterStatus, filterCampaign, search]);

    useEffect(() => { loadData(); }, [loadData]);

    const loadChat = async (jid) => {
        try {
            setChatLoading(true);
            const res = await api.get(`/api/chat/messages/${encodeURIComponent(jid)}`);
            setChatHistory(res.data.data || res.data);
        } catch {
            setChatHistory(null);
        } finally {
            setChatLoading(false);
        }
    };

    const handleSelectLead = (lead) => {
        setSelectedLead(lead);
        loadChat(lead.jid);
    };

    const handleStatusChange = async (leadId, newStatus) => {
        try {
            setUpdatingId(leadId);
            await api.put(`/api/leads/${leadId}/status`, { status: newStatus });
            setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
            if (selectedLead?.id === leadId) {
                setSelectedLead(l => ({ ...l, status: newStatus }));
            }
        } catch (err) {
            alert('Error al actualizar estado');
        } finally {
            setUpdatingId(null);
        }
    };

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-CO', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    }) : '—';

    const getCampaignName = (id) => {
        const c = campaigns.find(c => c.id === id);
        return c?.name || id || '—';
    };

    return (
        <div className="leads-page">
            {/* ── Header ── */}
            <div className="leads-header">
                <div className="leads-header-left">
                    <Target size={26} className="leads-header-icon" />
                    <div>
                        <h1>Leads Interesados</h1>
                        <p>Prospectos detectados automáticamente por IA</p>
                    </div>
                </div>
                <button className="mass-btn-secondary" onClick={loadData}>
                    <RefreshCw size={15} /> Actualizar
                </button>
            </div>

            {/* ── Stats Cards ── */}
            {stats && (
                <div className="leads-stats-row">
                    <div className="leads-stat-card total">
                        <span className="leads-stat-num">{stats.total}</span>
                        <span className="leads-stat-label">Total Leads</span>
                    </div>
                    <div className="leads-stat-card frio">
                        <span className="leads-stat-num">🔵 {stats.frio}</span>
                        <span className="leads-stat-label">Fríos</span>
                    </div>
                    <div className="leads-stat-card tibio">
                        <span className="leads-stat-num">🟡 {stats.tibio}</span>
                        <span className="leads-stat-label">Tibios</span>
                    </div>
                    <div className="leads-stat-card caliente">
                        <span className="leads-stat-num">🔴 {stats.caliente}</span>
                        <span className="leads-stat-label">Calientes</span>
                    </div>
                    <div className="leads-stat-card nuevo">
                        <span className="leads-stat-num">{stats.nuevo}</span>
                        <span className="leads-stat-label">Sin Contactar</span>
                    </div>
                </div>
            )}

            {/* ── Filters + Table + Detail Panel ── */}
            <div className="leads-main-layout">
                {/* LEFT — filters + table */}
                <div className="leads-list-panel">
                    {/* Filters */}
                    <div className="leads-filters">
                        <div className="mass-search-box">
                            <Search size={15} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o número..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <select value={filterScore} onChange={e => setFilterScore(e.target.value)} className="leads-filter-select">
                            <option value="">Todos los niveles</option>
                            <option value="caliente">🔴 Caliente</option>
                            <option value="tibio">🟡 Tibio</option>
                            <option value="frio">🔵 Frío</option>
                        </select>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="leads-filter-select">
                            <option value="">Todos los estados</option>
                            <option value="nuevo">Nuevo</option>
                            <option value="contactado">Contactado</option>
                            <option value="cerrado">Cerrado</option>
                        </select>
                        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className="leads-filter-select">
                            <option value="">Todas las campañas</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    {/* Leads List */}
                    {loading ? (
                        <div className="mass-loading"><Loader2 size={32} className="spin" /></div>
                    ) : leads.length === 0 ? (
                        <div className="mass-empty">
                            <Target size={48} />
                            <h3>Sin leads detectados</h3>
                            <p>Los leads aparecerán cuando los usuarios respondan mensajes masivos con intención de compra</p>
                        </div>
                    ) : (
                        <div className="leads-list">
                            {leads.map(lead => {
                                const sc = SCORE_CONFIG[lead.score] || SCORE_CONFIG.frio;
                                const st = STATUS_CONFIG[lead.status] || STATUS_CONFIG.nuevo;
                                const isSelected = selectedLead?.id === lead.id;
                                return (
                                    <div
                                        key={lead.id}
                                        className={`lead-card ${isSelected ? 'selected' : ''}`}
                                        onClick={() => handleSelectLead(lead)}
                                    >
                                        <div className="lead-card-top">
                                            <div className="lead-card-info">
                                                <div className="lead-card-name">
                                                    <User size={13} />
                                                    {lead.pushName || lead.phone}
                                                </div>
                                                <div className="lead-card-phone">
                                                    <Phone size={12} />
                                                    +{lead.phone}
                                                </div>
                                            </div>
                                            <div className="lead-card-badges" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                {lead.priority && (
                                                    <span className="lead-priority-badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontSize: '0.65rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>
                                                        ⚠️ PRIORITARIO
                                                    </span>
                                                )}
                                                <span className="lead-score-badge" style={{ background: sc.bg, color: sc.textColor }}>
                                                    {sc.emoji} {sc.label}
                                                </span>
                                                <span className="lead-status-badge" style={{ background: st.bg, color: st.color }}>
                                                    {st.label}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="lead-card-bottom">
                                            <p className="lead-last-msg">"{lead.lastMessage?.substring(0, 70) || ''}..."</p>
                                            <div className="lead-meta">
                                                {lead.campaignId && (
                                                    <span className="lead-campaign-tag">
                                                        <Send size={11} /> {getCampaignName(lead.campaignId)}
                                                    </span>
                                                )}
                                                <span><Clock size={11} /> {formatDate(lead.lastActivityAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* RIGHT — Lead detail panel */}
                {selectedLead && (
                    <div className="leads-detail-panel">
                        <div className="leads-detail-header">
                            <div>
                                <h2>{selectedLead.pushName || selectedLead.phone}</h2>
                                <span>+{selectedLead.phone}</span>
                            </div>
                            <button className="mass-icon-btn" onClick={() => setSelectedLead(null)}>
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        {/* Priority Banner */}
                        {selectedLead.priority && (
                            <div className="lead-priority-banner" style={{
                                background: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderRadius: '8px',
                                padding: '0.75rem 1rem',
                                margin: '0 1rem 1rem 1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                color: '#b45309',
                                fontSize: '0.85rem'
                            }}>
                                <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                                <div>
                                    <strong>Atención requerida:</strong> La IA se ha pausado para este chat. Requiere atención manual de un asesor humano.
                                </div>
                            </div>
                        )}

                        {/* Badges */}
                        <div className="leads-detail-badges">
                            {(() => {
                                const sc = SCORE_CONFIG[selectedLead.score] || SCORE_CONFIG.frio;
                                return <span className="lead-score-badge large" style={{ background: sc.bg, color: sc.textColor }}>
                                    {sc.emoji} {sc.label}
                                </span>;
                            })()}
                            {(() => {
                                const st = STATUS_CONFIG[selectedLead.status] || STATUS_CONFIG.nuevo;
                                return <span className="lead-status-badge large" style={{ background: st.bg, color: st.color }}>
                                    {st.label}
                                </span>;
                            })()}
                        </div>

                        {/* Info */}
                        <div className="leads-detail-info">
                            <div className="leads-detail-row">
                                <Send size={13} />
                                <span><strong>Campaña:</strong> {getCampaignName(selectedLead.campaignId)}</span>
                            </div>
                            <div className="leads-detail-row">
                                <MessageSquare size={13} />
                                <span><strong>Mensajes:</strong> {selectedLead.messageCount || 1}</span>
                            </div>
                            <div className="leads-detail-row">
                                <Clock size={13} />
                                <span><strong>Última actividad:</strong> {formatDate(selectedLead.lastActivityAt)}</span>
                            </div>
                            <div className="leads-detail-row">
                                <Clock size={13} />
                                <span><strong>Detectado:</strong> {formatDate(selectedLead.createdAt)}</span>
                            </div>
                        </div>

                        {/* AI Extracted Info */}
                        <div className="leads-detail-section" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '1rem', marginTop: '1rem' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Target size={14} style={{ color: '#7c3aed' }} />
                                Ficha Comercial (Extracción por IA)
                            </h4>
                            <div className="leads-detail-info" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px' }}>
                                <div className="leads-detail-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Tag size={13} style={{ color: '#6b7280' }} />
                                    <span><strong>Producto de Interés:</strong> {selectedLead.interestProduct || 'No identificado'}</span>
                                </div>
                                <div className="leads-detail-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Building size={13} style={{ color: '#6b7280' }} />
                                    <span><strong>Empresa:</strong> {selectedLead.company || 'No especificada'}</span>
                                </div>
                                <div className="leads-detail-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Layers size={13} style={{ color: '#6b7280' }} />
                                    <span><strong>Industria:</strong> {selectedLead.industry || 'No especificada'}</span>
                                </div>
                                <div className="leads-detail-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Boxes size={13} style={{ color: '#6b7280' }} />
                                    <span><strong>Cantidad:</strong> {selectedLead.quantity || 'No especificada'}</span>
                                </div>
                                <div className="leads-detail-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Settings size={13} style={{ color: '#6b7280' }} />
                                    <span><strong>Medidas/Dimensiones:</strong> {selectedLead.dimensions || 'No especificadas'}</span>
                                </div>
                                <div className="leads-detail-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <MapPin size={13} style={{ color: '#6b7280' }} />
                                    <span><strong>Ubicación:</strong> {selectedLead.location || 'No especificada'}</span>
                                </div>
                                <div className="leads-detail-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <AlertCircle size={13} style={{ color: selectedLead.urgency === 'alto' ? '#dc2626' : '#6b7280' }} />
                                    <span><strong>Nivel de Urgencia:</strong> <span style={{ textTransform: 'capitalize', fontWeight: selectedLead.urgency === 'alto' ? 'bold' : 'normal', color: selectedLead.urgency === 'alto' ? '#dc2626' : 'inherit' }}>{selectedLead.urgency || 'bajo'}</span></span>
                                </div>
                            </div>
                        </div>

                        {/* Last message */}
                        <div className="leads-detail-section">
                            <h4>Último mensaje</h4>
                            <div className="leads-last-msg-box">{selectedLead.lastMessage}</div>
                        </div>

                        {/* Status change */}
                        <div className="leads-detail-section">
                            <h4>Cambiar Estado</h4>
                            <div className="leads-status-buttons">
                                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                    <button
                                        key={key}
                                        className={`leads-status-btn ${selectedLead.status === key ? 'active' : ''}`}
                                        style={selectedLead.status === key ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color } : {}}
                                        onClick={() => handleStatusChange(selectedLead.id, key)}
                                        disabled={updatingId === selectedLead.id}
                                    >
                                        {updatingId === selectedLead.id ? <Loader2 size={12} className="spin" /> : null}
                                        {cfg.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Recent Chat */}
                        <div className="leads-detail-section leads-chat-section">
                            <h4>Conversación Reciente</h4>
                            {chatLoading ? (
                                <div style={{ textAlign: 'center', padding: '1rem' }}><Loader2 size={20} className="spin" /></div>
                            ) : chatHistory?.messages?.length > 0 ? (
                                <div className="leads-chat-messages">
                                    {chatHistory.messages.slice(-8).map((msg, i) => (
                                        <div key={i} className={`leads-chat-msg ${msg.fromMe ? 'from-me' : 'from-client'}`}>
                                            <div className="leads-chat-bubble">{msg.text}</div>
                                            <div className="leads-chat-time">{formatDate(msg.timestamp)}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: '#999', fontSize: '0.85rem' }}>Sin historial de chat cargado</p>
                            )}
                        </div>

                        {/* Open Chat Button */}
                        <a
                            href={`https://wa.me/${selectedLead.phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="leads-open-chat-btn"
                        >
                            <MessageSquare size={16} /> Abrir en WhatsApp
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeadsPage;
