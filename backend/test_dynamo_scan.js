const { scanItems } = require('./src/config/dynamodb');
require('dotenv').config();

async function test() {
    try {
        console.log('Scanning DynamoDB chat-history table...');
        const items = await scanItems('chat-history');
        console.log('Success! Total items scanned:', items.length);
        console.log('Items:', items.map(item => ({ jid: item.jid, pushName: item.pushName })));
    } catch (err) {
        console.error('Error scanning DynamoDB:', err);
    }
}

test();
