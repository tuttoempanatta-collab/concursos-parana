const admin = require('firebase-admin');

// Initialize Firebase Admin Using Env Variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: 'concursos-entre-rios'
});
const db = admin.firestore();

async function fixTimes() {
    console.log("Starting Time Fixer...");
    const snapshot = await db.collection('concursos').get();
    let fixed = 0;
    const batch = db.batch();
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.date && (data.date.includes('T23:59') || data.date.includes('T02:59'))) {
             // Extract time from fullContent
             if (data.fullContent) {
                 const tmRegex = /(?:a las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)\b/i;
                 const match = data.fullContent.match(tmRegex);
                 if (match) {
                     const hStr = match[1];
                     if (hStr !== '24' && hStr !== '48' && hStr !== '72') {
                         const h = parseInt(hStr, 10);
                         const m = match[2] ? parseInt(match[2], 10) : 0;
                         
                         const d = new Date(data.date);
                         d.setUTCHours(h + 3, m, 0, 0); // Convert Argentina time to UTC properly
                         
                         batch.update(doc.ref, { date: d.toISOString() });
                         fixed++;
                         console.log(`Document ${doc.id} time corrected to ${h}:${m}`);
                     }
                 }
             }
        }
    }
    
    if (fixed > 0) {
        await batch.commit();
        console.log(`Committed ${fixed} time corrections.`);
    } else {
        console.log("No times needed fixing.");
    }
}

fixTimes().catch(console.error);
