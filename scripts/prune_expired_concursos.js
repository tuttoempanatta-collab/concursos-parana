const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

async function getAccessToken() {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('No se encontró firebase-tools.json');
    }
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    let token = cfg.tokens?.access_token;
    const expiresAt = cfg.tokens?.expires_at;

    // Refresh if needed
    if (!token || (expiresAt && Date.now() > expiresAt - 60000)) {
        console.log('[AUTH] Refrescando access token de Firebase...');
        const refreshToken = cfg.tokens?.refresh_token;
        const postData = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho859e1.apps.googleusercontent.com',
            refresh_token: refreshToken
        }).toString();

        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: postData
        });
        const tokenData = await res.json();
        if (tokenData.access_token) {
            token = tokenData.access_token;
            cfg.tokens.access_token = token;
            cfg.tokens.expires_at = Date.now() + (tokenData.expires_in * 1000);
            fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
            console.log('[AUTH] Token refrescado correctamente.');
        } else {
            throw new Error('No se pudo refrescar el token: ' + JSON.stringify(tokenData));
        }
    }
    return token;
}

async function listAllFirestoreDocuments(token) {
    const documents = [];
    let pageToken = '';
    const baseUrl = 'https://firestore.googleapis.com/v1/projects/concursos-entre-rios/databases/(default)/documents/concursos';

    do {
        const url = `${baseUrl}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            throw new Error(`Error listando documentos: ${res.status} ${await res.text()}`);
        }
        const data = await res.json();
        if (data.documents) {
            documents.push(...data.documents);
        }
        pageToken = data.nextPageToken;
    } while (pageToken);

    return documents;
}

function parseFirestoreValue(val) {
    if (!val) return null;
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.timestampValue !== undefined) return val.timestampValue;
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
    if (val.doubleValue !== undefined) return parseFloat(val.doubleValue);
    if (val.arrayValue !== undefined) {
        return (val.arrayValue.values || []).map(parseFirestoreValue);
    }
    if (val.mapValue !== undefined) {
        const res = {};
        for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
            res[k] = parseFirestoreValue(v);
        }
        return res;
    }
    return null;
}

function getDocFields(doc) {
    const fields = {};
    for (const [k, v] of Object.entries(doc.fields || {})) {
        fields[k] = parseFirestoreValue(v);
    }
    return fields;
}

async function batchDeleteDocs(token, docNames) {
    const chunkSize = 200;
    for (let i = 0; i < docNames.length; i += chunkSize) {
        const chunk = docNames.slice(i, i + chunkSize);
        const writes = chunk.map(name => ({ delete: name }));

        const res = await fetch('https://firestore.googleapis.com/v1/projects/concursos-entre-rios/databases/(default)/documents:commit', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ writes })
        });

        if (!res.ok) {
            throw new Error(`Error en batch delete: ${res.status} ${await res.text()}`);
        }
        console.log(`[PURGE] Eliminados ${Math.min(i + chunkSize, docNames.length)} / ${docNames.length} documentos obsoletos...`);
    }
}

async function run() {
    const token = await getAccessToken();
    console.log('[FIRESTORE] Listando todos los documentos de la colección "concursos"...');
    const docs = await listAllFirestoreDocuments(token);
    console.log(`[FIRESTORE] Total documentos encontrados: ${docs.length}`);

    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - 14); // 2 semanas (14 días)
    console.log(`[RETENCIÓN] Fecha actual: ${now.toISOString()}`);
    console.log(`[RETENCIÓN] Fecha de corte (hace 14 días): ${cutoffDate.toISOString()}`);

    const toDelete = [];
    const toKeep = [];

    for (const doc of docs) {
        const fields = getDocFields(doc);
        let refDate = null;

        if (fields.date) {
            refDate = new Date(fields.date);
        } else if (fields.pubDate) {
            refDate = new Date(fields.pubDate);
        } else if (fields.detectedAt) {
            refDate = new Date(fields.detectedAt);
        }

        let isExpired = false;
        if (refDate && !isNaN(refDate.getTime())) {
            isExpired = refDate < cutoffDate;
        } else {
            // Text check for past months
            const text = `${fields.title || ''} ${(fields.fullContent || '').slice(0, 300)}`.toLowerCase();
            const pastMonth = text.match(/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto)\b/);
            if (pastMonth && !text.includes('septiembre') && !text.includes('octubre') && !text.includes('noviembre') && !text.includes('diciembre')) {
                isExpired = true;
            }
        }

        if (isExpired) {
            toDelete.push({ name: doc.name, title: fields.title, date: fields.date, pubDate: fields.pubDate });
        } else {
            toKeep.push({ name: doc.name, title: fields.title, date: fields.date, pubDate: fields.pubDate });
        }
    }

    console.log(`\n[ANALISIS] Documentos vigentes (<= 14 días o futuros): ${toKeep.length}`);
    console.log(`[ANALISIS] Documentos obsoletos para purgar (> 14 días): ${toDelete.length}`);

    if (toDelete.length > 0) {
        console.log(`\nIniciando purga de ${toDelete.length} documentos obsoletos en Firestore...`);
        const docNames = toDelete.map(d => d.name);
        await batchDeleteDocs(token, docNames);
        console.log(`\n✅ ¡Purga completada exitosamente! ${toDelete.length} documentos viejos eliminados.`);
        console.log(`Restan en Firestore: ${toKeep.length} concursos activos y vigentes.`);
    } else {
        console.log('No se encontraron documentos obsoletos para eliminar.');
    }
}

run().catch(err => {
    console.error('Error durante la purga:', err);
    process.exit(1);
});
