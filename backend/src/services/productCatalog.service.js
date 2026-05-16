/**
 * Product Catalog Service — DynamoDB Version
 * 
 * Business logic for managing products extracted from PDF catalogs.
 * Uses DynamoDB table: chatwifi-products (partition key: codigo)
 * Provides search capabilities for the chatbot.
 */

const { putItem, getItem, scanItems, batchPutItems, deleteItem } = require('../config/dynamodb');

const TABLE = 'products';

// Price markup: IVA 19% + 30% margin (base × 1.19 × 1.30)
const PRICE_MARKUP = 1.19 * 1.30;

class ProductCatalogService {
    /**
     * Save an array of products to DynamoDB (upsert by codigo).
     * @param {Array} products - Array of product objects from PDF parser
     * @param {string} catalogSource - Original filename for tracking
     * @returns {Object} - { inserted, updated, errors }
     */
    async saveProducts(products, catalogSource = null) {
        let inserted = 0;
        let errors = 0;

        const validProducts = products.filter(p => {
            if (!p.codigo) {
                errors++;
                return false;
            }
            return true;
        });

        // Prepare items for batch write
        const items = validProducts.map(p => ({
            codigo: p.codigo.trim().toUpperCase(),
            ref_oem: p.ref_oem || null,
            ref_fabrica: p.ref_fabrica || null,
            descripcion: p.descripcion || null,
            marca: p.marca || null,
            precio_base: p.precio_base || 0,
            catalog_source: catalogSource,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // Search helpers: lowercase versions for case-insensitive search
            _codigo_lower: (p.codigo || '').trim().toLowerCase(),
            _ref_oem_lower: (p.ref_oem || '').trim().toLowerCase(),
            _ref_fabrica_lower: (p.ref_fabrica || '').trim().toLowerCase(),
            _descripcion_lower: (p.descripcion || '').trim().toLowerCase(),
            _marca_lower: (p.marca || '').trim().toLowerCase()
        }));

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

        console.log(`📦 Catalog saved: ${inserted} products, ${errors} errors`);
        return { inserted, updated: 0, errors, total: products.length };
    }

    /**
     * Search products by reference (OEM or internal code).
     * @param {string} query - Search query
     * @returns {Array} - Matching products with calculated final price
     */
    async searchByReference(query) {
        const cleanQuery = query.trim().toLowerCase();
        
        try {
            const allItems = await scanItems(TABLE);
            
            // Exact matches first, then partial
            const exact = [];
            const partial = [];

            for (const item of allItems) {
                const codigo = (item._codigo_lower || item.codigo || '').toLowerCase();
                const refOem = (item._ref_oem_lower || item.ref_oem || '').toLowerCase();
                const refFab = (item._ref_fabrica_lower || item.ref_fabrica || '').toLowerCase();

                if (codigo === cleanQuery || refOem === cleanQuery || refFab === cleanQuery) {
                    exact.push(item);
                } else if (codigo.includes(cleanQuery) || refOem.includes(cleanQuery) || refFab.includes(cleanQuery)) {
                    partial.push(item);
                }
            }

            const results = [...exact, ...partial].slice(0, 10);
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
    async getByCode(code) {
        try {
            const item = await getItem(TABLE, { codigo: code.trim().toUpperCase() });
            if (!item) return null;
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
    async searchByDescription(query) {
        const cleanQuery = query.trim().toLowerCase();
        const searchWords = cleanQuery.split(/\s+/).filter(w => w.length >= 3);

        try {
            const allItems = await scanItems(TABLE);
            
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
     * Universal search: tries reference first, then description.
     * @param {string} query - Search query
     * @returns {Array} - Matching products
     */
    async search(query) {
        let results = await this.searchByReference(query);
        if (results.length > 0) return results;
        return this.searchByDescription(query);
    }

    /**
     * Get all products with pagination.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Items per page
     * @param {string} [marca] - Optional brand filter
     * @returns {Object} - { products, total, page, totalPages }
     */
    async getAll(page = 1, limit = 50, marca = null) {
        try {
            let items = await scanItems(TABLE);
            
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
     * Get catalog statistics.
     * @returns {Object} - Stats object
     */
    async getStats() {
        try {
            const items = await scanItems(TABLE);
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

            return {
                totalProducts,
                brands,
                avgPrice,
                avgPriceFinal: Math.round(avgPrice * PRICE_MARKUP),
            };
        } catch (err) {
            console.error(`❌ Stats error: ${err.message}`);
            return { totalProducts: 0, brands: [], avgPrice: 0 };
        }
    }

    /**
     * Delete all products from the catalog.
     * @returns {number} - Number of deleted items
     */
    async clearAll() {
        try {
            const items = await scanItems(TABLE);
            let deleted = 0;

            for (const item of items) {
                await deleteItem(TABLE, { codigo: item.codigo });
                deleted++;
            }

            console.log(`🗑️ Cleared ${deleted} products from catalog`);
            return deleted;
        } catch (err) {
            console.error(`❌ ClearAll error: ${err.message}`);
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
    async searchFromChatQuery(message, jid = null) {
        try {
            const items = await scanItems(TABLE);
            if (items.length === 0) return null;
        } catch (_) {
            return null;
        }

        const text = message.trim();
        const textLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

        // Pattern 1: OEM-style references
        const oemPattern = /\b(\d{4,5}[-]?\w{3,8})\b/gi;
        const oemMatches = text.match(oemPattern);

        // Pattern 2: Internal codes
        const codePattern = /\b([A-Z]{2,4}[-]?\d{2}[-]?\d{3,4})\b/gi;
        const codeMatches = text.match(codePattern);

        // Pattern 3: Manufacturer ref codes
        const refFabPattern = /\b([A-Z]\w{2,10}[-](?:STD|\d{1,2}\.?\d{0,2}|\w{2,10}))\b/gi;
        const refFabMatches = text.match(refFabPattern);

        const allRefs = [...(codeMatches || []), ...(oemMatches || []), ...(refFabMatches || [])];

        for (const ref of allRefs) {
            const results = await this.searchByReference(ref);
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
                let results = await this.searchByDescription(searchTerms);
                
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

    _addFinalPrice(row) {
        return {
            ...row,
            precio_final: Math.round((row.precio_base || 0) * PRICE_MARKUP),
        };
    }

    _formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
}

module.exports = new ProductCatalogService();
