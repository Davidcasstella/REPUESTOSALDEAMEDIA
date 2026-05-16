const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const jwtConfig = require('../config/jwt');

// In-memory user database (temporary)
const salt = bcrypt.genSaltSync(10);
const hashedPassword = bcrypt.hashSync('password123', salt);
const users = [
    {
        id: 1,
        email: 'admin@wifi.com',
        password: hashedPassword
    }
];
console.log('👤 Usuario de prueba listo: admin@wifi.com / password123');

const register = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email y password son requeridos' });
        }

        const userExists = users.find(u => u.email === email);
        if (userExists) {
            return res.status(400).json({ success: false, message: 'El usuario ya existe' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
            id: users.length + 1,
            email,
            password: hashedPassword
        };

        users.push(newUser);

        res.status(201).json({
            success: true,
            message: 'Usuario registrado con éxito',
            user: { id: newUser.id, email: newUser.email }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error en el servidor', error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`\n🔐 Intento de login: ${email}`);

        const user = users.find(u => u.email === email);
        if (!user) {
            console.log('❌ Usuario no encontrado en la base de datos (memoria)');
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('❌ Contraseña incorrecta');
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        console.log('✅ Login exitoso');

        const token = jwt.sign(
            { id: user.id, email: user.email },
            jwtConfig.secret,
            { expiresIn: jwtConfig.expiresIn }
        );

        res.json({
            success: true,
            message: 'Login exitoso',
            token,
            user: { id: user.id, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error en el servidor', error: error.message });
    }
};

module.exports = {
    register,
    login
};
