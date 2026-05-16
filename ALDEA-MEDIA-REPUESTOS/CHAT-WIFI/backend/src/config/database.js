/**
 * MySQL Database Connection
 * 
 * Creates the database and tables if they don't exist.
 * Uses connection pooling for performance.
 */

const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '0000',
    // database is set after ensuring it exists
};

const DB_NAME = process.env.DB_NAME || 'chat_wifi_analytics';

let pool = null;

/**
 * Initialize: create database + tables if they don't exist, then create pool.
 */
async function initialize() {
    if (pool) return pool;

    try {
        // 1. Connect WITHOUT database to create it if needed
        const initConn = await mysql.createConnection(DB_CONFIG);
        await initConn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await initConn.end();

        // 2. Create pool WITH database
        pool = mysql.createPool({
            ...DB_CONFIG,
            database: DB_NAME,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            charset: 'utf8mb4'
        });

        // 3. Create tables
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS demand_signals (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                group_jid VARCHAR(100) NOT NULL,
                sender_name VARCHAR(100) DEFAULT NULL,
                message_text TEXT,
                detected_product VARCHAR(150) DEFAULT NULL,
                detected_reference VARCHAR(100) DEFAULT NULL,
                detected_vehicle VARCHAR(150) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_product (detected_product),
                INDEX idx_reference (detected_reference),
                INDEX idx_created (created_at),
                INDEX idx_group (group_jid)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

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

        // Products table for PDF catalog data
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS products (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(20) NOT NULL,
                ref_oem VARCHAR(50) DEFAULT NULL,
                ref_fabrica VARCHAR(50) DEFAULT NULL,
                descripcion MEDIUMTEXT,
                marca VARCHAR(50) DEFAULT NULL,
                precio_base INT DEFAULT 0,
                catalog_source VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_codigo (codigo),
                INDEX idx_ref_oem (ref_oem),
                INDEX idx_marca (marca),
                FULLTEXT INDEX ft_descripcion (descripcion)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log(`✅ MySQL connected: ${DB_NAME} (tables ready)`);
        return pool;
    } catch (err) {
        console.error(`❌ MySQL initialization failed: ${err.message}`);
        console.error(`   Ensure MySQL is running on ${DB_CONFIG.host}:${DB_CONFIG.port}`);
        // Don't crash the app — analytics is optional
        return null;
    }
}

/**
 * Get the connection pool (lazy init).
 */
async function getPool() {
    if (!pool) await initialize();
    return pool;
}

module.exports = { initialize, getPool };
