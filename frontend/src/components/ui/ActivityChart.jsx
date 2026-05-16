import React, { useState, useEffect, useRef } from 'react';
import { BarChart2 } from 'lucide-react';
import api from '../../services/api';

/**
 * Activity chart using pure SVG — no external chart library needed.
 * Shows two tabs: hourly distribution today, and 7-day daily activity.
 */
const ActivityChart = () => {
    const [data, setData] = useState(null);
    const [tab, setTab] = useState('daily'); // 'hourly' | 'daily'
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                const { data: res } = await api.get('/api/analytics/messages');
                setData(res.data);
            } catch {
                setData({ hourly: [], daily: [] });
            } finally {
                setLoading(false);
            }
        };
        fetch();
        const interval = setInterval(fetch, 60_000);
        return () => clearInterval(interval);
    }, []);

    // Build SVG bar chart
    const renderBars = (items, valueKey, labelKey) => {
        if (!items || items.length === 0) return null;
        const values = items.map(i => i[valueKey]);
        const maxVal = Math.max(...values, 1);
        const svgW = 560;
        const svgH = 140;
        const barGap = 4;
        const barW = (svgW / items.length) - barGap;

        return (
            <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                preserveAspectRatio="none"
                className="activity-svg"
            >
                <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1a1a1a" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#004400" stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#33ff33" stopOpacity="1" />
                        <stop offset="100%" stopColor="#008800" stopOpacity="0.6" />
                    </linearGradient>
                </defs>

                {items.map((item, i) => {
                    const val = item[valueKey];
                    const barH = maxVal > 0 ? (val / maxVal) * (svgH - 24) : 0;
                    const x = i * (barW + barGap);
                    const y = svgH - barH - 20;

                    return (
                        <g key={i}>
                            <rect
                                x={x}
                                y={y}
                                width={barW}
                                height={barH}
                                rx={barW < 20 ? 2 : 5}
                                fill="url(#barGrad)"
                                className="activity-bar"
                            />
                            {/* Label below bar - only show some for hourly to avoid clutter */}
                            {(items.length <= 7 || i % 3 === 0) && (
                                <text
                                    x={x + barW / 2}
                                    y={svgH - 4}
                                    textAnchor="middle"
                                    className="activity-label"
                                    fontSize="8"
                                    fill="rgba(255,255,255,0.35)"
                                >
                                    {item[labelKey]}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        );
    };

    const dailyItems = data?.daily || [];
    const hourlyItems = data?.hourly || [];

    // For daily tab, show combo: incoming + outgoing as stacked-ish info
    const dailyChart = dailyItems.map(d => ({
        label: d.label,
        count: d.incoming + d.outgoing
    }));

    const hourlyChart = hourlyItems.map(h => ({
        label: h.label.slice(0, 2),
        count: h.count
    }));

    const totalToday = hourlyItems.reduce((s, h) => s + h.count, 0);
    const totalWeek = dailyItems.reduce((s, d) => s + d.incoming + d.outgoing, 0);

    return (
        <div className="analytics-card activity-chart-card premium-card">
            <div className="analytics-card-header">
                <div className="analytics-card-icon-wrap" style={{ backgroundColor: 'rgba(26, 26, 26, 0.1)', color: '#1a1a1a' }}>
                    <BarChart2 size={20} />
                </div>
                <div>
                    <span className="analytics-card-title">Actividad del Chatbot</span>
                    <span className="analytics-card-sub">
                        {tab === 'daily'
                            ? `${totalWeek} mensajes esta semana`
                            : `${totalToday} mensajes hoy`}
                    </span>
                </div>
                <div className="chart-tabs">
                    <button
                        className={`chart-tab ${tab === 'daily' ? 'active' : ''}`}
                        onClick={() => setTab('daily')}
                    >
                        7 días
                    </button>
                    <button
                        className={`chart-tab ${tab === 'hourly' ? 'active' : ''}`}
                        onClick={() => setTab('hourly')}
                    >
                        Por hora
                    </button>
                </div>
            </div>

            <div className="activity-chart-body">
                {loading ? (
                    <div className="analytics-skeleton chart-skeleton" />
                ) : (
                    <>
                        {tab === 'daily' ? renderBars(dailyChart, 'count', 'label') : renderBars(hourlyChart, 'count', 'label')}
                        {tab === 'daily' && (
                            <div className="activity-day-legend">
                                {dailyItems.map((d, i) => (
                                    <div key={i} className="legend-item">
                                        <span className="legend-label">{d.label}</span>
                                        <span className="legend-value">{d.incoming + d.outgoing}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Peak hours indicator */}
            {!loading && tab === 'hourly' && (() => {
                const peak = hourlyItems.reduce((best, h) => h.count > best.count ? h : best, { count: 0, label: '--:--' });
                return peak.count > 0 ? (
                    <div className="activity-peak-hint">
                        📈 Mayor actividad: <strong>{peak.label}</strong> ({peak.count} msgs)
                    </div>
                ) : null;
            })()}
        </div>
    );
};

export default ActivityChart;
