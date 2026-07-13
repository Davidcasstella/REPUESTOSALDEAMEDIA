require('dotenv').config();
const manualKnowledgeService = require('./src/services/manualKnowledge.service');
const qaPairsService = require('./src/services/qaPairs.service');

async function run() {
    try {
        console.log('🔄 Re-vectorizing all manual knowledge to S3...');
        const mkCount = await manualKnowledgeService.reprocessAll();
        console.log(`✅ Reprocessed ${mkCount} manual knowledge entries.`);

        console.log('🔄 Re-vectorizing all Q&A pairs to S3...');
        const qaCount = await qaPairsService.reprocessAll();
        console.log(`✅ Reprocessed ${qaCount} Q&A pairs.`);

        console.log('🎉 Reprocessing complete!');
    } catch (err) {
        console.error('❌ Error during reprocessing:', err);
    }
}
run();
