const express = require('express');
const router = express.Router();
const aiProvidersService = require('../services/aiProviders.service');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes are protected
router.use(verifyToken);

// ── Static routes FIRST (before :id params) ────────────────────────

// GET /api/ai-providers - List all providers (masked keys)
router.get('/', async (req, res) => {
    try {
        const providers = await aiProvidersService.getProviders();
        res.json({ success: true, providers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/ai-providers - Create or update provider
router.post('/', async (req, res) => {
    try {
        const { id, name, apiKey } = req.body;
        if (!name || (!id && !apiKey)) {
            return res.status(400).json({ success: false, message: 'Nombre y API Key son requeridos' });
        }
        const providers = await aiProvidersService.saveProvider({ id, name, apiKey });
        res.json({ success: true, message: 'Proveedor guardado correctamente', providers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/ai-providers/usage-logs - Get all usage logs
// MUST be before /:id routes to avoid matching "usage-logs" as an ID
router.get('/usage-logs', async (req, res) => {
    try {
        const logs = await aiProvidersService.getUsageLogs(req.query.providerId);
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/ai-providers/reorder - Reorder the provider queue
// MUST be before /:id routes to avoid matching "reorder" as an ID
router.put('/reorder', async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!orderedIds || !Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, message: 'orderedIds array is required' });
        }
        const providers = await aiProvidersService.reorderQueue(orderedIds);
        res.json({ success: true, message: 'Cola reordenada', providers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── Parameterized routes (:id) ─────────────────────────────────────

// DELETE /api/ai-providers/:id - Delete provider
router.delete('/:id', async (req, res) => {
    try {
        console.log(`🗑️ [Route] DELETE /api/ai-providers/${req.params.id}`);
        const providers = await aiProvidersService.deleteProvider(req.params.id);
        console.log(`🗑️ [Route] Delete successful, ${providers.length} providers remaining`);
        res.json({ success: true, message: 'Proveedor eliminado', providers });
    } catch (error) {
        console.error(`❌ [Route] Delete error:`, error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/ai-providers/:id/activate - Set as active
router.put('/:id/activate', async (req, res) => {
    try {
        const providers = await aiProvidersService.setActive(req.params.id);
        res.json({ success: true, message: 'Proveedor activado', providers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/ai-providers/:id/exhaust - Mark provider as exhausted
router.post('/:id/exhaust', async (req, res) => {
    try {
        const reason = req.body.reason || 'Manually exhausted by admin';
        const result = await aiProvidersService.markExhausted(req.params.id, reason);
        res.json({
            success: true,
            message: 'Proveedor marcado como agotado',
            providers: result.providers,
            nextActive: result.nextActive
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/ai-providers/:id/reactivate - Reactivate an exhausted provider
router.post('/:id/reactivate', async (req, res) => {
    try {
        const providers = await aiProvidersService.reactivateProvider(req.params.id);
        res.json({ success: true, message: 'Proveedor reactivado', providers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/ai-providers/:id/test - Test connection
router.post('/:id/test', async (req, res) => {
    try {
        const ok = await aiProvidersService.testConnection(req.params.id);
        if (ok) {
            res.json({ success: true, message: 'Conexión exitosa' });
        } else {
            res.status(400).json({ success: false, message: 'Error de conexión. Verifica la API Key.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
