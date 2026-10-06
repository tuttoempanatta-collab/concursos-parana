const admin = require('firebase-admin');
const fs = require('fs');

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("FIREBASE_SERVICE_ACCOUNT is required");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function initConfig() {
    console.log("Initializing config documents...");
    
    await db.collection('config').doc('storefront_settings').set({
        donate_alias: 'fcolombo61.ppay',
        donate_cbu: '0000076500000038535516',
        donate_text: '¡Hola, colega! 👋 👩‍🏫👨‍🏫 \n\nEste espacio fue creado con mucha dedicación para que todos tengamos las mismas oportunidades de encontrar nuestro lugar en el aula. 🏫✨\n\nSi esta web te ayudó a conseguir ese cargo o suplencia que buscabas, o simplemente te facilita el día a día, te invito a colaborar con lo que puedas para mantener los servidores y seguir mejorando el servicio. \n\n¡Mucha suerte en tu próximo concurso! 💪📖',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await db.collection('config').doc('bot_settings').set({
        repo_owner: 'tuttoempanatta-collab',
        repo_name: 'concursos-parana',
        workflow_id: 'scrape_and_deploy.yml',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log("Done!");
    process.exit(0);
}

initConfig().catch(console.error);
