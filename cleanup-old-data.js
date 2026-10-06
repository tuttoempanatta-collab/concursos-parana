const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'concursos-entre-rios'
    });
}
const db = admin.firestore();

async function cleanup() {
    console.log('--- LIMPIEZA DE CONCURSOS ANTIGUOS (>14 DÍAS / 2 SEMANAS) ---');
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - 14);
    
    // Convert to ISO string for comparison (assuming storage is ISO string)
    const cutoffString = cutoffDate.toISOString();
    console.log(`Buscando concursos anteriores a: ${cutoffString}`);

    const concursosRef = db.collection('concursos');
    const snapshot = await concursosRef.get();
    
    let deletedCount = 0;
    let manualCount = 0;
    let keptCount = 0;

    let batch = db.batch();
    let currentBatchCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const docDateStr = data.date;
        const isManual = data.isManual === true;

        if (isManual) manualCount++;

        // Keep if: Recent (within 30 days)
        // Delete if: Old OR 2025 OR No Date
        let shouldDelete = false;

        if (!docDateStr) {
            shouldDelete = true;
        } else {
            const docDate = new Date(docDateStr);
            if (docDate < cutoffDate || docDateStr.includes('-2025-')) {
                shouldDelete = true;
            }
        }

        if (shouldDelete) {
            console.log(`[DELETE] Eliminando: ${doc.id} (${(data.title || '').substring(0, 30)}...)`);
            batch.delete(doc.ref);
            deletedCount++;
            currentBatchCount++;

            if (currentBatchCount >= 400) {
                await batch.commit();
                batch = db.batch();
                currentBatchCount = 0;
            }
        } else {
            keptCount++;
        }
    }

    if (currentBatchCount > 0) {
        await batch.commit();
    }

    console.log('\n--- RESUMEN DE LIMPIEZA ---');
    console.log(`Eliminados: ${deletedCount}`);
    console.log(`Conservados (Recientes): ${keptCount}`);
    console.log(`Conservados (Manuales): ${manualCount}`);
}

cleanup();
