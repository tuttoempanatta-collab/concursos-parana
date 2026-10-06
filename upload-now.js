const { initializeApp } = require("firebase/app");
const { getFirestore, collection, doc, setDoc } = require("firebase/firestore");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const fs = require('fs');

const firebaseConfig = {
  apiKey: "AIzaSyB5urg3Z7uDOmyHvCyRdL9ZZcwRayoldaI",
  authDomain: "concursos-entre-rios.firebaseapp.com",
  projectId: "concursos-entre-rios",
  storageBucket: "concursos-entre-rios.firebasestorage.app",
  messagingSenderId: "183882688670",
  appId: "1:183882688670:web:2fb736f63582296fffb38f",
  measurementId: "G-6BREN3H35G"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function sync() {
    const email = "tuttoempanatta@gmail.com";
    const password = process.argv[2]; // Pasalo como argumento: node upload-now.js TU_CONTRASEÑA

    if (!password) {
        console.error("ERROR: Debes pasar la contraseña como argumento: node upload-now.js TU_CONTRASEÑA");
        process.exit(1);
    }

    try {
        console.log(`[1/3] Autenticando como ${email}...`);
        await signInWithEmailAndPassword(auth, email, password);
        console.log("¡Autenticación exitosa!");

        console.log(`[2/3] Leyendo parsed_data.json...`);
        const rawData = fs.readFileSync('./public/parsed_data.json', 'utf8');
        const data = JSON.parse(rawData);
        console.log(`Encontrados ${data.length} concursos.`);

        console.log(`[3/3] Subiendo a Firestore (uno por uno)...`);
        let success = 0;
        let errors = 0;

        for (let i = 0; i < data.length; i++) {
            const concurso = data[i];
            try {
                const cleanLink = (concurso.link || "").replace(/\/$/, "");
                const docId = cleanLink.split('/').pop().replace(/[^a-zA-Z0-9]/g, '_') || `c_${Math.random().toString(36).substr(2, 5)}`;
                
                const { isFromJSON, ...cleanConcurso } = concurso;
                
                await setDoc(doc(db, 'concursos', docId), {
                    ...cleanConcurso,
                    isManual: false,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                success++;
                if (success % 10 === 0) console.log(`Cargados ${success}/${data.length}...`);
            } catch (err) {
                console.error(`Error en ${concurso.title}:`, err.message);
                errors++;
            }
        }

        console.log(`\n¡FINALIZADO!`);
        console.log(`Éxito: ${success}`);
        console.log(`Errores: ${errors}`);
        process.exit(0);

    } catch (err) {
        console.error("ERROR GLOBAL:", err.message);
        process.exit(1);
    }
}

sync();
