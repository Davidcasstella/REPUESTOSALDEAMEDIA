/**
 * Product Catalog Service
 * 
 * Business logic for managing products extracted from PDF catalogs.
 * Uses MySQL for storage and provides search capabilities for the chatbot.
 */

const { getPool } = require('../config/database');

// Price markup: IVA 19% + 30% margin (base × 1.19 × 1.30)
const PRICE_MARKUP = 1.19 * 1.30;

class ProductCatalogService {
    /**
     * Save an array of products to the database (upsert by codigo).
     * @param {Array} products - Array of product objects from PDF parser
     * @param {string} catalogSource - Original filename for tracking
     * @returns {Object} - { inserted, updated, errors }
     */
    async saveProducts(products, catalogSource = null) {
        const pool = await getPool();
        if (!pool) throw new Error('Database not available');

        let inserted = 0;
        let updated = 0;
        let errors = 0;

        for (const product of products) {
            try {
                // Skip products with no code
                if (!product.codigo) {
                    errors++;
                    continue;
                }

                const [result] = await pool.execute(
                    `INSERT INTO products (codigo, ref_oem, ref_fabrica, descripcion, marca, precio_base, catalog_source)
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        ref_oem = VALUES(ref_oem),
                        ref_fabrica = VALUES(ref_fabrica),
                        descripcion = VALUES(descripcion),
                        marca = VALUES(marca),
                        precio_base = VALUES(precio_base),
                        catalog_source = VALUES(catalog_source),
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        product.codigo,
                        product.ref_oem || null,
                        product.ref_fabrica || null,
                        product.descripcion || null,
                        product.marca || null,
                        product.precio_base || 0,
                        catalogSource
                    ]
                );

                if (result.affectedRows === 1) {
                    inserted++;
                } else if (result.affectedRows === 2) {
                    // MySQL reports 2 affected rows on UPDATE via ON DUPLICATE KEY
                    updated++;
                }
            } catch (err) {
                console.error(`❌ Error saving product ${product.codigo}: ${err.message}`);
                errors++;
            }
        }

        console.log(`📦 Catalog saved: ${inserted} new, ${updated} updated, ${errors} errors`);
        return { inserted, updated, errors, total: products.length };
    }

    /**
     * Search products by reference (OEM or internal code).
     * Supports exact and partial matching.
     * @param {string} query - Search query
     * @returns {Array} - Matching products with calculated final price
     */
    async searchByReference(query) {
        const pool = await getPool();
        if (!pool) return [];

        const cleanQuery = query.trim().toUpperCase();

        const [rows] = await pool.execute(
            `SELECT * FROM products 
             WHERE UPPER(codigo) = ? 
                OR UPPER(ref_oem) = ? 
                OR UPPER(ref_fabrica) = ?
                OR UPPER(codigo) LIKE ? 
                OR UPPER(ref_oem) LIKE ?
                OR UPPER(ref_fabrica) LIKE ?
             ORDER BY 
                CASE 
                    WHEN UPPER(codigo) = ? OR UPPER(ref_oem) = ? OR UPPER(ref_fabrica) = ? THEN 0 
                    ELSE 1 
                END,
                codigo
             LIMIT 10`,
            [cleanQuery, cleanQuery, cleanQuery, `%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`, cleanQuery, cleanQuery, cleanQuery]
        );

        return rows.map(row => this._addFinalPrice(row));
    }

    /**
     * Get a single product by its exact internal code (e.g. "TOI-03-152").
     * Returns the product with precio_final calculated, or null if not found.
     * @param {string} code - Internal product code
     * @returns {Object|null}
     */
    async getByCode(code) {
        const pool = await getPool();
        if (!pool) return null;
        try {
            const [rows] = await pool.execute(
                'SELECT * FROM products WHERE UPPER(codigo) = ? LIMIT 1',
                [code.trim().toUpperCase()]
            );
            if (rows.length === 0) return null;
            return this._addFinalPrice(rows[0]);
        } catch (_) {
            return null;
        }
    }

    /**
     * Search products by description text (fulltext search).
     * @param {string} query - Search text
     * @returns {Array} - Matching products with calculated final price
     */
    async searchByDescription(query) {
        const pool = await getPool();
        if (!pool) return [];

        const cleanQuery = query.trim();

        // Try FULLTEXT search first
        try {
            const [rows] = await pool.execute(
                `SELECT *, MATCH(descripcion) AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance
                 FROM products 
                 WHERE MATCH(descripcion) AGAINST(? IN NATURAL LANGUAGE MODE)
                 ORDER BY relevance DESC
                 LIMIT 10`,
                [cleanQuery, cleanQuery]
            );

            if (rows.length > 0) {
                return rows.map(row => this._addFinalPrice(row));
            }
        } catch (_) {
            // FULLTEXT may fail for very short queries; fall back to LIKE
        }

        // Fallback: LIKE search
        const [rows] = await pool.execute(
            `SELECT * FROM products 
             WHERE descripcion LIKE ?
             ORDER BY codigo
             LIMIT 10`,
            [`%${cleanQuery}%`]
        );

        return rows.map(row => this._addFinalPrice(row));
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

    /**
     * Get a single product by its internal code.
     * @param {string} codigo - Product code (e.g., TOI-20-102)
     * @returns {Object|null} - Product with final price or null
     */
    async getByCode(codigo) {
        const pool = await getPool();
        if (!pool) return null;

        const [rows] = await pool.execute(
            'SELECT * FROM products WHERE codigo = ?',
            [codigo.trim()]
        );

        if (rows.length === 0) return null;
        return this._addFinalPrice(rows[0]);
    }

    /**
     * Get all products with pagination.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Items per page
     * @param {string} [marca] - Optional brand filter
     * @returns {Object} - { products, total, page, totalPages }
     */
    async getAll(page = 1, limit = 50, marca = null) {
        const pool = await getPool();
        if (!pool) return { products: [], total: 0, page, totalPages: 0 };

        const offset = (page - 1) * limit;

        let countQuery = 'SELECT COUNT(*) as total FROM products';
        let dataQuery = 'SELECT * FROM products';
        const params = [];
        const countParams = [];

        if (marca) {
            countQuery += ' WHERE marca = ?';
            dataQuery += ' WHERE marca = ?';
            params.push(marca);
            countParams.push(marca);
        }

        dataQuery += ' ORDER BY codigo LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [[{ total }]] = await pool.execute(countQuery, countParams);
        const [rows] = await pool.execute(dataQuery, params);

        return {
            products: rows.map(row => this._addFinalPrice(row)),
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Get catalog statistics.
     * @returns {Object} - Stats object
     */
    async getStats() {
        const pool = await getPool();
        if (!pool) return { totalProducts: 0, brands: [], avgPrice: 0 };

        const [[{ totalProducts }]] = await pool.execute(
            'SELECT COUNT(*) as totalProducts FROM products'
        );

        const [brands] = await pool.execute(
            `SELECT marca, COUNT(*) as count 
             FROM products 
             WHERE marca IS NOT NULL 
             GROUP BY marca 
             ORDER BY count DESC`
        );

        const [[{ avgPrice }]] = await pool.execute(
            'SELECT COALESCE(AVG(precio_base), 0) as avgPrice FROM products WHERE precio_base > 0'
        );

        return {
            totalProducts,
            brands: brands.map(b => ({ name: b.marca, count: b.count })),
            avgPrice: Math.round(avgPrice),
            avgPriceFinal: Math.round(avgPrice * PRICE_MARKUP),
        };
    }

    /**
     * Delete all products from the catalog.
     * @returns {number} - Number of deleted rows
     */
    async clearAll() {
        const pool = await getPool();
        if (!pool) return 0;

        const [result] = await pool.execute('DELETE FROM products');
        console.log(`🗑️ Cleared ${result.affectedRows} products from catalog`);
        return result.affectedRows;
    }

    /**
     * Search from a chatbot query — detects references in natural language.
     * Returns a formatted response string if a product is found, or null.
     * 
     * This is the main integration point with the chatbot. It's called
     * BEFORE the RAG search in aiResponse.service.js.
     * 
     * @param {string} message - The raw user message
     * @returns {string|null} - Formatted response or null if no product found
     */
    async searchFromChatQuery(message, jid = null) {
        const pool = await getPool();
        if (!pool) return null;

        // Check if the products table has any data
        try {
            const [[{ cnt }]] = await pool.execute('SELECT COUNT(*) as cnt FROM products');
            if (cnt === 0) return null;
        } catch (_) {
            return null; // Table might not exist yet
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
                            // Found a product code! Look it up in DB
                            const product = await this.getByCode(codes[0]);
                            if (product) {
                                console.log(`\uD83D\uDCB0 Price request detected. Product: ${codes[0]}, Price: $${product.precio_final}`);
                                return this._formatPriceResponse(product);
                            }
                        }
                    }
                }
            } catch (histErr) {
                console.warn('\u26A0\uFE0F Could not check history for price request:', histErr.message);
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

        // Pattern 3: If the message looks like a direct product question
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
                
                // Quality filter: ensure the first keyword (product type) actually 
                // appears in the results. This prevents FULLTEXT from returning
                // unrelated items that match common words like "motor" "toy" "hilux".
                if (results.length > 0 && searchWords.length > 0) {
                    const primaryKeyword = searchWords[0].toUpperCase();
                    const filtered = results.filter(r => 
                        (r.descripcion || '').toUpperCase().includes(primaryKeyword)
                    );
                    // Only use filtered if it found something; otherwise keep original
                    if (filtered.length > 0) {
                        results = filtered;
                    }
                }

                if (results.length > 0) {
                    // Always show up to 5 similar products so the client can choose
                    return this._formatChatResponse(results.slice(0, 5));
                }
            }
        }

        return null;
    }

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
     * Used when the client confirms they want the price after seeing a product listing.
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

    /**
     * Truncate a product description for chat readability.
     * Long DB descriptions get cut to 80 chars to avoid text walls in WhatsApp.
     * @param {string} desc - Raw description from DB
     * @returns {string} - Truncated description
     */
    _truncateDesc(desc) {
        if (!desc) return 'N/A';
        if (desc.length <= 80) return desc;
        return desc.substring(0, 77) + '...';
    }

    /**
     * Add calculated final price to a product row.
     * @param {Object} row - Database row
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
}

module.exports = new ProductCatalogService();
