/**
 * DemandAnalyticsService — DynamoDB Version
 *
 * Replaces MySQL with DynamoDB tables:
 *   - chatwifi-demand-signals (partition: id, sort: createdAt)
 *   - chatwifi-demand-monthly (partition: periodMonth, sort: productRef)
 */

const crypto = require('crypto');
const { putItem, queryItems, scanItems } = require('../config/dynamodb');
const groupCategoriesService = require('./groupCategories.service');

const SIGNALS_TABLE = 'demand-signals';
const MONTHLY_TABLE = 'demand-monthly';

// ── Product Catalog ──
const PRODUCT_CATALOG = [
    { keywords: ['pastilla', 'pastillas', 'freno', 'frenos', 'brake pad'], label: 'Pastillas de freno' },
    { keywords: ['filtro de aire', 'filtro aire', 'air filter'], label: 'Filtro de aire' },
    { keywords: ['bujia', 'bujías', 'bujias', 'spark plug'], label: 'Bujías' },
    { keywords: ['amortiguador', 'amortiguadores', 'suspension', 'suspensión', 'shock'], label: 'Amortiguador' },
    { keywords: ['bateria', 'batería', 'baterias', 'battery', '12v'], label: 'Batería' },
    { keywords: ['embrague', 'clutch', 'kit embrague', 'kit de embrague'], label: 'Kit de embrague' },
    { keywords: ['cadena', 'transmision', 'transmisión', 'chain'], label: 'Cadena de transmisión' },
    { keywords: ['kit arrastre', 'piñon', 'pinon', 'piñón', 'corona', 'sprocket'], label: 'Kit de arrastre' },
    { keywords: ['disco', 'disco de freno', 'brake disc', 'rotor'], label: 'Disco de freno' },
    { keywords: ['aceite', 'lubricante', 'oil', '10w40', '10w-40', '20w50', '20w-50'], label: 'Aceite de motor' },
    { keywords: ['radiador', 'radiator', 'refrigeracion'], label: 'Radiador' },
    { keywords: ['filtro aceite', 'filtro de aceite', 'oil filter'], label: 'Filtro de aceite' },
    { keywords: ['correa', 'banda', 'belt', 'correa tiempo', 'timing belt'], label: 'Correa/Banda' },
    { keywords: ['alternador', 'alternator'], label: 'Alternador' },
    { keywords: ['bomba agua', 'bomba de agua', 'water pump'], label: 'Bomba de agua' },
    { keywords: ['termostato', 'thermostat'], label: 'Termostato' },
    { keywords: ['rodamiento', 'rodamientos', 'bearing', 'balinera', 'ruleman'], label: 'Rodamiento' },
    { keywords: ['empaque', 'junta', 'gasket', 'empaquetadura'], label: 'Empaque/Junta' },
    { keywords: ['manguera', 'hose'], label: 'Manguera' },
    { keywords: ['sensor', 'sensores'], label: 'Sensor' },
    { keywords: ['bobina', 'ignition coil', 'coil'], label: 'Bobina de ignición' },
    { keywords: ['cremallera', 'direccion', 'dirección', 'steering rack'], label: 'Cremallera/Dirección' },
    { keywords: ['mordaza', 'caliper'], label: 'Mordaza/Caliper' },
    { keywords: ['retrovisor', 'espejo', 'mirror'], label: 'Espejo/Retrovisor' },
    { keywords: ['faro', 'faros', 'luz', 'luces', 'headlight', 'bombillo'], label: 'Faro/Luces' },
];

// ── Vehicle Brands ──
const VEHICLE_BRANDS = [
    'toyota', 'chevrolet', 'nissan', 'hyundai', 'kia', 'mazda', 'ford',
    'renault', 'volkswagen', 'honda', 'suzuki', 'yamaha', 'bajaj', 'bmw',
    'mercedes', 'audi', 'subaru', 'mitsubishi', 'peugeot', 'citroen',
    'fiat', 'jeep', 'dodge', 'chery', 'jac', 'great wall', 'ssangyong',
    'corolla', 'spark', 'sentra', 'elantra', 'rio', 'mazda 3', 'fiesta',
    'pulsar', 'fz', 'cb 160', 'gn 125', 'nmax', 'pcx', 'duke', 'ns 200',
    'aveo', 'captiva', 'tucson', 'sportage', 'accent', 'i10', 'sail',
    'logan', 'sandero', 'duster', 'clio', 'stepway', 'kicks', 'versa'
];

const REFERENCE_REGEX = /\b([A-Z]{0,4}\s?[0-9]{2,}[-]?[A-Z0-9]{2,}[-]?[A-Z0-9]*)\b/gi;

class DemandAnalyticsService {
    constructor() {
        this._repuestosGroupsCache = null;
        this._cacheExpiry = 0;
    }

    // ── Group Filtering ──

    async _getRepuestosGroups() {
        const now = Date.now();
        if (this._repuestosGroupsCache && now < this._cacheExpiry) {
            return this._repuestosGroupsCache;
        }
        try {
            const groups = await groupCategoriesService.getGroupsInCategory('repuestos');
            this._repuestosGroupsCache = groups || [];
            this._cacheExpiry = now + 5 * 60 * 1000;
            return this._repuestosGroupsCache;
        } catch (err) {
            console.error('❌ [DemandAnalytics] Error fetching repuestos groups:', err.message);
            return [];
        }
    }

    async isRepuestosGroup(jid) {
        const groups = await this._getRepuestosGroups();
        return groups.includes(jid);
    }

    // ── Message Analysis ──

    analyzeMessage(text) {
        if (!text || text.length < 3) return { products: [], references: [], vehicles: [] };

        const textLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const products = [];
        for (const entry of PRODUCT_CATALOG) {
            const found = entry.keywords.some(kw => textLower.includes(kw));
            if (found && !products.includes(entry.label)) {
                products.push(entry.label);
            }
        }

        const references = [];
        const refMatches = text.match(REFERENCE_REGEX) || [];
        for (const ref of refMatches) {
            const cleaned = ref.trim().toUpperCase();
            if (/^\d+$/.test(cleaned) && cleaned.length < 5) continue;
            if (['OK', 'NO', 'SI', 'YA', 'QUE', 'CON', 'POR', 'MAS', 'UNA'].includes(cleaned)) continue;
            if (!references.includes(cleaned)) references.push(cleaned);
        }

        const vehicles = [];
        for (const brand of VEHICLE_BRANDS) {
            if (textLower.includes(brand) && !vehicles.includes(brand)) {
                vehicles.push(brand);
            }
        }

        return { products, references, vehicles };
    }

    // ── Data Persistence (DynamoDB) ──

    async processGroupMessage(groupJid, text, senderName) {
        try {
            const isRepuestos = await this.isRepuestosGroup(groupJid);
            if (!isRepuestos) return;
            if (!text || text === '[media]') return;

            const { products, references, vehicles } = this.analyzeMessage(text);
            if (products.length === 0 && references.length === 0) return;

            const yearMonth = new Date().toISOString().slice(0, 7);
            const vehicleStr = vehicles.join(', ') || null;
            const createdAt = new Date().toISOString();

            for (const product of products) {
                const refForProduct = references.length > 0 ? references[0] : null;

                // Insert raw signal
                await putItem(SIGNALS_TABLE, {
                    id: crypto.randomUUID(),
                    createdAt,
                    groupJid,
                    senderName: senderName || null,
                    messageText: text.substring(0, 500),
                    detectedProduct: product,
                    detectedReference: refForProduct,
                    detectedVehicle: vehicleStr
                });

                // Upsert monthly aggregate
                const productRef = `${product}|${refForProduct || ''}`;
                try {
                    const existing = await queryItems(MONTHLY_TABLE, {
                        KeyConditionExpression: 'periodMonth = :pm AND productRef = :pr',
                        ExpressionAttributeValues: { ':pm': yearMonth, ':pr': productRef }
                    });

                    if (existing.length > 0) {
                        const item = existing[0];
                        item.totalCount = (item.totalCount || 0) + 1;
                        item.lastSeen = createdAt;
                        await putItem(MONTHLY_TABLE, item);
                    } else {
                        await putItem(MONTHLY_TABLE, {
                            periodMonth: yearMonth,
                            productRef,
                            product,
                            referenceCode: refForProduct || '',
                            vehicle: vehicleStr,
                            totalCount: 1,
                            lastSeen: createdAt
                        });
                    }
                } catch {}
            }

            console.log(`📊 [DemandAnalytics] Signal stored: ${products.join(', ') || references.join(', ')} from ${groupJid}`);
        } catch (err) {
            console.error(`❌ [DemandAnalytics] Error processing message: ${err.message}`);
        }
    }

    // ── Query Methods ──

    async getTopProducts(yearMonth, limit = 10) {
        const month = yearMonth || new Date().toISOString().slice(0, 7);
        try {
            const items = await queryItems(MONTHLY_TABLE, {
                KeyConditionExpression: 'periodMonth = :pm',
                ExpressionAttributeValues: { ':pm': month }
            });

            // Aggregate by product
            const productMap = {};
            for (const item of items) {
                if (item.product === 'Referencia sin producto') continue;
                if (!productMap[item.product]) {
                    productMap[item.product] = { product: item.product, total_count: 0, references: new Set(), vehicles: new Set() };
                }
                productMap[item.product].total_count += item.totalCount || 0;
                if (item.referenceCode) productMap[item.product].references.add(item.referenceCode);
                if (item.vehicle) productMap[item.product].vehicles.add(item.vehicle);
            }

            return Object.values(productMap)
                .map(p => ({
                    product: p.product,
                    total_count: p.total_count,
                    references_seen: [...p.references].join(', '),
                    vehicles_seen: [...p.vehicles].join(', ')
                }))
                .sort((a, b) => b.total_count - a.total_count)
                .slice(0, limit);
        } catch { return []; }
    }

    async getTopReferences(yearMonth, limit = 10) {
        const month = yearMonth || new Date().toISOString().slice(0, 7);
        try {
            const items = await queryItems(MONTHLY_TABLE, {
                KeyConditionExpression: 'periodMonth = :pm',
                ExpressionAttributeValues: { ':pm': month }
            });

            return items
                .filter(i => i.referenceCode)
                .sort((a, b) => (b.totalCount || 0) - (a.totalCount || 0))
                .slice(0, limit)
                .map(i => ({
                    reference_code: i.referenceCode,
                    product: i.product,
                    total_count: i.totalCount,
                    vehicles_seen: i.vehicle || ''
                }));
        } catch { return []; }
    }

    async getSummary(yearMonth) {
        const month = yearMonth || new Date().toISOString().slice(0, 7);
        try {
            const items = await queryItems(MONTHLY_TABLE, {
                KeyConditionExpression: 'periodMonth = :pm',
                ExpressionAttributeValues: { ':pm': month }
            });

            const products = new Set();
            const references = new Set();
            let totalCount = 0;

            for (const item of items) {
                products.add(item.product);
                if (item.referenceCode) references.add(item.referenceCode);
                totalCount += item.totalCount || 0;
            }

            const topProduct = items
                .filter(i => i.product !== 'Referencia sin producto')
                .sort((a, b) => (b.totalCount || 0) - (a.totalCount || 0))[0];

            return {
                yearMonth: month,
                totalSignals: totalCount,
                uniqueProducts: products.size,
                uniqueReferences: references.size,
                topProduct: topProduct ? { product: topProduct.product, total_count: topProduct.totalCount } : null
            };
        } catch {
            return { totalSignals: 0, uniqueProducts: 0, uniqueReferences: 0, topProduct: null };
        }
    }

    async getDailyTrend(days = 14) {
        // Simplified: scan recent signals
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const cutoffStr = cutoff.toISOString();

            const items = await scanItems(SIGNALS_TABLE, {
                FilterExpression: 'createdAt >= :cutoff',
                ExpressionAttributeValues: { ':cutoff': cutoffStr }
            });

            // Group by date
            const dateMap = {};
            for (const item of items) {
                const date = item.createdAt.slice(0, 10);
                dateMap[date] = (dateMap[date] || 0) + 1;
            }

            return Object.entries(dateMap)
                .map(([date, signals]) => ({ date, signals }))
                .sort((a, b) => a.date.localeCompare(b.date));
        } catch { return []; }
    }

    async getAvailableMonths() {
        try {
            const items = await scanItems(MONTHLY_TABLE, {
                ProjectionExpression: 'periodMonth'
            });
            const months = [...new Set(items.map(i => i.periodMonth))];
            return months.sort().reverse().slice(0, 12);
        } catch { return []; }
    }
}

module.exports = new DemandAnalyticsService();
