/**
 * Database Connection — DEPRECATED
 * 
 * MySQL has been replaced by DynamoDB for all services.
 * This module now returns null stubs to prevent crashes in services
 * that haven't been fully migrated yet (e.g., productCatalog).
 * 
 * Product catalog will be migrated to DynamoDB in a future iteration.
 */

let pool = null;

async function initialize() {
    console.log('ℹ️  MySQL disabled — using DynamoDB for persistence');
    return null;
}

async function getPool() {
    return null;
}

module.exports = { initialize, getPool };
