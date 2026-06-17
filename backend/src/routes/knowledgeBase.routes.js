const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const knowledgeBaseService = require('../services/knowledgeBase.service');
const stagesService = require('../services/stages.service');

const router = express.Router();

// Configure multer for memory storage (we handle file saving ourselves)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.txt'];
        const ext = file.originalname.toLowerCase().match(/\.[^.]+$/);
        if (ext && allowed.includes(ext[0])) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and TXT files are allowed'));
        }
    }
});

// ═══════════════════════════════════════════════════════════
// STAGES — manage knowledge periods
// ═══════════════════════════════════════════════════════════

// List all stages
router.get('/stages', verifyToken, async (req, res) => {
    try {
        const stages = await stagesService.getAll();
        res.json({ success: true, stages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create a new stage
router.post('/stages', verifyToken, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Stage name is required' });
        }
        const stage = await stagesService.create(name);
        res.json({ success: true, stage });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Update stage (rename and/or toggle active)
router.patch('/stages/:id', verifyToken, async (req, res) => {
    try {
        const { active, name } = req.body;
        const stage = await stagesService.update(req.params.id, { active, name });
        if (!stage) {
            return res.status(404).json({ success: false, message: 'Stage not found' });
        }
        res.json({ success: true, stage });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Delete a stage
router.delete('/stages/:id', verifyToken, async (req, res) => {
    try {
        await stagesService.delete(req.params.id);
        res.json({ success: true, message: 'Stage deleted, data moved to General' });
    } catch (error) {
        const status = error.message.includes('no encontrada') ? 404 : 400;
        res.status(status).json({ success: false, message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════
// DOCUMENTS — upload / list / reprocess / delete
// ═══════════════════════════════════════════════════════════

// Upload a document
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        const stageId = req.body.stageId || 'stage_general';
        const doc = await knowledgeBaseService.uploadAndProcess(req.file, stageId);
        res.json({
            success: true,
            message: 'Document uploaded and processing started',
            document: doc
        });
    } catch (error) {
        console.error('❌ Upload error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// List all documents (optionally filtered by stageId)
router.get('/documents', verifyToken, async (req, res) => {
    try {
        const stageId = req.query.stageId || null;
        const documents = await knowledgeBaseService.getDocuments(stageId);
        res.json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Download a document
router.get('/documents/:id/download', verifyToken, async (req, res) => {
    try {
        const fileStorage = require('../services/fileStorage');
        const index = await fileStorage.getIndex();
        const doc = index.find(d => d.id === req.params.id);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        const filePath = await fileStorage.getDocumentPath(req.params.id);
        if (!filePath) {
            return res.status(404).json({ success: false, message: 'Document file not found' });
        }
        res.download(filePath, doc.name);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reprocess a document
router.post('/documents/:id/reprocess', verifyToken, async (req, res) => {
    try {
        await knowledgeBaseService.reprocessDocument(req.params.id);
        res.json({ success: true, message: 'Reprocessing started' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete a document
router.delete('/documents/:id', verifyToken, async (req, res) => {
    try {
        await knowledgeBaseService.deleteDocument(req.params.id);
        res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Search knowledge base — returns actual chatbot answer
router.post('/search', verifyToken, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ success: false, message: 'Query is required' });
        }

        // Get the actual chatbot response (goes through RAG + AI provider)
        const aiResponseService = require('../services/aiResponse.service');
        const answer = await aiResponseService.generateResponse(query);

        // Also check if the query matches a product in the catalog
        // to provide price breakdown for the admin panel
        let priceBreakdown = null;
        try {
            const productCatalog = require('../services/productCatalog.service');
            const productResults = await productCatalog.search(query);
            if (productResults.length > 0) {
                priceBreakdown = productCatalog.getPriceBreakdown(productResults[0]);
                priceBreakdown.codigo = productResults[0].codigo;
                priceBreakdown.descripcion = productResults[0].descripcion;
                priceBreakdown.marca = productResults[0].marca;
            }
        } catch (catalogErr) {
            // Non-blocking: if catalog search fails, just skip breakdown
            console.warn('⚠️ Catalog search for breakdown failed:', catalogErr.message);
        }

        res.json({
            success: true,
            hasResults: true,
            context: answer,
            priceBreakdown
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════
// Q&A PAIRS — manual question/answer management
// ═══════════════════════════════════════════════════════════
const qaPairsService = require('../services/qaPairs.service');

// List all Q&A pairs (optionally filtered by stageId)
router.get('/qa-pairs', verifyToken, async (req, res) => {
    try {
        const stageId = req.query.stageId || null;
        const pairs = await qaPairsService.getAll(stageId);
        res.json({ success: true, pairs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create a new Q&A pair
router.post('/qa-pairs', verifyToken, async (req, res) => {
    try {
        const { question, answer, stageId } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ success: false, message: 'question and answer are required' });
        }
        const pair = await qaPairsService.create(question, answer, stageId);
        res.json({ success: true, pair });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update an existing Q&A pair
router.put('/qa-pairs/:id', verifyToken, async (req, res) => {
    try {
        const { question, answer } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ success: false, message: 'question and answer are required' });
        }
        const pair = await qaPairsService.update(req.params.id, question, answer);
        if (!pair) {
            return res.status(404).json({ success: false, message: 'Q&A pair not found' });
        }
        res.json({ success: true, pair });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete a Q&A pair
router.delete('/qa-pairs/:id', verifyToken, async (req, res) => {
    try {
        const deleted = await qaPairsService.delete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Q&A pair not found' });
        }
        res.json({ success: true, message: 'Q&A pair deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Re-vectorize all Q&A pairs (useful after switching AI providers)
router.post('/qa-pairs/reprocess', verifyToken, async (req, res) => {
    try {
        const count = await qaPairsService.reprocessAll();
        res.json({ success: true, message: `${count} Q&A pairs re-vectorized`, count });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════
// MANUAL KNOWLEDGE — free-form text knowledge management
// ═══════════════════════════════════════════════════════════
const manualKnowledgeService = require('../services/manualKnowledge.service');

// List all manual knowledge entries (optionally filtered by stageId)
router.get('/manual-knowledge', verifyToken, async (req, res) => {
    try {
        const stageId = req.query.stageId || null;
        const entries = await manualKnowledgeService.getAll(stageId);
        res.json({ success: true, entries });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create a new manual knowledge entry
router.post('/manual-knowledge', verifyToken, async (req, res) => {
    try {
        const { title, content, stageId } = req.body;
        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'title and content are required' });
        }
        const entry = await manualKnowledgeService.create(title, content, stageId);
        res.json({ success: true, entry });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Re-vectorize all manual knowledge entries (must be BEFORE /:id routes)
router.post('/manual-knowledge/reprocess', verifyToken, async (req, res) => {
    try {
        const count = await manualKnowledgeService.reprocessAll();
        res.json({ success: true, message: `${count} entries re-vectorized`, count });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update an existing manual knowledge entry
router.put('/manual-knowledge/:id', verifyToken, async (req, res) => {
    try {
        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'title and content are required' });
        }
        const entry = await manualKnowledgeService.update(req.params.id, title, content);
        if (!entry) {
            return res.status(404).json({ success: false, message: 'Manual knowledge entry not found' });
        }
        res.json({ success: true, entry });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete a manual knowledge entry
router.delete('/manual-knowledge/:id', verifyToken, async (req, res) => {
    try {
        const deleted = await manualKnowledgeService.delete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Manual knowledge entry not found' });
        }
        res.json({ success: true, message: 'Manual knowledge entry deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
