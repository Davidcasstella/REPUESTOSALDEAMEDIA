const whatsapp = require('./src/core/WhatsApp');
async function test() {
    try {
        console.log('WhatsApp status:', whatsapp.getStatus());
    } catch (err) {
        console.error(err);
    }
}
test();
