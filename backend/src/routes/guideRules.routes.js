const express = require('express');
const router = express.Router();
const guideRulesService = require('../services/guideRules.service');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require token verification
router.use(verifyToken);

// GET /api/guide-rules — get all guide rules
router.get('/', async (req, res) => {
    try {
        const list = await guideRulesService.getAll();
        res.json({ success: true, data: list, count: list.length });
    } catch (error) {
        console.error('Error fetching guide rules:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/guide-rules/:id — get a specific rule by ID
router.get('/:id', async (req, res) => {
    try {
        const item = await guideRulesService.getById(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Regla de guía no encontrada' });
        }
        res.json({ success: true, data: item });
    } catch (error) {
        console.error(`Error fetching guide rule ${req.params.id}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/guide-rules — create a new guide rule
router.post('/', async (req, res) => {
    try {
        const { name, content, category, isActive, priority } = req.body;
        if (!name || !content) {
            return res.status(400).json({ success: false, error: 'name y content son obligatorios' });
        }
        const item = await guideRulesService.create({ name, content, category, isActive, priority });
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        console.error('Error creating guide rule:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/guide-rules/reorder — reorder guide rules
router.put('/reorder', async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, error: 'orderedIds debe ser un array de strings' });
        }
        const success = await guideRulesService.reorder(orderedIds);
        if (!success) {
            return res.status(500).json({ success: false, error: 'Error al reordenar las reglas de guía' });
        }
        res.json({ success: true, message: 'Reglas de guía reordenadas correctamente' });
    } catch (error) {
        console.error('Error reordering guide rules:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/guide-rules/:id — update a guide rule
router.put('/:id', async (req, res) => {
    try {
        const { name, content, category, isActive, priority } = req.body;
        const updated = await guideRulesService.update(req.params.id, { name, content, category, isActive, priority });
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Regla de guía no encontrada' });
        }
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error(`Error updating guide rule ${req.params.id}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/guide-rules/:id — delete a guide rule
router.delete('/:id', async (req, res) => {
    try {
        const removed = await guideRulesService.delete(req.params.id);
        if (!removed) {
            return res.status(404).json({ success: false, error: 'Regla de guía no encontrada' });
        }
        res.json({ success: true, message: 'Regla de guía eliminada' });
    } catch (error) {
        console.error(`Error deleting guide rule ${req.params.id}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
