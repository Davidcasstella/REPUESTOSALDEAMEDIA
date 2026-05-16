/**
 * FileStorage — S3 Version
 *
 * Handles knowledge-base file operations on S3.
 * Bucket structure:
 *   knowledge-base/documents/{docId}.{ext}
 *   knowledge-base/chunks/{chunkId}.txt
 *   knowledge-base/embeddings/{chunkId}.json
 *   knowledge-base/index.json
 */

const crypto = require('crypto');
const path = require('path');
const s3 = require('../config/s3');

const KB_PREFIX = 'knowledge-base';
const DOCS_PREFIX = `${KB_PREFIX}/documents`;
const CHUNKS_PREFIX = `${KB_PREFIX}/chunks`;
const EMBEDDINGS_PREFIX = `${KB_PREFIX}/embeddings`;
const INDEX_KEY = `${KB_PREFIX}/index.json`;

class FileStorage {
    constructor() {
        this._ensureIndex();
    }

    async _ensureIndex() {
        try {
            const exists = await s3.fileExists(INDEX_KEY);
            if (!exists) {
                await s3.uploadJson(INDEX_KEY, []);
            }
        } catch (err) {
            console.warn('⚠️ S3 index init:', err.message);
        }
    }

    // ==================== INDEX OPERATIONS ====================

    async getIndex() {
        try {
            return await s3.downloadJson(INDEX_KEY);
        } catch {
            return [];
        }
    }

    async saveIndex(index) {
        await s3.uploadJson(INDEX_KEY, index);
    }

    // ==================== DOCUMENT OPERATIONS ====================

    /**
     * Save an uploaded file to S3 and register it in index.
     * @param {Object} file - Multer file object { originalname, buffer, mimetype }
     * @param {string} [stageId]
     * @returns {Object} The created document entry
     */
    async saveDocument(file, stageId) {
        const docId = `doc_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        const fileName = `${docId}${ext}`;
        const s3Key = `${DOCS_PREFIX}/${fileName}`;

        // Upload file to S3
        await s3.uploadFile(s3Key, file.buffer, file.mimetype);

        const entry = {
            id: docId,
            name: file.originalname,
            storedName: fileName,
            s3Key,
            type: ext === '.pdf' ? 'pdf' : 'txt',
            size: file.size,
            stageId: stageId || 'stage_general',
            createdAt: new Date().toISOString(),
            status: 'uploaded',
            chunkCount: 0
        };

        const index = await this.getIndex();
        index.push(entry);
        await this.saveIndex(index);

        return entry;
    }

    /**
     * Get the S3 key of a document by its ID.
     */
    async getDocumentPath(docId) {
        const index = await this.getIndex();
        const doc = index.find(d => d.id === docId);
        if (!doc) return null;
        return doc.s3Key || `${DOCS_PREFIX}/${doc.storedName}`;
    }

    /**
     * Download a document's content as Buffer.
     */
    async getDocumentBuffer(docId) {
        const s3Key = await this.getDocumentPath(docId);
        if (!s3Key) return null;
        return s3.downloadFile(s3Key);
    }

    /**
     * Update a document's status and metadata in the index.
     */
    async updateDocumentStatus(docId, updates) {
        const index = await this.getIndex();
        const docIndex = index.findIndex(d => d.id === docId);
        if (docIndex === -1) return null;
        index[docIndex] = { ...index[docIndex], ...updates };
        await this.saveIndex(index);
        return index[docIndex];
    }

    // ==================== CHUNK OPERATIONS ====================

    /**
     * Save text chunks to S3.
     */
    async saveChunks(docId, chunks) {
        const chunkIds = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunkId = `${docId}_chunk_${i + 1}`;
            const s3Key = `${CHUNKS_PREFIX}/${chunkId}.txt`;
            await s3.uploadFile(s3Key, chunks[i], 'text/plain');
            chunkIds.push(chunkId);
        }
        return chunkIds;
    }

    /**
     * Read a specific chunk's text content from S3.
     */
    async getChunkText(chunkId) {
        const s3Key = `${CHUNKS_PREFIX}/${chunkId}.txt`;
        try {
            return await s3.downloadText(s3Key);
        } catch {
            return null;
        }
    }

    /**
     * Get all chunk IDs for a given document.
     */
    async getChunkIdsForDocument(docId) {
        const files = await s3.listFiles(`${CHUNKS_PREFIX}/${docId}`);
        return files
            .filter(f => f.Key.endsWith('.txt'))
            .map(f => {
                const basename = f.Key.split('/').pop();
                return basename.replace('.txt', '');
            });
    }

    // ==================== EMBEDDING OPERATIONS ====================

    /**
     * Save an embedding vector for a chunk.
     */
    async saveEmbedding(chunkId, documentId, embedding) {
        const s3Key = `${EMBEDDINGS_PREFIX}/${chunkId}.json`;
        await s3.uploadJson(s3Key, { chunkId, documentId, embedding });
    }

    /**
     * Load all embeddings from S3.
     */
    async getAllEmbeddings() {
        const files = await s3.listFiles(EMBEDDINGS_PREFIX);
        const jsonFiles = files.filter(f => f.Key.endsWith('.json'));
        const embeddings = [];
        for (const file of jsonFiles) {
            try {
                const data = await s3.downloadJson(file.Key);
                embeddings.push(data);
            } catch (err) {
                console.warn(`⚠️ Failed to load embedding ${file.Key}:`, err.message);
            }
        }
        return embeddings;
    }

    // ==================== DELETE OPERATIONS ====================

    /**
     * Delete a document and all its associated chunks and embeddings from S3.
     */
    async deleteDocument(docId) {
        // Remove document file
        const s3Key = await this.getDocumentPath(docId);
        if (s3Key) {
            try { await s3.deleteFile(s3Key); } catch {}
        }

        // Remove all chunks for this document
        await s3.deletePrefix(`${CHUNKS_PREFIX}/${docId}`);

        // Remove all embeddings for this document
        await s3.deletePrefix(`${EMBEDDINGS_PREFIX}/${docId}`);

        // Remove from index
        const index = await this.getIndex();
        const updated = index.filter(d => d.id !== docId);
        await this.saveIndex(updated);
    }
}

module.exports = new FileStorage();
