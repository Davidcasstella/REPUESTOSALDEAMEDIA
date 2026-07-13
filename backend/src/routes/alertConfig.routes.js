/**
 * Alert Configuration Routes
 * Base: /api/alert-config
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const alertNotificationsService = require('../services/alertNotifications.service');
const whatsapp = require('../core/WhatsApp');

router.use(verifyToken);

// GET /api/alert-config — get current alert configuration
router.get('/', async (req, res) => {
    try {
        const config = await alertNotificationsService.getConfig();
        // Never expose SMTP password to frontend
        const safe = { ...config };
        if (safe.smtpPass) safe.smtpPass = '••••••••';
        res.json({ success: true, data: safe });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/alert-config — save configuration
router.put('/', async (req, res) => {
    try {
        // If smtpPass is masked placeholder, fetch current and keep existing password
        if (req.body.smtpPass === '••••••••') {
            const current = await alertNotificationsService.getConfig();
            req.body.smtpPass = current.smtpPass || '';
        }

        const saved = await alertNotificationsService.saveConfig(req.body);
        const safe = { ...saved };
        if (safe.smtpPass) safe.smtpPass = '••••••••';
        res.json({ success: true, data: safe });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/alert-config/test — send test notification
router.post('/test', async (req, res) => {
    try {
        // Inject WhatsApp socket before sending
        alertNotificationsService.setSock(whatsapp.sock);

        const config = await alertNotificationsService.getConfig();
        if (req.body.smtpPass === '••••••••') {
            req.body.smtpPass = config.smtpPass || '';
        }
        const mergedConfig = { ...config, ...req.body };

        const results = await alertNotificationsService.sendTestNotification(mergedConfig);
        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
