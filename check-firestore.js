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

const db = admin.firestore();

async function check() {
    try {
        const snapshot = await db.collection('concursos').get();
        console.log(`Total documents in 'concursos' collection: ${snapshot.size}`);
        
        const statusSnap = await db.collection('system').doc('robot_status').get();
        if (statusSnap.exists()) {
            console.log('\n--- Robot Status ---');
            console.log(JSON.stringify(statusSnap.data(), null, 2));
        } else {
            console.log('\n--- Robot Status document NOT FOUND ---');
        }
    } catch (e) {
        console.error('Error checking Firestore:', e.message);
    }
}

check();
