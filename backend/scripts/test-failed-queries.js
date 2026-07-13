/**
 * Quick test for the specific query that failed in the dashboard.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const productCatalog = require('../src/services/productCatalog.service');

async function test() {
    console.log('=== TESTING FAILED QUERIES ===\n');

    // Test the exact query that failed
    const q1 = 'PUNTA EJE SUZ. ALTO/WAGON R L/RUEDA (23X18X49)';
    console.log(`Query: "${q1}"`);
    const r1 = await productCatalog.searchFromChatQuery(q1);
    console.log('Result:', r1 ? `✅ ${r1.substring(0, 200)}` : '❌ NULL');

    console.log('\n---');

    // Test with code
    const q2 = 'TOI-01-300 precio';
    console.log(`\nQuery: "${q2}"`);
    const r2 = await productCatalog.searchFromChatQuery(q2);
    console.log('Result:', r2 ? `✅ ${r2.substring(0, 200)}` : '❌ NULL');

    console.log('\n---');

    // Test simple description
    const q3 = 'punta eje';
    console.log(`\nQuery: "${q3}"`);
    const r3 = await productCatalog.searchFromChatQuery(q3);
    console.log('Result:', r3 ? `✅ ${r3.substring(0, 200)}` : '❌ NULL');

    console.log('\n---');

    // Test description search directly
    const q4 = 'punta eje';
    console.log(`\nDirect searchByDescription("${q4}"):`);
    const r4 = await productCatalog.searchByDescription(q4);
    console.log(`${r4.length} results`);
    r4.slice(0, 5).forEach(p => console.log(`  → ${p.codigo} - ${(p.descripcion || '').substring(0, 60)} - $${p.precio_final}`));

    console.log('\n=== DONE ===');
}

test().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
