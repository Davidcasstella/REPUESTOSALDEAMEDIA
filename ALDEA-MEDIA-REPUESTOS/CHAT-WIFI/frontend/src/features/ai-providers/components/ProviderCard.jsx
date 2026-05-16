import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Trash2, Power, Zap, RefreshCw, XCircle } from 'lucide-react';
import useProvidersStore from '../store/useProvidersStore';
import api from '../../../services/api';

const STATUS_CONFIG = {
    active: { label: 'Activo', className: 'active' },
    available: { label: 'Disponible', className: 'available' },
    exhausted: { label: 'Agotada', className: 'exhausted' }
};

const ProviderCard = ({ provider }) => {
    const { activateProvider, exhaustProvider, testProvider } = useProvidersStore();
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const statusConfig = STATUS_CONFIG[provider.status] || STATUS_CONFIG.available;
    const isActive = provider.status === 'active';
    const isExhausted = provider.status === 'exhausted';

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        const result = await testProvider(provider.id);
        setTestResult(result);
        setTesting(false);
        if (result.success) {
            setTimeout(() => setTestResult(null), 5000);
        }
    };

    const handleDelete = async () => {
        if (deleting) return;
        setDeleting(true);
        try {
            await api.delete(`/api/ai-providers/${provider.id}`);
            window.location.reload();
        } catch (error) {
            console.error('Delete failed:', error);
            setDeleting(false);
        }
    };

    return (
        <div className={`provider-card premium-card ${statusConfig.className}`}>
            <div className="provider-card-header">
                <div className="provider-info">
                    <div className="provider-icon-wrapper">
                        {provider.name.toLowerCase().includes('openai') ? (
                            <Zap size={24} className="text-primary" />
                        ) : (
                            <Zap size={24} className="text-secondary" />
                        )}
                    </div>
                    <div>
                        <h3 className="provider-name">{provider.name}</h3>
                        <p className="provider-key">{provider.apiKey}</p>
                    </div>
                </div>
                <div className={`status-badge ${statusConfig.className}`}>
                    {statusConfig.label}
                </div>
            </div>

            <div className="provider-card-footer">
                <div className="provider-actions">
                    <button
                        className="btn-icon-text ghost-blue"
                        onClick={handleTest}
                        disabled={testing || isExhausted}
                        title="Probar conexión"
                    >
                        {testing ? <RefreshCw className="spin" size={18} /> : <Zap size={18} />}
                        <span>Probar</span>
                    </button>

                    {!isActive && !isExhausted && (
                        <button
                            className="btn-icon-text ghost-green"
                            onClick={() => activateProvider(provider.id)}
                            title="Activar"
                        >
                            <Power size={18} />
                            <span>Activar</span>
                        </button>
                    )}

                    {isActive && (
                        <button
                            className="btn-icon-text ghost-red"
                            onClick={() => exhaustProvider(provider.id, 'Manually exhausted by admin')}
                            title="Marcar como agotada"
                        >
                            <XCircle size={18} />
                            <span>Agotar</span>
                        </button>
                    )}

                    <button
                        className="btn-icon-text ghost-red"
                        onClick={handleDelete}
                        disabled={deleting}
                        title="Eliminar"
                    >
                        {deleting ? <RefreshCw className="spin" size={18} /> : <Trash2 size={18} />}
                        <span>{deleting ? 'Eliminando...' : 'Eliminar'}</span>
                    </button>
                </div>
            </div>

            {testResult && (
                <div className={`test-feedback ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.success ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                    <span>{testResult.message}</span>
                </div>
            )}
        </div>
    );
};

export default ProviderCard;
