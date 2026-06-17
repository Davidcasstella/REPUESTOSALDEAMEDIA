/**
 * Leads Routes
 * Base: /api/leads
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const leadScoringService = require('../services/leadScoring.service');

router.use(verifyToken);

// GET /api/leads/stats — get global lead statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await leadScoringService.getStats();
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/leads — list leads with optional filters
router.get('/', async (req, res) => {
    try {
        const { score, status, campaignId, search } = req.query;
        const leads = await leadScoringService.listLeads({
            score, status, campaignId, search
        });
        res.json({ success: true, data: leads });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/leads/:id — get single lead
router.get('/:id', async (req, res) => {
    try {
        const lead = await leadScoringService.getLead(req.params.id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });
        res.json({ success: true, data: lead });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/leads/:id/status — update lead status
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['nuevo', 'contactado', 'cerrado'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Estado inválido' });
        }
        const updated = await leadScoringService.updateLeadStatus(req.params.id, status);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
