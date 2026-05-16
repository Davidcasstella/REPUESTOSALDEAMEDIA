const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const DATA_PATH = path.join(__dirname, '../data/ai-providers.json');
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

/**
 * AI Providers Service — Pool / Queue System
 *
 * Each provider has:
 *   - id: uuid
 *   - name: string
 *   - apiKey: encrypted string
 *   - status: 'available' | 'active' | 'exhausted'
 *   - queuePosition: number (order in the rotation queue)
 *   - usageLogs: Array<{ timestamp, event, reason }>
 *   - lastUsed: ISO string | null
 *   - errorCount: number
 */
class AIProvidersService {
    constructor() {
        if (!ENCRYPTION_KEY_RAW || ENCRYPTION_KEY_RAW.length !== 64) {
            console.error('❌ ENCRYPTION_KEY no está configurada o es inválida en el .env');
        }
        this.encryptionKey = Buffer.from(ENCRYPTION_KEY_RAW || '0'.repeat(64), 'hex');
        // Socket.io reference for real-time events
        this._io = null;
        this.ensureDataFile();
        this._migrateDataModel();
    }

    /** Set the Socket.io instance for emitting real-time events. */
    setIo(io) {
        this._io = io;
    }

    /** Emit a provider status change event to the frontend */
    _emitStatusChange(eventType, data) {
        if (this._io) {
            this._io.emit('provider-status-changed', {
                event: eventType,
                ...data,
                timestamp: Date.now()
            });
        }
    }

    ensureDataFile() {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirpSync(dir);
        }
        if (!fs.existsSync(DATA_PATH)) {
            fs.writeJsonSync(DATA_PATH, []);
        }
    }

    /**
     * Migrate legacy data model (isActive boolean) to new status-based model.
     * Runs once on boot. Idempotent — safe to run multiple times.
     */
    _migrateDataModel() {
        try {
            const providers = fs.readJsonSync(DATA_PATH);
            let migrated = false;

            providers.forEach((p, idx) => {
                // Migrate isActive → status
                if (p.isActive !== undefined && !p.status) {
                    p.status = p.isActive ? 'active' : 'available';
                    delete p.isActive;
                    migrated = true;
                }
                // Ensure new fields exist
                if (p.queuePosition === undefined) {
                    p.queuePosition = idx;
                    migrated = true;
                }
                if (!p.usageLogs) {
                    p.usageLogs = [];
                    migrated = true;
                }
                if (p.lastUsed === undefined) {
                    p.lastUsed = null;
                    migrated = true;
                }
                if (p.errorCount === undefined) {
                    p.errorCount = 0;
                    migrated = true;
                }
            });

            if (migrated) {
                fs.writeJsonSync(DATA_PATH, providers, { spaces: 2 });
                console.log('🔄 [Providers] Data model migrated to pool/queue system');
            }
        } catch (err) {
            console.error('❌ [Providers] Migration error:', err.message);
        }
    }

    // ── Encryption ────────────────────────────────────────────────────────

    encrypt(text) {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }

    decrypt(encryptedData) {
        const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    maskKey(key) {
        if (!key) return '';
        if (key.length <= 8) return '********';
        return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
    }

    // ── Read helpers ──────────────────────────────────────────────────────

    /**
     * Returns providers sorted by queuePosition with keys masked or real.
     * Backward-compatible: also exposes isActive for frontend compatibility.
     */
    async getProviders(includeRealKeys = false) {
        const providers = await fs.readJson(DATA_PATH);
        return providers
            .sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0))
            .map(p => ({
                ...p,
                apiKey: includeRealKeys ? this.decrypt(p.apiKey) : this.maskKey(this.decrypt(p.apiKey)),
                // Backward compat: isActive derived from status
                isActive: p.status === 'active'
            }));
    }

    /**
     * Get the currently active provider with decrypted key.
     */
    async getActiveProvider() {
        const providers = await fs.readJson(DATA_PATH);
        const active = providers.find(p => p.status === 'active');
        if (!active) return null;

        return {
            ...active,
            apiKey: this.decrypt(active.apiKey),
            isActive: true
        };
    }

    /**
     * Get the next available provider in queue order.
     * @returns {object|null} — The next available provider or null
     */
    async getNextAvailable() {
        const providers = await fs.readJson(DATA_PATH);
        const sorted = providers
            .filter(p => p.status === 'available')
            .sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0));
        return sorted.length > 0 ? sorted[0] : null;
    }

    // ── Write operations ─────────────────────────────────────────────────

    async saveProvider({ id, name, apiKey, isActive }) {
        const providers = await fs.readJson(DATA_PATH);
        const encryptedKey = this.encrypt(apiKey);

        if (id) {
            // Update existing
            const index = providers.findIndex(p => p.id === id);
            if (index !== -1) {
                providers[index] = {
                    ...providers[index],
                    name,
                    apiKey: encryptedKey
                };
                this._addLog(providers[index], 'updated', 'API key updated');
            }
        } else {
            // Create new
            const isFirst = providers.length === 0;
            const maxQueue = providers.reduce((max, p) => Math.max(max, p.queuePosition || 0), -1);
            const newProvider = {
                id: crypto.randomUUID(),
                name,
                apiKey: encryptedKey,
                status: isFirst ? 'active' : 'available',
                queuePosition: maxQueue + 1,
                usageLogs: [{ timestamp: new Date().toISOString(), event: 'created', reason: 'New provider added' }],
                lastUsed: null,
                errorCount: 0
            };
            providers.push(newProvider);

            if (isFirst) {
                console.log(`✅ [Providers] First provider "${name}" auto-activated`);
            }
        }

        await fs.writeJson(DATA_PATH, providers, { spaces: 2 });
        this._emitStatusChange('provider-saved', { name });
        return this.getProviders();
    }

    async deleteProvider(id) {
        let providers = await fs.readJson(DATA_PATH);
        const providerToDelete = providers.find(p => p.id === id);
        const wasActive = providerToDelete?.status === 'active';
        providers = providers.filter(p => p.id !== id);

        // If the active one was deleted, activate the next available
        if (wasActive && providers.length > 0) {
            const nextAvailable = providers
                .filter(p => p.status === 'available')
                .sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0))[0];
            if (nextAvailable) {
                nextAvailable.status = 'active';
                nextAvailable.lastUsed = new Date().toISOString();
                this._addLog(nextAvailable, 'activated', 'Auto-activated after previous provider deleted');
                console.log(`🔄 [Providers] Auto-activated "${nextAvailable.name}" after deleting active provider`);
            }
        }

        // Recalculate queue positions
        providers
            .filter(p => p.status !== 'exhausted')
            .sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0))
            .forEach((p, idx) => { p.queuePosition = idx; });

        await fs.writeJson(DATA_PATH, providers, { spaces: 2 });
        this._emitStatusChange('provider-deleted', { id, name: providerToDelete?.name });
        return this.getProviders();
    }

    /**
     * Set a provider as active. Only one can be active at a time.
     * The previously active one returns to 'available'.
     */
    async setActive(id) {
        const providers = await fs.readJson(DATA_PATH);

        providers.forEach(p => {
            if (p.id === id) {
                p.status = 'active';
                p.lastUsed = new Date().toISOString();
                p.errorCount = 0;
                this._addLog(p, 'activated', 'Manually activated by user');
            } else if (p.status === 'active') {
                p.status = 'available';
                this._addLog(p, 'deactivated', 'Replaced by another provider');
            }
        });

        await fs.writeJson(DATA_PATH, providers, { spaces: 2 });
        const activated = providers.find(p => p.id === id);
        this._emitStatusChange('provider-activated', { id, name: activated?.name });
        console.log(`✅ [Providers] Manually activated: ${activated?.name}`);
        return this.getProviders();
    }

    /**
     * Mark a provider as exhausted and auto-activate the next one in queue.
     * @param {string} id — Provider ID
     * @param {string} reason — Why it was exhausted (e.g., 'quota_exceeded', 'rate_limit')
     * @returns {object} — { providers, nextActive }
     */
    async markExhausted(id, reason = 'unknown') {
        const providers = await fs.readJson(DATA_PATH);
        const provider = providers.find(p => p.id === id);

        if (!provider) {
            console.warn(`⚠️ [Providers] Cannot exhaust unknown provider: ${id}`);
            return { providers: await this.getProviders(), nextActive: null };
        }

        // Mark as exhausted
        provider.status = 'exhausted';
        provider.errorCount = (provider.errorCount || 0) + 1;
        this._addLog(provider, 'exhausted', reason);
        console.log(`🔴 [Providers] Marked "${provider.name}" as EXHAUSTED (reason: ${reason})`);

        // Auto-activate next available in queue
        let nextActive = null;
        const nextAvailable = providers
            .filter(p => p.status === 'available')
            .sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0))[0];

        if (nextAvailable) {
            nextAvailable.status = 'active';
            nextAvailable.lastUsed = new Date().toISOString();
            nextAvailable.errorCount = 0;
            this._addLog(nextAvailable, 'activated', `Auto-activated after "${provider.name}" was exhausted`);
            nextActive = { id: nextAvailable.id, name: nextAvailable.name };
            console.log(`🟢 [Providers] Auto-activated next in queue: "${nextAvailable.name}"`);
        } else {
            console.error(`🚨 [Providers] No more providers available! All exhausted.`);
        }

        await fs.writeJson(DATA_PATH, providers, { spaces: 2 });
        this._emitStatusChange('provider-exhausted', {
            exhaustedId: id,
            exhaustedName: provider.name,
            reason,
            nextActiveId: nextActive?.id || null,
            nextActiveName: nextActive?.name || null,
            allExhausted: !nextActive
        });

        return { providers: await this.getProviders(), nextActive };
    }

    /**
     * Reactivate an exhausted provider back to 'available'.
     * @param {string} id — Provider ID
     * @returns {Array} — Updated providers list
     */
    async reactivateProvider(id) {
        const providers = await fs.readJson(DATA_PATH);
        const provider = providers.find(p => p.id === id);

        if (!provider || provider.status !== 'exhausted') {
            console.warn(`⚠️ [Providers] Cannot reactivate: provider ${id} not found or not exhausted`);
            return this.getProviders();
        }

        provider.status = 'available';
        provider.errorCount = 0;
        this._addLog(provider, 'reactivated', 'Manually reactivated by user');
        console.log(`♻️ [Providers] Reactivated "${provider.name}"`);

        // Re-assign queue position at the end of available queue
        const maxQueue = providers
            .filter(p => p.status !== 'exhausted')
            .reduce((max, p) => Math.max(max, p.queuePosition || 0), -1);
        provider.queuePosition = maxQueue + 1;

        // If there's no active provider, auto-activate this one
        const hasActive = providers.some(p => p.status === 'active');
        if (!hasActive) {
            provider.status = 'active';
            provider.lastUsed = new Date().toISOString();
            this._addLog(provider, 'activated', 'Auto-activated (was the only reactivated provider)');
            console.log(`🟢 [Providers] Auto-activated "${provider.name}" (no other active provider)`);
        }

        await fs.writeJson(DATA_PATH, providers, { spaces: 2 });
        this._emitStatusChange('provider-reactivated', { id, name: provider.name });
        return this.getProviders();
    }

    /**
     * Reorder the queue of available providers.
     * @param {string[]} orderedIds — Provider IDs in desired order
     */
    async reorderQueue(orderedIds) {
        const providers = await fs.readJson(DATA_PATH);

        orderedIds.forEach((id, idx) => {
            const p = providers.find(pr => pr.id === id);
            if (p) p.queuePosition = idx;
        });

        await fs.writeJson(DATA_PATH, providers, { spaces: 2 });
        this._emitStatusChange('queue-reordered', { order: orderedIds });
        return this.getProviders();
    }

    // ── Usage Logs ────────────────────────────────────────────────────────

    _addLog(provider, event, reason) {
        if (!provider.usageLogs) provider.usageLogs = [];
        provider.usageLogs.push({
            timestamp: new Date().toISOString(),
            event,
            reason
        });
        // Keep only the last 50 logs per provider
        if (provider.usageLogs.length > 50) {
            provider.usageLogs = provider.usageLogs.slice(-50);
        }
    }

    /**
     * Get all usage logs across all providers, sorted by most recent first.
     * @param {string} [filterId] — Optional provider ID to filter
     * @returns {Array} — Array of { providerName, providerStatus, ...log }
     */
    async getUsageLogs(filterId) {
        const providers = await fs.readJson(DATA_PATH);
        const logs = [];

        providers.forEach(p => {
            if (filterId && p.id !== filterId) return;
            (p.usageLogs || []).forEach(log => {
                logs.push({
                    providerId: p.id,
                    providerName: p.name,
                    providerStatus: p.status,
                    ...log
                });
            });
        });

        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // ── Cross-provider helpers (used by rotation service) ─────────────────

    /**
     * Activate a provider by its decrypted API key value.
     * Used by the cross-provider fallback to auto-switch to the working provider.
     */
    async activateByDecryptedKey(decryptedKey) {
        const providers = await fs.readJson(DATA_PATH);
        const target = providers.find(p => {
            try {
                return this.decrypt(p.apiKey) === decryptedKey;
            } catch { return false; }
        });
        if (!target) return null;

        providers.forEach(p => {
            if (p.id === target.id) {
                p.status = 'active';
                p.lastUsed = new Date().toISOString();
                p.errorCount = 0;
                this._addLog(p, 'activated', 'Auto-activated by key rotation fallback');
            } else if (p.status === 'active') {
                p.status = 'available';
            }
        });

        await fs.writeJson(DATA_PATH, providers, { spaces: 2 });
        console.log(`🔄 [Providers] Auto-activated provider "${target.name}" (${this.maskKey(decryptedKey)})`);
        this._emitStatusChange('provider-activated', { id: target.id, name: target.name });
        return { id: target.id, name: target.name, apiKey: this.maskKey(decryptedKey) };
    }

    /**
     * Returns all decrypted API keys for a given provider type.
     * Used by the key rotation service to cycle through available keys.
     */
    async getProvidersByType(type) {
        const providers = await fs.readJson(DATA_PATH);
        const typeLower = type.toLowerCase();

        const matching = providers.filter(p => {
            // Skip exhausted providers
            if (p.status === 'exhausted') return false;

            const name = p.name.toLowerCase();
            const decryptedKey = this.decrypt(p.apiKey);

            if (typeLower === 'groq') {
                return decryptedKey.startsWith('gsk_') || (
                    (name.includes('groq') || name.includes('grog')) && !decryptedKey.startsWith('sk-') && !decryptedKey.startsWith('AIza')
                );
            }
            if (typeLower === 'openai') {
                return !decryptedKey.startsWith('gsk_') && (
                    decryptedKey.startsWith('sk-') || name.includes('openai')
                );
            }
            if (typeLower === 'gemini') {
                return !decryptedKey.startsWith('gsk_') && !decryptedKey.startsWith('sk-') && (
                    decryptedKey.startsWith('AIza') || name.includes('gemini')
                );
            }
            if (typeLower === 'grok') {
                return !decryptedKey.startsWith('gsk_') && name.includes('grok') && !name.includes('groq');
            }
            return false;
        });

        return matching.map(p => this.decrypt(p.apiKey));
    }

    /**
     * Find a provider by its decrypted API key and mark it as exhausted.
     * Used by the key rotation service when a key fails.
     */
    async exhaustByDecryptedKey(decryptedKey, reason = 'API call failure') {
        const providers = await fs.readJson(DATA_PATH);
        const target = providers.find(p => {
            try {
                return this.decrypt(p.apiKey) === decryptedKey;
            } catch { return false; }
        });
        if (!target) return null;
        return this.markExhausted(target.id, reason);
    }

    // ── Test connection ──────────────────────────────────────────────────

    async testConnection(id) {
        const providers = await fs.readJson(DATA_PATH);
        const provider = providers.find(p => p.id === id);
        if (!provider) throw new Error('Proveedor no encontrado');

        const apiKey = this.decrypt(provider.apiKey);

        try {
            if (provider.name.toLowerCase().includes('openai')) {
                const response = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                return response.ok;
            }
            if (provider.name.toLowerCase().includes('gemini') || apiKey.startsWith('AIza')) {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
                );
                return response.ok;
            }
            return true;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new AIProvidersService();
