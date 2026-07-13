const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const welcomeService = require('../services/welcomeAutomation.service');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// ── Multer: store audio temp file, validate .ogg ─────────────────────────────
const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = path.join(__dirname, '../../public/uploads');
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, 'welcome-audio-temp.ogg');
    }
});

const uploadAudio = multer({
    storage: audioStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['audio/ogg', 'audio/oga', 'application/ogg', 'audio/opus'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(file.mimetype) || ext === '.ogg') {
            return cb(null, true);
        }
        cb(new Error('Solo se aceptan archivos .ogg'));
    }
});

// ── Multer: store video temp file, validate .mp4 ─────────────────────────────
const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = path.join(__dirname, '../../public/uploads');
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, 'welcome-video-temp.mp4');
    }
});

const uploadVideo = multer({
    storage: videoStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'video/mpeg'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(file.mimetype) || ext === '.mp4') {
            return cb(null, true);
        }
        cb(new Error('Solo se aceptan archivos .mp4'));
    }
});

// ── GET /api/welcome-automation/config ─────────────────────────────────────
router.get('/config', async (req, res) => {
    try {
        const config = await welcomeService.getConfig();
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('Error fetching welcome config:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── PUT /api/welcome-automation/config ─────────────────────────────────────
router.put('/config', async (req, res) => {
    try {
        const { isEnabled, messageText, cooldownHours, videoEnabled, greetMode, campaignContextHours } = req.body;
        const updated = await welcomeService.saveConfig({
            ...(isEnabled !== undefined && { isEnabled: Boolean(isEnabled) }),
            ...(messageText !== undefined && { messageText: String(messageText) }),
            ...(cooldownHours !== undefined && { cooldownHours: Number(cooldownHours) }),
            ...(videoEnabled !== undefined && { videoEnabled: Boolean(videoEnabled) }),
            ...(greetMode !== undefined && { greetMode: String(greetMode) }),
            ...(campaignContextHours !== undefined && { campaignContextHours: Number(campaignContextHours) })
        });
        console.log(`⚙️ Welcome config updated: enabled=${updated.isEnabled}, cooldown=${updated.cooldownHours}h, campaignCtx=${updated.campaignContextHours || 24}h, greetMode=${updated.greetMode}`);
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Error updating welcome config:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/welcome-automation/reset-config ──────────────────────────────
// Reset all config to factory defaults
router.post('/reset-config', async (req, res) => {
    try {
        const config = await welcomeService.resetConfig();
        res.json({ success: true, data: config, message: 'Configuración reseteada a valores por defecto' });
    } catch (error) {
        console.error('Error resetting config:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/welcome-automation/audio  (upload .ogg) ──────────────────────
router.post('/audio', uploadAudio.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se recibió archivo de audio' });
        }
        const savedPath = await welcomeService.saveAudioFile(req.file.path);
        console.log(`🎙️ Welcome audio uploaded: ${savedPath}`);
        res.json({ success: true, message: 'Audio guardado correctamente', path: savedPath });
    } catch (error) {
        console.error('Error saving audio:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── DELETE /api/welcome-automation/audio ───────────────────────────────────
router.delete('/audio', async (req, res) => {
    try {
        await welcomeService.deleteAudio();
        res.json({ success: true, message: 'Audio eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting audio:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/welcome-automation/video  (upload .mp4) ──────────────────────
router.post('/video', uploadVideo.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se recibió archivo de video' });
        }
        const savedPath = await welcomeService.saveVideoFile(req.file.path);
        console.log(`🎬 Welcome video uploaded: ${savedPath}`);
        res.json({ success: true, message: 'Video guardado correctamente', path: savedPath });
    } catch (error) {
        console.error('Error saving video:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── DELETE /api/welcome-automation/video ───────────────────────────────────
router.delete('/video', async (req, res) => {
    try {
        await welcomeService.deleteVideo();
        res.json({ success: true, message: 'Video eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting video:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});



// ── GET /api/welcome-automation/stats ──────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const stats = await welcomeService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching welcome stats:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── GET /api/welcome-automation/users ──────────────────────────────────────
// Returns enriched user list for the dashboard
router.get('/users', async (req, res) => {
    try {
        const users = await welcomeService.getUsersForDashboard();
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Error fetching welcome users:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── PUT /api/welcome-automation/users/:jid/ai ──────────────────────────────
// Toggle AI for a specific user
router.put('/users/:jid/ai', async (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        const { enabled } = req.body;
        if (enabled === undefined) {
            return res.status(400).json({ success: false, error: 'enabled es obligatorio' });
        }
        const state = await welcomeService.setUserAI(jid, enabled);
        res.json({ success: true, data: state });
    } catch (error) {
        console.error('Error toggling user AI:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── PUT /api/welcome-automation/users/:jid/cooldown ────────────────────────
// Toggle cooldown for a specific user
router.put('/users/:jid/cooldown', async (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        const { enabled } = req.body;
        if (enabled === undefined) {
            return res.status(400).json({ success: false, error: 'enabled es obligatorio' });
        }
        const state = await welcomeService.setUserCooldown(jid, enabled);
        res.json({ success: true, data: state });
    } catch (error) {
        console.error('Error toggling user cooldown:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/welcome-automation/reset-user ────────────────────────────────
// Manually reset a JID welcome state (useful for testing)
router.post('/reset-user', async (req, res) => {
    try {
        const { jid } = req.body;
        if (!jid) return res.status(400).json({ success: false, error: 'jid es obligatorio' });
        await welcomeService.resetUserState(jid);
        res.json({ success: true, message: `Estado reseteado para ${jid}` });
    } catch (error) {
        console.error('Error resetting user state:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle multer errors
router.use((err, req, res, next) => {
    if (err.name === 'MulterError' || err.message) {
        return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
});

module.exports = router;
