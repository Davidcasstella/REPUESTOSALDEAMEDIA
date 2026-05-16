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
        await pool.execute('DROP TABLE IF EXISTS demand_monthly');
        console.log('demand_monthly dropped successfully');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
