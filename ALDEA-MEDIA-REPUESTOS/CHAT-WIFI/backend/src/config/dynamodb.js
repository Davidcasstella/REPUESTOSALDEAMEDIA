/**
 * DynamoDB Helper
 *
 * Generic CRUD operations for DynamoDB.
 * All services should use these helpers instead of calling SDK directly.
 */

const {
    PutCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand,
    QueryCommand,
    ScanCommand,
    BatchWriteCommand
} = require('@aws-sdk/lib-dynamodb');

const { docClient, tableName } = require('./aws');

/**
 * Put (create/overwrite) an item.
 * @param {string} table - Entity name (e.g. 'config')
 * @param {Object} item - Full item to store
 */
async function putItem(table, item) {
    await docClient.send(new PutCommand({
        TableName: tableName(table),
        Item: item
    }));
    return item;
}

/**
 * Get a single item by its key.
 * @param {string} table - Entity name
 * @param {Object} key - e.g. { configKey: 'bot-config' }
 * @returns {Object|null}
 */
async function getItem(table, key) {
    const result = await docClient.send(new GetCommand({
        TableName: tableName(table),
        Key: key
    }));
    return result.Item || null;
}

/**
 * Update specific attributes of an item.
 * @param {string} table - Entity name
 * @param {Object} key - Partition key (and sort key if applicable)
 * @param {Object} updates - Key-value pairs to update
 * @returns {Object} Updated item
 */
async function updateItem(table, key, updates) {
    const expressions = [];
    const names = {};
    const values = {};

    for (const [attr, val] of Object.entries(updates)) {
        const placeholder = `#${attr}`;
        const valuePlaceholder = `:${attr}`;
        expressions.push(`${placeholder} = ${valuePlaceholder}`);
        names[placeholder] = attr;
        values[valuePlaceholder] = val;
    }

    const result = await docClient.send(new UpdateCommand({
        TableName: tableName(table),
        Key: key,
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW'
    }));
    return result.Attributes;
}

/**
 * Delete an item by key.
 * @param {string} table - Entity name
 * @param {Object} key
 */
async function deleteItem(table, key) {
    await docClient.send(new DeleteCommand({
        TableName: tableName(table),
        Key: key
    }));
}

/**
 * Query items with a key condition.
 * @param {string} table - Entity name
 * @param {Object} params - KeyConditionExpression, ExpressionAttributeValues, etc.
 * @returns {Array}
 */
async function queryItems(table, params) {
    const result = await docClient.send(new QueryCommand({
        TableName: tableName(table),
        ...params
    }));
    return result.Items || [];
}

/**
 * Scan all items in a table (use sparingly).
 * @param {string} table - Entity name
 * @param {Object} [params] - Optional FilterExpression, etc.
 * @returns {Array}
 */
async function scanItems(table, params = {}) {
    const items = [];
    let lastKey = undefined;

    do {
        const result = await docClient.send(new ScanCommand({
            TableName: tableName(table),
            ExclusiveStartKey: lastKey,
            ...params
        }));
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
}

/**
 * Batch write up to 25 items at a time.
 * @param {string} table - Entity name
 * @param {Array} items - Items to put
 */
async function batchPutItems(table, items) {
    const fullTableName = tableName(table);
    const batches = [];

    for (let i = 0; i < items.length; i += 25) {
        batches.push(items.slice(i, i + 25));
    }

    for (const batch of batches) {
        const requests = batch.map(item => ({
            PutRequest: { Item: item }
        }));

        await docClient.send(new BatchWriteCommand({
            RequestItems: {
                [fullTableName]: requests
            }
        }));
    }
}

module.exports = {
    putItem,
    getItem,
    updateItem,
    deleteItem,
    queryItems,
    scanItems,
    batchPutItems
};
