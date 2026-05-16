/**
 * StagesService — DynamoDB Version
 *
 * Uses DynamoDB table: chatwifi-stages (partition key: stageId)
 * Also updates related data in chatwifi-knowledge-index, chatwifi-config
 */

const { putItem, getItem, scanItems, deleteItem } = require('../config/dynamodb');

const TABLE = 'stages';
const DEFAULT_STAGE_ID = 'stage_general';

class StagesService {

    // ── Read / Write helpers ───────────────────────────────────

    async getAll() {
        try {
            return await scanItems(TABLE);
        } catch {
            return [];
        }
    }

    // ── CRUD ───────────────────────────────────────────────────

    async create(name) {
        const stages = await this.getAll();

        if (stages.some(s => s.name.toLowerCase() === name.trim().toLowerCase())) {
            throw new Error(`Ya existe una etapa con el nombre "${name}"`);
        }

        const newStage = {
            stageId: 'stage_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: name.trim(),
            active: true,
            isDefault: false,
            createdAt: new Date().toISOString()
        };

        await putItem(TABLE, newStage);
        console.log(`📅 Stage created: "${newStage.name}" (${newStage.stageId})`);
        return { ...newStage, id: newStage.stageId };
    }

    async setActive(id, active) {
        const stages = await this.getAll();
        const stage = stages.find(s => s.stageId === id);
        if (!stage) return null;

        stage.active = active;
        await putItem(TABLE, stage);
        console.log(`📅 Stage "${stage.name}" ${active ? 'activated' : 'deactivated'}`);
        return { ...stage, id: stage.stageId };
    }

    async update(id, updates) {
        const stages = await this.getAll();
        const stage = stages.find(s => s.stageId === id);
        if (!stage) return null;

        if (updates.name !== undefined) {
            const trimmed = updates.name.trim();
            if (!trimmed) throw new Error('El nombre no puede estar vacío');
            if (stages.some(s => s.stageId !== id && s.name.toLowerCase() === trimmed.toLowerCase())) {
                throw new Error(`Ya existe una etapa con el nombre "${trimmed}"`);
            }
            stage.name = trimmed;
        }

        if (typeof updates.active === 'boolean') {
            stage.active = updates.active;
        }

        await putItem(TABLE, stage);
        console.log(`📅 Stage "${stage.name}" updated`);
        return { ...stage, id: stage.stageId };
    }

    async delete(id) {
        const stages = await this.getAll();
        const stage = stages.find(s => s.stageId === id);
        if (!stage) throw new Error('Etapa no encontrada');
        if (stage.isDefault) throw new Error('No se puede eliminar la etapa por defecto');

        await deleteItem(TABLE, { stageId: id });
        console.log(`🗑️ Stage deleted: "${stage.name}"`);
    }

    // ── Bootstrap ──────────────────────────────────────

    async initialize() {
        const stages = await this.getAll();

        if (!stages.find(s => s.stageId === DEFAULT_STAGE_ID)) {
            await putItem(TABLE, {
                stageId: DEFAULT_STAGE_ID,
                name: 'General',
                active: true,
                isDefault: true,
                createdAt: new Date().toISOString()
            });
            console.log('📅 Default stage "General" created');
        }
    }
}

module.exports = new StagesService();
