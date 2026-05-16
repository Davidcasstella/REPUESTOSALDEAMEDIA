const express = require('express');
const router = express.Router();
const aiFallbackService = require('../services/aiFallback.service');
const welcomeAutomationService = require('../services/welcomeAutomation.service');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// ── GET /api/ai-fallback/config ────────────────────────────────────────────
router.get('/config', async (req, res) => {
    try {
        const config = await aiFallbackService.getConfig();
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('Error fetching fallback config:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── PUT /api/ai-fallback/config ────────────────────────────────────────────
router.put('/config', async (req, res) => {
    try {
        const { adminJid, fallbackPhrases } = req.body;
        const updates = {};
        if (adminJid !== undefined) updates.adminJid = String(adminJid);
        if (fallbackPhrases !== undefined) updates.fallbackPhrases = fallbackPhrases;
        const config = await aiFallbackService.saveConfig(updates);
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('Error updating fallback config:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── GET /api/ai-fallback/pending ───────────────────────────────────────────
router.get('/pending', async (req, res) => {
    try {
        const pending = await aiFallbackService.getPendingList();
        const count = pending.filter(p => !p.attended).length;
        res.json({ success: true, data: pending, count });
    } catch (error) {
        console.error('Error fetching pending list:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── GET /api/ai-fallback/pending/count ─────────────────────────────────────
router.get('/pending/count', async (req, res) => {
    try {
        const count = await aiFallbackService.getPendingCount();
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/ai-fallback/reactivate ───────────────────────────────────────
router.post('/reactivate', async (req, res) => {
    try {
        const { jid } = req.body;
        if (!jid) return res.status(400).json({ success: false, error: 'jid es obligatorio' });
        await aiFallbackService.reactivateAI(jid, welcomeAutomationService);
        res.json({ success: true, message: `IA reactivada para ${jid}` });
    } catch (error) {
        console.error('Error reactivating AI:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/ai-fallback/attended ─────────────────────────────────────────
router.post('/attended', async (req, res) => {
    try {
        const { jid } = req.body;
        if (!jid) return res.status(400).json({ success: false, error: 'jid es obligatorio' });
        await aiFallbackService.markAttended(jid);
        res.json({ success: true, message: `Marcado como atendido: ${jid}` });
    } catch (error) {
        console.error('Error marking attended:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
