import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import {
    Send, Users, Plus, Trash2, Upload, Eye, X, Clock,
    CheckCircle, XCircle, Loader2, MessageSquarePlus, BarChart2,
    ChevronDown, ChevronUp, Variable, Calendar, RefreshCw,
    FileText, Phone, User, Hash, Search, Tag, ListChecks
} from 'lucide-react';

const TABS = ['Campañas', 'Contactos'];

const MassCampaignsPage = () => {
    const [activeTab, setActiveTab] = useState('Campañas');

    // ── Campaign state ──
    const [campaigns, setCampaigns] = useState([]);
    const [campaignsLoading, setCampaignsLoading] = useState(true);
    const [showCampaignModal, setShowCampaignModal] = useState(false);
    const [previewCampaign, setPreviewCampaign] = useState(null);
    const [sendingId, setSendingId] = useState(null);
    const [sendProgress, setSendProgress] = useState({});

    // ── Contact state ──
    const [contacts, setContacts] = useState([]);
    const [contactsLoading, setContactsLoading] = useState(true);
    const [showContactModal, setShowContactModal] = useState(false);
    const [contactSearch, setContactSearch] = useState('');
    const [importResult, setImportResult] = useState(null);

    // ── Campaign form state ──
    const [form, setForm] = useState({
        name: '',
        message: '',
        variables: {},
        contactIds: [],
        phoneNumbers: '',
        scheduledAt: '',
        delayMs: 2000
    });
    const [formVariables, setFormVariables] = useState([]);
    const fileInputRef = useRef(null);
    const contactFileRef = useRef(null);

    const loadCampaigns = useCallback(async () => {
        try {
            setCampaignsLoading(true);
            const res = await api.get('/api/campaigns');
            setCampaigns(res.data.data || []);
        } catch (err) {
            console.error('Error loading campaigns:', err);
        } finally {
            setCampaignsLoading(false);
        }
    }, []);

    const loadContacts = useCallback(async () => {
        try {
            setContactsLoading(true);
            const res = await api.get('/api/contacts');
            setContacts(res.data.data || []);
        } catch (err) {
            console.error('Error loading contacts:', err);
        } finally {
            setContactsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCampaigns();
        loadContacts();
    }, [loadCampaigns, loadContacts]);

    // Extract {{variable}} placeholders from message
    const extractVariables = (msg) => {
        const matches = [...msg.matchAll(/\{\{(\w+)\}\}/g)];
        return [...new Set(matches.map(m => m[1]))];
    };

    const handleMessageChange = (val) => {
        setForm(f => ({ ...f, message: val }));
        const vars = extractVariables(val);
        setFormVariables(vars);
        setForm(f => {
            const updated = {};
            for (const v of vars) updated[v] = f.variables[v] || '';
            return { ...f, message: val, variables: updated };
        });
    };

    // Preview message with variables
    const getPreviewMessage = () => {
        let msg = form.message;
        for (const [k, v] of Object.entries(form.variables)) {
            msg = msg.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'gi'), v || `[${k}]`);
        }
        return msg;
    };

    // Calculate total recipients
    const getTotalRecipients = () => {
        const fromContacts = form.contactIds.length;
        const fromNumbers = form.phoneNumbers.split('\n').filter(n => n.trim().replace(/\D/g, '').length >= 10).length;
        return fromContacts + fromNumbers;
    };

    const handleCreateCampaign = async () => {
        if (!form.name || !form.message) return;
        try {
            const phoneNumbers = form.phoneNumbers.split('\n').map(n => n.trim()).filter(Boolean);
            await api.post('/api/campaigns', {
                name: form.name,
                message: form.message,
                variables: form.variables,
                contactIds: form.contactIds,
                phoneNumbers,
                scheduledAt: form.scheduledAt || null
            });
            setShowCampaignModal(false);
            setForm({ name: '', message: '', variables: {}, contactIds: [], phoneNumbers: '', scheduledAt: '', delayMs: 2000 });
            setFormVariables([]);
            loadCampaigns();
        } catch (err) {
            alert('Error al crear campaña: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleSendCampaign = async (campaign) => {
        if (!window.confirm(`¿Enviar "${campaign.name}" a ${campaign.totalRecipients} destinatarios?`)) return;
        try {
            setSendingId(campaign.id);
            setSendProgress({ sent: 0, failed: 0, total: campaign.totalRecipients });
            await api.post(`/api/campaigns/${campaign.id}/send`, { delayMs: 2000 });
            loadCampaigns();
        } catch (err) {
            alert('Error al enviar: ' + (err.response?.data?.message || err.message));
        } finally {
            setSendingId(null);
        }
    };

    const handleDeleteCampaign = async (id) => {
        if (!window.confirm('¿Eliminar esta campaña?')) return;
        await api.delete(`/api/campaigns/${id}`);
        loadCampaigns();
    };

    // ── Contact handlers ──
    const handleImportExcel = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const wb = XLSX.read(ev.target.result, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws);
            try {
                const res = await api.post('/api/contacts/import', { contacts: data });
                setImportResult(res.data.data);
                loadContacts();
            } catch (err) {
                alert('Error al importar: ' + (err.response?.data?.message || err.message));
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const handleAddContact = async (contactData) => {
        try {
            await api.post('/api/contacts', contactData);
            setShowContactModal(false);
            loadContacts();
        } catch (err) {
            alert('Error: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleDeleteContact = async (id) => {
        if (!window.confirm('¿Eliminar este contacto?')) return;
        await api.delete(`/api/contacts/${id}`);
        loadContacts();
    };

    const toggleContactSelection = (id) => {
        setForm(f => ({
            ...f,
            contactIds: f.contactIds.includes(id)
                ? f.contactIds.filter(c => c !== id)
                : [...f.contactIds, id]
        }));
    };

    const filteredContacts = contacts.filter(c =>
        (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
        (c.phone || '').includes(contactSearch)
    );

    const statusColors = {
        draft: { bg: '#e8f4fd', color: '#1a6fb5', label: 'Borrador' },
        sending: { bg: '#fff7e6', color: '#b45309', label: 'Enviando...' },
        sent: { bg: '#e8f8f0', color: '#166534', label: 'Enviada' },
        failed: { bg: '#fef2f2', color: '#991b1b', label: 'Fallida' }
    };

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    return (
        <div className="mass-page">
            {/* ── Header ── */}
            <div className="mass-header">
                <div className="mass-header-left">
                    <Send size={26} className="mass-header-icon" />
                    <div>
                        <h1>Mensajes Masivos</h1>
                        <p>Crea y gestiona campañas de WhatsApp</p>
                    </div>
                </div>
                <div className="mass-header-actions">
                    {activeTab === 'Campañas' && (
                        <button className="mass-btn-primary" onClick={() => setShowCampaignModal(true)}>
                            <Plus size={16} /> Nueva Campaña
                        </button>
                    )}
                    {activeTab === 'Contactos' && (
                        <>
                            <button className="mass-btn-secondary" onClick={() => contactFileRef.current?.click()}>
                                <Upload size={16} /> Importar Excel/CSV
                            </button>
                            <input ref={contactFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportExcel} />
                            <button className="mass-btn-primary" onClick={() => setShowContactModal(true)}>
                                <Plus size={16} /> Agregar Contacto
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Quick Stats ── */}
            <div className="mass-stats-row">
                <div className="mass-stat-card">
                    <div className="mass-stat-icon"><Send size={20} /></div>
                    <div><div className="mass-stat-value">{campaigns.length}</div><div className="mass-stat-label">Campañas</div></div>
                </div>
                <div className="mass-stat-card">
                    <div className="mass-stat-icon"><CheckCircle size={20} /></div>
                    <div><div className="mass-stat-value">{campaigns.filter(c => c.status === 'sent').length}</div><div className="mass-stat-label">Enviadas</div></div>
                </div>
                <div className="mass-stat-card">
                    <div className="mass-stat-icon"><Users size={20} /></div>
                    <div><div className="mass-stat-value">{contacts.length}</div><div className="mass-stat-label">Contactos</div></div>
                </div>
                <div className="mass-stat-card">
                    <div className="mass-stat-icon"><BarChart2 size={20} /></div>
                    <div><div className="mass-stat-value">{campaigns.reduce((a, c) => a + (c.sent || 0), 0)}</div><div className="mass-stat-label">Msgs Enviados</div></div>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="mass-tabs">
                {TABS.map(tab => (
                    <button key={tab} className={`mass-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                        {tab === 'Campañas' ? <Send size={15} /> : <Users size={15} />}
                        {tab}
                    </button>
                ))}
            </div>

            {/* ══════════ CAMPAIGNS TAB ══════════ */}
            {activeTab === 'Campañas' && (
                <div className="mass-tab-content">
                    {campaignsLoading ? (
                        <div className="mass-loading"><Loader2 size={32} className="spin" /><p>Cargando campañas...</p></div>
                    ) : campaigns.length === 0 ? (
                        <div className="mass-empty">
                            <Send size={48} />
                            <h3>Sin campañas aún</h3>
                            <p>Crea tu primera campaña masiva de WhatsApp</p>
                            <button className="mass-btn-primary" onClick={() => setShowCampaignModal(true)}>
                                <Plus size={16} /> Nueva Campaña
                            </button>
                        </div>
                    ) : (
                        <div className="mass-campaigns-list">
                            {campaigns.map(c => {
                                const s = statusColors[c.status] || statusColors.draft;
                                const isRunning = sendingId === c.id;
                                return (
                                    <div key={c.id} className="mass-campaign-card">
                                        <div className="mass-campaign-top">
                                            <div className="mass-campaign-info">
                                                <h3>{c.name}</h3>
                                                <p className="mass-campaign-msg">{c.message?.substring(0, 80)}{c.message?.length > 80 ? '...' : ''}</p>
                                            </div>
                                            <div className="mass-campaign-meta">
                                                <span className="mass-status-badge" style={{ background: s.bg, color: s.color }}>
                                                    {s.label}
                                                </span>
                                                <span className="mass-recipients"><Users size={13} /> {c.totalRecipients || 0}</span>
                                            </div>
                                        </div>

                                        {isRunning && sendProgress && (
                                            <div className="mass-progress-bar-wrap">
                                                <div className="mass-progress-bar">
                                                    <div
                                                        className="mass-progress-fill"
                                                        style={{ width: `${sendProgress.total > 0 ? (sendProgress.sent / sendProgress.total) * 100 : 0}%` }}
                                                    />
                                                </div>
                                                <span>{sendProgress.sent}/{sendProgress.total} enviados</span>
                                            </div>
                                        )}

                                        <div className="mass-campaign-footer">
                                            <span className="mass-campaign-date"><Clock size={12} /> {formatDate(c.createdAt)}</span>
                                            {c.status === 'sent' && (
                                                <span className="mass-sent-stats">
                                                    <CheckCircle size={12} style={{ color: '#16a34a' }} /> {c.sent || 0} ok
                                                    {c.failed > 0 && <><XCircle size={12} style={{ color: '#dc2626', marginLeft: 6 }} /> {c.failed} fallidos</>}
                                                </span>
                                            )}
                                            <div className="mass-campaign-actions">
                                                <button className="mass-icon-btn" title="Vista previa" onClick={() => setPreviewCampaign(c)}>
                                                    <Eye size={15} />
                                                </button>
                                                {(c.status === 'draft') && !isRunning && (
                                                    <button className="mass-btn-send" onClick={() => handleSendCampaign(c)}>
                                                        <Send size={14} /> Enviar
                                                    </button>
                                                )}
                                                {isRunning && (
                                                    <button className="mass-btn-send" disabled>
                                                        <Loader2 size={14} className="spin" /> Enviando...
                                                    </button>
                                                )}
                                                <button className="mass-icon-btn danger" title="Eliminar" onClick={() => handleDeleteCampaign(c.id)}>
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════ CONTACTS TAB ══════════ */}
            {activeTab === 'Contactos' && (
                <div className="mass-tab-content">
                    {importResult && (
                        <div className="mass-import-result">
                            <CheckCircle size={16} style={{ color: '#16a34a' }} />
                            <span>Importación completada: <strong>{importResult.created}</strong> creados, <strong>{importResult.skipped}</strong> omitidos</span>
                            <button onClick={() => setImportResult(null)}><X size={14} /></button>
                        </div>
                    )}

                    <div className="mass-contacts-toolbar">
                        <div className="mass-search-box">
                            <Search size={15} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o número..."
                                value={contactSearch}
                                onChange={e => setContactSearch(e.target.value)}
                            />
                        </div>
                        <span className="mass-contact-count">{filteredContacts.length} contactos</span>
                    </div>

                    {contactsLoading ? (
                        <div className="mass-loading"><Loader2 size={32} className="spin" /></div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="mass-empty">
                            <Users size={48} />
                            <h3>Sin contactos</h3>
                            <p>Importa desde Excel/CSV o agrega manualmente</p>
                        </div>
                    ) : (
                        <div className="mass-contacts-table-wrap">
                            <table className="mass-table">
                                <thead>
                                    <tr>
                                        <th>Nombre</th>
                                        <th>Teléfono</th>
                                        <th>Email</th>
                                        <th>Empresa</th>
                                        <th>Registrado</th>
                                        <th>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredContacts.map(c => (
                                        <tr key={c.id}>
                                            <td><User size={13} style={{ marginRight: 6 }} />{c.name}</td>
                                            <td><Phone size={13} style={{ marginRight: 6 }} />{c.phone}</td>
                                            <td>{c.email || '—'}</td>
                                            <td>{c.company || '—'}</td>
                                            <td>{formatDate(c.createdAt)}</td>
                                            <td>
                                                <button className="mass-icon-btn danger" onClick={() => handleDeleteContact(c.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════ CREATE CAMPAIGN MODAL ══════════ */}
            {showCampaignModal && (
                <div className="mass-modal-overlay" onClick={() => setShowCampaignModal(false)}>
                    <div className="mass-modal" onClick={e => e.stopPropagation()}>
                        <div className="mass-modal-header">
                            <h2><MessageSquarePlus size={20} /> Nueva Campaña</h2>
                            <button className="mass-modal-close" onClick={() => setShowCampaignModal(false)}><X size={18} /></button>
                        </div>

                        <div className="mass-modal-body">
                            {/* Campaign Name */}
                            <div className="mass-field">
                                <label>Nombre de la Campaña *</label>
                                <input type="text" placeholder="Ej: Descuento Agosto 2025" value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            </div>

                            {/* Message */}
                            <div className="mass-field">
                                <label>
                                    Mensaje *
                                    <span className="mass-field-hint">Usa {'{{'}variable{'}}'} para personalizar</span>
                                </label>
                                <textarea
                                    rows={5}
                                    placeholder="Hola {{nombre}}, te informamos sobre nuestro producto {{producto}}..."
                                    value={form.message}
                                    onChange={e => handleMessageChange(e.target.value)}
                                />
                            </div>

                            {/* Variables */}
                            {formVariables.length > 0 && (
                                <div className="mass-field">
                                    <label><Variable size={14} /> Variables Detectadas</label>
                                    <div className="mass-variables-grid">
                                        {formVariables.map(v => (
                                            <div key={v} className="mass-variable-input">
                                                <span className="mass-var-label">{'{{'}{v}{'}}'}</span>
                                                <input
                                                    type="text"
                                                    placeholder={`Valor para ${v}`}
                                                    value={form.variables[v] || ''}
                                                    onChange={e => setForm(f => ({
                                                        ...f,
                                                        variables: { ...f.variables, [v]: e.target.value }
                                                    }))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Preview */}
                            {form.message && (
                                <div className="mass-preview-box">
                                    <div className="mass-preview-label"><Eye size={13} /> Vista Previa</div>
                                    <div className="mass-preview-bubble">{getPreviewMessage()}</div>
                                </div>
                            )}

                            {/* Recipients — Contacts selection */}
                            <div className="mass-field">
                                <label><ListChecks size={14} /> Seleccionar Contactos ({form.contactIds.length} seleccionados)</label>
                                <div className="mass-contact-selector">
                                    {contacts.length === 0 ? (
                                        <p style={{ color: '#666', fontSize: '0.85rem' }}>No hay contactos. Agrega desde la pestaña Contactos.</p>
                                    ) : contacts.map(c => (
                                        <label key={c.id} className={`mass-contact-item ${form.contactIds.includes(c.id) ? 'selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={form.contactIds.includes(c.id)}
                                                onChange={() => toggleContactSelection(c.id)}
                                            />
                                            <span>{c.name}</span>
                                            <span style={{ color: '#666', fontSize: '0.8rem' }}>{c.phone}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Recipients — Manual phones */}
                            <div className="mass-field">
                                <label><Phone size={14} /> Números Manuales (uno por línea)</label>
                                <textarea
                                    rows={4}
                                    placeholder="573001234567&#10;573009876543&#10;..."
                                    value={form.phoneNumbers}
                                    onChange={e => setForm(f => ({ ...f, phoneNumbers: e.target.value }))}
                                />
                            </div>

                            {/* Total recipients badge */}
                            <div className="mass-recipients-badge">
                                <Users size={16} />
                                <strong>{getTotalRecipients()}</strong> destinatarios en total
                            </div>

                            {/* Schedule */}
                            <div className="mass-field">
                                <label><Calendar size={14} /> Programar envío (opcional)</label>
                                <input
                                    type="datetime-local"
                                    value={form.scheduledAt}
                                    onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                                />
                                <span className="mass-field-hint">Deja vacío para guardar como borrador y enviar manualmente</span>
                            </div>
                        </div>

                        <div className="mass-modal-footer">
                            <button className="mass-btn-secondary" onClick={() => setShowCampaignModal(false)}>Cancelar</button>
                            <button
                                className="mass-btn-primary"
                                onClick={handleCreateCampaign}
                                disabled={!form.name || !form.message}
                            >
                                <Plus size={16} /> Guardar Campaña
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ ADD CONTACT MODAL ══════════ */}
            {showContactModal && (
                <AddContactModal
                    onSave={handleAddContact}
                    onClose={() => setShowContactModal(false)}
                />
            )}

            {/* ══════════ PREVIEW MODAL ══════════ */}
            {previewCampaign && (
                <div className="mass-modal-overlay" onClick={() => setPreviewCampaign(null)}>
                    <div className="mass-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="mass-modal-header">
                            <h2><Eye size={20} /> Vista Previa: {previewCampaign.name}</h2>
                            <button className="mass-modal-close" onClick={() => setPreviewCampaign(null)}><X size={18} /></button>
                        </div>
                        <div className="mass-modal-body">
                            <div className="mass-preview-meta">
                                <span><Users size={13} /> {previewCampaign.totalRecipients || 0} destinatarios</span>
                                <span><Clock size={13} /> {formatDate(previewCampaign.createdAt)}</span>
                            </div>
                            <div className="mass-preview-bubble" style={{ marginTop: 16 }}>{previewCampaign.message}</div>
                            {Object.keys(previewCampaign.variables || {}).length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <p style={{ fontWeight: 600, marginBottom: 8 }}>Variables configuradas:</p>
                                    {Object.entries(previewCampaign.variables).map(([k, v]) => (
                                        <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                            <span className="mass-tag">{'{{'}{k}{'}}'}</span>
                                            <span style={{ color: '#333' }}>{v}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="mass-modal-footer">
                            <button className="mass-btn-secondary" onClick={() => setPreviewCampaign(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Add Contact Modal ──
const AddContactModal = ({ onSave, onClose }) => {
    const [form, setForm] = useState({ phone: '', name: '', email: '', company: '' });
    const handleSubmit = () => {
        if (!form.phone) return;
        onSave(form);
    };
    return (
        <div className="mass-modal-overlay" onClick={onClose}>
            <div className="mass-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                <div className="mass-modal-header">
                    <h2><User size={18} /> Nuevo Contacto</h2>
                    <button className="mass-modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="mass-modal-body">
                    <div className="mass-field">
                        <label>Teléfono * (con código de país, sin +)</label>
                        <input type="text" placeholder="573001234567" value={form.phone}
                            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="mass-field">
                        <label>Nombre</label>
                        <input type="text" placeholder="Juan Pérez" value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="mass-field">
                        <label>Correo</label>
                        <input type="email" placeholder="juan@email.com" value={form.email}
                            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="mass-field">
                        <label>Empresa</label>
                        <input type="text" placeholder="Mi Empresa S.A.S" value={form.company}
                            onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
                    </div>
                </div>
                <div className="mass-modal-footer">
                    <button className="mass-btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="mass-btn-primary" onClick={handleSubmit} disabled={!form.phone}>
                        <Plus size={16} /> Guardar Contacto
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MassCampaignsPage;
