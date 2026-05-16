const fileStorage = require('./fileStorage');
const embeddingService = require('./embeddingService');

class Retriever {
    /**
     * Compute cosine similarity between two vectors.
     * @param {number[]} vecA
     * @param {number[]} vecB
     * @returns {number} - Similarity score between -1 and 1
     */
    cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) {
            // If dimensions differ, pad the shorter one with zeros
            const maxLen = Math.max(vecA.length, vecB.length);
            while (vecA.length < maxLen) vecA.push(0);
            while (vecB.length < maxLen) vecB.push(0);
        }

        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            magnitudeA += vecA[i] * vecA[i];
            magnitudeB += vecB[i] * vecB[i];
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) return 0;

        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * Search the knowledge base for the most relevant chunks.
     * @param {string} query - User query text
     * @param {number} topK - Number of top results to return
     * @returns {Promise<Array<{chunkId: string, score: number, text: string}>>}
     */
    async search(query, topK = 5) {
        // Generate embedding for the query
        const queryVector = await embeddingService.generateEmbedding(query);

        // Load all stored embeddings
        const embeddings = await fileStorage.getAllEmbeddings();
        console.log(`🔍 Retriever: Searching through ${embeddings.length} embeddings...`);

        if (embeddings.length === 0) {
            return [];
        }

        // Compute similarity for each stored embedding
        const scoredResults = embeddings.map(emb => {
            const score = this.cosineSimilarity(queryVector, emb.embedding); // Assuming emb.embedding is the correct field
            return {
                chunkId: emb.chunkId,
                documentId: emb.documentId, // Assuming documentId is the correct field
                score
            };
        });

        // Sort by score descending
        scoredResults.sort((a, b) => b.score - a.score);

        // Print top scores for debugging
        if (scoredResults.length > 0) {
            console.log(`📊 Top similarity scores: ${scoredResults.slice(0, 3).map(r => r.score.toFixed(4)).join(', ')}`);
        }

        // Take top K results
        const topResults = scoredResults.slice(0, topK);

        // Load chunk texts for top results
        const results = [];
        for (const result of topResults) {
            const text = await fileStorage.getChunkText(result.chunkId);
            if (text) {
                results.push({
                    chunkId: result.chunkId,
                    documentId: result.documentId,
                    score: result.score,
                    text
                });
            }
        }

        return results;
    }
}

module.exports = new Retriever();
