const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay
} = require('@whiskeysockets/baileys');
const { EventEmitter } = require('events');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs-extra');
const config = require('../config');

class WhatsApp extends EventEmitter {
    constructor() {
        super();
        this.sock = null;
        this.state = null;
        this.saveCreds = null;
        this.status = 'disconnected'; // disconnected, connecting, waiting_qr, connected
        this.qr = null;
        this.pairingCode = null; // Storing the active pairing code
        this.logger = pino({ level: config.logs.level });
        this.isRestarting = false;
        this.sessionPath = path.join(process.cwd(), 'session', config.whatsapp.sessionPath);
    }

    async init() {
        if (this.sock) {
            this.logger.warn('WhatsApp instance already exists. Use restart() instead.');
            return;
        }

        this.updateStatus('connecting');
        this.logger.info('Inicializando motor de WhatsApp...');

        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
            this.state = state;
            this.saveCreds = saveCreds;

            const { version } = await fetchLatestBaileysVersion();

            this.sock = makeWASocket({
                version,
                auth: this.state,
                printQRInTerminal: true,
                browser: config.whatsapp.browser,
                logger: this.logger.child({ module: 'baileys' }),
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0,
                syncFullHistory: false
            });

            this.registerEvents();
        } catch (error) {
            this.logger.error({ error }, 'Error initializing WhatsApp');
            this.updateStatus('disconnected');
            throw error;
        }
    }

    registerEvents() {
        if (!this.sock) return;

        this.sock.ev.on('creds.update', this.saveCreds);

        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    // Only generate QR if we do not have an active pairing code request
                    if (!this.pairingCode) {
                        this.qr = await QRCode.toDataURL(qr);
                        this.updateStatus('waiting_qr');
                    }
                } catch (err) {
                    this.logger.error({ err }, 'Error converting QR to data URL');
                    this.qr = null;
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                this.logger.warn(`Conexión cerrada. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);
                this.qr = null;
                this.pairingCode = null;
                this.updateStatus('disconnected');

                if (shouldReconnect && !this.isRestarting) {
                    this.logger.info('Intentando reconexión automática...');
                    await delay(3000);
                    this.restart();
                } else if (statusCode === DisconnectReason.loggedOut) {
                    this.logger.error('Sesión cerrada por el usuario o servidor. Limpiando credenciales...');
                    await this.clearSession();
                }
            } else if (connection === 'open') {
                this.updateStatus('connected');
                this.qr = null;
                this.pairingCode = null;
                this.logger.info('WhatsApp conectado correctamente');
            }
        });

        this.sock.ev.on('messages.upsert', (m) => {
            if (m.type === 'notify') {
                this.emit('message', m);
            }
        });
    }

    updateStatus(newStatus) {
        this.status = newStatus;
        this.emit('status-update', this.getStatus());
    }

    getStatus() {
        return {
            status: this.status,
            qr: this.qr,
            pairingCode: this.pairingCode,
            user: this.sock?.user
        };
    }

    async requestPairingCode(phoneNumber) {
        if (!this.sock) {
            throw new Error('WhatsApp engine is not initialized');
        }
        if (this.sock.authState.creds.registered) {
            throw new Error('WhatsApp is already linked');
        }

        try {
            // Normalize phone number (digits only)
            const cleanNumber = phoneNumber.replace(/\D/g, '');
            this.logger.info(`Requesting pairing code for: ${cleanNumber}`);

            const code = await this.sock.requestPairingCode(cleanNumber);

            // Format code with hyphen (XXXX-XXXX)
            let formattedCode = code;
            if (code && code.length === 8 && !code.includes('-')) {
                formattedCode = `${code.substring(0, 4)}-${code.substring(4)}`;
            }

            this.pairingCode = formattedCode;
            this.qr = null; // Disable QR code since pairing code is active
            this.updateStatus('waiting_qr');
            return formattedCode;
        } catch (error) {
            this.logger.error({ error }, 'Failed to request pairing code');
            throw error;
        }
    }

    async restart() {
        if (this.isRestarting) return;
        this.isRestarting = true;

        this.logger.info('Reiniciando conexión...');
        try {
            await this.destroy();
            await delay(1000);
            await this.init();
        } finally {
            this.isRestarting = false;
        }
    }

    async clearSession() {
        this.logger.info('Limpiando sesión y reiniciando...');
        try {
            await this.destroy();
            if (fs.existsSync(this.sessionPath)) {
                await fs.remove(this.sessionPath);
                this.logger.info('Carpeta de sesión eliminada');
            }
            await delay(1000);
            await this.init();
        } catch (error) {
            this.logger.error({ error }, 'Error clearing session');
            await this.init(); // Intentar re-init de todos modos
        }
    }

    async destroy() {
        this.logger.info('Destruyendo instancia actual de WhatsApp...');
        if (this.sock) {
            this.sock.ev.removeAllListeners();
            try {
                this.sock.end();
            } catch (e) { }
            this.sock = null;
        }
        this.qr = null;
        this.pairingCode = null;
        this.updateStatus('disconnected');
    }
}

module.exports = new WhatsApp();
