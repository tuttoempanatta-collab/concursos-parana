const admin = require('firebase-admin');

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'concursos-entre-rios'
    });
} else {
    admin.initializeApp({
        projectId: 'concursos-entre-rios'
    });
}

async function listUsers() {
    try {
        const listUsersResult = await admin.auth().listUsers(10);
        listUsersResult.users.forEach((userRecord) => {
            console.log('User:', userRecord.toJSON().email);
        });
    } catch (error) {
        console.log('Error listing users:', error);
    }
}

listUsers();
