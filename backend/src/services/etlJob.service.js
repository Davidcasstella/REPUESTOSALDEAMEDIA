/**
 * ETL Job Service
 *
 * Manages asynchronous PDF catalog processing jobs.
 * Each job follows the ETL pipeline:
 *   1. Extract — Parse PDF pages in batches using Python
 *   2. Transform — Normalize product data (codes, prices, brands)
 *   3. Load — Save products to DynamoDB in batches
 *
 * Jobs are tracked in DynamoDB (chatwifi-etl-jobs) and emit
 * real-time progress via Socket.IO.
 */

const { v4: uuidv4 } = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const { docClient, tableName } = require('../config/aws');
const { PutCommand, GetCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const pdfCatalogParser = require('./pdfCatalogParser.service');
const productNormalizer = require('./productNormalizer');
const productCatalog = require('./productCatalog.service');

const TABLE = tableName('etl-jobs');
const TEMP_DIR = path.join(__dirname, '../../data/temp-catalogs');
const BATCH_SIZE = 50; // Pages per batch

// ── In-memory jobs list cache ───────────────────────────────────────────────────
// Avoids a full DynamoDB Scan on every page load of the history panel.
// TTL: 10 min as safety fallback — invalidated on create / delete / complete.
const JOBS_CACHE_TTL_MS = 10 * 60_000; // 10 minutes
let _jobsCache = null; // { items: Array, expiresAt: number }

function _invalidateJobsCache() {
    _jobsCache = null;
}

// Socket.IO reference — set by app.js
let io = null;

class ETLJobService {
    /**
     * Set the Socket.IO instance for real-time progress events.
     * Called from app.js after server creation.
     * @param {Object} socketIo - Socket.IO server instance
     */
    setIO(socketIo) {
        io = socketIo;
    }

    /**
     * Create a new ETL job record.
     * @param {string} fileName - Original file name
     * @param {number} fileSize - File size in bytes
     * @param {string} tempFilePath - Path to the temp file on disk
     * @param {string} parserType - Parser type ('bdc' or 'generic')
     * @returns {Object} - Job record with { jobId, status }
     */
    async createJob(fileName, fileSize, tempFilePath, parserType, stageId) {
        const jobId = `etl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const job = {
            jobId,
            status: 'queued',
            fileName,
            fileSize,
            tempFilePath,
            parserType: parserType || 'bdc',
            // Tag the job with the stage it belongs to
            stageId: stageId || 'stage_general',
            totalPages: 0,
            currentPage: 0,
            productsFound: 0,
            productsProcessed: 0,
            errors: 0,
            errorDetails: [],
            phase: 'queued',
            progress: 0,
            createdAt: new Date().toISOString(),
            completedAt: null,
        };

        await docClient.send(new PutCommand({ TableName: TABLE, Item: job }));
        // Invalidate cache so the new job appears in the next listJobs call
        _invalidateJobsCache();
        console.log(`📋 ETL Job created: ${jobId} (${fileName}, stage: ${job.stageId})`);
        return job;
    }

    /**
     * Get a job by ID.
     * @param {string} jobId
     * @returns {Object|null}
     */
    async getJob(jobId) {
        try {
            const { Item } = await docClient.send(new GetCommand({
                TableName: TABLE,
                Key: { jobId },
            }));
            return Item || null;
        } catch (err) {
            console.error(`❌ Error getting job ${jobId}:`, err.message);
            return null;
        }
    }

    /**
     * List recent jobs, optionally filtered by stageId.
     * @param {number} limit - Max jobs to return
     * @param {string|null} stageId - Optional stage filter
     * @returns {Array}
     */
    async listJobs(limit = 20, stageId = null) {
        try {
            // Use cache to avoid full DynamoDB scan on every page load
            const now = Date.now();
            let allJobs;
            if (_jobsCache && _jobsCache.expiresAt > now) {
                allJobs = _jobsCache.items;
            } else {
                const { Items } = await docClient.send(new ScanCommand({
                    TableName: TABLE,
                }));
                allJobs = Items || [];
                _jobsCache = { items: allJobs, expiresAt: now + JOBS_CACHE_TTL_MS };
            }

            let jobs = allJobs;

            // Filter by stageId when provided so each stage sees only its own catalogs
            if (stageId) {
                jobs = jobs.filter(j => (j.stageId || 'stage_general') === stageId);
            }

            // Sort by createdAt descending and apply limit
            return jobs
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, limit);
        } catch (err) {
            console.error('❌ Error listing jobs:', err.message);
            return [];
        }
    }

    /**
     * Delete a single ETL job record by ID.
     * @param {string} jobId
     */
    async deleteJob(jobId) {
        try {
            const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
            await docClient.send(new DeleteCommand({
                TableName: TABLE,
                Key: { jobId },
            }));
            // Invalidate cache so the deleted job disappears from the next list
            _invalidateJobsCache();
            console.log(`🗑️ ETL Job deleted: ${jobId}`);
        } catch (err) {
            console.error(`❌ Error deleting job ${jobId}:`, err.message);
            throw err;
        }
    }

    /**
     * Update job progress fields.
     * @param {string} jobId
     * @param {Object} updates - Fields to update
     */
    async updateProgress(jobId, updates) {
        const expressions = [];
        const names = {};
        const values = {};

        for (const [key, value] of Object.entries(updates)) {
            const safeKey = `#${key}`;
            const safeVal = `:${key}`;
            expressions.push(`${safeKey} = ${safeVal}`);
            names[safeKey] = key;
            values[safeVal] = value;
        }

        try {
            await docClient.send(new UpdateCommand({
                TableName: TABLE,
                Key: { jobId },
                UpdateExpression: `SET ${expressions.join(', ')}`,
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
            }));
            // Invalidate cache when a job reaches a terminal state
            // so the history panel shows the updated status immediately
            if (updates.status === 'completed' || updates.status === 'error') {
                _invalidateJobsCache();
            }
        } catch (err) {
            console.error(`⚠️ Error updating job ${jobId}:`, err.message);
        }
    }

    /**
     * Emit a real-time progress event via Socket.IO.
     * @param {string} event - Event name
     * @param {Object} data - Event payload
     */
    _emit(event, data) {
        if (io) {
            io.emit(event, data);
        }
    }

    /**
     * Run the full ETL pipeline for a job.
     * This runs asynchronously — the caller should not await it.
     * @param {string} jobId
     */
    async runJob(jobId) {
        let tempPath = null;

        try {
            // Get job record
            const job = await this.getJob(jobId);
            if (!job) throw new Error(`Job ${jobId} not found`);

            tempPath = job.tempFilePath;
            const parserType = job.parserType || 'bdc';
            // Retrieve the stageId stored when the job was created
            const stageId = job.stageId || 'stage_general';

            // ────── Phase 1: EXTRACT — Get page count ──────
            await this.updateProgress(jobId, {
                status: 'processing',
                phase: 'counting',
                progress: 5,
            });
            this._emit('etl-job-progress', {
                jobId, phase: 'counting', progress: 5,
                message: 'Contando páginas del PDF...',
            });

            const totalPages = await pdfCatalogParser.getPageCountFromFile(tempPath, parserType);
            console.log(`📄 ETL Job ${jobId}: ${totalPages} pages detected`);

            await this.updateProgress(jobId, { totalPages, progress: 10 });
            this._emit('etl-job-progress', {
                jobId, phase: 'extracting', progress: 10, totalPages,
                message: `${totalPages} páginas detectadas. Extrayendo productos...`,
            });

            // ────── Phase 2: EXTRACT — Parse in batches ──────
            const allRawProducts = [];
            const totalBatches = Math.ceil(totalPages / BATCH_SIZE);

            for (let batch = 0; batch < totalBatches; batch++) {
                const startPage = batch * BATCH_SIZE;
                const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages - 1);

                console.log(`📦 ETL Job ${jobId}: Parsing batch ${batch + 1}/${totalBatches} (pages ${startPage}-${endPage})`);

                const batchProducts = await pdfCatalogParser.parseBatch(
                    tempPath, startPage, endPage, parserType,
                    (current, total) => {
                        // Progress callback from Python stderr
                        const overallPage = startPage + current;
                        const progress = 10 + Math.floor((overallPage / totalPages) * 50); // 10-60%
                        this._emit('etl-job-progress', {
                            jobId, phase: 'extracting', progress,
                            currentPage: overallPage, totalPages,
                            productsFound: allRawProducts.length,
                            message: `Extrayendo: página ${overallPage} de ${totalPages}`,
                        });
                    }
                );

                allRawProducts.push(...batchProducts);

                // Update job progress after each batch
                const batchProgress = 10 + Math.floor(((batch + 1) / totalBatches) * 50);
                await this.updateProgress(jobId, {
                    currentPage: Math.min((batch + 1) * BATCH_SIZE, totalPages),
                    productsFound: allRawProducts.length,
                    progress: batchProgress,
                    phase: 'extracting',
                });

                this._emit('etl-job-progress', {
                    jobId, phase: 'extracting', progress: batchProgress,
                    currentPage: Math.min((batch + 1) * BATCH_SIZE, totalPages),
                    totalPages,
                    productsFound: allRawProducts.length,
                    message: `Lote ${batch + 1}/${totalBatches} completado. ${allRawProducts.length} productos encontrados.`,
                });
            }

            console.log(`✅ ETL Job ${jobId}: Extraction complete. ${allRawProducts.length} raw products.`);

            if (allRawProducts.length === 0) {
                await this.updateProgress(jobId, {
                    status: 'completed',
                    phase: 'completed',
                    progress: 100,
                    completedAt: new Date().toISOString(),
                    productsFound: 0,
                    productsProcessed: 0,
                });
                this._emit('etl-job-completed', {
                    jobId,
                    stats: { totalPages, productsFound: 0, productsProcessed: 0, errors: 0 },
                    message: 'No se encontraron productos en el PDF.',
                });
                return;
            }

            // ────── Phase 3: TRANSFORM — Normalize ──────
            await this.updateProgress(jobId, { phase: 'transforming', progress: 65 });
            this._emit('etl-job-progress', {
                jobId, phase: 'transforming', progress: 65,
                message: `Normalizando ${allRawProducts.length} productos...`,
            });

            const { normalized, errors: normErrors } = productNormalizer.normalizeBatch(allRawProducts);

            console.log(`🔧 ETL Job ${jobId}: Normalized ${normalized.length} products, ${normErrors.length} errors`);

            await this.updateProgress(jobId, { progress: 75, phase: 'loading' });
            this._emit('etl-job-progress', {
                jobId, phase: 'loading', progress: 75,
                productsFound: allRawProducts.length,
                message: `Cargando ${normalized.length} productos en la base de datos...`,
            });

            // ────── Phase 4: LOAD — Save to DynamoDB (tagged with stageId) ──────
            const saveResult = await productCatalog.saveProducts(normalized, job.fileName, stageId);

            const finalErrors = normErrors.length + saveResult.errors;

            // ────── Phase 5: COMPLETE ──────
            await this.updateProgress(jobId, {
                status: 'completed',
                phase: 'completed',
                progress: 100,
                productsFound: allRawProducts.length,
                productsProcessed: saveResult.inserted,
                errors: finalErrors,
                errorDetails: normErrors.slice(0, 50), // Keep first 50 error details
                completedAt: new Date().toISOString(),
            });

            this._emit('etl-job-completed', {
                jobId,
                stats: {
                    totalPages,
                    productsFound: allRawProducts.length,
                    productsProcessed: saveResult.inserted,
                    errors: finalErrors,
                },
                message: `Catálogo procesado: ${saveResult.inserted} productos guardados.`,
            });

            console.log(`🎉 ETL Job ${jobId} completed! ${saveResult.inserted} products saved, ${finalErrors} errors.`);

        } catch (error) {
            console.error(`❌ ETL Job ${jobId} failed:`, error.message);

            await this.updateProgress(jobId, {
                status: 'error',
                phase: 'error',
                errorDetails: [{ reason: error.message }],
                completedAt: new Date().toISOString(),
            });

            this._emit('etl-job-error', {
                jobId,
                error: error.message,
                message: `Error procesando catálogo: ${error.message}`,
            });
        } finally {
            // Cleanup temp file
            if (tempPath) {
                try { await fs.remove(tempPath); } catch (_) {}
            }
        }
    }
}

module.exports = new ETLJobService();
