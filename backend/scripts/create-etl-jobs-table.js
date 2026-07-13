/**
 * Create ETL Jobs Table in DynamoDB
 *
 * Table: chatwifi-etl-jobs
 * Partition Key: jobId (S)
 *
 * Run once: node scripts/create-etl-jobs-table.js
 */

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_PREFIX = process.env.DYNAMODB_PREFIX || 'chatwifi';
const TABLE_NAME = `${TABLE_PREFIX}-etl-jobs`;

const client = new DynamoDBClient({ region: REGION });

async function createTable() {
    // Check if table already exists
    try {
        await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
        console.log(`✅ Table "${TABLE_NAME}" already exists.`);
        return;
    } catch (err) {
        if (err.name !== 'ResourceNotFoundException') {
            throw err;
        }
    }

    console.log(`📦 Creating table "${TABLE_NAME}"...`);

    await client.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
            { AttributeName: 'jobId', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'jobId', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
    }));

    console.log(`✅ Table "${TABLE_NAME}" created successfully!`);
}

createTable().catch(err => {
    console.error('❌ Error creating table:', err.message);
    process.exit(1);
});
