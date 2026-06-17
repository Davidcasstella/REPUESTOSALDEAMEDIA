import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
    BellDot, Save, Send, Mail, Smartphone, Shield,
    CheckCircle, XCircle, Loader2, AlertCircle, Info,
    ToggleLeft, ToggleRight, Plus, X
} from 'lucide-react';

const AlertConfigPage = () => {
    const [config, setConfig] = useState({
        whatsappEnabled: false,
        whatsappNumber: '',
        emailEnabled: false,
        emailRecipients: [],
        minScoreForAlert: 'tibio',
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        smtpFrom: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error'
    const [testStatus, setTestStatus] = useState(null);
    const [newEmail, setNewEmail] = useState('');

    const loadConfig = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/alert-config');
            setConfig(prev => ({ ...prev, ...res.data.data }));
        } catch (err) {
            console.error('Error loading alert config:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    const handleSave = async () => {
        try {
            setSaving(true);
            setSaveStatus(null);
            await api.put('/api/alert-config', config);
            setSaveStatus('success');
            setTimeout(() => setSaveStatus(null), 3000);
        } catch (err) {
            setSaveStatus('error');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        try {
            setTesting(true);
            setTestStatus(null);
            const res = await api.post('/api/alert-config/test', config);
            setTestStatus({ success: true, data: res.data.data });
        } catch (err) {
            setTestStatus({ success: false, message: err.response?.data?.message || err.message });
        } finally {
            setTesting(false);
        }
    };

    const addEmail = () => {
        if (!newEmail || !newEmail.includes('@')) return;
        setConfig(c => ({
            ...c,
            emailRecipients: [...new Set([...c.emailRecipients, newEmail.trim()])]
        }));
        setNewEmail('');
    };

    const removeEmail = (email) => {
        setConfig(c => ({ ...c, emailRecipients: c.emailRecipients.filter(e => e !== email) }));
    };

    const update = (key, val) => setConfig(c => ({ ...c, [key]: val }));

    const SCORE_OPTIONS = [
        { value: 'frio', label: '🔵 Frío — cualquier señal de interés', color: '#1d4ed8' },
        { value: 'tibio', label: '🟡 Tibio — interés moderado (recomendado)', color: '#92400e' },
        { value: 'caliente', label: '🔴 Caliente — intención de compra directa', color: '#991b1b' }
    ];

    if (loading) {
        return (
            <div className="alert-page">
                <div className="mass-loading"><Loader2 size={32} className="spin" /><p>Cargando configuración...</p></div>
            </div>
        );
    }

    return (
        <div className="alert-page">
            {/* ── Header ── */}
            <div className="mass-header">
                <div className="mass-header-left">
                    <BellDot size={26} className="mass-header-icon" />
                    <div>
                        <h1>Configuración de Alertas</h1>
                        <p>Notificaciones automáticas cuando se detecta un lead interesado</p>
                    </div>
                </div>
                <div className="mass-header-actions">
                    <button className="mass-btn-secondary" onClick={handleTest} disabled={testing || saving}>
                        {testing ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                        Enviar Prueba
                    </button>
                    <button className="mass-btn-primary" onClick={handleSave} disabled={saving || testing}>
                        {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                        Guardar Cambios
                    </button>
                </div>
            </div>

            {/* ── Save feedback ── */}
            {saveStatus === 'success' && (
                <div className="alert-feedback success">
                    <CheckCircle size={16} /> Configuración guardada correctamente
                </div>
            )}
            {saveStatus === 'error' && (
                <div className="alert-feedback error">
                    <XCircle size={16} /> Error al guardar. Intenta nuevamente.
                </div>
            )}

            {/* ── Test feedback ── */}
            {testStatus && (
                <div className={`alert-feedback ${testStatus.success ? 'success' : 'error'}`}>
                    {testStatus.success
                        ? <><CheckCircle size={16} /> Notificación de prueba enviada correctamente</>
                        : <><XCircle size={16} /> Error: {testStatus.message}</>
                    }
                </div>
            )}

            <div className="alert-sections">

                {/* ── Section 1: Lead Threshold ── */}
                <div className="alert-card">
                    <div className="alert-card-header">
                        <Shield size={20} />
                        <div>
                            <h3>Nivel Mínimo para Alertas</h3>
                            <p>¿Qué nivel de interés debe tener un lead para generar una notificación?</p>
                        </div>
                    </div>
                    <div className="alert-score-options">
                        {SCORE_OPTIONS.map(opt => (
                            <label key={opt.value} className={`alert-score-option ${config.minScoreForAlert === opt.value ? 'selected' : ''}`}
                                style={config.minScoreForAlert === opt.value ? { borderColor: opt.color, background: '#fafafa' } : {}}>
                                <input
                                    type="radio"
                                    name="minScore"
                                    value={opt.value}
                                    checked={config.minScoreForAlert === opt.value}
                                    onChange={() => update('minScoreForAlert', opt.value)}
                                />
                                <span>{opt.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* ── Section 2: WhatsApp Notifications ── */}
                <div className="alert-card">
                    <div className="alert-card-header">
                        <Smartphone size={20} />
                        <div>
                            <h3>Notificación por WhatsApp</h3>
                            <p>Recibe un mensaje de WhatsApp cuando se detecte un lead</p>
                        </div>
                        <button
                            className={`alert-toggle ${config.whatsappEnabled ? 'on' : 'off'}`}
                            onClick={() => update('whatsappEnabled', !config.whatsappEnabled)}
                        >
                            {config.whatsappEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                    </div>

                    {config.whatsappEnabled && (
                        <div className="alert-card-body">
                            <div className="mass-field">
                                <label>Número receptor (con código de país, sin +)</label>
                                <input
                                    type="text"
                                    placeholder="573001234567"
                                    value={config.whatsappNumber}
                                    onChange={e => update('whatsappNumber', e.target.value)}
                                />
                                <span className="mass-field-hint">Este número recibirá los mensajes de alerta</span>
                            </div>
                            <div className="alert-example">
                                <div className="alert-example-label"><Info size={12} /> Ejemplo de mensaje:</div>
                                <div className="alert-example-bubble">
                                    🔴 <strong>Nuevo Lead Caliente Detectado</strong>{'\n\n'}
                                    👤 Nombre: Juan Pérez{'\n'}
                                    📱 Número: +573001234567{'\n'}
                                    🎯 Campaña: Descuento Agosto{'\n'}
                                    📊 Interés: CALIENTE{'\n'}
                                    💬 Mensaje: "¿Cuál es el precio?"
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Section 3: Email Notifications ── */}
                <div className="alert-card">
                    <div className="alert-card-header">
                        <Mail size={20} />
                        <div>
                            <h3>Notificación por Correo</h3>
                            <p>Recibe un email detallado cuando se detecte un lead</p>
                        </div>
                        <button
                            className={`alert-toggle ${config.emailEnabled ? 'on' : 'off'}`}
                            onClick={() => update('emailEnabled', !config.emailEnabled)}
                        >
                            {config.emailEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                    </div>

                    {config.emailEnabled && (
                        <div className="alert-card-body">
                            {/* Email recipients */}
                            <div className="mass-field">
                                <label>Correos receptores</label>
                                <div className="alert-email-list">
                                    {config.emailRecipients.map(email => (
                                        <div key={email} className="alert-email-chip">
                                            <Mail size={12} />
                                            {email}
                                            <button onClick={() => removeEmail(email)}><X size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="alert-email-add">
                                    <input
                                        type="email"
                                        placeholder="correo@ejemplo.com"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addEmail()}
                                    />
                                    <button className="mass-btn-secondary" onClick={addEmail}>
                                        <Plus size={15} /> Agregar
                                    </button>
                                </div>
                            </div>

                            {/* SMTP Config */}
                            <div className="alert-smtp-section">
                                <h4>Configuración SMTP</h4>
                                <div className="alert-smtp-grid">
                                    <div className="mass-field">
                                        <label>Host SMTP</label>
                                        <input type="text" placeholder="smtp.gmail.com" value={config.smtpHost}
                                            onChange={e => update('smtpHost', e.target.value)} />
                                    </div>
                                    <div className="mass-field">
                                        <label>Puerto</label>
                                        <input type="number" placeholder="587" value={config.smtpPort}
                                            onChange={e => update('smtpPort', parseInt(e.target.value))} />
                                    </div>
                                    <div className="mass-field">
                                        <label>Usuario</label>
                                        <input type="text" placeholder="usuario@gmail.com" value={config.smtpUser}
                                            onChange={e => update('smtpUser', e.target.value)} />
                                    </div>
                                    <div className="mass-field">
                                        <label>Contraseña</label>
                                        <input type="password" placeholder="••••••••" value={config.smtpPass}
                                            onChange={e => update('smtpPass', e.target.value)} />
                                    </div>
                                    <div className="mass-field" style={{ gridColumn: '1 / -1' }}>
                                        <label>Remitente (From)</label>
                                        <input type="email" placeholder="noreply@tuempresa.com" value={config.smtpFrom}
                                            onChange={e => update('smtpFrom', e.target.value)} />
                                    </div>
                                </div>
                                <div className="alert-smtp-hint">
                                    <Info size={13} />
                                    Para Gmail: usa <strong>smtp.gmail.com</strong>, puerto <strong>587</strong>, y genera una <strong>contraseña de aplicación</strong> desde tu cuenta Google.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AlertConfigPage;
