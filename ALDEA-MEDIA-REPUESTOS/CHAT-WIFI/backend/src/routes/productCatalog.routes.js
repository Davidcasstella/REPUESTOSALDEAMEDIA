/**
 * Product Catalog Routes
 * 
 * REST API for uploading PDF catalogs, managing products,
 * and searching the product database.
 * 
 * All endpoints are NEW — they do NOT conflict with existing routes.
 */

const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const pdfCatalogParser = require('../services/pdfCatalogParser.service');
const productCatalog = require('../services/productCatalog.service');

const router = express.Router();

// Multer config for PDF uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for large catalogs
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
 * Upload and process a PDF catalog file.
 * Extracts products and saves them to the database.
 */
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No PDF file provided' });
        }

        console.log(`📋 Processing catalog: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

        // Step 1: Parse PDF → array of products
        const products = await pdfCatalogParser.parse(req.file.buffer, req.file.originalname);

        if (!products || products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No products could be extracted from the PDF. Ensure it follows the expected catalog format.'
            });
        }

        // Step 2: Save products to database
        const result = await productCatalog.saveProducts(products, req.file.originalname);

        res.json({
            success: true,
            message: `Catalog processed successfully: ${result.inserted} new, ${result.updated} updated`,
            data: {
                fileName: req.file.originalname,
                totalExtracted: products.length,
                inserted: result.inserted,
                updated: result.updated,
                errors: result.errors,
                sampleProducts: products.slice(0, 5), // Show first 5 as preview
            }
        });
    } catch (error) {
        console.error('❌ Catalog upload error:', error.message);
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

        const result = await productCatalog.getAll(page, limit, marca);
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

        const results = await productCatalog.search(query.trim());
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
 * Get catalog statistics (total products, brands, avg price).
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const stats = await productCatalog.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/product-catalog/products
 * Clear all products from the catalog.
 */
router.delete('/products', verifyToken, async (req, res) => {
    try {
        const deleted = await productCatalog.clearAll();
        res.json({ success: true, message: `${deleted} products removed`, deleted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
