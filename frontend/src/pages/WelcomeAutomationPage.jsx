import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import {
    BellRing, Power, Upload, Trash2, Clock, MessageSquare,
    CheckCircle, XCircle, Users, Calendar, AlertCircle, Save,
    RotateCcw, Search, RefreshCw, Settings2, UserCheck, Video
} from 'lucide-react';
import UserControlPanel from '../components/ui/UserControlPanel';

const WelcomeAutomationPage = () => {
    // ── Tab state ───────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('config');

    // ── Config state ────────────────────────────────────────────────────
    const [config, setConfig] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resettingConfig, setResettingConfig] = useState(false);
    const [uploadingAudio, setUploadingAudio] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [toast, setToast] = useState(null);

    // Local editable fields
    const [messageText, setMessageText] = useState('');
    const [cooldownHours, setCooldownHours] = useState(24);
    const [isEnabled, setIsEnabled] = useState(false);
    const [audioFileName, setAudioFileName] = useState(null);
    const [videoFileName, setVideoFileName] = useState(null);
    const [videoEnabled, setVideoEnabled] = useState(false);
    const [greetMode, setGreetMode] = useState('none');
    const [campaignContextHours, setCampaignContextHours] = useState(24);

    const fileInputRef = useRef(null);
    const videoInputRef = useRef(null);
    const dropRef = useRef(null);
    const videoDropRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [draggingVideo, setDraggingVideo] = useState(false);

    // ── Users state (now managed by UserControlPanel component) ────────

    // ── Load initial data ───────────────────────────────────────────────
    useEffect(() => {
        loadAll();
    }, []);

    // Users auto-refresh now handled by UserControlPanel component

    const loadAll = async () => {
        setLoading(true);
        try {
            const [cfgRes, statsRes] = await Promise.all([
                api.get('/api/welcome-automation/config'),
                api.get('/api/welcome-automation/stats')
            ]);
            const cfg = cfgRes.data.data;
            setConfig(cfg);
            setIsEnabled(cfg.isEnabled);
            setMessageText(cfg.messageText || '');
            setCooldownHours(cfg.cooldownHours || 24);
            setAudioFileName(cfg.audioFilePath ? 'welcome-audio.ogg' : null);
            setVideoFileName(cfg.videoFilePath ? 'welcome-video.mp4' : null);
            setVideoEnabled(cfg.videoEnabled || false);
            setGreetMode(cfg.greetMode || 'none');
            setCampaignContextHours(cfg.campaignContextHours || 24);
            setStats(statsRes.data.data);
        } catch (err) {
            showToast('error', 'Error cargando configuración');
        } finally {
            setLoading(false);
        }
    };

    // loadUsers now handled by UserControlPanel component

    // ── Toast helper ────────────────────────────────────────────────────
    const showToast = (type, msg) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Save all config ─────────────────────────────────────────────────
    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const { data } = await api.put('/api/welcome-automation/config', {
                isEnabled,
                messageText,
                cooldownHours: Number(cooldownHours),
                videoEnabled,
                greetMode,
                campaignContextHours: Number(campaignContextHours)
            });
            setConfig(data.data);
            showToast('success', 'Configuración guardada correctamente');
        } catch {
            showToast('error', 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    // ── Reset config to defaults ────────────────────────────────────────
    const handleResetConfig = async () => {
        if (resettingConfig) return;
        if (!window.confirm('¿Estás seguro de resetear toda la configuración a valores por defecto?')) return;
        setResettingConfig(true);
        try {
            const { data } = await api.post('/api/welcome-automation/reset-config');
            const cfg = data.data;
            setConfig(cfg);
            setIsEnabled(cfg.isEnabled);
            setMessageText(cfg.messageText || '');
            setCooldownHours(cfg.cooldownHours || 24);
            setAudioFileName(null);
            setVideoFileName(null);
            setVideoEnabled(false);
            setGreetMode('none');
            showToast('success', 'Configuración reseteada a valores por defecto');
        } catch {
            showToast('error', 'Error al resetear configuración');
        } finally {
            setResettingConfig(false);
        }
    };

    // ── Toggle only (quick action) ──────────────────────────────────────
    const handleToggle = async () => {
        const newVal = !isEnabled;
        setIsEnabled(newVal);
        try {
            await api.put('/api/welcome-automation/config', { isEnabled: newVal });
            showToast('success', newVal ? 'Automatización activada' : 'Automatización desactivada');
        } catch {
            setIsEnabled(!newVal); // rollback
            showToast('error', 'Error al cambiar estado');
        }
    };

    // ── Audio upload ────────────────────────────────────────────────────
    const uploadAudio = async (file) => {
        if (!file) return;
        if (!file.name.endsWith('.ogg')) {
            showToast('error', 'Solo se aceptan archivos .ogg');
            return;
        }
        setUploadingAudio(true);
        try {
            const form = new FormData();
            form.append('audio', file);
            await api.post('/api/welcome-automation/audio', form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setAudioFileName(file.name);
            showToast('success', 'Audio subido correctamente');
            loadAll();
        } catch (err) {
            showToast('error', err.response?.data?.error || 'Error al subir audio');
        } finally {
            setUploadingAudio(false);
        }
    };

    const handleFileInput = (e) => uploadAudio(e.target.files[0]);

    const handleDeleteAudio = async () => {
        try {
            await api.delete('/api/welcome-automation/audio');
            setAudioFileName(null);
            showToast('success', 'Audio eliminado');
        } catch {
            showToast('error', 'Error al eliminar audio');
        }
    };

    // ── Video upload ─────────────────────────────────────────────────────
    const uploadVideoFile = async (file) => {
        if (!file) return;
        if (!file.name.endsWith('.mp4')) {
            showToast('error', 'Solo se aceptan archivos .mp4');
            return;
        }
        setUploadingVideo(true);
        try {
            const form = new FormData();
            form.append('video', file);
            await api.post('/api/welcome-automation/video', form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setVideoFileName(file.name);
            setVideoEnabled(true);
            showToast('success', 'Video subido correctamente');
            loadAll();
        } catch (err) {
            showToast('error', err.response?.data?.error || 'Error al subir video');
        } finally {
            setUploadingVideo(false);
        }
    };

    const handleVideoInput = (e) => uploadVideoFile(e.target.files[0]);

    const handleDeleteVideo = async () => {
        try {
            await api.delete('/api/welcome-automation/video');
            setVideoFileName(null);
            setVideoEnabled(false);
            showToast('success', 'Video eliminado');
        } catch {
            showToast('error', 'Error al eliminar video');
        }
    };

    const handleToggleVideo = async () => {
        const newVal = !videoEnabled;
        setVideoEnabled(newVal);
        try {
            await api.put('/api/welcome-automation/config', { videoEnabled: newVal });
            showToast('success', newVal ? 'Video activado' : 'Video desactivado');
        } catch {
            setVideoEnabled(!newVal);
            showToast('error', 'Error al cambiar estado del video');
        }
    };

    // ── Drag & drop (audio) ──────────────────────────────────────────────
    const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = () => setDragging(false);
    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        uploadAudio(file);
    };

    // ── Drag & drop (video) ──────────────────────────────────────────────
    const onDragOverVideo = (e) => { e.preventDefault(); setDraggingVideo(true); };
    const onDragLeaveVideo = () => setDraggingVideo(false);
    const onDropVideo = (e) => {
        e.preventDefault();
        setDraggingVideo(false);
        const file = e.dataTransfer.files[0];
        uploadVideoFile(file);
    };

    // Per-user actions and helpers now handled by UserControlPanel component

    // ── Loading state ───────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="dashboard-content">
                <div className="wa-skeleton-block" style={{ height: 120, borderRadius: 16, marginBottom: 16 }} />
                <div className="wa-skeleton-block" style={{ height: 280, borderRadius: 16, marginBottom: 16 }} />
                <div className="wa-skeleton-block" style={{ height: 160, borderRadius: 16 }} />
            </div>
        );
    }

    return (
        <div className="dashboard-content wa-page">
            {/* ── Toast ── */}
            {toast && (
                <div className={`wa-toast ${toast.type === 'success' ? 'wa-toast-ok' : 'wa-toast-err'}`}>
                    {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {toast.msg}
                </div>
            )}

            {/* ── Page Header ── */}
            <header className="analytics-page-header">
                <div>
                    <h1 className="analytics-page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <BellRing size={28} />
                        Control de Bienvenida 24H
                    </h1>
                    <p className="analytics-page-sub">
                        Gestión completa del sistema de bienvenida automática
                    </p>
                </div>

                {/* Master toggle (large) */}
                <div className="wa-header-toggle">
                    <span className="wa-toggle-label-text" style={{ color: isEnabled ? '#1a1a1a' : 'var(--text-muted)' }}>
                        {isEnabled ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                    <button
                        className={`ai-toggle-btn-large ${isEnabled ? 'toggle-on' : 'toggle-off'}`}
                        onClick={handleToggle}
                    >
                        <span className="ai-toggle-thumb-large" />
                    </button>
                </div>
            </header>

            {/* ── Stats bar ── */}
            <div className="wa-stats-row">
                <div className="wa-stat-card premium-card">
                    <Users size={20} style={{ color: '#1a1a1a' }} />
                    <div>
                        <span className="wa-stat-value">{stats?.totalUsers ?? 0}</span>
                        <span className="wa-stat-label">Clientes registrados</span>
                    </div>
                </div>
                <div className="wa-stat-card premium-card">
                    <Calendar size={20} style={{ color: '#1a1a1a' }} />
                    <div>
                        <span className="wa-stat-value">{stats?.sentLast24h ?? 0}</span>
                        <span className="wa-stat-label">Enviados hoy</span>
                    </div>
                </div>
                <div className="wa-stat-card premium-card">
                    <Clock size={20} style={{ color: '#1a1a1a' }} />
                    <div>
                        <span className="wa-stat-value">{cooldownHours}h</span>
                        <span className="wa-stat-label">Cooldown activo</span>
                    </div>
                </div>
                <div className={`wa-stat-card premium-card ${isEnabled ? 'wa-stat-on' : 'wa-stat-off'}`}>
                    <Power size={20} style={{ color: isEnabled ? '#1a1a1a' : '#1a1a1a' }} />
                    <div>
                        <span className="wa-stat-value" style={{ color: isEnabled ? '#1a1a1a' : '#1a1a1a' }}>
                            {isEnabled ? 'ON' : 'OFF'}
                        </span>
                        <span className="wa-stat-label">Estado del módulo</span>
                    </div>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="wa-tabs">
                <button
                    className={`wa-tab ${activeTab === 'config' ? 'wa-tab-active' : ''}`}
                    onClick={() => setActiveTab('config')}
                >
                    <Settings2 size={16} />
                    Configuración
                </button>
                <button
                    className={`wa-tab ${activeTab === 'users' ? 'wa-tab-active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    <UserCheck size={16} />
                    Control de Usuarios
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════════
                TAB 1: CONFIGURATION
                ═══════════════════════════════════════════════════════════ */}
            {activeTab === 'config' && (
                <div className="wa-grid">
                    {/* ── LEFT COLUMN: Message + Cooldown ── */}
                    <div className="wa-col">

                        {/* Message editor */}
                        <div className="premium-card wa-card">
                            <div className="wa-card-header">
                                <MessageSquare size={20} style={{ color: '#1a1a1a' }} />
                                <span className="wa-card-title">Mensaje de Bienvenida</span>
                            </div>
                            <p className="wa-card-desc" style={{ marginBottom: '1rem' }}>
                                Este texto se enviará <strong>después del audio</strong>. <br/>
                                <span style={{ color: '#1a1a1a', fontSize: '0.85rem' }}>💡 Tip: Si quieres mandar múltiples mensajes separados, usa la opción "+ Añadir otro globo de mensaje".</span>
                            </p>
                            <textarea
                                className="wa-textarea"
                                value={messageText}
                                onChange={e => setMessageText(e.target.value)}
                                placeholder="Escribe tu mensaje de bienvenida aquí..."
                                rows={10}
                                maxLength={10000}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                <button 
                                    className="wa-refresh-btn" 
                                    style={{ margin: 0, padding: '6px 12px', fontSize: '0.85rem', background: 'rgba(26, 26, 26, 0.1)', color: '#1a1a1a', border: '1px solid rgba(26, 26, 26, 0.2)' }}
                                    onClick={() => setMessageText(prev => prev + '\n\n---MSG---\n\n')}
                                    title="Separa el texto en múltiples globos de mensaje"
                                >
                                    + Añadir otro globo de mensaje
                                </button>
                                <div className="wa-char-count" style={{ marginTop: 0 }}>{messageText.length} / 10000</div>
                            </div>
                        </div>

                        {/* Greet Mode */}
                        <div className="premium-card wa-card">
                            <div className="wa-card-header">
                                <UserCheck size={20} style={{ color: '#1a1a1a' }} />
                                <span className="wa-card-title">Saludar con Nombre</span>
                            </div>
                            <p className="wa-card-desc" style={{ marginBottom: '1rem' }}>
                                Selecciona si deseas incluir el nombre del cliente en el mensaje de bienvenida.
                                Usa el marcador <code>{"{nombre}"}</code> en el texto de tu mensaje para indicar dónde aparecerá.
                            </p>
                            <div className="wa-select-row">
                                <select
                                    className="wa-select"
                                    value={greetMode}
                                    onChange={e => setGreetMode(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(26, 26, 26, 0.2)',
                                        background: '#fff',
                                        color: '#1a1a1a',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="none">No saludar con nombre (reemplazar por vacío)</option>
                                    <option value="whatsapp">Usar nombre de WhatsApp (enviado por la app)</option>
                                    <option value="dashboard">Usar nombre guardado en Dashboard (modificable en el chat)</option>
                                </select>
                            </div>
                        </div>

                        {/* Cooldown */}
                        <div className="premium-card wa-card">
                            <div className="wa-card-header">
                                <Clock size={20} style={{ color: '#1a1a1a' }} />
                                <span className="wa-card-title">Cooldown (horas)</span>
                            </div>
                            <p className="wa-card-desc">
                                Tiempo mínimo entre bienvenidas para el mismo cliente. Por defecto: 24 horas.
                            </p>
                            <div className="wa-cooldown-row">
                                <input
                                    type="number"
                                    className="wa-number-input"
                                    value={cooldownHours}
                                    onChange={e => setCooldownHours(Math.max(1, Number(e.target.value)))}
                                    min={1}
                                    max={720}
                                />
                                <span className="wa-cooldown-unit">horas</span>
                                {/* Quick presets */}
                                {[12, 24, 48, 168].map(h => (
                                    <button
                                        key={h}
                                        className={`wa-preset-btn ${cooldownHours === h ? 'active' : ''}`}
                                        onClick={() => setCooldownHours(h)}
                                    >
                                        {h === 168 ? '7d' : `${h}h`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="wa-action-buttons">
                            <button className="wa-save-btn" onClick={handleSave} disabled={saving}>
                                <Save size={18} />
                                {saving ? 'Guardando...' : 'Guardar configuración'}
                            </button>
                            <button
                                className="wa-reset-defaults-btn"
                                onClick={handleResetConfig}
                                disabled={resettingConfig}
                            >
                                <Trash2 size={16} />
                                {resettingConfig ? 'Reseteando...' : 'Resetear a valores por defecto'}
                            </button>
                        </div>
                    </div>

                    {/* ── RIGHT COLUMN: Audio ── */}
                    <div className="wa-col">
                        <div className="premium-card wa-card">
                            <div className="wa-card-header">
                                <BellRing size={20} style={{ color: '#00ee00' }} />
                                <span className="wa-card-title">Audio de Bienvenida (.ogg)</span>
                            </div>
                            <p className="wa-card-desc">
                                Se envía <strong>antes del mensaje</strong> como nota de voz (PTT). Si no hay audio, solo se envía el texto.
                            </p>

                            {/* Current audio status */}
                            {audioFileName ? (
                                <div className="wa-audio-present">
                                    <div className="wa-audio-info">
                                        <div className="wa-audio-icon">🔊</div>
                                        <div>
                                            <span className="wa-audio-name">{audioFileName}</span>
                                            <span className="wa-audio-badge">Activo</span>
                                        </div>
                                    </div>
                                    <button className="wa-audio-delete-btn" onClick={handleDeleteAudio}>
                                        <Trash2 size={16} />
                                        Eliminar
                                    </button>
                                </div>
                            ) : (
                                <div className="wa-audio-empty">
                                    <span className="wa-audio-empty-icon">🔇</span>
                                    <span>Sin audio configurado — solo se enviará texto</span>
                                </div>
                            )}

                            {/* Drop zone */}
                            <div
                                ref={dropRef}
                                className={`wa-dropzone ${dragging ? 'wa-dropzone-drag' : ''} ${uploadingAudio ? 'wa-dropzone-loading' : ''}`}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                onDrop={onDrop}
                                onClick={() => !uploadingAudio && fileInputRef.current?.click()}
                            >
                                {uploadingAudio ? (
                                    <div className="wa-upload-spinner" />
                                ) : (
                                    <>
                                        <Upload size={28} style={{ color: '#00ee00', marginBottom: 8 }} />
                                        <span className="wa-dropzone-text">
                                            {dragging ? 'Suelta el archivo aquí...' : 'Arrastra un .ogg o haz clic para seleccionar'}
                                        </span>
                                        <span className="wa-dropzone-hint">Máximo 10 MB · Solo formato .ogg</span>
                                    </>
                                )}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".ogg,audio/ogg"
                                style={{ display: 'none' }}
                                onChange={handleFileInput}
                            />
                        </div>

                        {/* Video card */}
                        <div className="premium-card wa-card">
                            <div className="wa-card-header" style={{ justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Video size={20} style={{ color: '#1a1a1a' }} />
                                    <span className="wa-card-title">Video de Bienvenida (.mp4)</span>
                                </div>
                                {videoFileName && (
                                    <button
                                        className={`ai-toggle-btn ${videoEnabled ? 'toggle-on' : 'toggle-off'}`}
                                        onClick={handleToggleVideo}
                                        title={videoEnabled ? 'Desactivar video' : 'Activar video'}
                                    >
                                        <span className="ai-toggle-thumb" />
                                    </button>
                                )}
                            </div>
                            <p className="wa-card-desc">
                                Se envía <strong>después del texto</strong> y <strong>antes de la respuesta IA</strong>. Puedes activar/desactivar sin eliminarlo.
                            </p>

                            {videoFileName ? (
                                <div className="wa-audio-present">
                                    <div className="wa-audio-info">
                                        <div className="wa-audio-icon">🎬</div>
                                        <div>
                                            <span className="wa-audio-name">{videoFileName}</span>
                                            <span className={`wa-audio-badge ${videoEnabled ? '' : 'wa-badge-off'}`}
                                                style={!videoEnabled ? { background: '#374151', color: '#9ca3af' } : {}}
                                            >
                                                {videoEnabled ? 'Activo' : 'Desactivado'}
                                            </span>
                                        </div>
                                    </div>
                                    <button className="wa-audio-delete-btn" onClick={handleDeleteVideo}>
                                        <Trash2 size={16} />
                                        Eliminar
                                    </button>
                                </div>
                            ) : (
                                <div className="wa-audio-empty">
                                    <span className="wa-audio-empty-icon">📭</span>
                                    <span>Sin video configurado — solo se enviará audio y texto</span>
                                </div>
                            )}

                            {/* Video drop zone */}
                            <div
                                ref={videoDropRef}
                                className={`wa-dropzone ${draggingVideo ? 'wa-dropzone-drag' : ''} ${uploadingVideo ? 'wa-dropzone-loading' : ''}`}
                                onDragOver={onDragOverVideo}
                                onDragLeave={onDragLeaveVideo}
                                onDrop={onDropVideo}
                                onClick={() => !uploadingVideo && videoInputRef.current?.click()}
                            >
                                {uploadingVideo ? (
                                    <div className="wa-upload-spinner" />
                                ) : (
                                    <>
                                        <Upload size={28} style={{ color: '#1a1a1a', marginBottom: 8 }} />
                                        <span className="wa-dropzone-text">
                                            {draggingVideo ? 'Suelta el archivo aquí...' : 'Arrastra un .mp4 o haz clic para seleccionar'}
                                        </span>
                                        <span className="wa-dropzone-hint">Máximo 50 MB · Solo formato .mp4</span>
                                    </>
                                )}
                            </div>
                            <input
                                ref={videoInputRef}
                                type="file"
                                accept=".mp4,video/mp4"
                                style={{ display: 'none' }}
                                onChange={handleVideoInput}
                            />
                        </div>

                        {/* Flow diagram */}
                        <div className="premium-card wa-card wa-flow-card">
                            <div className="wa-card-header">
                                <span className="wa-card-title">Flujo de envío</span>
                            </div>
                            <div className="wa-flow">
                                <div className="wa-flow-step">
                                    <span className="wa-flow-num">1</span>
                                    <span>Cliente envía mensaje</span>
                                </div>
                                <div className="wa-flow-arrow">↓</div>
                                <div className="wa-flow-step">
                                    <span className="wa-flow-num">2</span>
                                    <span>¿Módulo activo + cooldown expirado?</span>
                                </div>
                                <div className="wa-flow-arrow">↓ SÍ</div>
                                <div className="wa-flow-step wa-flow-action">
                                    <span>🔊 Envía audio .ogg</span>
                                </div>
                                <div className="wa-flow-arrow">↓</div>
                                <div className="wa-flow-step wa-flow-action">
                                    <span>📝 Envía mensaje texto</span>
                                </div>
                                <div className="wa-flow-arrow">↓</div>
                                <div className="wa-flow-step wa-flow-action">
                                    <span>🎬 Envía video .mp4</span>
                                </div>
                                <div className="wa-flow-arrow">↓</div>
                                <div className="wa-flow-step">
                                    <span className="wa-flow-num">3</span>
                                    <span>IA responde la pregunta</span>
                                </div>
                                <div className="wa-flow-arrow">↓</div>
                                <div className="wa-flow-step">
                                    <span className="wa-flow-num">4</span>
                                    <span>Si IA no sabe → "ok" + cooldown 24h</span>
                                </div>
                            </div>

                        {/* Campaign Context Expiration */}
                        <div className="premium-card wa-card">
                            <div className="wa-card-header">
                                <Clock size={20} style={{ color: '#1a1a1a' }} />
                                <span className="wa-card-title">Contexto de Campaña (horas)</span>
                            </div>
                            <p className="wa-card-desc">
                                Si un cliente recibió una campaña masiva hace menos de este tiempo, NO se le enviará el saludo de bienvenida (se asume que está en flujo de campaña). Después de este tiempo, se trata como conversación nueva.
                            </p>
                            <div className="wa-cooldown-row">
                                <input
                                    type="number"
                                    className="wa-number-input"
                                    value={campaignContextHours}
                                    onChange={e => setCampaignContextHours(Math.max(1, Number(e.target.value)))}
                                    min={1}
                                    max={720}
                                />
                                <span className="wa-cooldown-unit">horas</span>
                                {[12, 24, 48, 72].map(h => (
                                    <button
                                        key={h}
                                        className={`wa-preset-btn ${campaignContextHours === h ? 'active' : ''}`}
                                        onClick={() => setCampaignContextHours(h)}
                                    >
                                        {h}h
                                    </button>
                                ))}
                            </div>
                        </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                TAB 2: USER CONTROL (extracted to reusable component)
                ═══════════════════════════════════════════════════════════ */}
            {activeTab === 'users' && (
                <UserControlPanel />
            )}
        </div>
    );
};

export default WelcomeAutomationPage;
