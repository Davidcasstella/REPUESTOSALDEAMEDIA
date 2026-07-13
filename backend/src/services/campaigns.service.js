/**
 * CampaignsService — DynamoDB Version
 *
 * Manages mass WhatsApp campaigns:
 * - CRUD for campaigns
 * - Bulk send with configurable delay
 * - Campaign context injection for chatbot
 *
 * Table: chatwifi-campaigns
 * Table: chatwifi-campaign-messages (individual sends)
 */

const crypto = require('crypto');
const { putItem, getItem, scanItems, deleteItem, updateItem } = require('../config/dynamodb');

const TABLE_CAMPAIGNS = 'campaigns';
const TABLE_MESSAGES = 'campaign-messages';

class CampaignsService {
    constructor() {
        // WhatsApp socket injected at runtime from app.js
        this._sock = null;
        this._chatHistoryService = null;
        this._io = null;
    }

    // Inject dependencies at runtime (avoids circular requires)
    setDependencies(sock, chatHistoryService, io) {
        this._sock = sock;
        this._chatHistoryService = chatHistoryService;
        this._io = io;
    }

    // ── Campaign CRUD ──

    /**
     * Create a new campaign.
     */
    async createCampaign(data) {
        const campaign = {
            id: crypto.randomUUID(),
            name: data.name || 'Sin nombre',
            message: data.message || '',
            variables: data.variables || {},
            contactIds: data.contactIds || [],
            phoneNumbers: data.phoneNumbers || [],
            scheduledAt: data.scheduledAt || null,
            status: 'draft', // draft | sending | sent | failed
            totalRecipients: (data.contactIds || []).length + (data.phoneNumbers || []).length,
            sent: 0,
            failed: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await putItem(TABLE_CAMPAIGNS, campaign);
        return campaign;
    }

    /**
     * Get all campaigns sorted by creation date descending.
     */
    async listCampaigns() {
        const items = await scanItems(TABLE_CAMPAIGNS);
        return items.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }

    /**
     * Get a single campaign by ID.
     */
    async getCampaign(id) {
        return await getItem(TABLE_CAMPAIGNS, { id });
    }

    /**
     * Update campaign fields.
     */
    async updateCampaign(id, updates) {
        updates.updatedAt = new Date().toISOString();
        return await updateItem(TABLE_CAMPAIGNS, { id }, updates);
    }

    /**
     * Delete a campaign.
     */
    async deleteCampaign(id) {
        await deleteItem(TABLE_CAMPAIGNS, { id });
        return true;
    }

    // ── Sending Logic ──

    /**
     * Execute the mass send for a campaign.
     * @param {string} campaignId
     * @param {number} delayMs - delay between messages in ms (default 2000)
     */
    async sendCampaign(campaignId, delayMs = 2000) {
        const campaign = await this.getCampaign(campaignId);
        if (!campaign) throw new Error('Campaña no encontrada');
        if (!this._sock) throw new Error('WhatsApp no está conectado');

        // Mark as sending
        await this.updateCampaign(campaignId, { status: 'sending' });

        // Build recipient list: contactIds resolve to phone numbers via contacts
        const contactsService = require('./contacts.service');
        let recipients = [];

        // From contacts list
        if (campaign.contactIds && campaign.contactIds.length > 0) {
            const contacts = await contactsService.getContactsByIds(campaign.contactIds);
            recipients.push(...contacts.map(c => ({
                phone: c.phone,
                name: c.name || c.phone,
                contactId: c.id
            })));
        }

        // From raw phone numbers
        if (campaign.phoneNumbers && campaign.phoneNumbers.length > 0) {
            for (const phone of campaign.phoneNumbers) {
                const clean = phone.replace(/\D/g, '');
                if (clean.length >= 10) {
                    recipients.push({ phone: clean, name: clean, contactId: null });
                }
            }
        }

        let sent = 0;
        let failed = 0;

        for (const recipient of recipients) {
            try {
                // Build personalized message by replacing {{variable}} placeholders
                const personalizedMsg = this._interpolateMessage(campaign.message, {
                    nombre: recipient.name,
                    ...campaign.variables
                });

                const jid = `${recipient.phone}@s.whatsapp.net`;

                await this._sock.sendMessage(jid, { text: personalizedMsg });

                // Save the campaign context in chat history so chatbot knows the campaign
                if (this._chatHistoryService) {
                    await this._chatHistoryService.addMessage(
                        jid,
                        `[CAMPAÑA: ${campaign.name}] ${personalizedMsg}`,
                        true,
                        undefined,
                        'campaign'
                    );
                }

                // Record individual message send
                await putItem(TABLE_MESSAGES, {
                    id: crypto.randomUUID(),
                    campaignId,
                    phone: recipient.phone,
                    jid,
                    message: personalizedMsg,
                    status: 'sent',
                    sentAt: new Date().toISOString()
                });

                // Store campaign context for this JID so chatbot can reference it
                await this._storeCampaignContext(jid, campaign);

                // Reset user state (enables AI, resets priority/score and sets notified to false)
                try {
                    const welcomeAutomationService = require('./welcomeAutomation.service');
                    await welcomeAutomationService.resetUserState(jid);
                } catch (resetErr) {
                    console.warn(`⚠️ Error resetting user state for campaign recipient ${jid}:`, resetErr.message);
                }

                sent++;

                // Emit progress via socket
                if (this._io) {
                    this._io.emit('campaign:progress', {
                        campaignId,
                        sent,
                        failed,
                        total: recipients.length
                    });
                }

                // Delay between messages to avoid WhatsApp rate limiting
                if (recipients.indexOf(recipient) < recipients.length - 1) {
                    await this._delay(delayMs);
                }

            } catch (err) {
                console.error(`❌ Campaign send failed for ${recipient.phone}: ${err.message}`);

                await putItem(TABLE_MESSAGES, {
                    id: crypto.randomUUID(),
                    campaignId,
                    phone: recipient.phone,
                    jid: `${recipient.phone}@s.whatsapp.net`,
                    message: '',
                    status: 'failed',
                    error: err.message,
                    sentAt: new Date().toISOString()
                });

                failed++;
            }
        }

        // Mark campaign as completed
        await this.updateCampaign(campaignId, {
            status: 'sent',
            sent,
            failed,
            sentAt: new Date().toISOString()
        });

        console.log(`✅ Campaign "${campaign.name}" completed: ${sent} sent, ${failed} failed`);
        return { sent, failed, total: recipients.length };
    }

    /**
     * Get stats for a campaign (messages sent).
     */
    async getCampaignStats(campaignId) {
        const allMessages = await scanItems(TABLE_MESSAGES, {
            FilterExpression: '#cid = :cid',
            ExpressionAttributeNames: { '#cid': 'campaignId' },
            ExpressionAttributeValues: { ':cid': campaignId }
        });

        const sent = allMessages.filter(m => m.status === 'sent').length;
        const failed = allMessages.filter(m => m.status === 'failed').length;

        return { total: allMessages.length, sent, failed, messages: allMessages };
    }

    /**
     * Get the campaign context for a JID (used by chatbot for contextual responses).
     * Returns null if the JID hasn't received any campaign.
     */
    async getCampaignContextForJid(jid) {
        try {
            const TABLE_CONTEXT = 'campaign-context';
            const item = await getItem(TABLE_CONTEXT, { jid });
            return item || null;
        } catch {
            return null;
        }
    }

    /**
     * Delete the campaign context for a JID.
     * Called when the welcome flow fires or when a user state is fully reset,
     * so stale campaign context doesn't block future welcome sequences.
     */
    async deleteCampaignContext(jid) {
        try {
            const TABLE_CONTEXT = 'campaign-context';
            await deleteItem(TABLE_CONTEXT, { jid });
            console.log(`🗑️ Campaign context deleted for ${jid}`);
        } catch (err) {
            console.warn(`⚠️ Failed to delete campaign context for ${jid}: ${err.message}`);
        }
    }

    // ── Private Helpers ──

    async _storeCampaignContext(jid, campaign) {
        try {
            const TABLE_CONTEXT = 'campaign-context';
            await putItem(TABLE_CONTEXT, {
                jid,
                campaignId: campaign.id,
                campaignName: campaign.name,
                message: campaign.message,
                sentAt: new Date().toISOString(),
                product: campaign.variables?.producto || campaign.variables?.product || null
            });
        } catch (err) {
            console.error(`⚠️ Failed to store campaign context for ${jid}: ${err.message}`);
        }
    }

    /**
     * Replace {{variable}} placeholders in message with actual values.
     */
    _interpolateMessage(template, variables = {}) {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), value || '');
        }
        return result;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new CampaignsService();
