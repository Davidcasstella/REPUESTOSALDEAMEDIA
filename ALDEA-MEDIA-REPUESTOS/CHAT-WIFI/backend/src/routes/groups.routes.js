/**
 * Groups Routes
 *
 * RESTful API for group category management.
 * Follows Interface Segregation: routes only handle HTTP concerns,
 * all business logic is delegated to GroupCategoriesService.
 *
 * Endpoints:
 *   GET    /api/groups/categories              — List all categories
 *   POST   /api/groups/categories              — Create a new category
 *   PUT    /api/groups/categories/:name         — Update category metadata
 *   DELETE /api/groups/categories/:name         — Delete a category
 *   GET    /api/groups/categories/:name/groups  — List groups in a category
 *   PUT    /api/groups/categories/:name/add     — Add group to category
 *   PUT    /api/groups/categories/:name/remove  — Remove group from category
 *   GET    /api/groups/map                      — Full group→categories lookup map
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const groupCategoriesService = require('../services/groupCategories.service');

// All routes require authentication
router.use(verifyToken);

// ── Category CRUD ──

/**
 * GET /api/groups/categories
 * Returns all categories with their metadata and group lists.
 */
router.get('/categories', async (req, res) => {
    try {
        const categories = await groupCategoriesService.getAllCategories();
        res.json({ success: true, data: categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/groups/categories
 * Creates a new category.
 * Body: { name: string, label: string, color?: string }
 */
router.post('/categories', async (req, res) => {
    try {
        const { name, label, color } = req.body;
        if (!name || !label) {
            return res.status(400).json({ success: false, message: 'name and label are required' });
        }
        const category = await groupCategoriesService.createCategory(name, label, color);
        res.json({ success: true, data: category });
    } catch (error) {
        const status = error.message.includes('already exists') ? 409 : 500;
        res.status(status).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/groups/categories/:name
 * Updates category metadata (label, color).
 * Body: { label?: string, color?: string }
 */
router.put('/categories/:name', async (req, res) => {
    try {
        const { label, color } = req.body;
        const updated = await groupCategoriesService.updateCategory(req.params.name, { label, color });
        res.json({ success: true, data: updated });
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/groups/categories/:name
 * Deletes an entire category.
 */
router.delete('/categories/:name', async (req, res) => {
    try {
        const deleted = await groupCategoriesService.deleteCategory(req.params.name);
        if (deleted) {
            res.json({ success: true, message: 'Category deleted' });
        } else {
            res.status(404).json({ success: false, message: 'Category not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── Group ↔ Category Operations ──

/**
 * GET /api/groups/categories/:name/groups
 * Returns all group JIDs in a specific category.
 */
router.get('/categories/:name/groups', async (req, res) => {
    try {
        const groups = await groupCategoriesService.getGroupsInCategory(req.params.name);
        res.json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/groups/categories/:name/add
 * Adds a group to a category.
 * Body: { jid: string }
 */
router.put('/categories/:name/add', async (req, res) => {
    try {
        const { jid } = req.body;
        if (!jid) {
            return res.status(400).json({ success: false, message: 'jid is required' });
        }
        const added = await groupCategoriesService.addGroupToCategory(req.params.name, jid);
        res.json({ success: true, added });
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/groups/categories/:name/remove
 * Removes a group from a category.
 * Body: { jid: string }
 */
router.put('/categories/:name/remove', async (req, res) => {
    try {
        const { jid } = req.body;
        if (!jid) {
            return res.status(400).json({ success: false, message: 'jid is required' });
        }
        const removed = await groupCategoriesService.removeGroupFromCategory(req.params.name, jid);
        res.json({ success: true, removed });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── Utility ──

/**
 * GET /api/groups/map
 * Returns a full lookup map: { jid → [categoryName, ...] }
 * Used by the frontend to show category badges without N+1 queries.
 */
router.get('/map', async (req, res) => {
    try {
        const map = await groupCategoriesService.buildGroupCategoryMap();
        res.json({ success: true, data: map });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── Dependencies injected from app.js ──
let _whatsapp = null;
let _chatHistoryService = null;

/**
 * Inject runtime dependencies (WhatsApp core + chatHistory service).
 * Called once from app.js after all services are loaded.
 */
router.setDependencies = (whatsapp, chatHistoryService) => {
    _whatsapp = whatsapp;
    _chatHistoryService = chatHistoryService;
};

/**
 * POST /api/groups/sync
 * Fetches ALL groups from WhatsApp (via Baileys) and saves their metadata
 * to chat-history so they appear immediately in the dashboard.
 * This is a one-time "import" — future messages are saved automatically.
 */
router.post('/sync', async (req, res) => {
    try {
        if (!_whatsapp || !_whatsapp.sock) {
            return res.status(503).json({ success: false, message: 'WhatsApp not connected' });
        }
        if (!_chatHistoryService) {
            return res.status(503).json({ success: false, message: 'Chat history service not available' });
        }

        // Fetch all groups from WhatsApp
        const groups = await _whatsapp.sock.groupFetchAllParticipating();
        const groupEntries = Object.values(groups);

        let synced = 0;
        for (const group of groupEntries) {
            const jid = group.id; // e.g. "120363123456789@g.us"
            const name = group.subject || jid.replace('@g.us', '');

            try {
                // Force-update the group name in chat-history (direct write)
                await _chatHistoryService.ensureGroupEntry(jid, name);
                synced++;
            } catch (_) { }
        }

        res.json({
            success: true,
            message: `Synced ${synced} groups from WhatsApp`,
            totalGroups: groupEntries.length,
            synced
        });
    } catch (error) {
        console.error('Error syncing groups:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;

