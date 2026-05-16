/**
 * Demand Analytics Routes
 * 
 * API endpoints for the analytics dashboard.
 * All endpoints require authentication via verifyToken.
 * 
 * Endpoints:
 *   GET /api/demand-analytics/top-products?month=YYYY-MM  — Top 10 products
 *   GET /api/demand-analytics/top-references?month=YYYY-MM — Top 10 references
 *   GET /api/demand-analytics/summary?month=YYYY-MM       — Summary stats
 *   GET /api/demand-analytics/trend?days=14                — Daily trend
 *   GET /api/demand-analytics/months                       — Available months
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const demandAnalyticsService = require('../services/demandAnalytics.service');

// All routes require authentication
router.use(verifyToken);

/**
 * GET /api/demand-analytics/top-products?month=YYYY-MM&limit=10
 */
router.get('/top-products', async (req, res) => {
    try {
        const { month, limit } = req.query;
        const data = await demandAnalyticsService.getTopProducts(month, parseInt(limit, 10) || 10);
        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ Error fetching top products:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching top products' });
    }
});

/**
 * GET /api/demand-analytics/top-references?month=YYYY-MM&limit=10
 */
router.get('/top-references', async (req, res) => {
    try {
        const { month, limit } = req.query;
        const data = await demandAnalyticsService.getTopReferences(month, parseInt(limit, 10) || 10);
        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ Error fetching top references:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching top references' });
    }
});

/**
 * GET /api/demand-analytics/summary?month=YYYY-MM
 */
router.get('/summary', async (req, res) => {
    try {
        const { month } = req.query;
        const data = await demandAnalyticsService.getSummary(month);
        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ Error fetching analytics summary:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching analytics summary' });
    }
});

/**
 * GET /api/demand-analytics/trend?days=14
 */
router.get('/trend', async (req, res) => {
    try {
        const { days } = req.query;
        const data = await demandAnalyticsService.getDailyTrend(parseInt(days, 10) || 14);
        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ Error fetching trend data:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching trend data' });
    }
});

/**
 * GET /api/demand-analytics/months
 */
router.get('/months', async (req, res) => {
    try {
        const data = await demandAnalyticsService.getAvailableMonths();
        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ Error fetching available months:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching available months' });
    }
});

module.exports = router;
