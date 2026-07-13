const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const chatHistoryService = require('../services/chatHistory.service');
const whatsapp = require('../core/WhatsApp');
const welcomeAutomationService = require('../services/welcomeAutomation.service');
const sentTracker = require('../utils/sentTracker');

// Memory cache for profile pictures to avoid WhatsApp server rate-limits
const profilePicCache = {};

// All routes require authentication
router.use(verifyToken);

/**
 * GET /api/chat/conversations
 * Returns all conversations sorted by most recent message.
 * Query params:
 *   ?include_groups=true — include group conversations (@g.us)
 */
router.get('/conversations', async (req, res) => {
    try {
        const includeGroups = req.query.include_groups === 'true';
        const conversations = await chatHistoryService.getConversations({ includeGroups });
        res.json({ success: true, data: conversations });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/chat/messages/:jid
 * Returns message history for a specific conversation.
 */
router.get('/messages/:jid', async (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        const conversation = await chatHistoryService.getMessages(jid);
        // Mark as read when admin views the conversation
        await chatHistoryService.markAsRead(jid);
        res.json({ success: true, data: conversation });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/chat/send
 * Sends a manual reply from the admin to a client via WhatsApp.
 * Body: { jid: string, text: string }
 */
router.post('/send', async (req, res) => {
    try {
        const { jid: inputJid, text } = req.body;
        if (!inputJid || !text) {
            return res.status(400).json({ success: false, message: 'jid and text are required' });
        }

        // Normalize JID: strip device suffix (e.g. "573028599105:42@s.whatsapp.net" → "573028599105@s.whatsapp.net")
        const jid = inputJid.replace(/:\d+@/, '@');

        if (!whatsapp.sock) {
            return res.status(503).json({ success: false, message: 'WhatsApp not connected' });
        }

        // Disable AI for this chat since an agent took over manually via the dashboard
        await welcomeAutomationService.disableUserAI(jid);

        // Send via WhatsApp
        await whatsapp.sock.sendMessage(jid, { text });

        // Store in chat history with sender='agent'
        const message = await chatHistoryService.addMessage(jid, text, true, undefined, 'agent');
        sentTracker.markSent(jid);

        // Emit Socket.io event for real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('chat:message', { jid, message });
        }

        console.log(`💬 Admin sent manual reply to ${jid}: "${text.substring(0, 50)}..."`);
        res.json({ success: true, data: message });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/chat/mark-read/:jid
 * Marks all messages in a conversation as read.
 */
router.post('/mark-read/:jid', async (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        await chatHistoryService.markAsRead(jid);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/chat/:jid
 * Deletes a conversation from the history.
 */
router.delete('/:jid', async (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        const deleted = await chatHistoryService.deleteConversation(jid);
        if (deleted) {
            res.json({ success: true, message: 'Conversación eliminada' });
        } else {
            res.status(404).json({ success: false, message: 'Conversación no encontrada' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/chat/conversations/:jid/name
 * Updates the display name for a conversation.
 */
router.put('/conversations/:jid/name', async (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'name is required' });
        }
        const updated = await chatHistoryService.updatePushName(jid, name.trim());
        
        // Emit socket event to notify other connected clients about name change
        const io = req.app.get('io');
        if (io) {
            io.emit('chat:name-update', { jid, pushName: updated.pushName });
        }

        res.json({ success: true, pushName: updated.pushName });
    } catch (error) {
        console.error('Error updating conversation name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/chat/conversations/:jid/profile-picture
 * Fetches the profile picture URL for a specific JID.
 */
router.get('/conversations/:jid/profile-picture', async (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        if (!whatsapp.sock) {
            return res.status(503).json({ success: false, message: 'WhatsApp not connected' });
        }
        
        let url = profilePicCache[jid];
        if (url === undefined) {
            try {
                url = await whatsapp.sock.profilePictureUrl(jid, 'image');
                profilePicCache[jid] = url || null;
            } catch (err) {
                // Only cache null if it's a permanent 404 / not found error (i.e. user has no profile picture)
                const isNotFoundError = err.message?.includes('404') || 
                                       err.message?.includes('not-found') || 
                                       err.message?.includes('item-not-found') ||
                                       err.status === 404 || 
                                       err.statusCode === 404;
                if (isNotFoundError) {
                    profilePicCache[jid] = null;
                }
                url = null;
            }
        }
        
        res.json({ success: true, url });
    } catch (error) {
        console.error(`Error fetching profile picture for ${req.params.jid}:`, error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
