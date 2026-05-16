const express = require('express');
const router = express.Router();
const blockedNumbersService = require('../services/blockedNumbers.service');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes protected
router.use(verifyToken);

// ==================== BLOCKED NUMBERS CRUD ====================

// GET /api/blocked-numbers — list all
router.get('/', async (req, res) => {
    try {
        const list = await blockedNumbersService.getAll();
        res.json({ success: true, data: list, count: list.length });
    } catch (error) {
        console.error('Error fetching blocked numbers:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/blocked-numbers — create
router.post('/', async (req, res) => {
    try {
        const { phoneNumber, name, reason, isActive } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ success: false, error: 'phoneNumber es obligatorio' });
        }
        const entry = await blockedNumbersService.add({ phoneNumber, name, reason, isActive });
        res.status(201).json({ success: true, data: entry });
    } catch (error) {
        console.error('Error creating blocked number:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/blocked-numbers/:id — update
router.put('/:id', async (req, res) => {
    try {
        const updated = await blockedNumbersService.update(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Número no encontrado' });
        }
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Error updating blocked number:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/blocked-numbers/:id — remove
router.delete('/:id', async (req, res) => {
    try {
        const removed = await blockedNumbersService.remove(req.params.id);
        if (!removed) {
            return res.status(404).json({ success: false, error: 'Número no encontrado' });
        }
        res.json({ success: true, message: 'Número eliminado' });
    } catch (error) {
        console.error('Error removing blocked number:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== GLOBAL CONFIG ====================

// GET /api/blocked-numbers/config — get global config
router.get('/config', async (req, res) => {
    try {
        const config = await blockedNumbersService.getConfig();
        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/blocked-numbers/config — update global config
router.post('/config', async (req, res) => {
    try {
        const config = await blockedNumbersService.updateConfig(req.body);
        console.log(`⚙️ Bot config updated: blockGroups=${config.blockGroups}`);
        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
