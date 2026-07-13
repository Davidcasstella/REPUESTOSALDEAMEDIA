/**
 * PDF Catalog Parser Service — Multi-Parser Engine
 * 
 * Invokes Python scripts (pdfplumber) to extract structured product data
 * from auto parts PDF catalogs. Supports multiple parser types:
 *   - 'bdc': BDC/Toyota fixed-column format
 *   - 'generic': Auto-detect tabular layouts
 * 
 * Handles file I/O, process execution, page counting, and batch processing.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

// Parser configurations — each maps to a Python script
const PARSERS = {
    bdc: {
        script: path.join(__dirname, '../../scripts/parse_catalog_pdf.py'),
        name: 'BDC / Toyota',
        description: 'Catálogos con formato BDC de columnas fijas (Toyota, Hyundai, etc.)',
    },
    generic: {
        script: path.join(__dirname, '../../scripts/parse_catalog_generic.py'),
        name: 'Genérico (tablas)',
        description: 'Detecta tablas automáticamente en cualquier formato de catálogo',
    },
};

const TEMP_DIR = path.join(__dirname, '../../data/temp-catalogs');

// Processing limits
const MAX_BUFFER = 100 * 1024 * 1024;  // 100MB output buffer
const TIMEOUT = 600000;                 // 10 minutes per execution

class PdfCatalogParserService {
    constructor() {
        fs.ensureDirSync(TEMP_DIR);
    }

    /**
     * Get the list of available parsers (for the UI selector).
     * @returns {Array} - Array of { id, name, description }
     */
    getAvailableParsers() {
        return Object.entries(PARSERS).map(([id, config]) => ({
            id,
            name: config.name,
            description: config.description,
        }));
    }

    /**
     * Parse a PDF catalog buffer into structured product data.
     * @param {Buffer} buffer - The PDF file buffer
     * @param {string} originalName - Original filename for reference
     * @param {string} parserType - Parser type ('bdc' or 'generic')
     * @returns {Promise<Array>} - Array of product objects
     */
    async parse(buffer, originalName, parserType = 'bdc') {
        const tempPath = await this._saveTempFile(buffer, originalName);

        try {
            const products = await this._runParser(tempPath, parserType);
            console.log(`✅ Parsed ${products.length} products from ${originalName} (parser: ${parserType})`);
            return products;
        } finally {
            try { await fs.remove(tempPath); } catch (_) {}
        }
    }

    /**
     * Get the total page count of a PDF without parsing it.
     * @param {Buffer} buffer - The PDF file buffer
     * @param {string} originalName - Original filename
     * @param {string} parserType - Parser type to use for page counting
     * @returns {Promise<number>} - Total page count
     */
    async getPageCount(buffer, originalName, parserType = 'bdc') {
        const tempPath = await this._saveTempFile(buffer, originalName);

        try {
            const parser = PARSERS[parserType] || PARSERS.bdc;
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

            return new Promise((resolve, reject) => {
                execFile(pythonCmd, [parser.script, tempPath, '--page-count'], {
                    maxBuffer: MAX_BUFFER,
                    timeout: 30000, // 30s for page count only
                }, (error, stdout) => {
                    if (error) return reject(new Error(`Page count failed: ${error.message}`));
                    try {
                        const result = JSON.parse(stdout);
                        if (result.error) return reject(new Error(result.error));
                        resolve(result.pageCount || 0);
                    } catch (e) {
                        reject(new Error('Invalid page count response'));
                    }
                });
            });
        } finally {
            try { await fs.remove(tempPath); } catch (_) {}
        }
    }

    /**
     * Parse a specific range of pages from a PDF file on disk.
     * Used by the ETL Job runner for batch processing.
     * @param {string} filePath - Path to the PDF file (already on disk)
     * @param {number} startPage - Start page (0-indexed)
     * @param {number} endPage - End page (0-indexed, inclusive)
     * @param {string} parserType - Parser type ('bdc' or 'generic')
     * @param {function} onProgress - Optional callback for progress (current, total)
     * @returns {Promise<Array>} - Array of product objects from this batch
     */
    async parseBatch(filePath, startPage, endPage, parserType = 'bdc', onProgress = null) {
        const parser = PARSERS[parserType] || PARSERS.bdc;
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        return new Promise((resolve, reject) => {
            const proc = execFile(
                pythonCmd,
                [parser.script, filePath, '--page-range', String(startPage), String(endPage)],
                { maxBuffer: MAX_BUFFER, timeout: TIMEOUT },
                (error, stdout, stderr) => {
                    if (error) {
                        return reject(new Error(`Batch parse failed (pages ${startPage}-${endPage}): ${error.message}`));
                    }

                    try {
                        const result = JSON.parse(stdout);
                        if (result.error) return reject(new Error(result.error));
                        if (!Array.isArray(result)) return reject(new Error('Invalid batch response'));
                        resolve(result);
                    } catch (e) {
                        reject(new Error(`Failed to parse batch output: ${e.message}`));
                    }
                }
            );

            // Stream stderr for progress events
            if (proc.stderr && onProgress) {
                let stderrBuffer = '';
                proc.stderr.on('data', (chunk) => {
                    stderrBuffer += chunk.toString();
                    const lines = stderrBuffer.split('\n');
                    stderrBuffer = lines.pop(); // Keep incomplete line in buffer

                    for (const line of lines) {
                        const match = line.match(/^PROGRESS:(\d+)\/(\d+)/);
                        if (match) {
                            onProgress(parseInt(match[1]), parseInt(match[2]));
                        }
                    }
                });
            }
        });
    }

    /**
     * Get page count from a file already on disk (no temp file needed).
     * @param {string} filePath - Path to the PDF
     * @param {string} parserType - Parser type
     * @returns {Promise<number>}
     */
    async getPageCountFromFile(filePath, parserType = 'bdc') {
        const parser = PARSERS[parserType] || PARSERS.bdc;
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        return new Promise((resolve, reject) => {
            execFile(pythonCmd, [parser.script, filePath, '--page-count'], {
                maxBuffer: MAX_BUFFER,
                timeout: 30000,
            }, (error, stdout) => {
                if (error) return reject(new Error(`Page count failed: ${error.message}`));
                try {
                    const result = JSON.parse(stdout);
                    if (result.error) return reject(new Error(result.error));
                    resolve(result.pageCount || 0);
                } catch (e) {
                    reject(new Error('Invalid page count response'));
                }
            });
        });
    }

    // ── Private helpers ──

    /**
     * Save a buffer to a temporary file.
     * @param {Buffer} buffer
     * @param {string} originalName
     * @returns {Promise<string>} - Path to the temp file
     */
    async _saveTempFile(buffer, originalName) {
        const tempFileName = `catalog_${Date.now()}_${originalName}`;
        const tempPath = path.join(TEMP_DIR, tempFileName);
        await fs.writeFile(tempPath, buffer);
        console.log(`📄 Temp PDF saved: ${tempPath}`);
        return tempPath;
    }

    /**
     * Run a parser on the full PDF (all pages).
     * @param {string} pdfPath - Path to PDF
     * @param {string} parserType - Parser type
     * @returns {Promise<Array>}
     */
    _runParser(pdfPath, parserType = 'bdc') {
        const parser = PARSERS[parserType] || PARSERS.bdc;
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        return new Promise((resolve, reject) => {
            execFile(pythonCmd, [parser.script, pdfPath], {
                maxBuffer: MAX_BUFFER,
                timeout: TIMEOUT,
            }, (error, stdout, stderr) => {
                if (stderr) {
                    // Filter out PROGRESS lines — only log actual warnings
                    const warnings = stderr.split('\n')
                        .filter(l => l.trim() && !l.startsWith('PROGRESS:'))
                        .join('\n');
                    if (warnings) console.warn(`⚠️ Python stderr: ${warnings}`);
                }

                if (error) {
                    console.error(`❌ Python parser error: ${error.message}`);
                    return reject(new Error(`PDF parsing failed: ${error.message}`));
                }

                try {
                    const result = JSON.parse(stdout);
                    if (result.error) return reject(new Error(`PDF parsing error: ${result.error}`));
                    if (!Array.isArray(result)) return reject(new Error('PDF parser returned invalid data format'));
                    resolve(result);
                } catch (parseErr) {
                    console.error(`❌ Failed to parse Python output: ${parseErr.message}`);
                    console.error(`   Raw output (first 500 chars): ${stdout.substring(0, 500)}`);
                    reject(new Error('Failed to parse PDF output'));
                }
            });
        });
    }
}

module.exports = new PdfCatalogParserService();
