import React, { useState, useEffect, useRef } from 'react';
import {
    BrainCircuit, Plus, Edit2, Copy, Trash2, Search,
    RefreshCw, AlertCircle, X, ChevronUp, ChevronDown, GripVertical, Check, Info
} from 'lucide-react';
import api from '../services/api';

const GuideRulesPage = () => {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState(null); // null if creating, rule object if editing
    const [saving, setSaving] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);

    // Form fields state
    const [formData, setFormData] = useState({
        name: '',
        content: '',
        category: 'general',
        customCategory: '',
        isActive: true
    });

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/api/guide-rules');
            setRules(data.data || []);
        } catch (error) {
            console.error('Error fetching guide rules:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAdd = () => {
        setEditingRule(null);
        setFormData({
            name: '',
            content: '',
            category: 'general',
            customCategory: '',
            isActive: true
        });
        setModalOpen(true);
    };

    const handleOpenEdit = (rule) => {
        const isPredefined = ['general', 'saludos', 'precios', 'politicas', 'restricciones'].includes(rule.category);
        setEditingRule(rule);
        setFormData({
            name: rule.name,
            content: rule.content,
            category: isPredefined ? rule.category : 'custom',
            customCategory: isPredefined ? '' : rule.category,
            isActive: rule.isActive !== undefined ? rule.isActive : true
        });
        setModalOpen(true);
    };

    const handleDuplicate = async (rule) => {
        try {
            const { data } = await api.post('/api/guide-rules', {
                name: `${rule.name} (Copia)`,
                content: rule.content,
                category: rule.category,
                isActive: rule.isActive
            });
            // Refetch to ensure everything is sorted and synchronized
            await fetchRules();
        } catch (error) {
            console.error('Error duplicating rule:', error);
            alert('Error al duplicar la regla de guía');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Seguro que deseas eliminar esta regla de guía?')) return;
        try {
            await api.delete(`/api/guide-rules/${id}`);
            setRules(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            console.error('Error deleting rule:', error);
            alert('Error al eliminar la regla de guía');
        }
    };

    const handleToggleActive = async (rule) => {
        try {
            const updatedState = !rule.isActive;
            // Optimistic UI update
            setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: updatedState } : r));
            
            await api.put(`/api/guide-rules/${rule.id}`, {
                isActive: updatedState
            });
        } catch (error) {
            console.error('Error toggling rule status:', error);
            // Revert on failure
            setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: rule.isActive } : r));
            alert('Error al cambiar el estado de la regla');
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.name.trim() || !formData.content.trim()) {
            alert('El nombre y el contenido de la regla son obligatorios');
            return;
        }

        const finalCategory = formData.category === 'custom' 
            ? (formData.customCategory.trim().toLowerCase() || 'general') 
            : formData.category;

        setSaving(true);
        try {
            const payload = {
                name: formData.name.trim(),
                content: formData.content.trim(),
                category: finalCategory,
                isActive: formData.isActive
            };

            if (editingRule) {
                const { data } = await api.put(`/api/guide-rules/${editingRule.id}`, payload);
                setRules(prev => prev.map(r => r.id === editingRule.id ? data.data : r));
            } else {
                const { data } = await api.post('/api/guide-rules', payload);
                setRules(prev => [...prev, data.data]);
            }
            setModalOpen(false);
            // Refresh to ensure sorting/priorities are correct
            await fetchRules();
        } catch (error) {
            console.error('Error saving rule:', error);
            alert(error.response?.data?.error || 'Error al guardar la regla de guía');
        } finally {
            setSaving(false);
        }
    };

    const saveNewOrder = async (orderedIds) => {
        try {
            await api.put('/api/guide-rules/reorder', { orderedIds });
        } catch (error) {
            console.error('Error saving rules order:', error);
            alert('Error al guardar el orden de las reglas. Por favor recarga la página.');
        }
    };

    const handleMoveUp = async (index) => {
        if (index === 0) return;
        const newList = [...rules];
        const temp = newList[index];
        newList[index] = newList[index - 1];
        newList[index - 1] = temp;
        
        // Update state locally for immediate response
        setRules(newList);
        
        // Save to server
        await saveNewOrder(newList.map(r => r.id));
    };

    const handleMoveDown = async (index) => {
        if (index === rules.length - 1) return;
        const newList = [...rules];
        const temp = newList[index];
        newList[index] = newList[index + 1];
        newList[index + 1] = temp;
        
        // Update state locally
        setRules(newList);
        
        // Save to server
        await saveNewOrder(newList.map(r => r.id));
    };

    // HTML5 Drag and Drop Handlers
    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
        // Custom visual during drag
        e.currentTarget.classList.add('dragging');
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        
        const newList = [...rules];
        const draggedItem = newList[draggedIndex];
        newList.splice(draggedIndex, 1);
        newList.splice(index, 0, draggedItem);
        
        setDraggedIndex(index);
        setRules(newList);
    };

    const handleDragEnd = (e) => {
        e.currentTarget.classList.remove('dragging');
        setDraggedIndex(null);
        // Persist order to database
        saveNewOrder(rules.map(r => r.id));
    };

    // Extract categories for filters (include predefined and custom categories in database)
    const availableCategories = ['all', ...new Set(rules.map(r => r.category))];

    // Filter and Search
    const filteredRules = rules.filter(rule => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
            rule.name.toLowerCase().includes(query) ||
            rule.content.toLowerCase().includes(query) ||
            rule.category.toLowerCase().includes(query);

        const matchesCategory = categoryFilter === 'all' || rule.category === categoryFilter;
        
        const matchesStatus = 
            statusFilter === 'all' || 
            (statusFilter === 'active' && rule.isActive) ||
            (statusFilter === 'inactive' && !rule.isActive);

        return matchesSearch && matchesCategory && matchesStatus;
    });

    const getCategoryLabel = (cat) => {
        const labels = {
            general: 'General',
            saludos: 'Saludos',
            precios: 'Precios',
            politicas: 'Políticas',
            restricciones: 'Restricciones'
        };
        return labels[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
    };

    const getCategoryColor = (cat) => {
        const colors = {
            general: '#4a5568', // Slate
            saludos: '#2b6cb0', // Blue
            precios: '#2f855a', // Green
            politicas: '#c05621', // Orange
            restricciones: '#9b2c2c' // Red
        };
        return colors[cat] || '#718096'; // Neutral for custom
    };

    const isReorderingEnabled = searchQuery === '' && categoryFilter === 'all' && statusFilter === 'all';

    return (
        <div className="dashboard-content" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, color: '#1a1a1a' }}>
                        <BrainCircuit size={32} style={{ color: '#0a4b69' }} />
                        Reglas de Guía
                    </h1>
                    <p style={{ margin: '6px 0 0 0', color: '#4a5568', fontSize: '0.95rem' }}>
                        Define y gestiona las reglas de comportamiento que estructuran el prompt de la IA.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button 
                        onClick={fetchRules} 
                        disabled={loading} 
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid #D9E2EC',
                            borderRadius: '12px',
                            padding: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            transition: 'all 0.2s'
                        }}
                        title="Recargar"
                    >
                        <RefreshCw size={18} className={loading ? 'bn-spin' : ''} style={{ color: '#4a5568' }} />
                    </button>
                    <button 
                        onClick={handleOpenAdd}
                        style={{
                            background: '#0a4b69',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '10px 18px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 6px rgba(10, 75, 105, 0.2)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Plus size={18} />
                        Nueva Regla
                    </button>
                </div>
            </header>

            {/* Quick Helper Banner */}
            <div style={{
                background: 'rgba(10, 75, 105, 0.06)',
                border: '1px solid rgba(10, 75, 105, 0.15)',
                borderRadius: '14px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '24px'
            }}>
                <Info size={20} style={{ color: '#0a4b69', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.88rem', color: '#2d3748', lineHeight: '1.4' }}>
                    <strong>¿Cómo funciona?</strong> La IA lee estas reglas en orden de prioridad al generar respuestas. Las reglas activas modifican y controlan su comportamiento al instante sin necesidad de editar código. Arrastra las filas o usa las flechas para reordenar por importancia.
                </div>
            </div>

            {/* Toolbar (Search & Filters) */}
            <div style={{ 
                background: '#FFFFFF', 
                borderRadius: '16px', 
                padding: '16px', 
                border: '1px solid #D9E2EC',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Search */}
                    <div style={{ position: 'relative', flex: '1 1 300px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }} />
                        <input
                            type="text"
                            placeholder="Buscar regla por nombre, contenido o categoría..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ 
                                paddingLeft: '40px', 
                                width: '100%', 
                                height: '42px', 
                                borderRadius: '10px',
                                border: '1px solid #CBD5E0',
                                fontSize: '0.9rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Status Filter */}
                    <div style={{ display: 'flex', gap: '4px', background: '#EDF2F7', padding: '4px', borderRadius: '10px' }}>
                        <button 
                            onClick={() => setStatusFilter('all')}
                            style={{
                                padding: '6px 14px',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                background: statusFilter === 'all' ? '#FFFFFF' : 'transparent',
                                color: statusFilter === 'all' ? '#1a1a1a' : '#718096',
                                boxShadow: statusFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            Todos
                        </button>
                        <button 
                            onClick={() => setStatusFilter('active')}
                            style={{
                                padding: '6px 14px',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                background: statusFilter === 'active' ? '#FFFFFF' : 'transparent',
                                color: statusFilter === 'active' ? '#1a1a1a' : '#718096',
                                boxShadow: statusFilter === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            Activos
                        </button>
                        <button 
                            onClick={() => setStatusFilter('inactive')}
                            style={{
                                padding: '6px 14px',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                background: statusFilter === 'inactive' ? '#FFFFFF' : 'transparent',
                                color: statusFilter === 'inactive' ? '#1a1a1a' : '#718096',
                                boxShadow: statusFilter === 'inactive' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            Inactivos
                        </button>
                    </div>
                </div>

                {/* Category filters */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#718096', marginRight: '4px' }}>CATEGORÍA:</span>
                    {availableCategories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            style={{
                                padding: '6px 14px',
                                border: '1px solid',
                                borderColor: categoryFilter === cat ? '#0a4b69' : '#E2E8F0',
                                borderRadius: '20px',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                background: categoryFilter === cat ? '#0a4b69' : '#FFFFFF',
                                color: categoryFilter === cat ? '#FFFFFF' : '#4a5568',
                                transition: 'all 0.15s'
                            }}
                        >
                            {cat === 'all' ? 'Todas' : getCategoryLabel(cat)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Reorder Warning Banner */}
            {!isReorderingEnabled && rules.length > 0 && (
                <div style={{
                    background: '#FFFDF5',
                    border: '1px solid #FEEBC8',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    fontSize: '0.8rem',
                    color: '#C05621',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <AlertCircle size={14} />
                    La reordenación por arrastre está desactivada mientras haya filtros o búsquedas aplicadas.
                </div>
            )}

            {/* Rules List Container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px', gap: '12px', background: '#FFFFFF', borderRadius: '18px', border: '1px solid #D9E2EC' }}>
                        <RefreshCw size={32} className="bn-spin" style={{ color: '#0a4b69' }} />
                        <span style={{ color: '#4a5568', fontWeight: 'bold' }}>Cargando reglas de guía...</span>
                    </div>
                ) : filteredRules.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px', gap: '16px', textAlign: 'center', background: '#FFFFFF', borderRadius: '18px', border: '1px solid #D9E2EC' }}>
                        <AlertCircle size={48} style={{ color: '#A0AEC0' }} />
                        <div>
                            <span style={{ display: 'block', fontWeight: 'bold', fontSize: '1.15rem', color: '#1a1a1a' }}>No se encontraron reglas</span>
                            <span style={{ fontSize: '0.9rem', color: '#718096', marginTop: '4px', display: 'block' }}>
                                {rules.length === 0 ? 'Aún no has creado ninguna regla de comportamiento.' : 'Ninguna regla coincide con los filtros activos.'}
                            </span>
                        </div>
                        {rules.length === 0 && (
                            <button 
                                onClick={handleOpenAdd}
                                style={{
                                    background: '#0a4b69',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '10px',
                                    padding: '8px 16px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Crear la primera regla
                            </button>
                        )}
                    </div>
                ) : (
                    filteredRules.map((rule, index) => {
                        // Find true index in the global rules array for priority manipulation
                        const globalIndex = rules.findIndex(r => r.id === rule.id);

                        return (
                            <div
                                key={rule.id}
                                draggable={isReorderingEnabled}
                                onDragStart={(e) => handleDragStart(e, globalIndex)}
                                onDragOver={(e) => handleDragOver(e, globalIndex)}
                                onDragEnd={handleDragEnd}
                                className="premium-card"
                                style={{
                                    background: '#FFFFFF',
                                    borderRadius: '16px',
                                    border: '1px solid #D9E2EC',
                                    padding: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                    cursor: isReorderingEnabled ? 'grab' : 'default',
                                    transition: 'transform 0.2s, box-shadow 0.2s, opacity 0.2s',
                                    opacity: rule.isActive ? 1 : 0.65
                                }}
                            >
                                {/* Grip/Reorder column */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                    {isReorderingEnabled ? (
                                        <div style={{ color: '#A0AEC0', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }} title="Arrastrar para ordenar">
                                            <GripVertical size={20} />
                                        </div>
                                    ) : (
                                        <div style={{ width: '20px' }}></div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <button 
                                            onClick={() => handleMoveUp(globalIndex)} 
                                            disabled={globalIndex === 0}
                                            style={{ 
                                                border: 'none', 
                                                background: 'none', 
                                                padding: '2px', 
                                                cursor: globalIndex === 0 ? 'not-allowed' : 'pointer',
                                                color: globalIndex === 0 ? '#E2E8F0' : '#4a5568'
                                            }}
                                            title="Subir prioridad"
                                        >
                                            <ChevronUp size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleMoveDown(globalIndex)} 
                                            disabled={globalIndex === rules.length - 1}
                                            style={{ 
                                                border: 'none', 
                                                background: 'none', 
                                                padding: '2px', 
                                                cursor: globalIndex === rules.length - 1 ? 'not-allowed' : 'pointer',
                                                color: globalIndex === rules.length - 1 ? '#E2E8F0' : '#4a5568'
                                            }}
                                            title="Bajar prioridad"
                                        >
                                            <ChevronDown size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Priority Badge */}
                                <div style={{
                                    background: 'rgba(10, 75, 105, 0.08)',
                                    color: '#0a4b69',
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    flexShrink: 0,
                                    textAlign: 'center',
                                    minWidth: '50px'
                                }}>
                                    Prio #{globalIndex + 1}
                                </div>

                                {/* Main details */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold', color: '#2d3748' }}>{rule.name}</h3>
                                        <span style={{
                                            backgroundColor: getCategoryColor(rule.category) + '15',
                                            color: getCategoryColor(rule.category),
                                            padding: '3px 8px',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: '800',
                                            textTransform: 'uppercase'
                                        }}>
                                            {getCategoryLabel(rule.category)}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#4a5568', lineHeight: '1.4', wordBreak: 'break-word' }}>
                                        {rule.content}
                                    </p>
                                </div>

                                {/* Right Side Actions: Switch & Edit/Delete */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
                                    {/* Switch */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: rule.isActive ? '#2f855a' : '#718096' }}>
                                            {rule.isActive ? 'Activa' : 'Inactiva'}
                                        </span>
                                        <div 
                                            onClick={() => handleToggleActive(rule)}
                                            style={{
                                                width: '42px',
                                                height: '22px',
                                                borderRadius: '50px',
                                                background: rule.isActive ? '#2f855a' : '#CBD5E0',
                                                position: 'relative',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                        >
                                            <div style={{
                                                width: '16px',
                                                height: '16px',
                                                borderRadius: '50%',
                                                background: '#FFFFFF',
                                                position: 'absolute',
                                                top: '3px',
                                                left: rule.isActive ? '23px' : '3px',
                                                transition: 'left 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                            }} />
                                        </div>
                                    </div>

                                    {/* Edit / Duplicate / Delete */}
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button 
                                            onClick={() => handleOpenEdit(rule)}
                                            style={{ border: 'none', background: 'none', padding: '6px', cursor: 'pointer', color: '#4a5568', borderRadius: '8px', transition: 'background 0.2s' }}
                                            className="action-btn-hover"
                                            title="Editar"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDuplicate(rule)}
                                            style={{ border: 'none', background: 'none', padding: '6px', cursor: 'pointer', color: '#4a5568', borderRadius: '8px', transition: 'background 0.2s' }}
                                            className="action-btn-hover"
                                            title="Duplicar"
                                        >
                                            <Copy size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(rule.id)}
                                            style={{ border: 'none', background: 'none', padding: '6px', cursor: 'pointer', color: '#e53e3e', borderRadius: '8px', transition: 'background 0.2s' }}
                                            className="action-btn-hover"
                                            title="Eliminar"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Form Modal */}
            {modalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    animation: 'fadeIn 0.2s'
                }}>
                    <div className="premium-card" style={{
                        background: '#FFFFFF',
                        borderRadius: '20px',
                        border: '1px solid #D9E2EC',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        width: '100%',
                        maxWidth: '520px',
                        padding: '24px',
                        position: 'relative'
                    }}>
                        <button 
                            onClick={() => setModalOpen(false)}
                            style={{
                                position: 'absolute',
                                right: '16px',
                                top: '16px',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#718096'
                            }}
                        >
                            <X size={20} />
                        </button>

                        <h3 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 20px 0', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BrainCircuit size={20} style={{ color: '#0a4b69' }} />
                            {editingRule ? 'Editar Regla de Guía' : 'Nueva Regla de Guía'}
                        </h3>

                        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Rule Name */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#2d3748' }}>Nombre de la regla</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Saludar usando Sumercé"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E0',
                                        fontSize: '0.9rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Category Selection */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#2d3748' }}>Categoría</label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E0',
                                        fontSize: '0.9rem',
                                        outline: 'none',
                                        background: '#FFFFFF'
                                    }}
                                >
                                    <option value="general">General</option>
                                    <option value="saludos">Saludos</option>
                                    <option value="precios">Precios</option>
                                    <option value="politicas">Políticas</option>
                                    <option value="restricciones">Restricciones</option>
                                    <option value="custom">Categoría Personalizada...</option>
                                </select>
                            </div>

                            {/* Custom Category Input */}
                            {formData.category === 'custom' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', animation: 'slideDown 0.2s' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#2d3748' }}>Nombre de Categoría Personalizada</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Descuentos, Envíos..."
                                        value={formData.customCategory}
                                        onChange={(e) => setFormData(prev => ({ ...prev, customCategory: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                                        required
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E0',
                                            fontSize: '0.9rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            )}

                            {/* Rule Content */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#2d3748' }}>Instrucción de la regla</label>
                                <textarea
                                    rows={4}
                                    placeholder="Instrucción detallada para el prompt del sistema. Ej: Siempre responde con respeto al cliente, utilizando la palabra sumercé en el primer y último mensaje de la conversación."
                                    value={formData.content}
                                    onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E0',
                                        fontSize: '0.9rem',
                                        outline: 'none',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            {/* Rule Active Switch inside modal */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                                <input
                                    type="checkbox"
                                    id="rule-active-checkbox"
                                    checked={formData.isActive}
                                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <label htmlFor="rule-active-checkbox" style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#2d3748', cursor: 'pointer' }}>
                                    Habilitar regla inmediatamente
                                </label>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    style={{
                                        background: 'none',
                                        border: '1px solid #CBD5E0',
                                        padding: '10px 18px',
                                        borderRadius: '12px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        color: '#4a5568'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        background: '#0a4b69',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        padding: '10px 20px',
                                        borderRadius: '12px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GuideRulesPage;
