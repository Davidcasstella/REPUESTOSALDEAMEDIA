import React, { useState, useEffect } from 'react';
import { RefreshCw, WifiOff, ShieldCheck, QrCode, Info, Phone, Key } from 'lucide-react';
import socket from '../services/socket';
import api from '../services/api';

const WhatsAppPage = () => {
    const [qr, setQr] = useState(null);
    const [status, setStatus] = useState('disconnected'); // disconnected, connecting, waiting_qr, connected
    const [loading, setLoading] = useState(false);
    
    // New pairing code linking states
    const [linkMode, setLinkMode] = useState('qr'); // qr, code
    const [phoneNumber, setPhoneNumber] = useState('');
    const [pairingCode, setPairingCode] = useState(null);
    const [codeLoading, setCodeLoading] = useState(false);
    const [codeError, setCodeError] = useState('');

    useEffect(() => {
        // Fetch current status on mount
        const fetchStatus = async () => {
            try {
                const { data } = await api.get('/api/whatsapp/status');
                if (data.status) setStatus(data.status);
                if (data.qr) setQr(data.qr);
                if (data.pairingCode) {
                    setPairingCode(data.pairingCode);
                    setLinkMode('code');
                }
            } catch (error) {
                console.error('Error al obtener estado inicial:', error);
            }
        };

        fetchStatus();

        // Socket listeners for updates
        socket.on('whatsapp-status', (data) => {
            if (data.status) setStatus(data.status);
            if (data.qr) setQr(data.qr);
            if (data.pairingCode) {
                setPairingCode(data.pairingCode);
            } else if (data.qr) {
                setPairingCode(null);
            }
        });

        socket.on('whatsapp-update', (data) => {
            if (data.status) setStatus(data.status);
            if (data.qr) setQr(data.qr);
            if (data.pairingCode) {
                setPairingCode(data.pairingCode);
            } else if (data.qr) {
                setPairingCode(null);
            }
            if (data.status === 'connected') {
                setQr(null);
                setPairingCode(null);
            }
        });

        return () => {
            socket.off('whatsapp-status');
            socket.off('whatsapp-update');
        };
    }, []);

    const handleRestart = async () => {
        setLoading(true);
        setPairingCode(null);
        try {
            await api.post('/api/whatsapp/restart');
        } catch (error) {
            console.error('Error al reiniciar WhatsApp:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClearSession = async () => {
        if (!window.confirm('¿Estás seguro de que quieres cerrar sesión y limpiar todas las credenciales?')) return;
        setLoading(true);
        setPairingCode(null);
        try {
            await api.post('/api/whatsapp/clear-session');
        } catch (error) {
            console.error('Error al limpiar sesión:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestPairingCode = async (e) => {
        if (e) e.preventDefault();
        if (!phoneNumber.trim()) {
            setCodeError('El número de teléfono es requerido');
            return;
        }

        setCodeLoading(true);
        setCodeError('');
        try {
            const { data } = await api.post('/api/whatsapp/request-pairing-code', {
                phoneNumber: phoneNumber.trim()
            });
            if (data.success && data.code) {
                setPairingCode(data.code);
            } else {
                setCodeError(data.message || 'Error al solicitar el código de emparejamiento');
            }
        } catch (error) {
            console.error('Error al solicitar pairing code:', error);
            setCodeError(error.response?.data?.message || 'Error al conectar con el servidor');
        } finally {
            setCodeLoading(false);
        }
    };

    const getStatusInfo = () => {
        switch (status) {
            case 'connected':
                return {
                    text: 'WhatsApp Conectado',
                    description: 'Tu sesión está activa y lista para enviar mensajes.',
                    color: 'success',
                    icon: <ShieldCheck size={48} className="text-success" />
                };
            case 'waiting_qr':
                return {
                    text: linkMode === 'code' ? 'Introduce el Código' : 'Escanea el Código QR',
                    description: linkMode === 'code' 
                        ? 'Vincula tu número ingresando el código de 8 dígitos en tu teléfono.' 
                        : 'Abre WhatsApp en tu teléfono > Dispositivos vinculados > Vincular un dispositivo.',
                    color: 'warning',
                    icon: linkMode === 'code' ? <Key size={48} className="text-warning" /> : <QrCode size={48} className="text-warning" />
                };
            case 'connecting':
                return {
                    text: 'Conectando...',
                    description: 'Estamos preparando el motor de vinculación.',
                    color: 'info',
                    icon: <RefreshCw size={48} className="text-info spin" />
                };
            default:
                return {
                    text: 'Desconectado',
                    description: 'No hay una sesión activa de WhatsApp.',
                    color: 'error',
                    icon: <WifiOff size={48} className="text-error" />
                };
        }
    };

    const info = getStatusInfo();

    return (
        <div className="whatsapp-page-container">
            <header className="page-header" style={{ textAlign: 'center' }}>
                <h1>Vinculación de WhatsApp</h1>
            </header>

            <div className="whatsapp-grid">
                {/* Columna Izquierda: QR/Código y Estado */}
                <article className="whatsapp-main-card premium-card" style={{ padding: '1.25rem' }}>
                    <div className="card-header">
                        <QrCode size={20} />
                        <h3>Conexión del Dispositivo</h3>
                    </div>

                    <div className="status-banner">
                        <div className={`status-dot ${status}`}></div>
                        <span className="status-text">{info.text}</span>
                    </div>

                    {status !== 'connected' && (
                        <div className="link-mode-tabs">
                            <button
                                type="button"
                                className={`link-tab-btn ${linkMode === 'qr' ? 'active' : ''}`}
                                onClick={() => setLinkMode('qr')}
                                disabled={status === 'connecting'}
                            >
                                <QrCode size={16} /> Código QR
                            </button>
                            <button
                                type="button"
                                className={`link-tab-btn ${linkMode === 'code' ? 'active' : ''}`}
                                onClick={() => setLinkMode('code')}
                                disabled={status === 'connecting'}
                            >
                                <Key size={16} /> Vincular con Código
                            </button>
                        </div>
                    )}

                    <div className="qr-wrapper-section">
                        {status === 'connected' ? (
                            <div className="connected-display" style={{ textAlign: 'center', padding: '1rem' }}>
                                <ShieldCheck size={64} className="text-success" style={{ margin: '0 auto 1.5rem' }} />
                                <h2>¡Dispositivo Vinculado!</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>El motor de WhatsApp está operando correctamente.</p>
                            </div>
                        ) : linkMode === 'qr' ? (
                            <div className="qr-scan-area">
                                <div className="qr-frame">
                                    {qr ? (
                                        <img src={qr} alt="WhatsApp QR" />
                                    ) : (
                                        <div className="qr-loading" style={{ textAlign: 'center', padding: '2rem' }}>
                                            <RefreshCw className="spin" size={48} style={{ margin: '0 auto 1rem', display: 'block' }} />
                                            <p>Generando código...</p>
                                        </div>
                                    )}
                                </div>
                                <p className="qr-hint">Escanea este código desde la app de WhatsApp</p>
                            </div>
                        ) : (
                            <div className="pairing-code-section">
                                {pairingCode ? (
                                    <div className="pairing-code-display">
                                        <span className="pairing-code-label">Código de Vinculación</span>
                                        <span className="pairing-code-text">{pairingCode}</span>
                                        <p className="qr-hint" style={{ marginTop: '0.5rem', maxWidth: '260px' }}>
                                            Ingresa este código en tu teléfono móvil cuando se te solicite.
                                        </p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleRequestPairingCode} className="pairing-form">
                                        <div className="phone-input-wrapper">
                                            <label htmlFor="phoneNumber">Número de Teléfono (con código de país)</label>
                                            <input
                                                id="phoneNumber"
                                                type="tel"
                                                className="phone-input-field"
                                                placeholder="Ej: 573028599105"
                                                value={phoneNumber}
                                                onChange={(e) => setPhoneNumber(e.target.value)}
                                                disabled={codeLoading}
                                            />
                                            <p className="qr-hint" style={{ textAlign: 'left', marginTop: '0.25rem' }}>
                                                Ingresa el número internacional completo (sin espacios ni el signo +).
                                            </p>
                                        </div>
                                        {codeError && <div className="code-error-msg">{codeError}</div>}
                                        <button
                                            type="submit"
                                            className="btn-premium primary wide"
                                            disabled={codeLoading || !phoneNumber.trim()}
                                            style={{ marginTop: '0.5rem' }}
                                        >
                                            {codeLoading ? (
                                                <>
                                                    <RefreshCw className="spin" size={18} /> Generando...
                                                </>
                                            ) : (
                                                <>
                                                    <Phone size={18} /> Generar Código
                                                </>
                                            )}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="whatsapp-actions">
                        <button
                            className="btn-premium primary wide"
                            onClick={handleRestart}
                            disabled={loading || status === 'connected'}
                        >
                            <RefreshCw className={loading ? 'spin' : ''} size={18} />
                            {loading ? 'Generando...' : linkMode === 'code' ? 'Reiniciar Proceso' : 'Nuevo Código QR'}
                        </button>
                        <button
                            className="btn-premium danger wide"
                            onClick={handleClearSession}
                            disabled={loading}
                        >
                            <WifiOff size={18} /> Cerrar Sesión
                        </button>
                    </div>
                </article>

                {/* Columna Derecha: Instrucciones y Seguridad */}
                <aside className="whatsapp-side-info">
                    <section className="instruction-card premium-card">
                        <div className="card-header">
                            <Info size={20} />
                            <h3>¿Cómo vincular?</h3>
                        </div>
                        <div className="steps-list">
                            {linkMode === 'qr' ? (
                                <>
                                    <div className="step-item">
                                        <div className="step-badge">1</div>
                                        <p>Abre <strong>WhatsApp</strong> en tu teléfono móvil.</p>
                                    </div>
                                    <div className="step-item">
                                        <div className="step-badge">2</div>
                                        <p>Ve a <strong>Configuración</strong> o <strong>Menú</strong>.</p>
                                    </div>
                                    <div className="step-item">
                                        <div className="step-badge">3</div>
                                        <p>Selecciona <strong>Dispositivos vinculados</strong>.</p>
                                    </div>
                                    <div className="step-item">
                                        <div className="step-badge">4</div>
                                        <p>Toca en <strong>Vincular un dispositivo</strong> y apunta al QR.</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="step-item">
                                        <div className="step-badge">1</div>
                                        <p>Abre <strong>WhatsApp</strong> en tu teléfono móvil.</p>
                                    </div>
                                    <div className="step-item">
                                        <div className="step-badge">2</div>
                                        <p>Ve a <strong>Dispositivos vinculados</strong> en el menú.</p>
                                    </div>
                                    <div className="step-item">
                                        <div className="step-badge">3</div>
                                        <p>Toca en <strong>Vincular un dispositivo</strong>.</p>
                                    </div>
                                    <div className="step-item">
                                        <div className="step-badge">4</div>
                                        <p>Selecciona <strong>Vincular con el número de teléfono</strong> abajo e introduce el código de 8 dígitos.</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    <section className="security-card premium-card">
                        <ShieldCheck size={32} className="text-success" />
                        <div className="security-info">
                            <h4>Conexión Segura</h4>
                            <p>Tus datos y mensajes están protegidos por el cifrado oficial.</p>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default WhatsAppPage;
