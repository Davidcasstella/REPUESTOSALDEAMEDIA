// Force reload to pick up new .env changes v3
const { server } = require('./app');
const whatsapp = require('./core/WhatsApp');
const config = require('./config');

async function start() {
    try {
        console.log('🚀 Iniciando Chat Repuestos...');

        // 1. Iniciar Motor de WhatsApp
        await whatsapp.init();

        // 2. Initialize stages (creates default "General" stage in DynamoDB)
        try {
            const stagesService = require('./services/stages.service');
            await stagesService.initialize();
        } catch (stErr) {
            console.warn('⚠️ Stages init error:', stErr.message);
        }

        // 3. Iniciar Servidor HTTP
        server.listen(config.port, () => {
            console.log(`\n✅ Servidor en ejecución: http://localhost:${config.port}`);
            console.log(`📡 Entorno: ${config.env}`);
            console.log(`☁️ AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
            console.log(`🪣 S3 Bucket: ${process.env.AWS_S3_BUCKET || 'NOT SET'}`);
            console.log(`📊 DynamoDB Prefix: ${process.env.DYNAMODB_PREFIX || 'chatwifi'}\n`);
        });

    } catch (error) {
        console.error('❌ Error fatal al iniciar:', error);
        process.exit(1);
    }
}

start();

// Manejo de errores globales
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
});
