/**
 * GuideRulesService — DynamoDB Version
 *
 * Uses DynamoDB table: guide-rules (partition key: id)
 */

const crypto = require('crypto');
const { putItem, getItem, scanItems, deleteItem } = require('../config/dynamodb');

const TABLE = 'guide-rules';

class GuideRulesService {
    /**
     * Get all guide rules
     * Sorted by priority ascending
     * @returns {Promise<Array>}
     */
    async getAll() {
        try {
            const list = await scanItems(TABLE);
            // Sort by priority. If priority is missing, default to 0.
            return list.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        } catch (err) {
            console.error('❌ Error reading guide rules from DynamoDB:', err.message);
            return [];
        }
    }

    /**
     * Get guide rule by ID
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        try {
            return await getItem(TABLE, { id });
        } catch (err) {
            console.error(`❌ Error reading guide rule ${id} from DynamoDB:`, err.message);
            return null;
        }
    }

    /**
     * Create a new guide rule
     * @param {Object} data - { name, content, category, isActive, priority }
     * @returns {Promise<Object>}
     */
    async create(data) {
        const { name, content, category, isActive, priority } = data;

        // If priority is not provided, find the max priority and add 1
        let rulePriority = priority;
        if (rulePriority === undefined || rulePriority === null) {
            const allRules = await this.getAll();
            const maxPriority = allRules.reduce((max, r) => Math.max(max, r.priority || 0), 0);
            rulePriority = maxPriority + 1;
        }

        const newItem = {
            id: crypto.randomUUID(),
            name: (name || '').trim(),
            content: (content || '').trim(),
            category: (category || 'general').trim().toLowerCase(),
            isActive: isActive !== undefined ? !!isActive : true,
            priority: Number(rulePriority),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await putItem(TABLE, newItem);
        console.log(`✅ Guide rule created: ${newItem.name} (Priority: ${newItem.priority})`);
        return newItem;
    }

    /**
     * Update an existing guide rule
     * @param {string} id
     * @param {Object} updates - { name, content, category, isActive, priority }
     * @returns {Promise<Object|null>}
     */
    async update(id, updates) {
        const existing = await this.getById(id);
        if (!existing) return null;

        const { name, content, category, isActive, priority } = updates;

        const updatedItem = {
            ...existing,
            ...(name !== undefined && { name: name.trim() }),
            ...(content !== undefined && { content: content.trim() }),
            ...(category !== undefined && { category: category.trim().toLowerCase() }),
            ...(isActive !== undefined && { isActive: !!isActive }),
            ...(priority !== undefined && { priority: Number(priority) }),
            updated_at: new Date().toISOString()
        };

        await putItem(TABLE, updatedItem);
        console.log(`✏️ Guide rule updated: ${updatedItem.name}`);
        return updatedItem;
    }

    /**
     * Reorder rules by priority
     * @param {Array<string>} orderedIds - Array of rule IDs in the desired order
     * @returns {Promise<boolean>}
     */
    async reorder(orderedIds) {
        try {
            const allRules = await this.getAll();
            const rulesMap = new Map(allRules.map(r => [r.id, r]));

            for (let i = 0; i < orderedIds.length; i++) {
                const id = orderedIds[i];
                const rule = rulesMap.get(id);
                if (rule) {
                    rule.priority = i + 1;
                    rule.updated_at = new Date().toISOString();
                    await putItem(TABLE, rule);
                }
            }
            console.log('↕️ Guide rules reordered successfully');
            return true;
        } catch (err) {
            console.error('❌ Error reordering guide rules:', err.message);
            return false;
        }
    }

    /**
     * Delete a guide rule
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async delete(id) {
        const existing = await this.getById(id);
        if (!existing) return false;

        await deleteItem(TABLE, { id });
        console.log(`🗑️ Guide rule deleted: ${id}`);
        return true;
    }
}

module.exports = new GuideRulesService();
