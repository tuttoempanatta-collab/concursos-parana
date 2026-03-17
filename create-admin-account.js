const admin = require('firebase-admin');

// Si tienes el archivo serviceAccountKey.json, pon la ruta aquí.
// Si no, usaremos la variable de entorno que ya configuramos antes.

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'concursos-entre-rios'
    });
} else {
    // Intenta usar credenciales locales por defecto de Firebase
    admin.initializeApp({
        projectId: 'concursos-entre-rios'
    });
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.log('Uso: node create-admin-account.js <email> <password>');
    process.exit(1);
}

const createAdmin = async () => {
    try {
        const user = await admin.auth().createUser({
            email: email,
            password: password,
            emailVerified: true
        });
        console.log('¡ÉXITO! Usuario admin creado:', user.uid);
    } catch (error) {
        if (error.code === 'auth/email-already-exists') {
            console.log('El usuario ya existe. Intentando actualizar contraseña...');
            const user = await admin.auth().getUserByEmail(email);
            await admin.auth().updateUser(user.uid, { password: password });
            console.log('Contraseña actualizada correctamente.');
        } else {
            console.error('Error creando usuario:', error.message);
        }
    }
};

createAdmin();
