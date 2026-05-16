/**
 * PDF Catalog Parser Service
 * 
 * Invokes the Python pdfplumber script to extract structured product data
 * from auto parts PDF catalogs. Handles file I/O and process execution.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/parse_catalog_pdf.py');
const TEMP_DIR = path.join(__dirname, '../../data/temp-catalogs');

class PdfCatalogParserService {
    constructor() {
        fs.ensureDirSync(TEMP_DIR);
    }

    /**
     * Parse a PDF catalog buffer into structured product data.
     * @param {Buffer} buffer - The PDF file buffer
     * @param {string} originalName - Original filename for reference
     * @returns {Promise<Array>} - Array of product objects
     */
    async parse(buffer, originalName) {
        // Save buffer to a temp file
        const tempFileName = `catalog_${Date.now()}_${originalName}`;
        const tempPath = path.join(TEMP_DIR, tempFileName);

        try {
            await fs.writeFile(tempPath, buffer);
            console.log(`📄 Temp PDF saved: ${tempPath}`);

            // Execute Python script
            const products = await this._runPythonParser(tempPath);
            console.log(`✅ Parsed ${products.length} products from ${originalName}`);

            return products;
        } finally {
            // Cleanup temp file
            try { await fs.remove(tempPath); } catch (_) {}
        }
    }

    /**
     * Execute the Python parser script and return parsed JSON.
     * @param {string} pdfPath - Path to the PDF file
     * @returns {Promise<Array>} - Parsed products array
     */
    _runPythonParser(pdfPath) {
        return new Promise((resolve, reject) => {
            // Try 'python' first, fall back to 'python3'
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

            execFile(pythonCmd, [PYTHON_SCRIPT, pdfPath], {
                maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large catalogs
                timeout: 120000, // 2 min timeout
            }, (error, stdout, stderr) => {
                if (stderr) {
                    console.warn(`⚠️ Python stderr: ${stderr}`);
                }

                if (error) {
                    console.error(`❌ Python parser error: ${error.message}`);
                    return reject(new Error(`PDF parsing failed: ${error.message}`));
                }

                try {
                    const result = JSON.parse(stdout);

                    // Check for error response from Python
                    if (result.error) {
                        return reject(new Error(`PDF parsing error: ${result.error}`));
                    }

                    // Should be an array of products
                    if (!Array.isArray(result)) {
                        return reject(new Error('PDF parser returned invalid data format'));
                    }

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
