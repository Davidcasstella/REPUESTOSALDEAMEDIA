/**
 * Contacts Routes
 * Base: /api/contacts
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const contactsService = require('../services/contacts.service');

router.use(verifyToken);

// GET /api/contacts — list all contacts
router.get('/', async (req, res) => {
    try {
        const contacts = await contactsService.listContacts();
        res.json({ success: true, data: contacts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/contacts — create single contact
router.post('/', async (req, res) => {
    try {
        const contact = await contactsService.createContact(req.body);
        res.status(201).json({ success: true, data: contact });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// POST /api/contacts/import — bulk import from parsed JSON array
router.post('/import', async (req, res) => {
    try {
        const { contacts } = req.body;
        if (!Array.isArray(contacts)) {
            return res.status(400).json({ success: false, message: 'Se espera un array de contactos' });
        }
        const result = await contactsService.importContacts(contacts);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/contacts/:id — update contact
router.put('/:id', async (req, res) => {
    try {
        const updated = await contactsService.updateContact(req.params.id, req.body);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/contacts/:id — delete contact
router.delete('/:id', async (req, res) => {
    try {
        await contactsService.deleteContact(req.params.id);
        res.json({ success: true, message: 'Contacto eliminado' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/contacts/lists — get all contact lists
router.get('/lists', async (req, res) => {
    try {
        const lists = await contactsService.listContactLists();
        res.json({ success: true, data: lists });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/contacts/lists — create a contact list
router.post('/lists', async (req, res) => {
    try {
        const list = await contactsService.createList(req.body);
        res.status(201).json({ success: true, data: list });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// DELETE /api/contacts/lists/:id — delete a contact list
router.delete('/lists/:id', async (req, res) => {
    try {
        await contactsService.deleteList(req.params.id);
        res.json({ success: true, message: 'Lista eliminada' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
