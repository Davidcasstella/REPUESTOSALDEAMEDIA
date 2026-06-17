/**
 * ContactsService — DynamoDB Version
 *
 * Manages contact lists and segments for mass campaigns.
 *
 * Table: chatwifi-contacts
 * Table: chatwifi-contact-lists (segments/groups)
 */

const crypto = require('crypto');
const { putItem, getItem, scanItems, deleteItem, updateItem, batchPutItems } = require('../config/dynamodb');

const TABLE_CONTACTS = 'contacts';
const TABLE_LISTS = 'contact-lists';

class ContactsService {

    // ── Contact CRUD ──

    /**
     * Create a single contact.
     */
    async createContact(data) {
        const phone = data.phone.replace(/\D/g, '');
        if (phone.length < 10) throw new Error('Número de teléfono inválido');

        const contact = {
            id: crypto.randomUUID(),
            phone,
            name: data.name || phone,
            email: data.email || null,
            company: data.company || null,
            tags: data.tags || [],
            listIds: data.listIds || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await putItem(TABLE_CONTACTS, contact);
        return contact;
    }

    /**
     * Get all contacts sorted by name.
     */
    async listContacts() {
        const items = await scanItems(TABLE_CONTACTS);
        return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    /**
     * Get specific contacts by array of IDs.
     */
    async getContactsByIds(ids) {
        if (!ids || ids.length === 0) return [];
        const all = await scanItems(TABLE_CONTACTS);
        return all.filter(c => ids.includes(c.id));
    }

    /**
     * Get a single contact by ID.
     */
    async getContact(id) {
        return await getItem(TABLE_CONTACTS, { id });
    }

    /**
     * Update contact fields.
     */
    async updateContact(id, updates) {
        updates.updatedAt = new Date().toISOString();
        return await updateItem(TABLE_CONTACTS, { id }, updates);
    }

    /**
     * Delete a contact.
     */
    async deleteContact(id) {
        await deleteItem(TABLE_CONTACTS, { id });
        return true;
    }

    /**
     * Bulk import contacts from a parsed JSON array.
     * Skips duplicates by phone number.
     * @param {Array<{phone, name, email, company}>} contacts
     * @returns {{ created: number, skipped: number }}
     */
    async importContacts(contacts) {
        const existing = await scanItems(TABLE_CONTACTS);
        const existingPhones = new Set(existing.map(c => c.phone));

        const toCreate = [];
        let skipped = 0;

        for (const row of contacts) {
            const phone = (row.phone || row.telefono || row.numero || '').toString().replace(/\D/g, '');
            if (!phone || phone.length < 10) { skipped++; continue; }
            if (existingPhones.has(phone)) { skipped++; continue; }

            toCreate.push({
                id: crypto.randomUUID(),
                phone,
                name: row.name || row.nombre || row.Nombre || phone,
                email: row.email || row.correo || null,
                company: row.company || row.empresa || null,
                tags: [],
                listIds: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        if (toCreate.length > 0) {
            await batchPutItems(TABLE_CONTACTS, toCreate);
        }

        return { created: toCreate.length, skipped };
    }

    // ── Contact Lists / Segments ──

    /**
     * Create a contact list/segment.
     */
    async createList(data) {
        const list = {
            id: crypto.randomUUID(),
            name: data.name || 'Sin nombre',
            description: data.description || '',
            contactIds: data.contactIds || [],
            createdAt: new Date().toISOString()
        };

        await putItem(TABLE_LISTS, list);
        return list;
    }

    /**
     * Get all contact lists.
     */
    async listContactLists() {
        const items = await scanItems(TABLE_LISTS);
        return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    /**
     * Add contacts to a list.
     */
    async addContactsToList(listId, contactIds) {
        const list = await getItem(TABLE_LISTS, { id: listId });
        if (!list) throw new Error('Lista no encontrada');

        const merged = [...new Set([...list.contactIds, ...contactIds])];
        return await updateItem(TABLE_LISTS, { id: listId }, { contactIds: merged });
    }

    /**
     * Delete a contact list.
     */
    async deleteList(id) {
        await deleteItem(TABLE_LISTS, { id });
        return true;
    }
}

module.exports = new ContactsService();
