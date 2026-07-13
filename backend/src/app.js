const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const whatsapp = require('./core/WhatsApp');
const authRoutes = require('./routes/auth.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const aiProvidersRoutes = require('./routes/aiProviders.routes');
const knowledgeBaseRoutes = require('./routes/knowledgeBase.routes');
const blockedNumbersRoutes = require('./routes/blockedNumbers.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const welcomeAutomationRoutes = require('./routes/welcomeAutomation.routes');
const aiFallbackRoutes = require('./routes/aiFallback.routes');
const aiAutomationsRoutes = require('./routes/aiAutomations.routes');
const chatRoutes = require('./routes/chat.routes');
const groupsRoutes = require('./routes/groups.routes');
const demandAnalyticsRoutes = require('./routes/demandAnalytics.routes');
const productCatalogRoutes = require('./routes/productCatalog.routes');
const quickRepliesRoutes = require('./routes/quickReplies.routes');
const guideRulesRoutes = require('./routes/guideRules.routes');
const campaignsRoutes = require('./routes/campaigns.routes');
const contactsRoutes = require('./routes/contacts.routes');
const leadsRoutes = require('./routes/leads.routes');
const alertConfigRoutes = require('./routes/alertConfig.routes');
const blockedNumbersService = require('./services/blockedNumbers.service');
const analyticsService = require('./services/analyticsService');
const demandAnalyticsService = require('./services/demandAnalytics.service');
// Database removed — DynamoDB initialized automatically by each service
const stagesService = require('./services/stages.service');
const welcomeAutomationService = require('./services/welcomeAutomation.service');
const aiFallbackService = require('./services/aiFallback.service');
const { verifyToken } = require('./middleware/auth.middleware');

// ============================================================
// MASTER AI SWITCH — change at runtime via API or socket
// ============================================================
global.aiEnabled = true;



const app = express();

// Explicit CORS config — restrict to known origins (Vercel + local dev)
const ALLOWED_ORIGINS = [
    'https://voleo-solutions.vercel.app',   // Vercel production frontend
    'http://localhost:5173',                // Local development
    'http://localhost:3000',                // Local backend serving frontend
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS blocked request from: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests for all routes

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});


// Expose io to routes via app.set
app.set('io', io);

// Connect Socket.IO to ETL Job Service for real-time progress events
const etlJobService = require('./services/etlJob.service');
etlJobService.setIO(io);

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ai-providers', aiProvidersRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/blocked-numbers', blockedNumbersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/welcome-automation', welcomeAutomationRoutes);
app.use('/api/ai-fallback', aiFallbackRoutes);
app.use('/api/ai-automations', aiAutomationsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/demand-analytics', demandAnalyticsRoutes);
app.use('/api/product-catalog', productCatalogRoutes);
app.use('/api/quick-replies', quickRepliesRoutes);
app.use('/api/guide-rules', guideRulesRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/alert-config', alertConfigRoutes);

// API Status (Pública)
app.get('/api/status', (req, res) => {
    res.json(whatsapp.getStatus());
});

// ============================================================
// AI TOGGLE ROUTES — Protected
// ============================================================
// GET current AI state
app.get('/api/ai/status', verifyToken, (req, res) => {
    res.json({ enabled: global.aiEnabled });
});

// POST toggle AI on/off
app.post('/api/ai/toggle', verifyToken, (req, res) => {
    global.aiEnabled = !global.aiEnabled;
    console.log(`🤖 IA ${global.aiEnabled ? '✅ ENCENDIDA' : '🔴 APAGADA'} por el usuario`);
    // Broadcast new state to all connected dashboards
    io.emit('ai-status', { enabled: global.aiEnabled });
    res.json({ enabled: global.aiEnabled });
});

// Ruta Privada de Prueba
app.get('/api/private/test', verifyToken, (req, res) => {
    res.json({
        success: true,
        message: 'Has accedido a una ruta protegida',
        user: req.user
    });
});

// Socket.io for Real-time QR and Status
io.on('connection', (socket) => {
    console.log('Cliente conectado al dashboard');

    // Send initial states
    socket.emit('whatsapp-status', whatsapp.getStatus());
    socket.emit('ai-status', { enabled: global.aiEnabled });
});

const aiResponseService = require('./services/aiResponse.service');
const apiKeyRotation = require('./services/apiKeyRotation.service');
const audioTranscription = require('./services/audioTranscription.service');
const aiAutomationsService = require('./services/aiAutomations.service');
const paymentDetection = require('./services/paymentDetection.service');
const humanResponse = require('./services/humanResponse.service');
const chatHistoryService = require('./services/chatHistory.service');
const sentTracker = require('./utils/sentTracker');
const leadScoringService = require('./services/leadScoring.service');
const alertNotificationsService = require('./services/alertNotifications.service');
const campaignsService = require('./services/campaigns.service');
apiKeyRotation.setIo(io);
humanResponse.setDependencies(io, chatHistoryService);

// Per-JID processing lock to prevent race conditions
// (e.g., client sends 2nd message while bot is still sending welcome flow)
const _processingJids = new Map();

// Wire Socket.io to AI Providers for real-time status events (pool system)
const aiProvidersService = require('./services/aiProviders.service');
aiProvidersService.setIo(io);

// Inject WhatsApp + chatHistory into groups routes for /sync endpoint
groupsRoutes.setDependencies(whatsapp, chatHistoryService);

// Escuchar eventos de WhatsApp y emitir vía Socket.io
whatsapp.on('status-update', (data) => {
    io.emit('whatsapp-update', data);
    // Keep the key rotation service aware of the current WhatsApp socket
    if (data.status === 'connected' && whatsapp.sock) {
        apiKeyRotation.setSock(whatsapp.sock);
        // Inject socket into alert notifications service for WhatsApp alerts
        alertNotificationsService.setSock(whatsapp.sock);
        // Inject dependencies into campaigns service
        campaignsService.setDependencies(whatsapp.sock, chatHistoryService, io);
    }
});

// ── KEY ROTATION STATUS ENDPOINT ──
app.get('/api/key-rotation/status', verifyToken, (req, res) => {
    const status = apiKeyRotation.getStatus();
    res.json({ success: true, rotation: status });
});

// ============================================================
// MANUAL INTERVENTION DETECTION
// Detect outgoing messages from the owner (not sent by the bot)
// and auto-disable AI for that specific chat.
// ============================================================
whatsapp.on('message', async (m) => {
    try {
        const msg = m.messages[0];
        if (!msg) return;

        const rawJid = msg.key?.remoteJid || '';
        // Normalize JID: strip device suffix (e.g. "573028599105:42@s.whatsapp.net" → "573028599105@s.whatsapp.net")
        let remoteJid = rawJid.replace(/:\d+@/, '@');

        // MAP KNOWN LIDs TO REAL NUMBER TO MERGE CHATS
        // As requested: the client's PC shows 254468541157383@lid instead of their root 573028599105
        const LID_MAPPINGS = {
            '254468541157383@lid': '573028599105@s.whatsapp.net'
        };
        if (LID_MAPPINGS[remoteJid]) {
            remoteJid = LID_MAPPINGS[remoteJid];
        }

        // === EARLY TEXT EXTRACTION (needed by outgoing handler below) ===
        const text = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            msg.message?.templateMessage?.hydratedTemplate?.hydratedContentText ||
            msg.message?.templateMessage?.hydratedTemplate?.hydratedTitleText ||
            msg.message?.buttonsResponseMessage?.selectedDisplayText ||
            msg.message?.listResponseMessage?.title ||
            msg.message?.viewOnceMessage?.message?.imageMessage?.caption ||
            msg.message?.viewOnceMessage?.message?.videoMessage?.caption ||
            msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
            msg.message?.interactiveResponseMessage?.body?.text ||
            '';

        // === OUTGOING MESSAGE HANDLER (fromMe = true) ===
        // Handles: bot messages (skip), dashboard messages (skip, already saved),
        //          and native phone/web messages (save + detect manual intervention)
        if (msg.key.fromMe && m.type === 'notify') {
            if (remoteJid.includes('@g.us')) return;

            // 1. Bot-sent messages: already saved by humanResponse or direct send — skip
            const wasBot = welcomeAutomationService.wasBotSent(remoteJid);
            if (wasBot) return;

            // 2. Dashboard-sent messages: already saved by chat.routes — skip
            if (sentTracker.wasSentRecently(remoteJid)) return;

            // 3. Native phone/web message (true manual intervention)
            // Save to chat history for dashboard sync
            try {
                const savedMsg = await chatHistoryService.addMessage(remoteJid, text || '[media]', true, msg.pushName, 'agent');
                io.emit('chat:message', { jid: remoteJid, message: savedMsg });
            } catch (_) { }

            // Disable AI for this chat (agent took over manually)
            if (remoteJid && !remoteJid.includes('@g.us')) {
                console.log(`✋ Manual intervention detected for ${remoteJid} — disabling AI for this chat`);
                try {
                    await welcomeAutomationService.disableUserAI(remoteJid);
                } catch (_) { }
            }
            return;
        }

        // === BLOCKED NUMBERS GUARD (runs before AI) ===
        const isBlockedNumber = await blockedNumbersService.isBlocked(remoteJid);
        const botConfig = await blockedNumbersService.getConfig();
        const isGroupMsg = remoteJid.includes('@g.us');

        // ── Group message: save metadata for dashboard listing, skip AI ──
        // This runs BEFORE blockGroups check so groups always appear in the dashboard
        if (isGroupMsg && !msg.key.fromMe && m.type === 'notify') {
            try {
                const groupName = msg.pushName || remoteJid.replace('@g.us', '');
                await chatHistoryService.addMessage(remoteJid, text || '[media]', false, groupName, 'client');
                io.emit('chat:message', { jid: remoteJid, message: { text: text || '[media]', fromMe: false, timestamp: new Date().toISOString(), sender: 'client' } });
                // Intercept group messages for demand analytics (non-blocking)
                demandAnalyticsService.processGroupMessage(remoteJid, text, msg.pushName).catch(() => {});
            } catch (_) { }
            return; // Groups never processed by AI, only stored
        }

        if (isBlockedNumber) {
            console.log(`🚫 Número bloqueado, ignorando: ${remoteJid}`);
            return;
        }
        if (botConfig.blockGroups && isGroupMsg) {
            console.log(`👥 Grupo ignorado (blockGroups activo): ${remoteJid}`);
            return;
        }

        // === WELCOME 24H AUTOMATION (runs before AI, non-blocking) ===
        let welcomeWasSent = false;

        // Race condition guard: if this JID is already being processed
        // (e.g., bot is in the middle of sending welcome/AI with delays),
        // skip the welcome flow to avoid duplicate sends.
        if (_processingJids.has(remoteJid)) {
            // Safety: auto-clear stale locks older than 30 seconds
            const lockAge = Date.now() - (_processingJids.get(remoteJid) || 0);
            if (lockAge > 30000) {
                console.log(`⚠️ [Lock] Stale lock for ${remoteJid} (${(lockAge / 1000).toFixed(0)}s) — force-releasing`);
                _processingJids.delete(remoteJid);
            } else {
                console.log(`⏳ [Lock] ${remoteJid} already being processed — skipping welcome check`);
            }
        }

        if (!_processingJids.has(remoteJid)) {
            // Mark JID as processing BEFORE the welcome flow starts
            _processingJids.set(remoteJid, Date.now());
            try {
                welcomeWasSent = await welcomeAutomationService.runIfNeeded(whatsapp.sock, remoteJid, chatHistoryService, io, msg.pushName);
            } catch (welcomeErr) {
                console.error(`⚠️ Welcome automation error: ${welcomeErr.message}`);
            } finally {
                // Always release the lock after the welcome check completes
                _processingJids.delete(remoteJid);
            }

            // If the welcome flow was just sent, skip AI response entirely.
            if (welcomeWasSent) {
                console.log(`🔔 Welcome flow sent to ${remoteJid} — skipping AI response to avoid duplicate greeting`);
                return;
            }
        }

        // (text already extracted above)

        // === AUDIO DETECTION (voice notes and audio files) ===
        const msgContent = msg.message || {};
        const isAudioMessage = !text && (msgContent.audioMessage || msgContent.ptvMessage);

        // === IMAGE DETECTION (for payment receipt analysis) ===
        const isImageMessage = !text && (msgContent.imageMessage);

        // === MEDIA-ONLY DETECTION (video, sticker, document without text) ===
        const isMediaOnly = !text && !isAudioMessage && !isImageMessage && (
            msgContent.videoMessage ||
            msgContent.stickerMessage ||
            msgContent.documentMessage ||
            msgContent.viewOnceMessage ||
            msgContent.contactMessage ||
            msgContent.locationMessage
        );

        // === MASTER AI SWITCH CHECK ===
        if (!global.aiEnabled) {
            console.log('🔴 IA apagada — mensaje ignorado');
            if (!msg.key.fromMe && m.type === 'notify') {
                try { await welcomeAutomationService.updateUserMessage(remoteJid, text || '[media]'); } catch (_) { }
            }
            return;
        }

        // Ignorar mensajes propios ya procesados y mensajes que no sean notificaciones directas
        if (!msg.key.fromMe && m.type === 'notify') {

            // ── Record incoming message in chat history ──
            try {
                const savedMsg = await chatHistoryService.addMessage(remoteJid, text || '[media]', false, msg.pushName, 'client');
                io.emit('chat:message', { jid: remoteJid, message: savedMsg });
            } catch (_) { }

            // ── LEAD SCORING HOOK — detect purchase intent from incoming messages ──
            if (text && !remoteJid.includes('@g.us')) {
                try {
                    const campaignCtx = await campaignsService.getCampaignContextForJid(remoteJid);
                    const campaignId = campaignCtx?.campaignId || null;
                    const result = await leadScoringService.analyzeAndScore(
                        remoteJid, text, msg.pushName, campaignId
                    );
                    if (result && result.lead && !result.lead.notified) {
                        // Fetch campaign name for notification context
                        let campaignName = campaignCtx?.campaignName || null;
                        // Send configured alerts (WhatsApp + email)
                        const wasAlertSent = await alertNotificationsService.notifyLead(result.lead, campaignName).catch((err) => {
                            console.error('❌ Error sending lead alert:', err.message);
                            return false;
                        });
                        if (wasAlertSent) {
                            await leadScoringService.markNotified(result.lead.id);
                        }

                        // Send friendly handoff message to the client
                        if (result.score === 'caliente' || result.lead.priority) {
                            if (whatsapp.sock) {
                                welcomeAutomationService.markBotSent(remoteJid);
                                await whatsapp.sock.sendMessage(remoteJid, {
                                    text: 'de acuerdo un momento'
                                });
                                try {
                                    const savedHandoffMsg = await chatHistoryService.addMessage(remoteJid, 'de acuerdo un momento', true, undefined, 'bot');
                                    io.emit('chat:message', { jid: remoteJid, message: savedHandoffMsg });
                                } catch (_) { }
                            }
                        }

                        io.emit('lead:detected', { lead: result.lead, score: result.score });
                        console.log(`🎯 Lead [${result.score}] detected and notified: ${remoteJid}`);
                    }
                } catch (_) { }
            }

            // === AUDIO MESSAGE HANDLER: transcribe and process with AI ===
            if (isAudioMessage) {
                // Check if voice processing is enabled
                const automationsConfig = await aiAutomationsService.getConfig();
                if (!automationsConfig.voiceProcessingEnabled) {
                    console.log(`🔇 Voice processing disabled — ignoring audio from ${remoteJid}`);
                    try { await welcomeAutomationService.updateUserMessage(remoteJid, '[audio]'); } catch (_) { }
                    try { analyticsService.trackIncoming(remoteJid); } catch (_) { }
                    return;
                }

                console.log(`🎤 Audio message received from ${remoteJid}`);
                try { await welcomeAutomationService.updateUserMessage(remoteJid, '[audio]'); } catch (_) { }
                try { analyticsService.trackIncoming(remoteJid); } catch (_) { }

                // Check per-user AI status before processing
                const userAIForAudio = await welcomeAutomationService.isAIEnabledForUser(remoteJid);
                if (!userAIForAudio) {
                    console.log(`🔇 AI disabled for user ${remoteJid} — skipping audio transcription`);
                    return;
                }

                try {
                    const transcribedText = await audioTranscription.processAudioMessage(msg);
                    console.log(`🎤→📝 Audio transcribed from ${remoteJid}: "${transcribedText}"`);

                    // Feed transcribed text into the existing AI response flow
                    const response = await aiResponseService.generateResponse(transcribedText, remoteJid);
                    console.log(`✅ AI response for audio: "${response}"`);

                    // Handle all-providers-exhausted (same as text flow)
                    if (response === '__ALL_PROVIDERS_EXHAUSTED__') {
                        if (whatsapp.sock) {
                            welcomeAutomationService.markBotSent(remoteJid);
                            await whatsapp.sock.sendMessage(remoteJid, { text: 'Ok 👍' });
                        }
                        try { await aiFallbackService.sendExhaustionNotification(whatsapp.sock, remoteJid, transcribedText, msg.pushName); } catch (_) { }
                        try { analyticsService.trackOutgoing(); } catch (_) { }
                        return;
                    }

                    // Handle fallback (same as text flow)
                    const isFallback = await aiFallbackService.isFallbackResponse(response);
                    if (isFallback) {
                        console.log(`⚠️ AI FALLBACK for audio from ${remoteJid}`);
                        if (whatsapp.sock) {
                            welcomeAutomationService.markBotSent(remoteJid);
                            await whatsapp.sock.sendMessage(remoteJid, { text: 'Ok, sumercé. En un momento le ayudamos.' });
                        }
                        await welcomeAutomationService.disableUserAI(remoteJid);
                        await welcomeAutomationService.updateUserState(remoteJid);
                        await aiFallbackService.registerPending(remoteJid, transcribedText);
                        try { await aiFallbackService.sendAdminNotification(whatsapp.sock, remoteJid, `[Audio] ${transcribedText}`, msg.pushName); } catch (_) { }
                        try { analyticsService.trackOutgoing(); } catch (_) { }
                        return;
                    }

                    // Send successful AI response (human-like 3-part)
                    if (whatsapp.sock) {
                        await humanResponse.sendHumanLike(
                            whatsapp.sock,
                            remoteJid,
                            response,
                            (jid) => welcomeAutomationService.markBotSent(jid),
                            { isPostWelcomeFlow: welcomeWasSent }
                        );
                        console.log(`🤖 Audio response sent to ${remoteJid} (human-like)`);
                        try { analyticsService.trackOutgoing(); } catch (_) { }
                    }
                } catch (audioErr) {
                    console.error(`❌ Audio transcription failed for ${remoteJid}: ${audioErr.message}`);
                    // Send friendly error message to user
                    if (whatsapp.sock) {
                        welcomeAutomationService.markBotSent(remoteJid);
                        await whatsapp.sock.sendMessage(remoteJid, {
                            text: 'No pude entender el audio, ¿podrías enviarlo nuevamente o escribir tu mensaje?'
                        });
                        try { analyticsService.trackOutgoing(); } catch (_) { }
                    }
                }
                return;
            }

            // === IMAGE PAYMENT DETECTION HANDLER ===
            if (isImageMessage) {
                const automationsConfig = await aiAutomationsService.getConfig();
                if (automationsConfig.paymentDetectionEnabled) {
                    console.log(`📸 Image received from ${remoteJid} — analyzing for payment receipt...`);
                    try { await welcomeAutomationService.updateUserMessage(remoteJid, '[image]'); } catch (_) { }
                    try { analyticsService.trackIncoming(remoteJid); } catch (_) { }

                    try {
                        const isPayment = await paymentDetection.analyzeMessage(msg);

                        if (isPayment) {
                            console.log(`💳 Payment receipt DETECTED from ${remoteJid}`);
                            if (whatsapp.sock) {
                                welcomeAutomationService.markBotSent(remoteJid);
                                await whatsapp.sock.sendMessage(remoteJid, {
                                    text: 'Perfecto 👍\nEstoy verificando tu pago.\n\nPara enviarte toda la información del curso, por favor envíame tu correo electrónico.'
                                });
                                console.log(`📤 Payment confirmation sent to ${remoteJid}`);
                                try { analyticsService.trackOutgoing(); } catch (_) { }
                            }
                        } else {
                            console.log(`📸 Image from ${remoteJid} is NOT a payment receipt — media-only flow`);
                            // Fall through to media-only handler behavior
                            if (whatsapp.sock) {
                                welcomeAutomationService.markBotSent(remoteJid);
                                await whatsapp.sock.sendMessage(remoteJid, { text: 'ok' });
                            }
                            await welcomeAutomationService.disableUserAI(remoteJid);
                            await aiFallbackService.registerPending(remoteJid, '[imageMessage]');
                            try { await aiFallbackService.sendAdminNotification(whatsapp.sock, remoteJid, '[Envió imagen]', msg.pushName); } catch (_) { }
                            try { analyticsService.trackOutgoing(); } catch (_) { }
                        }
                    } catch (imgErr) {
                        console.error(`❌ Payment detection failed for ${remoteJid}: ${imgErr.message}`);
                        // On error, fall through to media-only behavior
                        if (whatsapp.sock) {
                            welcomeAutomationService.markBotSent(remoteJid);
                            await whatsapp.sock.sendMessage(remoteJid, { text: 'ok' });
                        }
                        await welcomeAutomationService.disableUserAI(remoteJid);
                        await aiFallbackService.registerPending(remoteJid, '[imageMessage]');
                        try { await aiFallbackService.sendAdminNotification(whatsapp.sock, remoteJid, '[Envió imagen]', msg.pushName); } catch (_) { }
                        try { analyticsService.trackOutgoing(); } catch (_) { }
                    }
                    return;
                }
                // If payment detection is OFF, image falls through to media-only below
            }

            // === MEDIA-ONLY HANDLER: send "ok" and switch to manual mode ===
            // Also catches images when payment detection is OFF (they fall through above)
            if (isMediaOnly || isImageMessage) {
                const mediaType = Object.keys(msgContent).find(k => k !== 'messageContextInfo') || 'unknown';
                console.log(`📎 Media-only message received from ${remoteJid} (type: ${mediaType})`);

                // Track the media message
                try { await welcomeAutomationService.updateUserMessage(remoteJid, `[${mediaType}]`); } catch (_) { }
                try { analyticsService.trackIncoming(remoteJid); } catch (_) { }

                // Send "ok" and switch to manual mode
                if (whatsapp.sock) {
                    welcomeAutomationService.markBotSent(remoteJid);
                    await whatsapp.sock.sendMessage(remoteJid, { text: 'ok' });
                    console.log(`📤 "ok" sent to ${remoteJid} (media → manual mode)`);
                }
                await welcomeAutomationService.disableUserAI(remoteJid);
                console.log(`🔒 AI disabled for ${remoteJid} (media message)`);
                await aiFallbackService.registerPending(remoteJid, `[${mediaType}]`);
                try {
                    await aiFallbackService.sendAdminNotification(whatsapp.sock, remoteJid, `[Envió ${mediaType}]`, msg.pushName);
                    console.log(`📢 Admin notified about media from ${remoteJid}`);
                } catch (_) { }
                try { analyticsService.trackOutgoing(); } catch (_) { }
                return;
            }

            // === LOG UNEXTRACTABLE MESSAGES ===
            if (!text) {
                const msgTypes = Object.keys(msgContent).filter(k => k !== 'messageContextInfo').join(', ');
                console.log(`⚠️ Message from ${remoteJid} with no extractable text. Types: ${msgTypes}`);
                try { await welcomeAutomationService.updateUserMessage(remoteJid, '[unrecognized message]'); } catch (_) { }
                try { analyticsService.trackIncoming(remoteJid); } catch (_) { }
                return;
            }

            console.log(`📩 Mensaje recibido de ${remoteJid}: ${text}`);

            // === TRACK USER MESSAGE (for dashboard display) ===
            try { await welcomeAutomationService.updateUserMessage(remoteJid, text); } catch (_) { }

            // === ANALYTICS TRACKING (secondary, non-blocking) ===
            try { analyticsService.trackIncoming(remoteJid); } catch (_) { }

            // === PAYMENT ACCOUNT INTERCEPTOR (before AI) ===
            // Detects when user asks for specific account/number to pay
            const textLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const PAYMENT_ACCOUNT_PATTERNS = [
                /a\s*que\s*numero\s*(consigno|pago|transfiero)/,
                /cual\s*es\s*(la|el)\s*(cuenta|numero)/,
                /me\s*pasas?\s*(el|tu|un)\s*numero/,
                /donde\s*(puedo\s*|debo\s*|hago\s*para\s*)?(consignar|pagar|transferir|pago|consigno|transfiero)/,
                /numero\s*(para|de)\s*(pagar|pago|consignar|transferir)/,
                /cual\s*es\s*(el\s*)?nequi/,
                /cual\s*es\s*(el\s*|la\s*)?daviplata/,
                /cuenta\s*(de\s*)?(nequi|daviplata)/,
                /numero\s*(de\s*)?(nequi|daviplata)/,
                /pasame\s*(el|la|tu)\s*(nequi|daviplata|cuenta|numero)/,
                /datos?\s*(de|para)\s*(pago|consignar|transferir|transferencia)/,
                /metodo(s)?\s*(de\s*)?pago/,
                /forma(s)?\s*(de\s*)?pago/,
                /medio(s)?\s*(de\s*)?pago/,
                /como\s*(le\s*)?(puedo\s*|debo\s*|hago\s*para\s*)?(pagar|consignar|transferir|pago|consigno|transfiero)/,
                /quiero\s*pagar/,
                /para\s*pagar/,
                /info(rmacion)?\s*(de|del|para)\s*pago/,
                /a\s*donde\s*(le\s*)?(puedo\s*|debo\s*|hago\s*para\s*)?(pagar|consignar|transferir|pago|consigno|transfiero)/,
            ];
            const isPaymentAccountQuery = PAYMENT_ACCOUNT_PATTERNS.some(p => p.test(textLower));
            if (isPaymentAccountQuery) {
                const PAYMENT_FIXED_RESPONSE = `Métodos de pago\nNequi o Daviplata\n\n\nCuenta:\n3028599105`;
                if (whatsapp.sock) {
                    welcomeAutomationService.markBotSent(remoteJid);
                    await whatsapp.sock.sendMessage(remoteJid, { text: PAYMENT_FIXED_RESPONSE });
                    console.log(`💳 Payment account info sent to ${remoteJid}`);
                    try { analyticsService.trackOutgoing(); } catch (_) { }
                }
                return;
            }

            // === PER-USER AI CHECK ===
            const userAIEnabled = await welcomeAutomationService.isAIEnabledForUser(remoteJid);
            if (!userAIEnabled) {
                console.log(`🔇 AI disabled for user ${remoteJid} — skipping AI response`);
                return;
            }

            // === FORCED FALLBACK TEST TRIGGER ===
            if (text.trim().toLowerCase() === 'prueba_fallback') {
                console.log(`🧪 FORCED FALLBACK TEST triggered by ${remoteJid}`);
                await welcomeAutomationService.disableUserAI(remoteJid);
                console.log(`🔒 AI disabled for ${remoteJid}`);
                await aiFallbackService.registerPending(remoteJid, text);
                try {
                    await aiFallbackService.sendAdminNotification(whatsapp.sock, remoteJid, text, msg.pushName);
                    console.log(`📢 Admin notified about ${remoteJid}`);
                } catch (_) { }
                try { analyticsService.trackOutgoing(); } catch (_) { }
                return;
            }


            // Generar respuesta con el proveedor activo
            const response = await aiResponseService.generateResponse(text, remoteJid);
            console.log(`✅ AI response received: "${response}"`);

            // === ALL PROVIDERS EXHAUSTED CHECK ===
            // When every AI provider has failed, send a neutral response to the user
            // and notify the admin with full details. No technical error shown to client.
            if (response === '__ALL_PROVIDERS_EXHAUSTED__') {
                console.log(`🚨 All AI providers exhausted. Setting fallback state for ${remoteJid}`);
                
                // Notify admin with full client details
                try {
                    await aiFallbackService.sendExhaustionNotification(
                        whatsapp.sock, remoteJid, text, msg.pushName
                    );
                    console.log(`📢 Admin notified about provider exhaustion for ${remoteJid}`);
                } catch (_) { }
                try { analyticsService.trackOutgoing(); } catch (_) { }
                return;
            }

            // === AI FALLBACK CHECK ===
            // If AI doesn't know the answer, send "ok", activate cooldown, notify admin
            const isFallback = await aiFallbackService.isFallbackResponse(response);
            if (isFallback) {
                console.log(`⚠️ AI FALLBACK TRIGGERED for ${remoteJid}: "${response}"`);
                
                // Send formal fallback message to client
                if (whatsapp.sock) {
                    welcomeAutomationService.markBotSent(remoteJid);
                    await whatsapp.sock.sendMessage(remoteJid, { text: 'Ok, sumercé. En un momento le ayudamos.' });
                    try {
                        const savedFallbackMsg = await chatHistoryService.addMessage(remoteJid, 'Ok, sumercé. En un momento le ayudamos.', true, undefined, 'bot');
                        io.emit('chat:message', { jid: remoteJid, message: savedFallbackMsg });
                    } catch (_) { }
                }

                // Disable AI for this chat
                await welcomeAutomationService.disableUserAI(remoteJid);
                console.log(`🔒 AI disabled for ${remoteJid}`);
                // Activate 24h cooldown so audio/video/text won't resend
                await welcomeAutomationService.updateUserState(remoteJid);
                console.log(`⏱️ 24h cooldown activated for ${remoteJid}`);
                // Register as pending
                await aiFallbackService.registerPending(remoteJid, text);
                // Notify admin via WhatsApp
                try {
                    await aiFallbackService.sendAdminNotification(whatsapp.sock, remoteJid, text, msg.pushName);
                    console.log(`📢 Admin notified about ${remoteJid}`);
                } catch (_) { }
                try { analyticsService.trackOutgoing(); } catch (_) { }
                return;
            }

            // Send AI response in human-like 3-part format
            if (whatsapp.sock) {
                await humanResponse.sendHumanLike(
                    whatsapp.sock,
                    remoteJid,
                    response,
                    (jid) => welcomeAutomationService.markBotSent(jid),
                    { isPostWelcomeFlow: welcomeWasSent }
                );
                console.log(`🤖 Respuesta enviada con IA (human-like): ${response}`);

                // Track outgoing response for analytics
                try { analyticsService.trackOutgoing(); } catch (_) { }
            }
        }
    } catch (error) {
        console.error('❌ Error manejando mensaje entrante para IA:', error.message);
    }
});

// Catch-all: serve React app for any non-API route (enables React Router on refresh)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = { app, server, io };
