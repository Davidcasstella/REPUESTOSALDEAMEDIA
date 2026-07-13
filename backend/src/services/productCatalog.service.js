/**
 * Product Catalog Service — DynamoDB Version
 * 
 * Business logic for managing products extracted from PDF catalogs.
 * Uses DynamoDB table "chatwifi-products" for storage.
 * Provides exact code lookup + fuzzy/semantic search for the chatbot.
 */

const {
    PutCommand,
    GetCommand,
    ScanCommand,
    BatchWriteCommand,
    QueryCommand,
    DeleteCommand
} = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = 'chatwifi-products';

// Price markup: IVA 19% + 30% margin (base × 1.19 × 1.30)
const PRICE_MARKUP = 1.19 * 1.30;

class ProductCatalogService {

    // ================================================================
    // DATA WRITE OPERATIONS
    // ================================================================

    /**
     * Save an array of products to DynamoDB (upsert by codigo).
     * Uses BatchWrite for efficiency (25 items per batch).
     * @param {Array} products - Array of product objects from PDF parser
     * @param {string} catalogSource - Original filename for tracking
     * @returns {Object} - { inserted, updated, errors }
     */
    async saveProducts(products, catalogSource = null) {
        let inserted = 0;
        let errors = 0;
        const now = new Date().toISOString();

        // Filter out products without a code
        const validProducts = products.filter(p => {
            if (!p.codigo) {
                errors++;
                return false;
            }
            return true;
        });

        // Build DynamoDB items
        const items = validProducts.map(p => ({
            codigo: p.codigo.trim(),
            ref_oem: p.ref_oem || null,
            ref_fabrica: p.ref_fabrica || null,
            descripcion: p.descripcion || null,
            marca: p.marca || 'SIN_MARCA',
            precio_base: p.precio_base || 0,
            catalog_source: catalogSource,
            // Pre-computed lowercase search field for fast fuzzy matching
            searchText: this._buildSearchText(p),
            created_at: now,
            updated_at: now
        }));

        // BatchWrite in chunks of 25 (DynamoDB limit)
        const batches = [];
        for (let i = 0; i < items.length; i += 25) {
            batches.push(items.slice(i, i + 25));
        }

        for (const batch of batches) {
            try {
                const requests = batch.map(item => ({
                    PutRequest: { Item: item }
                }));

                await docClient.send(new BatchWriteCommand({
                    RequestItems: {
                        [TABLE_NAME]: requests
                    }
                }));

                inserted += batch.length;
            } catch (err) {
                console.error(`❌ Batch write error: ${err.message}`);
                errors += batch.length;
            }
        }

        console.log(`📦 Catalog saved to DynamoDB: ${inserted} products, ${errors} errors`);
        return { inserted, updated: 0, errors, total: products.length };
    }

    /**
     * Delete all products from the catalog.
     * Scans all items and deletes them in batches.
     * @returns {number} - Number of deleted items
     */
    async clearAll() {
        try {
            // Scan all codes
            const allItems = await this._scanAll({
                ProjectionExpression: 'codigo'
            });

            if (allItems.length === 0) return 0;

            // Delete in batches of 25
            const batches = [];
            for (let i = 0; i < allItems.length; i += 25) {
                batches.push(allItems.slice(i, i + 25));
            }

            for (const batch of batches) {
                const requests = batch.map(item => ({
                    DeleteRequest: { Key: { codigo: item.codigo } }
                }));

                await docClient.send(new BatchWriteCommand({
                    RequestItems: {
                        [TABLE_NAME]: requests
                    }
                }));
            }

            console.log(`🗑️ Cleared ${allItems.length} products from DynamoDB catalog`);
            return allItems.length;
        } catch (err) {
            console.error(`❌ Error clearing catalog: ${err.message}`);
            return 0;
        }
    }

    // ================================================================
    // SEARCH OPERATIONS
    // ================================================================

    /**
     * Get a single product by its exact internal code (e.g. "TOI-03-152").
     * Direct GetItem — the fastest possible DynamoDB operation.
     * @param {string} code - Internal product code
     * @returns {Object|null}
     */
    async getByCode(code) {
        try {
            const result = await docClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { codigo: code.trim().toUpperCase() }
            }));

            if (!result.Item) {
                // Try case-insensitive scan (codes might be stored as-is from PDF)
                const items = await this._scanAll({
                    FilterExpression: 'begins_with(codigo, :prefix)',
                    ExpressionAttributeValues: {
                        ':prefix': code.trim().substring(0, 3).toUpperCase()
                    },
                    Limit: 50
                });

                const match = items.find(i =>
                    i.codigo.toUpperCase() === code.trim().toUpperCase()
                );

                if (!match) return null;
                return this._addFinalPrice(match);
            }

            return this._addFinalPrice(result.Item);
        } catch (err) {
            console.error(`❌ getByCode error: ${err.message}`);
            return null;
        }
    }

    /**
     * Search products by reference (OEM, internal code, or factory ref).
     * Step 1: Try exact GetItem by codigo.
     * Step 2: Scan with contains filter on all reference fields.
     * @param {string} query - Search query
     * @returns {Array} - Matching products with calculated final price
     */
    async searchByReference(query) {
        const cleanQuery = query.trim().toUpperCase();

        try {
            // Step 1: Exact match by codigo (fastest)
            const exact = await docClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { codigo: cleanQuery }
            }));

            if (exact.Item) {
                return [this._addFinalPrice(exact.Item)];
            }

            // Step 2: Scan for partial matches on code fields
            const items = await this._scanAll({
                FilterExpression:
                    'contains(codigo, :q) OR contains(ref_oem, :q) OR contains(ref_fabrica, :q)',
                ExpressionAttributeValues: {
                    ':q': cleanQuery
                }
            });

            // Sort: exact matches first, then partial
            items.sort((a, b) => {
                const aExact = (a.codigo === cleanQuery || a.ref_oem === cleanQuery || a.ref_fabrica === cleanQuery) ? 0 : 1;
                const bExact = (b.codigo === cleanQuery || b.ref_oem === cleanQuery || b.ref_fabrica === cleanQuery) ? 0 : 1;
                return aExact - bExact;
            });

            return items.slice(0, 10).map(row => this._addFinalPrice(row));
        } catch (err) {
            console.error(`❌ searchByReference error: ${err.message}`);
            return [];
        }
    }

    /**
     * Search products by description text (fuzzy keyword matching).
     * Since DynamoDB doesn't support FULLTEXT, we use the pre-computed
     * searchText field and rank results by keyword overlap score.
     * @param {string} query - Search text
     * @returns {Array} - Matching products sorted by relevance
     */
    async searchByDescription(query) {
        const cleanQuery = query.trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Split into meaningful keywords (>= 3 chars)
        const keywords = cleanQuery
            .replace(/[¿?.,!¡]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 3);

        if (keywords.length === 0) return [];

        try {
            // Build filter: at least the first keyword must appear in searchText
            // This reduces the scan size significantly
            const primaryKeyword = keywords[0];

            const items = await this._scanAll({
                FilterExpression: 'contains(searchText, :kw)',
                ExpressionAttributeValues: {
                    ':kw': primaryKeyword
                }
            });

            if (items.length === 0) {
                // Fallback: try with shorter prefix of primary keyword
                if (primaryKeyword.length >= 4) {
                    const prefix = primaryKeyword.substring(0, 4);
                    const fallbackItems = await this._scanAll({
                        FilterExpression: 'contains(searchText, :kw)',
                        ExpressionAttributeValues: {
                            ':kw': prefix
                        }
                    });
                    return this._rankByRelevance(fallbackItems, keywords).slice(0, 10);
                }
                return [];
            }

            return this._rankByRelevance(items, keywords).slice(0, 10);
        } catch (err) {
            console.error(`❌ searchByDescription error: ${err.message}`);
            return [];
        }
    }

    /**
     * Universal search: tries reference first, then description.
     * @param {string} query - Search query
     * @returns {Array} - Matching products
     */
    async search(query) {
        // First try reference search (exact/partial match on codes)
        let results = await this.searchByReference(query);
        if (results.length > 0) return results;

        // Fallback to description search
        return this.searchByDescription(query);
    }

    // ================================================================
    // PAGINATION & STATS
    // ================================================================

    /**
     * Get all products with pagination.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Items per page
     * @param {string} [marca] - Optional brand filter
     * @returns {Object} - { products, total, page, totalPages }
     */
    async getAll(page = 1, limit = 50, marca = null) {
        try {
            let items;

            if (marca) {
                // Use GSI for brand filtering
                items = await this._queryByMarca(marca);
            } else {
                items = await this._scanAll();
            }

            // Sort by codigo
            items.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));

            const total = items.length;
            const totalPages = Math.ceil(total / limit);
            const offset = (page - 1) * limit;
            const paged = items.slice(offset, offset + limit);

            return {
                products: paged.map(row => this._addFinalPrice(row)),
                total,
                page,
                totalPages,
            };
        } catch (err) {
            console.error(`❌ getAll error: ${err.message}`);
            return { products: [], total: 0, page, totalPages: 0 };
        }
    }

    /**
     * Get catalog statistics.
     * @returns {Object} - Stats object
     */
    async getStats() {
        try {
            const items = await this._scanAll({
                ProjectionExpression: 'codigo, marca, precio_base'
            });

            if (items.length === 0) {
                return { totalProducts: 0, brands: [], avgPrice: 0, avgPriceFinal: 0 };
            }

            // Count by brand
            const brandMap = {};
            let totalPrice = 0;
            let priceCount = 0;

            for (const item of items) {
                const m = item.marca || 'SIN_MARCA';
                brandMap[m] = (brandMap[m] || 0) + 1;

                if (item.precio_base > 0) {
                    totalPrice += item.precio_base;
                    priceCount++;
                }
            }

            const brands = Object.entries(brandMap)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            const avgPrice = priceCount > 0 ? Math.round(totalPrice / priceCount) : 0;

            return {
                totalProducts: items.length,
                brands,
                avgPrice,
                avgPriceFinal: Math.round(avgPrice * PRICE_MARKUP),
            };
        } catch (err) {
            console.error(`❌ getStats error: ${err.message}`);
            return { totalProducts: 0, brands: [], avgPrice: 0, avgPriceFinal: 0 };
        }
    }

    // ================================================================
    // CHATBOT INTEGRATION
    // ================================================================

    /**
     * Search from a chatbot query — detects references in natural language.
     * Returns a formatted response string if a product is found, or null.
     * 
     * This is the main integration point with the chatbot. It's called
     * BEFORE the RAG search in aiResponse.service.js.
     * 
     * @param {string} message - The raw user message
     * @param {string} jid - WhatsApp JID for conversation context
     * @returns {string|null} - Formatted response or null if no product found
     */
    async searchFromChatQuery(message, jid = null) {
        // Quick check: does the table have data?
        try {
            const sample = await this._scanAll({
                Limit: 1,
                ProjectionExpression: 'codigo'
            });
            if (sample.length === 0) return null;
        } catch (_) {
            return null;
        }

        const text = message.trim();
        const textLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // === PRICE REQUEST DETECTION ===
        // If user sends a short message asking for price ("si", "precio", "dale", "cuanto"),
        // scan conversation history for the most recent product code and return real price.
        const priceRequestWords = ['si', 'precio', 'dale', 'cuanto', 'cuanto cuesta', 'cuanto vale', 'dime', 'dime el precio', 'ok', 'vale', 'claro', 'por favor', 'porfavor', 'porfa'];
        const isPriceRequest = textLower.length < 30 && priceRequestWords.some(w => textLower.includes(w));

        if (isPriceRequest && jid) {
            try {
                const chatHistoryService = require('./chatHistory.service');
                const conversation = await chatHistoryService.getMessages(jid);
                if (conversation.messages && conversation.messages.length > 0) {
                    // Scan last 10 messages for product codes
                    const recent = conversation.messages.slice(-10);
                    const codeRegex = /\b([A-Z]{2,4}-\d{2}-\d{3,4})\b/g;

                    for (let i = recent.length - 1; i >= 0; i--) {
                        const msgText = recent[i].text || '';
                        const codes = msgText.match(codeRegex);
                        if (codes && codes.length > 0) {
                            // Found a product code! Look it up
                            const product = await this.getByCode(codes[0]);
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

        // Pattern 1: OEM-style references (e.g., 48510-0K100, 48820-47010, 13011-30051)
        const oemPattern = /\b(\d{4,5}[-]?\w{3,8})\b/gi;
        const oemMatches = text.match(oemPattern);

        // Pattern 2: Internal codes — all brand prefixes (TOI, ISI, HYI, DAI, etc.)
        const codePattern = /\b([A-Z]{2,4}[-]?\d{2}[-]?\d{3,4})\b/gi;
        const codeMatches = text.match(codePattern);

        // Pattern 3: Manufacturer ref codes (e.g., M184A1-STD, U3768G, HSL-62044L)
        const refFabPattern = /\b([A-Z]\w{2,10}[-](?:STD|\d{1,2}\.?\d{0,2}|\w{2,10}))\b/gi;
        const refFabMatches = text.match(refFabPattern);

        // Try each matched reference
        const allRefs = [...(codeMatches || []), ...(oemMatches || []), ...(refFabMatches || [])];

        for (const ref of allRefs) {
            const results = await this.searchByReference(ref);
            if (results.length > 0) {
                return this._formatChatResponse(results.slice(0, 5));
            }
        }

        // Pattern 4: If the message looks like a direct product question
        // (e.g., "tienes amortiguadores para hilux", "precio de pastillas toyota")
        const productKeywords = ['tienes', 'tienen', 'precio', 'referencia', 'repuesto', 'cuanto', 'cuánto', 'cuesta', 'vale', 'busco', 'necesito', 'cotiza'];
        const msgLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const hasProductIntent = productKeywords.some(kw => msgLower.includes(kw));

        if (hasProductIntent && text.length > 10) {
            // Extract meaningful search terms (remove common words)
            const stopWords = ['la', 'el', 'de', 'del', 'para', 'un', 'una', 'los', 'las', 'que', 'por', 'con', 'en', 'al', 'es', 'se', 'si', 'no', 'ya', 'me', 'le', 'te', 'su', 'mi', 'nos', 'tienes', 'tienen', 'tiene', 'precio', 'referencia', 'repuesto', 'cuanto', 'cuesta', 'vale', 'busco', 'necesito', 'cotiza', 'hola', 'buenos', 'dias', 'buenas', 'tardes', 'noches', 'tambien', 'preguntar', 'ese', 'eso', 'este', 'esta'];
            const searchWords = msgLower
                .replace(/[¿?.,!¡]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length >= 3 && !stopWords.includes(w));
            const searchTerms = searchWords.join(' ');

            if (searchTerms.length >= 3) {
                let results = await this.searchByDescription(searchTerms);

                // Quality filter: ensure the first keyword actually appears in the results
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

        // ═══════════════════════════════════════════════════════════
        // FINAL FALLBACK: Universal description search
        // If nothing else matched, always try a description search
        // for any query longer than 8 characters. This catches cases
        // like "PUNTA EJE SUZ. ALTO/WAGON R L/RUEDA (23X18X49)" where
        // the user types a product description directly.
        // ═══════════════════════════════════════════════════════════
        if (text.length > 8) {
            const fallbackWords = msgLower
                .replace(/[¿?.,!¡()\[\]]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length >= 3);
            const fallbackTerms = fallbackWords.join(' ');

            if (fallbackTerms.length >= 3) {
                console.log(`🔎 Fallback description search: "${fallbackTerms}"`);
                let results = await this.searchByDescription(fallbackTerms);

                if (results.length > 0) {
                    return this._formatChatResponse(results.slice(0, 5));
                }

                // Last resort: try with just the first 2 meaningful words
                if (fallbackWords.length >= 2) {
                    const twoWordSearch = fallbackWords.slice(0, 2).join(' ');
                    results = await this.searchByDescription(twoWordSearch);
                    if (results.length > 0) {
                        return this._formatChatResponse(results.slice(0, 5));
                    }
                }
            }
        }

        return null;
    }

    // ================================================================
    // FORMATTING HELPERS
    // ================================================================

    /**
     * Format product results for the chatbot response.
     * Uses the ||| separator pattern used by the existing system prompt.
     * @param {Array} products - Product results
     * @returns {string} - Formatted response string
     */
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

        // Multiple results: list all options WITHOUT price so client can choose first
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

    /**
     * Format a price response for a specific product.
     * @param {Object} product - Product with precio_final already calculated
     * @returns {string} - Formatted price response
     */
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

    // ================================================================
    // INTERNAL HELPERS
    // ================================================================

    /**
     * Build a normalized search text field for a product.
     * This is stored in DynamoDB and used for contains() filters.
     * @param {Object} product - Product object
     * @returns {string} - Normalized lowercase concatenation of all searchable fields
     */
    _buildSearchText(product) {
        const parts = [
            product.codigo || '',
            product.ref_oem || '',
            product.ref_fabrica || '',
            product.descripcion || '',
            product.marca || ''
        ];
        return parts.join(' ').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Rank products by keyword relevance score.
     * @param {Array} items - DynamoDB items
     * @param {string[]} keywords - Search keywords (lowercase, no accents)
     * @returns {Array} - Products sorted by score DESC with precio_final
     */
    _rankByRelevance(items, keywords) {
        const scored = items.map(item => {
            const searchText = (item.searchText || '').toLowerCase();
            let score = 0;

            for (const kw of keywords) {
                // Exact word match
                if (searchText.includes(kw)) {
                    score += 3;
                }
                // Prefix match (for stems)
                else if (kw.length >= 5 && searchText.includes(kw.substring(0, 4))) {
                    score += 1;
                }
            }

            return { ...this._addFinalPrice(item), _score: score };
        });

        return scored
            .filter(s => s._score > 0)
            .sort((a, b) => b._score - a._score);
    }

    /**
     * Truncate a product description for chat readability.
     * @param {string} desc - Raw description
     * @returns {string} - Truncated description
     */
    _truncateDesc(desc) {
        if (!desc) return 'N/A';
        if (desc.length <= 80) return desc;
        return desc.substring(0, 77) + '...';
    }

    /**
     * Add calculated final price to a product row.
     * @param {Object} row - DynamoDB item
     * @returns {Object} - Row with precio_final added
     */
    _addFinalPrice(row) {
        return {
            ...row,
            precio_final: Math.round((row.precio_base || 0) * PRICE_MARKUP),
        };
    }

    /**
     * Format a number with Colombian-style thousand separators.
     * 105950 → "105.950"
     * @param {number} num
     * @returns {string}
     */
    _formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    // ================================================================
    // DYNAMODB SCAN/QUERY HELPERS
    // ================================================================

    /**
     * Full scan with automatic pagination (handles LastEvaluatedKey).
     * @param {Object} params - Optional FilterExpression, ExpressionAttributeValues, etc.
     * @returns {Array} - All matching items
     */
    async _scanAll(params = {}) {
        const items = [];
        let lastKey = undefined;

        // Extract Limit if it's meant to cap total results (not per-page)
        const totalLimit = params.Limit;
        const scanParams = { ...params };
        delete scanParams.Limit;

        do {
            const result = await docClient.send(new ScanCommand({
                TableName: TABLE_NAME,
                ExclusiveStartKey: lastKey,
                ...scanParams
            }));

            items.push(...(result.Items || []));
            lastKey = result.LastEvaluatedKey;

            // Respect total limit
            if (totalLimit && items.length >= totalLimit) {
                return items.slice(0, totalLimit);
            }
        } while (lastKey);

        return items;
    }

    /**
     * Query products by brand using the GSI.
     * @param {string} marca - Brand name
     * @returns {Array}
     */
    async _queryByMarca(marca) {
        try {
            const result = await docClient.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'marca-index',
                KeyConditionExpression: 'marca = :m',
                ExpressionAttributeValues: {
                    ':m': marca
                }
            }));
            return result.Items || [];
        } catch (err) {
            console.error(`❌ queryByMarca error: ${err.message}`);
            return [];
        }
    }
}

module.exports = new ProductCatalogService();
