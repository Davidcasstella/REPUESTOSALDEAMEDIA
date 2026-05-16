import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Upload, FileText, Search, Plus, Trash2, RefreshCw,
    Download, X, AlertCircle, CheckCircle, Clock, Loader,
    BookOpen, Calendar, ChevronRight, Pencil, Eye, EyeOff, Check, ClipboardList
} from 'lucide-react';
import useKnowledgeStore from '../features/knowledge-base/store/useKnowledgeStore';
import useStagesStore from '../features/knowledge-base/store/useStagesStore';
import api from '../services/api';

const KnowledgeBasePage = () => {
    // ── Stores ──────────────────────────────────────────────
    const {
        documents, loading, uploading, error: docError,
        fetchDocuments, uploadDocument, reprocessDocument, deleteDocument, clearError
    } = useKnowledgeStore();

    const {
        stages, activeStageId,
        fetchStages, setActiveStageId, createStage, deleteStage,
        toggleStage, renameStage
    } = useStagesStore();

    // ── Local state ─────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('editor');
    const [dragActive, setDragActive] = useState(false);

    // Entries
    const [manualEntries, setManualEntries] = useState([]);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const [modalContent, setModalContent] = useState('');
    const [modalEditingId, setModalEditingId] = useState(null);
    const [savingManual, setSavingManual] = useState(false);

    // RAG search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState('');
    const [searching, setSearching] = useState(false);

    // Stage create
    const [showNewStage, setShowNewStage] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [creatingStage, setCreatingStage] = useState(false);

    // Stage rename (inline per pill)
    const [renamingStageId, setRenamingStageId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const renameInputRef = useRef(null);

    const fileInputRef = useRef(null);

    // Catalog processing state
    const catalogInputRef = useRef(null);
    const [catalogUploading, setCatalogUploading] = useState(false);
    const [catalogResult, setCatalogResult] = useState(null);

    // ── Fetch data ──────────────────────────────────────────
    useEffect(() => { fetchStages(); }, []);

    useEffect(() => {
        if (activeStageId) {
            fetchDocuments(activeStageId);
            loadManualEntries(activeStageId);
        }
    }, [activeStageId]);

    // Focus rename input when activating
    useEffect(() => {
        if (renamingStageId) renameInputRef.current?.focus();
    }, [renamingStageId]);

    const loadManualEntries = async (stageId) => {
        try {
            const q = stageId ? `?stageId=${stageId}` : '';
            const { data } = await api.get(`/api/knowledge-base/manual-knowledge${q}`);
            if (data.success) setManualEntries(data.entries || []);
        } catch {}
    };

    // ── Stage handlers ──────────────────────────────────────
    const handleCreateStage = async () => {
        if (!newStageName.trim()) return;
        setCreatingStage(true);
        try {
            await createStage(newStageName.trim());
            setNewStageName('');
            setShowNewStage(false);
        } catch (err) { alert(err.message); }
        setCreatingStage(false);
    };

    const handleDeleteStage = async (id, name) => {
        if (!confirm(`¿Eliminar la etapa "${name}"? Los datos pasan a General.`)) return;
        try { await deleteStage(id); } catch (err) { alert(err.message); }
    };

    const startRename = (stage, e) => {
        e.stopPropagation();
        setRenamingStageId(stage.id);
        setRenameValue(stage.name);
    };

    const commitRename = async (id) => {
        if (!renameValue.trim()) { cancelRename(); return; }
        try {
            await renameStage(id, renameValue.trim());
        } catch (err) { alert(err.message); }
        setRenamingStageId(null);
        setRenameValue('');
    };

    const cancelRename = () => { setRenamingStageId(null); setRenameValue(''); };

    const handleToggleActive = async (id, currentActive, e) => {
        e.stopPropagation();
        try { await toggleStage(id, !currentActive); } catch (err) { alert(err.message); }
    };

    // ── Upload handlers ─────────────────────────────────────
    const handleDrop = useCallback((e) => {
        e.preventDefault(); setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    }, [activeStageId]);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) handleFileUpload(file);
        e.target.value = '';
    };

    const handleFileUpload = async (file) => {
        const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
        if (!['.pdf', '.txt'].includes(ext)) { alert('Solo PDF y TXT'); return; }
        await uploadDocument(file, activeStageId);
    };

    // ── Catalog processing ────────────────────────────────────
    const handleCatalogSelect = (e) => {
        const file = e.target.files[0];
        if (file) handleCatalogUpload(file);
        e.target.value = '';
    };

    const handleCatalogUpload = async (file) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            alert('Solo se aceptan archivos PDF para catálogos');
            return;
        }
        setCatalogUploading(true);
        setCatalogResult(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/api/product-catalog/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 120000,
            });
            if (data.success) {
                setCatalogResult(data.data);
            } else {
                alert(data.message || 'Error al procesar catálogo');
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Error al procesar catálogo');
        }
        setCatalogUploading(false);
    };

    // ── Manual knowledge ────────────────────────────────────
    const openNewModal = () => {
        setModalEditingId(null); setModalTitle(''); setModalContent(''); setModalOpen(true);
    };
    const openEditModal = (entry) => {
        setModalEditingId(entry.id); setModalTitle(entry.title); setModalContent(entry.content); setModalOpen(true);
    };
    const closeModal = () => {
        setModalOpen(false); setModalTitle(''); setModalContent(''); setModalEditingId(null);
    };

    const handleModalSave = async () => {
        if (!modalTitle.trim() || !modalContent.trim()) return;
        setSavingManual(true);
        try {
            if (modalEditingId) {
                await api.put(`/api/knowledge-base/manual-knowledge/${modalEditingId}`, {
                    title: modalTitle, content: modalContent
                });
            } else {
                await api.post('/api/knowledge-base/manual-knowledge', {
                    title: modalTitle, content: modalContent, stageId: activeStageId
                });
            }
            closeModal();
            await loadManualEntries(activeStageId);
        } catch { alert('Error al guardar'); }
        setSavingManual(false);
    };

    const handleDeleteManual = async (id) => {
        if (!confirm('¿Eliminar esta entrada?')) return;
        try {
            await api.delete(`/api/knowledge-base/manual-knowledge/${id}`);
            await loadManualEntries(activeStageId);
        } catch { alert('Error al eliminar'); }
    };

    const handleReprocessManual = async () => {
        try { await api.post('/api/knowledge-base/manual-knowledge/reprocess'); alert('Re-vectorización completada'); }
        catch { alert('Error al re-vectorizar'); }
    };

    // ── RAG search ──────────────────────────────────────────
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearching(true); setSearchResult('');
        try {
            const { data } = await api.post('/api/knowledge-base/search', { query: searchQuery });
            setSearchResult(data.context || 'Sin resultados');
        } catch { setSearchResult('Error en la búsqueda'); }
        setSearching(false);
    };

    // ── Status badge ────────────────────────────────────────
    const renderStatus = (status, chunkCount) => {
        switch (status) {
            case 'processed': return <span className="kb-status-badge kb-status-success"><CheckCircle size={11} /> {chunkCount} chunks</span>;
            case 'processing': return <span className="kb-status-badge kb-status-processing"><Loader size={11} className="spin" /> Procesando</span>;
            case 'error': return <span className="kb-status-badge kb-status-error"><AlertCircle size={11} /> Error</span>;
            default: return <span className="kb-status-badge kb-status-pending"><Clock size={11} /> En cola</span>;
        }
    };

    // Unify and sort entries (newest first)
    const unifiedEntries = [
        ...manualEntries.map(e => ({ ...e, _itemType: 'manual', _sortDate: new Date(e.createdAt || 0).getTime() })),
        ...documents.map(d => ({ ...d, _itemType: 'document', title: d.name, _sortDate: new Date(d.createdAt || 0).getTime() }))
    ].sort((a, b) => b._sortDate - a._sortDate);

    const activeStageName = stages.find(s => s.id === activeStageId)?.name || 'General';

    return (
        <>
            {/* ── SAAS HEADER (Sticky & Full Width - Only Title) ──────────────────────────────── */}
            <div style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#3b7cd2', width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center' }}>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>📚 Base de Conocimiento</h1>
                </div>
            </div>

            <div 
                className={`kb-page-container ${dragActive ? 'kb-drag-active-global' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                style={{ position: 'relative' }}
            >

                {/* ── SEARCH (RAG) ──────────────────────────────────────────────── */}
                <div className="kb-search-container" style={{ marginBottom: '0.5rem' }}>
                    <form className="kb-search-form-inline" onSubmit={handleSearch}>
                        <Search size={15} className="kb-search-icon" />
                        <input
                            type="text" className="kb-search-input"
                            placeholder="Probar RAG: escribe una pregunta para ver qué respondería el chatbot..."
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        />
                        <button type="submit" className="kb-search-btn" disabled={searching || !searchQuery.trim()}>
                            {searching ? <Loader size={13} className="spin" /> : <ChevronRight size={13} />}
                        </button>
                    </form>
                    {searchResult && (
                        <div className="kb-search-result-preview">
                            <span className="kb-search-result-label">Respuesta del chatbot:</span>
                            <p>{searchResult}</p>
                        </div>
                    )}
                </div>

            {dragActive && (
                <div className="kb-global-drag-overlay" style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(241, 245, 249, 0.95)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '3px dashed #3b7cd2',
                    borderRadius: '16px',
                    color: '#0f172a',
                    pointerEvents: 'none' /* FIX: prevents infinite dragLeave/dragOver flickering loop */
                }}>
                    <Upload size={48} style={{ marginBottom: '1rem', color: '#3b7cd2' }} />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Suelta tus documentos aquí</h2>
                    <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Soportamos archivos PDF y TXT</p>
                </div>
            )}

            {/* Error */}
            {docError && (
                <div className="kb-error-banner">
                    <AlertCircle size={16} /><span>{docError}</span>
                    <button onClick={clearError}><X size={14} /></button>
                </div>
            )}

            {/* Header moved to the top outside container */}

            {/* ── STAGES BAR ──────────────────────────────── */}
            <div className="kb-stages-bar">
                <div className="kb-stages-pills">
                    {stages.map(stage => (
                        <div
                            key={stage.id}
                            className={`kb-stage-pill-wrap ${activeStageId === stage.id ? 'active' : ''} ${!stage.active ? 'inactive' : ''}`}
                            onClick={() => !renamingStageId && setActiveStageId(stage.id)}
                        >
                            {renamingStageId === stage.id ? (
                                /* ── Inline rename mode ── */
                                <div className="kb-stage-rename-mode" onClick={e => e.stopPropagation()}>
                                    <input
                                        ref={renameInputRef}
                                        type="text"
                                        className="kb-stage-rename-input"
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') commitRename(stage.id);
                                            if (e.key === 'Escape') cancelRename();
                                        }}
                                    />
                                    <button className="kb-stage-rename-ok" onClick={() => commitRename(stage.id)}>
                                        <Check size={11} />
                                    </button>
                                    <button className="kb-stage-rename-cancel" onClick={cancelRename}>
                                        <X size={11} />
                                    </button>
                                </div>
                            ) : (
                                /* ── Normal pill ── */
                                <>
                                    <Calendar size={12} />
                                    <span className="kb-stage-name">{stage.name}</span>
                                    {!stage.active && <span className="kb-stage-inactive-badge">off</span>}

                                    {/* Actions group (shown on hover) */}
                                    <div className="kb-stage-actions-group">
                                        {/* Rename */}
                                        <span className="kb-stage-action-btn" onClick={e => startRename(stage, e)} title="Renombrar">
                                            <Pencil size={10} />
                                        </span>
                                        {/* Toggle active */}
                                        <span
                                            className="kb-stage-action-btn"
                                            onClick={e => handleToggleActive(stage.id, stage.active, e)}
                                            title={stage.active ? 'Desactivar' : 'Activar'}
                                        >
                                            {stage.active ? <EyeOff size={10} /> : <Eye size={10} />}
                                        </span>
                                        {/* Delete */}
                                        <span
                                            className="kb-stage-action-btn kb-stage-action-delete"
                                            onClick={e => { e.stopPropagation(); handleDeleteStage(stage.id, stage.name); }}
                                            title="Eliminar etapa"
                                        >
                                            <X size={10} />
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}

                    {/* New stage */}
                    {showNewStage ? (
                        <div className="kb-stage-create-inline">
                            <input
                                type="text" className="kb-stage-input" placeholder="Nombre..."
                                value={newStageName} onChange={e => setNewStageName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateStage()}
                                autoFocus
                            />
                            <button className="kb-stage-confirm" onClick={handleCreateStage}
                                disabled={creatingStage || !newStageName.trim()}>
                                {creatingStage ? <Loader size={11} className="spin" /> : <CheckCircle size={11} />}
                            </button>
                            <button className="kb-stage-cancel" onClick={() => { setShowNewStage(false); setNewStageName(''); }}>
                                <X size={11} />
                            </button>
                        </div>
                    ) : (
                        <button className="kb-stage-pill-wrap kb-stage-add" onClick={() => setShowNewStage(true)}>
                            <Plus size={12} /> Nueva Etapa
                        </button>
                    )}
                </div>
            </div>

            {/* ── MAIN CARD (Unified Documentos) ────────────────────── */}
            <div className="premium-card kb-main-card">
                
                {/* ── Hidden file input for documents ── */}
                <input ref={fileInputRef} type="file" accept=".pdf,.txt"
                    onChange={handleFileSelect} style={{ display: 'none' }} />
                {/* ── Hidden file input for catalog PDFs ── */}
                <input ref={catalogInputRef} type="file" accept=".pdf"
                    onChange={handleCatalogSelect} style={{ display: 'none' }} />

                <div className="kb-tab-content">
                    {/* ── Topbar ── */}
                    <div className="kb-entries-topbar">
                        <div className="kb-entries-title">
                            <FileText size={14} />
                            <span>
                                {unifiedEntries.length > 0
                                    ? `Documentos (${unifiedEntries.length})`
                                    : `Sin contenido en "${activeStageName}"`}
                            </span>
                        </div>
                        <div className="kb-entries-topbar-actions">
                            <button className="kb-btn-sec kb-btn-outline" onClick={handleReprocessManual}
                                title="Re-vectorizar contenido">
                                <RefreshCw size={13} />
                            </button>
                            <button className="kb-btn-sec kb-btn-outline" onClick={openNewModal}>
                                <Plus size={13} /> Agregar texto
                            </button>
                            <button className="kb-btn-pri" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                                {uploading ? <Loader size={13} className="spin" /> : <Upload size={13} />}
                                {uploading ? 'Subiendo...' : 'Subir archivo'}
                            </button>
                            <button
                                className="kb-btn-pri"
                                style={{ backgroundColor: '#16a34a' }}
                                onClick={() => catalogInputRef.current?.click()}
                                disabled={catalogUploading}
                                title="Procesar un PDF de catálogo de precios (ej: Toyota BDC)"
                            >
                                {catalogUploading ? <Loader size={13} className="spin" /> : <ClipboardList size={13} />}
                                {catalogUploading ? 'Procesando...' : '📋 Procesar Catálogo'}
                            </button>
                        </div>
                    </div>



                    {/* ── Catalog processing result ── */}
                    {catalogResult && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            marginBottom: '0.75rem',
                            borderRadius: '8px',
                            backgroundColor: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.85rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CheckCircle size={16} style={{ color: '#16a34a' }} />
                                <span>
                                    <strong>{catalogResult.fileName}</strong>: {catalogResult.totalExtracted} productos extraídos
                                    ({catalogResult.inserted} nuevos, {catalogResult.updated} actualizados)
                                </span>
                            </div>
                            <button
                                onClick={() => setCatalogResult(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* ── Unified List ── */}
                    {unifiedEntries.length > 0 ? (
                        <div className="kb-entries-list-compact">
                            {unifiedEntries.map((entry, idx) => (
                                <div key={entry.id || idx} className="kb-entry-row">
                                    <span className="kb-type-badge">
                                        {entry._itemType === 'document' ? entry.type?.toUpperCase() : 'TEXTO'}
                                    </span>
                                    
                                    <div className="kb-entry-row-info" style={{ flex: 1 }}>
                                        <span className="kb-entry-row-title">{entry.title}</span>
                                    </div>
                                    <div className="kb-entry-row-status" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                        {entry._itemType === 'document' ? (
                                            <span className="kb-entry-row-preview">
                                                {renderStatus(entry.status, entry.chunkCount)}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize:'0.75rem', color:'#64748b', fontWeight:500 }}>
                                                {new Date(entry.updatedAt || entry.createdAt || entry._sortDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>

                                    {/* Date aligned to the right for documents, but for UI layout let's put it on the right or rely on the status column */}
                                    {entry._itemType === 'document' && (
                                        <div className="kb-entry-row-date" style={{ 
                                            marginRight: '1rem', 
                                            fontSize: '0.75rem', 
                                            color: '#64748b', /* Slate 500 */ 
                                            fontWeight: 500,
                                            whiteSpace: 'nowrap' 
                                        }}>
                                            {new Date(entry.updatedAt || entry.createdAt || entry._sortDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </div>
                                    )}

                                    <div className="kb-entry-row-actions">
                                        {entry._itemType === 'document' ? (
                                            <>
                                                {entry.status === 'error' && (
                                                    <button className="kb-icon-btn" title="Reintentar"
                                                        onClick={() => reprocessDocument(entry.id, activeStageId)}>
                                                        <RefreshCw size={13} />
                                                    </button>
                                                )}
                                                <button className="kb-icon-btn" title="Descargar"
                                                    onClick={() => window.open(`${api.defaults.baseURL}/api/knowledge-base/documents/${entry.id}/download`, '_blank')}>
                                                    <Download size={13} />
                                                </button>
                                                <button className="kb-icon-btn kb-icon-btn-danger" title="Eliminar"
                                                    onClick={() => deleteDocument(entry.id, activeStageId)}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button className="kb-icon-btn" onClick={() => openEditModal(entry)} title="Editar texto">
                                                    <Pencil size={13} />
                                                </button>
                                                <button className="kb-icon-btn kb-icon-btn-danger"
                                                    onClick={() => handleDeleteManual(entry.id)} title="Eliminar">
                                                    <Trash2 size={13} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="kb-empty-state" style={{ paddingTop: '1.5rem' }}>
                            <FileText size={26} />
                            <h2>Sin documentos</h2>
                            <p>Sube archivos o escribe contenido manualmente para empezar</p>
                        </div>
                    )}
                </div>
            </div>
        </div>

            {/* ── MODAL ───────────────────────────────────── */}
            {modalOpen && (
                <div className="kb-modal-overlay" onClick={closeModal}>
                    <div className="kb-modal" onClick={e => e.stopPropagation()}>
                        <div className="kb-modal-header">
                            <h3>{modalEditingId ? 'Editar contenido' : 'Nuevo contenido'}</h3>
                            <button className="kb-modal-close" onClick={closeModal}><X size={16} /></button>
                        </div>
                        <div className="kb-modal-body">
                            <input
                                type="text" className="form-input kb-modal-title-input"
                                placeholder="Título (ej: Pastillas de freno Toyota)"
                                value={modalTitle} onChange={e => setModalTitle(e.target.value)}
                                autoFocus
                            />
                            <textarea
                                className="form-input kb-modal-textarea"
                                placeholder={"Escribe el conocimiento aquí...\n\nEjemplo:\n¿Tienes pastillas de freno para Toyota Corolla?\nSí, tenemos disponibles para modelos 2015-2022..."}
                                value={modalContent} onChange={e => setModalContent(e.target.value)}
                                rows={10}
                            />
                        </div>
                        <div className="kb-modal-footer">
                            <button className="btn-premium danger" onClick={closeModal}>
                                <X size={13} /> Cancelar
                            </button>
                            <button
                                className="btn-premium primary"
                                onClick={handleModalSave}
                                disabled={savingManual || !modalTitle.trim() || !modalContent.trim()}
                            >
                                {savingManual ? <Loader size={13} className="spin" /> : <CheckCircle size={13} />}
                                {modalEditingId ? 'Guardar cambios' : 'Guardar y vectorizar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default KnowledgeBasePage;
