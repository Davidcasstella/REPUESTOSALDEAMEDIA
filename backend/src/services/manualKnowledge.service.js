const fs = require('fs-extra');
const path = require('path');
const fileStorage = require('./fileStorage');
const embeddingService = require('./embeddingService');

const MK_PATH = path.join(__dirname, '../../knowledge-base/manual-knowledge.json');
const CHUNKS_DIR = path.join(__dirname, '../../knowledge-base/chunks');
const EMBEDDINGS_DIR = path.join(__dirname, '../../knowledge-base/embeddings');

/**
 * ManualKnowledgeService — CRUD for free-form knowledge entries.
 *
 * Each entry has a title + content. The content is chunked (to support
 * large text) and vectorized so the retriever can find it just like
 * uploaded documents or Q&A pairs.
 *
 * Chunk / embedding naming convention:
 *   chunkId  = mk_{entryId}_chunk_{n}
 *   docId    = mk_{entryId}
 */
class ManualKnowledgeService {

    // ── Persistence helpers ────────────────────────────────────────

    /**
     * Read the JSON array from disk, creating the file if missing.
     * @returns {Promise<Array>} Manual knowledge entries
     */
    /**
     * Read all manual knowledge entries, optionally filtered by stageId.
     * @param {string} [stageId] - Optional stage filter
     * @returns {Promise<Array>}
     */
    async getAll(stageId) {
        await fs.ensureFile(MK_PATH);
        try {
            const data = await fs.readJson(MK_PATH);
            const entries = Array.isArray(data) ? data : [];
            if (stageId) return entries.filter(e => e.stageId === stageId);
            return entries;
        } catch {
            return [];
        }
    }

    /** Persist the full array back to disk. */
    async _save(entries) {
        await fs.writeJson(MK_PATH, entries, { spaces: 2 });
    }

    // ── Text chunking (replicates KnowledgeBaseService.chunkText) ──

    /**
     * Split text into overlapping word-based chunks.
     * @param {string} text - Raw text
     * @param {number} maxTokens - Approximate words per chunk
     * @returns {string[]} Array of text chunks
     */
    _chunkText(text, maxTokens = 500) {
        const cleaned = text
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\s+/g, ' ')
            .trim();

        const words = cleaned.split(' ');
        const chunks = [];
        const overlap = Math.floor(maxTokens * 0.1);
        let start = 0;

        while (start < words.length) {
            const end = Math.min(start + maxTokens, words.length);
            const chunk = words.slice(start, end).join(' ');

            if (chunk.trim().length > 50) {
                chunks.push(chunk.trim());
            }

            start = end - overlap;
            if (start >= words.length) break;
            if (end === words.length) break;
        }

        return chunks.length > 0 ? chunks : [cleaned];
    }

    // ── Chunk + Embedding lifecycle ────────────────────────────────

    /**
     * Create chunk files and their embeddings for an entry.
     * Supports large texts by splitting into multiple chunks.
     */
    async _saveChunksAndEmbeddings(entryId, title, content) {
        const documentId = `mk_${entryId}`;
        const fullText = `${title}\n\n${content}`;
        const chunks = this._chunkText(fullText);

        for (let i = 0; i < chunks.length; i++) {
            const chunkId = `mk_${entryId}_chunk_${i + 1}`;

            // Save chunk text file
            const chunkPath = path.join(CHUNKS_DIR, `${chunkId}.txt`);
            await fs.writeFile(chunkPath, chunks[i], 'utf8');

            // Generate and save embedding
            const embedding = await embeddingService.generateEmbedding(chunks[i]);
            await fileStorage.saveEmbedding(chunkId, documentId, embedding);
        }

        console.log(`🧠 Manual knowledge "${title.substring(0, 30)}..." vectorized (${chunks.length} chunks)`);
        return chunks.length;
    }

    /**
     * Remove all chunk and embedding files for an entry.
     */
    async _removeChunksAndEmbeddings(entryId) {
        const prefix = `mk_${entryId}_chunk_`;

        // Remove chunk files
        const chunkFiles = (await fs.readdir(CHUNKS_DIR)).filter(f => f.startsWith(prefix));
        for (const file of chunkFiles) {
            await fs.remove(path.join(CHUNKS_DIR, file));
        }

        // Remove embedding files
        const embFiles = (await fs.readdir(EMBEDDINGS_DIR)).filter(f => f.startsWith(prefix));
        for (const file of embFiles) {
            await fs.remove(path.join(EMBEDDINGS_DIR, file));
        }
    }

    // ── CRUD Operations ────────────────────────────────────────────

    /**
     * Create a new manual knowledge entry.
     * @param {string} title - Entry title
     * @param {string} content - Entry content (can be very long)
     * @param {string} [stageId] - Stage to associate with
     * @returns {Object} The created entry
     */
    async create(title, content, stageId) {
        const entries = await this.getAll();
        const newEntry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            title: title.trim(),
            content: content.trim(),
            stageId: stageId || 'stage_general',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        entries.push(newEntry);
        await this._save(entries);

        // Vectorize
        const chunkCount = await this._saveChunksAndEmbeddings(newEntry.id, newEntry.title, newEntry.content);
        newEntry.chunkCount = chunkCount;

        console.log(`📝 Manual knowledge created: "${newEntry.title}"`);
        return newEntry;
    }

    /**
     * Update an existing entry — re-generates all chunks and embeddings.
     * @param {string} id - Entry ID
     * @param {string} title
     * @param {string} content
     * @returns {Object|null}
     */
    async update(id, title, content) {
        const entries = await this.getAll();
        const idx = entries.findIndex(e => e.id === id);
        if (idx === -1) return null;

        entries[idx].title = title.trim();
        entries[idx].content = content.trim();
        entries[idx].updatedAt = new Date().toISOString();
        await this._save(entries);

        // Re-vectorize: remove old, create new
        await this._removeChunksAndEmbeddings(id);
        const chunkCount = await this._saveChunksAndEmbeddings(id, entries[idx].title, entries[idx].content);
        entries[idx].chunkCount = chunkCount;

        console.log(`✏️ Manual knowledge updated and re-vectorized: ${id}`);
        return entries[idx];
    }

    /**
     * Delete an entry and its chunks/embeddings.
     * @param {string} id
     * @returns {boolean}
     */
    async delete(id) {
        const entries = await this.getAll();
        const filtered = entries.filter(e => e.id !== id);
        if (filtered.length === entries.length) return false;
        await this._save(filtered);

        await this._removeChunksAndEmbeddings(id);

        console.log(`🗑️ Manual knowledge deleted: ${id}`);
        return true;
    }

    /**
     * Re-vectorize ALL manual knowledge entries.
     */
    async reprocessAll() {
        const entries = await this.getAll();
        console.log(`🔄 Re-vectorizing ${entries.length} manual knowledge entries...`);

        for (const entry of entries) {
            await this._removeChunksAndEmbeddings(entry.id);
            await this._saveChunksAndEmbeddings(entry.id, entry.title, entry.content);
        }

        console.log(`✅ All ${entries.length} manual knowledge entries re-vectorized`);
        return entries.length;
    }
}

module.exports = new ManualKnowledgeService();
