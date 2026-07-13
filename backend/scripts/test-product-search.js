/**
 * Quick test for product search functions.
 * Tests: exact code, reference search, description search, chatbot query.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const productCatalog = require('../src/services/productCatalog.service');

async function test() {
    console.log('=== PRODUCT SEARCH TEST ===\n');

    // Test 1: Exact code lookup
    console.log('--- Test 1: Exact Code Lookup ---');
    const p1 = await productCatalog.getByCode('TOI-17-443');
    console.log(`getByCode("TOI-17-443"):`, p1 ? `✅ ${p1.codigo} - ${p1.descripcion} - $${p1.precio_final}` : '❌ NOT FOUND');

    // Test 2: Reference search
    console.log('\n--- Test 2: Reference Search ---');
    const p2 = await productCatalog.searchByReference('TOI-03-158');
    console.log(`searchByReference("TOI-03-158"): ${p2.length} results`);
    p2.slice(0, 3).forEach(p => console.log(`  → ${p.codigo} - ${(p.descripcion || '').substring(0, 50)} - $${p.precio_final}`));

    // Test 3: Description search (fuzzy)
    console.log('\n--- Test 3: Description Search (fuzzy) ---');
    const p3 = await productCatalog.searchByDescription('amortiguador hilux');
    console.log(`searchByDescription("amortiguador hilux"): ${p3.length} results`);
    p3.slice(0, 5).forEach(p => console.log(`  → ${p.codigo} - ${(p.descripcion || '').substring(0, 60)} - $${p.precio_final}`));

    // Test 4: Description search - another term
    console.log('\n--- Test 4: Description Search (pastillas freno) ---');
    const p4 = await productCatalog.searchByDescription('pastillas freno');
    console.log(`searchByDescription("pastillas freno"): ${p4.length} results`);
    p4.slice(0, 5).forEach(p => console.log(`  → ${p.codigo} - ${(p.descripcion || '').substring(0, 60)} - $${p.precio_final}`));

    // Test 5: Universal search
    console.log('\n--- Test 5: Universal Search ---');
    const p5 = await productCatalog.search('filtro aceite');
    console.log(`search("filtro aceite"): ${p5.length} results`);
    p5.slice(0, 5).forEach(p => console.log(`  → ${p.codigo} - ${(p.descripcion || '').substring(0, 60)} - $${p.precio_final}`));

    // Test 6: Chat query simulation
    console.log('\n--- Test 6: Chat Query Simulation ---');
    const p6 = await productCatalog.searchFromChatQuery('tienes amortiguadores para hilux?');
    console.log(`searchFromChatQuery("tienes amortiguadores para hilux?"):`);
    console.log(p6 ? `✅ ${p6.substring(0, 200)}...` : '❌ NULL');

    // Test 7: Chat query with code
    console.log('\n--- Test 7: Chat Query with Code ---');
    const p7 = await productCatalog.searchFromChatQuery('necesito el TOI-08-354');
    console.log(`searchFromChatQuery("necesito el TOI-08-354"):`);
    console.log(p7 ? `✅ ${p7.substring(0, 200)}...` : '❌ NULL');

    // Test 8: Stats
    console.log('\n--- Test 8: Stats ---');
    const stats = await productCatalog.getStats();
    console.log(`Total: ${stats.totalProducts} | Brands: ${stats.brands.length} | Avg: $${stats.avgPrice}`);

    console.log('\n=== ALL TESTS COMPLETE ===');
}

test().catch(err => {
    console.error('Test failed:', err.message);
    process.exit(1);
});
