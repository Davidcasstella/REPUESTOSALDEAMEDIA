import { create } from 'zustand';
import api from '../../../services/api';

const useStagesStore = create((set, get) => ({
    stages: [],
    activeStageId: 'stage_general',
    loading: false,
    error: null,

    fetchStages: async () => {
        set({ loading: true, error: null });
        try {
            const { data } = await api.get('/api/knowledge-base/stages');
            if (data.success) {
                const stages = data.stages || [];
                set({ stages, loading: false });

                // If current activeStageId doesn't exist in stages, reset to default
                const currentId = get().activeStageId;
                if (stages.length > 0 && !stages.find(s => s.id === currentId)) {
                    const defaultStage = stages.find(s => s.isDefault) || stages[0];
                    set({ activeStageId: defaultStage.id });
                }
            }
        } catch (error) {
            set({ error: error.response?.data?.message || 'Error loading stages', loading: false });
        }
    },

    setActiveStageId: (id) => {
        set({ activeStageId: id });
    },

    createStage: async (name) => {
        try {
            const { data } = await api.post('/api/knowledge-base/stages', { name });
            if (data.success) {
                await get().fetchStages();
                return data.stage;
            }
        } catch (error) {
            throw new Error(error.response?.data?.message || 'Error creating stage');
        }
    },

    toggleStage: async (id, active) => {
        try {
            const { data } = await api.patch(`/api/knowledge-base/stages/${id}`, { active });
            if (data.success) await get().fetchStages();
        } catch (error) {
            throw new Error(error.response?.data?.message || 'Error toggling stage');
        }
    },

    renameStage: async (id, name) => {
        try {
            const { data } = await api.patch(`/api/knowledge-base/stages/${id}`, { name });
            if (data.success) await get().fetchStages();
        } catch (error) {
            throw new Error(error.response?.data?.message || 'Error renaming stage');
        }
    },

    deleteStage: async (id) => {
        try {
            await api.delete(`/api/knowledge-base/stages/${id}`);
            // If we deleted the active stage, switch to default
            if (get().activeStageId === id) {
                set({ activeStageId: 'stage_general' });
            }
            await get().fetchStages();
        } catch (error) {
            throw new Error(error.response?.data?.message || 'Error deleting stage');
        }
    },

    clearError: () => set({ error: null })
}));

export default useStagesStore;
