import React, { useState, useEffect } from 'react';
import { ScrollText, ChevronDown, ChevronUp, Zap, XCircle, RotateCcw, PenLine, Plus, RefreshCw } from 'lucide-react';
import useProvidersStore from '../store/useProvidersStore';
import './UsageLogs.css';

const EVENT_CONFIG = {
    activated: { icon: Zap, color: '#1a1a1a', label: 'Activada' },
    exhausted: { icon: XCircle, color: '#1a1a1a', label: 'Agotada' },
    reactivated: { icon: RotateCcw, color: '#00aaff', label: 'Reactivada' },
    deactivated: { icon: ChevronDown, color: '#1a1a1a', label: 'Desactivada' },
    updated: { icon: PenLine, color: '#aa88ff', label: 'Actualizada' },
    created: { icon: Plus, color: '#00ff88', label: 'Creada' },
    error: { icon: XCircle, color: '#ff6644', label: 'Error' }
};

const UsageLogs = () => {
    const { usageLogs, fetchUsageLogs } = useProvidersStore();
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleToggle = async () => {
        if (!expanded && usageLogs.length === 0) {
            setLoading(true);
            await fetchUsageLogs();
            setLoading(false);
        }
        setExpanded(!expanded);
    };

    const handleRefresh = async () => {
        setLoading(true);
        await fetchUsageLogs();
        setLoading(false);
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Ahora';
        if (diffMins < 60) return `Hace ${diffMins}m`;
        if (diffHours < 24) return `Hace ${diffHours}h`;
        if (diffDays < 7) return `Hace ${diffDays}d`;
        return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    };

    // Show only the last 30 logs
    const displayLogs = usageLogs.slice(0, 30);

    return (
        <div className={`usage-logs-widget premium-card ${expanded ? 'expanded' : ''}`}>
            <button className="usage-logs-header" onClick={handleToggle}>
                <div className="usage-logs-title-row">
                    <ScrollText size={16} />
                    <h3>Registro de Actividad</h3>
                    {usageLogs.length > 0 && (
                        <span className="usage-logs-count">{usageLogs.length}</span>
                    )}
                </div>
                {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {expanded && (
                <div className="usage-logs-body">
                    <div className="usage-logs-toolbar">
                        <button
                            className="usage-logs-refresh"
                            onClick={handleRefresh}
                            disabled={loading}
                        >
                            <RefreshCw size={12} className={loading ? 'spin' : ''} />
                            <span>Refrescar</span>
                        </button>
                    </div>

                    {loading ? (
                        <div className="usage-logs-loading">
                            <RefreshCw size={20} className="spin" />
                            <span>Cargando logs...</span>
                        </div>
                    ) : displayLogs.length === 0 ? (
                        <div className="usage-logs-empty">
                            <ScrollText size={24} />
                            <span>Sin actividad registrada</span>
                        </div>
                    ) : (
                        <div className="usage-logs-timeline">
                            {displayLogs.map((log, idx) => {
                                const config = EVENT_CONFIG[log.event] || EVENT_CONFIG.error;
                                const Icon = config.icon;
                                return (
                                    <div key={idx} className="usage-log-entry" style={{ '--log-color': config.color }}>
                                        <div className="usage-log-line" />
                                        <div className="usage-log-dot">
                                            <Icon size={10} />
                                        </div>
                                        <div className="usage-log-content">
                                            <div className="usage-log-top">
                                                <span className="usage-log-event">{config.label}</span>
                                                <span className="usage-log-provider">{log.providerName}</span>
                                                <span className="usage-log-time">{formatTime(log.timestamp)}</span>
                                            </div>
                                            {log.reason && (
                                                <span className="usage-log-reason">{log.reason}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default UsageLogs;
