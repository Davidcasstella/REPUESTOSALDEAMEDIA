const fs = require('fs-extra');
const path = require('path');
const fileStorage = require('./fileStorage');
const embeddingService = require('./embeddingService');

const QA_PATH = path.join(__dirname, '../../knowledge-base/qa-pairs.json');
const CHUNKS_DIR = path.join(__dirname, '../../knowledge-base/chunks');
const EMBEDDINGS_DIR = path.join(__dirname, '../../knowledge-base/embeddings');

class QAPairsService {
    /**
     * Ensures the QA file exists and returns its contents.
     * @param {string} [stageId] - Optional stage filter
     * @returns {Promise<Array>} - Array of Q&A pair objects
     */
    async getAll(stageId) {
        await fs.ensureFile(QA_PATH);
        try {
            const data = await fs.readJson(QA_PATH);
            const pairs = Array.isArray(data) ? data : [];
            if (stageId) return pairs.filter(p => p.stageId === stageId);
            return pairs;
        } catch {
            return [];
        }
    }

    /**
     * Save the full Q&A array to disk.
     */
    async _save(pairs) {
        await fs.writeJson(QA_PATH, pairs, { spaces: 2 });
    }

    /**
     * Format a Q&A pair into chunk text for embedding.
     */
    _formatChunkText(question, answer) {
        return `Pregunta: ${question}\nRespuesta: ${answer}`;
    }

    /**
     * Save a Q&A pair as a chunk + embedding so the retriever can find it.
     * @param {string} pairId - Unique Q&A pair ID
     * @param {string} question 
     * @param {string} answer 
     */
    async _saveChunkAndEmbedding(pairId, question, answer) {
        const chunkId = `qa_${pairId}_chunk_1`;
        const documentId = `qa_${pairId}`;
        const text = this._formatChunkText(question, answer);

        // Save chunk text file
        const chunkPath = path.join(CHUNKS_DIR, `${chunkId}.txt`);
        await fs.writeFile(chunkPath, text, 'utf8');

        // Generate and save embedding
        const embedding = await embeddingService.generateEmbedding(text);
        await fileStorage.saveEmbedding(chunkId, documentId, embedding);

        console.log(`🔢 Q&A pair "${question.substring(0, 30)}..." vectorized successfully`);
    }

    /**
     * Remove the chunk and embedding files for a Q&A pair.
     * @param {string} pairId 
     */
    async _removeChunkAndEmbedding(pairId) {
        const chunkId = `qa_${pairId}_chunk_1`;

        // Remove chunk file
        const chunkPath = path.join(CHUNKS_DIR, `${chunkId}.txt`);
        if (await fs.pathExists(chunkPath)) {
            await fs.remove(chunkPath);
        }

        // Remove embedding file
        const embPath = path.join(EMBEDDINGS_DIR, `${chunkId}.json`);
        if (await fs.pathExists(embPath)) {
            await fs.remove(embPath);
        }
    }

    /**
     * Add a new Q&A pair — saves JSON + creates chunk + embedding.
     * @param {string} question 
     * @param {string} answer 
     * @param {string} [stageId] - Stage to associate with
     * @returns {Object} - The created pair
     */
    async create(question, answer, stageId) {
        const pairs = await this.getAll();
        const newPair = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            question: question.trim(),
            answer: answer.trim(),
            stageId: stageId || 'stage_general',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        pairs.push(newPair);
        await this._save(pairs);

        // Vectorize the Q&A pair
        await this._saveChunkAndEmbedding(newPair.id, newPair.question, newPair.answer);

        console.log(`📝 Q&A pair created and vectorized: "${newPair.question.substring(0, 40)}..."`);
        return newPair;
    }

    /**
     * Update an existing Q&A pair — re-generates chunk + embedding.
     * @param {string} id - Pair ID
     * @param {string} question 
     * @param {string} answer 
     * @returns {Object|null} - The updated pair, or null if not found
     */
    async update(id, question, answer) {
        const pairs = await this.getAll();
        const idx = pairs.findIndex(p => p.id === id);
        if (idx === -1) return null;

        pairs[idx].question = question.trim();
        pairs[idx].answer = answer.trim();
        pairs[idx].updatedAt = new Date().toISOString();
        await this._save(pairs);

        // Re-vectorize: remove old, create new
        await this._removeChunkAndEmbedding(id);
        await this._saveChunkAndEmbedding(id, pairs[idx].question, pairs[idx].answer);

        console.log(`✏️ Q&A pair updated and re-vectorized: ${id}`);
        return pairs[idx];
    }

    /**
     * Delete a Q&A pair by ID — removes JSON entry + chunk + embedding.
     * @param {string} id 
     * @returns {boolean} - True if deleted
     */
    async delete(id) {
        const pairs = await this.getAll();
        const filtered = pairs.filter(p => p.id !== id);
        if (filtered.length === pairs.length) return false;
        await this._save(filtered);

        // Remove chunk and embedding files
        await this._removeChunkAndEmbedding(id);

        console.log(`🗑️ Q&A pair deleted and de-vectorized: ${id}`);
        return true;
    }

    /**
     * Re-vectorize ALL existing Q&A pairs.
     * Useful after switching AI providers or for batch reprocessing.
     */
    async reprocessAll() {
        const pairs = await this.getAll();
        console.log(`🔄 Re-vectorizing ${pairs.length} Q&A pairs...`);

        for (const pair of pairs) {
            await this._removeChunkAndEmbedding(pair.id);
            await this._saveChunkAndEmbedding(pair.id, pair.question, pair.answer);
        }

        console.log(`✅ All ${pairs.length} Q&A pairs re-vectorized`);
        return pairs.length;
    }
}

module.exports = new QAPairsService();
