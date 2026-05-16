const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const analyticsService = require('../services/analyticsService');
const tokenUsageService = require('../services/tokenUsageService');

/**
 * GET /api/analytics/overview
 * Returns unique client counts for today, this week, and this month with growth %.
 */
router.get('/overview', verifyToken, (req, res) => {
    try {
        const overview = analyticsService.getOverview();
        res.json({ success: true, data: overview });
    } catch (error) {
        console.error('❌ Error fetching analytics overview:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching analytics overview' });
    }
});

/**
 * GET /api/analytics/messages
 * Returns hourly and daily message activity charts data.
 */
router.get('/messages', verifyToken, (req, res) => {
    try {
        const activity = analyticsService.getActivity();
        res.json({ success: true, data: activity });
    } catch (error) {
        console.error('❌ Error fetching message activity:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching message activity' });
    }
});

/**
 * GET /api/analytics/token-usage
 * Returns token consumption stats and cost estimation.
 */
router.get('/token-usage', verifyToken, (req, res) => {
    try {
        const stats = tokenUsageService.getUsageStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('❌ Error fetching token usage:', error.message);
        res.status(500).json({ success: false, message: 'Error fetching token usage' });
    }
});

module.exports = router;
