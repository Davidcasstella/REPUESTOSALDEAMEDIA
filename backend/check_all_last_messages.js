const http = require('http');

// Authenticate first, or fetch directly since we can query the backend database from inside
// Wait, we can just require the service directly to check!
const chatHistoryService = require('./src/services/chatHistory.service');
require('dotenv').config();

async function run() {
    try {
        const conversations = await chatHistoryService.getConversations({ includeGroups: true });
        console.log('Total conversations:', conversations.length);
        conversations.forEach(c => {
            console.log(`JID: ${c.jid}, Name: ${c.pushName}, Last Message Time: ${c.lastMessageTime}, Count: ${c.messageCount}`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    }
}
run();
