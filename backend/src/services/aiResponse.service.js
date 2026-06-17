const aiProvidersService = require('./aiProviders.service');
const knowledgeBaseService = require('./knowledgeBase.service');
const axios = require('axios');
const tokenUsageService = require('./tokenUsageService');
const apiKeyRotation = require('./apiKeyRotation.service');
const chatHistoryService = require('./chatHistory.service');

class AIResponseService {
    /**
     * Retrieves campaign context for the JID and builds a prompt string.
     * @param {string} jid
     * @returns {Promise<string>}
     */
    async generateContextWithCampaign(jid) {
        if (!jid) return '';
        try {
            const campaignsService = require('./campaigns.service');
            const campaignCtx = await campaignsService.getCampaignContextForJid(jid);
            if (campaignCtx) {
                return `El usuario recibió la campaña de marketing: "${campaignCtx.campaignName}". El mensaje enviado fue: "${campaignCtx.message}".${campaignCtx.product ? ` Producto/repuesto promocionado: "${campaignCtx.product}".` : ''} Ten en cuenta esto al responder si el usuario hace referencia a dicha campaña o producto.`;
            }
        } catch (err) {
            console.warn('⚠️ Error al obtener contexto de campaña para IA:', err.message);
        }
        return '';
    }

    /**
     * Generates a response using the active AI provider.
     * If knowledge base has relevant context, uses RAG to constrain the response.
     * @param {string} prompt - The user message.
     * @param {string|null} jid - WhatsApp JID for conversation history context.
     * @returns {Promise<string>} - The generated response.
     */
    async generateResponse(prompt, jid = null) {
        const activeProvider = await aiProvidersService.getActiveProvider();

        if (!activeProvider) {
            console.warn('⚠️ No hay ningún proveedor de IA activo.');
            return 'Lo siento, en este momento no tengo un motor de IA configurado.';
        }

        const { name, apiKey } = activeProvider;
        const providerName = name.toLowerCase();

        // NEW: Product catalog lookup (structured DB search before RAG)
        // If the user message contains a product reference or code,
        // return a direct response from the products database.
        // This bypasses RAG only for exact product matches — everything else continues as normal.
        try {
            const productCatalogService = require('./productCatalog.service');
            const productResult = await productCatalogService.searchFromChatQuery(prompt, jid);
            if (productResult) {
                console.log('📦 Product found in catalog DB — returning direct response');
                return productResult;
            }
        } catch (catalogErr) {
            // Non-blocking: if catalog search fails, continue with normal RAG flow
            console.warn('⚠️ Product catalog search error (non-blocking):', catalogErr.message);
        }

        let kbContext = await knowledgeBaseService.searchKnowledge(prompt);
        
        // For short conversational messages (nose, si, no, ok, dale, etc.)
        // RAG search often fails because they don't match well with embeddings.
        // Load the full KB content directly so the AI always has context.
        if (!kbContext) {
            const shortMessages = ['nose', 'no se', 'no sé', 'no', 'si', 'ok', 'dale', 'ya', 'bien', 'bueno', 'hola', 'como', 'que', 'interesado', 'quiero', 'me interesa', 'cuanto', 'precio'];
            const promptLower = prompt.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const isShortConversational = promptLower.length < 30 || shortMessages.some(sm => promptLower.includes(sm));
            
            if (isShortConversational) {
                console.log('💬 Short/conversational message detected, loading full KB as context...');
                try {
                    const fs = require('fs-extra');
                    const pathLib = require('path');
                    const mkPath = pathLib.join(__dirname, '../../knowledge-base/manual-knowledge.json');
                    const entries = await fs.readJson(mkPath);
                    if (Array.isArray(entries) && entries.length > 0) {
                        kbContext = entries.map(e => `${e.title}\n${e.content}`).join('\n\n');
                    }
                } catch (err) {
                    console.error('❌ Error loading manual-knowledge fallback:', err.message);
                }
            }
        }

        if (!kbContext) {
            console.log('🌐 No RAG context found, short-circuiting to FALLBACK_TRIGGER to enforce strict KB usage.');
            return 'FALLBACK_TRIGGER';
        }

        let guideRulesText = '';
        try {
            const guideRulesService = require('./guideRules.service');
            const allRules = await guideRulesService.getAll();
            const activeRules = allRules.filter(r => r.isActive);
            if (activeRules.length > 0) {
                guideRulesText = activeRules.map((r, index) => `- **${r.name}** (Categoría: ${r.category}): ${r.content}`).join('\n');
            }
        } catch (ruleErr) {
            console.warn('⚠️ Error loading guide rules for system prompt:', ruleErr.message);
        }

               const campaignContextText = await this.generateContextWithCampaign(jid);

        let leadContextText = '';
        if (jid) {
            try {
                const leadScoringService = require('./leadScoring.service');
                const lead = await leadScoringService.getLeadByJid(jid);
                if (lead) {
                    leadContextText = `INFORMACIÓN ACUMULADA DEL CLIENTE EN EL CRM (Úsala para continuar el contexto de forma natural y no volver a preguntar lo que ya sabemos):
- Producto de interés: ${lead.interestProduct || 'No identificado aún'}
- Industria: ${lead.industry || 'No especificada'}
- Cantidad requerida: ${lead.quantity || 'No especificada'}
- Medidas: ${lead.dimensions || 'No especificadas'}
- Ubicación: ${lead.location || 'No especificada'}
- Empresa: ${lead.company || 'No especificada'}
- Nivel de urgencia: ${lead.urgency || 'Normal'}
- Score de temperatura: ${lead.score || 'frio'}`;
                }
            } catch (leadErr) {
                console.warn('⚠️ Error al obtener datos del lead para el prompt:', leadErr.message);
            }
        }

        console.log('📚 RAG context found, applying sales-oriented prompt...');
        let systemPrompt = `ERES UN ASESOR PROFESIONAL DE REPUESTOS por WhatsApp. Respondes como un humano real colombiano.

PERSONALIDAD:
- Hablas con respeto y amabilidad colombiana. Usas "sumercé" "con gusto" "a la orden" "claro que sí".
- Eres profesional servicial y seguro sobre los productos.
- NUNCA dices "no se" ni "no tengo informacion" ni nada negativo.
- NUNCA mencionas que eres una IA ni que tienes un "contexto".

${leadContextText ? `INFORMACIÓN DEL CRM ACUMULADA:
${leadContextText}

REGLAS DE USO DE INFORMACIÓN DEL CRM:
- Usa estos datos ÚNICAMENTE para evitar volver a preguntar lo que ya sabemos (por ejemplo, si ya tenemos su empresa o ubicación, no le preguntes cuál es).
- NUNCA fuerces ni menciones los nombres de su empresa (ej. Colminas) o ubicación (ej. Boyacá) en respuestas informativas generales o saludos, ya que suena robótico y fuera de contexto.
- Solo menciónalos de manera natural cuando sea indispensable (por ejemplo, al acordar el envío, despachar el pedido o confirmar datos de facturación).
` : ''}

${campaignContextText ? `CONTEXTO DE CAMPAÑA MARKETING ENVIADA AL CLIENTE:
${campaignContextText}
` : ''}

${guideRulesText ? `REGLAS DE GUÍA DADAS POR EL ADMINISTRADOR (CÚMPLELES ESTRICTAMENTE):
${guideRulesText}
` : ''}

REGLAS CRITICAS DE FORMATO (LONGITUD):
- Cada parte del mensaje debe ser CORTA. MAXIMO 25 palabras por parte. Si necesitas decir mas usa el separador ||| para crear otro mensaje.
- Si vas a hacer una pregunta NUNCA uses el simbolo ¿ (apertura). Solo usa ? al final. DE LO CONTRARIO NO PONGAS SIGNOS DE INTERROGACION.
- NUNCA uses comas ni puntos finales. Evita textos largos y aburridos.
- No uses emojis.
- NUNCA hagas saltos de linea dentro de una parte. Escribe TODO seguido en una sola linea.
- PROHIBIDO usar enters o \n dentro de cada parte.
- ROMPE CUALQUIER EXPLICACION LARGA usando |||. Ejemplo: sumercé con gusto le ayudo ||| tenemos ese repuesto disponible ||| dême el modelo del carro y le busco

REGLA ESPECIAL: CLIENTE NO HA ENCONTRADO SU REPUESTO:
- Si el cliente lleva 2 o mas mensajes buscando y aun no encuentra lo que necesita SIEMPRE ofrece alternativas.
- Busca en el Contexto hasta 5 repuestos parecidos o del mismo tipo y listalos numerados.
- Formato para listar alternativas: "sumercé le muestro algunas referencias similares que tenemos" ||| "1. [codigo] - [descripcion] - [marca]" ||| "2. [codigo] - [descripcion] - [marca]" ... ||| "me dice cuál le interesa y le doy el precio".
- NUNCA desapareces sin dar opciones cuando el cliente no encuentra su repuesto.

RESPUESTAS A "NOSE" "NO SE" "NO":
Cuando el cliente dice que no sabe SIEMPRE responde en 2 o 3 partes separadas por |||
Ejemplo: sumercé con gusto le explico lo que necesite ||| tenemos muchas referencias disponibles ||| me dice qué carro tiene y le busco

REGLAS DE RESPUESTA:
1. Usa SOLO la informacion del Contexto. No inventes datos ni precios.
2. Si el Contexto tiene una respuesta usala con tu tono respetuoso pero FRAGMENTADA en partes.
3. Si el mensaje es corto ("ok" "si" "dale") responde en 1 sola parte breve e invita a preguntar.
4. Si el cliente dice "no" o muestra desinteres NO te rindas. Resalta beneficios con respeto.
5. SOLO emite FALLBACK_TRIGGER si el mensaje es incomprensible o no tiene relacion con repuestos automotrices.

PROHIBICIONES ABSOLUTAS:
- NUNCA inventes precios. NUNCA digas un valor en pesos si no esta EXACTO en el Contexto.
- NUNCA inventes stock ni unidades disponibles.
- NUNCA inventes garantias ni tiempos de envio.
- Si el cliente pide precio y no tienes el dato responde: "sumercé déjeme verificar el precio con el asesor y le confirmo"
- Si ya le diste información del repuesto y el cliente dice "si" responde: "sumercé con gusto le confirmo" NO inventes un precio.

FORMATO ESTRICTO:
- Respuesta CORTA (saludos/confirmaciones): 1 sola parte. Maximo 15 palabras.
- Respuesta a "nose" o "no se": SIEMPRE 3 partes separadas por |||
- Respuesta MEDIA (pregunta simple): 2 o 3 partes separadas por |||
- Respuesta LARGA (explicacion detallada o lista de productos): 4 o 5 partes CORTAS separadas por |||
- La ultima parte SIEMPRE invita a preguntar mas o a realizar su pedido.
- Cada parte es UNA SOLA LINEA corrida sin saltos de linea.

Contexto proporcionado:
${kbContext}
`;

        // Build conversation history for multi-turn context (last 15 messages)
        let conversationHistory = [];
        if (jid) {
            try {
                const conversation = await chatHistoryService.getMessages(jid);
                if (conversation.messages && conversation.messages.length > 0) {
                    // Take last 15 messages excluding the current one (already saved before this call)
                    const recentMessages = conversation.messages.slice(-16, -1);
                    conversationHistory = recentMessages.map(m => ({
                        role: m.fromMe ? 'assistant' : 'user',
                        content: m.text || '[media]'
                    }));
                    if (conversationHistory.length > 0) {
                        console.log(`💬 [AI] Loaded ${conversationHistory.length} previous messages for context (jid: ${jid.substring(0, 10)}...)`);
                    }
                }
            } catch (histErr) {
                console.warn('⚠️ Could not load conversation history:', histErr.message);
            }
        }

        try {
            // Detection priority: use API key prefix as strongest signal,
            // then fall back to provider name.
            // This prevents misrouting (e.g. a gsk_ key named "Grok" going to xAI instead of Groq)
            const isGroq = apiKey.startsWith('gsk_') || (providerName.includes('groq') || providerName.includes('grog'));
            const isOpenAI = !isGroq && (apiKey.startsWith('sk-') || providerName.includes('openai'));
            const isGemini = !isGroq && !isOpenAI && (apiKey.startsWith('AIza') || providerName.includes('gemini'));
            const isGrok = !isGroq && !isOpenAI && !isGemini && providerName.includes('grok');

            if (isGroq) {
                console.log(`🔑 [AI] Provider "${name}" routed to GROQ (key prefix: ${apiKey.substring(0, 4)}...)`);
                // Use key rotation for Groq — tries all available keys on rotatable errors
                return await apiKeyRotation.callWithRotation(
                    'groq',
                    (key, sys, usr) => this.callGroq(key, sys, usr, conversationHistory),
                    systemPrompt,
                    prompt,
                    apiKey
                );
            } else if (isOpenAI) {
                console.log(`🔑 [AI] Provider "${name}" routed to OPENAI`);
                // Use key rotation for OpenAI — tries all available keys on rotatable errors
                return await apiKeyRotation.callWithRotation(
                    'openai',
                    (key, sys, usr) => this.callOpenAI(key, sys, usr, conversationHistory),
                    systemPrompt,
                    prompt,
                    apiKey
                );
            } else if (isGrok) {
                console.log(`🔑 [AI] Provider "${name}" routed to GROK (xAI)`);
                // Use key rotation for Grok — tries all available keys on rotatable errors
                return await apiKeyRotation.callWithRotation(
                    'grok',
                    (key, sys, usr) => this.callGrok(key, sys, usr, conversationHistory),
                    systemPrompt,
                    prompt,
                    apiKey
                );
            } else if (isGemini) {
                console.log(`🔑 [AI] Provider "${name}" routed to GEMINI`);
                // Use key rotation for Gemini — tries all available keys on rotatable errors
                return await apiKeyRotation.callWithRotation(
                    'gemini',
                    (key, sys, usr) => this.callGemini(key, sys, usr, conversationHistory),
                    systemPrompt,
                    prompt,
                    apiKey
                );
            } else if (providerName.includes('z.ia')) {
                // For Z.ia we still use the old complex prompt as it's a local extractor
                const combinedPrompt = `Contexto:\n${kbContext || ''}\n\nPregunta del cliente:\n${prompt}`;
                return await this.callZIA(apiKey, combinedPrompt);
            } else {
                throw new Error(`Proveedor ${name} no soportado para generación.`);
            }
        } catch (primaryError) {
            console.error(`❌ Error generando respuesta con ${name}:`, primaryError.message);

            // Cross-provider fallback: try ALL other provider types that have available keys
            console.log('🔄 [AI] Active provider failed. Trying cross-provider fallback...');

            const fallbackProviders = [
                { type: 'groq', callFn: (key, sys, usr) => this.callGroq(key, sys, usr, conversationHistory) },
                { type: 'openai', callFn: (key, sys, usr) => this.callOpenAI(key, sys, usr, conversationHistory) },
                { type: 'grok', callFn: (key, sys, usr) => this.callGrok(key, sys, usr, conversationHistory) },
                { type: 'gemini', callFn: (key, sys, usr) => this.callGemini(key, sys, usr, conversationHistory) },
            ];

            // Determine which type the active provider was, to skip it
            const activeType = apiKey.startsWith('gsk_') ? 'groq'
                : apiKey.startsWith('sk-') ? 'openai'
                    : apiKey.startsWith('AIza') ? 'gemini'
                        : providerName.includes('grok') ? 'grok'
                            : providerName.includes('groq') ? 'groq'
                                : null;

            for (const fb of fallbackProviders) {
                if (fb.type === activeType) continue; // Skip the type that already failed

                try {
                    const keys = await aiProvidersService.getProvidersByType(fb.type);
                    if (!keys || keys.length === 0) continue;

                    console.log(`🔄 [AI] Fallback: trying ${fb.type.toUpperCase()} (${keys.length} key(s) available)`);

                    const result = await apiKeyRotation.callWithRotation(
                        fb.type,
                        fb.callFn,
                        systemPrompt,
                        prompt,
                        keys[0] // Start with the first key of this type
                    );

                    console.log(`✅ [AI] Fallback succeeded with ${fb.type.toUpperCase()}`);

                    // Auto-activate the working provider so future requests go directly to it
                    const workingKey = keys[0];
                    const activated = await aiProvidersService.activateByDecryptedKey(workingKey);
                    if (activated) {
                        console.log(`🔄 [AI] Auto-switched active provider to "${activated.name}" (${activated.apiKey})`);
                        // Emit Socket.io event so the frontend widget updates in real-time
                        apiKeyRotation._emitRotationEvent('provider-switched', {
                            providerType: fb.type,
                            status: 'rotated',
                            activeKeyMask: activated.apiKey,
                            newProvider: activated.name,
                            previousProvider: name,
                            attempt: 1,
                            totalKeys: keys.length
                        });
                    }

                    return result;
                } catch (fallbackErr) {
                    console.warn(`⚠️ [AI] Fallback with ${fb.type.toUpperCase()} also failed: ${fallbackErr.message}`);
                    continue;
                }
            }

            // All providers exhausted — return internal marker for app.js to handle
            console.error('❌ [AI] All providers exhausted. No AI response possible.');
            return '__ALL_PROVIDERS_EXHAUSTED__';
        }
    }

    /**
     * Build a RAG-augmented prompt that constrains the AI to use only the knowledge base.
     */
    buildRAGPrompt(context, userMessage) {
        // Limit context to 1500 chars to avoid excessively long prompts
        const trimmedContext = context.length > 1500 ? context.substring(0, 1500) + '...' : context;
        return `Eres un asistente de atención al cliente. Responde de manera breve, clara y directa (máximo 2-3 oraciones).
Usa SOLO la información del contexto proporcionado.
Si no encuentras la respuesta, responde: "No tengo información suficiente en la base de conocimiento."

Contexto:
${trimmedContext}

Pregunta del cliente:
${userMessage}`;
    }

    async callOpenAI(apiKey, systemPrompt, userPrompt, history = []) {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            max_tokens: 300,
            messages: [
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: userPrompt }
            ]
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        // Track token usage without blocking the response
        const usage = response.data.usage;
        if (usage) tokenUsageService.trackUsage(usage.total_tokens || 0);
        return response.data.choices[0].message.content;
    }

    async callGrok(apiKey, systemPrompt, userPrompt, history = []) {
        const response = await axios.post('https://api.x.ai/v1/chat/completions', {
            model: 'grok-beta',
            max_tokens: 300,
            messages: [
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: userPrompt }
            ]
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        // Track token usage without blocking the response
        const usage = response.data.usage;
        if (usage) tokenUsageService.trackUsage(usage.total_tokens || 0);
        return response.data.choices[0].message.content;
    }

    async callGroq(apiKey, systemPrompt, userPrompt, history = []) {
        // Groq (groq.com) uses OpenAI-compatible API format
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            max_tokens: 300,
            messages: [
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: userPrompt }
            ]
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        // Track token usage without blocking the response
        const usage = response.data.usage;
        if (usage) tokenUsageService.trackUsage(usage.total_tokens || 0);
        return response.data.choices[0].message.content;
    }

    async callGemini(apiKey, systemPrompt, userPrompt, history = []) {
        // Google Gemini API (generativelanguage.googleapis.com)
        try {
            // Convert chat history to Gemini format (role: 'user' | 'model')
            const geminiHistory = history.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                {
                    system_instruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    contents: [
                        ...geminiHistory,
                        { role: 'user', parts: [{ text: userPrompt }] }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 300
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            // Track token usage (Gemini reports in usageMetadata)
            const usage = response.data.usageMetadata;
            if (usage) tokenUsageService.trackUsage((usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0));
            return response.data.candidates[0].content.parts[0].text;
        } catch (error) {
            // Log detailed error from Google API
            const errData = error.response?.data?.error;
            if (errData) {
                console.error(`❌ Gemini API error [${errData.code}]: ${errData.message}`);
                console.error(`   Status: ${errData.status || 'unknown'}`);
            }
            throw error;
        }
    }

    async callZIA(apiKey, prompt) {
        // Robust extraction using simple indices instead of regex
        let context = '';
        let userQuestion = '';

        const contextIndex = prompt.lastIndexOf('Contexto:');
        const questionIndex = prompt.lastIndexOf('Pregunta del cliente:');

        if (contextIndex !== -1 && questionIndex !== -1) {
            context = prompt.substring(contextIndex + 9, questionIndex).trim();
            userQuestion = prompt.substring(questionIndex + 21).trim();
        } else {
            userQuestion = prompt;
        }

        if (!context) {
            console.log('⚠️ Z.ia: No se pudo extraer el contexto del prompt');
            return 'No tengo información suficiente en la base de conocimiento.';
        }

        // Split context into Q&A pairs using "¿" as delimiter
        const qaPairs = context.split(/(?=¿)/).filter(q => q.trim().length > 15);

        if (qaPairs.length === 0) {
            return 'No tengo información suficiente en la base de conocimiento.';
        }

        // Score each Q&A pair by fuzzy keyword overlap
        const queryWords = userQuestion.toLowerCase()
            .replace(/[¿?.,!]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 3);

        let bestPair = null;
        let bestScore = 0;

        for (const pair of qaPairs) {
            const pairLower = pair.toLowerCase();
            let score = 0;
            for (const word of queryWords) {
                // Exact word match
                if (pairLower.includes(word)) {
                    score += 3;
                }
                // Fuzzy match for prefixes (e.g. "aprend" matches "aprender" and "aprenderé")
                else if (word.length >= 5 && pairLower.includes(word.substring(0, 5))) {
                    score += 1;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestPair = pair.trim();
            }
        }

        if (!bestPair || bestScore < 1) {
            return 'No tengo información suficiente en la base de conocimiento para responder esa pregunta.';
        }

        // Extrae la respuesta (lo que viene después del signo de interrogación)
        const answerParts = bestPair.split('?');
        let finalResponse = '';

        if (answerParts.length > 1) {
            finalResponse = answerParts.slice(1).join('?').trim();
        } else {
            finalResponse = bestPair;
        }

        // Garantizar que sea concisa (max ~3 líneas / 250 chars)
        if (finalResponse.length > 250) {
            return finalResponse.substring(0, 247).trim() + '...';
        }
        return finalResponse;
    }

    /**
     * Analyzes an incoming message and conversation history to extract structured lead information.
     * @param {string} userMessage
     * @param {string|null} jid
     * @returns {Promise<Object|null>}
     */
    async analyzeLead(userMessage, jid = null) {
        const activeProvider = await aiProvidersService.getActiveProvider();
        if (!activeProvider) {
            console.warn('⚠️ No active AI provider for lead analysis.');
            return null;
        }

        const systemPrompt = `Eres un extractor de información de leads comerciales altamente preciso para una empresa de repuestos industriales y mineros (Cribado, Fundición, Transporte, Rodamientos y Consumibles).
Analizas el mensaje actual del cliente y el historial de conversación para extraer información clave.

CATÁLOGO DE PRODUCTOS DE LA EMPRESA:
- CRIBADO: Mallas Anticolmatantes, Láminas Perforadas, Mallas Trenzadas, Pisamallas, Mordazas
- FUNDICIÓN: Conos para Trituradoras, Revestimientos para Chancadoras, Placas de Desgaste, Martillos y Piezas de Desgaste, Barras de Impacto, Barras de Desgaste, Cajas y Carcasas
- TRANSPORTE: Estaciones, Alineación, Vulcanizado en campo, Bandas Transportadoras
- RODAMIENTOS Y CONSUMIBLES: Lubricantes Industriales (Royal), Rodamientos Esféricos, Rodamientos de Rodillos (SXM), Compuestos Industriales (Loctite), Cadenas y Engranes

Tu objetivo es responder ÚNICAMENTE con un objeto JSON válido (sin markdown, sin bloques de código, solo el texto JSON) con las siguientes propiedades:
- "interestProduct": string o null (Debe ser el producto o categoría del catálogo anterior que más se relacione con lo mencionado por el cliente, ej: "Bandas Transportadoras", "Mallas Anticolmatantes", etc. Si no se menciona ningún producto del catálogo ni palabras relacionadas, usa null).
- "industry": string o null (Minería, alimentos, cementera, siderúrgica, industria general, etc.)
- "quantity": string o null (Cantidad solicitada por el cliente, ej: "5 unidades", "10 metros", etc.)
- "dimensions": string o null (Medidas o especificaciones del repuesto, ej: "4x4", "3/4 pulgadas", etc.)
- "location": string o null (Ubicación, ciudad, departamento o país)
- "company": string o null (Nombre de la empresa del cliente)
- "urgency": "bajo" | "medio" | "alto"
- "commercialIntents": array de strings. Los posibles valores son:
  - "precio" (si pregunta precio, costo, cuánto vale, etc.)
  - "cotizacion" (si pide cotizar, cotización, proforma, etc.)
  - "interes_compra" (si muestra interés claro en adquirirlo)
  - "tecnico" (si tiene consultas técnicas o especificaciones)
  - "contacto_humano" (si solicita hablar con un asesor, vendedor, humano o agente)
  - "urgente" (si muestra urgencia o tiempo de entrega inmediato)
- "score": "frio" | "tibio" | "caliente" (Regla estricta: si el array "commercialIntents" contiene "precio", "cotizacion", "contacto_humano", "urgente" o pregunta por disponibilidad, tiempo de entrega o formas de pago, el score DEBE ser "caliente". Si muestra interés o pide información general de productos, es "tibio". De lo contrario, "frio").
- "priority": boolean (true si el score es "caliente" o si "commercialIntents" contiene "contacto_humano", de lo contrario false).
- "humanEscalation": boolean (true si se requiere transferir a un humano de inmediato, es decir, si el score es "caliente" o solicita contacto humano).

Asegúrate de que la salida sea estrictamente un JSON válido, sin comentarios, sin formato markdown, sin envolver en \`\`\`json ... \`\`\`. Solo el texto plano del objeto JSON.`;

        let conversationHistory = [];
        if (jid) {
            try {
                const conversation = await chatHistoryService.getMessages(jid);
                if (conversation.messages && conversation.messages.length > 0) {
                    const recentMessages = conversation.messages.slice(-11, -1);
                    conversationHistory = recentMessages.map(m => ({
                        role: m.fromMe ? 'assistant' : 'user',
                        content: m.text || '[media]'
                    }));
                }
            } catch (histErr) {
                console.warn('⚠️ Could not load history for lead analysis:', histErr.message);
            }
        }

        const { name, apiKey } = activeProvider;
        const providerName = name.toLowerCase();

        try {
            const isGroq = apiKey.startsWith('gsk_') || (providerName.includes('groq') || providerName.includes('grog'));
            const isOpenAI = !isGroq && (apiKey.startsWith('sk-') || providerName.includes('openai'));
            const isGemini = !isGroq && !isOpenAI && (apiKey.startsWith('AIza') || providerName.includes('gemini'));
            const isGrok = !isGroq && !isOpenAI && !isGemini && providerName.includes('grok');

            let resultRaw = '';

            if (isGroq) {
                resultRaw = await apiKeyRotation.callWithRotation(
                    'groq',
                    (key, sys, usr) => this.callGroq(key, sys, usr, conversationHistory),
                    systemPrompt,
                    userMessage,
                    apiKey
                );
            } else if (isOpenAI) {
                resultRaw = await apiKeyRotation.callWithRotation(
                    'openai',
                    (key, sys, usr) => this.callOpenAI(key, sys, usr, conversationHistory),
                    systemPrompt,
                    userMessage,
                    apiKey
                );
            } else if (isGrok) {
                resultRaw = await apiKeyRotation.callWithRotation(
                    'grok',
                    (key, sys, usr) => this.callGrok(key, sys, usr, conversationHistory),
                    systemPrompt,
                    userMessage,
                    apiKey
                );
            } else if (isGemini) {
                resultRaw = await apiKeyRotation.callWithRotation(
                    'gemini',
                    (key, sys, usr) => this.callGemini(key, sys, usr, conversationHistory),
                    systemPrompt,
                    userMessage,
                    apiKey
                );
            } else {
                return null;
            }

            let cleaned = resultRaw.trim();
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            }

            const parsed = JSON.parse(cleaned);
            return parsed;
        } catch (err) {
            console.error('❌ Error analyzing lead with active AI provider:', err.message);
            return null;
        }
    }
}

module.exports = new AIResponseService();
