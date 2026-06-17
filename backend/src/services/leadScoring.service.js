/**
 * LeadScoringService — AI-powered lead classification
 *
 * Detects purchase intent from incoming WhatsApp messages and
 * classifies leads as: cold (frio), warm (tibio), or hot (caliente).
 *
 * Table: chatwifi-leads
 * Table: chatwifi-lead-notifications (notification history)
 */

const crypto = require('crypto');
const { putItem, getItem, scanItems, updateItem, deleteItem } = require('../config/dynamodb');

const TABLE_LEADS = 'leads';
const TABLE_NOTIF_HISTORY = 'lead-notifications';

// Keywords that signal purchase intent at different temperatures
const HOT_PATTERNS = [
    /precio/i, /cuanto cuesta/i, /cuánto cuesta/i, /cuanto vale/i, /cuánto vale/i,
    /precio?/i, /cuanto es/i, /cuánto es/i, /como pago/i, /cómo pago/i,
    /quiero comprar/i, /deseo comprar/i, /me interesa comprar/i,
    /pagar/i, /pago/i, /consignar/i, /transferir/i,
    /me lo venden/i, /me lo llevan/i, /lo quiero/i,
    /asesor/i, /vendedor/i, /agente/i, /hablar con alguien/i,
    /disponible/i, /tienen en stock/i, /lo tienen/i,
    /nequi/i, /daviplata/i, /efecty/i, /envío/i, /envio/i,
    /pedido/i, /hacer un pedido/i, /me lo envían/i
];

const WARM_PATTERNS = [
    /información/i, /informacion/i, /info/i,
    /detalles/i, /más información/i, /mas información/i,
    /como funciona/i, /cómo funciona/i,
    /qué incluye/i, /que incluye/i,
    /disponibilidad/i, /tienen/i, /venden/i,
    /garantía/i, /garantia/i, /tiempo de entrega/i,
    /envíos a/i, /envios a/i, /hacen envíos/i,
    /quisiera saber/i, /quiero saber/i, /me explica/i
];

class LeadScoringService {

    /**
     * Analyze a message and classify the lead temperature.
     * Updates or creates the lead entry in DynamoDB.
     * @param {string} jid - WhatsApp JID
     * @param {string} message - The incoming message text
     * @param {string} [pushName] - Contact display name
     * @param {string} [campaignId] - Campaign that triggered the conversation
     * @returns {Promise<{score: string, lead: Object}|null>}
     */
    async analyzeAndScore(jid, message, pushName, campaignId) {
        if (!message || !jid) return null;

        try {
            const phone = jid.replace('@s.whatsapp.net', '');
            const now = new Date().toISOString();

            // Check if lead already exists
            const existing = await this._findLeadByJid(jid);

            // Call AI extraction dynamically to avoid circular dependencies
            const aiResponseService = require('./aiResponse.service');
            const aiData = await aiResponseService.analyzeLead(message, jid);

            // Fallbacks if AI analysis fails
            let score = aiData?.score || this._detectScore(message) || 'frio';
            let interestProduct = aiData?.interestProduct || null;
            let industry = aiData?.industry || null;
            let quantity = aiData?.quantity || null;
            let dimensions = aiData?.dimensions || null;
            let location = aiData?.location || null;
            let company = aiData?.company || null;
            let urgency = aiData?.urgency || 'bajo';
            let commercialIntents = aiData?.commercialIntents || [];
            let priority = aiData?.priority || false;
            let humanEscalation = aiData?.humanEscalation || false;

            // Extra Rule: A lead is caliente if they ask for price, cotizacion, availability, delivery times, payment terms, or request human attention
            const hotIntents = ['precio', 'cotizacion', 'contacto_humano', 'urgente'];
            const lowerMsg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const hasHotKeywords = /disponibilidad|tiempo de entrega|formas? de pago|metodos? de pago|entrega|stock/i.test(lowerMsg);
            
            if (commercialIntents.some(intent => hotIntents.includes(intent)) || hasHotKeywords) {
                score = 'caliente';
                priority = true;
                humanEscalation = true;
            }

            let lead;
            if (existing) {
                // Merge data to preserve already extracted fields if new ones are null
                const updatedScore = this._upgradeScore(existing.score, score);
                const updatedPriority = existing.priority || priority;

                const updates = {
                    score: updatedScore,
                    lastMessage: message,
                    lastActivityAt: now,
                    campaignId: campaignId || existing.campaignId,
                    pushName: pushName || existing.pushName,
                    messageCount: (existing.messageCount || 0) + 1,
                    interestProduct: interestProduct || existing.interestProduct || null,
                    industry: industry || existing.industry || null,
                    quantity: quantity || existing.quantity || null,
                    dimensions: dimensions || existing.dimensions || null,
                    location: location || existing.location || null,
                    company: company || existing.company || null,
                    urgency: urgency !== 'bajo' ? urgency : (existing.urgency || 'bajo'),
                    commercialIntents: [...new Set([...(existing.commercialIntents || []), ...commercialIntents])],
                    priority: updatedPriority
                };

                lead = await updateItem(TABLE_LEADS, { id: existing.id }, updates);
                lead = { ...existing, ...lead };
            } else {
                lead = {
                    id: crypto.randomUUID(),
                    jid,
                    phone,
                    pushName: pushName || phone,
                    score, // 'frio' | 'tibio' | 'caliente'
                    status: 'nuevo', // nuevo | contactado | cerrado
                    lastMessage: message,
                    campaignId: campaignId || null,
                    messageCount: 1,
                    createdAt: now,
                    lastActivityAt: now,
                    notified: false,
                    interestProduct,
                    industry,
                    quantity,
                    dimensions,
                    location,
                    company,
                    urgency,
                    commercialIntents,
                    priority
                };
                await putItem(TABLE_LEADS, lead);
            }

            // Pauses AI for hot leads or human escalation
            if (humanEscalation || priority || score === 'caliente') {
                console.log(`🚨 Hot lead or human escalation requested for ${jid}. Disabling AI to allow agent takeover.`);
                const welcomeAutomationService = require('./welcomeAutomation.service');
                await welcomeAutomationService.disableUserAI(jid);
                
                const aiFallbackService = require('./aiFallback.service');
                await aiFallbackService.registerPending(jid, message);
            }

            console.log(`🎯 Lead scored [${score}] for ${jid}: interestProduct="${interestProduct}", priority=${priority}`);
            return { score, lead };

        } catch (err) {
            console.error(`❌ Lead scoring failed for ${jid}: ${err.message}`);
            return null;
        }
    }

    /**
     * Get all leads with optional filters.
     */
    async listLeads(filters = {}) {
        const all = await scanItems(TABLE_LEADS);

        let results = all;

        if (filters.score) {
            results = results.filter(l => l.score === filters.score);
        }
        if (filters.status) {
            results = results.filter(l => l.status === filters.status);
        }
        if (filters.campaignId) {
            results = results.filter(l => l.campaignId === filters.campaignId);
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            results = results.filter(l =>
                (l.pushName || '').toLowerCase().includes(q) ||
                (l.phone || '').includes(q)
            );
        }

        return results.sort((a, b) =>
            new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
        );
    }

    /**
     * Get a single lead by ID.
     */
    async getLead(id) {
        return await getItem(TABLE_LEADS, { id });
    }

    /**
     * Update lead status.
     */
    async updateLeadStatus(id, status) {
        return await updateItem(TABLE_LEADS, { id }, {
            status,
            updatedAt: new Date().toISOString()
        });
    }

    /**
     * Mark lead as notified.
     */
    async markNotified(id) {
        return await updateItem(TABLE_LEADS, { id }, { notified: true });
    }

    /**
     * Get global lead stats.
     */
    async getStats() {
        const all = await scanItems(TABLE_LEADS);
        return {
            total: all.length,
            frio: all.filter(l => l.score === 'frio').length,
            tibio: all.filter(l => l.score === 'tibio').length,
            caliente: all.filter(l => l.score === 'caliente').length,
            nuevo: all.filter(l => l.status === 'nuevo').length,
            contactado: all.filter(l => l.status === 'contactado').length,
            cerrado: all.filter(l => l.status === 'cerrado').length
        };
    }

    /**
     * Record a notification sent for this lead.
     */
    async recordNotification(leadId, type, success) {
        await putItem(TABLE_NOTIF_HISTORY, {
            id: crypto.randomUUID(),
            leadId,
            type, // 'whatsapp' | 'email'
            success,
            sentAt: new Date().toISOString()
        });
    }

    // ── Private helpers ──

    _detectScore(message) {
        const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Hot signals take priority
        for (const pattern of HOT_PATTERNS) {
            if (pattern.test(lower)) return 'caliente';
        }

        // Warm signals
        for (const pattern of WARM_PATTERNS) {
            if (pattern.test(lower)) return 'tibio';
        }

        return null; // No intent detected
    }

    /**
     * Only upgrade score, never downgrade.
     * caliente > tibio > frio
     */
    _upgradeScore(current, incoming) {
        const order = { frio: 0, tibio: 1, caliente: 2 };
        return order[incoming] > order[current] ? incoming : current;
    }

    async getLeadByJid(jid) {
        return await this._findLeadByJid(jid);
    }

    async resetLeadPriority(jid) {
        const lead = await this._findLeadByJid(jid);
        if (lead) {
            await updateItem(TABLE_LEADS, { id: lead.id }, {
                priority: false,
                score: 'tibio', // Downgrade score to warm so the AI can answer again
                notified: false, // Reset notified status so admin can get alerts again if it becomes hot
                updatedAt: new Date().toISOString()
            });
            console.log(`🎯 Lead priority reset to false, score set to tibio and notified set to false for ${jid}`);
        }
    }

    async _findLeadByJid(jid) {
        const all = await scanItems(TABLE_LEADS, {
            FilterExpression: '#jid = :jid',
            ExpressionAttributeNames: { '#jid': 'jid' },
            ExpressionAttributeValues: { ':jid': jid }
        });
        return all.length > 0 ? all[0] : null;
    }
}

module.exports = new LeadScoringService();
