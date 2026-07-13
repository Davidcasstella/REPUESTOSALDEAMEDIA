/**
 * QuickRepliesService — DynamoDB Version
 *
 * Uses DynamoDB table: quick-replies (partition key: id)
 */

const crypto = require('crypto');
const { putItem, getItem, scanItems, deleteItem } = require('../config/dynamodb');

const TABLE = 'quick-replies';

class QuickRepliesService {
    /**
     * Get all quick replies
     * @returns {Promise<Array>}
     */
    async getAll() {
        try {
            return await scanItems(TABLE);
        } catch (err) {
            console.error('❌ Error reading quick replies from DynamoDB:', err.message);
            return [];
        }
    }

    /**
     * Get quick reply by ID
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        try {
            return await getItem(TABLE, { id });
        } catch (err) {
            console.error(`❌ Error reading quick reply ${id} from DynamoDB:`, err.message);
            return null;
        }
    }

    /**
     * Create a new quick reply
     * @param {Object} data - { name, shortcut, content }
     * @returns {Promise<Object>}
     */
    async create(data) {
        const { name, shortcut, content } = data;
        
        // Clean shortcut to remove leading '/' if present
        const cleanShortcut = shortcut.trim().replace(/^\//, '');

        const newItem = {
            id: crypto.randomUUID(),
            name: name.trim(),
            shortcut: cleanShortcut,
            content: content.trim(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await putItem(TABLE, newItem);
        console.log(`✅ Quick reply created: ${newItem.name} (/${newItem.shortcut})`);
        return newItem;
    }

    /**
     * Update an existing quick reply
     * @param {string} id
     * @param {Object} updates - { name, shortcut, content }
     * @returns {Promise<Object|null>}
     */
    async update(id, updates) {
        const existing = await this.getById(id);
        if (!existing) return null;

        const { name, shortcut, content } = updates;
        const cleanShortcut = shortcut ? shortcut.trim().replace(/^\//, '') : existing.shortcut;

        const updatedItem = {
            ...existing,
            ...(name !== undefined && { name: name.trim() }),
            ...(shortcut !== undefined && { shortcut: cleanShortcut }),
            ...(content !== undefined && { content: content.trim() }),
            updated_at: new Date().toISOString()
        };

        await putItem(TABLE, updatedItem);
        console.log(`✏️ Quick reply updated: ${updatedItem.name} (/${updatedItem.shortcut})`);
        return updatedItem;
    }

    /**
     * Delete a quick reply
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async delete(id) {
        const existing = await this.getById(id);
        if (!existing) return false;

        await deleteItem(TABLE, { id });
        console.log(`🗑️ Quick reply deleted: ${id}`);
        return true;
    }
}

module.exports = new QuickRepliesService();
