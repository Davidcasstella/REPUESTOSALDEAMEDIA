import { create } from 'zustand';
import api from '../../../services/api';

const useKnowledgeStore = create((set) => ({
    documents: [],
    loading: false,
    uploading: false,
    error: null,

    fetchDocuments: async (stageId) => {
        set({ loading: true, error: null });
        try {
            const params = stageId ? `?stageId=${stageId}` : '';
            const response = await api.get(`/api/knowledge-base/documents${params}`);
            if (response.data.success) {
                set({ documents: response.data.documents, loading: false });
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al cargar documentos', loading: false });
        }
    },

    uploadDocument: async (file, stageId) => {
        set({ uploading: true, error: null });
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (stageId) formData.append('stageId', stageId);
            const response = await api.post('/api/knowledge-base/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success) {
                // Refresh documents list for the same stage
                const params = stageId ? `?stageId=${stageId}` : '';
                const listResponse = await api.get(`/api/knowledge-base/documents${params}`);
                if (listResponse.data.success) {
                    set({ documents: listResponse.data.documents, uploading: false });
                }
                return true;
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al subir documento', uploading: false });
            return false;
        }
    },

    reprocessDocument: async (id, stageId) => {
        set({ loading: true, error: null });
        try {
            await api.post(`/api/knowledge-base/documents/${id}/reprocess`);
            // Refresh documents list
            const params = stageId ? `?stageId=${stageId}` : '';
            const response = await api.get(`/api/knowledge-base/documents${params}`);
            if (response.data.success) {
                set({ documents: response.data.documents, loading: false });
            }
            return true;
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al reprocesar', loading: false });
            return false;
        }
    },

    deleteDocument: async (id, stageId) => {
        set({ loading: true, error: null });
        try {
            await api.delete(`/api/knowledge-base/documents/${id}`);
            const params = stageId ? `?stageId=${stageId}` : '';
            const response = await api.get(`/api/knowledge-base/documents${params}`);
            if (response.data.success) {
                set({ documents: response.data.documents, loading: false });
            }
            return true;
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error al eliminar', loading: false });
            return false;
        }
    },

    clearError: () => set({ error: null })
}));

export default useKnowledgeStore;
