const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const aiProvidersService = require('./aiProviders.service');

/**
 * Payment Detection Service
 *
 * Downloads WhatsApp images and analyzes them using Groq Vision
 * (Llama 3.2 Vision) to detect payment receipts / bank transfers.
 * Reuses existing Groq API keys (gsk_*) from the providers system.
 */
class PaymentDetectionService {

    /**
     * Download the image buffer from a WhatsApp message.
     * @param {object} msg - The Baileys message object
     * @returns {Promise<Buffer>} - The raw image buffer
     */
    async downloadImage(msg) {
        const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { reuploadRequest: undefined }
        );

        if (!buffer || buffer.length === 0) {
            throw new Error('Downloaded image buffer is empty');
        }

        console.log(`📸 Image downloaded: ${(buffer.length / 1024).toFixed(1)} KB`);
        return buffer;
    }

    /**
     * Analyze an image to determine if it's a payment receipt.
     * Uses Groq Vision API (Llama 3.2 Vision) with key rotation.
     *
     * @param {Buffer} imageBuffer - The raw image data
     * @returns {Promise<boolean>} - true if payment receipt detected
     */
    async isPaymentReceipt(imageBuffer) {
        const groqKeys = await aiProvidersService.getProvidersByType('groq');

        if (!groqKeys || groqKeys.length === 0) {
            throw new Error('No Groq API keys available for image analysis');
        }

        const base64Image = imageBuffer.toString('base64');
        let lastError = null;

        for (let i = 0; i < groqKeys.length; i++) {
            const key = groqKeys[i];
            try {
                const result = await this._analyzeWithVision(key, base64Image);
                if (i > 0) {
                    console.log(`🔄 Vision analysis succeeded with key #${i + 1}`);
                }
                return result;
            } catch (error) {
                lastError = error;
                const status = error.response?.status || 'unknown';
                const errMsg = error.response?.data?.error?.message || error.message || '';
                const keyMask = key.substring(0, 4) + '...' + key.substring(key.length - 4);
                console.warn(`🔄 Vision key ${keyMask} failed (status: ${status}, error: ${errMsg}). ${i < groqKeys.length - 1 ? 'Trying next...' : 'No more keys.'}`);
            }
        }

        throw lastError;
    }

    /**
     * Call Groq Vision API to analyze the image.
     * @param {string} apiKey - Groq API key
     * @param {string} base64Image - Base64 encoded image
     * @returns {Promise<boolean>} - true if payment receipt
     */
    async _analyzeWithVision(apiKey, base64Image) {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Analiza esta imagen y determina si es un comprobante de pago, recibo bancario, screenshot de transferencia, comprobante de Nequi, Daviplata, o cualquier prueba de pago.

Busca señales como:
- Números de transacción o referencia
- Logos de bancos o aplicaciones de pago
- Palabras como: pago, transferencia, comprobante, enviado, monto, referencia, exitoso, aprobado
- Tablas o campos de montos de dinero
- Confirmaciones de transacción

Responde EXACTAMENTE con una sola palabra:
- SI (si parece un comprobante de pago)
- NO (si NO parece un comprobante de pago)`
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 10,
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const answer = (response.data?.choices?.[0]?.message?.content || '').trim().toUpperCase();
        console.log(`🔍 Payment detection result: "${answer}"`);
        return answer.startsWith('SI') || answer === 'SÍ';
    }

    /**
     * Full pipeline: download image → analyze for payment receipt.
     * @param {object} msg - The Baileys message object
     * @returns {Promise<boolean>} - true if payment receipt detected
     */
    async analyzeMessage(msg) {
        const imageBuffer = await this.downloadImage(msg);
        return await this.isPaymentReceipt(imageBuffer);
    }
}

module.exports = new PaymentDetectionService();
