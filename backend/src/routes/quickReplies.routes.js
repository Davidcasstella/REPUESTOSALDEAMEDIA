const express = require('express');
const router = express.Router();
const quickRepliesService = require('../services/quickReplies.service');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require token verification
router.use(verifyToken);

// GET /api/quick-replies — get all quick replies
router.get('/', async (req, res) => {
    try {
        const list = await quickRepliesService.getAll();
        res.json({ success: true, data: list, count: list.length });
    } catch (error) {
        console.error('Error fetching quick replies:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/quick-replies/:id — get a specific quick reply by ID
router.get('/:id', async (req, res) => {
    try {
        const item = await quickRepliesService.getById(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Respuesta rápida no encontrada' });
        }
        res.json({ success: true, data: item });
    } catch (error) {
        console.error(`Error fetching quick reply ${req.params.id}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/quick-replies — create a new quick reply
router.post('/', async (req, res) => {
    try {
        const { name, shortcut, content } = req.body;
        if (!name || !shortcut || !content) {
            return res.status(400).json({ success: false, error: 'name, shortcut y content son obligatorios' });
        }
        const item = await quickRepliesService.create({ name, shortcut, content });
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        console.error('Error creating quick reply:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/quick-replies/:id — update a quick reply
router.put('/:id', async (req, res) => {
    try {
        const { name, shortcut, content } = req.body;
        const updated = await quickRepliesService.update(req.params.id, { name, shortcut, content });
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Respuesta rápida no encontrada' });
        }
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error(`Error updating quick reply ${req.params.id}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/quick-replies/:id — delete a quick reply
router.delete('/:id', async (req, res) => {
    try {
        const removed = await quickRepliesService.delete(req.params.id);
        if (!removed) {
            return res.status(404).json({ success: false, error: 'Respuesta rápida no encontrada' });
        }
        res.json({ success: true, message: 'Respuesta rápida eliminada' });
    } catch (error) {
        console.error(`Error deleting quick reply ${req.params.id}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
