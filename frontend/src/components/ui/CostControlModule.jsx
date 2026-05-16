import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';
import api from '../../services/api';

const CostControlModule = ({ className = '' }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                const { data: res } = await api.get('/api/analytics/token-usage');
                setData(res.data);
            } catch {
                setData({
                    tokensMonth: 0,
                    pricing: { per1kTokens: '0.0007', per1mTokens: '0.69' },
                    costs: { estimatedMonth: '0.00', projectedMonth: '0.00' }
                });
            } finally {
                setLoading(false);
            }
        };
        fetch();
        const interval = setInterval(fetch, 60_000);
        return () => clearInterval(interval);
    }, []);

    const formatTokens = (n) => {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
        if (n >= 1_000) return Math.round(n / 1_000) + 'K';
        return String(n);
    };

    return (
        <div className={`analytics-metric-card premium-card ${className}`}>
            <div className="analytics-card-header">
                <div className="analytics-card-icon-wrap" style={{ backgroundColor: 'rgba(26, 26, 26, 0.1)', color: '#1a1a1a' }}>
                    <DollarSign size={20} />
                </div>
                <div>
                    <span className="analytics-card-title">Control de Costos IA</span>
                    <span className="analytics-card-sub">Estimación financiera Groq</span>
                </div>
            </div>

            {loading ? (
                <div className="analytics-skeleton" />
            ) : (
                <>
                    <div className="cost-main">
                        <span className="cost-hero-label">Costo estimado este mes</span>
                        <div className="cost-hero-value">
                            <span className="cost-currency">$</span>
                            <span className="cost-amount">{data?.costs?.estimatedMonth ?? '0.00'}</span>
                            <span className="cost-unit">USD</span>
                        </div>
                    </div>

                    <div className="cost-breakdown">
                        <div className="cost-row">
                            <span className="cost-row-label">Tokens consumidos (mes)</span>
                            <span className="cost-row-value">{formatTokens(data?.tokensMonth ?? 0)}</span>
                        </div>
                        <div className="cost-row">
                            <span className="cost-row-label">Precio por 1K tokens</span>
                            <span className="cost-row-value">${data?.pricing?.per1kTokens ?? '0.0007'}</span>
                        </div>
                        <div className="cost-divider" />
                        <div className="cost-row cost-row-projection">
                            <span className="cost-row-label">
                                <TrendingUp size={13} />
                                Proyección fin de mes
                            </span>
                            <span className="cost-row-value cost-projection-value">
                                ${data?.costs?.projectedMonth ?? '0.00'} USD
                            </span>
                        </div>
                    </div>

                    <div className="cost-disclaimer">
                        * Estimación basada en precio público Groq llama-3.3-70b (~$0.69/1M tokens)
                    </div>
                </>
            )}
        </div>
    );
};

export default CostControlModule;
