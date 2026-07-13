/**
 * Import PDF Catalog to DynamoDB
 * 
 * Parses the PDF using the Python script, then batch-writes
 * all products to the chatwifi-products DynamoDB table.
 * 
 * Usage: node scripts/import-catalog-to-dynamodb.js [path-to-pdf]
 * 
 * If no path is provided, defaults to the LISTA BDC MARZO CLIENTES.pdf
 * in the project root.
 */

const { execFile } = require('child_process');
const path = require('path');

// AWS credentials can be set via env vars or IAM role
const PYTHON_SCRIPT = path.join(__dirname, 'parse_catalog_pdf.py');
const DEFAULT_PDF = path.join(__dirname, '../../LISTA BDC MARZO CLIENTES.pdf');

async function parsePDF(pdfPath) {
    return new Promise((resolve, reject) => {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        console.log(`📄 Parsing PDF: ${pdfPath}`);
        console.log(`🐍 Using: ${pythonCmd} ${PYTHON_SCRIPT}`);

        execFile(pythonCmd, [PYTHON_SCRIPT, pdfPath], {
            maxBuffer: 50 * 1024 * 1024,
            timeout: 300000, // 5 min for large PDFs
        }, (error, stdout, stderr) => {
            if (stderr) {
                console.warn(`⚠️ Python stderr: ${stderr}`);
            }

            if (error) {
                return reject(new Error(`PDF parsing failed: ${error.message}`));
            }

            try {
                const result = JSON.parse(stdout);
                if (result.error) {
                    return reject(new Error(`Parser error: ${result.error}`));
                }
                if (!Array.isArray(result)) {
                    return reject(new Error('Parser returned invalid format'));
                }
                resolve(result);
            } catch (e) {
                console.error(`Raw output (first 500 chars): ${stdout.substring(0, 500)}`);
                reject(new Error(`JSON parse error: ${e.message}`));
            }
        });
    });
}

async function importToDynamoDB(products, catalogSource) {
    // We need to require the service AFTER dotenv is loaded
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
    
    const productCatalogService = require('../src/services/productCatalog.service');

    console.log(`\n📦 Importing ${products.length} products to DynamoDB...`);
    console.log(`   Source: ${catalogSource}`);

    const result = await productCatalogService.saveProducts(products, catalogSource);

    console.log(`\n✅ Import complete!`);
    console.log(`   Total extracted: ${products.length}`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Errors: ${result.errors}`);

    // Show sample products
    console.log(`\n📋 Sample products:`);
    for (const p of products.slice(0, 5)) {
        console.log(`   ${p.codigo} | ${(p.descripcion || '').substring(0, 50)} | ${p.marca || 'N/A'} | $${p.precio_base}`);
    }

    // Test search
    console.log(`\n🔍 Testing search...`);
    const testCode = products[0]?.codigo;
    if (testCode) {
        const found = await productCatalogService.getByCode(testCode);
        if (found) {
            console.log(`   ✅ getByCode("${testCode}") → Found! Price: $${found.precio_final}`);
        } else {
            console.log(`   ❌ getByCode("${testCode}") → NOT FOUND`);
        }
    }

    const stats = await productCatalogService.getStats();
    console.log(`\n📊 Catalog stats:`);
    console.log(`   Total products: ${stats.totalProducts}`);
    console.log(`   Brands: ${stats.brands.map(b => `${b.name}(${b.count})`).join(', ')}`);
    console.log(`   Average price: $${stats.avgPrice} (final: $${stats.avgPriceFinal})`);
}

async function main() {
    const pdfPath = process.argv[2] || DEFAULT_PDF;

    try {
        // Step 1: Parse PDF
        const products = await parsePDF(pdfPath);
        console.log(`\n✅ Parsed ${products.length} products from PDF`);

        // Step 2: Import to DynamoDB
        const catalogSource = path.basename(pdfPath);
        await importToDynamoDB(products, catalogSource);

    } catch (err) {
        console.error(`\n❌ Import failed: ${err.message}`);
        process.exit(1);
    }
}

main();
