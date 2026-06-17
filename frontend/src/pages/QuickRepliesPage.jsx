import React, { useState, useEffect, useRef } from 'react';
import {
    MessageSquare, Plus, Edit2, Copy, Trash2, Search,
    RefreshCw, AlertCircle, Sparkles, X, Terminal, HelpCircle
} from 'lucide-react';
import api from '../services/api';

const QuickRepliesPage = () => {
    const [replies, setReplies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingReply, setEditingReply] = useState(null); // null if creating, quickReply object if editing
    
    // Form fields state
    const [formData, setFormData] = useState({
        name: '',
        shortcut: '',
        content: ''
    });

    const textareaRef = useRef(null);

    useEffect(() => {
        fetchReplies();
    }, []);

    const fetchReplies = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/api/quick-replies');
            setReplies(data.data || []);
        } catch (error) {
            console.error('Error fetching quick replies:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAdd = () => {
        setEditingReply(null);
        setFormData({ name: '', shortcut: '', content: '' });
        setModalOpen(true);
    };

    const handleOpenEdit = (reply) => {
        setEditingReply(reply);
        setFormData({
            name: reply.name,
            shortcut: reply.shortcut,
            content: reply.content
        });
        setModalOpen(true);
    };

    const handleDuplicate = async (reply) => {
        try {
            const { data } = await api.post('/api/quick-replies', {
                name: `${reply.name} (Copia)`,
                shortcut: `${reply.shortcut}_copia`,
                content: reply.content
            });
            setReplies(prev => [...prev, data.data]);
        } catch (error) {
            console.error('Error duplicating quick reply:', error);
            alert('Error al duplicar la respuesta rápida');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Seguro que deseas eliminar esta respuesta rápida?')) return;
        try {
            await api.delete(`/api/quick-replies/${id}`);
            setReplies(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            console.error('Error deleting quick reply:', error);
            alert('Error al eliminar la respuesta rápida');
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.name.trim() || !formData.shortcut.trim() || !formData.content.trim()) {
            alert('Todos los campos son obligatorios');
            return;
        }

        // Strip leading slash if user typed it
        const cleanShortcut = formData.shortcut.trim().replace(/^\//, '').toLowerCase();

        try {
            if (editingReply) {
                const { data } = await api.put(`/api/quick-replies/${editingReply.id}`, {
                    name: formData.name,
                    shortcut: cleanShortcut,
                    content: formData.content
                });
                setReplies(prev => prev.map(r => r.id === editingReply.id ? data.data : r));
            } else {
                const { data } = await api.post('/api/quick-replies', {
                    name: formData.name,
                    shortcut: cleanShortcut,
                    content: formData.content
                });
                setReplies(prev => [...prev, data.data]);
            }
            setModalOpen(false);
        } catch (error) {
            console.error('Error saving quick reply:', error);
            alert(error.response?.data?.error || 'Error al guardar la respuesta rápida');
        }
    };

    const insertVariable = (variable) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = formData.content;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        
        const placeholder = `{{${variable}}}`;
        const newContent = before + placeholder + after;

        setFormData(prev => ({ ...prev, content: newContent }));

        // Refocus and set cursor position after insertion
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
        }, 10);
    };

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        return new Date(isoString).toLocaleDateString('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Filter in memory for immediate responsiveness
    const filteredReplies = replies.filter(reply => {
        const query = searchQuery.toLowerCase();
        return (
            reply.name.toLowerCase().includes(query) ||
            reply.shortcut.toLowerCase().includes(query) ||
            reply.content.toLowerCase().includes(query)
        );
    });

    const variables = ['nombre', 'telefono', 'email', 'empresa'];

    return (
        <div className="dashboard-content qr-page">
            {/* Header */}
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <MessageSquare size={28} style={{ color: 'var(--primary-color)' }} />
                        Respuestas Rápidas
                    </h1>
                    <p className="subtitle">
                        Configura respuestas predefinidas que puedes insertar en el chat usando "/"
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button className="bn-btn-refresh" onClick={fetchReplies} disabled={loading} title="Recargar">
                        <RefreshCw size={16} className={loading ? 'bn-spin' : ''} />
                    </button>
                    <button className="bn-btn-add" onClick={handleOpenAdd}>
                        <Plus size={16} />
                        Nueva Respuesta
                    </button>
                </div>
            </header>

            {/* Search and stats bar */}
            <div className="bn-top-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, comando o mensaje..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '38px', width: '100%', height: '42px', borderRadius: '12px' }}
                    />
                </div>
                <div className="bn-stats" style={{ display: 'flex', gap: '0.75rem' }}>
                    <div className="bn-stat-pill">
                        <span className="bn-stat-dot total-dot" style={{ backgroundColor: 'var(--primary-color)' }}></span>
                        <span>{filteredReplies.length} de {replies.length} respuestas</span>
                    </div>
                </div>
            </div>

            {/* List/Table view */}
            <div className="bn-table-card premium-card">
                {loading ? (
                    <div className="bn-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px', gap: '1rem' }}>
                        <RefreshCw size={24} className="bn-spin" />
                        <span>Cargando respuestas rápidas...</span>
                    </div>
                ) : filteredReplies.length === 0 ? (
                    <div className="bn-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px', gap: '1.5rem', textAlign: 'center' }}>
                        <AlertCircle size={36} style={{ opacity: 0.4 }} />
                        <div>
                            <span style={{ display: 'block', fontWeight: '700', fontSize: '1.1rem' }}>No se encontraron respuestas</span>
                            <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>Crea una nueva respuesta o cambia el término de búsqueda.</span>
                        </div>
                        <button className="bn-btn-add" onClick={handleOpenAdd}>
                            <Plus size={14} /> Agregar la primera
                        </button>
                    </div>
                ) : (
                    <div className="bn-table-wrapper" style={{ overflowX: 'auto' }}>
                        <table className="bn-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <th style={{ padding: '12px 16px' }}>Nombre</th>
                                    <th style={{ padding: '12px 16px' }}>Comando</th>
                                    <th style={{ padding: '12px 16px' }}>Mensaje</th>
                                    <th style={{ padding: '12px 16px' }}>Última actualización</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredReplies.map(reply => (
                                    <tr key={reply.id} style={{ borderBottom: '1px solid var(--border-light)' }} className="qr-row">
                                        <td style={{ padding: '14px 16px', fontWeight: 'bold' }}>{reply.name}</td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{
                                                backgroundColor: 'rgba(26,26,26,0.08)',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontFamily: 'monospace',
                                                fontSize: '0.9rem',
                                                color: 'var(--primary-color)',
                                                fontWeight: 'bold'
                                            }}>
                                                /{reply.shortcut}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 16px', maxWidth: '350px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {reply.content}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '0.85rem', opacity: 0.8 }}>
                                            {formatDate(reply.updated_at || reply.created_at)}
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                            <div className="bn-actions" style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                {/* Edit */}
                                                <button
                                                    className="bn-action-btn bn-edit"
                                                    onClick={() => handleOpenEdit(reply)}
                                                    title="Editar"
                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px' }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                {/* Duplicate */}
                                                <button
                                                    className="bn-action-btn bn-toggle"
                                                    onClick={() => handleDuplicate(reply)}
                                                    title="Duplicar"
                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px' }}
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                {/* Delete */}
                                                <button
                                                    className="bn-action-btn bn-delete"
                                                    onClick={() => handleDelete(reply.id)}
                                                    title="Eliminar"
                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px' }}
                                                >
                                                    <Trash2 size={16} />
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

            {/* Creation/Edition Modal */}
            {modalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="premium-card" style={{
                        width: '100%',
                        maxWidth: '550px',
                        padding: '2rem',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        margin: '1rem',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                    }}>
                        <button
                            onClick={() => setModalOpen(false)}
                            style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', background: 'none', border: 'none', opacity: 0.6 }}
                        >
                            <X size={20} />
                        </button>

                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Sparkles size={20} />
                                {editingReply ? 'Editar Respuesta Rápida' : 'Nueva Respuesta Rápida'}
                            </h2>
                            <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                                Diseña la respuesta para ser enviada rápidamente en tus chats.
                            </p>
                        </div>

                        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Nombre Interno</label>
                                <input
                                    type="text"
                                    placeholder="Ej. Bienvenida"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    required
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Comando Slash (Alias)</label>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <span style={{
                                        position: 'absolute',
                                        left: '12px',
                                        fontWeight: 'bold',
                                        color: 'var(--primary-color)',
                                        opacity: 0.7
                                    }}>
                                        /
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="bienvenida"
                                        value={formData.shortcut}
                                        onChange={(e) => setFormData(prev => ({ ...prev, shortcut: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                                        required
                                        style={{ width: '100%', paddingLeft: '24px' }}
                                    />
                                </div>
                                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                    Guarda únicamente el alias. El sistema agregará automáticamente el slash.
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Contenido del Mensaje</label>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <HelpCircle size={12} /> Variables dinámicas
                                    </span>
                                </div>
                                <textarea
                                    ref={textareaRef}
                                    rows={5}
                                    placeholder="Hola 👋&#10;Gracias por comunicarte con nosotros.&#10;¿En qué podemos ayudarte hoy?"
                                    value={formData.content}
                                    onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                                    required
                                    style={{ width: '100%', resize: 'none', lineHeight: '1.4' }}
                                />
                                
                                {/* Dynamic Variables Selector */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                                    {variables.map(v => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => insertVariable(v)}
                                            style={{
                                                background: 'rgba(26,26,26,0.06)',
                                                border: '1px dashed rgba(26,26,26,0.3)',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold',
                                                color: 'var(--primary-color)'
                                            }}
                                            title={`Insertar {{${v}}}`}
                                        >
                                            +{`{{${v}}}`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    style={{
                                        background: 'none',
                                        border: '1px solid var(--border-light)',
                                        padding: '0.6rem 1.2rem',
                                        borderRadius: '12px',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="bn-btn-add"
                                    style={{ margin: 0, padding: '0.6rem 1.2rem' }}
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuickRepliesPage;
