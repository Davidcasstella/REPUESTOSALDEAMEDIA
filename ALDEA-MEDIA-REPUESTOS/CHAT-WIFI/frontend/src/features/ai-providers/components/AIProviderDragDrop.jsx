import React, { useState, useRef, useEffect } from 'react';
import { GripVertical, ArrowRight, Zap, Target, Layers, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import useProvidersStore from '../store/useProvidersStore';
import socket from '../../../services/socket';
import './AIProviderDragDrop.css';

/**
 * Returns a CSS class for the provider icon based on the provider name.
 */
const getProviderIconClass = (name) => {
    const n = name.toLowerCase();
    if (n.includes('openai') || n.includes('chatgpt')) return 'dnd-icon-openai';
    if (n.includes('gemini') || n.includes('google')) return 'dnd-icon-gemini';
    if (n.includes('groq') || n.includes('grog')) return 'dnd-icon-groq';
    if (n.includes('grok') || n.includes('xai')) return 'dnd-icon-grok';
    if (n.includes('z.ia') || n.includes('propio')) return 'dnd-icon-zia';
    return 'dnd-icon-default';
};

/**
 * Returns a short label for the provider icon.
 */
const getProviderLabel = (name) => {
    const n = name.toLowerCase();
    if (n.includes('openai') || n.includes('chatgpt')) return 'GPT';
    if (n.includes('gemini') || n.includes('google')) return 'GEM';
    if (n.includes('groq') || n.includes('grog')) return 'GRQ';
    if (n.includes('grok') || n.includes('xai')) return 'GRK';
    if (n.includes('z.ia')) return 'Z.ia';
    return 'AI';
};

const AIProviderDragDrop = () => {
    const { providers, activateProvider, reactivateProvider, fetchProviders } = useProvidersStore();
    const [dragOverActive, setDragOverActive] = useState(false);
    const [draggingId, setDraggingId] = useState(null);
    const [reactivatingId, setReactivatingId] = useState(null);
    const dropRef = useRef(null);

    // Derived state from provider status
    const activeProvider = providers.find(p => p.status === 'active') || null;
    const availableProviders = providers.filter(p => p.status === 'available');
    const exhaustedProviders = providers.filter(p => p.status === 'exhausted');

    // Listen for real-time provider status changes
    useEffect(() => {
        const handleStatusChange = (data) => {
            console.log('🔄 Provider status changed:', data);
            fetchProviders();
        };

        socket.on('provider-status-changed', handleStatusChange);
        return () => socket.off('provider-status-changed', handleStatusChange);
    }, [fetchProviders]);

    // ── Drag handlers ──
    const handleDragStart = (e, provider) => {
        e.dataTransfer.setData('text/plain', provider.id);
        e.dataTransfer.effectAllowed = 'move';
        setDraggingId(provider.id);
    };

    const handleDragEnd = () => {
        setDraggingId(null);
        setDragOverActive(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverActive(true);
    };

    const handleDragLeave = (e) => {
        if (dropRef.current && !dropRef.current.contains(e.relatedTarget)) {
            setDragOverActive(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setDragOverActive(false);
        setDraggingId(null);

        const providerId = e.dataTransfer.getData('text/plain');
        if (providerId && providerId !== activeProvider?.id) {
            await activateProvider(providerId);
        }
    };

    const handleReactivate = async (id) => {
        setReactivatingId(id);
        await reactivateProvider(id);
        setReactivatingId(null);
    };

    // If no providers exist, don't render
    if (providers.length === 0) return null;

    const allExhausted = availableProviders.length === 0 && !activeProvider;

    return (
        <div className="dnd-container premium-card" style={{ padding: '1.25rem' }}>
            <div className="dnd-title-row">
                <Layers size={18} />
                <h3>Pool de IAs — Sistema de Cola</h3>
            </div>

            {/* ALL EXHAUSTED WARNING */}
            {allExhausted && exhaustedProviders.length > 0 && (
                <div className="dnd-all-exhausted-banner">
                    <AlertTriangle size={20} />
                    <div>
                        <strong>Sin providers disponibles</strong>
                        <span>Todas las IAs están agotadas. Reactiva una para continuar.</span>
                    </div>
                </div>
            )}

            {/* TOP SECTION: Available (left) + Active (right) */}
            <div className="dnd-layout">
                {/* LEFT: Available providers (green) */}
                <div className="dnd-section dnd-section-available">
                    <div className="dnd-section-label">
                        <Zap size={12} />
                        <span>IAs Disponibles ({availableProviders.length})</span>
                    </div>

                    {availableProviders.length === 0 ? (
                        <div className="dnd-available-empty">
                            {activeProvider
                                ? 'No hay IAs en cola. La activa es la única disponible.'
                                : 'Todas las IAs están agotadas.'}
                        </div>
                    ) : (
                        availableProviders.map((provider, idx) => (
                            <div
                                key={provider.id}
                                className={`dnd-card ${draggingId === provider.id ? 'dragging' : ''}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, provider)}
                                onDragEnd={handleDragEnd}
                            >
                                <div className="dnd-card-queue-num">{idx + 1}</div>
                                <div className={`dnd-card-icon ${getProviderIconClass(provider.name)}`}>
                                    {getProviderLabel(provider.name)}
                                </div>
                                <div className="dnd-card-info">
                                    <span className="dnd-card-name">{provider.name}</span>
                                    <span className="dnd-card-key">{provider.apiKey}</span>
                                </div>
                                <div className="dnd-card-status-badge available">DISPONIBLE</div>
                                <GripVertical size={16} className="dnd-card-grip" />
                            </div>
                        ))
                    )}
                </div>

                {/* RIGHT: Active drop zone (highlighted) */}
                <div
                    ref={dropRef}
                    className={`dnd-section dnd-section-active ${dragOverActive ? 'drag-over' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="dnd-section-label">
                        <Target size={12} />
                        <span>IA Activa</span>
                    </div>

                    {activeProvider ? (
                        <div className="dnd-active-card">
                            <div className={`dnd-card-icon ${getProviderIconClass(activeProvider.name)}`}>
                                {getProviderLabel(activeProvider.name)}
                            </div>
                            <div className="dnd-card-info">
                                <span className="dnd-card-name">{activeProvider.name}</span>
                                <span className="dnd-card-key">{activeProvider.apiKey}</span>
                            </div>
                            <div className="dnd-active-badge">
                                <span className="dnd-active-pulse" />
                                LIVE
                            </div>
                        </div>
                    ) : (
                        <div className="dnd-drop-empty">
                            <ArrowRight size={28} />
                            <span>Arrastra una IA aquí para activarla</span>
                        </div>
                    )}

                    {/* Next in queue indicator */}
                    {availableProviders.length > 0 && (
                        <div className="dnd-next-in-queue">
                            <span className="dnd-next-label">SIGUIENTE EN COLA</span>
                            <span className="dnd-next-name">{availableProviders[0].name}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* BOTTOM SECTION: Exhausted providers (red) */}
            {exhaustedProviders.length > 0 && (
                <div className="dnd-section dnd-section-exhausted">
                    <div className="dnd-section-label exhausted-label">
                        <XCircle size={12} />
                        <span>IAs Agotadas ({exhaustedProviders.length})</span>
                    </div>

                    <div className="dnd-exhausted-grid">
                        {exhaustedProviders.map(provider => (
                            <div key={provider.id} className="dnd-card dnd-card-exhausted">
                                <div className={`dnd-card-icon ${getProviderIconClass(provider.name)} exhausted-icon`}>
                                    {getProviderLabel(provider.name)}
                                </div>
                                <div className="dnd-card-info">
                                    <span className="dnd-card-name exhausted-name">{provider.name}</span>
                                    <span className="dnd-card-key">{provider.apiKey}</span>
                                </div>
                                <div className="dnd-card-status-badge exhausted">AGOTADA</div>
                                <button
                                    className="dnd-reactivate-btn"
                                    onClick={() => handleReactivate(provider.id)}
                                    disabled={reactivatingId === provider.id}
                                    title="Reactivar este proveedor"
                                >
                                    <RotateCcw
                                        size={14}
                                        className={reactivatingId === provider.id ? 'spin' : ''}
                                    />
                                    <span>{reactivatingId === provider.id ? '...' : 'Reactivar'}</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIProviderDragDrop;
