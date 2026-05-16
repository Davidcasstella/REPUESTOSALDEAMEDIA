import React, { useState, useEffect } from 'react';
import { X, Phone, User, FileText, ToggleLeft, ToggleRight } from 'lucide-react';

const BlockedNumberModal = ({ entry, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        phoneNumber: '',
        name: '',
        reason: '',
        isActive: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Pre-fill form if editing
    useEffect(() => {
        if (entry) {
            setFormData({
                phoneNumber: entry.phoneNumber || '',
                name: entry.name || '',
                reason: entry.reason || '',
                isActive: entry.isActive !== undefined ? entry.isActive : true
            });
        }
    }, [entry]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (error) setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.phoneNumber.trim()) {
            setError('El número de teléfono es obligatorio');
            return;
        }
        setLoading(true);
        try {
            await onSave(formData, entry?.id);
        } catch (err) {
            setError(err.message || 'Error al guardar');
        } finally {
            setLoading(false);
        }
    };

    // Close on backdrop click
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div className="bn-modal-overlay" onClick={handleBackdropClick}>
            <div className="bn-modal-card premium-card">
                {/* Header */}
                <div className="bn-modal-header">
                    <h3>{entry ? 'Editar Número Bloqueado' : 'Agregar Número Bloqueado'}</h3>
                    <button className="bn-modal-close" onClick={onClose} aria-label="Cerrar">
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="bn-modal-form">
                    <div className="bn-field">
                        <label className="bn-label">
                            <Phone size={14} />
                            Número de Teléfono <span className="bn-required">*</span>
                        </label>
                        <input
                            type="text"
                            name="phoneNumber"
                            className={`bn-input ${error ? 'bn-input-error' : ''}`}
                            placeholder="Ej: 5491155667788"
                            value={formData.phoneNumber}
                            onChange={handleChange}
                            disabled={loading}
                            autoFocus
                        />
                        {error && <span className="bn-error-msg">{error}</span>}
                        <span className="bn-hint">Sin espacios, con código de país. Ej: 573001234567</span>
                    </div>

                    <div className="bn-field">
                        <label className="bn-label">
                            <User size={14} />
                            Nombre (opcional)
                        </label>
                        <input
                            type="text"
                            name="name"
                            className="bn-input"
                            placeholder="Nombre o alias del contacto"
                            value={formData.name}
                            onChange={handleChange}
                            disabled={loading}
                        />
                    </div>

                    <div className="bn-field">
                        <label className="bn-label">
                            <FileText size={14} />
                            Motivo (opcional)
                        </label>
                        <input
                            type="text"
                            name="reason"
                            className="bn-input"
                            placeholder="Ej: Spam, pruebas, cliente VIP..."
                            value={formData.reason}
                            onChange={handleChange}
                            disabled={loading}
                        />
                    </div>

                    <div className="bn-field bn-toggle-field">
                        <label className="bn-label">Estado inicial</label>
                        <button
                            type="button"
                            className={`bn-status-toggle ${formData.isActive ? 'active' : 'inactive'}`}
                            onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
                            disabled={loading}
                        >
                            {formData.isActive
                                ? <><ToggleRight size={22} /> Activo (bloqueará mensajes)</>
                                : <><ToggleLeft size={22} /> Inactivo (no bloqueará)</>}
                        </button>
                    </div>

                    <div className="bn-modal-actions">
                        <button type="button" className="bn-btn-cancel" onClick={onClose} disabled={loading}>
                            Cancelar
                        </button>
                        <button type="submit" className="bn-btn-save" disabled={loading}>
                            {loading ? 'Guardando...' : (entry ? 'Guardar Cambios' : 'Agregar Número')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BlockedNumberModal;
