/**
 * ChatHistoryService — DynamoDB Version
 *
 * Stores message history per JID for the admin chat interface.
 * Uses DynamoDB table: chatwifi-chat-history (partition key: jid)
 *
 * Each item: { jid, pushName, messages: [...] }
 * Max 100 messages per conversation (oldest auto-trimmed).
 */

const crypto = require('crypto');
const { putItem, getItem, scanItems, deleteItem } = require('../config/dynamodb');

const TABLE = 'chat-history';
const MAX_MESSAGES_PER_CHAT = 100;

class ChatHistoryService {
    constructor() {
        // In-memory cache for performance (same pattern as before)
        this._cache = {};
        this._cacheLoaded = false;
    }

    // ── Private helpers ──

    _normalizeJid(jid) {
        if (!jid) return jid;
        return jid.replace(/:\d+@/, '@');
    }

    async _loadCache() {
        if (this._cacheLoaded) return;
        try {
            const items = await scanItems(TABLE);
            for (const item of items) {
                this._cache[item.jid] = {
                    pushName: item.pushName,
                    nameIsCustom: item.nameIsCustom || false,
                    messages: item.messages || []
                };
            }
            this._cacheLoaded = true;
        } catch (err) {
            console.error('❌ Failed to load chat history from DynamoDB:', err.message);
            this._cacheLoaded = true;
        }
    }

    async _persist(jid) {
        const data = this._cache[jid];
        if (!data) return;
        await putItem(TABLE, {
            jid,
            pushName: data.pushName,
            nameIsCustom: data.nameIsCustom || false,
            messages: data.messages
        });
    }

    // ── Public API ──

    /**
     * Add a message to a conversation.
     * @param {string} rawJid - WhatsApp JID
     * @param {string} text - Message text
     * @param {boolean} fromMe
     * @param {string} [pushName]
     * @param {string} [sender] - 'client' | 'agent' | 'bot'
     * @returns {object} The saved message object
     */
    async addMessage(rawJid, text, fromMe, pushName, sender) {
        await this._loadCache();
        const jid = this._normalizeJid(rawJid);

        if (!this._cache[jid]) {
            this._cache[jid] = {
                pushName: pushName || jid.replace('@s.whatsapp.net', ''),
                nameIsCustom: false,
                messages: []
            };
        }

        // Update pushName if provided and name is not custom
        if (pushName && !fromMe && !this._cache[jid].nameIsCustom) {
            const isGroup = jid.includes('@g.us');
            if (!isGroup || !this._cache[jid].pushName || this._cache[jid].pushName === jid.replace('@g.us', '')) {
                this._cache[jid].pushName = pushName;
            }
        }

        const message = {
            id: crypto.randomBytes(8).toString('hex'),
            text: text || '',
            fromMe,
            sender: sender || (fromMe ? 'agent' : 'client'),
            timestamp: new Date().toISOString()
        };

        this._cache[jid].messages.push(message);

        // Trim to max messages
        if (this._cache[jid].messages.length > MAX_MESSAGES_PER_CHAT) {
            this._cache[jid].messages = this._cache[jid].messages.slice(-MAX_MESSAGES_PER_CHAT);
        }

        // Persist to DynamoDB (non-blocking)
        this._persist(jid).catch(err => {
            console.error(`❌ Failed to persist chat history for ${jid}:`, err.message);
        });

        return message;
    }

    /**
     * Create or update a group entry with the real group name.
     */
    async ensureGroupEntry(rawJid, groupName) {
        await this._loadCache();
        const jid = this._normalizeJid(rawJid);

        if (!this._cache[jid]) {
            this._cache[jid] = { pushName: groupName, messages: [] };
        } else {
            this._cache[jid].pushName = groupName;
        }

        this._persist(jid).catch(() => {});
    }

    /**
     * Update the pushName for a conversation (and set nameIsCustom to true).
     */
    async updatePushName(rawJid, newName) {
        await this._loadCache();
        const jid = this._normalizeJid(rawJid);

        if (!this._cache[jid]) {
            this._cache[jid] = { pushName: newName, nameIsCustom: true, messages: [] };
        } else {
            this._cache[jid].pushName = newName;
            this._cache[jid].nameIsCustom = true;
        }

        await this._persist(jid);
        return this._cache[jid];
    }

    /**
     * Get all messages for a specific conversation.
     */
    async getMessages(rawJid) {
        await this._loadCache();
        const jid = this._normalizeJid(rawJid);
        return this._cache[jid] || { pushName: jid.replace('@s.whatsapp.net', ''), messages: [] };
    }

    /**
     * Get all conversations sorted by most recent message.
     * @param {Object} [options]
     * @param {boolean} [options.includeGroups=false]
     */
    async getConversations(options = {}) {
        await this._loadCache();
        const { includeGroups = false } = options;

        return Object.entries(this._cache)
            .filter(([jid]) => {
                const isGroup = jid.includes('@g.us');
                if (isGroup && !includeGroups) return false;
                return true;
            })
            .map(([jid, conv]) => {
                const lastMsg = conv.messages.length > 0
                    ? conv.messages[conv.messages.length - 1]
                    : null;

                const unreadCount = conv.messages.filter(m => !m.fromMe && !m.read).length;

                return {
                    jid,
                    pushName: conv.pushName || jid.replace('@s.whatsapp.net', '').replace('@g.us', ''),
                    lastMessage: lastMsg ? lastMsg.text : '',
                    lastMessageTime: lastMsg ? lastMsg.timestamp : null,
                    lastMessageFromMe: lastMsg ? lastMsg.fromMe : false,
                    messageCount: conv.messages.length,
                    unreadCount,
                    isGroup: jid.includes('@g.us')
                };
            })
            .sort((a, b) => {
                const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                return bTime - aTime;
            });
    }

    /**
     * Mark all messages in a conversation as read.
     */
    async markAsRead(rawJid) {
        await this._loadCache();
        const jid = this._normalizeJid(rawJid);
        if (this._cache[jid]) {
            this._cache[jid].messages.forEach(m => {
                if (!m.fromMe) m.read = true;
            });
            this._persist(jid).catch(() => {});
        }
    }

    /**
     * Delete a conversation entirely.
     */
    async deleteConversation(rawJid) {
        await this._loadCache();
        const jid = this._normalizeJid(rawJid);
        if (this._cache[jid]) {
            delete this._cache[jid];
            await deleteItem(TABLE, { jid });
            return true;
        }
        return false;
    }
}

module.exports = new ChatHistoryService();
