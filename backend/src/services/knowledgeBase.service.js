/**
 * KnowledgeBaseService — S3 Version
 *
 * Uses FileStorage (S3-backed) for documents, chunks, embeddings.
 * The extraction and chunking logic remains the same.
 */

const { PDFParse } = require('pdf-parse');
const fileStorage = require('./fileStorage');
const embeddingService = require('./embeddingService');
const retriever = require('./retriever');

class KnowledgeBaseService {
    /**
     * Upload and process a document: save → extract text → chunk → embed.
     * @param {Object} file - Multer file object
     * @param {string} [stageId]
     * @returns {Object}
     */
    async uploadAndProcess(file, stageId) {
        const doc = await fileStorage.saveDocument(file, stageId);
        console.log(`📄 Document saved to S3: ${doc.name} (${doc.id})`);

        // Process asynchronously
        this.processDocument(doc.id).catch(err => {
            console.error(`❌ Error processing document ${doc.id}:`, err.message);
        });

        return doc;
    }

    /**
     * Full processing pipeline for a document.
     */
    async processDocument(docId) {
        try {
            await fileStorage.updateDocumentStatus(docId, { status: 'processing' });

            // Get document info
            const index = await fileStorage.getIndex();
            const doc = index.find(d => d.id === docId);
            if (!doc) throw new Error(`Document ${docId} not found`);

            // Download document buffer from S3
            console.log(`📝 Downloading and extracting text from ${doc.name}...`);
            const buffer = await fileStorage.getDocumentBuffer(docId);
            if (!buffer) throw new Error(`Document buffer not found for ${docId}`);

            const text = await this.extractTextFromBuffer(buffer, doc.type);

            if (!text || text.trim().length === 0) {
                await fileStorage.updateDocumentStatus(docId, { status: 'error', error: 'No text extracted' });
                return;
            }

            // Chunk text
            console.log(`✂️ Chunking text (${text.length} chars)...`);
            const chunks = this.chunkText(text, 500);
            console.log(`📦 Created ${chunks.length} chunks`);

            // Save chunks to S3
            const chunkIds = await fileStorage.saveChunks(docId, chunks);

            // Generate and save embeddings to S3
            console.log(`🧠 Generating embeddings for ${chunks.length} chunks...`);
            for (let i = 0; i < chunks.length; i++) {
                const embedding = await embeddingService.generateEmbedding(chunks[i]);
                await fileStorage.saveEmbedding(chunkIds[i], docId, embedding);
                console.log(`  ✅ Embedding ${i + 1}/${chunks.length}`);
            }

            await fileStorage.updateDocumentStatus(docId, {
                status: 'processed',
                chunkCount: chunks.length,
                processedAt: new Date().toISOString()
            });

            console.log(`🎉 Document ${doc.name} fully processed!`);
        } catch (error) {
            console.error(`❌ Processing failed for ${docId}:`, error.message);
            await fileStorage.updateDocumentStatus(docId, {
                status: 'error',
                error: error.message
            });
        }
    }

    /**
     * Extract text from a document buffer (not file path).
     */
    async extractTextFromBuffer(buffer, type) {
        if (type === 'pdf') {
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
            await parser.destroy();
            return result.text;
        } else {
            return buffer.toString('utf8');
        }
    }

    /**
     * Split text into overlapping chunks.
     */
    chunkText(text, maxTokens = 800) {
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

        return chunks;
    }

    /**
     * Search the knowledge base.
     */
    async searchKnowledge(query, stageId = null) {
        try {
            const results = await retriever.search(query, 5, stageId);
            if (results.length === 0) return null;

            const relevant = results.filter(r => r.score > 0.02);
            if (relevant.length === 0) return null;

            const context = relevant
                .slice(0, 3)
                .map((r) => r.text)
                .join('\n\n');

            return context;
        } catch (error) {
            console.error('❌ Error searching knowledge base:', error.message);
            return null;
        }
    }

    async reprocessDocument(docId) {
        const chunkIds = await fileStorage.getChunkIdsForDocument(docId);
        for (const chunkId of chunkIds) {
            // S3 cleanup handled by deletePrefix in fileStorage
        }
        await this.processDocument(docId);
    }

    async deleteDocument(docId) {
        await fileStorage.deleteDocument(docId);
        console.log(`🗑️ Document ${docId} fully deleted from S3`);
    }

    async getDocuments(stageId) {
        const all = await fileStorage.getIndex();
        if (stageId) return all.filter(d => d.stageId === stageId);
        return all;
    }
}

module.exports = new KnowledgeBaseService();
