/**
 * BlockedNumbersService — DynamoDB Version
 *
 * Uses DynamoDB table: chatwifi-config
 * Config keys: 'blocked-numbers' (array), 'bot-config' (object)
 */

const crypto = require('crypto');
const { putItem, getItem } = require('../config/dynamodb');

const TABLE = 'config';
const BLOCKED_KEY = 'blocked-numbers';
const BOT_CONFIG_KEY = 'bot-config';

class BlockedNumbersService {
    constructor() {
        this._init();
    }

    async _init() {
        try {
            // Ensure defaults exist
            const blocked = await getItem(TABLE, { configKey: BLOCKED_KEY });
            if (!blocked) {
                await putItem(TABLE, { configKey: BLOCKED_KEY, data: [] });
            }
            const config = await getItem(TABLE, { configKey: BOT_CONFIG_KEY });
            if (!config) {
                await putItem(TABLE, { configKey: BOT_CONFIG_KEY, data: { blockGroups: false } });
            }
        } catch (err) {
            console.warn('⚠️ BlockedNumbers DynamoDB init:', err.message);
        }
    }

    // ==================== HELPERS ====================

    async read() {
        const item = await getItem(TABLE, { configKey: BLOCKED_KEY });
        return item?.data || [];
    }

    async write(data) {
        await putItem(TABLE, { configKey: BLOCKED_KEY, data });
    }

    // ==================== CRUD ====================

    async getAll() {
        return this.read();
    }

    async add(entry) {
        const list = await this.read();
        const newEntry = {
            id: `blk_${crypto.randomUUID().replace(/-/g, '').substring(0, 10)}`,
            phoneNumber: entry.phoneNumber.trim(),
            name: entry.name || '',
            reason: entry.reason || '',
            isActive: entry.isActive !== undefined ? entry.isActive : true,
            createdAt: new Date().toISOString()
        };
        list.push(newEntry);
        await this.write(list);
        console.log(`🚫 Número bloqueado agregado: ${newEntry.phoneNumber}`);
        return newEntry;
    }

    async update(id, updates) {
        const list = await this.read();
        const idx = list.findIndex(e => e.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...updates };
        await this.write(list);
        return list[idx];
    }

    async remove(id) {
        const list = await this.read();
        const filtered = list.filter(e => e.id !== id);
        if (filtered.length === list.length) return false;
        await this.write(filtered);
        console.log(`🗑️ Número bloqueado eliminado: ${id}`);
        return true;
    }

    // ==================== BOT CHECK ====================

    async isBlocked(jid) {
        const list = await this.read();
        const number = jid.split('@')[0];
        return list.some(e => e.isActive && (
            e.phoneNumber === jid ||
            e.phoneNumber === number ||
            jid.startsWith(e.phoneNumber)
        ));
    }

    // ==================== CONFIG ====================

    async getConfig() {
        const item = await getItem(TABLE, { configKey: BOT_CONFIG_KEY });
        return item?.data || { blockGroups: false };
    }

    async updateConfig(updates) {
        const config = await this.getConfig();
        const newConfig = { ...config, ...updates };
        await putItem(TABLE, { configKey: BOT_CONFIG_KEY, data: newConfig });
        return newConfig;
    }
}

module.exports = new BlockedNumbersService();
