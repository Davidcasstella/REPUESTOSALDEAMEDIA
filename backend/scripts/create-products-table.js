/**
 * Create the chatwifi-products DynamoDB table.
 * 
 * Usage: node scripts/create-products-table.js
 * 
 * Table schema:
 *   PK: codigo (String)  — e.g. "TOI-20-102"
 *   GSI: marca-index (marca → codigo) for brand filtering
 */

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = 'chatwifi-products';

async function createTable() {
    const client = new DynamoDBClient({ region: REGION });

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

    const params = {
        TableName: TABLE_NAME,
        KeySchema: [
            { AttributeName: 'codigo', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'codigo', AttributeType: 'S' },
            { AttributeName: 'marca', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'marca-index',
                KeySchema: [
                    { AttributeName: 'marca', KeyType: 'HASH' },
                    { AttributeName: 'codigo', KeyType: 'RANGE' }
                ],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await client.send(new CreateTableCommand(params));
        console.log(`✅ Table "${TABLE_NAME}" created successfully!`);
        console.log('⏳ Waiting for table to become ACTIVE...');

        // Poll until active
        let status = 'CREATING';
        while (status !== 'ACTIVE') {
            await new Promise(r => setTimeout(r, 2000));
            const desc = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
            status = desc.Table.TableStatus;
            console.log(`   Status: ${status}`);
        }

        console.log(`🎉 Table "${TABLE_NAME}" is ACTIVE and ready to use.`);
    } catch (err) {
        console.error(`❌ Failed to create table: ${err.message}`);
        process.exit(1);
    }
}

createTable();
