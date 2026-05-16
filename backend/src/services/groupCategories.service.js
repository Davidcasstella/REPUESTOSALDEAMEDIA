/**
 * GroupCategoriesService — DynamoDB Version
 *
 * Uses DynamoDB table: chatwifi-config
 * Config key: 'group-categories'
 */

const { putItem, getItem } = require('../config/dynamodb');

const TABLE = 'config';
const CONFIG_KEY = 'group-categories';

class GroupCategoriesService {
    constructor() {
        this._cache = null;
        this._init();
    }

    async _init() {
        try {
            const existing = await getItem(TABLE, { configKey: CONFIG_KEY });
            if (!existing) {
                await putItem(TABLE, { configKey: CONFIG_KEY, data: { categories: {} } });
            }
        } catch (err) {
            console.warn('⚠️ GroupCategories DynamoDB init:', err.message);
        }
    }

    // ── Private helpers ──

    async _read() {
        if (!this._cache) {
            const item = await getItem(TABLE, { configKey: CONFIG_KEY });
            this._cache = item?.data || { categories: {} };
        }
        if (!this._cache.categories) this._cache.categories = {};
        return this._cache;
    }

    async _write(data) {
        this._cache = data;
        await putItem(TABLE, { configKey: CONFIG_KEY, data });
    }

    // ── Category Management ──

    async getAllCategories() {
        const data = await this._read();
        return data.categories;
    }

    async getCategory(categoryName) {
        const data = await this._read();
        return data.categories[categoryName] || null;
    }

    async createCategory(categoryName, label, color = '#00a884') {
        const data = await this._read();
        if (data.categories[categoryName]) {
            throw new Error(`Category "${categoryName}" already exists`);
        }
        data.categories[categoryName] = { label, color, groups: [] };
        await this._write(data);
        return data.categories[categoryName];
    }

    async updateCategory(categoryName, updates) {
        const data = await this._read();
        const cat = data.categories[categoryName];
        if (!cat) throw new Error(`Category "${categoryName}" not found`);

        if (updates.label !== undefined) cat.label = updates.label;
        if (updates.color !== undefined) cat.color = updates.color;

        await this._write(data);
        return cat;
    }

    async deleteCategory(categoryName) {
        const data = await this._read();
        if (!data.categories[categoryName]) return false;
        delete data.categories[categoryName];
        await this._write(data);
        return true;
    }

    // ── Group ↔ Category Operations ──

    async getGroupsInCategory(categoryName) {
        const cat = await this.getCategory(categoryName);
        return cat ? cat.groups : [];
    }

    async addGroupToCategory(categoryName, jid) {
        const data = await this._read();
        const cat = data.categories[categoryName];
        if (!cat) throw new Error(`Category "${categoryName}" not found`);
        if (cat.groups.includes(jid)) return false;
        cat.groups.push(jid);
        await this._write(data);
        return true;
    }

    async removeGroupFromCategory(categoryName, jid) {
        const data = await this._read();
        const cat = data.categories[categoryName];
        if (!cat) return false;
        const idx = cat.groups.indexOf(jid);
        if (idx === -1) return false;
        cat.groups.splice(idx, 1);
        await this._write(data);
        return true;
    }

    async isInCategory(categoryName, jid) {
        const cat = await this.getCategory(categoryName);
        return cat ? cat.groups.includes(jid) : false;
    }

    async getCategoriesForGroup(jid) {
        const data = await this._read();
        const result = [];
        for (const [name, cat] of Object.entries(data.categories)) {
            if (cat.groups.includes(jid)) {
                result.push(name);
            }
        }
        return result;
    }

    async buildGroupCategoryMap() {
        const data = await this._read();
        const map = {};
        for (const [name, cat] of Object.entries(data.categories)) {
            for (const jid of cat.groups) {
                if (!map[jid]) map[jid] = [];
                map[jid].push(name);
            }
        }
        return map;
    }
}

module.exports = new GroupCategoriesService();
