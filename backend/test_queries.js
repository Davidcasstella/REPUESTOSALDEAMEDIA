require('dotenv').config();
const db = require('./src/config/database');

async function test() {
    try {
        const pool = await db.getPool();
        console.log('Pool OK:', !!pool);

        const month = '2026-04';

        // Test 1: basic count
        const [r1] = await pool.execute('SELECT COUNT(*) as c FROM demand_signals');
        console.log('1. demand_signals count OK:', r1);

        // Test 2: basic count
        const [r2] = await pool.execute('SELECT COUNT(*) as c FROM demand_monthly');
        console.log('2. demand_monthly count OK:', r2);

        // Test 3: top-products (LIMIT inlined)
        const [r3] = await pool.execute(
            `SELECT product, SUM(total_count) as total_count, 
                    GROUP_CONCAT(DISTINCT reference_code ORDER BY reference_code SEPARATOR ', ') as references_seen,
                    GROUP_CONCAT(DISTINCT vehicle ORDER BY vehicle SEPARATOR ', ') as vehicles_seen,
                    MAX(last_seen) as last_seen
             FROM demand_monthly
             WHERE period_month = ? AND product != 'Referencia sin producto'
             GROUP BY product
             ORDER BY total_count DESC
             LIMIT 10`,
            [month]
        );
        console.log('3. Top products OK:', r3);

        // Test 4: summary
        const [r4] = await pool.execute(
            `SELECT 
                COUNT(*) as total_signals,
                COUNT(DISTINCT detected_product) as unique_products,
                COUNT(DISTINCT detected_reference) as unique_references
             FROM demand_signals
             WHERE DATE_FORMAT(created_at, '%Y-%m') = ?`,
            [month]
        );
        console.log('4. Summary OK:', r4);

        // Test 5: top product for summary
        const [r5] = await pool.execute(
            `SELECT product, SUM(total_count) as total_count
             FROM demand_monthly
             WHERE period_month = ? AND product != 'Referencia sin producto'
             GROUP BY product
             ORDER BY total_count DESC
             LIMIT 1`,
            [month]
        );
        console.log('5. Top product OK:', r5);

        // Test 6: available months
        const [r6] = await pool.execute(
            'SELECT DISTINCT period_month FROM demand_monthly ORDER BY period_month DESC LIMIT 12'
        );
        console.log('6. Months OK:', r6);

        // Test 7: top references (LIMIT inlined)
        const [r7] = await pool.execute(
            `SELECT reference_code, product, SUM(total_count) as total_count,
                    GROUP_CONCAT(DISTINCT vehicle ORDER BY vehicle SEPARATOR ', ') as vehicles_seen,
                    MAX(last_seen) as last_seen
             FROM demand_monthly
             WHERE period_month = ? AND reference_code != '' AND reference_code IS NOT NULL
             GROUP BY reference_code, product
             ORDER BY total_count DESC
             LIMIT 10`,
            [month]
        );
        console.log('7. Top references OK:', r7);

        // Test 8: daily trend
        const [r8] = await pool.execute(
            `SELECT DATE(created_at) as date, COUNT(*) as signals
             FROM demand_signals
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
             GROUP BY DATE(created_at)
             ORDER BY date ASC`
        );
        console.log('8. Trend OK:', r8);

        console.log('\n✅ ALL 8 QUERIES PASSED');
        process.exit(0);
    } catch (e) {
        console.error('❌ QUERY FAILED:', e.message);
        console.error('SQL State:', e.sqlState);
        console.error('Error Code:', e.errno);
        process.exit(1);
    }
}

test();
