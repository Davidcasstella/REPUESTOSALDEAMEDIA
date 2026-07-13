/**
 * AlertNotificationsService
 *
 * Sends automatic alerts when a lead is detected:
 * - WhatsApp notification to configured admin number
 * - Email notification via nodemailer
 *
 * Config stored in: chatwifi-alert-config (DynamoDB)
 */

const nodemailer = require('nodemailer');
const { putItem, getItem } = require('../config/dynamodb');

const TABLE = 'alert-config';
const CONFIG_KEY = 'main';

const DEFAULT_CONFIG = {
    configKey: CONFIG_KEY,
    whatsappEnabled: false,
    whatsappNumber: '',
    emailEnabled: false,
    emailRecipients: [],
    minScoreForAlert: 'tibio', // 'frio' | 'tibio' | 'caliente'
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    updatedAt: new Date().toISOString()
};

const SCORE_ORDER = { frio: 0, tibio: 1, caliente: 2 };

class AlertNotificationsService {
    constructor() {
        // WhatsApp socket injected at runtime
        this._sock = null;
    }

    setSock(sock) {
        this._sock = sock;
    }

    // ── Config ──

    async getConfig() {
        const item = await getItem(TABLE, { configKey: CONFIG_KEY });
        return item || { ...DEFAULT_CONFIG };
    }

    async saveConfig(updates) {
        const current = await this.getConfig();
        const merged = {
            ...current,
            ...updates,
            configKey: CONFIG_KEY,
            updatedAt: new Date().toISOString()
        };
        await putItem(TABLE, merged);
        return merged;
    }

    // ── Notification Logic ──

    /**
     * Send all enabled notifications for a detected lead.
     * @param {Object} lead - Lead object from leadScoring.service
     * @param {string} [campaignName] - Campaign name for context
     */
    async notifyLead(lead, campaignName) {
        const config = await this.getConfig();

        // Check if score meets minimum threshold
        const leadScoreValue = SCORE_ORDER[lead.score] || 0;
        const minScoreValue = SCORE_ORDER[config.minScoreForAlert] || 1;

        if (leadScoreValue < minScoreValue) {
            console.log(`ℹ️ Lead score [${lead.score}] below threshold [${config.minScoreForAlert}] — skipping alert`);
            return false;
        }

        const scoreEmoji = { frio: '🔵', tibio: '🟡', caliente: '🔴' };
        const scoreLabel = { frio: 'FRÍO', tibio: 'TIBIO', caliente: 'CALIENTE' };

        const notifText = `${scoreEmoji[lead.score] || '⚪'} *Nuevo Lead ${scoreLabel[lead.score] || lead.score} Detectado*\n\n` +
            `👤 Nombre: ${lead.pushName || 'Sin nombre'}\n` +
            `📱 Número: +${lead.phone}\n` +
            `🎯 Campaña: ${campaignName || lead.campaignId || 'Sin campaña'}\n` +
            `📊 Interés: ${scoreLabel[lead.score] || lead.score}\n` +
            `💬 Mensaje: "${lead.lastMessage || ''}"`;

        let sentAny = false;

        // Send WhatsApp notification
        if (config.whatsappEnabled && config.whatsappNumber && this._sock) {
            const waSent = await this._sendWhatsApp(config.whatsappNumber, notifText);
            if (waSent) sentAny = true;
        }

        // Send Email notification
        if (config.emailEnabled && config.emailRecipients?.length > 0 && config.smtpHost) {
            const emailSent = await this._sendEmail(config, lead, campaignName, scoreLabel, scoreEmoji);
            if (emailSent) sentAny = true;
        }

        return sentAny;
    }

    /**
     * Send a test notification to verify config.
     */
    async sendTestNotification(config) {
        const testMsg = `✅ *Notificación de prueba*\n\nConfiguración de alertas activa.\n\n` +
            `WhatsApp: ${config.whatsappEnabled ? 'Activado' : 'Desactivado'}\n` +
            `Email: ${config.emailEnabled ? 'Activado' : 'Desactivado'}\n` +
            `Nivel mínimo: ${config.minScoreForAlert || 'tibio'}`;

        const results = { whatsapp: null, email: null };

        if (config.whatsappEnabled && config.whatsappNumber && this._sock) {
            results.whatsapp = await this._sendWhatsApp(config.whatsappNumber, testMsg);
        }

        if (config.emailEnabled && config.emailRecipients?.length > 0 && config.smtpHost) {
            results.email = await this._sendEmail(config, {
                pushName: 'Lead de Prueba',
                phone: '3000000000',
                lastMessage: 'Mensaje de prueba',
                score: 'caliente'
            }, 'Campaña de prueba', { caliente: 'CALIENTE' }, { caliente: '🔴' });
        }

        return results;
    }

    // ── Private helpers ──

    async _sendWhatsApp(number, text) {
        try {
            const clean = number.replace(/\D/g, '');
            const jid = `${clean}@s.whatsapp.net`;
            await this._sock.sendMessage(jid, { text });
            console.log(`📲 Alert WhatsApp sent to ${clean}`);
            return true;
        } catch (err) {
            console.error(`❌ WhatsApp alert failed: ${err.message}`);
            return false;
        }
    }

    async _sendEmail(config, lead, campaignName, scoreLabel, scoreEmoji) {
        try {
            const transporter = nodemailer.createTransport({
                host: config.smtpHost,
                port: config.smtpPort || 587,
                secure: config.smtpPort === 465,
                auth: {
                    user: config.smtpUser,
                    pass: config.smtpPass
                }
            });

            const htmlBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #e53e3e;">
                        ${scoreEmoji?.[lead.score] || '⚪'} Nuevo Lead ${scoreLabel?.[lead.score] || lead.score} Detectado
                    </h2>
                    <table style="border-collapse: collapse; width: 100%;">
                        <tr><td style="padding: 8px; font-weight: bold; width: 130px;">👤 Nombre</td>
                            <td style="padding: 8px;">${lead.pushName || 'Sin nombre'}</td></tr>
                        <tr style="background: #f8f9fa;"><td style="padding: 8px; font-weight: bold;">📱 Número</td>
                            <td style="padding: 8px;">+${lead.phone}</td></tr>
                        <tr><td style="padding: 8px; font-weight: bold;">🎯 Campaña</td>
                            <td style="padding: 8px;">${campaignName || lead.campaignId || 'Sin campaña'}</td></tr>
                        <tr style="background: #f8f9fa;"><td style="padding: 8px; font-weight: bold;">📊 Nivel</td>
                            <td style="padding: 8px;">${scoreLabel?.[lead.score] || lead.score}</td></tr>
                        <tr><td style="padding: 8px; font-weight: bold;">💬 Mensaje</td>
                            <td style="padding: 8px; font-style: italic;">"${lead.lastMessage || ''}"</td></tr>
                    </table>
                    <p style="margin-top: 20px; font-size: 0.9em; color: #666;">
                        Esta notificación fue generada automáticamente por el sistema ChatWifi.
                    </p>
                </div>
            `;

            await transporter.sendMail({
                from: config.smtpFrom || config.smtpUser,
                to: config.emailRecipients.join(', '),
                subject: `🎯 Lead ${scoreLabel?.[lead.score] || lead.score}: ${lead.pushName || lead.phone}`,
                html: htmlBody
            });

            console.log(`📧 Alert email sent to ${config.emailRecipients.join(', ')}`);
            return true;
        } catch (err) {
            console.error(`❌ Email alert failed: ${err.message}`);
            return false;
        }
    }
}

module.exports = new AlertNotificationsService();
