/**
 * Product Catalog Service — DynamoDB Version
 * 
 * Business logic for managing products extracted from PDF catalogs.
 * Uses DynamoDB table: chatwifi-products (partition key: codigo)
 * Provides search capabilities for the chatbot.
 *
 * Performance: Uses an in-memory cache (60 s TTL) to avoid repeated
 * full DynamoDB scans on every search/stats call.
 */

const { putItem, getItem, scanItems, batchPutItems, deleteItem } = require('../config/dynamodb');
const { MARGIN_PERCENT, CHATBOT_PERCENT, IVA_PERCENT } = require('../config/pricingConfig');
const productNormalizer = require('./productNormalizer');

const TABLE = 'products';

// ── In-memory scan cache ─────────────────────────────────────────────────────
// Avoids downloading 8 000+ DynamoDB items on every search/stats call.
// TTL: 10 minutes as safety fallback — in practice the cache is invalidated
// immediately on any write (saveProducts / clearAll / deleteBySource), so it
// effectively persists until something actually changes.
const CACHE_TTL_MS     = 10 * 60_000; // 10 min
const STATS_CACHE_TTL  =  5 * 60_000; //  5 min
let _scanCache  = null; // { items: Array, expiresAt: number }
let _statsCache = null; // { stats: Object, stageId: string|null, expiresAt: number }

/**
 * Return all product items, using cache when still fresh.
 * @returns {Promise<Array>}
 */
async function cachedScan() {
    const now = Date.now();
    if (_scanCache && _scanCache.expiresAt > now) {
        return _scanCache.items;
    }
    const items = await scanItems(TABLE);
    _scanCache = { items, expiresAt: now + CACHE_TTL_MS };
    return items;
}

/** Invalidate all caches (call after any write operation). */
function invalidateCache() {
    _scanCache = null;
    _statsCache = null;
}

class ProductCatalogService {
    /**
     * Save an array of products to DynamoDB (upsert by codigo).
     * @param {Array} products - Array of product objects from PDF parser
     * @param {string} catalogSource - Original filename for tracking
     * @returns {Object} - { inserted, updated, errors }
     */
    async saveProducts(products, catalogSource = null, stageId = 'stage_general') {
        let inserted = 0;
        let errors = 0;

        const validProducts = products.filter(p => {
            if (!p.codigo) {
                errors++;
                return false;
            }
            return true;
        });

        // Normalize and prepare items for batch write
        const items = validProducts.map(p => {
            // Use normalizer if product doesn't already have _code_variants
            const normalized = p._code_variants ? p : productNormalizer.normalizeProduct(p);
            return {
                ...normalized,
                catalog_source: catalogSource,
                // Store stageId so products are isolated per stage
                stage_id: stageId || 'stage_general',
                created_at: p.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        });

        try {
            await batchPutItems(TABLE, items);
            inserted = items.length;
        } catch (err) {
            console.error(`❌ Batch write error: ${err.message}`);
            // Fallback: write one by one
            for (const item of items) {
                try {
                    await putItem(TABLE, item);
                    inserted++;
                } catch (e) {
                    console.error(`❌ Error saving product ${item.codigo}: ${e.message}`);
                    errors++;
                }
            }
        }

        // Invalidate cache so next read reflects the new products
        invalidateCache();
        console.log(`📦 Catalog saved: ${inserted} products, ${errors} errors`);
        return { inserted, updated: 0, errors, total: products.length };
    }

    /**
     * Search products by reference (OEM or internal code).
     * @param {string} query - Search query
     * @returns {Array} - Matching products with calculated final price
     */
    async searchByReference(query, stageId = null) {
        const cleanQuery = query.trim().toLowerCase();
        const normalizedQuery = productNormalizer.normalizeQuery(query);
        
        try {
            // Use cache to avoid repeated full DynamoDB scans
            let allItems = await cachedScan();
            // Filter by allowed stages
            const allowedStages = await this._getAllowedStages(stageId);
            allItems = allItems.filter(i => allowedStages.includes(i.stage_id || 'stage_general'));
            
            // Level 1: Exact code match
            const exactCode = [];
            // Level 2: Code variant match
            const variantMatch = [];
            // Level 3: Partial code match
            const partial = [];

            for (const item of allItems) {
                const codigo = (item._codigo_lower || item.codigo || '').toLowerCase();
                const codigoNorm = (item._codigo_normalized || '').toLowerCase();
                const refOem = (item._ref_oem_lower || item.ref_oem || '').toLowerCase();
                const refFab = (item._ref_fabrica_lower || item.ref_fabrica || '').toLowerCase();
                const codeVariants = item._code_variants || [];

                // Level 1: Exact match on primary codes
                if (codigo === cleanQuery || refOem === cleanQuery || refFab === cleanQuery) {
                    exactCode.push(item);
                }
                // Level 2: Match against normalized code or variants
                else if (
                    codigoNorm === normalizedQuery ||
                    codeVariants.some(v => v.toLowerCase() === cleanQuery || v.toLowerCase() === normalizedQuery)
                ) {
                    variantMatch.push(item);
                }
                // Level 3: Partial match
                else if (
                    codigo.includes(cleanQuery) || cleanQuery.includes(codigo) ||
                    refOem.includes(cleanQuery) || refFab.includes(cleanQuery) ||
                    codigoNorm.includes(normalizedQuery)
                ) {
                    partial.push(item);
                }
            }

            const results = [...exactCode, ...variantMatch, ...partial].slice(0, 10);
            return results.map(row => this._addFinalPrice(row));
        } catch (err) {
            console.error(`❌ Search error: ${err.message}`);
            return [];
        }
    }

    /**
     * Get a single product by its exact internal code.
     * @param {string} code - Internal product code
     * @returns {Object|null}
     */
    async getByCode(code, stageId = null) {
        try {
            const item = await getItem(TABLE, { codigo: code.trim().toUpperCase() });
            if (!item) return null;
            // Validate the product belongs to the allowed stages
            const allowedStages = await this._getAllowedStages(stageId);
            if (!allowedStages.includes(item.stage_id || 'stage_general')) return null;
            return this._addFinalPrice(item);
        } catch (_) {
            return null;
        }
    }

    /**
     * Search products by description text.
     * @param {string} query - Search text
     * @returns {Array} - Matching products
     */
    async searchByDescription(query, stageId = null) {
        const cleanQuery = query.trim().toLowerCase();
        const searchWords = cleanQuery.split(/\s+/).filter(w => w.length >= 3);

        try {
            // Use cache to avoid repeated full DynamoDB scans
            let allItems = await cachedScan();
            // Filter by allowed stages
            const allowedStages = await this._getAllowedStages(stageId);
            allItems = allItems.filter(i => allowedStages.includes(i.stage_id || 'stage_general'));
            
            // Score each item by how many search words match its description
            const scored = allItems.map(item => {
                const desc = (item._descripcion_lower || item.descripcion || '').toLowerCase();
                const matchCount = searchWords.filter(w => desc.includes(w)).length;
                return { item, matchCount };
            }).filter(s => s.matchCount > 0);

            // Sort by relevance (most matches first)
            scored.sort((a, b) => b.matchCount - a.matchCount);

            return scored.slice(0, 10).map(s => this._addFinalPrice(s.item));
        } catch (err) {
            console.error(`❌ Description search error: ${err.message}`);
            return [];
        }
    }

    /**
     * Universal search with 5-level hierarchy:
     *   Level 1: Exact code match (via getByCode)
     *   Level 2: Code variant match (via _code_variants)
     *   Level 3: Partial code match (via includes)
     *   Level 4: Description word match
     *   Level 5: Fallback to RAG semantic (handled by caller)
     * @param {string} query - Search query
     * @returns {Array} - Matching products
     */
    async search(query, stageId = null) {
        // Level 1: Try exact code lookup first (O(1) DynamoDB getItem)
        const exactProduct = await this.getByCode(query, stageId);
        if (exactProduct) return [exactProduct];

        // Levels 2-3: Reference search (variants + partial) — scoped to stageId
        let results = await this.searchByReference(query, stageId);
        if (results.length > 0) return results;

        // Level 4: Description search — scoped to stageId
        results = await this.searchByDescription(query, stageId);
        if (results.length > 0) return results;

        // Level 5: No results — caller should fallback to RAG/semantic
        return [];
    }

    /**
     * Search with total match count — used for broad search detection.
     * Returns both the top results AND the total number of matches
     * so the caller can decide whether to ask clarifying questions.
     * @param {string} query - Search query
     * @param {string|null} stageId - Optional stage filter
     * @returns {Promise<{results: Array, totalMatches: number}>}
     */
    async searchWithCount(query, stageId = null) {
        // Level 1: Exact code match — always precise, no broad search possible
        const exactProduct = await this.getByCode(query, stageId);
        if (exactProduct) return { results: [exactProduct], totalMatches: 1 };

        // Levels 2-3: Reference search (variants + partial)
        let refResults = await this.searchByReference(query, stageId);
        if (refResults.length > 0) return { results: refResults, totalMatches: refResults.length };

        // Level 4: Description search — this is where broad searches happen
        const cleanQuery = query.trim().toLowerCase();
        const searchWords = cleanQuery.split(/\s+/).filter(w => w.length >= 3);

        try {
            let allItems = await cachedScan();
            const allowedStages = await this._getAllowedStages(stageId);
            allItems = allItems.filter(i => allowedStages.includes(i.stage_id || 'stage_general'));

            // Score each item
            const scored = allItems.map(item => {
                const desc = (item._descripcion_lower || item.descripcion || '').toLowerCase();
                const matchCount = searchWords.filter(w => desc.includes(w)).length;
                return { item, matchCount };
            }).filter(s => s.matchCount > 0);

            scored.sort((a, b) => b.matchCount - a.matchCount);

            const totalMatches = scored.length;
            const results = scored.slice(0, 10).map(s => this._addFinalPrice(s.item));

            return { results, totalMatches, allMatchedItems: scored.map(s => s.item) };
        } catch (err) {
            console.error(`❌ SearchWithCount error: ${err.message}`);
            return { results: [], totalMatches: 0 };
        }
    }

    /**
     * Extract facets (brands, frequent keywords, measures) from a set of matched products.
     * Used to generate intelligent clarifying questions for the customer.
     * @param {Array} matchedItems - Raw product items (not price-enriched)
     * @param {number} totalMatches - Total number of matches
     * @returns {Object} - { brands: [{name, count}], keywords: [{word, count}], totalMatches }
     */
    extractFacets(matchedItems, totalMatches) {
        const brandMap = {};
        const keywordMap = {};

        // Common stop words to exclude from keyword extraction
        const stopWords = new Set([
            'para', 'con', 'del', 'los', 'las', 'una', 'uno', 'por', 'sin',
            'que', 'mas', 'the', 'and', 'n/a', 'set', 'kit', 'juego'
        ]);

        for (const item of matchedItems) {
            // Count brands
            const brand = (item.marca || '').trim().toUpperCase();
            if (brand && brand !== 'N/A') {
                brandMap[brand] = (brandMap[brand] || 0) + 1;
            }

            // Extract meaningful keywords from description
            const desc = (item.descripcion || '').toUpperCase();
            const words = desc.split(/[\s,\-\/()]+/).filter(w =>
                w.length >= 3 && !stopWords.has(w.toLowerCase()) && !/^\d+$/.test(w)
            );
            for (const word of words) {
                keywordMap[word] = (keywordMap[word] || 0) + 1;
            }
        }

        // Sort brands by count (most common first)
        const brands = Object.entries(brandMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        // Extract keywords that appear in multiple products (potential differentiators)
        // but NOT in all products (those are the search terms themselves, not differentiators)
        const threshold = Math.max(2, Math.floor(totalMatches * 0.05)); // at least 5% of products
        const ceiling = Math.floor(totalMatches * 0.9); // skip if in 90%+ of products
        const keywords = Object.entries(keywordMap)
            .filter(([, count]) => count >= threshold && count <= ceiling)
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);

        return { brands, keywords, totalMatches };
    }

    /**
     * Search with accumulated filters from the conversation.
     * Applies brand/keyword/measure filters on top of the base description search.
     * @param {string} query - Base search query (e.g., "anillos motor")
     * @param {Object} filters - { brand, keywords[] } accumulated from conversation
     * @param {string|null} stageId - Optional stage filter
     * @returns {Promise<{results: Array, totalMatches: number}>}
     */
    async searchFiltered(query, filters = {}, stageId = null) {
        const cleanQuery = query.trim().toLowerCase();
        const searchWords = cleanQuery.split(/\s+/).filter(w => w.length >= 3);

        // Merge filter keywords into search words for broader matching
        if (filters.keywords && filters.keywords.length > 0) {
            for (const kw of filters.keywords) {
                const kwLower = kw.trim().toLowerCase();
                if (kwLower.length >= 3 && !searchWords.includes(kwLower)) {
                    searchWords.push(kwLower);
                }
            }
        }

        try {
            let allItems = await cachedScan();
            const allowedStages = await this._getAllowedStages(stageId);
            allItems = allItems.filter(i => allowedStages.includes(i.stage_id || 'stage_general'));

            // Apply brand filter if provided
            if (filters.brand) {
                const brandFilter = filters.brand.trim().toUpperCase();
                allItems = allItems.filter(i => {
                    const brand = (i.marca || '').trim().toUpperCase();
                    return brand.includes(brandFilter) || brandFilter.includes(brand);
                });
            }

            // Score by description match
            const scored = allItems.map(item => {
                const desc = (item._descripcion_lower || item.descripcion || '').toLowerCase();
                const matchCount = searchWords.filter(w => desc.includes(w)).length;
                return { item, matchCount };
            }).filter(s => s.matchCount > 0);

            scored.sort((a, b) => b.matchCount - a.matchCount);

            const totalMatches = scored.length;
            const results = scored.slice(0, 10).map(s => this._addFinalPrice(s.item));

            return { results, totalMatches };
        } catch (err) {
            console.error(`❌ SearchFiltered error: ${err.message}`);
            return { results: [], totalMatches: 0 };
        }
    }

    /**
     * Get all products with pagination.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Items per page
     * @param {string} [marca] - Optional brand filter
     * @returns {Object} - { products, total, page, totalPages }
     */
    async getAll(page = 1, limit = 50, marca = null, stageId = null) {
        try {
            // Use cache to avoid repeated full DynamoDB scans
            let items = await cachedScan();

            // Filter by allowed stages
            const allowedStages = await this._getAllowedStages(stageId);
            items = items.filter(i => allowedStages.includes(i.stage_id || 'stage_general'));
            
            if (marca) {
                items = items.filter(i => (i.marca || '').toLowerCase() === marca.toLowerCase());
            }

            // Sort by codigo
            items.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));

            const total = items.length;
            const offset = (page - 1) * limit;
            const paged = items.slice(offset, offset + limit);

            return {
                products: paged.map(row => this._addFinalPrice(row)),
                total,
                page,
                totalPages: Math.ceil(total / limit),
            };
        } catch (err) {
            console.error(`❌ GetAll error: ${err.message}`);
            return { products: [], total: 0, page, totalPages: 0 };
        }
    }

    /**
     * Get catalog statistics, optionally scoped to a stage.
     * @param {string|null} stageId - Optional stage filter
     * @returns {Object} - Stats object
     */
    async getStats(stageId = null) {
        // Short-circuit: return cached stats if same stageId and still fresh
        const now = Date.now();
        if (_statsCache && _statsCache.stageId === (stageId || null) && _statsCache.expiresAt > now) {
            return _statsCache.stats;
        }

        try {
            // Use cache to avoid repeated full DynamoDB scans
            let items = await cachedScan();

            // Filter by allowed stages
            const allowedStages = await this._getAllowedStages(stageId);
            items = items.filter(i => allowedStages.includes(i.stage_id || 'stage_general'));

            const totalProducts = items.length;

            // Group by brand
            const brandMap = {};
            let priceSum = 0;
            let priceCount = 0;

            for (const item of items) {
                if (item.marca) {
                    brandMap[item.marca] = (brandMap[item.marca] || 0) + 1;
                }
                if (item.precio_base > 0) {
                    priceSum += item.precio_base;
                    priceCount++;
                }
            }

            const brands = Object.entries(brandMap)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            const avgPrice = priceCount > 0 ? Math.round(priceSum / priceCount) : 0;

            // Calculate average final price using the centralized formula
            const avgMargin = avgPrice * (MARGIN_PERCENT / 100);
            const avgChatbot = avgPrice * (CHATBOT_PERCENT / 100);
            const avgSubtotal = avgPrice + avgMargin + avgChatbot;
            const avgIva = avgSubtotal * (IVA_PERCENT / 100);

            const stats = {
                totalProducts,
                brands,
                avgPrice,
                avgPriceFinal: Math.round(avgSubtotal + avgIva),
            };

            // Store in stats cache. Invalidated immediately on any write, so
            // STATS_CACHE_TTL (5 min) is just a safety fallback.
            _statsCache = { stats, stageId: stageId || null, expiresAt: now + STATS_CACHE_TTL };
            return stats;
        } catch (err) {
            console.error(`❌ Stats error: ${err.message}`);
            return { totalProducts: 0, brands: [], avgPrice: 0 };
        }
    }

    /**
     * Delete all products from the catalog.
     * @returns {number} - Number of deleted items
     */
    async clearAll(stageId = null) {
        try {
            let items = await cachedScan();

            // If stageId is provided, only clear products for that stage
            if (stageId) {
                items = items.filter(i => (i.stage_id || 'stage_general') === stageId);
            }

            let deleted = 0;
            for (const item of items) {
                await deleteItem(TABLE, { codigo: item.codigo });
                deleted++;
            }

            // Invalidate cache after bulk delete
            invalidateCache();
            console.log(`🗑️ Cleared ${deleted} products${stageId ? ` for stage ${stageId}` : ''} from catalog`);
            return deleted;
        } catch (err) {
            console.error(`❌ ClearAll error: ${err.message}`);
            return 0;
        }
    }

    /**
     * Delete all products that belong to a specific catalog source file within a stage.
     * This is the cascade-delete called when a catalog job record is removed.
     * @param {string} catalogSource - Original filename of the catalog (job.fileName)
     * @param {string} [stageId] - Optional: restrict deletion to a specific stage
     * @returns {number} - Number of deleted items
     */
    async deleteBySource(catalogSource, stageId = null) {
        if (!catalogSource) return 0;
        try {
            // Use cache to get all items (avoids an extra scan)
            let items = await cachedScan();

            // Match by catalog_source (exact filename)
            items = items.filter(i => i.catalog_source === catalogSource);

            // Further restrict to a specific stage if provided
            if (stageId) {
                items = items.filter(i => (i.stage_id || 'stage_general') === stageId);
            }

            let deleted = 0;
            for (const item of items) {
                await deleteItem(TABLE, { codigo: item.codigo });
                deleted++;
            }

            // Invalidate cache after bulk delete
            invalidateCache();
            console.log(`🗑️ Deleted ${deleted} products from source "${catalogSource}"${stageId ? ` (stage: ${stageId})` : ''}`);
            return deleted;
        } catch (err) {
            console.error(`❌ DeleteBySource error: ${err.message}`);
            return 0;
        }
    }

    /**
     * Search from a chatbot query — detects references in natural language.
     * Returns a formatted response string if a product is found, or null.
     * 
     * @param {string} message - The raw user message
     * @returns {string|null} - Formatted response or null if no product found
     */
    async searchFromChatQuery(message, jid = null, stageId = null) {
        try {
            // Quick cache-based check: if catalog is empty skip the rest
            const items = await cachedScan();
            if (items.length === 0) return null;
        } catch (_) {
            return null;
        }

        const text = message.trim();
        const textLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // === REJECTION / DISCARD DETECTION ===
        // If the customer is expressing that something doesn't fit or is rejecting options,
        // skip catalog lookup entirely so the AI can ask clarifying questions.
        const rejectionPhrases = [
            'no me sirve', 'ninguna me sirve', 'ninguno me sirve', 'no sirve', 'no son', 'no es la',
            'no me funciona', 'no encaja', 'no coincide', 'ninguna', 'ninguno',
            'de esas ninguna', 'de esos ninguno', 'otra medida', 'otra referencia', 'diferente medida',
            'no, de esas', 'no de esas', 'no me queda', 'no es lo que', 'no corresponde',
            'busco otra', 'necesito otra', 'quiero otra', 'diferente', 'otro modelo', 'otra marca'
        ];
        const isRejection = rejectionPhrases.some(ph => textLower.includes(ph));
        if (isRejection) {
            console.log('🔄 [Catalog] Rejection/discard phrase detected — skipping catalog lookup, letting AI ask clarifying questions.');
            return null;
        }

        // === PRICE REQUEST DETECTION ===
        const priceRequestWords = ['si', 'precio', 'dale', 'cuanto', 'cuanto cuesta', 'cuanto vale', 'dime', 'dime el precio', 'ok', 'vale', 'claro', 'por favor', 'porfavor', 'porfa'];
        const isPriceRequest = textLower.length < 30 && priceRequestWords.some(w => textLower.includes(w));

        if (isPriceRequest && jid) {
            try {
                const chatHistoryService = require('./chatHistory.service');
                const conversation = await chatHistoryService.getMessages(jid);
                if (conversation.messages && conversation.messages.length > 0) {
                    const recent = conversation.messages.slice(-10);
                    const codeRegex = /\b([A-Z]{2,4}-\d{2}-\d{3,4})\b/g;

                    for (let i = recent.length - 1; i >= 0; i--) {
                        const msgText = recent[i].text || '';
                        const codes = msgText.match(codeRegex);
                        if (codes && codes.length > 0) {
                            const product = await this.getByCode(codes[0], stageId);
                            if (product) {
                                console.log(`💰 Price request detected. Product: ${codes[0]}, Price: $${product.precio_final}`);
                                return this._formatPriceResponse(product);
                            }
                        }
                    }
                }
            } catch (histErr) {
                console.warn('⚠️ Could not check history for price request:', histErr.message);
            }
        }

        // Pattern 1: OEM-style references
        const oemPattern = /\b(\d{4,5}[-\s]?\w{3,8})\b/gi;
        const oemMatches = text.match(oemPattern);

        // Pattern 2: Internal codes
        const codePattern = /\b([A-Z]{2,4}[-\s]?\d{2}[-\s]?\d{3,4})\b/gi;
        const codeMatches = text.match(codePattern);

        // Pattern 3: Manufacturer ref codes
        const refFabPattern = /\b([A-Z]\w{2,10}[-\s](?:STD|\d{1,2}\.?\d{0,2}|\w{2,10}))\b/gi;
        const refFabMatches = text.match(refFabPattern);

        const allRefs = [...(codeMatches || []), ...(oemMatches || []), ...(refFabMatches || [])];

        for (const ref of allRefs) {
            const results = await this.searchByReference(ref, stageId);
            if (results.length > 0) {
                return this._formatChatResponse(results.slice(0, 5));
            }
        }

        // Pattern 4: Natural language product questions
        const productKeywords = ['tienes', 'tienen', 'precio', 'referencia', 'repuesto', 'cuanto', 'cuánto', 'cuesta', 'vale', 'busco', 'necesito', 'cotiza'];
        const msgLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const hasProductIntent = productKeywords.some(kw => msgLower.includes(kw));

        if (hasProductIntent && text.length > 10) {
            const stopWords = ['la', 'el', 'de', 'del', 'para', 'un', 'una', 'los', 'las', 'que', 'por', 'con', 'en', 'al', 'es', 'se', 'si', 'no', 'ya', 'me', 'le', 'te', 'su', 'mi', 'nos', 'tienes', 'tienen', 'tiene', 'precio', 'referencia', 'repuesto', 'cuanto', 'cuesta', 'vale', 'busco', 'necesito', 'cotiza', 'hola', 'buenos', 'dias', 'buenas', 'tardes', 'noches', 'tambien', 'preguntar', 'ese', 'eso', 'este', 'esta'];
            const searchWords = msgLower
                .replace(/[¿?.,!¡]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length >= 3 && !stopWords.includes(w));
            const searchTerms = searchWords.join(' ');

            if (searchTerms.length >= 3) {
                let results = await this.searchByDescription(searchTerms, stageId);
                
                if (results.length > 0 && searchWords.length > 0) {
                    const primaryKeyword = searchWords[0].toUpperCase();
                    const filtered = results.filter(r => 
                        (r.descripcion || '').toUpperCase().includes(primaryKeyword)
                    );
                    if (filtered.length > 0) {
                        results = filtered;
                    }
                }

                if (results.length > 0) {
                    return this._formatChatResponse(results.slice(0, 5));
                }
            }
        }

        return null;
    }

    // ── Formatting helpers ──

    _formatChatResponse(products) {
        if (products.length === 0) return null;

        if (products.length === 1) {
            const p = products[0];
            const desc = this._truncateDesc(p.descripcion);
            const parts = [];
            parts.push(`sumercé con gusto le doy la información de ese repuesto`);
            parts.push(`Codigo: ${p.codigo} - ${desc} - Marca: ${p.marca || 'N/A'}`);
            if (p.precio_final > 0) {
                parts.push(`el precio es $${this._formatNumber(p.precio_final)}`);
            }
            parts.push(`con gusto le podemos hacer el pedido`);
            return parts.join(' ||| ');
        }

        const parts = [];
        parts.push(`sumercé tenemos ${products.length} referencias para ese repuesto me dice cuál le interesa`);

        for (let i = 0; i < products.length; i++) {
            const p = products[i];
            const desc = this._truncateDesc(p.descripcion);
            parts.push(`${i + 1}. ${p.codigo} - ${desc} - ${p.marca || 'N/A'}`);
        }

        parts.push(`me indica el número o la referencia que le interesa y le doy el precio`);
        return parts.join(' ||| ');
    }

    _formatPriceResponse(product) {
        const desc = this._truncateDesc(product.descripcion);
        const parts = [];

        if (product.precio_final > 0) {
            parts.push(`sumercé el precio de ${desc} es $${this._formatNumber(product.precio_final)}`);
        } else {
            parts.push(`sumercé ese repuesto no tiene precio registrado en este momento`);
        }
        parts.push(`con gusto le podemos hacer el pedido o buscar otra referencia`);
        return parts.join(' ||| ');
    }

    _truncateDesc(desc) {
        if (!desc) return 'N/A';
        if (desc.length <= 80) return desc;
        return desc.substring(0, 77) + '...';
    }

    /**
     * Adds precio_final to a product row using centralized pricing config.
     * Formula: Subtotal = Base + Margin + Chatbot, then IVA on Subtotal.
     */
    _addFinalPrice(row) {
        const breakdown = this._getPriceBreakdown(row);
        return {
            ...row,
            precio_final: breakdown.precio_final,
        };
    }

    /**
     * Returns a full price breakdown object for a product.
     * Used by the admin panel to display how the final price is constructed.
     * @param {Object} row - Product row with precio_base
     * @returns {Object} - { precio_base, margen, gastos_chatbot, subtotal, iva, precio_final, config }
     */
    _getPriceBreakdown(row) {
        const base = row.precio_base || 0;
        const margen = base * (MARGIN_PERCENT / 100);
        const gastos_chatbot = base * (CHATBOT_PERCENT / 100);
        const subtotal = base + margen + gastos_chatbot;
        const iva = subtotal * (IVA_PERCENT / 100);
        const precio_final = Math.round(subtotal + iva);

        return {
            precio_base: base,
            margen: Math.round(margen),
            gastos_chatbot: Math.round(gastos_chatbot),
            subtotal: Math.round(subtotal),
            iva: Math.round(iva),
            precio_final,
            config: {
                margin_percent: MARGIN_PERCENT,
                chatbot_percent: CHATBOT_PERCENT,
                iva_percent: IVA_PERCENT,
            },
        };
    }

    /**
     * Public method to get price breakdown for a product.
     * @param {Object} product - Product object with precio_base
     * @returns {Object} - Full price breakdown
     */
    getPriceBreakdown(product) {
        return this._getPriceBreakdown(product);
    }

    _formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    async _getAllowedStages(stageId = null) {
        if (stageId) return [stageId];
        try {
            const stagesService = require('./stages.service');
            const stages = await stagesService.getAll();
            const activeStages = stages.filter(s => s.active).map(s => s.stageId);
            return activeStages.length > 0 ? activeStages : ['stage_general'];
        } catch (_) {
            return ['stage_general'];
        }
    }
}

module.exports = new ProductCatalogService();
