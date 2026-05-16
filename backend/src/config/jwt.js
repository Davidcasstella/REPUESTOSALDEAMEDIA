module.exports = {
    secret: process.env.JWT_SECRET || 'super_secret_key_change_me',
    expiresIn: '2h'
};
