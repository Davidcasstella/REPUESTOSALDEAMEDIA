const path = require('path');
require('dotenv').config();

const chatHistoryService = require('./src/services/chatHistory.service');

async function test() {
    try {
        console.log('Testing getConversations...');
        const convs = await chatHistoryService.getConversations({ includeGroups: true });
        console.log('Success! Conversations length:', convs.length);
        console.log('Conversations:', convs.map(c => ({ jid: c.jid, pushName: c.pushName })));
    } catch (err) {
        console.error('Error in getConversations:', err);
    }
}

test();
