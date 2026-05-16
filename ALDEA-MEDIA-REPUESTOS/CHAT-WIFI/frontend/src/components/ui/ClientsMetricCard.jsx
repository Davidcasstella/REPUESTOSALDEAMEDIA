import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import api from '../../services/api';

const ClientsMetricCard = ({ className = '' }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOverview = async () => {
            try {
                const { data: res } = await api.get('/api/analytics/overview');
                setData(res.data);
            } catch {
                // Fallback with zeross
                setData({ today: 0, week: 0, month: 0, growth: { day: 0, week: 0, month: 0 } });
            } finally {
                setLoading(false);
            }
        };

        fetchOverview();
        // Refresh every 60 seconds
        const interval = setInterval(fetchOverview, 60_000);
        return () => clearInterval(interval);
    }, []);

    const GrowthBadge = ({ value }) => {
        if (value > 0) return (
            <span className="growth-badge growth-up">
                <TrendingUp size={12} />+{value}%
            </span>
        );
        if (value < 0) return (
            <span className="growth-badge growth-down">
                <TrendingDown size={12} />{value}%
            </span>
        );
        return (
            <span className="growth-badge growth-flat">
                <Minus size={12} />0%
            </span>
        );
    };

    return (
        <div className={`analytics-metric-card premium-card ${className}`}>
            <div className="analytics-card-header">
                <div className="analytics-card-icon-wrap" style={{ backgroundColor: 'rgba(26, 26, 26, 0.1)', color: '#1a1a1a' }}>
                    <Users size={20} />
                </div>
                <div>
                    <span className="analytics-card-title">Conversaciones</span>
                    <span className="analytics-card-sub">Clientes únicos</span>
                </div>
            </div>

            {loading ? (
                <div className="analytics-skeleton" />
            ) : (
                <>
                    <div className="clients-hero">
                        <span className="clients-hero-number">{data?.today ?? 0}</span>
                        <span className="clients-hero-label">hoy</span>
                        <GrowthBadge value={data?.growth?.day ?? 0} />
                    </div>

                    <div className="clients-sub-stats">
                        <div className="clients-sub-stat">
                            <span className="clients-sub-value">{data?.week ?? 0}</span>
                            <span className="clients-sub-label">Esta semana</span>
                            <GrowthBadge value={data?.growth?.week ?? 0} />
                        </div>
                        <div className="clients-sub-divider" />
                        <div className="clients-sub-stat">
                            <span className="clients-sub-value">{data?.month ?? 0}</span>
                            <span className="clients-sub-label">Este mes</span>
                            <GrowthBadge value={data?.growth?.month ?? 0} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ClientsMetricCard;
