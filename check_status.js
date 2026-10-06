const admin = require('firebase-admin');
if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'concursos-entre-rios' });
}
const db = admin.firestore();

async function check() {
    try {
        const doc = await db.collection('system').doc('robot_status').get();
        if (doc.exists) {
            console.log('--- HEARTBEAT DATA ---');
            console.log(JSON.stringify(doc.data(), null, 2));
            console.log('----------------------');
        } else {
            console.log('Document system/robot_status NOT FOUND');
        }
    } catch (e) {
        console.error('Error reading Firestore:', e.message);
    }
}
check();
