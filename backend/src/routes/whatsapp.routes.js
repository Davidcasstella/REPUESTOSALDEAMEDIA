const express = require('express');
const router = express.Router();
const whatsapp = require('../core/WhatsApp');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes are protected
router.use(verifyToken);

// GET status
router.get('/status', (req, res) => {
    res.json(whatsapp.getStatus());
});

// POST restart
router.post('/restart', async (req, res) => {
    try {
        await whatsapp.restart();
        res.json({ success: true, message: 'Reiniciando conexión...' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al reiniciar', error: error.message });
    }
});

// POST clear session
router.post('/clear-session', async (req, res) => {
    try {
        await whatsapp.clearSession();
        res.json({ success: true, message: 'Sesión eliminada y reiniciando...' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al limpiar sesión', error: error.message });
    }
});

module.exports = router;
