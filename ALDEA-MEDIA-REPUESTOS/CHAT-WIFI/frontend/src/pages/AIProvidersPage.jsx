import React, { useEffect, useState } from 'react';
import { Plus, Info, RefreshCw, Cpu, BrainCircuit, Globe } from 'lucide-react';
import useProvidersStore from '../features/ai-providers/store/useProvidersStore';
import ProviderCard from '../features/ai-providers/components/ProviderCard';
import KeyRotationStatus from '../features/ai-providers/components/KeyRotationStatus';
import AIProviderDragDrop from '../features/ai-providers/components/AIProviderDragDrop';
import UsageLogs from '../features/ai-providers/components/UsageLogs';

const AIProvidersPage = () => {
    const { providers, loading, error, fetchProviders, saveProvider } = useProvidersStore();
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: 'OpenAI', apiKey: '' });

    useEffect(() => {
        fetchProviders();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const success = await saveProvider(formData);
        if (success) {
            setFormData({ name: 'OpenAI', apiKey: '' });
            setShowForm(false);
        }
    };

    return (
        <div className="ai-providers-container">
            <header className="page-header">
                <div>
                    <h1>Proveedores de IA</h1>
                    <p className="text-muted">Gestiona tus API keys y selecciona el motor inteligente activo.</p>
                </div>
                <button
                    className={`btn-premium ${showForm ? 'secondary' : 'primary'}`}
                    onClick={() => setShowForm(!showForm)}
                >
                    {showForm ? 'Cancelar' : <><Plus size={20} /> Agregar Proveedor</>}
                </button>
            </header>

            {error && <div className="error-banner">{error}</div>}

            <KeyRotationStatus />

            <AIProviderDragDrop />

            <UsageLogs />

            {showForm && (
                <div className="provider-form-container premium-card animate-fade-in">
                    <form onSubmit={handleSubmit} className="provider-form">
                        <div className="form-group">
                            <label>Proveedor</label>
                            <select
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="form-input"
                            >
                                <option value="OpenAI">OpenAI (ChatGPT)</option>
                                <option value="Grok">Grok (xAI)</option>
                                <option value="Gemini">Gemini (Google)</option>
                                <option value="Z.ia">Z.ia (Propio)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>API Key</label>
                            <input
                                type="password"
                                placeholder="sk-..."
                                value={formData.apiKey}
                                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                className="form-input"
                                required
                            />
                        </div>
                        <button type="submit" className="btn-submit" disabled={loading}>
                            {loading ? <RefreshCw className="spin" size={20} /> : 'Guardar Configuración'}
                        </button>
                    </form>
                    <div className="security-tip">
                        <Info size={16} />
                        <p>Tu API Key se guardará cifrada con AES-256-GCM y nunca será visible en el navegador.</p>
                    </div>
                </div>
            )}

            <div className="providers-grid">
                {loading && providers.length === 0 ? (
                    <div className="loading-state">
                        <RefreshCw className="spin" size={48} />
                        <p>Cargando proveedores...</p>
                    </div>
                ) : providers.length === 0 ? (
                    <div className="empty-state-card premium-card">
                        <BrainCircuit size={64} className="text-muted" />
                        <h2>No hay proveedores configurados</h2>
                        <p>Agrega tu primer proveedor de IA (OpenAI, Grok o Gemini) para comenzar a usar la inteligencia del chat.</p>
                    </div>
                ) : (
                    providers.map(provider => (
                        <ProviderCard key={provider.id} provider={provider} />
                    ))
                )}
            </div>

            <section className="architecture-info">
                <div className="info-card premium-card">
                    <Cpu size={24} />
                    <h3>Arquitectura Dinámica</h3>
                    <p>Puedes cambiar el proveedor activo en tiempo real sin necesidad de reiniciar el servidor. El sistema se adapta automáticamente.</p>
                </div>
                <div className="info-card premium-card">
                    <Globe size={24} />
                    <h3>Preparado para SaaS</h3>
                    <p>Estructura modular optimizada para configuraciones por cliente y escalabilidad multi-región.</p>
                </div>
            </section>
        </div>
    );
};

export default AIProvidersPage;
