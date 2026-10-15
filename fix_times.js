const admin = require('firebase-admin');
const { extractEventDate } = require('./parse.js');

// Initialize Firebase Admin Using Env Variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'concursos-entre-rios'
});
const db = admin.firestore();

async function fixTimes() {
    console.log("Starting Time, Missing Date and Title Fixer...");
    const snapshot = await db.collection('concursos').get();
    let fixed = 0;
    let batch = db.batch();
    let batchCount = 0;
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        let needsUpdate = false;
        const updates = {};

        // 1. Fix default midnight / 23:59 times
        if (data.date && (data.date.includes('T23:59') || data.date.includes('T02:59'))) {
             if (data.fullContent) {
                 const tmRegex = /(?:a las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)\b/i;
                 const match = data.fullContent.match(tmRegex);
                 if (match) {
                     const hStr = match[1];
                     if (hStr !== '24' && hStr !== '48' && hStr !== '72') {
                         const h = parseInt(hStr, 10);
                         const m = match[2] ? parseInt(match[2], 10) : 0;
                         const d = new Date(data.date);
                         d.setUTCHours(h + 3, m, 0, 0);
                         updates.date = d.toISOString();
                         needsUpdate = true;
                     }
                 }
             }
        }

        // 2. Fix missing dates using improved date heuristics
        if (!data.date && data.fullContent) {
            const detected = extractEventDate(data.fullContent, data.pubDate || '', 2026);
            if (detected) {
                updates.date = detected.toISOString();
                needsUpdate = true;
                console.log(`[DATE FIXED] ${doc.id} -> ${updates.date}`);
            }
        }

        // 3. Clean polluted distinctSubject and title
        if (data.distinctSubject && /^(?:para\s+el|el\s+d[íi]a|seg[uú]n)/i.test(data.distinctSubject)) {
            updates.distinctSubject = null;
            if (data.title && data.title.includes(`(${data.distinctSubject})`)) {
                updates.title = data.title.replace(`(${data.distinctSubject})`, '').trim();
            }
            needsUpdate = true;
            console.log(`[TITLE/SUBJECT CLEANED] ${doc.id}`);
        }

        // 4. Clean polluted primaryLlamado
        if (data.primaryLlamado && data.primaryLlamado.includes('(para el día')) {
            updates.primaryLlamado = data.primaryLlamado.replace(/\s*\(para\s+el\s+d[íi]a[^\)]*\)/i, '').trim();
            needsUpdate = true;
            console.log(`[LLAMADO CLEANED] ${doc.id} -> ${updates.primaryLlamado}`);
        }

        if (needsUpdate) {
            batch.update(doc.ref, updates);
            fixed++;
            batchCount++;
            if (batchCount >= 400) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }
    }
    
    if (batchCount > 0) {
        await batch.commit();
    }

    if (fixed > 0) {
        console.log(`Committed ${fixed} corrections to Firestore.`);
    } else {
        console.log("No items needed fixing.");
    }
}

fixTimes().catch(console.error);
