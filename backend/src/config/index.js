require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  whatsapp: {
    sessionPath: process.env.SESSION_NAME || 'wifi-session',
    browser: [
      'Windows',
      process.env.BROWSER_NAME || 'ChatWiFi',
      '1.0.0'
    ]
  },
  logs: {
    level: process.env.LOG_LEVEL || 'info'
  }
};
