/**
 * Campaigns Routes
 * Base: /api/campaigns
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const campaignsService = require('../services/campaigns.service');
const whatsapp = require('../core/WhatsApp');
const chatHistoryService = require('../services/chatHistory.service');

// Apply auth to all routes
router.use(verifyToken);

// GET /api/campaigns — list all campaigns
router.get('/', async (req, res) => {
    try {
        const campaigns = await campaignsService.listCampaigns();
        res.json({ success: true, data: campaigns });
    } catch (err) {
        console.error('❌ List campaigns error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/campaigns — create campaign
router.post('/', async (req, res) => {
    try {
        const campaign = await campaignsService.createCampaign(req.body);
        res.status(201).json({ success: true, data: campaign });
    } catch (err) {
        console.error('❌ Create campaign error:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

// GET /api/campaigns/:id — get single campaign
router.get('/:id', async (req, res) => {
    try {
        const campaign = await campaignsService.getCampaign(req.params.id);
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
        res.json({ success: true, data: campaign });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/campaigns/:id — update campaign
router.put('/:id', async (req, res) => {
    try {
        const updated = await campaignsService.updateCampaign(req.params.id, req.body);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/campaigns/:id — delete campaign
router.delete('/:id', async (req, res) => {
    try {
        await campaignsService.deleteCampaign(req.params.id);
        res.json({ success: true, message: 'Campaña eliminada' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/campaigns/:id/send — execute mass send
router.post('/:id/send', async (req, res) => {
    try {
        // Inject WhatsApp dependencies before sending
        const io = req.app.get('io');
        campaignsService.setDependencies(whatsapp.sock, chatHistoryService, io);

        const delayMs = req.body.delayMs || 2000;
        const result = await campaignsService.sendCampaign(req.params.id, delayMs);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('❌ Send campaign error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/campaigns/:id/stats — campaign statistics
router.get('/:id/stats', async (req, res) => {
    try {
        const stats = await campaignsService.getCampaignStats(req.params.id);
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
