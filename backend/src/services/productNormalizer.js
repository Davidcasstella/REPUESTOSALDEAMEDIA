/**
 * Product Normalizer
 *
 * Cleans, normalizes, and generates search variants for product data
 * extracted from PDF catalogs. Ensures consistent data quality and
 * enables flexible searches (e.g., TOI-03-158 = TOI03158 = TOI 03 158).
 */

class ProductNormalizer {
    /**
     * Generate all searchable variants of a product code.
     * @param {string} codigo - Original code (e.g., "TOI-03-158")
     * @returns {string[]} - Array of normalized variants
     */
    generateCodeVariants(codigo) {
        if (!codigo) return [];

        const clean = codigo.trim().toUpperCase();
        const variants = new Set();

        // Original
        variants.add(clean);

        // Without dashes: TOI-03-158 → TOI03158
        variants.add(clean.replace(/-/g, ''));

        // With spaces instead of dashes: TOI-03-158 → TOI 03 158
        variants.add(clean.replace(/-/g, ' '));

        // Without any separators, lowercase: toi03158
        variants.add(clean.replace(/[-\s]/g, '').toLowerCase());

        // Partial dash removal: TOI-03158, TOI03-158
        const parts = clean.split('-');
        if (parts.length === 3) {
            variants.add(`${parts[0]}-${parts[1]}${parts[2]}`);
            variants.add(`${parts[0]}${parts[1]}-${parts[2]}`);
        }

        return [...variants];
    }

    /**
     * Normalize a product description.
     * Removes extra whitespace, strange characters, normalizes casing.
     * @param {string} desc - Raw description
     * @returns {string} - Cleaned description
     */
    normalizeDescription(desc) {
        if (!desc) return '';

        return desc
            .replace(/\s+/g, ' ')           // Collapse multiple spaces
            .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ.,\-\/()]/g, '') // Remove strange chars
            .replace(/\s*-\s*/g, '-')        // Normalize dashes
            .replace(/\s*\/\s*/g, '/')       // Normalize slashes
            .trim()
            .toUpperCase();
    }

    /**
     * Normalize and validate a price value.
     * @param {number|string} priceRaw - Raw price value
     * @returns {number} - Cleaned integer price
     */
    normalizePrice(priceRaw) {
        if (priceRaw === null || priceRaw === undefined) return 0;

        if (typeof priceRaw === 'number') {
            return Math.max(0, Math.round(priceRaw));
        }

        // String cleaning: "$ 105.950" → 105950
        const cleaned = String(priceRaw)
            .replace(/[$\s.]/g, '')  // Remove $, spaces, dots (thousand separators)
            .replace(/,/g, '');      // Remove commas

        const parsed = parseInt(cleaned, 10);
        return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }

    /**
     * Standardize brand names.
     * @param {string} marca - Raw brand name
     * @returns {string} - Normalized brand
     */
    normalizeBrand(marca) {
        if (!marca) return null;

        return marca
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\-]/g, '')
            .trim()
            .toUpperCase();
    }

    /**
     * Full normalization pipeline for a single product.
     * @param {Object} rawProduct - Raw product from parser
     * @returns {Object} - Normalized product with search variants
     */
    normalizeProduct(rawProduct) {
        const codigo = (rawProduct.codigo || '').trim().toUpperCase();

        return {
            codigo,
            ref_oem: (rawProduct.ref_oem || '').trim().toUpperCase() || null,
            ref_fabrica: (rawProduct.ref_fabrica || '').trim().toUpperCase() || null,
            descripcion: this.normalizeDescription(rawProduct.descripcion),
            marca: this.normalizeBrand(rawProduct.marca),
            precio_base: this.normalizePrice(rawProduct.precio_base),

            // Search optimization fields
            _code_variants: this.generateCodeVariants(codigo),
            _codigo_lower: codigo.toLowerCase(),
            _codigo_normalized: codigo.replace(/[-\s]/g, '').toLowerCase(),
            _ref_oem_lower: (rawProduct.ref_oem || '').trim().toLowerCase(),
            _ref_fabrica_lower: (rawProduct.ref_fabrica || '').trim().toLowerCase(),
            _descripcion_lower: this.normalizeDescription(rawProduct.descripcion).toLowerCase(),
            _marca_lower: (rawProduct.marca || '').trim().toLowerCase(),
        };
    }

    /**
     * Normalize a batch of products.
     * @param {Array} products - Array of raw products
     * @returns {Object} - { normalized: Array, errors: Array }
     */
    normalizeBatch(products) {
        const normalized = [];
        const errors = [];

        for (let i = 0; i < products.length; i++) {
            try {
                if (!products[i].codigo) {
                    errors.push({ index: i, reason: 'Missing codigo', raw: products[i] });
                    continue;
                }
                normalized.push(this.normalizeProduct(products[i]));
            } catch (err) {
                errors.push({ index: i, reason: err.message, raw: products[i] });
            }
        }

        return { normalized, errors };
    }

    /**
     * Normalize a search query for matching against product codes.
     * @param {string} query - User search query
     * @returns {string} - Normalized query for comparison
     */
    normalizeQuery(query) {
        return (query || '')
            .trim()
            .toUpperCase()
            .replace(/[-\s]/g, '');
    }
}

module.exports = new ProductNormalizer();
