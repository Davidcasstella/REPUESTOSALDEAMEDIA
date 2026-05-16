import React, { useState, useEffect } from 'react';
import { KeyRound, RefreshCw, AlertTriangle, CheckCircle2, Zap, ShieldCheck, Radio } from 'lucide-react';
import api from '../../../services/api';
import socket from '../../../services/socket';
import './KeyRotationStatus.css';

const KeyRotationStatus = () => {
    const [rotationState, setRotationState] = useState(null);
    const [animating, setAnimating] = useState(false);
    const [providers, setProviders] = useState([]);

    // Fetch initial state + providers list
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const [rotRes, provRes] = await Promise.all([
                    api.get('/api/key-rotation/status'),
                    api.get('/api/ai-providers')
                ]);
                if (rotRes.data.success) {
                    // Find the groq state (most relevant)
                    const groqState = rotRes.data.rotation?.groq || null;
                    setRotationState(groqState);
                }
                if (provRes.data.success) {
                    setProviders(provRes.data.providers);
                }
            } catch (err) {
                // Silent — widget is informational only
            }
        };
        fetchStatus();
    }, []);

    // Listen for real-time rotation events
    useEffect(() => {
        const handleRotationEvent = (data) => {
            setRotationState(data);
            if (data.event === 'key-rotated' || data.event === 'all-exhausted' || data.event === 'provider-switched') {
                setAnimating(true);
                setTimeout(() => setAnimating(false), 2000);

                // Re-fetch providers to update the "PROVEEDOR EN USO" section
                api.get('/api/ai-providers').then(res => {
                    if (res.data.success) setProviders(res.data.providers);
                }).catch(() => { });
            }
        };

        socket.on('key-rotation-event', handleRotationEvent);
        return () => socket.off('key-rotation-event', handleRotationEvent);
    }, []);

    // Determine visual state
    const getStatusConfig = () => {
        if (!rotationState || rotationState.status === 'idle') {
            return {
                icon: <KeyRound size={20} />,
                label: 'Esperando actividad',
                className: 'idle',
                description: 'El sistema de rotación está listo'
            };
        }
        if (rotationState.status === 'active') {
            return {
                icon: <CheckCircle2 size={20} />,
                label: 'Key Activa',
                className: 'active',
                description: `Usando ${rotationState.activeKeyMask}`
            };
        }
        if (rotationState.status === 'rotated') {
            return {
                icon: <RefreshCw size={20} />,
                label: '¡Key Rotada!',
                className: 'rotated',
                description: `Cambió a ${rotationState.activeKeyMask} (intento ${rotationState.attempt}/${rotationState.totalKeys})`
            };
        }
        if (rotationState.status === 'exhausted') {
            return {
                icon: <AlertTriangle size={20} />,
                label: 'Keys Agotadas',
                className: 'exhausted',
                description: `Todas las ${rotationState.totalKeys} keys fallaron`
            };
        }
        return {
            icon: <KeyRound size={20} />,
            label: 'Desconocido',
            className: 'idle',
            description: ''
        };
    };

    const config = getStatusConfig();

    // Find the currently active provider
    const activeProvider = providers.find(p => p.isActive) || null;

    return (
        <div className={`key-rotation-widget premium-card ${config.className} ${animating ? 'kr-animating' : ''}`}>
            <div className="kr-header">
                <div className="kr-title-row">
                    <Zap size={18} className="kr-bolt-icon" />
                    <h3 className="kr-title">Rotación de Keys</h3>
                </div>
                <div className={`kr-status-badge ${config.className}`}>
                    <span className="kr-status-dot" />
                    {config.label}
                </div>
            </div>

            <div className="kr-body">
                {/* Current active provider — always visible */}
                {activeProvider ? (
                    <div className="kr-current-provider">
                        <div className="kr-current-label">
                            <Radio size={12} className="kr-live-dot" />
                            <span>PROVEEDOR EN USO</span>
                        </div>
                        <div className="kr-current-info">
                            <div className="kr-current-icon">
                                <ShieldCheck size={22} />
                            </div>
                            <div className="kr-current-details">
                                <span className="kr-current-name">{activeProvider.name}</span>
                                <span className="kr-current-key">{activeProvider.apiKey}</span>
                            </div>
                            <div className="kr-current-live-badge">
                                <span className="kr-live-indicator" />
                                LIVE
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="kr-current-provider kr-no-provider">
                        <div className="kr-current-label">
                            <span>PROVEEDOR EN USO</span>
                        </div>
                        <div className="kr-current-info">
                            <div className="kr-current-icon idle">
                                <AlertTriangle size={22} />
                            </div>
                            <div className="kr-current-details">
                                <span className="kr-current-name dim">Ninguno activo</span>
                                <span className="kr-current-key">Activa un proveedor para comenzar</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rotation state display */}
                <div className={`kr-active-display ${config.className}`}>
                    <div className="kr-icon-container">
                        {config.icon}
                    </div>
                    <div className="kr-info">
                        <span className="kr-key-mask">{config.description}</span>
                        {rotationState?.timestamp && (
                            <span className="kr-timestamp">
                                {new Date(rotationState.timestamp).toLocaleTimeString('es-CO')}
                            </span>
                        )}
                    </div>
                </div>

                {/* Key indicators — all registered providers */}
                {providers.length > 0 && (
                    <div className="kr-keys-strip">
                        <span className="kr-keys-label">KEYS REGISTRADAS ({providers.length})</span>
                        <div className="kr-key-slots">
                            {providers.map((p, idx) => {
                                const isCurrentKey = rotationState?.activeKeyMask && p.apiKey?.includes(rotationState.activeKeyMask?.slice(-4));
                                return (
                                    <div
                                        key={p.id}
                                        className={`kr-key-slot ${p.isActive ? 'primary' : ''} ${isCurrentKey ? 'in-use' : ''}`}
                                        title={`${p.name} — ${p.apiKey}`}
                                    >
                                        <span className="kr-key-num">{idx + 1}</span>
                                        <span className="kr-key-provider-tag">{p.name}</span>
                                        <span className="kr-key-preview">{p.apiKey}</span>
                                        {p.isActive && <span className="kr-key-active-dot" />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KeyRotationStatus;
