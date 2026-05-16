import React, { useState, useEffect } from 'react';
import { Zap, AlertTriangle, AlertOctagon, CheckCircle } from 'lucide-react';
import api from '../../services/api';

const TokenUsageModule = ({ className = '' }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                const { data: res } = await api.get('/api/analytics/token-usage');
                setData(res.data);
            } catch {
                setData({
                    tokensToday: 0, tokensMonth: 0, monthlyLimit: 2000000,
                    usagePercent: 0, riskLevel: 'safe',
                    pricing: { per1kTokens: '0.0007', per1mTokens: '0.69' },
                    costs: { estimatedMonth: '0.00', projectedMonth: '0.00' }
                });
            } finally {
                setLoading(false);
            }
        };
        fetch();
        const interval = setInterval(fetch, 30_000);
        return () => clearInterval(interval);
    }, []);

    const getRiskConfig = (level) => {
        switch (level) {
            case 'critical': return {
                icon: <AlertOctagon size={16} />,
                label: 'Riesgo Crítico',
                color: '#1a1a1a',
                barColor: 'var(--token-critical)',
                glowColor: 'rgba(239,68,68,0.3)'
            };
            case 'warning': return {
                icon: <AlertTriangle size={16} />,
                label: 'Advertencia',
                color: '#1a1a1a',
                barColor: 'var(--token-warning)',
                glowColor: 'rgba(245,158,11,0.3)'
            };
            default: return {
                icon: <CheckCircle size={16} />,
                label: 'Seguro',
                color: '#1a1a1a',
                barColor: 'var(--token-safe)',
                glowColor: 'rgba(16,185,129,0.3)'
            };
        }
    };

    const formatTokens = (n) => {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return String(n);
    };

    const risk = getRiskConfig(data?.riskLevel || 'safe');

    return (
        <div className={`analytics-metric-card premium-card ${className}`}>
            <div className="analytics-card-header">
                <div className="analytics-card-icon-wrap" style={{ backgroundColor: 'rgba(26, 26, 26, 0.1)', color: '#1a1a1a' }}>
                    <Zap size={20} />
                </div>
                <div>
                    <span className="analytics-card-title">Tokens Groq</span>
                    <span className="analytics-card-sub">Consumo IA en tiempo real</span>
                </div>
            </div>

            {loading ? (
                <div className="analytics-skeleton" />
            ) : (
                <>
                    {/* Risk Alert Banner */}
                    {data?.riskLevel !== 'safe' && (
                        <div className="token-alert-banner" style={{
                            borderColor: risk.color,
                            background: `${risk.glowColor}`,
                            color: risk.color
                        }}>
                            {risk.icon}
                            {data?.riskLevel === 'critical'
                                ? '⚠️ Has superado el 85% de tu límite mensual de tokens'
                                : '⚠️ Te estás acercando a tu límite mensual de tokens'}
                        </div>
                    )}

                    {/* Progress bar */}
                    <div className="token-progress-section">
                        <div className="token-progress-header">
                            <span className="token-progress-label">Uso mensual</span>
                            <div className="token-risk-badge" style={{ color: risk.color }}>
                                {risk.icon}
                                <span>{risk.label}</span>
                                <strong>{data?.usagePercent ?? 0}%</strong>
                            </div>
                        </div>
                        <div className="token-progress-track">
                            <div
                                className="token-progress-fill"
                                style={{
                                    width: `${data?.usagePercent ?? 0}%`,
                                    background: risk.barColor,
                                    boxShadow: `0 0 12px ${risk.glowColor}`
                                }}
                            />
                        </div>
                        <div className="token-progress-limits">
                            <span>{formatTokens(data?.tokensMonth ?? 0)} usados</span>
                            <span>{formatTokens(data?.monthlyLimit ?? 2_000_000)} límite</span>
                        </div>
                    </div>

                    {/* Stats grid */}
                    <div className="token-stats-grid">
                        <div className="token-stat">
                            <span className="token-stat-value">{formatTokens(data?.tokensToday ?? 0)}</span>
                            <span className="token-stat-label">Hoy</span>
                        </div>
                        <div className="token-stat">
                            <span className="token-stat-value">{formatTokens(data?.tokensMonth ?? 0)}</span>
                            <span className="token-stat-label">Este mes</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default TokenUsageModule;
