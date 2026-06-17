const { CreateTableCommand, DynamoDBClient } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_PREFIX = process.env.DYNAMODB_PREFIX || 'chatwifi';
const TABLE_NAME = `${TABLE_PREFIX}-quick-replies`;

const client = new DynamoDBClient({ region: REGION });

async function createTable() {
    console.log(`Checking/Creating DynamoDB table: ${TABLE_NAME}...`);
    try {
        const command = new CreateTableCommand({
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' } // Partition key
            ],
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' }
            ],
            BillingMode: 'PAY_PER_REQUEST'
        });

        const response = await client.send(command);
        console.log(`✅ Table ${TABLE_NAME} created successfully:`, response.TableDescription.TableStatus);
    } catch (err) {
        if (err.name === 'ResourceInUseException') {
            console.log(`ℹ️ Table ${TABLE_NAME} already exists.`);
        } else {
            console.error('❌ Error creating table:', err);
            process.exit(1);
        }
    }
}

createTable();
