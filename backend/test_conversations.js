const chatHistoryService = require('./src/services/chatHistory.service');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
    try {
        const conversations = await chatHistoryService.getConversations({ includeGroups: true });
        console.log('CONVERSATIONS:');
        console.log(JSON.stringify(conversations, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
