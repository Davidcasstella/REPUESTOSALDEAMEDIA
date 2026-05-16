import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
    BarChart3, TrendingUp, Package, Hash, Loader2,
    AlertCircle, RefreshCw, Calendar, ShoppingCart, Award, Database
} from 'lucide-react';

/**
 * AnalyticsPage
 * 
 * Displays demand analytics from WhatsApp repuestos groups:
 * - Summary cards (total signals, unique products, references)
 * - Top 10 products table with visual progress bars
 * - Top 10 references table with visual progress bars
 * - Daily trend mini-chart
 */
const AnalyticsPage = () => {
    const [summary, setSummary] = useState(null);
    const [topProducts, setTopProducts] = useState([]);
    const [topReferences, setTopReferences] = useState([]);
    const [trend, setTrend] = useState([]);
    const [availableMonths, setAvailableMonths] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async (month) => {
        try {
            setError(null);
            const monthParam = month ? `?month=${month}` : '';
            const [sumRes, prodRes, refRes, trendRes, monthsRes] = await Promise.all([
                api.get(`/api/demand-analytics/summary${monthParam}`),
                api.get(`/api/demand-analytics/top-products${monthParam}`),
                api.get(`/api/demand-analytics/top-references${monthParam}`),
                api.get('/api/demand-analytics/trend?days=14'),
                api.get('/api/demand-analytics/months'),
            ]);
            setSummary(sumRes.data.data);
            setTopProducts(prodRes.data.data || []);
            setTopReferences(refRes.data.data || []);
            setTrend(trendRes.data.data || []);
            setAvailableMonths(monthsRes.data.data || []);
        } catch (err) {
            console.error('Error fetching analytics:', err);
            setError('No se pudieron cargar las métricas. Verifica que MySQL esté activo.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData(selectedMonth);
    }, [fetchData, selectedMonth]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData(selectedMonth);
    };

    const handleMonthChange = (e) => {
        setSelectedMonth(e.target.value);
        setLoading(true);
    };

    const formatMonth = (ym) => {
        if (!ym) return 'Mes actual';
        const [y, m] = ym.split('-');
        const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${names[parseInt(m, 10) - 1]} ${y}`;
    };

    // Calculate max for progress bar scaling
    const maxProductCount = topProducts.length > 0 ? topProducts[0].total_count : 1;
    const maxRefCount = topReferences.length > 0 ? topReferences[0].total_count : 1;

    // ── Loading State ──
    if (loading && !refreshing) {
        return (
            <div className="analytics-page">
                <div className="analytics-loading">
                    <Loader2 size={40} className="spin" />
                    <p>Cargando métricas...</p>
                </div>
            </div>
        );
    }

    // ── Error State ──
    if (error && !summary) {
        return (
            <div className="analytics-page">
                <div className="analytics-error">
                    <AlertCircle size={40} />
                    <p>{error}</p>
                    <button onClick={handleRefresh} className="analytics-retry-btn">
                        <RefreshCw size={16} /> Reintentar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="analytics-page">
            {/* ── Header ── */}
            <div className="analytics-header">
                <div className="analytics-header-left">
                    <h1><BarChart3 size={28} /> Métricas y Analíticas</h1>
                    <p className="analytics-subtitle">
                        Demanda de repuestos detectada en grupos de WhatsApp
                    </p>
                </div>
                <div className="analytics-header-right">
                    <div className="analytics-month-selector">
                        <Calendar size={16} />
                        <select value={selectedMonth} onChange={handleMonthChange}>
                            <option value="">Mes actual</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{formatMonth(m)}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleRefresh}
                        className="analytics-refresh-btn"
                        disabled={refreshing}
                    >
                        <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* ── Summary Cards ── */}
            <div className="analytics-summary-grid">
                <div className="analytics-summary-card">
                    <div className="analytics-card-icon signals-icon">
                        <Database size={22} />
                    </div>
                    <div className="analytics-card-info">
                        <span className="analytics-card-value">
                            {summary?.totalSignals || 0}
                        </span>
                        <span className="analytics-card-label">Señales totales</span>
                    </div>
                </div>

                <div className="analytics-summary-card">
                    <div className="analytics-card-icon products-icon">
                        <Package size={22} />
                    </div>
                    <div className="analytics-card-info">
                        <span className="analytics-card-value">
                            {summary?.uniqueProducts || 0}
                        </span>
                        <span className="analytics-card-label">Productos únicos</span>
                    </div>
                </div>

                <div className="analytics-summary-card">
                    <div className="analytics-card-icon refs-icon">
                        <Hash size={22} />
                    </div>
                    <div className="analytics-card-info">
                        <span className="analytics-card-value">
                            {summary?.uniqueReferences || 0}
                        </span>
                        <span className="analytics-card-label">Referencias únicas</span>
                    </div>
                </div>

                <div className="analytics-summary-card highlight">
                    <div className="analytics-card-icon top-icon">
                        <Award size={22} />
                    </div>
                    <div className="analytics-card-info">
                        <span className="analytics-card-value top-value">
                            {summary?.topProduct?.product || '—'}
                        </span>
                        <span className="analytics-card-label">
                            Producto #1 {summary?.topProduct ? `(${summary.topProduct.total_count} menciones)` : ''}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Main Content Grid ── */}
            <div className="analytics-content-grid">
                {/* ── Top Products ── */}
                <div className="analytics-table-card">
                    <div className="analytics-table-header">
                        <h2><ShoppingCart size={20} /> Top Productos</h2>
                        <span className="analytics-badge">{formatMonth(selectedMonth || summary?.yearMonth)}</span>
                    </div>

                    {topProducts.length === 0 ? (
                        <div className="analytics-empty">
                            <Package size={32} />
                            <p>Sin datos de demanda aún.</p>
                            <span>Los datos aparecerán cuando se detecten mensajes sobre repuestos en los grupos categorizados.</span>
                        </div>
                    ) : (
                        <div className="analytics-table-body">
                            <table className="analytics-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Producto</th>
                                        <th>Menciones</th>
                                        <th>Demanda</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topProducts.map((p, i) => (
                                        <tr key={i}>
                                            <td className="analytics-rank">
                                                {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                                            </td>
                                            <td className="analytics-product-name">
                                                {p.product}
                                                {p.vehicles_seen && (
                                                    <span className="analytics-vehicle-tag">{p.vehicles_seen}</span>
                                                )}
                                            </td>
                                            <td className="analytics-count">{p.total_count}</td>
                                            <td className="analytics-bar-cell">
                                                <div className="analytics-bar-bg">
                                                    <div
                                                        className="analytics-bar-fill product-bar"
                                                        style={{ width: `${(p.total_count / maxProductCount) * 100}%` }}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Top References ── */}
                <div className="analytics-table-card">
                    <div className="analytics-table-header">
                        <h2><Hash size={20} /> Top Referencias</h2>
                        <span className="analytics-badge">{formatMonth(selectedMonth || summary?.yearMonth)}</span>
                    </div>

                    {topReferences.length === 0 ? (
                        <div className="analytics-empty">
                            <Hash size={32} />
                            <p>Sin referencias detectadas.</p>
                            <span>Se detectan códigos OEM automáticamente de los mensajes.</span>
                        </div>
                    ) : (
                        <div className="analytics-table-body">
                            <table className="analytics-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Referencia</th>
                                        <th>Producto</th>
                                        <th>Menciones</th>
                                        <th>Demanda</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topReferences.map((r, i) => (
                                        <tr key={i}>
                                            <td className="analytics-rank">
                                                {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                                            </td>
                                            <td className="analytics-ref-code">{r.reference_code}</td>
                                            <td>{r.product}</td>
                                            <td className="analytics-count">{r.total_count}</td>
                                            <td className="analytics-bar-cell">
                                                <div className="analytics-bar-bg">
                                                    <div
                                                        className="analytics-bar-fill ref-bar"
                                                        style={{ width: `${(r.total_count / maxRefCount) * 100}%` }}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Trend (last 14 days) ── */}
            {trend.length > 0 && (
                <div className="analytics-table-card analytics-trend-card">
                    <div className="analytics-table-header">
                        <h2><TrendingUp size={20} /> Tendencia (últimos 14 días)</h2>
                    </div>
                    <div className="analytics-trend-chart">
                        {trend.map((d, i) => {
                            const maxSignals = Math.max(...trend.map(t => t.signals), 1);
                            const height = (d.signals / maxSignals) * 100;
                            const dateStr = new Date(d.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
                            return (
                                <div key={i} className="analytics-trend-bar-wrapper" title={`${dateStr}: ${d.signals} señales`}>
                                    <div className="analytics-trend-bar-container">
                                        <div
                                            className="analytics-trend-bar"
                                            style={{ height: `${Math.max(height, 4)}%` }}
                                        />
                                    </div>
                                    <span className="analytics-trend-label">{dateStr}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Insight ── */}
            {summary?.topProduct && (
                <div className="analytics-insight">
                    <span className="analytics-insight-icon">🧠</span>
                    <span>
                        <strong>Insight:</strong> "{summary.topProduct.product}" es el producto con mayor demanda
                        este mes con <strong>{summary.topProduct.total_count}</strong> menciones en grupos de repuestos.
                    </span>
                </div>
            )}
        </div>
    );
};

export default AnalyticsPage;
