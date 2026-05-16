const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');
const aiProvidersService = require('./aiProviders.service');

/**
 * Audio Transcription Service
 *
 * Downloads WhatsApp audio messages (voice notes, audio files)
 * and transcribes them to text using Groq Whisper API.
 * Reuses existing Groq API keys from the providers system.
 */
class AudioTranscriptionService {

    /**
     * Download the audio buffer from a WhatsApp message.
     * @param {object} msg - The Baileys message object (messages[0])
     * @returns {Promise<Buffer>} - The raw audio buffer
     */
    async downloadAudio(msg) {
        const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
                reuploadRequest: undefined
            }
        );

        if (!buffer || buffer.length === 0) {
            throw new Error('Downloaded audio buffer is empty');
        }

        console.log(`🎵 Audio downloaded: ${(buffer.length / 1024).toFixed(1)} KB`);
        return buffer;
    }

    /**
     * Transcribe an audio buffer to text using Groq Whisper API.
     * Tries all available Groq keys on failure (key rotation).
     *
     * @param {Buffer} audioBuffer - The raw audio data
     * @returns {Promise<string>} - The transcribed text
     */
    async transcribe(audioBuffer) {
        // Get all Groq keys (same ones used for chat)
        const groqKeys = await aiProvidersService.getProvidersByType('groq');

        if (!groqKeys || groqKeys.length === 0) {
            throw new Error('No Groq API keys available for transcription');
        }

        let lastError = null;

        for (let i = 0; i < groqKeys.length; i++) {
            const key = groqKeys[i];
            try {
                const text = await this._callWhisper(key, audioBuffer);
                if (i > 0) {
                    console.log(`🔄 Whisper transcription succeeded with key #${i + 1}`);
                }
                return text;
            } catch (error) {
                lastError = error;
                const status = error.response?.status || 'unknown';
                const keyMask = key.substring(0, 4) + '...' + key.substring(key.length - 4);
                console.warn(`🔄 Whisper key ${keyMask} failed (status: ${status}). ${i < groqKeys.length - 1 ? 'Trying next...' : 'No more keys.'}`);
            }
        }

        throw lastError;
    }

    /**
     * Call Groq Whisper API with a specific key.
     * @param {string} apiKey - Groq API key
     * @param {Buffer} audioBuffer - The audio data
     * @returns {Promise<string>} - Transcribed text
     */
    async _callWhisper(apiKey, audioBuffer) {
        const form = new FormData();
        form.append('file', audioBuffer, {
            filename: 'audio.ogg',
            contentType: 'audio/ogg',
        });
        form.append('model', 'whisper-large-v3-turbo');
        form.append('language', 'es');
        form.append('response_format', 'json');

        const response = await axios.post(
            'https://api.groq.com/openai/v1/audio/transcriptions',
            form,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    ...form.getHeaders(),
                },
                maxContentLength: 25 * 1024 * 1024, // 25 MB limit
                timeout: 30000, // 30 second timeout
            }
        );

        const text = response.data?.text?.trim();
        if (!text) {
            throw new Error('Whisper returned empty transcription');
        }

        console.log(`📝 Transcription result: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
        return text;
    }

    /**
     * Full pipeline: download audio from WhatsApp message → transcribe to text.
     * @param {object} msg - The Baileys message object
     * @returns {Promise<string>} - Transcribed text
     */
    async processAudioMessage(msg) {
        const audioBuffer = await this.downloadAudio(msg);
        const text = await this.transcribe(audioBuffer);
        return text;
    }
}

module.exports = new AudioTranscriptionService();
