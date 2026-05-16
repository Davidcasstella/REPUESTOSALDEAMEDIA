const express = require('express');
const router = express.Router();
const aiAutomationsService = require('../services/aiAutomations.service');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes are protected
router.use(verifyToken);

// GET current config
router.get('/config', async (req, res) => {
    try {
        const config = await aiAutomationsService.getConfig();
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT update config (toggles)
router.put('/config', async (req, res) => {
    try {
        const { paymentDetectionEnabled, voiceProcessingEnabled } = req.body;
        const updates = {};

        if (paymentDetectionEnabled !== undefined) {
            updates.paymentDetectionEnabled = Boolean(paymentDetectionEnabled);
        }
        if (voiceProcessingEnabled !== undefined) {
            updates.voiceProcessingEnabled = Boolean(voiceProcessingEnabled);
        }

        const config = await aiAutomationsService.saveConfig(updates);
        console.log(`⚙️ AI Automations config updated:`, updates);
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
