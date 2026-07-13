const chatHistoryService = require('./src/services/chatHistory.service');
require('dotenv').config();

async function test() {
    try {
        console.log('Fetching messages for David...');
        const data = await chatHistoryService.getMessages('573028599105@s.whatsapp.net');
        console.log('Messages length:', data.messages.length);
        console.log('Last 5 messages:', data.messages.slice(-5));
    } catch (err) {
        console.error('Error:', err);
    }
}

test();
