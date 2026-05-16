const aiProvidersService = require('./aiProviders.service');
const aiFallbackService = require('./aiFallback.service');

/**
 * API Key Rotation Service
 *
 * Provides automatic key rotation for AI providers.
 * When a key fails with a rotatable error (401, 429, 402, quota, rate limit),
 * it automatically tries the next available key of the same provider type.
 * If ALL keys are exhausted, sends a single WhatsApp notification to the admin.
 */
class ApiKeyRotationService {
    constructor() {
        // Anti-spam flag per provider type — prevents repeated notifications
        this._notificationSent = {};
        // Reference to WhatsApp socket (set externally)
        this._sock = null;
        // Reference to Socket.io for real-time frontend events
        this._io = null;
        // Current rotation state per provider type (for UI display)
        this._rotationState = {};
    }

    /**
     * Set the WhatsApp socket reference for admin notifications.
     * Called once from app.js when the socket is available.
     * @param {object} sock - Baileys WhatsApp socket
     */
    setSock(sock) {
        this._sock = sock;
    }

    /**
     * Set the Socket.io instance for emitting real-time events to the frontend.
     * @param {object} io - Socket.io server instance
     */
    setIo(io) {
        this._io = io;
    }

    /**
     * Get the current rotation state for a provider type (for REST API).
     * @param {string} [providerType] - Optional filter by type
     * @returns {object}
     */
    getStatus(providerType) {
        if (providerType) {
            return this._rotationState[providerType] || { status: 'idle', activeKeyMask: null };
        }
        return this._rotationState;
    }

    /**
     * Emit a rotation event to the frontend via Socket.io
     * @param {string} event - Event type: 'key-active', 'key-rotated', 'all-exhausted'
     * @param {object} data - Event payload
     */
    _emitRotationEvent(event, data) {
        const payload = { event, ...data, timestamp: Date.now() };
        this._rotationState[data.providerType] = payload;
        if (this._io) {
            this._io.emit('key-rotation-event', payload);
        }
    }

    /**
     * Determines if an error is rotatable (should trigger key switch).
     * @param {Error} error - The error from the API call
     * @returns {boolean}
     */
    isRotatableError(error) {
        const status = error.response?.status || error.status || 0;
        const errorMessage = (error.response?.data?.error?.message || error.message || '').toLowerCase();
        const errorCode = (error.response?.data?.error?.code || error.code || '').toString().toLowerCase();
        const errorType = (error.response?.data?.error?.type || '').toLowerCase();

        // HTTP status codes that indicate key issues
        const rotatableStatuses = [400, 401, 402, 429];
        if (rotatableStatuses.includes(status)) {
            return true;
        }

        // Error messages that indicate key/quota issues
        const rotatablePatterns = [
            'insufficient_quota',
            'rate_limit_exceeded',
            'rate_limit',
            'quota_exceeded',
            'invalid_api_key',
            'invalid api key',
            'api key expired',
            'authentication',
            'unauthorized',
            'billing',
            'exceeded your current quota',
            'too many requests',
            'tokens per minute',
            'requests per minute',
            'limit reached',
            'org_quota_exceeded',
            'insufficient_funds',
            'deactivated',
            'account_deactivated',
            'bad request',
            'invalid request',
            'invalid_request_error'
        ];

        const combinedText = `${errorMessage} ${errorCode} ${errorType}`;
        return rotatablePatterns.some(pattern => combinedText.includes(pattern));
    }

    /**
     * Mask an API key for safe logging.
     * @param {string} key
     * @returns {string}
     */
    _maskKey(key) {
        if (!key || key.length <= 8) return '****';
        return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
    }

    /**
     * Main rotation method. Tries all keys of a provider type sequentially.
     *
     * @param {string} providerType - The provider type identifier (e.g., 'groq', 'openai', 'gemini')
     * @param {Function} callFn - The API call function: (apiKey, systemPrompt, userPrompt) => Promise<string>
     * @param {string} systemPrompt - The system prompt for the AI call
     * @param {string} userPrompt - The user prompt for the AI call
     * @param {string} currentApiKey - The currently active key (tried first)
     * @returns {Promise<string>} - The AI response
     * @throws {Error} - Re-throws the last error if all keys fail and it's NOT rotatable
     */
    async callWithRotation(providerType, callFn, systemPrompt, userPrompt, currentApiKey) {
        // Get all keys for this provider type
        const allKeys = await aiProvidersService.getProvidersByType(providerType);

        if (!allKeys || allKeys.length === 0) {
            console.warn(`⚠️ [KeyRotation] No keys found for provider type: ${providerType}`);
            throw new Error(`No API keys available for ${providerType}`);
        }

        // If only one key, just call directly (no rotation needed)
        if (allKeys.length === 1) {
            return await callFn(currentApiKey, systemPrompt, userPrompt);
        }

        // Order keys: current key first, then the rest
        const orderedKeys = [
            currentApiKey,
            ...allKeys.filter(k => k !== currentApiKey)
        ];

        let lastError = null;

        for (let i = 0; i < orderedKeys.length; i++) {
            const key = orderedKeys[i];
            try {
                const result = await callFn(key, systemPrompt, userPrompt);

                // Success! Reset notification flag for this provider
                if (this._notificationSent[providerType]) {
                    console.log(`✅ [KeyRotation] Key ${this._maskKey(key)} worked for ${providerType}. Resetting alert flag.`);
                    this._notificationSent[providerType] = false;
                }

                // Log if we had to rotate (i > 0 means we skipped the first key)
                if (i > 0) {
                    console.log(`🔄 [KeyRotation] Successfully rotated to key ${this._maskKey(key)} (attempt ${i + 1}/${orderedKeys.length})`);
                    this._emitRotationEvent('key-rotated', {
                        providerType,
                        status: 'rotated',
                        activeKeyMask: this._maskKey(key),
                        attempt: i + 1,
                        totalKeys: orderedKeys.length
                    });
                } else {
                    this._emitRotationEvent('key-active', {
                        providerType,
                        status: 'active',
                        activeKeyMask: this._maskKey(key),
                        attempt: 1,
                        totalKeys: orderedKeys.length
                    });
                }

                return result;
            } catch (error) {
                lastError = error;

                if (this.isRotatableError(error)) {
                    const status = error.response?.status || 'unknown';
                    console.warn(`🔄 [KeyRotation] Key ${this._maskKey(key)} failed for ${providerType} (status: ${status}). ${i < orderedKeys.length - 1 ? 'Trying next key...' : 'No more keys available.'}`);
                } else {
                    // Non-rotatable error (network, server error, etc.) — don't rotate, re-throw
                    console.error(`❌ [KeyRotation] Non-rotatable error with key ${this._maskKey(key)} for ${providerType}: ${error.message}`);
                    throw error;
                }
            }
        }

        // All keys exhausted
        console.error(`🚨 [KeyRotation] ALL ${orderedKeys.length} keys exhausted for ${providerType}`);
        this._emitRotationEvent('all-exhausted', {
            providerType,
            status: 'exhausted',
            activeKeyMask: null,
            totalKeys: orderedKeys.length
        });
        await this._notifyAllKeysExhausted(providerType);
        throw lastError;
    }

    /**
     * Sends a WhatsApp notification to admin when all keys are exhausted.
     * Anti-spam: only sends once per provider until a key works again.
     * Reuses the existing admin notification infrastructure from aiFallback.service.
     *
     * @param {string} providerType
     */
    async _notifyAllKeysExhausted(providerType) {
        // Anti-spam: don't send if already notified for this provider
        if (this._notificationSent[providerType]) {
            console.log(`📭 [KeyRotation] Admin already notified about ${providerType} keys. Skipping duplicate.`);
            return;
        }

        this._notificationSent[providerType] = true;

        // Reuse the existing admin notification mechanism from aiFallback
        if (!this._sock) {
            console.warn('⚠️ [KeyRotation] No WhatsApp socket available for admin notification');
            return;
        }

        try {
            const config = await aiFallbackService.getConfig();
            if (!config.adminJid) {
                console.warn('⚠️ [KeyRotation] No admin JID configured');
                return;
            }

            const providerDisplay = providerType.charAt(0).toUpperCase() + providerType.slice(1);
            const message = `⚠️ ALERTA DEL SISTEMA:\n\nTodas las API Keys de ${providerDisplay} están agotadas o inválidas.\nEl chatbot no puede generar respuestas.\n\nSe requiere recargar créditos o agregar nuevas API Keys.\n\n🕐 ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`;

            await this._sock.sendMessage(config.adminJid, { text: message });
            console.log(`📢 [KeyRotation] Admin notification sent to ${config.adminJid} about exhausted ${providerType} keys`);
        } catch (err) {
            console.error(`❌ [KeyRotation] Failed to send admin notification: ${err.message}`);
        }
    }
}

module.exports = new ApiKeyRotationService();
