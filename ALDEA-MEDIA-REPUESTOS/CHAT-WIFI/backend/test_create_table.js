const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '0000',
            database: process.env.DB_NAME || 'chat_wifi_analytics',
        });
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS demand_monthly (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                period_month CHAR(7) NOT NULL,
                product VARCHAR(150) NOT NULL,
                reference_code VARCHAR(100) DEFAULT NULL,
                vehicle VARCHAR(150) DEFAULT NULL,
                total_count INT DEFAULT 1,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_month_product (period_month, product, reference_code),
                INDEX idx_periodmonth (period_month),
                INDEX idx_total (total_count DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('demand_monthly created successfully');
        process.exit(0);
    } catch (e) {
        console.error("ERROR CREATING TABLE:", e.message);
        process.exit(1);
    }
}
run();
