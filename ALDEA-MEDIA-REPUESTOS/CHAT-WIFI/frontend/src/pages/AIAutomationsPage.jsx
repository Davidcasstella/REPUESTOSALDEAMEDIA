import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Zap, CreditCard, Mic, Loader2 } from 'lucide-react';

const AIAutomationsPage = () => {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(null); // which toggle is in progress

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const { data } = await api.get('/api/ai-automations/config');
            setConfig(data.config);
        } catch (err) {
            console.error('Error fetching automations config:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (field) => {
        if (toggling) return;
        setToggling(field);
        try {
            const { data } = await api.put('/api/ai-automations/config', {
                [field]: !config[field]
            });
            setConfig(data.config);
        } catch (err) {
            console.error('Error updating automation:', err);
        } finally {
            setToggling(null);
        }
    };

    if (loading) {
        return (
            <div className="dashboard-content analytics-dashboard">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '80px 0', color: 'var(--neon-green)' }}>
                    <Loader2 size={24} className="spin-animation" />
                    <span>Cargando configuración...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-content analytics-dashboard">
            <header className="analytics-page-header">
                <div>
                    <h1 className="analytics-page-title">
                        <Zap size={28} style={{ marginRight: '10px', color: 'var(--neon-green)' }} />
                        Automatizaciones IA
                    </h1>
                    <p className="analytics-page-sub">
                        Controla las funciones automáticas del chatbot
                    </p>
                </div>
            </header>

            <div className="automations-grid">
                {/* Payment Detection Toggle */}
                <div className={`automation-card ${config?.paymentDetectionEnabled ? 'automation-active' : ''}`}>
                    <div className="automation-card-header">
                        <div className="automation-icon-wrap" style={{ background: config?.paymentDetectionEnabled ? 'rgba(0, 255, 65, 0.15)' : 'rgba(255, 255, 255, 0.05)' }}>
                            <CreditCard size={28} style={{ color: config?.paymentDetectionEnabled ? 'var(--neon-green)' : 'var(--text-secondary)' }} />
                        </div>
                        <label className="automation-switch">
                            <input
                                type="checkbox"
                                checked={config?.paymentDetectionEnabled || false}
                                onChange={() => handleToggle('paymentDetectionEnabled')}
                                disabled={toggling === 'paymentDetectionEnabled'}
                            />
                            <span className="automation-slider"></span>
                        </label>
                    </div>
                    <h3 className="automation-card-title">Verificación de pago por imagen</h3>
                    <p className="automation-card-desc">
                        Cuando un cliente envía una imagen, el sistema analiza si es un comprobante de pago usando IA con visión.
                    </p>
                    <div className={`automation-status-badge ${config?.paymentDetectionEnabled ? 'badge-active' : 'badge-inactive'}`}>
                        {toggling === 'paymentDetectionEnabled' ? (
                            <><Loader2 size={14} className="spin-animation" /> Actualizando...</>
                        ) : config?.paymentDetectionEnabled ? (
                            '● Activo'
                        ) : (
                            '○ Inactivo'
                        )}
                    </div>
                </div>

                {/* Voice Processing Toggle */}
                <div className={`automation-card ${config?.voiceProcessingEnabled ? 'automation-active' : ''}`}>
                    <div className="automation-card-header">
                        <div className="automation-icon-wrap" style={{ background: config?.voiceProcessingEnabled ? 'rgba(0, 255, 65, 0.15)' : 'rgba(255, 255, 255, 0.05)' }}>
                            <Mic size={28} style={{ color: config?.voiceProcessingEnabled ? 'var(--neon-green)' : 'var(--text-secondary)' }} />
                        </div>
                        <label className="automation-switch">
                            <input
                                type="checkbox"
                                checked={config?.voiceProcessingEnabled || false}
                                onChange={() => handleToggle('voiceProcessingEnabled')}
                                disabled={toggling === 'voiceProcessingEnabled'}
                            />
                            <span className="automation-slider"></span>
                        </label>
                    </div>
                    <h3 className="automation-card-title">Procesamiento de voz</h3>
                    <p className="automation-card-desc">
                        Convierte los mensajes de voz a texto y los procesa con la IA para generar respuestas automáticas.
                    </p>
                    <div className={`automation-status-badge ${config?.voiceProcessingEnabled ? 'badge-active' : 'badge-inactive'}`}>
                        {toggling === 'voiceProcessingEnabled' ? (
                            <><Loader2 size={14} className="spin-animation" /> Actualizando...</>
                        ) : config?.voiceProcessingEnabled ? (
                            '● Activo'
                        ) : (
                            '○ Inactivo'
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AIAutomationsPage;
