/**
 * Product Catalog Routes
 * 
 * REST API for uploading PDF catalogs, managing products,
 * and searching the product database.
 * 
 * Catalog uploads are processed asynchronously via ETL Jobs.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { verifyToken } = require('../middleware/auth.middleware');
const pdfCatalogParser = require('../services/pdfCatalogParser.service');
const productCatalog = require('../services/productCatalog.service');
const etlJobService = require('../services/etlJob.service');

const router = express.Router();

// Temp directory for catalog files during ETL processing
const TEMP_DIR = path.join(__dirname, '../../data/temp-catalogs');
fs.ensureDirSync(TEMP_DIR);

// Multer config for PDF uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max for large catalogs
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for catalog processing'));
        }
    }
});

/**
 * POST /api/product-catalog/upload
 * Upload a PDF catalog file and start asynchronous ETL processing.
 * Returns immediately with a jobId for progress tracking.
 */
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No PDF file provided' });
        }

        const parserType = req.body.parserType || 'bdc';
        const stageId = req.body.stageId || 'stage_general';
        const validParsers = ['bdc', 'generic'];
        if (!validParsers.includes(parserType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid parser type. Use: ${validParsers.join(', ')}`
            });
        }

        console.log(`📋 Catalog upload received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB, parser: ${parserType})`);

        // Save buffer to temp file for async processing
        const tempFileName = `catalog_${Date.now()}_${req.file.originalname}`;
        const tempPath = path.join(TEMP_DIR, tempFileName);
        await fs.writeFile(tempPath, req.file.buffer);

        // Create ETL job — pass stageId so products are tagged on load
        const job = await etlJobService.createJob(
            req.file.originalname,
            req.file.size,
            tempPath,
            parserType,
            stageId
        );

        // Start processing in background (don't await)
        etlJobService.runJob(job.jobId).catch(err => {
            console.error(`❌ ETL Job ${job.jobId} background error:`, err.message);
        });

        // Return immediately with 202 Accepted
        res.status(202).json({
            success: true,
            message: 'Catalog upload received. Processing started.',
            jobId: job.jobId,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            parserType,
        });
    } catch (error) {
        console.error('❌ Catalog upload error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/product-catalog/jobs
 * List recent ETL jobs with their status, filtered by stage.
 */
router.get('/jobs', verifyToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        // Filter by stageId so each stage only sees its own catalog history
        const stageId = req.query.stageId || null;
        const jobs = await etlJobService.listJobs(limit, stageId);
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/product-catalog/jobs/:id
 * Get the status of a specific ETL job.
 */
router.get('/jobs/:id', verifyToken, async (req, res) => {
    try {
        const job = await etlJobService.getJob(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        res.json({ success: true, job });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/product-catalog/jobs/:id
 * Remove a specific ETL job record AND cascade-delete all products that came from it.
 */
router.delete('/jobs/:id', verifyToken, async (req, res) => {
    try {
        // Get job info before deleting so we know which products to remove
        const job = await etlJobService.getJob(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        // Cascade: delete all DynamoDB products associated with this catalog file
        const deletedProducts = await productCatalog.deleteBySource(job.fileName, job.stageId || null);
        console.log(`🗑️ Cascade deleted ${deletedProducts} products from catalog "${job.fileName}"`);

        // Delete the ETL job record itself
        await etlJobService.deleteJob(req.params.id);

        res.json({
            success: true,
            message: `Job record deleted. ${deletedProducts} products removed from catalog.`,
            deletedProducts,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/product-catalog/parsers
 * List available parser types for the UI selector.
 */
router.get('/parsers', verifyToken, async (req, res) => {
    try {
        const parsers = pdfCatalogParser.getAvailableParsers();
        res.json({ success: true, parsers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/product-catalog/products
 * List all products with pagination and optional brand filter.
 */
router.get('/products', verifyToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const marca = req.query.marca || null;
        // Filter by stageId so each stage sees only its own products
        const stageId = req.query.stageId || null;

        const result = await productCatalog.getAll(page, limit, marca, stageId);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/product-catalog/search?q=<query>
 * Search products by reference, code, or description.
 */
router.get('/search', verifyToken, async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
        }
        // Optional stage filter for isolated product search
        const stageId = req.query.stageId || null;

        const results = await productCatalog.search(query.trim(), stageId);
        res.json({
            success: true,
            query: query.trim(),
            count: results.length,
            products: results,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/product-catalog/stats
 * Get catalog statistics scoped to a stage (optional ?stageId= param).
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        // Scope stats to the active stage when provided
        const stageId = req.query.stageId || null;
        const stats = await productCatalog.getStats(stageId);
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/product-catalog/products
 * Clear all products from the catalog.
 * Optional query param: ?stageId= to restrict deletion to a specific stage.
 */
router.delete('/products', verifyToken, async (req, res) => {
    try {
        // If stageId is provided, only clear products for that stage
        const stageId = req.query.stageId || null;
        const deleted = await productCatalog.clearAll(stageId);
        res.json({ success: true, message: `${deleted} products removed`, deleted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/product-catalog/pricing-config
 * Get the current pricing configuration (margin, chatbot, IVA percentages).
 */
router.get('/pricing-config', verifyToken, async (req, res) => {
    try {
        const pricingConfig = require('../config/pricingConfig');
        res.json({
            success: true,
            config: {
                margin_percent: pricingConfig.MARGIN_PERCENT,
                chatbot_percent: pricingConfig.CHATBOT_PERCENT,
                iva_percent: pricingConfig.IVA_PERCENT,
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
