import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldBan, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
    Users, RefreshCw, Phone, AlertCircle
} from 'lucide-react';
import api from '../services/api';
import BlockedNumberModal from './BlockedNumberModal';

const BlockedNumbersPage = () => {
    const [blockedList, setBlockedList] = useState([]);
    const [blockGroups, setBlockGroups] = useState(false);
    const [loading, setLoading] = useState(true);
    const [configLoading, setConfigLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [togglingId, setTogglingId] = useState(null);

    // ==================== FETCH ====================
    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [listRes, configRes] = await Promise.all([
                api.get('/api/blocked-numbers'),
                api.get('/api/blocked-numbers/config')
            ]);
            setBlockedList(listRes.data.data || []);
            setBlockGroups(configRes.data.data?.blockGroups || false);
        } catch (error) {
            console.error('Error al cargar números bloqueados:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // ==================== HANDLERS ====================
    const handleSave = async (formData, id) => {
        if (id) {
            const { data } = await api.put(`/api/blocked-numbers/${id}`, formData);
            setBlockedList(prev => prev.map(e => e.id === id ? data.data : e));
        } else {
            const { data } = await api.post('/api/blocked-numbers', formData);
            setBlockedList(prev => [...prev, data.data]);
        }
        setModalOpen(false);
        setEditingEntry(null);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Eliminar este número bloqueado?')) return;
        setDeletingId(id);
        try {
            await api.delete(`/api/blocked-numbers/${id}`);
            setBlockedList(prev => prev.filter(e => e.id !== id));
        } catch (error) {
            console.error('Error al eliminar:', error);
        } finally {
            setDeletingId(null);
        }
    };

    const handleToggleActive = async (entry) => {
        setTogglingId(entry.id);
        try {
            const { data } = await api.put(`/api/blocked-numbers/${entry.id}`, {
                isActive: !entry.isActive
            });
            setBlockedList(prev => prev.map(e => e.id === entry.id ? data.data : e));
        } catch (error) {
            console.error('Error al cambiar estado:', error);
        } finally {
            setTogglingId(null);
        }
    };

    const handleToggleGroups = async () => {
        setConfigLoading(true);
        try {
            const { data } = await api.post('/api/blocked-numbers/config', {
                blockGroups: !blockGroups
            });
            setBlockGroups(data.data.blockGroups);
        } catch (error) {
            console.error('Error al actualizar config:', error);
        } finally {
            setConfigLoading(false);
        }
    };

    const handleOpenAdd = () => {
        setEditingEntry(null);
        setModalOpen(true);
    };

    const handleOpenEdit = (entry) => {
        setEditingEntry(entry);
        setModalOpen(true);
    };

    // ==================== HELPERS ====================
    const formatDate = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('es-CO', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    const activeCount = blockedList.filter(e => e.isActive).length;

    // ==================== RENDER ====================
    return (
        <div className="dashboard-content">
            {/* Page Header */}
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <ShieldBan size={28} />
                        Números Bloqueados
                    </h1>
                    <p className="subtitle">
                        Administra qué números y grupos NO reciben respuesta del bot
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button className="bn-btn-refresh" onClick={fetchAll} disabled={loading} title="Recargar">
                        <RefreshCw size={16} className={loading ? 'bn-spin' : ''} />
                    </button>
                    <button className="bn-btn-add" onClick={handleOpenAdd}>
                        <Plus size={16} />
                        Agregar Número
                    </button>
                </div>
            </header>

            {/* Stats + Group Toggle row */}
            <div className="bn-top-row">
                {/* Stat badges */}
                <div className="bn-stats">
                    <div className="bn-stat-pill">
                        <span className="bn-stat-dot active-dot"></span>
                        <span>{activeCount} activos</span>
                    </div>
                    <div className="bn-stat-pill">
                        <span className="bn-stat-dot total-dot"></span>
                        <span>{blockedList.length} total</span>
                    </div>
                </div>

                {/* Block groups toggle */}
                <div className={`bn-group-toggle-card premium-card ${blockGroups ? 'bn-groups-on' : 'bn-groups-off'}`}>
                    <Users size={18} />
                    <span className="bn-group-toggle-label">
                        Bloquear todos los grupos de WhatsApp
                    </span>
                    <button
                        className={`bn-group-toggle-btn ${blockGroups ? 'toggle-on' : 'toggle-off'} ${configLoading ? 'toggle-loading' : ''}`}
                        onClick={handleToggleGroups}
                        disabled={configLoading}
                        title={blockGroups ? 'Desactivar bloqueo de grupos' : 'Activar bloqueo de grupos'}
                    >
                        <span className="ai-toggle-thumb"></span>
                    </button>
                    <span className={`bn-group-state ${blockGroups ? 'bn-on' : 'bn-off'}`}>
                        {blockGroups ? 'ON' : 'OFF'}
                    </span>
                </div>
            </div>

            {/* Table */}
            <div className="bn-table-card premium-card">
                {loading ? (
                    <div className="bn-empty">
                        <RefreshCw size={24} className="bn-spin" />
                        <span>Cargando...</span>
                    </div>
                ) : blockedList.length === 0 ? (
                    <div className="bn-empty">
                        <AlertCircle size={36} style={{ opacity: 0.4 }} />
                        <span>No hay números bloqueados todavía.</span>
                        <button className="bn-btn-add" onClick={handleOpenAdd}>
                            <Plus size={14} /> Agregar el primero
                        </button>
                    </div>
                ) : (
                    <div className="bn-table-wrapper">
                        <table className="bn-table">
                            <thead>
                                <tr>
                                    <th>Número</th>
                                    <th>Nombre</th>
                                    <th>Motivo</th>
                                    <th>Fecha</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {blockedList.map(entry => (
                                    <tr key={entry.id} className={!entry.isActive ? 'bn-row-inactive' : ''}>
                                        <td>
                                            <span className="bn-phone">
                                                <Phone size={13} />
                                                {entry.phoneNumber}
                                            </span>
                                        </td>
                                        <td>{entry.name || <span className="bn-muted">—</span>}</td>
                                        <td>{entry.reason || <span className="bn-muted">—</span>}</td>
                                        <td>{formatDate(entry.createdAt)}</td>
                                        <td>
                                            <span className={`bn-badge ${entry.isActive ? 'bn-badge-active' : 'bn-badge-inactive'}`}>
                                                {entry.isActive ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="bn-actions">
                                                {/* Toggle active/inactive */}
                                                <button
                                                    className="bn-action-btn bn-toggle"
                                                    onClick={() => handleToggleActive(entry)}
                                                    disabled={togglingId === entry.id}
                                                    title={entry.isActive ? 'Desactivar' : 'Activar'}
                                                >
                                                    {entry.isActive
                                                        ? <ToggleRight size={17} />
                                                        : <ToggleLeft size={17} />}
                                                </button>
                                                {/* Edit */}
                                                <button
                                                    className="bn-action-btn bn-edit"
                                                    onClick={() => handleOpenEdit(entry)}
                                                    title="Editar"
                                                >
                                                    <Edit2 size={15} />
                                                </button>
                                                {/* Delete */}
                                                <button
                                                    className="bn-action-btn bn-delete"
                                                    onClick={() => handleDelete(entry.id)}
                                                    disabled={deletingId === entry.id}
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modalOpen && (
                <BlockedNumberModal
                    entry={editingEntry}
                    onClose={() => { setModalOpen(false); setEditingEntry(null); }}
                    onSave={handleSave}
                />
            )}
        </div>
    );
};

export default BlockedNumbersPage;
