/**
 * AIAutomationsService — DynamoDB Version
 *
 * Uses DynamoDB table: chatwifi-config
 * Config key: 'ai-automations'
 */

const { putItem, getItem } = require('../config/dynamodb');

const TABLE = 'config';
const CONFIG_KEY = 'ai-automations';

const DEFAULT_CONFIG = {
    paymentDetectionEnabled: false,
    voiceProcessingEnabled: true,
    updatedAt: null
};

class AIAutomationsService {
    constructor() {
        this._init();
    }

    async _init() {
        try {
            const existing = await getItem(TABLE, { configKey: CONFIG_KEY });
            if (!existing) {
                await putItem(TABLE, { configKey: CONFIG_KEY, data: DEFAULT_CONFIG });
            }
        } catch (err) {
            console.warn('⚠️ AIAutomations DynamoDB init:', err.message);
        }
    }

    async getConfig() {
        const item = await getItem(TABLE, { configKey: CONFIG_KEY });
        return item?.data || DEFAULT_CONFIG;
    }

    async saveConfig(updates) {
        const current = await this.getConfig();
        const next = { ...current, ...updates, updatedAt: new Date().toISOString() };
        await putItem(TABLE, { configKey: CONFIG_KEY, data: next });
        return next;
    }
}

module.exports = new AIAutomationsService();
