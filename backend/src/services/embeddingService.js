const axios = require('axios');
const aiProvidersService = require('./aiProviders.service');

class EmbeddingService {
    /**
     * Generate an embedding vector for the given text.
     * Uses the active AI provider's embedding API.
     * Falls back to a simple TF-IDF-like local embedding if no compatible provider.
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} - Embedding vector
     */
    async generateEmbedding(text) {
        const provider = await aiProvidersService.getActiveProvider();

        if (!provider) {
            console.warn('⚠️ No active AI provider. Using local fallback embeddings.');
            return this.localFallbackEmbedding(text);
        }

        const providerName = provider.name.toLowerCase();

        try {
            const isGroq = providerName.includes('groq') || providerName.includes('grog') || provider.apiKey.startsWith('gsk_');
            const isOpenAI = providerName.includes('openai') || provider.apiKey.startsWith('sk-');
            const isGrok = providerName.includes('grok') && !isGroq;
            const isGemini = providerName.includes('gemini') || provider.apiKey.startsWith('AIza');

            if (isOpenAI) {
                return await this.openAIEmbedding(provider.apiKey, text);
            } else if (isGrok) {
                // Grok (xAI) uses OpenAI-compatible API
                return await this.grokEmbedding(provider.apiKey, text);
            } else if (isGemini) {
                return await this.geminiEmbedding(provider.apiKey, text);
            } else if (isGroq) {
                // Groq.com does not support embeddings yet
                console.warn(`⚠️ Provider ${provider.name} detected as Groq. Using local fallback.`);
                return this.localFallbackEmbedding(text);
            } else {
                console.warn(`⚠️ Provider ${provider.name} does not support embeddings. Using local fallback.`);
                return this.localFallbackEmbedding(text);
            }
        } catch (error) {
            console.error(`❌ Error generating embedding with ${provider.name}:`, error.message);
            console.warn('⚠️ Falling back to local embedding.');
            return this.localFallbackEmbedding(text);
        }
    }

    /**
     * Generate embedding via OpenAI API.
     */
    async openAIEmbedding(apiKey, text) {
        const response = await axios.post('https://api.openai.com/v1/embeddings', {
            model: 'text-embedding-3-small',
            input: text
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return response.data.data[0].embedding;
    }

    /**
     * Generate embedding via Grok (xAI) compatible API.
     */
    async grokEmbedding(apiKey, text) {
        try {
            const response = await axios.post('https://api.x.ai/v1/embeddings', {
                model: 'embedding-beta',
                input: text
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            return response.data.data[0].embedding;
        } catch (error) {
            // If Grok doesn't support embeddings, fallback
            console.warn('⚠️ Grok embedding failed, using local fallback.');
            return this.localFallbackEmbedding(text);
        }
    }

    /**
     * Generate embedding via Google Gemini API.
     */
    async geminiEmbedding(apiKey, text) {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
                {
                    content: {
                        parts: [{ text }]
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            return response.data.embedding.values;
        } catch (error) {
            console.warn('⚠️ Gemini embedding failed, using local fallback:', error.message);
            return this.localFallbackEmbedding(text);
        }
    }

    /**
     * Simple local fallback embedding using character n-gram hashing.
     * Produces a fixed-size vector (256 dimensions) for basic similarity matching.
     * This is NOT as good as neural embeddings but works without an API.
     */
    localFallbackEmbedding(text) {
        const DIMENSIONS = 2048; // Increased for better resolution and fewer collisions
        const vector = new Array(DIMENSIONS).fill(0);

        // Normalize: lowercase, remove accents (NFD), keep only alphanumeric
        const normalized = text.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, ' ');

        const words = normalized.split(/\s+/).filter(w => w.length >= 3);

        if (words.length === 0) return vector;

        // Use Feature Hashing (Hashing Trick)
        for (const word of words) {
            // Simple robust string hash
            let h = 5381;
            for (let i = 0; i < word.length; i++) {
                h = ((h << 5) + h) + word.charCodeAt(i);
            }

            const idx = Math.abs(h) % DIMENSIONS;
            vector[idx] += 1;

            // Also hash bigrams for better context capture
            const nextWord = words[words.indexOf(word) + 1];
            if (nextWord) {
                const combined = word + ' ' + nextWord;
                let h2 = 5381;
                for (let i = 0; i < combined.length; i++) {
                    h2 = ((h2 << 5) + h2) + combined.charCodeAt(i);
                }
                const idx2 = Math.abs(h2) % DIMENSIONS;
                vector[idx2] += 0.5;
            }
        }

        // Normalize the vector to unit length (L2 norm)
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < DIMENSIONS; i++) {
                vector[i] = vector[i] / magnitude;
            }
        }

        return vector;
    }

    /**
     * Simple string hash function.
     */
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }
}

module.exports = new EmbeddingService();
