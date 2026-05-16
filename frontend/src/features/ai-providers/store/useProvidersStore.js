import { create } from 'zustand';
import api from '../../../services/api';

const useProvidersStore = create((set, get) => ({
    providers: [],
    usageLogs: [],
    loading: false,
    error: null,

    // ── Computed getters ──────────────────────────────────────────────
    get availableProviders() {
        return get().providers.filter(p => p.status === 'available');
    },
    get activeProvider() {
        return get().providers.find(p => p.status === 'active') || null;
    },
    get exhaustedProviders() {
        return get().providers.filter(p => p.status === 'exhausted');
    },

    // ── Fetch providers ──────────────────────────────────────────────
    fetchProviders: async () => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/api/ai-providers');
            if (response.data.success) {
                set({ providers: response.data.providers, loading: false });
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al cargar proveedores', loading: false });
        }
    },

    // ── Save provider ────────────────────────────────────────────────
    saveProvider: async (providerData) => {
        set({ loading: true, error: null });
        try {
            const response = await api.post('/api/ai-providers', providerData);
            if (response.data.success) {
                set({ providers: response.data.providers, loading: false });
                return true;
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al guardar proveedor', loading: false });
            return false;
        }
    },

    // ── Delete provider ──────────────────────────────────────────────
    deleteProvider: async (id) => {
        set({ loading: true, error: null });
        try {
            const response = await api.delete(`/api/ai-providers/${id}`);
            if (response.data.success) {
                const refreshed = await api.get('/api/ai-providers');
                if (refreshed.data.success) {
                    set({ providers: refreshed.data.providers, loading: false });
                } else {
                    set({ providers: response.data.providers, loading: false });
                }
            } else {
                set({ loading: false, error: 'No se pudo eliminar' });
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al eliminar proveedor', loading: false });
        }
    },

    // ── Activate provider ────────────────────────────────────────────
    activateProvider: async (id) => {
        set({ loading: true, error: null });
        try {
            const response = await api.put(`/api/ai-providers/${id}/activate`);
            if (response.data.success) {
                set({ providers: response.data.providers, loading: false });
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al activar proveedor', loading: false });
        }
    },

    // ── Exhaust provider ─────────────────────────────────────────────
    exhaustProvider: async (id, reason = 'Manually exhausted by admin') => {
        set({ loading: true, error: null });
        try {
            const response = await api.post(`/api/ai-providers/${id}/exhaust`, { reason });
            if (response.data.success) {
                set({ providers: response.data.providers, loading: false });
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al agotar proveedor', loading: false });
        }
    },

    // ── Reactivate provider ──────────────────────────────────────────
    reactivateProvider: async (id) => {
        set({ loading: true, error: null });
        try {
            const response = await api.post(`/api/ai-providers/${id}/reactivate`);
            if (response.data.success) {
                set({ providers: response.data.providers, loading: false });
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al reactivar proveedor', loading: false });
        }
    },

    // ── Reorder queue ────────────────────────────────────────────────
    reorderQueue: async (orderedIds) => {
        try {
            const response = await api.put('/api/ai-providers/reorder', { orderedIds });
            if (response.data.success) {
                set({ providers: response.data.providers });
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al reordenar la cola' });
        }
    },

    // ── Fetch usage logs ─────────────────────────────────────────────
    fetchUsageLogs: async (providerId) => {
        try {
            const url = providerId
                ? `/api/ai-providers/usage-logs?providerId=${providerId}`
                : '/api/ai-providers/usage-logs';
            const response = await api.get(url);
            if (response.data.success) {
                set({ usageLogs: response.data.logs });
            }
        } catch (error) {
            console.error('Error fetching usage logs:', error);
        }
    },

    // ── Test provider connection ─────────────────────────────────────
    testProvider: async (id) => {
        try {
            const response = await api.post(`/api/ai-providers/${id}/test`);
            return {
                success: response.data.success,
                message: response.data.message
            };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Error de conexión'
            };
        }
    }
}));

export default useProvidersStore;
