/**
 * SentTracker
 *
 * Tracks recently-sent outgoing messages (by JID) so the incoming
 * message listener in app.js can skip re-recording them.
 *
 * Both humanResponse.service and chat.routes call markSent(jid)
 * right after saving/emitting a message. When the WhatsApp socket
 * echoes that same message back as fromMe, app.js calls
 * wasSentRecently(jid) and skips the duplicate save.
 *
 * Uses a TTL of 15 seconds — enough to cover human-like 3-part
 * response delays (~6-9 s total) plus network jitter.
 */

const TTL_MS = 15_000; // 15 seconds
const CLEANUP_INTERVAL_MS = 60_000; // purge expired entries every 60s

class SentTracker {
    constructor() {
        /** @type {Map<string, number[]>} jid -> array of timestamps */
        this._map = new Map();

        // Periodic cleanup of expired entries
        this._timer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
        if (this._timer.unref) this._timer.unref(); // Don't keep process alive
    }

    /**
     * Mark a JID as having just sent a message from bot/dashboard.
     * Multiple calls within the TTL window accumulate (e.g. 3-part bot messages).
     */
    markSent(rawJid) {
        if (!rawJid) return;
        const jid = rawJid.replace(/:\d+@/, '@');
        const now = Date.now();
        const existing = this._map.get(jid) || [];
        existing.push(now);
        this._map.set(jid, existing);
    }

    /**
     * Check whether a message was recently sent to this JID by
     * the bot or dashboard. If yes, consumes one mark (FIFO)
     * so each real send only suppresses one echo.
     *
     * @returns {boolean}
     */
    wasSentRecently(rawJid) {
        if (!rawJid) return false;
        const jid = rawJid.replace(/:\d+@/, '@');
        const timestamps = this._map.get(jid);
        if (!timestamps || timestamps.length === 0) return false;

        const now = Date.now();
        // Remove expired entries from the front
        while (timestamps.length > 0 && now - timestamps[0] > TTL_MS) {
            timestamps.shift();
        }

        if (timestamps.length === 0) {
            this._map.delete(jid);
            return false;
        }

        // Consume one mark (the oldest valid one)
        timestamps.shift();
        if (timestamps.length === 0) this._map.delete(jid);
        return true;
    }

    _cleanup() {
        const now = Date.now();
        for (const [jid, timestamps] of this._map.entries()) {
            const valid = timestamps.filter(t => now - t <= TTL_MS);
            if (valid.length === 0) {
                this._map.delete(jid);
            } else {
                this._map.set(jid, valid);
            }
        }
    }
}

module.exports = new SentTracker();
